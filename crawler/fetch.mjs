// 청약홈 분양정보 조회 서비스(공공데이터포털 15098547) → schedule.json
// 사용: DATA_GO_KR_KEY=... node crawler/fetch.mjs [--out site/schedule.json]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchYouth } from './youth.mjs';
import { fetchLH } from './lh.mjs';

const BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/';
const SOURCES = [
  { kind: 'APT', detail: 'getAPTLttotPblancDetail', model: 'getAPTLttotPblancMdl' },
  { kind: 'URBTY', detail: 'getUrbtyOfctlLttotPblancDetail' }, // 오피스텔·도시형 (민간임대·생숙은 제외)
  { kind: '무순위', detail: 'getRemndrLttotPblancDetail', model: 'getRemndrLttotPblancMdl' }, // 2026-10 현재 API 전체 0건
  // 아래 둘은 공고일이 YYYYMMDD라 조건도 같은 형식으로. 공급금액이 전용면적 기준·임대보증금이라 분양가는 비운다.
  { kind: '임의공급', detail: 'getOPTLttotPblancDetail', compactDate: true },
  { kind: '공공지원 민간임대', detail: 'getPblPvtRentLttotPblancDetail', compactDate: true },
];
const REGIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const SEOUL_GU = new Set('강남구 강동구 강북구 강서구 관악구 광진구 구로구 금천구 노원구 도봉구 동대문구 동작구 마포구 서대문구 서초구 성동구 성북구 송파구 양천구 영등포구 용산구 은평구 종로구 중구 중랑구'.split(' '));
const LONG = { 충청북: '충북', 충청남: '충남', 전라북: '전북', 전라남: '전남', 경상북: '경북', 경상남: '경남' };
// [단계, 시작일 필드, 종료일 필드(있으면)] — 1·2순위는 해당지역 접수일 기준
const PHASE_FIELDS = {
  APT: [['sp', 'SPSPLY_RCEPT_BGNDE', 'SPSPLY_RCEPT_ENDDE'], ['p1', 'GNRL_RNK1_CRSPAREA_RCPTDE', 'GNRL_RNK1_CRSPAREA_ENDDE'], ['p2', 'GNRL_RNK2_CRSPAREA_RCPTDE', 'GNRL_RNK2_CRSPAREA_ENDDE'], ['win', 'PRZWNER_PRESNATN_DE'], ['con', 'CNTRCT_CNCLS_BGNDE', 'CNTRCT_CNCLS_ENDDE']],
  오피스텔: [['p1', 'SUBSCRPT_RCEPT_BGNDE', 'SUBSCRPT_RCEPT_ENDDE'], ['win', 'PRZWNER_PRESNATN_DE'], ['con', 'CNTRCT_CNCLS_BGNDE', 'CNTRCT_CNCLS_ENDDE']],
  무순위: [['p1', 'SUBSCRPT_RCEPT_BGNDE', 'SUBSCRPT_RCEPT_ENDDE'], ['win', 'PRZWNER_PRESNATN_DE']],
};
// 종료일은 시작일보다 뒤일 때만 둔다(같은 날이면 생략)
const phaseOf = (row) => ([k, f, fe]) => {
  const date = ymd(row[f]), end = fe ? ymd(row[fe]) : null;
  return end && date && end > date ? { k, date, end } : { k, date };
};
PHASE_FIELDS.도시형 = PHASE_FIELDS.임의공급 = PHASE_FIELDS['공공지원 민간임대'] = PHASE_FIELDS.오피스텔;

export function regionOf(s) {
  s = String(s || '').trim();
  const r = LONG[s.slice(0, 3)] || s.slice(0, 2);
  return REGIONS.includes(r) ? r : null;
}

export function ymd(v) {
  const s = String(v || '').trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

const num = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0;

function url(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `http://${s}`;
}

export function toItem(row, sourceKind) {
  let kind = sourceKind;
  if (kind === 'URBTY') {
    kind = { '01': '도시형', '02': '오피스텔' }[row.HOUSE_DTL_SECD];
    if (!kind) return null;
  }
  const addr = String(row.HSSPLY_ADRES || '').trim().split(/\s+/);
  const region = regionOf(row.SUBSCRPT_AREA_CODE_NM) || regionOf(addr[0]);
  // 서울은 자치구 필터가 정확히 일치로 비교하므로 25개 구 중 하나가 아니면 null
  const district = region === '서울' ? (SEOUL_GU.has(addr[1]) ? addr[1] : null) : addr[1] || '';
  return {
    id: `${row.HOUSE_MANAGE_NO}-${row.PBLANC_NO}`,
    name: String(row.HOUSE_NM || '').trim(),
    region,
    district,
    kind,
    units: num(row.TOT_SUPLY_HSHLDCO) || null,
    pricePerPyeong: null,
    address: String(row.HSSPLY_ADRES || '').trim() || null, // 공급위치(위치 지도용)
    noticeDate: ymd(row.RCRIT_PBLANC_DE),
    applyhomeUrl: url(row.PBLANC_URL),
    homepageUrl: url(row.HMPG_ADRES),
    phases: PHASE_FIELDS[kind].map(phaseOf(row)).filter((p) => p.date),
  };
}

// 주택형별 최고분양가 ÷ 공급면적 × 3.3㎡, 세대수 가중 평균 (만원)
export function pricePerPyeong(models) {
  let sum = 0, n = 0;
  for (const m of models) {
    const amt = num(m.LTTOT_TOP_AMOUNT), ar = num(m.SUPLY_AR), h = num(m.SUPLY_HSHLDCO) + num(m.SPSPLY_HSHLDCO);
    if (!(amt > 0 && ar > 0 && h > 0)) continue;
    sum += (amt / ar) * 3.305785 * h;
    n += h;
  }
  return n ? Math.round(sum / n) : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 오류 메시지에 URL을 넣지 않는다(serviceKey가 로그에 남지 않게).
async function getPage(op, params, key) {
  const u = new URL(BASE + op);
  u.searchParams.set('serviceKey', key);
  u.searchParams.set('returnType', 'JSON');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u);
  const text = await r.text();
  if (!r.ok) throw new Error(`${op} HTTP ${r.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function getAll(op, cond, key) {
  const out = [];
  for (let page = 1; ; page++) {
    const j = await getPage(op, { page, perPage: 500, ...cond }, key);
    out.push(...(j.data || []));
    if (!j.data || j.data.length < 500 || out.length >= j.matchCount) return out;
  }
}

// 조건 조회가 0건일 때: 조건 없이 전체 건수와 마지막 페이지(최근 공고 쪽) 공고일 형식을 찍는다.
async function diagnoseEmpty(op, key) {
  try {
    const { totalCount } = await getPage(op, { page: 1, perPage: 1 }, key);
    const per = 5, last = Math.max(1, Math.ceil(totalCount / per));
    const pick = (j) => (j.data || []).map((d) => JSON.stringify(d.RCRIT_PBLANC_DE)).join(', ');
    const head = await getPage(op, { page: 1, perPage: per }, key);
    const tail = await getPage(op, { page: last, perPage: per }, key);
    console.log(`  [진단] ${op}: 조건 없이 totalCount=${totalCount}, 첫 페이지 공고일 ${pick(head)} / 마지막 페이지(${last}) 공고일 ${pick(tail)}`);
  } catch (e) {
    console.log(`  [진단] ${op}: 실패 ${e.message}`);
  }
}

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

async function main() {
  let key = process.env.DATA_GO_KR_KEY || '';
  if (!key) throw new Error('DATA_GO_KR_KEY 환경변수가 없습니다.');
  if (/%[0-9a-f]{2}/i.test(key)) key = decodeURIComponent(key); // 인코딩 키를 넣은 경우
  const outArg = process.argv.indexOf('--out');
  const out = outArg > 0 ? process.argv[outArg + 1] : 'site/schedule.json';

  // 기준은 KST. 이번 달 −1개월 ~ +2개월 안에 단계가 하나라도 있는 공고만 남긴다.
  const now = new Date(Date.now() + 9 * 3600e3);
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const from = isoDate(new Date(Date.UTC(y, m - 1, 1)));
  const to = isoDate(new Date(Date.UTC(y, m + 3, 0)));
  const noticeFrom = isoDate(new Date(Date.UTC(y, m - 1, 1 - 90))); // 공고 후 계약까지 길어도 3개월 안쪽

  const items = new Map();
  for (const src of SOURCES) {
    const since = src.compactDate ? noticeFrom.replace(/-/g, '') : noticeFrom;
    const rows = await getAll(src.detail, { 'cond[RCRIT_PBLANC_DE::GTE]': since }, key);
    if (!rows.length) await diagnoseEmpty(src.detail, key);
    let kept = 0;
    for (const row of rows) {
      const it = toItem(row, src.kind);
      if (!it || !it.region || !it.phases.some((p) => p.date >= from && p.date <= to)) continue;
      // 분양전환 임대(RENT_SECD 1)는 공급금액이 분양가가 아니라 비워 둔다
      if (src.model && row.RENT_SECD !== '1') {
        try {
          const models = await getAll(src.model, { 'cond[HOUSE_MANAGE_NO::EQ]': row.HOUSE_MANAGE_NO, 'cond[PBLANC_NO::EQ]': row.PBLANC_NO }, key);
          it.pricePerPyeong = pricePerPyeong(models);
        } catch (e) {
          console.warn(`분양가 조회 실패 ${it.name}: ${e.message}`);
        }
        await sleep(100);
      }
      items.set(it.id, it);
      kept++;
    }
    console.log(`${src.detail}: ${rows.length}건 중 ${kept}건`);
  }
  // 서울시 청년안심주택(청약홈 밖의 공고). 실패해도 청약홈 일정은 그대로 배포한다
  try {
    const youth = await fetchYouth(noticeFrom);
    let kept = 0;
    for (const it of youth) if (it.phases.some((p) => p.date >= from && p.date <= to)) { items.set(it.id, it); kept++; }
    console.log(`청년안심주택: ${youth.length}건 중 ${kept}건${youth.some((i) => !i.phases.length) ? ` (일정 못 읽음 ${youth.filter((i) => !i.phases.length).length}건 — 본문 형식 확인)` : ''}`);
  } catch (e) {
    console.warn(`청년안심주택 수집 실패: ${e.message}`);
  }
  // LH 임대주택(행복주택·국민임대 등). 실패해도 나머지는 그대로 배포한다
  try {
    const lh = await fetchLH(key, noticeFrom);
    let kept = 0;
    const kinds = {};
    for (const it of lh) if (it.region && it.phases.some((p) => p.date >= from && p.date <= to)) { items.set(it.id, it); kept++; kinds[it.kind] = (kinds[it.kind] || 0) + 1; }
    console.log(`LH 임대공고: ${lh.length}건 중 ${kept}건 ${JSON.stringify(kinds)} · 공고 번호 ${new Set(lh.map((i) => i.id)).size}가지 · 첫 행 항목 ${Object.keys(lh.raw?.[0] || {}).join(',')}`);
  } catch (e) {
    console.warn(`LH 임대공고 수집 실패: ${e.message}`);
  }
  if (!items.size) throw new Error('수집 결과 0건 — 빈 달력을 배포하지 않도록 중단합니다.');

  const t = now.toISOString().slice(0, 19);
  const json = { updatedAt: `${t}+09:00`, items: [...items.values()] };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(json));
  console.log(`${out}: ${items.size}건 (${from} ~ ${to})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

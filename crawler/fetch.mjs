// 청약홈 분양정보 조회 서비스(공공데이터포털 15098547) → schedule.json
// 사용: DATA_GO_KR_KEY=... node crawler/fetch.mjs [--out site/schedule.json]
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/';
const SOURCES = [
  { kind: 'APT', detail: 'getAPTLttotPblancDetail', model: 'getAPTLttotPblancMdl' },
  { kind: 'URBTY', detail: 'getUrbtyOfctlLttotPblancDetail' }, // 오피스텔·도시형 (민간임대·생숙은 제외)
  { kind: '무순위', detail: 'getRemndrLttotPblancDetail', model: 'getRemndrLttotPblancMdl' },
];
const REGIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const LONG = { 충청북: '충북', 충청남: '충남', 전라북: '전북', 전라남: '전남', 경상북: '경북', 경상남: '경남' };
const PHASE_FIELDS = {
  APT: [['sp', 'SPSPLY_RCEPT_BGNDE'], ['p1', 'GNRL_RNK1_CRSPAREA_RCPTDE'], ['p2', 'GNRL_RNK2_CRSPAREA_RCPTDE'], ['win', 'PRZWNER_PRESNATN_DE'], ['con', 'CNTRCT_CNCLS_BGNDE']],
  오피스텔: [['p1', 'SUBSCRPT_RCEPT_BGNDE'], ['win', 'PRZWNER_PRESNATN_DE'], ['con', 'CNTRCT_CNCLS_BGNDE']],
  무순위: [['p1', 'SUBSCRPT_RCEPT_BGNDE'], ['win', 'PRZWNER_PRESNATN_DE']],
};
PHASE_FIELDS.도시형 = PHASE_FIELDS.오피스텔;

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
  return {
    id: `${row.HOUSE_MANAGE_NO}-${row.PBLANC_NO}`,
    name: String(row.HOUSE_NM || '').trim(),
    region: regionOf(row.SUBSCRPT_AREA_CODE_NM) || regionOf(addr[0]),
    district: addr[1] || '',
    kind,
    units: num(row.TOT_SUPLY_HSHLDCO) || null,
    pricePerPyeong: null,
    applyhomeUrl: url(row.PBLANC_URL),
    homepageUrl: url(row.HMPG_ADRES),
    phases: PHASE_FIELDS[kind].map(([k, f]) => ({ k, date: ymd(row[f]) })).filter((p) => p.date),
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

async function getAll(op, cond, key) {
  const out = [];
  for (let page = 1; ; page++) {
    const u = new URL(BASE + op);
    u.searchParams.set('serviceKey', key);
    u.searchParams.set('page', page);
    u.searchParams.set('perPage', 500);
    u.searchParams.set('returnType', 'JSON');
    for (const [k, v] of Object.entries(cond)) u.searchParams.set(k, v);
    const r = await fetch(u);
    const text = await r.text();
    if (!r.ok) throw new Error(`${op} HTTP ${r.status}: ${text.slice(0, 200)}`);
    const j = JSON.parse(text);
    out.push(...(j.data || []));
    if (!j.data || j.data.length < 500 || out.length >= j.matchCount) return out;
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
    const rows = await getAll(src.detail, { 'cond[RCRIT_PBLANC_DE::GTE]': noticeFrom }, key);
    let kept = 0;
    for (const row of rows) {
      const it = toItem(row, src.kind);
      if (!it || !it.region || !it.phases.some((p) => p.date >= from && p.date <= to)) continue;
      if (src.model) {
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
  if (!items.size) throw new Error('수집 결과 0건 — 빈 달력을 배포하지 않도록 중단합니다.');

  const t = now.toISOString().slice(0, 19);
  const json = { updatedAt: `${t}+09:00`, items: [...items.values()] };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(json));
  console.log(`${out}: ${items.size}건 (${from} ~ ${to})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

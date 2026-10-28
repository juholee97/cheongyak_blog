// SH 장기전세·전세형 임대의 보증금을 주변 아파트 전월세 실거래(국토교통부 RTMSDataSvcAptRent)와 견주는 계산
// SH 공고 본문에는 보증금·면적이 없고(첨부 PDF/HWP에만 있고 이노릭스 다운로드라 자동으로 못 받는다) → 사람이 data/sh_units.json에 옮겨 적는다:
//   [{ "id":"sh-312325", "name":"…", "gu":"종로구", "dong":"옥인동"(선택), "type":"아파트|다세대", "area":59.97, "floor":-1(반지하)|1|5…, "built":2017, "deposit":28000, "rent":0, "src":"공고문 p.3" }]  (만원, 전용㎡)
// node zip/sh_rent.mjs                  data/sh_units.json 전부 → data/sh_rent.json
// node zip/sh_rent.mjs --probe 종로구 59 [다세대 층 건축년도]   그 구·면적의 최근 3개월 전월세 시세만 보기(API 점검)
// node zip/sh_rent.mjs --check
// 아파트와 연립다세대("type":"다세대")를 본다. 다가구·단독·오피스텔은 비교 대상이 아니다(다가구 API는 아직 미승인).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { dataKey } from '../posts/trades.mjs';
import { useApi } from './guard.mjs';
import { ROOT } from '../tistory/common.mjs';

// apt 아파트, rh 연립다세대(2026-10-28 활용신청 승인). 단독/다가구(RTMSDataSvcSHRent)는 아직 403이라 넣지 않았다
const API = { apt: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent', rh: 'https://apis.data.go.kr/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent', offi: 'https://apis.data.go.kr/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent' };
export const GU = { 종로구: '11110', 중구: '11140', 용산구: '11170', 성동구: '11200', 광진구: '11215', 동대문구: '11230', 중랑구: '11260', 성북구: '11290', 강북구: '11305', 도봉구: '11320', 노원구: '11350', 은평구: '11380', 서대문구: '11410', 마포구: '11440', 양천구: '11470', 강서구: '11500', 구로구: '11530', 금천구: '11545', 영등포구: '11560', 동작구: '11590', 관악구: '11620', 서초구: '11650', 강남구: '11680', 송파구: '11710', 강동구: '11740' };

const tag = (x, t) => (x.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1]?.trim() ?? '';
const num = (s) => +String(s).replace(/,/g, '') || 0;
export const parseRent = (xml) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, x]) => ({
  apt: tag(x, 'aptNm') || tag(x, 'mhouseNm') || tag(x, 'offiNm'), umd: tag(x, 'umdNm'), ar: +tag(x, 'excluUseAr'), deposit: num(tag(x, 'deposit')), rent: num(tag(x, 'monthlyRent')),
  floor: tag(x, 'floor') === '' ? null : +tag(x, 'floor'), built: +tag(x, 'buildYear') || null,
  ym: `${tag(x, 'dealYear')}-${tag(x, 'dealMonth').padStart(2, '0')}`, renewal: tag(x, 'contractType') === '갱신', // 갱신계약은 5% 상한 때문에 시세보다 낮아 뺀다
}));

// 시군구·달 → 거래 목록. 지난 달은 파일에 저장해 다시 받지 않는다(일일 호출 한도)
async function month(lawd, ym, key, kind) {
  const f = join(ROOT, 'data/rtms_cache', `${{ rh: 'rentrh', offi: 'rentoffi' }[kind] || 'rent'}_${lawd}_${ym}.json`), nowYm = new Date().toISOString().slice(0, 7).replace('-', ''), today = new Date().toISOString().slice(0, 10);
  const hit = JSON.parse(await readFile(f, 'utf8').catch(() => 'null'));
  if (hit?.v === 2 && (ym < nowYm || hit.at === today)) return hit.items;
  const out = [];
  for (let page = 1; page <= 10; page++) {
    useApi('datago');
    const r = await fetch(`${API[kind]}?serviceKey=${encodeURIComponent(key)}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&pageNo=${page}&numOfRows=1000`);
    const xml = await r.text();
    if (!r.ok || !/<resultCode>0*0<\/resultCode>/.test(xml)) throw new Error(`전월세 API ${ym} 응답 이상(HTTP ${r.status})`); // URL에 키가 있어 찍지 않는다
    const items = parseRent(xml);
    out.push(...items);
    if (items.length < 1000) break;
  }
  await mkdir(join(ROOT, 'data/rtms_cache'), { recursive: true });
  await writeFile(f, JSON.stringify({ v: 2, at: today, items: out })).catch(() => {});
  return out;
}

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
export const round100 = (v) => Math.round(v / 100) * 100; // 만원 → 백만원 단위(글 규칙: 「약」은 백만원까지)

// 층대(RTMS는 반지하·지하를 음수 층으로 준다)와 연식대. 같은 층대·같은 연식대끼리 견주는 게 시세 비교의 기본이다
export const floorBand = (f) => (f == null ? null : f <= 0 ? '반지하·지하' : f === 1 ? '1층' : f <= 3 ? '저층(2~3층)' : f <= 9 ? '중층(4~9층)' : '고층(10층~)');
export const ageBand = (built, year = new Date().getFullYear()) => { if (!built) return null; const a = year - built; return a <= 5 ? '신축(5년 이하)' : a <= 15 ? '6~15년' : a <= 30 ? '16~30년' : '30년 초과'; };

// 순수 계산: 신규 계약(갱신 제외) 중 전용면적이 비슷한(±max(5㎡, 15%)) 것에서 전세(월세 0)·월세 중앙값.
// 조건을 엄격한 쪽부터 풀어 가며 표본(전세형 전세·월세형 월세)이 3건 이상 나오는 첫 조건을 쓴다: [층대+연식대] → [층대] → [면적만]. 각 조건은 같은 동 → 구 전체 순.
// unit.own: 그 건물 이름이면 비교 거래에서 뺀다(같은 건물 거래는 자기 자신). unit.requireAge: 연식대를 풀지 않는다(신축 고급 빌라처럼 연식이 가격을 좌우할 때) — 같은 연식대 거래가 3건 미만이면 판단하지 않는다
export function market(trades, { area, dong, floor, built, rent, deposit, own, requireAge }, year) {
  // 월세형은 보증금이 비슷한(±30%, 최소 ±2천만원) 월세 거래끼리만 — 보증금이 다르면 월세도 다르다
  const w = Math.max(5, area * 0.15), near = trades.filter((t) => !t.renewal && Math.abs(t.ar - area) <= w && t.apt !== own && (!rent || (t.rent && Math.abs(t.deposit - deposit) <= Math.max(2000, deposit * 0.3))));
  const fb = floorBand(floor), ab = ageBand(built, year);
  const pick = (xs) => ({ n: xs.length, jeonse: median(xs.filter((t) => !t.rent).map((t) => t.deposit)), nJeonse: xs.filter((t) => !t.rent).length, wolse: median(xs.filter((t) => t.rent).map((t) => t.rent)), wolseDeposit: median(xs.filter((t) => t.rent).map((t) => t.deposit)), nWolse: xs.filter((t) => t.rent).length });
  const rank = { rankN: near.length, rankBelow: rent ? near.filter((t) => t.rent < rent).length : null }; // 면적·보증금만 맞춘(연식 무시) 거래 중 이 집보다 월세가 낮은 건수
  const conds = [
    fb && ab && { label: `${fb}·${ab}`, f: (t) => floorBand(t.floor) === fb && ageBand(t.built, year) === ab },
    !(requireAge && ab) && fb && { label: fb, f: (t) => floorBand(t.floor) === fb },
    requireAge && ab && { label: ab, f: (t) => ageBand(t.built, year) === ab },
    !(requireAge && ab) && { label: '층·연식 구분 없음', f: () => true },
  ].filter(Boolean);
  let last;
  for (const c of conds) for (const [scope, xs] of [dong && [[].concat(dong).join('·'), near.filter(c.f).filter((t) => [].concat(dong).includes(t.umd))], ['구 전체', near.filter(c.f)]].filter(Boolean)) {
    last = { scope, cond: c.label, ...rank, ...pick(xs) };
    if (rent ? last.nWolse >= 3 : last.nJeonse >= 3) return last;
  }
  return last;
}

// 전세형(rent 0)은 보증금 ÷ 시장 전세 중앙값. 월세형은 월세 ÷ 시장 월세 중앙값(보증금 수준이 달라 참고용). 표본 3건 미만이면 판단하지 않는다
export function compare(u, m) {
  if (!u.rent) return m.nJeonse >= 3 ? { type: '전세', ratio: u.deposit / m.jeonse, gap: u.deposit - m.jeonse, market: m.jeonse, n: m.nJeonse } : { type: '전세', insufficient: true, n: m.nJeonse };
  return m.nWolse >= 3 ? { type: '월세', ratio: u.rent / m.wolse, gap: u.rent - m.wolse, market: m.wolse, marketDeposit: m.wolseDeposit, n: m.nWolse } : { type: '월세', insufficient: true, n: m.nWolse };
}

// unit.type: '다세대'·'연립'이면 연립다세대, '오피스텔'이면 오피스텔, 아니면 아파트
export async function tradesFor(gu, unit, { months = 6, now = new Date() } = {}) {
  const lawd = GU[gu];
  if (!lawd) throw new Error(`서울 25개 구가 아님: ${gu}`);
  const key = await dataKey();
  if (!key) throw new Error('DATA_GO_KR_KEY 없음');
  const trades = [], kind = /다세대|연립|빌라/.test(unit.type || '') ? 'rh' : /오피스텔/.test(unit.type || '') ? 'offi' : 'apt';
  for (let i = 1; i <= months; i++) { // 이번 달은 거래가 덜 쌓여 있어 지난달부터 거슬러 올라간다
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    trades.push(...(await month(lawd, `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`, key, kind)));
  }
  return trades;
}
export const marketFor = async (gu, unit, opt) => market(await tradesFor(gu, unit, opt), unit);

const ymAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }; // 6개월 전 달(YYYY-MM)
async function main() {
  const units = JSON.parse(await readFile(join(ROOT, 'data/sh_units.json'), 'utf8').catch(() => '[]'));
  if (!units.length) { console.log('data/sh_units.json이 비어 있음 — 공고문 PDF에서 보증금·면적을 옮겨 적은 뒤 다시'); return; }
  const out = [];
  for (const u of units) {
    const all = await tradesFor(u.gu, u, { months: 12 }), m = market(all.filter((t) => t.ym >= ymAgo(6)), u), c = compare(u, m);
    // 같은 건물에서 신고된 계약(자기 건물 실거래) — 공고 임대료가 실제 계약과 맞는지 보는 참고
    const ownTrades = u.own ? all.filter((t) => t.apt === u.own && !t.renewal && Math.abs(t.ar - u.area) <= 1).map(({ ar, floor, deposit, rent, ym }) => ({ ar, floor, deposit, rent, ym })) : undefined;
    out.push({ ...u, market: m, result: c, ownTrades, at: new Date().toISOString().slice(0, 10) });
    console.log(`${u.name} ${u.area}㎡ ${floorBand(u.floor) || ''} ${u.built ? u.built + '년' : ''} ${u.rent ? `월세 ${u.rent}(보증금 ${u.deposit})` : `보증금 ${u.deposit}`} · ${m.scope}·${m.cond} ${c.insufficient ? `표본 부족(${c.n}건)` : `${c.type} 시세 약 ${c.type === '월세' ? Math.round(c.market) : round100(c.market)}만원(${c.n}건) → ${(c.ratio * 100).toFixed(0)}%`}`);
  }
  await writeFile(join(ROOT, 'data/sh_rent.json'), JSON.stringify(out, null, 1));
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const t = (deposit, rent, umd = 'A동', ar = 59, renewal = false, floor = 3, built = 2015) => ({ apt: 'x', umd, ar, deposit, rent, ym: '2026-09', renewal, floor, built });
  const trades = [t(40000, 0), t(50000, 0), t(60000, 0), t(90000, 0, 'A동', 59, true), t(1000, 100), t(2000, 120), t(3000, 140), t(99999, 0, 'A동', 84), t(20000, 0, 'A동', 59, false, -1, 1990), t(21000, 0, 'A동', 59, false, -1, 1990), t(22000, 0, 'A동', 59, false, -1, 1990)];
  const m = market(trades, { area: 59, dong: 'A동', floor: 3, built: 2015, rent: 0 }, 2026);
  assert.equal(m.scope, 'A동'); assert.equal(m.cond, '저층(2~3층)·6~15년'); assert.equal(m.jeonse, 50000); assert.equal(m.nJeonse, 3); // 갱신·면적 밖·반지하 거래는 빠진다
  assert.equal(compare({ deposit: 30000, rent: 0 }, m).ratio, 0.6);
  const b = market(trades, { area: 59, dong: 'A동', floor: -1, built: 1990, rent: 0 }, 2026);
  assert.equal(b.cond, '반지하·지하·30년 초과'); assert.equal(b.jeonse, 21000); // 반지하는 반지하끼리
  assert.equal(market(trades, { area: 59, dong: 'B동', floor: 3, built: 2015, rent: 0 }, 2026).scope, '구 전체'); // 동 표본이 모자라면 구 전체
  assert.equal(market(trades, { area: 59, floor: 12, built: 2015, rent: 0 }, 2026).cond, '층·연식 구분 없음'); // 같은 층대 표본이 없으면 조건을 푼다
  const req = market([...trades, t(1, 100, 'A동', 59, false, 3, 2026), { ...t(1, 70, 'A동', 59, false, 3, 2026), apt: 'self' }], { area: 59, floor: 3, built: 2026, rent: 80, deposit: 2000, own: 'self', requireAge: true }, 2026);
  assert.equal(req.nWolse, 1); assert.ok(req.nWolse < 3); // 신축 거래가 모자라면 연식을 풀지 않고(구축으로 대체 안 함) 자기 건물은 뺀다
  assert.equal(floorBand(0), '반지하·지하'); assert.equal(ageBand(1990, 2026), '30년 초과');
  assert.equal(compare({ deposit: 1, rent: 0 }, { nJeonse: 2 }).insufficient, true);
  assert.equal(round100(28650), 28700);
  assert.equal(parseRent('<item><aptNm>가</aptNm><umdNm>나</umdNm><excluUseAr>59.9</excluUseAr><deposit>15,000</deposit><monthlyRent>0</monthlyRent><dealYear>2026</dealYear><dealMonth>9</dealMonth><contractType>갱신</contractType></item>')[0].renewal, true);
  console.log('sh_rent 점검 통과');
} else if (process.argv.includes('--probe')) {
  const [gu, area, type, floor, built] = process.argv.slice(process.argv.indexOf('--probe') + 1);
  console.log(JSON.stringify(await marketFor(gu, { area: +area, type, floor: floor == null ? undefined : +floor, built: built == null ? undefined : +built }, { months: 3 })));
} else if (process.argv[1]?.endsWith('sh_rent.mjs')) await main();

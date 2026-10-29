// 관리비 가정 계산(2026-10-29): 새 단지는 관리비 자료가 없어서, 같은 시·군·구에서 최근 10년 안에 입주한 단지들이
// K-apt(공동주택관리정보시스템)에 공개한 한 달 관리비(공용관리비 17항목 + 개별사용료 10항목)를 단지 주거전용면적 합으로 나눠 전용 ㎡당 값을 구하고,
// (관리비 부과면적 kaptMarea는 공급면적 기준인 단지가 있어 전용면적 합 privArea로 나눈다 — 래미안솔베뉴 부과 167,139㎡ vs 전용 119,769㎡)
// 그 중간값 × 전용면적으로 「이 정도 나올 수 있다」를 보여 준다. 단지 목록·기본정보·관리비는 data/kapt/에 저장해 다시 부르지 않는다.
// node posts/kapt_fee.mjs <시군구코드 5자리> [--area 84]     node posts/kapt_fee.mjs --check
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../tistory/common.mjs';
import { useApi } from '../zip/guard.mjs';

const B = 'https://apis.data.go.kr/1613000/';
const CMN = ['LaborCost', 'OfcrkCost', 'Taxdue', 'ClothingCost', 'EduTraingCost', 'VhcleMntncCost', 'EtcCost', 'CleaningCost', 'GuardCost', 'DisinfectionCost', 'ElevatorMntncCost', 'HomeNetworkMntncCost', 'RepairsCost', 'FacilityMntncCost', 'SafetyCheckUpCost', 'DisasterPreventionCost', 'ConsignManageFee']
  .map((k) => `AptCmnuseManageCostServiceV3/getHsmp${k}InfoV3`);
const IND = ['HeatCost', 'HotWaterCost', 'GasRentalFee', 'ElectricityCost', 'WaterCost', 'DomesticWasteFee', 'MovingInRepresentationMtg', 'BuildingInsuranceFee', 'ElectionOrpns', 'WaterPurifierTankFee']
  .map((k) => `AptIndvdlzManageCostServiceV3/getHsmp${k}InfoV3`);
export const YEARS = 10, MIN_UNITS = 100, MIN_AVG = 40, PICK = 5; // 평균 전용 40㎡ 미만(원룸형 임대 등)은 고정비가 작은 면적에 몰려 ㎡당 값이 튄다(길동생활A 7,344원 vs 이웃 3,000~3,600원)
const DIR = join(ROOT, 'data', 'kapt');

async function key() {
  if (process.env.DATA_GO_KR_KEY) return process.env.DATA_GO_KR_KEY;
  return (await readFile(join(ROOT, '.env'), 'utf8')).match(/^DATA_GO_KR_KEY=(.*)$/m)?.[1].trim();
}
async function call(path, params) {
  useApi('datago'); // 호출 한도 가드(zip/guard.mjs)
  const u = new URL(B + path);
  u.searchParams.set('serviceKey', await key()); u.searchParams.set('_type', 'json');
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  for (let i = 0; i < 8; i++) { // 게이트웨이 오류가 몇 번 이어지기도 한다(2026-10-29 계양구 목록 절반쯤)
    const r = await fetch(u).catch(() => null);
    // 초당 호출이 몰리면 429가 난다. 200인데 본문이 게이트웨이 오류(OpenAPI_ServiceResponse · HTTP_ERROR)일 때도 있어 그때도 다시 묻는다
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (j?.response?.header?.resultCode === '00') { await new Promise((s) => setTimeout(s, 300)); return j.response.body; }
    if (r && !r.ok && r.status !== 429 && r.status < 500) throw new Error(`K-apt ${path.split('/')[1]} HTTP ${r.status}`); // URL은 키가 들어 있어 찍지 않는다
    await new Promise((s) => setTimeout(s, 3000 * (i + 1)));
  }
  throw new Error(`K-apt ${path.split('/')[1]} 응답 없음`);
}
// days: 저장값을 다시 쓰는 기간(0 = 계속). 값이 비었으면(null) 7일 뒤 다시 묻는다 — 관리비는 공개가 늦어 지금 빈 달이 나중에 채워진다
async function cached(file, days, get) {
  const p = join(DIR, file);
  const old = await readFile(p, 'utf8').then(JSON.parse, () => null);
  const keep = old?.v == null ? 7 : days;
  if (old && (!keep || Date.now() - Date.parse(old.fetched) < keep * 864e5)) return old.v;
  const v = await get();
  await mkdir(join(p, '..'), { recursive: true });
  await writeFile(p, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), v }));
  return v;
}
const list = (lawd) => cached(`list/${lawd}.json`, 90, async () => {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const b = await call('AptListService4/getSigunguAptList4', { sigunguCode: lawd, numOfRows: 500, pageNo: page });
    const items = [b?.items || []].flat().map((x) => x.item || x).flat();
    out.push(...items.map((x) => ({ code: x.kaptCode, name: x.kaptName })));
    if (!items.length || out.length >= +b.totalCount) break;
  }
  if (!out.length) throw new Error(`K-apt 단지 목록이 비었음(${lawd})`); // 일시적으로 빈 응답이 온 적이 있다(계양구 2026-10-29) — 저장하지 않고 다음 실행에서 다시
  return out;
});
const basic = (code) => cached(`basic/${code}.json`, 365, async () => {
  const x = (await call('AptBasisInfoServiceV5/getAphusBassInfoV5', { kaptCode: code }))?.item || {};
  return { name: x.kaptName, used: x.kaptUsedate, units: +x.kaptdaCnt || 0, marea: +x.kaptMarea || 0, priv: +x.privArea || 0, heat: x.codeHeatNm };
});
// 한 항목 응답의 금액 합(단지 전체, 원) — kaptCode·kaptName을 뺀 값은 모두 금액이다
export const sumItem = (it) => Object.entries(it || {}).filter(([k]) => !/^kapt/.test(k)).reduce((s, [, v]) => s + (+v || 0), 0);
// 인건비부터 묻고 비었으면 그 달은 공개 전으로 보고 나머지 26항목은 묻지 않는다(null)
const fee = (code, ym) => cached(`fee/${code}_${ym}.json`, 0, async () => {
  const parts = {}, ops = [...CMN, ...IND];
  if (!sumItem((await call(ops[0], { kaptCode: code, searchDate: ym }))?.item)) return null;
  for (const op of ops) parts[op.split('/')[1].replace(/^getHsmp|InfoV3$/g, '')] = sumItem((await call(op, { kaptCode: code, searchDate: ym }))?.item);
  return parts;
});

const ymOf = (d, back) => { const t = new Date(d.getFullYear(), d.getMonth() - back, 1); return `${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}`; };
const median = (a) => { const s = [...a].sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

// lawd: 시군구코드 5자리. 돌려주는 값: { ym, perM2(중간값, 원/㎡), range:[최소,최대], rows:[{name, used, units, perM2, heat}] } 또는 { skip }
export async function feeNear(lawd, now = new Date()) {
  if (!lawd) return { skip: '시군구 코드 없음' };
  const since = `${now.getFullYear() - YEARS}${String(now.getMonth() + 1).padStart(2, '0')}01`;
  const cands = [];
  for (const a of await list(lawd)) {
    const b = await basic(a.code);
    if (b.used >= since && b.units >= MIN_UNITS && b.priv / b.units >= MIN_AVG) cands.push({ ...a, ...b });
  }
  cands.sort((x, y) => (y.used > x.used ? 1 : -1));
  // K-apt는 관리비를 한두 달 뒤에 공개하고, 갓 입주한 단지는 몇 달 비기도 한다 — 새 단지 3곳으로 지난달부터 거슬러 올라가 값이 있는 달을 고른다
  let ym = null;
  for (const back of [1, 2, 3]) {
    const y = ymOf(now, back);
    for (const c of cands.slice(0, 3)) if (await fee(c.code, y)) { ym = y; break; }
    if (ym) break;
  }
  if (!ym) return { skip: '최근 입주 단지 관리비 공개값 없음' };
  const rows = [];
  for (const c of cands) {
    if (rows.length >= PICK) break;
    const parts = await fee(c.code, ym), total = Object.values(parts || {}).reduce((s, v) => s + v, 0);
    if (total > 0) rows.push({ name: c.name, used: c.used, units: c.units, heat: c.heat, total, priv: c.priv, perM2: total / c.priv });
  }
  if (rows.length < 2) return { skip: '비교할 최근 입주 단지가 2곳 미만' };
  const v = rows.map((r) => r.perM2);
  return { ym, lawd, perM2: median(v), range: [Math.min(...v), Math.max(...v)], rows, fetched: new Date().toISOString().slice(0, 10) };
}
// 전용 area㎡ 월 관리비(가정 계산, 100원 단위 반올림)
export const feeFor = (fn, area) => Math.round((fn.perM2 * area) / 100) * 100;

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain && process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  assert.equal(sumItem({ kaptCode: 'A1', kaptName: 'x', pay: '1000', bonus: '250', sundryCost: null }), 1250);
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(feeFor({ perM2: 2876.4 }, 84), 241600);
  assert.equal(ymOf(new Date(2026, 0, 15), 1), '202512');
  assert.equal(CMN.length, 17); assert.equal(IND.length, 10);
  console.log('kapt_fee 점검 통과');
} else if (isMain) {
  const lawd = process.argv[2], ai = process.argv.indexOf('--area');
  const r = await feeNear(lawd);
  console.log(JSON.stringify(r, null, 1));
  if (!r.skip && ai > 0) console.log(`전용 ${process.argv[ai + 1]}㎡ 월 약 ${feeFor(r, +process.argv[ai + 1]).toLocaleString()}원`);
}

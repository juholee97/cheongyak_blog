// 「aulee의 집」(auleezip.com) 후보 고르기: 접수 전 분양 공고 중 분양가가 주변 신축 실거래보다 크게 싼 곳
// node zip/deals.mjs           → data/deals.json(전부) + 기준을 넘은 곳 표
// node zip/deals.mjs --check   → 계산 자체 점검(네트워크 없음)
// 비교: 주력 주택형(세대수 최다) 최고 분양가의 전용 3.3㎡당 값 vs 반경 1.5km, 준공 10년 이내 단지의 최근 12개월 전용 3.3㎡당 중앙값.
// 10년 이내 단지가 2곳보다 적으면 구축까지 넣고 old 표시. 토지임대부는 땅값이 빠진 분양가라 따로 표시만 한다.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { loadData } from '../posts/weekly.mjs';
import { odcloud } from '../posts/analysis_post.mjs';
import { nearbyTrades, dataKey, PY } from '../posts/trades.mjs';

export const GAP = 20000, RATE = 0.2, NEW = 10; // 2억원 이상 또는 20% 이상 싸면 후보, 비교 단지는 준공 10년 이내
const MODEL = { APT: 'getAPTLttotPblancMdl', 무순위: 'getRemndrLttotPblancMdl' }; // 임의공급은 분양가 모델 API가 없어 제외
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

// models(청약홈 주택형) → 전용별 { area, units, max }, 세대수 최다가 주력
export function mainType(models) {
  const by = new Map();
  for (const m of models) {
    const area = +String(m.HOUSE_TY).slice(0, 3), top = +m.LTTOT_TOP_AMOUNT || 0, units = (+m.SUPLY_HSHLDCO || 0) + (+m.SPSPLY_HSHLDCO || 0);
    if (!area || !top) continue;
    const g = by.get(area) || { area, units: 0, max: 0 };
    g.units += units; g.max = Math.max(g.max, top);
    by.set(area, g);
  }
  return [...by.values()].reduce((a, b) => (!a || b.units > a.units ? b : a), null);
}

// 주력 주택형 vs 주변 단지 → 3.3㎡당 차이와 주력 주택형 한 채 기준 금액 차이(만원)
export function dealOf(main, groups, year) {
  const ok = groups.filter((g) => g.perPy && !g.leasehold);
  const fresh = ok.filter((g) => g.built >= year - NEW);
  const ref = fresh.length >= 2 ? fresh : ok;
  if (ref.length < 2) return null;
  const med = median(ref.map((g) => g.perPy)), own = Math.round(main.max / (main.area / PY));
  const gap = Math.round(((med - own) * main.area) / PY), rate = Math.round((1 - own / med) * 1000) / 1000;
  return { own, med, gap, rate, n: ref.length, old: ref !== fresh, refs: ref.map((g) => ({ apt: g.apt, built: g.built, perPy: g.perPy, d: g.d })), hit: !(ref !== fresh) && (gap >= GAP || rate >= RATE) }; // 구축하고만 비교한 값은 후보로 치지 않는다
}

async function main() {
  const key = await dataKey();
  if (!key) throw new Error('.env에 DATA_GO_KR_KEY 필요');
  const data = await loadData(), today = new Date().toISOString().slice(0, 10), year = new Date().getFullYear();
  const items = data.items.filter((it) => MODEL[it.kind] && (it.phases || []).some((p) => ['sp', 'p1'].includes(p.k) && p.date >= today));
  const out = [];
  for (const it of items) {
    const no = it.id.split('-')[0], row = { no, name: it.name, kind: it.kind, region: it.region, district: it.district, address: it.address, leasehold: /토지임대부/.test(it.name), applyhomeUrl: it.applyhomeUrl, phases: it.phases };
    try {
      const m = mainType(await odcloud(MODEL[it.kind], no, key));
      if (!m) { out.push({ ...row, skip: '주택형 분양가 없음' }); continue; }
      const t = await nearbyTrades(it.address, m.area);
      if (t.skip) { out.push({ ...row, main: m, skip: t.skip }); continue; }
      const d = dealOf(m, t.same, year);
      out.push({ ...row, main: m, months: t.months, ...(d ? { ...d, hit: d.hit && !row.leasehold } : { skip: '비교할 단지 2곳 미만' }) }); // 토지임대부는 땅값이 빠져 후보에서 빼고 표시만
    } catch (e) { out.push({ ...row, skip: e.message }); }
    console.log(`${out.at(-1).hit ? '★' : ' '} ${it.kind} ${it.name} ${out.at(-1).skip || `3.3㎡당 ${out.at(-1).own} vs ${out.at(-1).med} → ${out.at(-1).gap}만 (${Math.round(out.at(-1).rate * 100)}%)`}`);
  }
  await writeFile(join(ROOT, 'data/deals.json'), JSON.stringify({ at: new Date().toISOString(), rule: { GAP, RATE, NEW }, items: out }, null, 2));
  const hits = out.filter((r) => r.hit);
  console.log(`\n공고 ${items.length}곳 · 기준 넘은 곳 ${hits.length}곳 · 비교 못 함 ${out.filter((r) => r.skip).length}곳 → data/deals.json`);
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const m = mainType([{ HOUSE_TY: '084.9800A', LTTOT_TOP_AMOUNT: '80000', SUPLY_HSHLDCO: '100' }, { HOUSE_TY: '059.9900A', LTTOT_TOP_AMOUNT: '60000', SUPLY_HSHLDCO: '20' }]);
  assert.deepEqual(m, { area: 84, units: 100, max: 80000 });
  const g = (perPy, built) => ({ apt: 'x', perPy, built, leasehold: false, d: 500 });
  const d = dealOf(m, [g(5000, 2020), g(5400, 2022), g(2000, 2000)], 2026); // 구축 2000년은 빠진다
  assert.equal(d.med, 5200); assert.equal(d.own, 3148); assert.equal(d.old, false); assert.ok(d.hit && d.gap > 50000);
  assert.equal(dealOf(m, [g(3000, 2020), g(3100, 2021)], 2026).hit, false); // 비슷하면 후보 아님
  assert.equal(dealOf(m, [g(5000, 2020)], 2026), null); // 비교 단지 1곳은 판단 안 함
  assert.equal(dealOf(m, [g(6000, 2000), g(6200, 2001)], 2026).hit, false); // 구축하고만 비교되면 후보 아님
  console.log('deals 점검 통과');
} else if (process.argv[1]?.endsWith('deals.mjs')) await main();

// 「aulee의 집」(auleezip.com) 비교: 접수 전 분양 공고마다 주력 주택형 분양가 vs 직접 고른 비교 단지 실거래
// node zip/deals.mjs           → data/deals.json: 공고마다 후보 단지 풀(같은 시군구 최근 12개월 거래 단지) + 고른 단지로 계산한 차이
// node zip/deals.mjs --check   → 계산 자체 점검(네트워크 없음)
// 비교 단지는 반경으로 자르지 않는다(2026-10-28 사용자 결정): 생활권 인식·상급지/하급지·브랜드·고급 단지를 보고 사람이(Claude 세션) 골라
// data/zip_peers.json에 { "공고번호": { "peers": [{ "apt": "단지명(풀에 있는 이름 그대로)", "why": "고른 이유" }], "note"?: "" } } 로 적는다.
// 값(실거래 3.3㎡당 중앙값)은 언제나 국토교통부 실거래 — 고르는 일만 판단이다. 비교 단지가 2곳 미만이면 글을 만들지 않는다.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { loadData } from '../posts/weekly.mjs';
import { odcloud } from '../posts/analysis_post.mjs';
import { nearbyTrades, dataKey, PY } from '../posts/trades.mjs';

export const GAP = 20000, RATE = 0.2; // 주력 주택형 한 채로 2억원 이상 또는 20% 이상 싸면 꿀분양
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

// 주력 주택형 vs 고른 단지 → 3.3㎡당 차이와 주력 주택형 한 채 기준 금액 차이(만원)
export function dealOf(main, refs) {
  if (refs.length < 2) return null;
  const med = median(refs.map((g) => g.perPy)), own = Math.round(main.max / (main.area / PY));
  const gap = Math.round(((med - own) * main.area) / PY), rate = Math.round((1 - own / med) * 1000) / 1000;
  return { own, med, gap, rate, n: refs.length, hit: gap >= GAP || rate >= RATE };
}

// 풀에서 고른 단지 찾기: 이름이 같은 단지(같은 이름이 여럿이면 가까운 것)
export function pick(pool, peers) {
  return peers.map((p) => { const g = pool.find((x) => x.apt === p.apt); return g && g.perPy ? { ...g, why: p.why } : null; }).filter(Boolean);
}

async function main() {
  const key = await dataKey();
  if (!key) throw new Error('.env에 DATA_GO_KR_KEY 필요');
  const peersOf = JSON.parse(await readFile(join(ROOT, 'data/zip_peers.json'), 'utf8').catch(() => '{}'));
  const data = await loadData(), today = new Date().toISOString().slice(0, 10);
  const items = data.items.filter((it) => MODEL[it.kind] && (it.phases || []).some((p) => ['sp', 'p1'].includes(p.k) && p.date >= today));
  const out = [];
  for (const it of items) {
    const no = it.id.split('-')[0], row = { no, name: it.name, kind: it.kind, region: it.region, district: it.district, address: it.address, leasehold: /토지임대부/.test(it.name), applyhomeUrl: it.applyhomeUrl, phases: it.phases };
    try {
      const m = mainType(await odcloud(MODEL[it.kind], no, key));
      if (!m) { out.push({ ...row, skip: '주택형 분양가 없음' }); continue; }
      const t = await nearbyTrades(it.address, m.area);
      if (t.skip) { out.push({ ...row, main: m, skip: t.skip }); continue; }
      // 후보 풀: 같은 시군구에서 최근 12개월 2건 이상 거래된 단지, 가까운 순 120곳
      const pool = t.all.filter((g) => g.count >= 2 && g.perPy).slice(0, 120).map(({ apt, umd, jibun, built, tier, leasehold, count, perPy, d, near }) => ({ apt, umd, jibun, built, tier, leasehold, count, perPy, d, near }));
      const chosen = peersOf[no] ? pick(pool, peersOf[no].peers) : [];
      const d = dealOf(m, chosen);
      out.push({ ...row, main: m, months: t.months, pool, refs: chosen, note: peersOf[no]?.note || '', ...(d ? { ...d, hit: d.hit && !row.leasehold } : { skip: peersOf[no] ? '고른 비교 단지가 풀에 2곳 미만' : '비교 단지 아직 안 고름' }) }); // 토지임대부는 땅값이 빠져 꿀분양에서 뺀다
    } catch (e) { out.push({ ...row, skip: e.message }); }
    const r = out.at(-1);
    console.log(`${r.hit ? '★' : ' '} ${it.kind} ${it.name} ${r.skip || `3.3㎡당 ${r.own} vs ${r.med} → ${r.gap}만 (${Math.round(r.rate * 100)}%)`} · 풀 ${r.pool?.length ?? 0}곳`);
  }
  await writeFile(join(ROOT, 'data/deals.json'), JSON.stringify({ at: new Date().toISOString(), rule: { GAP, RATE }, items: out }, null, 2));
  console.log(`\n공고 ${items.length}곳 · 꿀분양 ${out.filter((r) => r.hit).length}곳 · 비교 단지 고를 곳 ${out.filter((r) => r.skip === '비교 단지 아직 안 고름').length}곳 → data/deals.json`);
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const m = mainType([{ HOUSE_TY: '084.9800A', LTTOT_TOP_AMOUNT: '80000', SUPLY_HSHLDCO: '100' }, { HOUSE_TY: '059.9900A', LTTOT_TOP_AMOUNT: '60000', SUPLY_HSHLDCO: '20' }]);
  assert.deepEqual(m, { area: 84, units: 100, max: 80000 });
  const pool = [{ apt: 'A', perPy: 5000 }, { apt: 'B', perPy: 5400 }, { apt: 'C', perPy: null }];
  const refs = pick(pool, [{ apt: 'A', why: '대장' }, { apt: 'B', why: '같은 브랜드' }, { apt: 'C', why: '거래가 없음' }, { apt: 'Z', why: '풀에 없음' }]);
  assert.deepEqual(refs.map((g) => g.apt), ['A', 'B']); // 값 없는 단지·풀에 없는 단지는 빠진다
  const d = dealOf(m, refs);
  assert.equal(d.med, 5200); assert.equal(d.own, 3148); assert.ok(d.hit && d.gap > 50000);
  assert.equal(dealOf(m, [{ perPy: 3000 }, { perPy: 3100 }]).hit, false); // 비슷하면 꿀분양 아님
  assert.equal(dealOf(m, [{ perPy: 5000 }]), null); // 비교 단지 1곳은 판단 안 함
  console.log('deals 점검 통과');
} else if (process.argv.includes('--recompute')) {
  // 비교 단지만 다시 골랐을 때: 저장된 풀(data/deals.json)로 다시 계산(네트워크 없음)
  const file = join(ROOT, 'data/deals.json'), d = JSON.parse(await readFile(file, 'utf8'));
  const peersOf = JSON.parse(await readFile(join(ROOT, 'data/zip_peers.json'), 'utf8').catch(() => '{}'));
  d.items = d.items.map((r) => {
    if (!r.pool) return r;
    const { own, med, gap, rate, n, hit, skip, ...base } = r;
    const refs = peersOf[r.no] ? pick(r.pool, peersOf[r.no].peers) : [], x = dealOf(r.main, refs);
    return { ...base, refs, note: peersOf[r.no]?.note || '', ...(x ? { ...x, hit: x.hit && !r.leasehold } : { skip: peersOf[r.no] ? '고른 비교 단지가 풀에 2곳 미만' : '비교 단지 아직 안 고름' }) };
  });
  await writeFile(file, JSON.stringify(d, null, 2));
  for (const r of d.items.filter((x) => x.pool)) console.log(`${r.hit ? '★' : ' '} ${r.name} ${r.skip || `3.3㎡당 ${r.own} vs ${r.med} → ${r.gap}만 (${Math.round(r.rate * 100)}%) · 비교 ${r.n}곳`}`);
} else if (process.argv[1]?.endsWith('deals.mjs')) await main();

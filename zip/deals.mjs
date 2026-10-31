// 「우리의 집」(auleezip.com) 비교: 접수 전 분양 공고마다 주력 주택형 분양가 vs 직접 고른 비교 단지 실거래
// node zip/deals.mjs           → data/deals.json: 공고마다 후보 단지 풀(같은 시군구 최근 12개월 거래 단지) + 고른 단지로 계산한 차이
// node zip/deals.mjs --only 2026910275,2026000435   그 공고만(다른 공고 자료는 그대로 이어 둔다)
// --include-past: 접수가 끝난 공고도 다시 계산(--only와 함께)
// node zip/deals.mjs --check   → 계산 자체 점검(네트워크 없음)
// 비교 단지는 반경으로 자르지 않는다(2026-10-28 사용자 결정): 생활권 인식·상급지/하급지·브랜드·고급 단지를 보고 사람이(Claude 세션) 골라
// data/zip_peers.json에 { "공고번호": { "peers": [{ "apt": "단지명(풀에 있는 이름 그대로)", "why": "고른 이유" }], "note"?: "" } } 로 적는다.
// 값(실거래 3.3㎡당 중앙값)은 언제나 국토교통부 실거래 — 고르는 일만 판단이다. 비교 단지가 2곳 미만이면 글을 만들지 않는다.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { loadData } from '../posts/weekly.mjs';
import { odcloud } from '../posts/analysis_post.mjs';
import { nearbyTrades, poolIn, dataKey, PY, siteVariants, distanceOf } from '../posts/trades.mjs';

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

// 풀에서 고른 단지 찾기: 이름이 같은 단지(같은 이름이 여럿이면 가까운 것, sgg를 적으면 그 시군구 것)
export function pick(pool, peers) {
  return peers.map((p) => { const g = pool.find((x) => x.apt === p.apt && (!p.sgg || x.sgg === p.sgg) && (p.kind || null) === (x.kind || null)); return g && g.perPy ? { ...g, why: p.why } : null; }).filter(Boolean);
}

// 최종 비교 단지(refs)에만 거리를 붙인다(후보 수백 곳의 거리는 쓰지 않으니 구하지 않는다). distFn(site, loc) → 미터 또는 null
export async function withDistances(refs, site, distFn) {
  const out = [];
  for (const g of refs) out.push(g.d == null && g.loc && site ? { ...g, d: await distFn(site, g.loc) } : g);
  return out;
}

async function main() {
  const key = await dataKey();
  if (!key) throw new Error('.env에 DATA_GO_KR_KEY 필요');
  const peersOf = JSON.parse(await readFile(join(ROOT, 'data/zip_peers.json'), 'utf8').catch(() => '{}'));
  const neighbors = JSON.parse(await readFile(join(ROOT, 'data/zip_neighbors.json'), 'utf8').catch(() => '{}'));
  // 공고 주소에 동·지번이 없어 위치를 못 찾는 공고(「고덕 국제화계획지구 내 Abc-33블록」 등): { 공고번호: { address, src, approx? } }.
  // approx(동 단위로만 앎)면 비교 단지 거리를 비워 둔다 — 대략 좌표로 잰 거리를 글에 쓰지 않는다
  const siteFix = JSON.parse(await readFile(join(ROOT, 'data/zip_address.json'), 'utf8').catch(() => '{}'));
  // 접수가 끝나 이번 수집에서 빠진 공고도 글이 계속 열려 있으니 지난 자료(풀·고른 단지·비교값)를 이어 둔다 — 시작할 때 읽어 둔다
  const prev = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8').catch(() => '{"items":[]}')).items.filter((r) => r.pool);
  const carry = (out) => [...out, ...prev.filter((r) => !out.some((o) => o.no === r.no))];
  const data = await loadData(), today = new Date().toISOString().slice(0, 10);
  const only = (process.argv[process.argv.indexOf('--only') + 1] || '').split(',').filter((x) => /^\d{10}$/.test(x)); // --only 공고번호,공고번호: 그 공고만 다시 계산
  const items = data.items.filter((it) => (!process.argv.includes('--only') || only.includes(it.id.split('-')[0])) && MODEL[it.kind] && (process.argv.includes('--include-past') || (it.phases || []).some((p) => ['sp', 'p1'].includes(p.k) && p.date >= today)));
  const out = [];
  for (const it of items) {
    const no = it.id.split('-')[0], row = { no, name: it.name, kind: it.kind, region: it.region, district: it.district, address: it.address, leasehold: /토지임대부/.test(it.name), applyhomeUrl: it.applyhomeUrl, phases: it.phases };
    try {
      const m = mainType(await odcloud(MODEL[it.kind], no, key));
      if (!m) { out.push({ ...row, skip: '주택형 분양가 없음' }); continue; }
      const fix = siteFix[no], address = fix?.address || it.address;
      const t = await nearbyTrades(address, m.area, { geo: false }); // 후보의 거리는 구하지 않는다
      if (t.skip) { out.push({ ...row, main: m, skip: t.skip }); continue; }
      // 후보 풀: 같은 시군구 거래 단지 + 생활권이 이어지는 옆 시군구(data/zip_neighbors.json) + 분양권·오피스텔 — 최근 12개월 2건 이상 거래, 거래 많은 순. 거리는 안 구한다(비교 단지에만)
      const keep = (gs, n) => gs.filter((g) => g.count >= 2 && g.perPy).slice(0, n).map(({ apt, umd, jibun, built, tier, leasehold, count, perPy, d, near, sgg, kind, loc }) => ({ apt, umd, jibun, built, tier, leasehold, count, perPy, d, near, loc, ...(sgg ? { sgg } : {}), ...(kind ? { kind } : {}) }));
      const pool = keep(t.all, 250);
      for (const addr of neighbors[no] || []) pool.push(...keep(await poolIn(addr, t.site, m.area, { geo: false }), 120));
      for (const addr of [address, ...(neighbors[no] || [])]) for (const kind of ['silv', 'offi']) pool.push(...keep(await poolIn(addr, t.site, m.area, { kind, geo: false }), 60));
      const chosen = !peersOf[no] ? [] : fix?.approx ? pick(pool, peersOf[no].peers) : await withDistances(pick(pool, peersOf[no].peers), t.site, distanceOf);
      const d = dealOf(m, chosen);
      out.push({ ...row, main: m, site: t.site, months: t.months, pool, refs: chosen, note: peersOf[no]?.note || '', ...(d ? { ...d, hit: d.hit && !row.leasehold } : { skip: peersOf[no] ? '고른 비교 단지가 풀에 2곳 미만' : '비교 단지 아직 안 고름' }) }); // 토지임대부는 땅값이 빠져 꿀분양에서 뺀다
    } catch (e) {
      out.push({ ...row, skip: e.message });
      if (/VWORLD_QUOTA|API_BUDGET/.test(e.message)) { console.log('호출 한도 도달 — 남은 공고는 건너뛰고 멈춥니다(내일 다시):', e.message.slice(0, 80)); break; } // 같은 호출을 공고마다 되풀이하지 않는다
    }
    const r = out.at(-1);
    await writeFile(join(ROOT, 'data/deals.json'), JSON.stringify({ at: new Date().toISOString(), rule: { GAP, RATE }, partial: true, items: carry(out) }, null, 2)); // 중간에 끊겨도 한 곳씩 남는다
    console.log(`${r.hit ? '★' : ' '} ${it.kind} ${it.name} ${r.skip || `3.3㎡당 ${r.own} vs ${r.med} → ${r.gap}만 (${Math.round(r.rate * 100)}%)`} · 풀 ${r.pool?.length ?? 0}곳`);
  }
  await writeFile(join(ROOT, 'data/deals.json'), JSON.stringify({ at: new Date().toISOString(), rule: { GAP, RATE }, items: carry(out) }, null, 2));
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
  assert.ok(siteVariants('경기도 파주시 파주운정3지구 주상복합 4블록(경기도 파주시 동패동 400-7번지 일원)').includes('경기도 파주시 동패동 400-7')); // 블록 주소는 괄호 속 지번으로
  assert.ok(siteVariants('경기도 시흥시 하중동 일원 시흥하중 공공주택지구 내 A1블록').includes('경기도 시흥시 하중동')); // 마지막은 동 단위
  let calls = 0;
  const fake = async (site, loc) => { calls++; return loc === 'x' ? null : 500; };
  const wd = await withDistances([{ apt: 'A', loc: 'a' }, { apt: 'B', loc: 'x' }, { apt: 'C', loc: 'c', d: 77 }, { apt: 'D' }], { lon: 1, lat: 2 }, fake);
  assert.deepEqual(wd.map((g) => g.d ?? null), [500, null, 77, null]); // d가 이미 있거나 주소가 없으면 묻지 않는다
  assert.equal(calls, 2); // 최종 비교 단지만, 그것도 필요한 것만
  console.log('deals 점검 통과');
} else if (process.argv.includes('--recompute')) {
  // 비교 단지만 다시 골랐을 때: 저장된 풀(data/deals.json)로 다시 계산(네트워크 없음)
  const file = join(ROOT, 'data/deals.json'), d = JSON.parse(await readFile(file, 'utf8'));
  const peersOf = JSON.parse(await readFile(join(ROOT, 'data/zip_peers.json'), 'utf8').catch(() => '{}'));
  const next = [];
  for (const r of d.items) {
    if (!r.pool) { next.push(r); continue; }
    const { own, med, gap, rate, n, hit, skip, ...base } = r;
    const refs = peersOf[r.no] ? await withDistances(pick(r.pool, peersOf[r.no].peers), r.site, distanceOf) : [], x = dealOf(r.main, refs);
    next.push({ ...base, refs, note: peersOf[r.no]?.note || '', ...(x ? { ...x, hit: x.hit && !r.leasehold } : { skip: peersOf[r.no] ? '고른 비교 단지가 풀에 2곳 미만' : '비교 단지 아직 안 고름' }) });
  }
  d.items = next;
  await writeFile(file, JSON.stringify(d, null, 2));
  for (const r of d.items.filter((x) => x.pool)) console.log(`${r.hit ? '★' : ' '} ${r.name} ${r.skip || `3.3㎡당 ${r.own} vs ${r.med} → ${r.gap}만 (${Math.round(r.rate * 100)}%) · 비교 ${r.n}곳`}`);
} else if (process.argv[1]?.endsWith('deals.mjs')) await main();

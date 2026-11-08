// 계산기 규칙 점검(로컬 관문): node rules/check.mjs
// 1단계 ① 범위 — JSON 모양, 칸 이름, 공유 조건 이름, 숫자의 문서 행 대조(doc = 파일#절#행 첫 칸, text가 그 행 안에 있어야 함), 필수 칸, 순서, 기한
// docs/eligibility-calculator-design.md 4-5. 사례 실행(cases.json)·금지 표현은 calc.js 엔진과 함께 더한다(작업 5·7)
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = async (p) => readFile(new URL(p, root), 'utf8');
const tables = JSON.parse(await read('rules/tables.json'));
const loans = JSON.parse(await read('rules/loans.json'));
const errors = [], warns = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

const DERIVED = Object.keys(tables.derived);
const FIELDS = new Set([...Object.keys(tables.fields), ...DERIVED]);
const DEFS = new Set(Object.keys(tables.defs));
const OPS = new Set(['le', 'lt', 'ge', 'gt']);
const LEAF_KEYS = new Set(['f', 'is', 'op', 'v', 'fact', 'why', 'ask', 'skipIf', 'unknownIf', 'notice', 'softFail']);

// 조건식 모양 점검
function cond(c, where) {
  if (!c || typeof c !== 'object') return err(where, '조건이 객체가 아님');
  if (c.all || c.any) {
    (c.all || c.any).forEach((x, i) => cond(x, `${where}.${c.all ? 'all' : 'any'}[${i}]`));
  } else if (c.not) cond(c.not, `${where}.not`);
  else if (c.use) { if (!DEFS.has(c.use)) err(where, `모르는 공유 조건 ${c.use}`); }
  else if (c.f) {
    if (!FIELDS.has(c.f)) err(where, `모르는 칸 ${c.f}`);
    if (c.op && !OPS.has(c.op)) err(where, `모르는 op ${c.op}`);
    if (!('is' in c) && !c.op) err(where, `${c.f}: is나 op가 없음`);
    const fd = tables.fields[c.f];
    if ('is' in c && fd?.values) for (const v of [].concat(c.is)) if (!fd.values.includes(v)) err(where, `${c.f}에 없는 값 ${v}`);
    for (const k of Object.keys(c)) if (!LEAF_KEYS.has(k)) err(where, `모르는 키 ${k}`);
  } else if (!c.notice && !c.unknownIf) err(where, '조건 종류를 알 수 없음');
  if (c.ask && !FIELDS.has(c.ask)) err(where, `모르는 ask ${c.ask}`);
  for (const k of ['skipIf']) if (c[k]) cond(c[k], `${where}.${k}`);
  if (c.unknownIf && typeof c.unknownIf === 'object') { cond(c.unknownIf.when, `${where}.unknownIf`); if (!c.unknownIf.why) err(where, 'unknownIf에 why 없음'); }
  if (c.notice && typeof c.notice === 'object') cond(c.notice.when, `${where}.notice`);
}
for (const [k, d] of Object.entries(tables.defs)) cond(d, `defs.${k}`);

// 문서 행 대조
const docCache = {};
async function docRow(ref) {
  const [file, sec, label] = ref.split('#');
  const text = docCache[file] ??= await read(`docs/policy/${file}`);
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^#{2,3} ${sec.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}[.\\s]`).test(l));
  if (start < 0) return { miss: `절 ${sec} 없음` };
  const level = lines[start].match(/^#+/)[0].length;
  for (let i = start + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#+) /);
    if (h && h[1].length <= level) break;
    if (lines[i].startsWith(`| ${label}`)) return { row: lines[i] };
  }
  return { miss: `${sec}절에 「${label}」 행 없음` };
}
async function checkFact(where, f) {
  if (!f.doc) return;
  const r = await docRow(f.doc);
  if (r.miss) return err(where, `${f.doc} — ${r.miss}`);
  for (const t of [].concat(f.text || [])) if (!r.row.includes(t)) err(where, `「${t}」가 ${f.doc} 행에 없음`);
}
for (const [i, f] of (tables.smallDeposit.facts || []).entries()) await checkFact(`smallDeposit.facts[${i}]`, f);

// 상품
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ids = new Set(loans.products.map((p) => p.id));
const orders = {};
for (const p of loans.products) {
  const w = p.code || p.id;
  for (const k of ['id', 'name', 'group', 'order', 'offer', 'checked']) if (p[k] == null) err(w, `필수 칸 ${k} 없음`);
  if (orders[p.order]) err(w, `order ${p.order}가 ${orders[p.order]}와 겹침`); orders[p.order] = w;
  if (p.offer !== 'active') {
    if (!p.offerNote) err(w, 'offerNote 없음');
    for (const x of p.instead || []) if (!ids.has(x)) err(w, `instead ${x} 없음`);
    if (p.doc) await checkFact(w, { doc: p.doc });
    continue;
  }
  for (const k of ['until', 'refresh', 'links', 'rate', 'limit', 'facts', 'variants']) if (!p[k]) err(w, `필수 칸 ${k} 없음`);
  if (!p.links?.official) err(w, 'links.official 없음');
  if (p.until < today) err(w, `until ${p.until} 지남`); else if (p.until <= new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10)) warns.push(`${w}: until ${p.until} 30일 안`);
  cond(p.when, `${w}.when`);
  const keys = new Set();
  for (const v of p.variants) {
    keys.add(v.key); if (v.keyIf) keys.add(v.keyIf.then);
    if (v.when) cond(v.when, `${w}.variants.${v.key}`);
    if (v.keyIf) cond(v.keyIf.when, `${w}.variants.${v.key}.keyIf`);
  }
  for (const [name, f] of Object.entries(p.facts)) {
    const fw = `${w}.facts.${name}`;
    // 변형 키로 나눈 값은 모든 변형 키를 덮어야 한다(지역 키 capital/other 묶음 제외)
    if (f.v && typeof f.v === 'object' && !Array.isArray(f.v) && !('capital' in f.v) && !('inc' in f.v))
      for (const k of keys) if (!(k in f.v)) err(fw, `변형 ${k} 값 없음`);
    for (const x of f.pick || []) if (x.when) cond(x.when, `${fw}.pick`);
    if (f.skipIf) cond(f.skipIf, `${fw}.skipIf`);
    await checkFact(fw, f);
  }
  for (const t of p.limit.terms || []) {
    if (!['cap', 'pct', 'dti', 'renewal', 'price'].includes(t.k)) err(w, `모르는 한도 항 ${t.k}`);
    if (t.fact && !p.facts[t.fact]) err(w, `한도 항 ${t.k}의 fact ${t.fact} 없음`);
    if (t.minus?.when) cond(t.minus.when, `${w}.limit.minus`);
  }
  if (p.limit.gate) cond({ f: p.limit.gate.f, op: p.limit.gate.op, fact: p.limit.gate.fact }, `${w}.limit.gate`);
  const rates = p.rate.byDate || [p.rate];
  for (const r of rates) {
    if (!Array.isArray(r.range) || r.range.length !== 2 || r.range[0] > r.range[1]) err(w, 'rate.range 모양');
    await checkFact(`${w}.rate`, { doc: r.doc, text: r.range.map((x) => x.toFixed(2).replace(/0$/, '')) .map((x) => x.replace(/\.0$/, '')) });
  }
  const t = p.rate.dtiRates;
  if (t) {
    for (const [, row] of t.rows) if (row.length !== t.cols.length) err(w, 'dtiRates 행 칸 수');
    const all = t.rows.flatMap(([, r]) => r);
    if (Math.min(...all) !== p.rate.range[0] || Math.max(...all) !== p.rate.range[1]) err(w, `dtiRates 최저·최고(${Math.min(...all)}~${Math.max(...all)})가 range와 다름`);
    const r = await docRow(p.rate.doc);
    for (const v of all) if (r.row && !r.row.includes(v.toFixed(2))) err(w, `금리표 값 ${v.toFixed(2)}가 ${p.rate.doc} 행에 없음`);
  }
}
// 정렬 코드 금지(9-2): order 말고 다른 값으로 정렬하지 않는다
for (const f of ['skin/images/calc.js', 'posts/calc_post.mjs']) {
  const src = await read(f).catch(() => '');
  for (const m of src.matchAll(/sort\(([^\n]*)/g)) if (!/order/.test(m[1])) err(f, `order가 아닌 정렬: sort(${m[1].slice(0, 60)}`);
}

// 사례(5-4): calc.js를 vm으로 읽어 CY.match로 cases.json을 돌린다. 합친 규칙은 build.mjs와 같은 모양
{
  const vm = await import('node:vm');
  const ctx = {};
  vm.runInNewContext(await read('skin/images/calc.js'), ctx);
  const { schema, ...rest } = tables;
  const rules = { ...rest, loans: loans.products };
  const cases = JSON.parse(await read('rules/cases.json'));
  for (const c of cases.cases) {
    const ans = { ...cases.base, ...c.ans };
    for (const k of Object.keys(ans)) if (ans[k] === null) delete ans[k];
    const rs = ctx.CY.match(rules, ans, cases.today, c.group);
    const orders = rs.map((r) => r.p.order);
    if (orders.some((o, i) => i && o < orders[i - 1])) err(c.name, '결과가 order 순서가 아님');
    for (const [code, e] of Object.entries(c.expect)) {
      const r = rs.find((x) => x.p.code === code), ex = typeof e === 'string' ? { status: e } : e;
      if (!r) { err(c.name, `${code} 결과 없음`); continue; }
      const got = `${code} ${r.status}${r.why ? `(${r.why})` : ''}`;
      if (r.status !== ex.status) { err(c.name, `${code}: ${ex.status} 기대, ${got}`); continue; }
      const L = (r.lines || []).map((l) => l.limit).filter(Boolean);
      if (ex.amt) {
        const lo = Math.max(...L.map((l) => l.lo)), hi = Math.max(...L.map((l) => l.hi)); // 줄 가운데 가장 큰 금액
        if (lo !== ex.amt[0] || hi !== ex.amt[1]) err(c.name, `${code}: 금액 ${ex.amt} 기대, ${lo},${hi}`);
      }
      if (ex.one && !(r.lines || []).some((l) => l.one && l.key === ex.one)) err(c.name, `${code}: ${ex.one} 1인 경로 줄 없음`);
      if (ex.note && !(r.notes || []).some((n) => n.includes(ex.note))) err(c.name, `${code}: 안내에 「${ex.note}」 없음`);
    }
  }
  // DTI 검산(4-5 12): money.mjs principalOf와 같은 값
  for (const [inc, rate, want] of [[2000, 3.10, 23418], [5000, 3.80, 53652], [8400, 2.90, 100905]])
    if (Math.floor((0.6 * inc) / 12 / ctx.CY.pmt1(rate, 30)) !== want) err('DTI 검산', `${inc}만원·${rate}% → ${want} 아님`);
  // 공고 가져오기(16-5): 면적 경계, 대체본 경계, 지역 묶음, 규제 표시, 주택형 표기
  const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  const NF = [
    [{ buyKind: 'apt', region: '경기', regFlags: [] }, { ex: 59.98, top: 48000 }, { buyKind: 'apt', region: 'gyeonggiIncheon', regulated: false, price: 48000, area: 'le60' }],
    [{ buyKind: 'apt', region: '서울', regFlags: ['투기과열'] }, { ex: 84.97, top: 63000 }, { buyKind: 'apt', region: 'seoul', regulated: true, price: 63000, area: '60to85' }],
    [{ buyKind: 'apt', region: '부산', regFlags: null }, { ex: 60, top: 0 }, { buyKind: 'apt', region: 'other', area: 'le60' }],
    [{ buyKind: 'apt', region: '인천', regFlags: null, areaExact: false }, { ex: 60, top: 40000 }, { buyKind: 'apt', region: 'gyeonggiIncheon', price: 40000 }],
    [{ buyKind: 'officetel', region: '경기', regFlags: null }, null, { buyKind: 'officetel', region: 'gyeonggiIncheon' }],
    [{ buyKind: null, region: '대전', regFlags: null }, null, { region: 'other' }],
    [{ buyKind: 'apt', region: '서울', regFlags: [] }, { ex: 100.01, top: 90000 }, { buyKind: 'apt', region: 'seoul', regulated: false, price: 90000, area: 'over100' }],
  ];
  NF.forEach(([n, t, want], i) => { const got = ctx.CY.noticeFill(n, t); if (!same({ ...got }, want)) err(`공고 채우기 ${i}`, JSON.stringify(got)); });
  for (const [ty, want] of [['084.9443A', '84A'], ['066.0000A', '66A'], ['059', '59']]) if (ctx.CY.typeLabel(ty) !== want) err('주택형 표기', `${ty} → ${ctx.CY.typeLabel(ty)}`);
  console.log(`사례 ${cases.cases.length}건 실행`);
}

// 금지 표현(4-5 7, 9-2): 계산기 화면 글자와 규칙의 why·notice·이름
{
  const { BANNED } = await import('../posts/check.mjs');
  const CALC_BANNED = ['대출 가능', '승인', '당첨 가능', '자격 있음', '대상입니다', '통과', '유리', '가장 낮은', '꼭 신청', '최저 금리', '더 많이', '신청하기'];
  const words = [...BANNED, ...CALC_BANNED];
  const texts = [await read('skin/images/calc.js'), JSON.stringify(loans), JSON.stringify(tables.defs)];
  for (const t of texts) for (const w of words) if (t.split('기관추천').join('').includes(w)) err('금지 표현', `「${w}」`);
}

for (const x of warns) console.warn('경고', x);
if (errors.length) { for (const x of errors) console.error('실패', x); process.exit(1); }
console.log(`rules check OK — 상품 ${loans.products.length}개(판정 ${loans.products.filter((p) => p.offer === 'active').length})`);

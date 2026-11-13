// 계산기 2종(skin/images/calc2.js) 점검: node preview/calc2.check.mjs [--shots] — preview/serve.mjs --check가 부른다
// ① 계산 assert(공고문·yearend.md 예시, 구간 경계) ② rules/equity.json·wolse.json 숫자의 문서 행 대조 ③ 미리보기 화면(375px 가로 넘침·오류·결과 값)
// --shots: 화면을 preview/unslop/out/calc2_{계산기}_{폭}.png로 저장. 미리보기 서버(5178)가 떠 있으면 그대로 쓰고, 없으면 잠깐 띄운다
import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');
const ctx = {};
vm.runInNewContext(await read('skin/images/calc2.js'), ctx);
const { CY2 } = ctx; // vm 쪽 배열은 Array.from으로 이 쪽 배열로 바꿔 비교한다(deepStrictEqual은 프로토타입까지 본다)
const EQ = JSON.parse(await read('rules/equity.json')), WS = JSON.parse(await read('rules/wolse.json'));

// ① 지분적립형 — GH 광교 A17(equity.md 6·6-1)
const ex = EQ.example, base = { shares: ex.shares.v, gap: ex.gapYears.v, rate: null, deposit: ex.deposit.v, jeonse: null, convertPct: ex.convertPct.v, convRate: ex.convRate.v };
let r = CY2.equity(EQ, { ...base, price: 650100000 });
assert.deepEqual(Array.from(r.rounds,(x) => x.base), [162525000, 130020000, 130020000, 130020000, 97515000], '59A 1층 회차 대금');
assert.deepEqual(Array.from(r.rounds,(x) => x.pub), [75, 55, 35, 15, 0], '남은 공공지분');
assert.equal(r.total, 650100000, '회차 합계 = 공급가격');
assert.deepEqual([r.dep.c, r.dep.after, r.dep.monthly], [264000000, 66000000, 770000], '3.3억 · 80% · 3.5% → 월 770,000원');
assert.equal(r.rounds[1].extra, null, '가정 금리 없으면 가산이자 없음');
r = CY2.equity(EQ, { ...base, price: 677500000 });
assert.deepEqual(Array.from(r.rounds,(x) => x.base), [169375000, 135500000, 135500000, 135500000, 101625000], '59A 5~9층');
r = CY2.equity(EQ, { ...base, price: 100000000, rate: 3 });
assert.deepEqual(Array.from(r.rounds,(x) => x.extra), [0, 3000000, 6000000, 9000000, 9000000], '가산이자(가정) = 대금 × 3% × 5년·10년…');
r = CY2.equity(EQ, { ...base, price: 650100000, deposit: null, jeonse: 550000000 });
assert.equal(r.rounds[0].cap, 330000000, '전세 평균 5.5억 × 80% × 75% = 3.3억(equity.md 6-1 계산)');
assert.equal(r.dep.D, 330000000, '보증금 비우면 상한을 씀');
assert.equal(r.rounds[4].cap, 0, '마지막 회차 뒤 상한 0');
assert.ok(CY2.equity(EQ, { ...base, price: 1e8, shares: [30, 70] }).errs.length === 0 && CY2.equity(EQ, { ...base, price: 1e8, shares: [30, 70] }).warns.length === 2, '범위 밖 비율은 경고');
assert.ok(CY2.equity(EQ, { ...base, price: 1e8, shares: [25, 25] }).errs.length, '합계 100% 아니면 오류');
assert.ok(CY2.equity(EQ, { ...base, price: 1e8, convertPct: 90 }).warns.length, '전환 80% 넘으면 경고');

// ① 월세 세액공제 — yearend.md 1-4 예시와 1-2 구간 경계(원)
const w = (pay, rent, income = null) => CY2.wolse(WS, { pay, rent, income });
assert.deepEqual([w(40000000, 6000000).rate, w(40000000, 6000000).credit], [17, 1020000], '예시 1: 102만원');
assert.deepEqual([w(65000000, 10800000).base, w(65000000, 10800000).credit, w(65000000, 10800000).over], [10000000, 1500000, 800000], '예시 2: 150만원, 80만원 빠짐');
assert.equal(w(65000000, 7000000).credit, 1050000, '예시 3 세대주: 105만원');
assert.equal(w(55000000, 1e6).rate, 17, '총급여 5,500만원은 17%');
assert.equal(w(55000001, 1e6).rate, 15, '5,500만원 넘으면 15%');
assert.equal(w(80000000, 1e6).rate, 15, '8,000만원은 15%');
assert.equal(w(80000001, 1e6).tier, null, '8,000만원 넘으면 대상 아님');
assert.equal(w(40000000, 1e6, 45000000).rate, 17, '종합소득 4,500만원은 17%');
assert.equal(w(40000000, 1e6, 45000001).rate, 15, '종합소득 4,500만원 넘으면 15%');
assert.equal(w(40000000, 1e6, 70000001).tier, null, '종합소득 7,000만원 넘으면 대상 아님');
assert.equal(w(30000000, 12000000).credit, 1700000, '최대 170만원');
console.log('  calc2 계산 assert 통과');

// ② 문서 행 대조(rules/check.mjs docRow와 같은 규칙: 파일#절#행 첫 칸, text가 그 행 안에)
const docs = {};
async function docRow(ref) {
  const [file, sec, label] = ref.split('#');
  const lines = (docs[file] ??= await read(`docs/policy/${file}`)).split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^#{2,3} ${sec.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}[.\\s]`).test(l));
  assert.ok(start >= 0, `${ref}: 절 없음`);
  const level = lines[start].match(/^#+/)[0].length;
  for (let i = start + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#+) /);
    if (h && h[1].length <= level) break;
    if (lines[i].startsWith(`| ${label}`)) return lines[i];
  }
  assert.fail(`${ref}: 행 없음`);
}
const facts = (o) => (o && typeof o === 'object' ? (o.doc ? [o] : Object.values(o).flatMap(facts)) : []);
for (const f of [...facts(EQ), ...facts(WS)]) {
  const row = await docRow(f.doc);
  for (const t of [].concat(f.text)) assert.ok(row.includes(t), `「${t}」가 ${f.doc} 행에 없음`);
}
assert.ok((await read('docs/policy/yearend.md')).includes(`(${WS.year})`), `yearend.md에 ${WS.year} 없음`);
// text 숫자와 값이 같은지(쉼표·굵게 표시 빼고)
const digits = (t) => t.replace(/[,*]/g, '');
assert.ok(digits(EQ.example.price.text).includes(String(EQ.example.price.v)) && digits(EQ.example.deposit.text).includes(String(EQ.example.deposit.v)) && EQ.jeonseRatio.text.includes(`${EQ.jeonseRatio.v}%`), 'equity text·v 불일치');
for (const t of WS.tiers) assert.ok(digits(t.text.join(' ')).includes(`${t.pay / 1e4}만원`) && digits(t.text.join(' ')).includes(`${t.income / 1e4}만원`) && t.text.join(' ').includes(`${t.rate}%`), `wolse ${t.key} text·v 불일치`);
assert.ok(digits(WS.cap.text).includes(`${WS.cap.v / 1e4}만원`), 'wolse cap text·v 불일치');
console.log('  calc2 값 파일 문서 행 대조 통과');

// ③ 화면
const BASE = 'http://localhost:5178';
const alive = () => fetch(`${BASE}/rules.json`).then((x) => x.ok, () => false);
let server = null;
if (!(await alive())) {
  server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url))], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await alive()); i++) await new Promise((x) => setTimeout(x, 200));
}
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const shots = process.argv.includes('--shots'), OUT = new URL('unslop/out/', import.meta.url);
if (shots) await mkdir(OUT, { recursive: true });
const fails = [];
try {
  for (const [kind, fill, want] of [
    ['equity', { rate: '3' }, ['770,000원', '66,000,000원', '162,525,000원', '149,523,000원', '가정']],
    ['wolse', { pay: '4000', monthly: '50' }, ['1,020,000원', '17%', '6,000,000원', '2026년 귀속']],
  ]) {
    for (const width of [375, 1280]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.route(/^https?:\/\/(?!localhost)/, (x) => x.abort());
      await page.goto(`${BASE}/calc-${kind}`);
      await page.waitForSelector('.cy-calc .cy2-out');
      for (const [k, v] of Object.entries(fill)) await page.fill(`.cy-calc [data-k="${k}"]`, v);
      const text = await page.locator('.cy-calc').innerText();
      for (const t of want) if (!text.includes(t)) fails.push(`${kind} ${width}: 「${t}」 없음`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 0) fails.push(`${kind} ${width}: 가로로 ${over}px 넘침`);
      const small = await page.$$eval('.cy-calc input', (es) => es.filter((e) => e.getBoundingClientRect().height < 44).length);
      if (small) fails.push(`${kind} ${width}: 44px 미만 입력 ${small}개`);
      if (errors.length) fails.push(`${kind} ${width}: ${errors.join(' / ')}`);
      if (shots) await page.addStyleTag({ content: '.cy-remote, .m-tabbar { visibility: hidden !important; }' }); // 화면에 떠 있는 버튼·탭 바가 긴 캡처를 가리지 않게
      if (shots) await page.locator('.cy-calc').screenshot({ path: fileURLToPath(new URL(`calc2_${kind}_${width}.png`, OUT)) });
      await page.close();
    }
  }
  // 계산기 글이 아닌 글에는 그리지 않는다
  const page = await browser.newPage();
  await page.route(/^https?:\/\/(?!localhost)/, (x) => x.abort());
  await page.goto(`${BASE}/post`);
  if (await page.locator('.cy2-out').count()) fails.push('/post에 calc2 계산기가 그려짐');
} finally {
  await browser.close();
  server?.kill();
}
if (fails.length) { console.log(fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log(`  calc2 화면 점검 통과(375·1280px)${shots ? ' — 캡처 preview/unslop/out/calc2_*.png' : ''}`);

// 계산기 화면 점검(설계 5-4): node preview/calc_ui.check.mjs — preview/serve.mjs --check가 부른다
// 미리보기 서버(5178)가 떠 있으면 그대로 쓰고, 없으면 잠깐 띄운다. 금액·상태의 정답은 cases.json이 맡고 여기서는 엔진 결과가 화면에 그대로 나오는지만 본다.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = 'http://localhost:5178';
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };
const alive = () => fetch(`${BASE}/rules.json`).then((r) => r.ok, () => false);

let server = null;
if (!(await alive())) {
  server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url))], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 200));
}

// 공고 표본 3건(16-5): 민영 APT, 국민·공공주택특별법, 신혼희망타운(유형 0), 그리고 대체본 경계·오피스텔·임대
const type = (ty, ex, top, spOk = true) => ({ ty, ex, sa: ex * 1.3, top, gen: 40, sp: 10, spBy: {}, spOk });
const NOTICES = {
  schema: 1,
  n: {
    100: { name: '표본 민영', kind: 'APT', houseKind: '민영', publicLaw: false, regFlags: [], region: '경기', address: '경기도 화성시', buyKind: 'apt', areaExact: true, types: [type('059.9800A', 59.98, 48000), type('084.9700A', 84.97, 63000), type('101.0000A', 101, 90000)] },
    200: { name: '표본 국민', kind: 'APT', houseKind: '국민', publicLaw: true, regFlags: ['투기과열'], region: '서울', address: '서울특별시', buyKind: 'apt', areaExact: true, types: [type('074.0000A', 74, 70000)] },
    300: { name: '표본 신혼희망', kind: 'APT', houseKind: '국민', publicLaw: true, regFlags: null, region: '부산', address: '부산', buyKind: 'apt', areaExact: true, types: [type('046.0000A', 46, 30000, false)] },
    400: { name: '표본 대체본', kind: 'APT', houseKind: '민영', publicLaw: false, regFlags: [], region: '인천', address: '인천', buyKind: 'apt', areaExact: false, types: [type('060', 60, 40000)] },
    500: { name: '표본 오피스텔', kind: '오피스텔', houseKind: null, publicLaw: null, regFlags: null, region: '경기', address: '경기', buyKind: 'officetel', areaExact: true, types: [] },
    600: { name: '표본 민간임대', kind: '공공지원 민간임대', houseKind: null, publicLaw: null, regFlags: null, region: '대전', address: '대전', buyKind: null, areaExact: true, types: [] },
  },
};
const cases = JSON.parse(readFileSync(new URL('../rules/cases.json', import.meta.url), 'utf8'));

const browser = await chromium.launch();
async function open(path, { width = 375, height = 812, routes = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const seen = { requests: [], errors: [] };
  page.on('pageerror', (e) => seen.errors.push(e.message));
  page.on('request', (r) => seen.requests.push({ url: r.url(), method: r.method(), post: r.postData() || '' }));
  // 바깥 광고·통계는 막는다(자기 서버 요청만 본다)
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await page.route('**/notices.json', (r) => (routes.notices ? routes.notices(r) : r.fulfill({ json: NOTICES })));
  if (routes.rules) await page.route('**/rules.json', routes.rules);
  await page.goto(BASE + path);
  return { page, ctx, seen };
}
const q = (page, t) => page.locator('.cy-q', { has: page.locator(`.cy-qt:has-text("${t}")`) }).first();
const pick = (page, t, label) => q(page, t).locator('button', { hasText: label }).first().click();
const fill = (page, t, v) => q(page, t).locator('input').fill(String(v));
const next = (page) => page.click('[data-act=next]');
async function noOverflow(page, where) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(over <= 0, `${where}: 가로로 ${over}px 넘침`);
}
async function targets44(page, where) {
  const small = await page.$$eval('.cy-calc button, .cy-calc input, .cy-calc a, .cy-calc summary', (es) => es.filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.textContent.trim().slice(0, 14)));
  ok(!small.length, `${where}: 44px 미만 ${small.join(', ')}`);
}
// 예시 1 사람을 끝까지 입력
async function walkBuy(page, { price = 70000, region = '경기·인천' } = {}) {
  await next(page);
  await pick(page, '본인·배우자', '모두 없음'); await pick(page, '혼인', '혼인신고 7년 이내'); await noOverflow(page, '질문 2'); await next(page);
  await pick(page, '이미 태어난', '1명'); await pick(page, '2년 안에', '있음'); await next(page);
  await fill(page, '만 나이', 34); await pick(page, '등본상', '세대주'); await fill(page, '같은 등본', 3); await next(page);
  await fill(page, '본인', 4800); await fill(page, '배우자', 3600); await pick(page, '세대 순자산', '3.45억~5.11억원'); await next(page);
  if (price) await fill(page, '집값', price);
  await pick(page, '어떤 집', '아파트'); await pick(page, '전용', '60~85㎡'); await targets44(page, '질문 집값'); await next(page);
  if (region) await pick(page, '집이 있는', region);
  await pick(page, '지금 쓰는', '없음'); await next(page);
}

try {
  // ① 버튼: 분석 글이면 공고 번호, 휴대폰은 탭 바 위, 계산기 페이지엔 없음
  {
    const { page, ctx } = await open('/post-analysis');
    const a = page.locator('a.cy-remote');
    ok((await a.getAttribute('href')) === '/calc#n=2026000496', `분석 글 버튼 주소 ${await a.getAttribute('href')}`);
    const r = await a.boundingBox(), bar = await page.locator('.m-tabbar').boundingBox();
    ok(r.y + r.height <= bar.y, '휴대폰: 버튼이 탭 바와 겹침');
    ok(r.height >= 44, '버튼 높이 44px 미만');
    await ctx.close();
    const c = await open('/calc');
    ok((await c.page.locator('a.cy-remote').count()) === 0, '계산기 페이지에 버튼이 있음');
    await c.ctx.close();
    const d = await open('/post-analysis', { width: 1280, height: 800 });
    const rd = await d.page.locator('a.cy-remote').boundingBox();
    // 실제 블로그의 티스토리 「구독하기」 도구 막대가 화면 아래 20~50px를 덮는다(미리보기에는 없다) — 그 위에 있어야 한다
    ok(rd.x + rd.width <= 1280 - 16 + 0.5 && rd.y + rd.height <= 800 - 50, `PC: 버튼이 도구 막대 자리와 겹침 ${rd.y + rd.height}`);
    await d.ctx.close();
    const h = await open('/');
    ok((await h.page.locator('a.cy-remote').getAttribute('href')) === '/calc', '홈 버튼 주소');
    await h.ctx.close();
  }
  // ② 달력 지역 시트(z-index 60) 아래로 버튼이 덮인다
  {
    const { page, ctx } = await open('/category/청약일정');
    await page.waitForSelector('.m-region');
    await page.click('.m-region');
    await page.waitForSelector('.filter.open');
    const under = await page.evaluate(() => { const b = document.querySelector('a.cy-remote').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !(e && e.closest('.cy-remote')); });
    ok(under, '지역 시트가 열려도 버튼이 위에 있음');
    await ctx.close();
  }
  // ③ 질문 → 결과: 엔진 결과가 화면과 같은지, 저장·전송·form 없음
  {
    const { page, ctx, seen } = await open('/calc#calc=loan&t=buy');
    await page.waitForSelector('[data-act=next]');
    ok((await page.locator('[data-v=buy]').getAttribute('aria-pressed')) === 'true', '#t=buy 미리 선택');
    ok(!seen.requests.some((r) => r.url.includes('notices.json')), '#n= 없이 notices.json을 받음');
    ok((await page.locator('.cy-calc form').count()) === 0, 'form이 있음');
    const before = seen.requests.length, urlBefore = page.url();
    const storeBefore = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage, document.cookie]));
    await walkBuy(page);
    const after = seen.requests.slice(before);
    ok(!after.some((r) => r.method !== 'GET' || /4800|3600|70000/.test(r.url + r.post)), `입력값이 요청에 실림: ${after.map((r) => r.url).join(', ')}`);
    ok(after.length === 0, `질문 중 요청 ${after.length}건`);
    ok(page.url() === urlBefore, '주소가 바뀜');
    ok((await page.evaluate(() => JSON.stringify([localStorage, sessionStorage, document.cookie]))) === storeBefore, '저장소·쿠키가 바뀜');
    // 엔진과 화면 대조
    const ans = { ...cases.base, ...cases.cases[0].ans };
    const eng = await page.evaluate(async ([a, today]) => {
      const rules = await fetch('/rules.json').then((r) => r.json());
      return window.CY.match(rules, a, today, 'buy').filter((r) => r.status === 'ok' || r.status === 'check').map((r) => ({ code: r.p.code, st: r.status, amt: r.lines.map((l) => l.limit && window.CY.man(l.limit.hi)) }));
    }, [ans, new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)]);
    const cards = await page.$$eval('.cy-card', (es) => es.map((e) => ({ code: e.dataset.p, st: e.className.includes('is-ok') ? 'ok' : 'check', txt: e.innerText })));
    ok(JSON.stringify(cards.map((c) => [c.code, c.st])) === JSON.stringify(eng.map((c) => [c.code, c.st])), `카드와 엔진이 다름 ${JSON.stringify(cards.map((c) => c.code))}`);
    eng.forEach((e, i) => e.amt.filter(Boolean).forEach((m) => ok(cards[i]?.txt.includes(m), `${e.code} 카드에 ${m} 없음`)));
    ok((await page.locator('.cy-live').textContent()).includes('공통 요건 충족'), '요약 알림 없음');
    ok((await page.locator('.cy-card .cy-st').first().textContent()).length > 2, '상태가 글자로 없음');
    // 순서: 상품 번호 순
    const orders = await page.$$eval('.cy-card', (es) => es.map((e) => e.dataset.p));
    ok(JSON.stringify(orders) === JSON.stringify([...orders].sort()), `카드 순서 ${orders}`);
    // 펼침 안 글자, 금지 표현
    await page.$$eval('.cy-calc details', (ds) => ds.forEach((d) => { d.open = true; }));
    const text = await page.locator('.cy-calc').innerText();
    for (const w of ['대출 가능', '승인', '추천', '신청하기', '유리', '통과']) ok(!text.includes(w), `화면에 금지 표현 「${w}」`);
    ok(!/undefined|NaN|null/.test(text), '화면에 undefined·NaN·null');
    await noOverflow(page, '결과'); await targets44(page, '결과');
    // 진짜 마우스: 숫자 칸을 고친 뒤 바로 다른 버튼
    await fill(page, '다른 대출', 123);
    const box = await q(page, '규제지역').locator('button', { hasText: '아니오' }).boundingBox();
    await page.mouse.click(box.x + 5, box.y + 5);
    await page.waitForTimeout(50);
    ok((await q(page, '규제지역').locator('button', { hasText: '아니오' }).getAttribute('aria-pressed')) === 'true', '숫자 칸 뒤 첫 클릭이 사라짐');
    ok((await page.locator('input[data-f=otherInterest]').inputValue()) === '123', '숫자 칸 값이 사라짐');
    // 다시 하기: 답이 지워진다(공고 없음)
    await page.click('[data-act=reset]');
    await next(page);
    ok((await page.locator('.cy-opt[aria-pressed=true]').count()) === 0, '다시 하기 뒤 답이 남음');
    ok(!seen.errors.length, `스크립트 오류 ${seen.errors}`);
    await ctx.close();
  }
  // ③-2 전세 + 구입 둘 다: 카드가 여럿일 때 상품 번호 순, 집 칸은 구입·전세 따로
  {
    const { page, ctx } = await open('/calc#calc=loan&t=jeonse');
    await page.waitForSelector('[data-act=next]');
    await page.click('[data-v=buy]');
    await next(page);
    await pick(page, '본인·배우자', '모두 없음'); await pick(page, '혼인', '미혼'); await next(page);
    await pick(page, '이미 태어난', '0명'); await pick(page, '2년 안에', '없음'); await next(page);
    await fill(page, '만 나이', 33); await pick(page, '등본상', '세대주'); await fill(page, '같은 등본', 1); await next(page);
    await fill(page, '본인', 3200); await pick(page, '세대 순자산', '3.45억원 이하'); await next(page);
    await fill(page, '집값', 28000); await pick(page, '어떤 집', '아파트'); await pick(page, '전용', '60㎡ 이하'); await next(page);
    await pick(page, '집이 있는', '그 밖 지역'); await pick(page, '지금 쓰는', '없음'); await next(page);
    await fill(page, '보증금', 9000); await pick(page, '신규', '신규 계약'); await next(page);
    // 전세 집은 구입 집과 따로 묻는다(앞 답이 눌려 있지 않아야 한다)
    ok((await q(page, '전용').locator('[aria-pressed=true]').count()) === 0, '전세 면적이 구입 답을 물려받음');
    await pick(page, '전용', '60㎡ 이하'); await pick(page, '집이 있는', '경기·인천'); await pick(page, '지금 쓰는', '없음'); await next(page);
    const codes = await page.$$eval('.cy-card', (es) => es.map((e) => e.dataset.p));
    ok(codes.length >= 3, `카드가 적음 ${codes}`);
    const order = await page.evaluate(async (cs) => { const r = await fetch('/rules.json').then((x) => x.json()); return cs.map((c) => r.loans.find((p) => p.code === c).order); }, codes);
    ok(order.every((o, i) => !i || o > order[i - 1]), `카드가 order 순서가 아님 ${codes}`);
    ok((await page.locator('.cy-group h3').allInnerTexts()).join().includes('집 살 때'), '구입 묶음 없음');
    ok((await page.locator('.cy-group').count()) === 2, '묶음 2개가 아님');
    await noOverflow(page, '구입+전세 결과');
    await ctx.close();
  }
  // ④ 공고: 묻기 → 주택형 → 채움(면적 경계·규제·집값), 고친 칸 유지, 빼기
  {
    const { page, ctx, seen } = await open('/calc#n=100');
    await page.waitForSelector('[data-act=nyes]');
    ok(seen.requests.some((r) => r.url.includes('notices.json')), '#n=인데 notices.json을 받지 않음');
    await page.click('[data-act=nyes]');
    const rows = await page.locator('[data-act=ntype]').allInnerTexts();
    ok(rows[0].startsWith('59A') && rows[1].startsWith('84A') && rows[2].startsWith('101A') && rows[3].includes('못 정했'), `주택형 순서 ${rows}`);
    await page.click('[data-act=ntype][data-i="1"]');
    const bar = await page.locator('.cy-nbar').innerText();
    for (const w of ['표본 민영', '84A', '집 살 때', '아파트', '60~85㎡', '경기·인천', '6억 3,000만원', '규제지역 아님']) ok(bar.includes(w), `공고 줄에 「${w}」 없음`);
    await walkBuy(page, { price: 0, region: null });
    ok((await page.locator('.cy-sum').count()) === 1, '공고로 결과까지 못 감');
    ok(/집값 6억 3,000만원/.test(await page.locator('.cy-nbar').innerText()), '결과에 공고 집값 없음');
    ok((await q(page, '규제지역').locator('button', { hasText: '아니오' }).getAttribute('aria-pressed')) === 'true', '규제 값이 안 채워짐');
    await page.click('[data-act=nchange]');
    await page.click('[data-act=ntype][data-i="0"]');
    const bar2 = await page.locator('.cy-nbar').innerText();
    ok(bar2.includes('59A'), '주택형 바꾸기');
    ok(!bar2.includes('60~85㎡'), '직접 누른 면적이 공고 값으로 표시됨');
    ok(bar2.includes('4억 8,000만원'), `주택형을 바꿔도 집값이 그대로: ${bar2}`);
    // 사람이 고친 집값은 주택형을 바꿔도 공고 값으로 덮지 않는다
    await page.click('[data-act=edit]');
    for (let i = 0; i < 4; i++) await next(page);
    await fill(page, '집값', 55555);
    await page.click('[data-act=nchange]');
    await page.click('[data-act=ntype][data-i="1"]');
    ok((await page.locator('input[data-f=price]').inputValue()) === '55555', '사람이 고친 집값을 공고 값으로 덮음');
    ok((await q(page, '집값').locator('.cy-tag').count()) === 0, '사람이 고친 집값에 공고 표시');
    await page.click('[data-act=nremove]');
    ok((await page.locator('input[data-f=price]').inputValue()) === '55555', '공고 빼기가 사람이 고친 집값까지 지움');
    ok((await page.locator('[data-act=noffer]').count()) === 1, '공고 빼기 뒤 채우기 줄 없음');
    ok(!seen.errors.length, `공고 스크립트 오류 ${seen.errors}`);
    await ctx.close();
    // 번호별: 하나짜리·유형 0·대체본 경계·오피스텔·임대
    const go = async (no) => { const o = await open(`/calc#n=${no}`); await o.page.waitForSelector('[data-act=nyes]'); return o; };
    let o = await go(200);
    await o.page.click('[data-act=nyes]');
    let t = await o.page.locator('.cy-nbar').innerText();
    ok(t.includes('공공주택특별법') && t.includes('서울') && t.includes('규제지역('), `국민 공고 줄 ${t}`);
    await o.ctx.close();
    o = await go(300);
    await o.page.click('[data-act=nyes]');
    t = await o.page.locator('.cy-nbar').innerText();
    ok(!t.includes('규제지역'), '규제 모름인데 채움');
    await o.ctx.close();
    o = await go(400);
    await o.page.click('[data-act=nyes]');
    t = await o.page.locator('.cy-nbar').innerText();
    ok(!/60㎡|60~85/.test(t), `대체본 60㎡ 경계를 채움: ${t}`);
    await o.ctx.close();
    o = await go(500);
    ok((await o.page.locator('.cy-calc').innerText()).includes('지역·주택 종류를'), '오피스텔 묻는 문구');
    await o.page.click('[data-act=nyes]');
    t = await o.page.locator('.cy-nbar').innerText();
    ok(t.includes('주거용 오피스텔') && !t.includes('집값'), `오피스텔 공고 줄 ${t}`);
    await o.ctx.close();
    o = await go(600);
    ok((await o.page.locator('.cy-calc').innerText()).includes('지역을 채워'), '임대 묻는 문구');
    await o.page.click('[data-act=nyes]');
    await walkBuy(o.page, { price: 50000, region: null });
    ok(!(await o.page.locator('.cy-calc').innerText()).includes('분양받는 집이에요'), '임대 공고에 분양 문구');
    await o.ctx.close();
    // 아니요 → 채우기 줄 → 예
    o = await go(100);
    await o.page.click('[data-act=nno]');
    await o.page.click('[data-act=noffer]');
    ok((await o.page.locator('[data-act=ntype]').count()) === 4, '채우기 줄에서 주택형 고르기');
    await o.ctx.close();
  }
  // ⑤ 실패: 공고 파일 실패·없는 번호는 묻지 않고 빈 계산기, 규칙 실패·다른 schema는 안내만
  {
    let o = await open('/calc#n=100', { routes: { notices: (r) => r.fulfill({ status: 404, body: '' }) } });
    await o.page.waitForSelector('[data-act=next]');
    ok((await o.page.locator('[data-act=nyes]').count()) === 0, '공고 404인데 물음');
    await o.ctx.close();
    o = await open('/calc#n=100', { routes: { notices: (r) => r.fulfill({ status: 200, body: '{not json' }) } });
    await o.page.waitForSelector('[data-act=next]');
    await o.ctx.close();
    o = await open('/calc#n=999');
    await o.page.waitForSelector('[data-act=next]');
    ok((await o.page.locator('[data-act=nyes]').count()) === 0, '없는 번호인데 물음');
    await o.ctx.close();
    o = await open('/calc', { routes: { rules: (r) => r.fulfill({ status: 500, body: '' }) } });
    await o.page.waitForSelector('.cy-calc-fail');
    ok((await o.page.locator('.post-body table').count()) > 0 || (await o.page.locator('.post-body').count()) > 0, '규칙 실패 때 본문이 사라짐');
    await o.ctx.close();
    o = await open('/calc', { routes: { rules: (r) => r.fulfill({ json: { schema: 2, loans: [] } }) } });
    await o.page.waitForSelector('.cy-calc-fail');
    await o.ctx.close();
  }
  // ⑥ 키보드: 다음을 누르면 화면 머리로 포커스, 답한 질문이 사라지면 카드 제목으로
  {
    const { page, ctx } = await open('/calc#calc=loan&t=buy');
    await page.waitForSelector('[data-act=next]');
    await page.focus('[data-act=next]');
    await page.keyboard.press('Enter');
    ok(await page.evaluate(() => document.activeElement.classList.contains('cy-prog')), '다음 뒤 포커스');
    await page.goBack().catch(() => {});
    await ctx.close();
  }
} catch (e) {
  fails.push(`점검 중단: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  if (server) server.kill();
}
for (const f of fails) console.log('  ✗ ' + f);
if (fails.length) process.exit(1);
console.log('  계산기 화면 점검 통과');

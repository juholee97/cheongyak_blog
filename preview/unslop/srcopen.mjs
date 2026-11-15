// 달력 페이지 「이번 주 남은 접수」 줄 → 상세 창 + 창 버튼 글자 한 줄 점검·미리보기(2026-11-16).
// 먼저 node preview/serve.mjs 를 띄워 두고: node preview/unslop/srcopen.mjs [출력 폴더]   (기본 preview/out/srcopen_20261116)
// 일정·우리의 집 링크는 modal3.mjs처럼 배포본(github.io)을 받아 쓰고, 못 받으면 저장소 파일(site/schedule.json·crawler/auleezip_links.json)을 읽는다.
// 브라우저는 localhost(미리보기 서버)와 글꼴 CDN 말고는 막는다 — 티스토리에 접속하지 않는다. 마지막 줄 ALL OK / FAIL, 실패면 종료 코드 1.
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = process.argv[2] || join(ROOT, 'preview', 'out', 'srcopen_20261116');
const BASE = 'http://localhost:5178', CAL = BASE + '/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95', PAGES = 'https://juholee97.github.io/cheongyak_blog/';
await mkdir(OUT, { recursive: true });

async function load(name, local) {
  try {
    const r = await fetch(PAGES + name, { signal: AbortSignal.timeout(10000) });
    if (r.ok) return [await r.json(), '배포본'];
  } catch { /* 저장소 파일로 */ }
  return [JSON.parse(await readFile(join(ROOT, local), 'utf8')), local];
}
const [sched, schedFrom] = await load('schedule.json', 'site/schedule.json');
const [links, linksFrom] = await load('auleezip_links.json', 'crawler/auleezip_links.json');
console.log(`일정 ${sched.items.length}건(${schedFrom}, ${sched.updatedAt}) · 우리의 집 링크 ${Object.keys(links).length}개(${linksFrom})`);

// 화면(calendar.js·todo.js)과 같은 규칙으로 공고별 버튼 수와 셋째 칸 이름을 미리 계산해 고를 공고를 정한다
const byId = Object.fromEntries(sched.items.map((it) => [it.id, it]));
const http = (u) => /^https?:\/\//i.test(u || '');
const wpOf = (it) => {
  const id = String(it.id), k = /^\d+-\d+$/.test(id) ? id.split('-')[0] : id;
  const m = /^https:\/\/auleezip\.com\/(deep|apt)-[\w-]+\/$/.exec(String(links[k] || ''));
  return m ? (m[1] === 'deep' ? '이 단지 심층 분석' : '이 단지 주변 시세 비교') : '';
};
const nBtns = (it) => +http(it.applyhomeUrl) + +http(it.homepageUrl) + +!!wpOf(it);

// 버튼 라벨(calendar.js renderModal·todo.js wpLink). 조합 점검에 쓴다
const GO = ['청약홈 게시글 보기', 'LH청약플러스 공고', 'SH 공고 원문', '청년안심주택 공고'];
const HOME = ['', '분양 홈페이지', 'SH 홈페이지', '청약신청 페이지'];
const WP = ['', '이 단지 심층 분석', '이 단지 주변 시세 비교'];

const b = await chromium.launch();
let bad = 0;
const fail = (msg) => { bad++; console.log('  ✗ ' + msg); };

// 창 버튼 측정: 글자 줄 수(Range 줄 상자), 높이·너비, 넘침
const measure = (p) => p.evaluate(() => [...document.querySelectorAll('.modal-btns a')].map((a) => {
  const r = document.createRange(); r.selectNodeContents(a);
  const lines = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
  const q = a.getBoundingClientRect();
  return { text: a.textContent, cls: a.className, w: Math.round(q.width * 10) / 10, h: Math.round(q.height * 10) / 10, top: Math.round(q.top), lines, over: a.scrollWidth > a.clientWidth + 1 };
}));
function checkBtns(tag, w, btns, firstWant) {
  console.log(`  ${tag} 버튼: ` + btns.map((x) => `「${x.text}」${x.w}×${x.h}${x.lines > 1 ? ' 줄바꿈!' : ''}`).join(' · '));
  for (const x of btns) {
    if (x.lines !== 1 || x.over) fail(`${w} ${tag} 「${x.text}」 글자 ${x.lines}줄${x.over ? ', 넘침' : ''}`);
    if (w > 700 ? x.h > 46 : x.h !== 48) fail(`${w} ${tag} 「${x.text}」 높이 ${x.h}(한 줄 높이 아님)`);
  }
  if (firstWant && btns[0]?.text !== firstWant) fail(`${w} ${tag} 첫 버튼 「${btns[0]?.text}」 ≠ 「${firstWant}」`);
}

// 목록 줄을 눌러 창 열기 → 제목·이동 없음 확인 → (찍기) → 닫고 칸 스크롤 그대로인지
async function openRow(p, ctx, w, id, tag, shot, firstWant) {
  const row = p.locator(`.src-list .hero-row[data-id="${id}"]`);
  const name = (await row.locator('.name').textContent()).trim();
  await row.scrollIntoViewIfNeeded(); // 칸 안·화면 스크롤은 누르기 전에 끝낸다
  // 줄을 화면 가운데로(휴대폰 아래 탭 바에 가리지 않게). 칸 안 스크롤은 건드리지 않는다
  await row.evaluate((r) => { const q = r.getBoundingClientRect(); window.scrollBy(0, q.top + q.height / 2 - innerHeight / 2); });
  await p.mouse.move(0, 0);
  await p.waitForTimeout(100);
  if (!(await row.evaluate((r) => { const q = r.getBoundingClientRect(); return r.contains(document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)); }))) fail(`${w} ${tag} 줄 가운데가 다른 요소에 가림`);
  const before = await p.evaluate((id) => { const r = document.querySelector(`.src-list .hero-row[data-id="${CSS.escape(id)}"]`).closest('.src-rows'); return { box: r.scrollTop, win: Math.round(scrollY), url: location.href }; }, id);
  const pages = ctx.pages().length;
  let navs = 0; const nav = (f) => { if (f === p.mainFrame()) navs++; }; p.on('framenavigated', nav);
  const bb = await row.boundingBox();
  await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const opened = await p.waitForSelector('.overlay .modal', { timeout: 3000 }).then(() => true, () => false);
  await p.waitForTimeout(300);
  if (!opened) { fail(`${w} ${tag} 줄을 눌러도 창이 안 뜸`); p.off('framenavigated', nav); return; }
  const title = (await p.locator('.modal .modal-name').textContent()).trim();
  const url = await p.evaluate(() => location.href);
  console.log(`  ${tag} ${id} 「${name}」 → 창 「${title}」`);
  if (title !== name) fail(`${w} ${tag} 창 제목 「${title}」 ≠ 줄 이름 「${name}」`);
  if (ctx.pages().length !== pages || navs || url !== before.url) fail(`${w} ${tag} 새 탭 또는 페이지 이동 발생`);
  const btns = await measure(p);
  checkBtns(tag, w, btns, firstWant);
  if (shot) {
    await p.evaluate(() => { const m = document.querySelector('.modal'), r = m.getBoundingClientRect(), bt = document.querySelector('.modal-btns').getBoundingClientRect(); if (bt.bottom > r.bottom) m.scrollTop += bt.bottom - r.bottom + 16; });
    await p.waitForTimeout(150);
    await p.screenshot({ path: join(OUT, shot) });
  }
  await p.locator('.modal-close').click();
  await p.waitForTimeout(250);
  const after = await p.evaluate((id) => { const r = document.querySelector(`.src-list .hero-row[data-id="${CSS.escape(id)}"]`).closest('.src-rows'); return { box: r.scrollTop, win: Math.round(scrollY), modal: !!document.querySelector('.overlay') }; }, id);
  if (after.modal) fail(`${w} ${tag} 창이 안 닫힘`);
  if (after.box !== before.box) fail(`${w} ${tag} 닫은 뒤 칸 스크롤 ${before.box} → ${after.box}`);
  if (after.win !== before.win) console.log(`  (참고) ${tag} 닫은 뒤 화면 스크롤 ${before.win} → ${after.win}`);
  console.log(`  ${tag} 닫은 뒤 칸 스크롤 ${before.box} → ${after.box}`);
  p.off('framenavigated', nav);
  return btns;
}

try {
  for (const [w, h] of [[1280, 900], [375, 812]]) {
    console.log(`== ${w}px`);
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route(/^https?:\/\/(?!localhost|cdn\.jsdelivr\.net)/, (x) => x.abort());
    await p.route('**/schedule.json', (x) => x.fulfill({ json: sched }));
    await p.route('**/auleezip_links.json', (x) => x.fulfill({ json: links }));
    await p.goto(CAL);
    await p.waitForSelector('.src-rows .hero-row', { timeout: 15000 });
    await p.waitForTimeout(800);

    // 1. 목록 4칸: 줄은 버튼, 버튼 기본 모양(배경·옆 테두리·가운데 정렬) 없음
    const look = await p.evaluate(() => [...document.querySelectorAll('.src-list .hero-row')].map((r) => { const s = getComputedStyle(r); return [r.tagName, r.dataset.act, s.backgroundColor, s.borderLeftWidth, s.borderBottomWidth, s.textAlign, s.display, Math.round(r.getBoundingClientRect().width) === Math.round(r.parentElement.clientWidth)].join('|'); }));
    const groups = await p.evaluate(() => [...document.querySelectorAll('.src-list .hero-group')].map((g) => g.id + ' ' + g.querySelectorAll('.hero-row').length + '줄'));
    console.log('  목록 ' + groups.join(' · '));
    const odd = look.filter((x) => x !== 'BUTTON|open|rgba(0, 0, 0, 0)|0px|0px|left|grid|true');
    if (!look.length || odd.length) fail(`${w} 목록 줄 모양 다름: ${odd[0] || '줄 없음'}`);
    await p.mouse.move(0, 0);
    await p.locator('.src-list').screenshot({ path: join(OUT, `1_srclist_${w}.png`) });

    const ids = async (g) => p.$$eval(`#src-${g} .hero-row`, (bs) => bs.map((x) => x.dataset.id));
    const lh = await ids('lh'), ah = await ids('applyhome'), all = await p.$$eval('.src-list .hero-row', (bs) => bs.map((x) => x.dataset.id));

    // 2. LH 칸: 칸 안을 조금 내려 둔 채 화면에 다 보이는 줄을 누른다(닫은 뒤 스크롤 유지 확인)
    if (!lh.length) fail(`${w} 이번 주 LH 줄 없음`);
    else {
      await p.locator('#src-lh').scrollIntoViewIfNeeded();
      const pick = await p.evaluate(() => {
        const box = document.querySelector('#src-lh .src-rows');
        if (box.scrollHeight > box.clientHeight) box.scrollTop = Math.min(120, box.scrollHeight - box.clientHeight);
        const bb = box.getBoundingClientRect();
        const r = [...box.querySelectorAll('.hero-row')].find((x) => { const q = x.getBoundingClientRect(); return q.top >= bb.top && q.bottom <= bb.bottom; });
        return r && r.dataset.id;
      });
      await openRow(p, ctx, w, pick || lh[0], 'LH', `2_lh_${w}.png`, 'LH청약플러스 공고');
    }

    // 3. 청약홈 칸: 셋째 칸 「이 단지 주변 시세 비교」(가장 긴 라벨)·「이 단지 심층 분석」
    for (const [k, label] of [['apt', '이 단지 주변 시세 비교'], ['deep', '이 단지 심층 분석']]) {
      let id = ah.find((x) => wpOf(byId[x]) === label), via = '청약홈 칸';
      if (!id) { id = all.find((x) => wpOf(byId[x]) === label); via = '다른 칸(청약홈 칸에 없음)'; }
      if (!id) { fail(`${w} 이번 주 목록에 「${label}」 공고 없음`); continue; }
      const it = byId[id], first = it.kind === '청년안심주택' ? '청년안심주택 공고' : it.source === 'lh' ? 'LH청약플러스 공고' : it.source === 'sh' ? 'SH 공고 원문' : '청약홈 게시글 보기';
      console.log(`  3${k === 'apt' ? 'a' : 'b'} ${via}`);
      const btns = await openRow(p, ctx, w, id, '청약홈 ' + k, `3${k === 'apt' ? 'a' : 'b'}_applyhome_${k}_${w}.png`, http(it.applyhomeUrl) ? first : '');
      if (btns && btns[btns.length - 1].text !== label) fail(`${w} 셋째 칸 「${btns[btns.length - 1].text}」 ≠ 「${label}」`);
    }

    // 4. 버튼이 2개뿐인 공고(청약홈 칸 먼저)
    const two = ah.find((x) => nBtns(byId[x]) === 2) || all.find((x) => nBtns(byId[x]) === 2);
    if (!two) fail(`${w} 이번 주 목록에 버튼 2개 공고 없음`);
    else await openRow(p, ctx, w, two, '버튼 2개', `4_two_buttons_${w}.png`, '');

    // 5. 달력 필터가 꺼 둔 공고: 줄의 시·도를 필터에서 끄고 「달력 필터 적용」을 끈 목록에서 눌러도 창이 열린다
    if (w > 700 && lh.length) {
      const reg = byId[lh[0]].region;
      await p.click(`.filter [data-act=region][data-r="${reg}"]`);
      await p.waitForTimeout(300);
      if (await p.locator(`.src-list .hero-row[data-id="${lh[0]}"]`).count()) fail(`${w} 필터로 끈 ${reg} 공고가 목록에 남음`);
      await p.click('.src-toggle'); await p.waitForTimeout(300);
      console.log(`  필터: ${reg} 끔 + 「달력 필터 적용」 끔`);
      await openRow(p, ctx, w, lh[0], '필터 밖', `5_filtered_off_${w}.png`, '');
    }

    // 6. 라벨 조합 전부(첫 칸 4 × 둘째 칸 없음·3 × 셋째 칸 없음·2): 창 버튼 줄에 바꿔 넣고 글자 줄바꿈 확인
    await p.locator(`.src-list .hero-row[data-id="${two || all[0]}"]`).scrollIntoViewIfNeeded();
    await p.locator(`.src-list .hero-row[data-id="${two || all[0]}"]`).click();
    await p.waitForSelector('.overlay .modal');
    let combos = 0, worst = null;
    for (const g of GO) for (const hm of HOME) for (const wp of WP) {
      await p.evaluate(([g, hm, wp]) => {
        document.querySelector('.modal-btns').innerHTML = '<a class="go" href="#">' + g + '</a>' + (hm ? '<a href="#">' + hm + '</a>' : '') + '<span data-ref="wpslot">' + (wp ? '<a class="wp" href="#">' + wp + '</a>' : '') + '</span>';
      }, [g, hm, wp]);
      const m = await measure(p);
      combos++;
      const rows = new Set(m.map((x) => x.top)).size;
      if (!worst || rows > worst.rows) worst = { rows, labels: [g, hm, wp].filter(Boolean).join(' / ') };
      for (const x of m) if (x.lines !== 1 || x.over || (w > 700 ? x.h > 46 : x.h !== 48)) fail(`${w} 조합 [${g} / ${hm} / ${wp}] 「${x.text}」 ${x.lines}줄 ${x.h}px`);
    }
    console.log(`  라벨 조합 ${combos}가지 글자 한 줄 확인, 버튼 줄 수 최대 ${worst.rows}줄(${worst.labels})`);
    if (errs.length) fail(`${w} 페이지 오류: ${errs.join(' / ')}`);
    await ctx.close();
  }
} finally { await b.close(); }
console.log(`캡처: ${OUT}`);
console.log(bad ? 'FAIL' : 'ALL OK');
process.exitCode = bad ? 1 : 0;

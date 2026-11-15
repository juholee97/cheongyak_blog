// 달력 상세 창 3버튼 + 자격 확인 리모콘 미리보기·점검. node preview/unslop/modal3.mjs [출력 폴더]   (기본 preview/out/modal3)
// 마지막 줄 ALL OK / FAIL, 실패면 종료 코드 1
import { chromium } from 'playwright';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const OUT = process.argv[2] || join(fileURLToPath(new URL('../..', import.meta.url)), 'preview', 'out', 'modal3');
await mkdir(OUT, { recursive: true });
const BASE = 'http://localhost:5178', PAGES = 'https://juholee97.github.io/cheongyak_blog/';
const sched = await (await fetch(PAGES + 'schedule.json')).json();
const links = await (await fetch(PAGES + 'auleezip_links.json')).json();
// 장부 열쇠는 calendar.js postLink와 같다: 청약홈은 앞 공고번호, lh-·youth- 등은 id 전체
const keyOf = (it) => (/^\d+-\d+$/.test(it.id) ? it.id.split('-')[0] : it.id);
const hasLink = (it) => Object.prototype.hasOwnProperty.call(links, keyOf(it));
const withWp = sched.items.find((it) => /^\d+-\d+$/.test(it.id) && /\/deep-/.test(links[keyOf(it)] || '') && it.homepageUrl);
// 글 없는 공고: 장부에 주소가 없는 청년안심주택 공고(없으면 장부에 없는 아무 공고)
const noWp = sched.items.find((it) => /^youth-/.test(it.id) && !hasLink(it)) || sched.items.find((it) => !hasLink(it));
const b = await chromium.launch();
let bad = 0;
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) for (const [tag, it] of [['wp', withWp], ['youth', noWp]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route(/^https?:\/\/(?!localhost|cdn\.jsdelivr\.net)/, (x) => x.abort());
    await p.route('**/schedule.json', (x) => x.fulfill({ json: sched }));
    await p.route('**/auleezip_links.json', (x) => x.fulfill({ json: links }));
    await p.goto(BASE + '/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95#todo=' + encodeURIComponent(it.id));
    await p.waitForSelector('.modal .modal-btns', { timeout: 15000 });
    await p.waitForTimeout(600);
    const st = await p.evaluate(() => {
      const vis = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
      const r = document.querySelector('.modal-remote'), c = document.querySelector('.modal-calc'), m = document.querySelector('.modal');
      return { btns: [...document.querySelectorAll('.modal-btns a')].map((a) => a.textContent), remote: vis(r) && r.getAttribute('href'), calc: vis(c) && c.getAttribute('href'),
        remoteRight: r && vis(r) ? Math.round(r.getBoundingClientRect().left - m.getBoundingClientRect().right) : null, over: document.documentElement.scrollWidth - innerWidth };
    });
    console.log(w, tag, it.id, JSON.stringify(st), errs.join(' / '));
    const want = tag === 'wp' ? 3 : 2;
    if (st.btns.length !== want || st.over > 0 || errs.length || (w > 700 ? !st.remote || st.calc : st.remote || !st.calc)) bad++;
    if (tag === 'wp' && !(w > 700 ? st.remote : st.calc).includes('#n=' + it.id.split('-')[0])) bad++;
    st.globalRemote = await p.evaluate(() => { const g = document.querySelector('.cy-remote'); return !!g && getComputedStyle(g).display !== 'none'; });
    if (st.globalRemote) { console.log('global remote visible'); bad++; }
    await p.evaluate(() => { const m = document.querySelector('.modal'); m.scrollTop = m.scrollHeight; });
    await p.waitForTimeout(200);
    await p.screenshot({ path: join(OUT, `modal3_${tag}_${w}.png`) });
    await p.close();
  }
  // 장부 주소가 한글 키워드 슬러그여도(날 한글·%인코딩, 2026-11-16) 셋째 칸 「이 단지 심층 분석」, href는 주소 그대로 + utm
  const KO = '고양창릉-지분적립형-분양가';
  for (const url of ['https://auleezip.com/' + KO + '/', 'https://auleezip.com/' + encodeURIComponent(KO) + '/']) {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route(/^https?:\/\/(?!localhost|cdn\.jsdelivr\.net)/, (x) => x.abort());
    await p.route('**/schedule.json', (x) => x.fulfill({ json: sched }));
    await p.route('**/auleezip_links.json', (x) => x.fulfill({ json: { ...links, [keyOf(withWp)]: url } }));
    await p.goto(BASE + '/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95#todo=' + encodeURIComponent(withWp.id));
    await p.waitForSelector('.modal .modal-btns a.wp', { timeout: 15000 }).catch(() => {});
    const wp = await p.evaluate(() => { const a = document.querySelector('.modal-btns a.wp'); return a && { text: a.textContent, href: a.getAttribute('href') }; });
    const todo = await p.evaluate(() => [...document.querySelectorAll('.todo-links a')].map((a) => a.getAttribute('href')));
    const ok = wp && wp.text === '이 단지 심층 분석' && wp.href === url + '?utm_source=calendar&utm_medium=modal' && todo.includes(url) && !errs.length;
    console.log('한글 슬러그', withWp.id, JSON.stringify(wp), '함께 볼 글', todo.includes(url), errs.join(' / '), ok ? 'ok' : 'BAD');
    if (!ok) bad++;
    await p.close();
  }
} finally { await b.close(); }
console.log(bad ? 'FAIL' : 'ALL OK');
process.exitCode = bad ? 1 : 0;

// 달력 상세 창 3버튼 + 자격 확인 리모콘 미리보기·점검. node preview/unslop/modal3.mjs <출력 폴더>
import { chromium } from 'playwright';
import { join } from 'node:path';
const OUT = process.argv[2], BASE = 'http://localhost:5178', PAGES = 'https://juholee97.github.io/cheongyak_blog/';
const sched = await (await fetch(PAGES + 'schedule.json')).json();
const links = await (await fetch(PAGES + 'auleezip_links.json')).json();
const withWp = sched.items.find((it) => /^\d+-\d+$/.test(it.id) && /\/deep-/.test(links[it.id.split('-')[0]] || '') && it.homepageUrl);
const noWp = sched.items.find((it) => /^youth-/.test(it.id));
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
} finally { await b.close(); }
console.log(bad ? 'FAIL' : 'ALL OK');

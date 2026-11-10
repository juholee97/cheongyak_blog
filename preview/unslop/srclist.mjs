// 달력 페이지 기관별 목록 3줄 반 + 칸 안 스크롤 미리보기. node preview/unslop/srclist.mjs <출력 폴더>
import { chromium } from 'playwright';
import { join } from 'node:path';
const OUT = process.argv[2];
const sched = await (await fetch('https://juholee97.github.io/cheongyak_blog/schedule.json')).json();
const b = await chromium.launch();
let bad = 0;
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.route(/^https?:\/\/(?!localhost|cdn\.jsdelivr\.net)/, (x) => x.abort());
    await p.route('**/schedule.json', (x) => x.fulfill({ json: sched }));
    await p.goto('http://localhost:5178/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95#src-lh');
    await p.waitForSelector('.src-rows .hero-row', { timeout: 15000 });
    await p.waitForTimeout(500);
    const st = await p.evaluate(() => ({ boxes: [...document.querySelectorAll('.src-rows')].map((r) => r.clientHeight + '/' + r.scrollHeight), over: document.documentElement.scrollWidth - innerWidth }));
    console.log(w, JSON.stringify(st));
    if (st.over > 0) bad++;
    await p.locator('.src-list').screenshot({ path: join(OUT, `srclist_${w}.png`) });
    await p.close();
  }
} finally { await b.close(); }
console.log(bad ? 'FAIL' : 'ALL OK');

// 카테고리 핵심 글 3편 미리보기·점검. node preview/unslop/core.mjs <출력 폴더>
import { chromium } from 'playwright';
import { join } from 'node:path';
const OUT = process.argv[2], BASE = 'http://localhost:5178';
const b = await chromium.launch();
let bad = 0;
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    for (const [name, path, want] of [['guide', '/category/청약가이드', ['/8', '/24', '/27']], ['loan', '/category/대출·정책', ['/75', '/5', '/22']], ['guide_p2', '/category/청약가이드?page=2', []], ['other', '/category/분양분석', []]]) {
      const p = await b.newPage({ viewport: { width: w, height: h } });
      await p.route(/^https?:\/\/(?!localhost|cdn\.jsdelivr\.net)/, (x) => x.abort());
      await p.goto(BASE + encodeURI(path));
      await p.evaluate(() => document.fonts.ready);
      const st = await p.evaluate(() => ({ links: [...document.querySelectorAll('.core-card')].map((a) => a.getAttribute('href')), before: !!document.querySelector('.core-block + .latest-head, .core-block ~ .list-block'), over: document.documentElement.scrollWidth - innerWidth }));
      const ok = st.links.join() === want.join() && st.over <= 0 && (!want.length || st.before);
      console.log(w, name, JSON.stringify(st), ok ? 'ok' : 'BAD');
      if (!ok) bad++;
      if (want.length) await p.screenshot({ path: join(OUT, `core_${name}_${w}.png`) });
      await p.close();
    }
  }
} finally { await b.close(); }
console.log(bad ? 'FAIL' : 'ALL OK');

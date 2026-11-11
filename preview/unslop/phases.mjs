// 달력 단계 체크: 마감·계약 기본 꺼짐과 LH 접수 시작일 미리보기·점검. node preview/unslop/phases.mjs <출력 폴더> [schedule.json 경로]
import { chromium } from 'playwright';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
const OUT = process.argv[2], BASE = 'http://localhost:5178';
const sched = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : await (await fetch('https://juholee97.github.io/cheongyak_blog/schedule.json')).json();
const lhOne = sched.items.find((it) => it.startKnown && it.phases[0].end && it.phases[0].end >= new Date().toISOString().slice(0, 10)); // 접수 시작일을 받은 LH 공고
const b = await chromium.launch();
let bad = 0;
const read = (p) => p.evaluate(() => ({
  on: [...document.querySelectorAll('.ph-toggle')].map((x) => x.textContent.replace('✓', '') + (x.getAttribute('aria-pressed') === 'true' ? ':on' : ':off')).join(' '),
  chips: [...document.querySelectorAll('.cal-card .ev, .cal-card [data-act=open]')].map((e) => e.textContent).filter((t) => /^\s*(마감|계약)/.test(t)).length,
  summary: document.querySelector('[data-ref=summary]').textContent,
  src: [...document.querySelectorAll('.src-list .hero-group-head em')].map((e) => e.textContent).join(' '),
  over: document.documentElement.scrollWidth - innerWidth,
}));
try {
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.route(/^https?:\/\/(?!localhost|cdn\.jsdelivr\.net)/, (x) => x.abort());
    await p.route('**/schedule.json', (x) => x.fulfill({ json: sched }));
    await p.goto(BASE + '/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95');
    await p.waitForSelector('.src-rows .hero-row', { timeout: 15000 });
    await p.waitForTimeout(300);
    const a = await read(p); console.log(w, '기본', JSON.stringify(a));
    if (!/마감:off/.test(a.on) || !/계약:off/.test(a.on) || !/1순위:on/.test(a.on) || a.over > 0) bad++;
    if (w > 700) { if (a.chips !== 0) bad++; await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: join(OUT, 'phases_default.png'), fullPage: true, clip: await p.evaluate(() => { const r = document.querySelector('.cal-body').getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; }) }); }
    await p.click('.ph-toggle[data-k=end]'); await p.click('.ph-toggle[data-k=con]'); await p.waitForTimeout(200);
    const c = await read(p); console.log(w, '둘 다 켬', JSON.stringify(c));
    if (!/마감:on/.test(c.on) || !/계약:on/.test(c.on) || c.src !== a.src) bad++;
    if (w > 700) { if (!c.chips) bad++; await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: join(OUT, 'phases_on.png'), fullPage: true, clip: await p.evaluate(() => { const r = document.querySelector('.cal-body').getBoundingClientRect(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; }) }); }
    if (w <= 700) await p.screenshot({ path: join(OUT, 'phases_390.png') });
    if (lhOne) { // 상세 창에 접수 시작과 마감이 둘 다 보인다
      await p.goto(BASE + '/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95#todo=' + encodeURIComponent(lhOne.id));
      await p.reload(); await p.waitForSelector('.modal .mtable', { timeout: 15000 }); await p.waitForTimeout(300);
      const t = await p.locator('.modal .mtable').innerText(), l = await p.locator('.todo-list').innerText();
      console.log(w, 'LH 상세', JSON.stringify(t.replace(/\s+/g, ' ')), JSON.stringify(l.replace(/\s+/g, ' ').slice(0, 120)));
      if (!/접수\s+\d{4}/.test(t) || !/접수 마감\s+\d{4}/.test(t)) bad++;
      if (w > 700) await p.screenshot({ path: join(OUT, 'phases_lh_modal.png') });
    }
    if (errs.length) { console.log(errs); bad++; }
    await p.close();
  }
} finally { await b.close(); }
console.log(bad ? 'FAIL' : 'ALL OK');

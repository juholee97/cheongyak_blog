// 달력 페이지 기관별 목록이 위 필터를 따르는지 미리보기. node preview/unslop/srcfilter.mjs <출력 폴더>
import { chromium } from 'playwright';
import { join } from 'node:path';
const OUT = process.argv[2];
const sched = await (await fetch('https://juholee97.github.io/cheongyak_blog/schedule.json')).json();
const b = await chromium.launch();
let bad = 0;
const counts = (p) => p.evaluate(() => ({ n: [...document.querySelectorAll('.src-list .hero-group-head em')].map((e) => e.textContent).join(' '), toggle: document.querySelector('.src-toggle').getAttribute('aria-checked'), regions: [...new Set([...document.querySelectorAll('.src-list .hero-row .where')].map((e) => e.textContent.split(' ')[0]))].join(','), errs: window.__errs || [] }));
try {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/^https?:\/\/(?!localhost|cdn\.jsdelivr\.net)/, (x) => x.abort());
  await p.route('**/schedule.json', (x) => x.fulfill({ json: sched }));
  await p.goto('http://localhost:5178/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95');
  await p.waitForSelector('.src-rows .hero-row');
  const all = await counts(p); console.log('전체', JSON.stringify(all));
  // 서울만: 지역 체크 해제 후 서울만 켜기(필터 UI를 실제로 누른다)
  // 서울만 남기기: 필터의 지역 버튼을 실제로 눌러 서울 외 지역을 끈다
  for (const r of await p.$$eval('.filter [data-act=region]', (bs) => bs.map((x) => x.dataset.r).filter((r) => r !== '서울'))) {
    await p.click(`.filter [data-act=region][data-r="${r}"]`);
  }
  await p.waitForTimeout(400);
  const seoul = await counts(p); console.log('서울만', JSON.stringify(seoul));
  if (seoul.toggle !== 'true' || seoul.regions !== '서울' || seoul.n === all.n) bad++;
  await p.locator('.src-list').screenshot({ path: join(OUT, 'srcfilter_seoul.png') });
  // 토글 끄기: 서울만 고른 채로 전체 목록
  await p.click('.src-toggle'); await p.waitForTimeout(300);
  const off = await counts(p); console.log('토글 끔', JSON.stringify(off));
  if (off.toggle !== 'false' || off.n !== all.n) bad++;
  await p.locator('.src-list').screenshot({ path: join(OUT, 'srcfilter_off.png') });
  // 새로 열어도 끈 상태 기억
  await p.reload(); await p.waitForSelector('.src-rows .hero-row');
  const kept = await counts(p); console.log('다시 열기', JSON.stringify(kept));
  if (kept.toggle !== 'false') bad++;
  await p.click('.src-toggle'); await p.waitForTimeout(300);
  // 전체 선택으로 돌아오면 원래대로
  await p.click('.filter .btn[data-act=all]');
  await p.waitForTimeout(400);
  const back = await counts(p); console.log('전체 선택', JSON.stringify(back));
  if (back.toggle !== 'true' || back.n !== all.n) bad++;
  if (errs.length) { console.log(errs); bad++; }
} finally { await b.close(); }
console.log(bad ? 'FAIL' : 'ALL OK');

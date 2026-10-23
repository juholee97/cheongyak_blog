// 발행 가드 자체 점검: node tistory/guard.check.mjs
// 가짜 발행 레이어에서 클릭이 막히는지/통과하는지만 본다(네트워크 없음).
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GUARD, ROOT } from './common.mjs';

const SEL = JSON.parse(await readFile(join(ROOT, 'tistory', 'selectors.json'), 'utf8'));
const pad = (n) => String(n).padStart(2, '0');
const at = (ms) => { const t = new Date(Date.now() + ms); return { d: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`, h: t.getHours(), m: t.getMinutes() }; };
const layer = (mode, { d, h, m }) => `<button id="publish-layer-btn">완료</button><button class="btn_date ${mode === '현재' ? 'on' : ''}">현재</button><button class="btn_date ${mode === '예약' ? 'on' : ''}">예약</button>
<button class="btn_reserve">${d}</button><input id="dateHour" value="${h}"><input id="dateMinute" value="${m}"><button id="publish-btn">공개 발행</button><button id="other">발행 설정</button>`;

const browser = await chromium.launch();
const passes = async (schedule, html, sel) => {
  const page = await browser.newPage(); // 새 창마다(가드는 창당 한 번만 설치된다)
  await page.setContent(html + '<script>window.hits=[];document.addEventListener("click",(e)=>hits.push(e.target.id||e.target.className))</script>');
  await page.evaluate(GUARD, { ...SEL.publishGuard, schedule });
  await page.click(sel);
  const n = await page.evaluate(() => window.hits.length);
  await page.close();
  return n > 0;
};
const later = at(60 * 60 * 1000), soon = at(3 * 60 * 1000), past = at(-60 * 60 * 1000);
const cases = [
  ['임시저장 모드: 완료 막음', false, layer('예약', later), '#publish-layer-btn', false],
  ['임시저장 모드: 예약이어도 발행 막음', false, layer('예약', later), '#publish-btn', false],
  ['예약 모드: 완료(레이어 열기) 통과', true, layer('현재', later), '#publish-layer-btn', true],
  ['예약 모드: 발행일 현재면 막음', true, layer('현재', later), '#publish-btn', false],
  ['예약 모드: 3분 뒤 예약은 막음', true, layer('예약', soon), '#publish-btn', false],
  ['예약 모드: 지난 시각 막음', true, layer('예약', past), '#publish-btn', false],
  ['예약 모드: 1시간 뒤 예약 통과', true, layer('예약', later), '#publish-btn', true],
  ['예약 모드: 다른 발행 버튼 막음', true, layer('예약', later), '#other', false],
];
let bad = 0;
for (const [name, schedule, html, sel, want] of cases) {
  const got = await passes(schedule, html, sel);
  if (got !== want) bad++;
  console.log(`${got === want ? '✓' : '✗'} ${name}`);
}
await browser.close();
process.exitCode = bad ? 1 : 0;

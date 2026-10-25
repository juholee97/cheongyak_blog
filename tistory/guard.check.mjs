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
  await page.evaluate(GUARD, { ...SEL.publishGuard, schedule: schedule === true, republish: schedule === 'republish', privateSave: schedule === 'private' });
  await page.click(sel);
  const n = await page.evaluate(() => window.hits.length);
  await page.close();
  return n > 0;
};
const later = at(60 * 60 * 1000), soon = at(3 * 60 * 1000), past = at(-60 * 60 * 1000);
// 공개 글 고치기: 발행일 칸에 원래 시각이 선택된 레이어
const privLayer = (priv, text) => `<button id="publish-layer-btn">완료</button><input type="radio" id="open0" ${priv ? 'checked' : ''}><input type="radio" id="open20" ${priv ? '' : 'checked'}><button id="publish-btn">${text}</button>`;
const pubLayer = (on, t) => `<button id="publish-layer-btn">완료</button><button class="btn_date ${on === 'orig' ? 'on' : ''}">${t.d} ${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}</button><button class="btn_date ${on === '현재' ? 'on' : ''}">현재</button><button class="btn_date ${on === '예약' ? 'on' : ''}">예약</button><button id="publish-btn">공개 발행</button>`;
const cases = [
  ['임시저장 모드: 완료 막음', false, layer('예약', later), '#publish-layer-btn', false],
  ['임시저장 모드: 예약이어도 발행 막음', false, layer('예약', later), '#publish-btn', false],
  ['예약 모드: 완료(레이어 열기) 통과', true, layer('현재', later), '#publish-layer-btn', true],
  ['예약 모드: 발행일 현재면 막음', true, layer('현재', later), '#publish-btn', false],
  ['예약 모드: 3분 뒤 예약은 막음', true, layer('예약', soon), '#publish-btn', false],
  ['예약 모드: 지난 시각 막음', true, layer('예약', past), '#publish-btn', false],
  ['예약 모드: 1시간 뒤 예약 통과', true, layer('예약', later), '#publish-btn', true],
  ['예약 모드: 다른 발행 버튼 막음', true, layer('예약', later), '#other', false],
  ['공개 글 고치기: 원래 지난 시각 그대로면 통과', 'republish', pubLayer('orig', past), '#publish-btn', true],
  ['공개 글 고치기: 발행일 현재로 바꾸면 막음', 'republish', pubLayer('현재', past), '#publish-btn', false],
  ['공개 글 고치기: 원래 시각이 미래면 막음', 'republish', pubLayer('orig', later), '#publish-btn', false],
  ['임시저장 모드: 공개 글 레이어도 막음', false, pubLayer('orig', past), '#publish-btn', false],
  ['비공개 저장: 비공개면 통과', 'private', privLayer(true, '비공개 저장'), '#publish-btn', true],
  ['비공개 저장: 공개로 바뀌면 막음', 'private', privLayer(false, '공개 발행'), '#publish-btn', false],
  ['비공개 저장: 다른 모드에선 막음', false, privLayer(true, '비공개 저장'), '#publish-btn', false],
];
let bad = 0;
for (const [name, schedule, html, sel, want] of cases) {
  const got = await passes(schedule, html, sel);
  if (got !== want) bad++;
  console.log(`${got === want ? '✓' : '✗'} ${name}`);
}
await browser.close();
process.exitCode = bad ? 1 : 0;

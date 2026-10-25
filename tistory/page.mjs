// 티스토리 「페이지」를 비공개로 저장한다(공개 전환은 사람이 페이지 관리에서). node tistory/page.mjs posts/about.mjs [--dry-run]
// 이미 있는 페이지 고치기: node tistory/page.mjs posts/about.mjs --update 62   (공개 상태는 그대로, 그 페이지 편집 화면에서만 저장 허용)
// 모듈은 { title, html }을 내보낸다. 같은 제목 페이지가 이미 있으면 새로 만들지 않는다.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, ensureLogin, BLOG, ROOT, GUARD } from './common.mjs';
import { readFile } from 'node:fs/promises';

const [modPath] = process.argv.slice(2);
const dry = process.argv.includes('--dry-run');
const ui = process.argv.indexOf('--update');
const updateId = ui > 0 ? process.argv[ui + 1] : null;
const { title, html } = await import(pathToFileURL(join(ROOT, modPath)).href);
const SEL = JSON.parse(await readFile(join(ROOT, 'tistory', 'selectors.json'), 'utf8'));
const guard = updateId ? { ...SEL.publishGuard, pageUpdate: `/manage/page/${updateId}` } : { ...SEL.publishGuard, privateSave: true };
const { context, page } = await launch({ headless: process.env.TISTORY_HEADED !== '1' });
const log = (...a) => console.log(...a);
try {
  if (!(await ensureLogin(page, context)).ok) { log('로그인 필요'); process.exit(3); }
  page.on('dialog', (d) => { log('확인창:', d.message()); (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}); });
  await page.goto(BLOG + '/manage/pages', { waitUntil: 'networkidle' });
  if (!updateId && (await page.getByText(title, { exact: true }).count())) { log('같은 제목 페이지가 이미 있음 — 만들지 않음(고치려면 --update <번호>)'); process.exit(0); }
  if (dry) await page.route('**/*', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
  await page.addInitScript(GUARD, guard);
  await page.goto(BLOG + (updateId ? `/manage/page/${updateId}` : '/manage/page'), { waitUntil: 'domcontentloaded' });
  await page.evaluate(GUARD, guard);
  await page.waitForFunction((id) => window.tinymce?.get(id)?.initialized, SEL.editor.tinymceId, { timeout: 30000 });
  await page.fill(SEL.title, title);
  // 본문 넣기: setContent만으로는 티스토리가 바뀐 줄 몰라 빈 본문으로 저장된 일이 있었다(2026-10-25) → 변경을 알리고, 편집기에 한 번 입력한 뒤 확인
  await page.evaluate(({ id, html }) => { const ed = window.tinymce.get(id); ed.setContent(html); ed.undoManager?.add(); ed.setDirty?.(true); ed.fire('change'); ed.fire('input'); ed.fire('keyup'); ed.save?.(); }, { id: SEL.editor.tinymceId, html });
  await page.frameLocator(SEL.editor.iframe).locator('body').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await page.keyboard.press('Backspace');
  const len = await page.evaluate((id) => window.tinymce.get(id).getContent().length, SEL.editor.tinymceId);
  log('본문 글자 수', len);
  if (len < html.length * 0.8) { log('본문이 제대로 안 들어감 — 저장하지 않음'); process.exit(1); }
  await page.click(SEL.publish.open);
  await page.waitForSelector('#open0', { state: 'attached', timeout: 10000 });
  if (!updateId) await page.click('label[for="open0"] .checkbox-text').catch(() => {});
  const state = await page.evaluate(() => ({ priv: document.querySelector('#open0')?.checked, btn: document.querySelector('#publish-btn')?.innerText.trim() }));
  log('저장 설정', JSON.stringify(state));
  if (!updateId && (!state.priv || !/비공개 저장/.test(state.btn || ''))) { log('비공개가 아님 — 저장하지 않음'); process.exit(1); }
  if (dry) { await page.screenshot({ path: join(ROOT, 'tistory', 'probe-out', 'page-dry.png') }); log('시험 끝 — 저장 안 함'); process.exit(0); }
  await page.click('#publish-btn');
  // 저장은 티스토리 보안 확인(/manage/dkaptcha)을 먼저 거친다(2026-10-25 실측). 화면에 띄웠으면 사람이 풀 때까지 5분, 아니면 90초 기다린다
  const limit = process.env.TISTORY_HEADED === '1' ? 300 : 90;
  for (let i = 0; i < limit / 2; i++) {
    if (!/\/manage\/page(\?|$|\/)/.test(new URL(page.url()).pathname)) break;
    if (i === 10) log('※ 저장이 20초째 안 끝나요 — 보안 확인이 떴다면 화면의 티스토리 창에서 직접 풀어 주세요');
    await page.waitForTimeout(2000);
  }
  if (updateId) { // 고친 뒤 저장본 다시 열어 본문 길이 확인
    await page.goto(BLOG + `/manage/page/${updateId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((id) => window.tinymce?.get(id)?.initialized, SEL.editor.tinymceId, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const saved = await page.evaluate((id) => window.tinymce.get(id).getContent().length, SEL.editor.tinymceId);
    log(saved >= html.length * 0.8 ? `✓ 저장본 본문 ${saved}자` : `✗ 저장본 본문 ${saved}자 — 비어 있음`);
    process.exit(saved >= html.length * 0.8 ? 0 : 2);
  }
  await page.goto(BLOG + '/manage/pages', { waitUntil: 'networkidle' });
  const row = page.locator('li', { has: page.getByText(title, { exact: true }) }).first();
  const info = (await row.count()) ? await row.evaluate((li) => ({ text: li.innerText.replace(/\s+/g, ' ').slice(0, 160), href: li.querySelector('a[href*="/pages/"], a.link_cont')?.href })) : null;
  log(info ? `✓ 비공개로 저장됨 ${JSON.stringify(info)}` : '✗ 페이지 목록에서 못 찾음');
  process.exitCode = info ? 0 : 2;
} finally { await context.close(); }

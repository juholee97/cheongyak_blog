// 티스토리 「페이지」를 비공개로 저장한다(공개 전환은 사람이 페이지 관리에서). node tistory/page.mjs posts/about.mjs [--dry-run]
// 모듈은 { title, html }을 내보낸다. 같은 제목 페이지가 이미 있으면 새로 만들지 않는다.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, ensureLogin, BLOG, ROOT, GUARD } from './common.mjs';
import { readFile } from 'node:fs/promises';

const [modPath] = process.argv.slice(2);
const dry = process.argv.includes('--dry-run');
const { title, html } = await import(pathToFileURL(join(ROOT, modPath)).href);
const SEL = JSON.parse(await readFile(join(ROOT, 'tistory', 'selectors.json'), 'utf8'));
const guard = { ...SEL.publishGuard, privateSave: true };
const { context, page } = await launch({ headless: process.env.TISTORY_HEADED !== '1' });
const log = (...a) => console.log(...a);
try {
  if (!(await ensureLogin(page, context)).ok) { log('로그인 필요'); process.exit(3); }
  page.on('dialog', (d) => { log('확인창:', d.message()); (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}); });
  await page.goto(BLOG + '/manage/pages', { waitUntil: 'networkidle' });
  if (await page.getByText(title, { exact: true }).count()) { log('같은 제목 페이지가 이미 있음 — 만들지 않음'); process.exit(0); }
  if (dry) await page.route('**/*', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
  await page.addInitScript(GUARD, guard);
  await page.goto(BLOG + '/manage/page', { waitUntil: 'domcontentloaded' });
  await page.evaluate(GUARD, guard);
  await page.waitForFunction((id) => window.tinymce?.get(id)?.initialized, SEL.editor.tinymceId, { timeout: 30000 });
  await page.fill(SEL.title, title);
  await page.evaluate(({ id, html }) => { const ed = window.tinymce.get(id); ed.setContent(html); ed.fire('change'); }, { id: SEL.editor.tinymceId, html });
  await page.click(SEL.publish.open);
  await page.waitForSelector('#open0', { state: 'attached', timeout: 10000 });
  await page.click('label[for="open0"] .checkbox-text').catch(() => {});
  const state = await page.evaluate(() => ({ priv: document.querySelector('#open0')?.checked, btn: document.querySelector('#publish-btn')?.innerText.trim() }));
  log('저장 설정', JSON.stringify(state));
  if (!state.priv || !/비공개 저장/.test(state.btn || '')) { log('비공개가 아님 — 저장하지 않음'); process.exit(1); }
  if (dry) { await page.screenshot({ path: join(ROOT, 'tistory', 'probe-out', 'page-dry.png') }); log('시험 끝 — 저장 안 함'); process.exit(0); }
  await page.click('#publish-btn');
  await page.waitForURL((u) => !/\/manage\/page(\?|$|\/)/.test(u.pathname + u.search), { timeout: 90000 }).catch(() => {});
  await page.goto(BLOG + '/manage/pages', { waitUntil: 'networkidle' });
  const row = page.locator('li', { has: page.getByText(title, { exact: true }) }).first();
  const info = (await row.count()) ? await row.evaluate((li) => ({ text: li.innerText.replace(/\s+/g, ' ').slice(0, 160), href: li.querySelector('a[href*="/pages/"], a.link_cont')?.href })) : null;
  log(info ? `✓ 비공개로 저장됨 ${JSON.stringify(info)}` : '✗ 페이지 목록에서 못 찾음');
  process.exitCode = info ? 0 : 2;
} finally { await context.close(); }

// 발행 레이어 실측(예약발행 셀렉터 찾기). 모든 POST를 막아 저장·발행이 일어날 수 없고, 마지막 발행 버튼은 누르지 않는다.
// node tistory/probe_publish.mjs  → tistory/probe-out/publish-*.json·png
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, ensureLogin, NEWPOST, ROOT } from './common.mjs';

const out = join(ROOT, 'tistory', 'probe-out');
await mkdir(out, { recursive: true });
const { context, page } = await launch({ headless: true });
const dump = (name) => page.evaluate(() => {
  const layer = document.querySelector('.layer_post, .editor_layer, [class*="publish"], [id*="publish"]');
  const els = [...document.querySelectorAll('input, button, select, label, a[role="button"]')].filter((e) => e.offsetParent !== null);
  return { layerClass: layer && layer.className, controls: els.map((e) => ({ tag: e.tagName, id: e.id, cls: e.className, type: e.type, name: e.name, value: e.value, text: (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 40), checked: e.checked })) };
}).then(async (d) => { await writeFile(join(out, `publish-${name}.json`), JSON.stringify(d, null, 2)); await page.screenshot({ path: join(out, `publish-${name}.png`) }); return d; });
try {
  if (!(await ensureLogin(page, context)).ok) throw new Error('로그인 필요');
  await page.route('**/*', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue()));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.goto(NEWPOST, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.tinymce?.get('editor-tistory')?.initialized, null, { timeout: 30000 });
  await page.fill('textarea#post-title-inp', '실측용 제목(저장 안 함)');
  await page.click('#publish-layer-btn');
  await page.waitForTimeout(1500);
  await dump('layer');
  console.log(await page.evaluate(() => document.querySelector('#open20').parentElement.parentElement.outerHTML.slice(0, 1500)));
  await page.click('label[for="open20"], #open20').catch(() => page.getByText('공개', { exact: true }).first().click());
  await page.waitForTimeout(800);
  await dump('public');
  const reserve = page.getByText('예약', { exact: true }).first();
  if (await reserve.count()) { await reserve.click(); await page.waitForTimeout(1000); await dump('reserve');
    await page.click('.btn_reserve'); await page.waitForTimeout(800); await dump('calendar');
    const cal = await page.evaluate(() => { const b = document.querySelector('.btn_reserve'); let p = b; for (let i = 0; i < 4 && p; i++) p = p.parentElement; return p ? p.outerHTML.slice(0, 6000) : ''; });
    await writeFile(join(out, 'publish-calendar.html'), cal); }
  else console.log('「예약」 글자를 찾지 못함');
  console.log('ok');
} finally { await context.close(); }

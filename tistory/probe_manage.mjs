// 관리 화면 실측(읽기만, POST 차단): node tistory/probe_manage.mjs <경로> [이름]  예) /manage/design/skin/edit skin
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, ensureLogin, BLOG, ROOT } from './common.mjs';
const [path = '/manage/design/skin/edit', name = 'manage', click] = process.argv.slice(2); // click: 누를 버튼 글자(선택)
const out = join(ROOT, 'tistory', 'probe-out');
await mkdir(out, { recursive: true });
const { context, page } = await launch({ headless: true });
try {
  if (!(await ensureLogin(page, context)).ok) throw new Error('로그인 필요');
  if (!process.env.ALLOW_POST) await page.route('**/*', (r) => (r.request().method() === 'POST' ? r.abort() : r.continue())); // ALLOW_POST=1: 화면을 여는 데 POST가 필요할 때(저장 버튼은 누르지 않는다)
  page.on('dialog', (d) => { console.log('확인창:', d.message()); (process.env.ACCEPT ? d.accept() : d.dismiss()).catch(() => {}); });
  await page.goto(BLOG + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  let target = page;
  if (click) {
    const pop = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await (click.startsWith('.') || click.startsWith('#') ? page.locator(click).first() : page.getByText(click, { exact: true }).first()).click();
    const p2 = await pop; if (p2) { await p2.waitForLoadState('networkidle').catch(() => {}); target = p2; }
    await target.waitForTimeout(2500);
  }
  const page2 = target;
  const d = await page2.evaluate(() => ({
    url: location.href,
    cm: [...document.querySelectorAll('.CodeMirror')].map((e) => ({ cls: e.className, len: e.CodeMirror ? e.CodeMirror.getValue().length : null, parent: e.parentElement?.className, gparent: e.parentElement?.parentElement?.className, visible: e.offsetParent !== null })),
    ace: [...document.querySelectorAll('.ace_editor, textarea')].map((e) => ({ tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 60), len: (e.value || '').length })),
    controls: [...document.querySelectorAll('button, a, input, label, textarea, [role="tab"]')].filter((e) => e.offsetParent !== null).map((e) => ({ tag: e.tagName, id: e.id, cls: String(e.className).slice(0, 50), type: e.type, name: e.name, text: (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 30), href: e.getAttribute('href') })).slice(0, 150),
    files: [...document.querySelectorAll('input[type=file]')].map((e) => ({ id: e.id, name: e.name, accept: e.accept, cls: e.className })),
  }));
  await writeFile(join(out, `${name}.json`), JSON.stringify(d, null, 2));
  await page2.screenshot({ path: join(out, `${name}.png`), fullPage: true });
  console.log(d.url, 'codemirror', JSON.stringify(d.cm), 'files', JSON.stringify(d.files));
} finally { await context.close(); }

// 이미지 업로드 실측: 첨부 메뉴·파일 입력칸·업로드 요청·본문 표기를 기록한다.
// 실측 중에는 업로드로 보이는 요청 말고 모든 POST를 막아 자동 임시저장이 생기지 않게 한다. 저장·발행 없음.
// node tistory/probe_upload.mjs <png>
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, isLoggedIn, NEWPOST, ROOT } from './common.mjs';

const img = process.argv[2];
const { context, page } = await launch({ headless: true });
const log = { posts: [], blocked: [], dialogs: [] };
try {
  if (!(await isLoggedIn(page))) { console.log('로그인 필요'); process.exitCode = 3; }
  else {
    await page.route('**/*', async (route) => {
      const r = route.request();
      if (r.method() !== 'POST') return route.continue();
      const u = r.url();
      if (/upload|attach|image|file|kage/i.test(u)) { log.posts.push(u.split('?')[0]); return route.continue(); }
      log.blocked.push(u.split('?')[0]);
      return route.abort();
    });
    page.on('dialog', (d) => { log.dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    page.on('response', async (res) => {
      if (res.request().method() === 'POST' && /upload|attach|image|file|kage/i.test(res.url())) {
        try { log.uploadResponse = { url: res.url().split('?')[0], status: res.status(), body: (await res.text()).slice(0, 1500) }; } catch { /* */ }
      }
    });
    await page.goto(NEWPOST, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.tinymce?.get('editor-tistory')?.initialized, null, { timeout: 30000 });
    log.fileInputs = await page.$$eval('input[type=file]', (els) => els.map((e) => ({ id: e.id, name: e.name, accept: e.accept, multiple: e.multiple, cls: e.className })));
    await page.click('#mceu_0-open');
    await page.waitForTimeout(800);
    log.attachMenu = await page.$$eval('.mce-menu-item, [role=menuitem]', (els) => els.filter((e) => e.offsetWidth).map((e) => ({ text: e.innerText.trim(), id: e.id, cls: e.className.slice(0, 80) })));
    log.fileInputsAfterMenu = await page.$$eval('input[type=file]', (els) => els.map((e) => ({ id: e.id, name: e.name, accept: e.accept, multiple: e.multiple })));
    const before = await page.evaluate(() => window.tinymce.get('editor-tistory').getContent());
    // 첨부 → 사진을 누르면 파일 선택 창이 뜬다 → 가로채서 파일을 넣는다
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), page.click('#attach-image')]);
    log.chooser = { multiple: chooser.isMultiple() };
    await chooser.setFiles(img);
    await page.waitForTimeout(8000);
    log.contentBefore = before;
    log.contentAfter = await page.evaluate(() => window.tinymce.get('editor-tistory').getContent());
    await page.screenshot({ path: join(ROOT, 'tistory', 'probe-out', 'upload-check.png'), fullPage: true });
  }
} finally {
  await mkdir(join(ROOT, 'tistory', 'probe-out'), { recursive: true });
  await writeFile(join(ROOT, 'tistory', 'probe-out', 'upload.json'), JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2).slice(0, 6000));
  await context.close();
}

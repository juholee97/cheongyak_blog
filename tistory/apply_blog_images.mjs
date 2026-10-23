// 관리 → 블로그 설정의 블로그 이미지·아이콘·파비콘을 brand/ 파일로 바꾼다(첫 칸 「블로그 설정」의 변경사항 저장만 누름).
// node tistory/apply_blog_images.mjs --dry-run | --apply     파일은 node brand/make.mjs 로 먼저 만든다
// 2026-10-23 실측: 파일 입력 세 개 — [0] 블로그 이미지(image/*, 올리면 이미지 편집 창 → 완료) [1] 아이콘(image/*, 32·64px) [2] 파비콘(.ico)
import { join } from 'node:path';
import { launch, ensureLogin, BLOG, ROOT } from './common.mjs';

const apply = process.argv.includes('--apply');
if (!apply && !process.argv.includes('--dry-run')) { console.log('사용: node tistory/apply_blog_images.mjs --dry-run | --apply'); process.exit(4); }
const files = ['blog-image.png', 'icon-64.png', 'favicon.ico'].map((f) => join(ROOT, 'brand', f));
const { context, page } = await launch({ headless: true });
const shot = (n) => page.screenshot({ path: join(ROOT, 'tistory', 'probe-out', `blogimg-${n}.png`), fullPage: true });
try {
  if (!(await ensureLogin(page, context)).ok) { console.log('로그인 필요'); process.exit(3); }
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept().catch(() => {}); });
  await page.goto(BLOG + '/manage/setting/blog', { waitUntil: 'networkidle' });
  const inputs = page.locator('input[type=file]');
  if ((await inputs.count()) !== 3) { console.log('파일 칸이 3개가 아님 — 화면이 바뀜'); process.exit(1); }
  for (let i = 0; i < 3; i++) {
    await inputs.nth(i).setInputFiles(files[i]);
    await page.waitForTimeout(2500);
    // 블로그 이미지는 올리면 이미지 편집 창(크기 고르기)이 뜬다 → 원본 그대로 「완료」
    for (let k = 0; k < 3; k++) {
      const done = page.locator('button:visible, a:visible', { hasText: /^\s*완료\s*$/ }).last();
      if (!(await done.count())) break;
      await done.click(); await page.waitForTimeout(2500);
    }
  }
  await shot('filled');
  const state = await page.evaluate(() => ({ imgs: [...document.querySelectorAll('img')].filter((i) => i.offsetParent && /blog|icon|favicon|kage|daumcdn|tistory/.test(i.src)).map((i) => i.src.slice(0, 90)), saveOn: [...document.querySelectorAll('button.btn_save')].map((b) => b.className) }));
  console.log('넣음', JSON.stringify(state), dialogs.length ? `확인창: ${dialogs.join(' / ')}` : '');
  if (!apply) { console.log('시험 끝 — 저장하지 않음'); process.exit(0); }
  await page.locator('button.btn_save').first().click();
  await page.waitForTimeout(3000);
  await shot('saved');
  console.log('저장 누름', dialogs.length ? `확인창: ${dialogs.join(' / ')}` : '');
} finally { await context.close(); }

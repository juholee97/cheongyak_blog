// 관리 → 블로그 → 기타 설정의 「공개될 RSS 개수」를 바꾼다: node tistory/set_rss.mjs 50 [--dry-run]
// 2026-10-23 실측: 기타 설정 칸 .opt_blog3 드롭다운(라디오 entriesOnRSS) → 숫자 → 그 form의 「변경사항 저장」
import { join } from 'node:path';
import { launch, ensureLogin, BLOG, ROOT } from './common.mjs';
const n = process.argv[2], dry = process.argv.includes('--dry-run');
if (!/^\d+$/.test(n || '')) { console.log('사용: node tistory/set_rss.mjs <개수> [--dry-run]'); process.exit(4); }
const { context, page } = await launch({ headless: true });
try {
  if (!(await ensureLogin(page, context)).ok) { console.log('로그인 필요'); process.exit(3); }
  page.on('dialog', (d) => { console.log('확인창:', d.message()); d.accept().catch(() => {}); });
  await page.goto(BLOG + '/manage/setting/blog', { waitUntil: 'networkidle' });
  const read = () => page.locator('.opt_blog3 .btn_opt').innerText().then((t) => t.trim());
  console.log('지금:', await read());
  const values = await page.locator('input[name="entriesOnRSS"]').evaluateAll((xs) => xs.map((x) => x.value));
  console.log('고를 수 있는 값:', values.join(' '));
  if (!values.includes(n)) { console.log(`${n}은 고를 수 없음`); process.exit(4); }
  await page.click('.opt_blog3 .btn_opt');
  await page.locator('label.lab_set', { has: page.locator(`input[name="entriesOnRSS"][value="${n}"]`) }).click();
  await page.waitForTimeout(500);
  console.log('고름:', await read());
  if (dry) { console.log('시험 끝 — 저장 안 함'); process.exit(0); }
  // 이 칸(기타 설정)이 든 form의 「변경사항 저장」
  await page.locator('form', { has: page.locator('.opt_blog3') }).locator('button.btn_save').click();
  await page.waitForTimeout(2500);
  await page.goto(BLOG + '/manage/setting/blog', { waitUntil: 'networkidle' });
  const after = await read();
  console.log('저장 후:', after);
  await page.screenshot({ path: join(ROOT, 'tistory', 'probe-out', 'rss.png'), fullPage: true });
  process.exitCode = after === n ? 0 : 2;
} finally { await context.close(); }

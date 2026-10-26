// skin/skin.html·style.css를 티스토리 스킨 편집(html 편집)에 넣고 적용한다. 적용 전 지금 올라간 html·css를 data/skin-backup/에 백업한다.
// node tistory/apply_skin.mjs --dry-run   넣고 확인만(적용 안 함)     node tistory/apply_skin.mjs --apply   적용
// --file images/calendar.js (여러 번 가능): 스킨 「파일업로드」에 skin/ 아래 파일도 올린다(같은 이름은 바뀜). 적용 뒤 블로그에 걸린 파일과 대조
// 2026-10-23 실측: 스킨 편집 → 「html 편집」(확인창 수락) → Monaco 편집기, 위쪽 HTML·CSS 탭, 오른쪽 위 「적용」(.btn-save)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, ensureLogin, BLOG, ROOT } from './common.mjs';

const apply = process.argv.includes('--apply');
const files = process.argv.filter((a, i, all) => all[i - 1] === '--file');
if (!apply && !process.argv.includes('--dry-run')) { console.log('사용: node tistory/apply_skin.mjs --dry-run | --apply'); process.exit(4); }
const want = { HTML: await readFile(join(ROOT, 'skin/skin.html'), 'utf8'), CSS: await readFile(join(ROOT, 'skin/style.css'), 'utf8') };
const norm = (s) => s.replace(/\r\n/g, '\n').trimEnd();
const { context, page } = await launch({ headless: process.env.TISTORY_HEADED !== '1' });
const log = (...a) => console.log(...a);
try {
  if (!(await ensureLogin(page, context)).ok) { log('로그인 필요'); process.exit(3); }
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept().catch(() => {}); });
  await page.goto(BLOG + '/manage/design/skin/edit', { waitUntil: 'networkidle' });
  await page.click('.btn-edit-html');
  await page.waitForFunction(() => window.monaco?.editor?.getModels().length, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const value = () => page.evaluate(() => window.monaco.editor.getModels()[0].getValue());
  const tab = async (name) => { await page.getByRole('link', { name, exact: true }).click(); await page.waitForTimeout(1500); };
  const ts = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  await mkdir(join(ROOT, 'data', 'skin-backup'), { recursive: true });
  for (const name of ['HTML', 'CSS']) {
    await tab(name);
    const before = await value();
    await writeFile(join(ROOT, 'data', 'skin-backup', `${ts}.${name.toLowerCase()}`), before);
    if (norm(before) === norm(want[name])) { log(`${name}: 이미 같음`); continue; }
    await page.evaluate((v) => window.monaco.editor.getModels()[0].setValue(v), want[name]);
    log(`${name}: 바꿈 (${before.length} → ${want[name].length}자), 백업 data/skin-backup/${ts}.${name.toLowerCase()}`);
  }
  // 탭을 오가도 넣은 값이 남는지 확인
  let ok = true;
  for (const name of ['HTML', 'CSS']) { await tab(name); const same = norm(await value()) === norm(want[name]); ok &&= same; log(`${name} 확인: ${same ? '같음' : '다름'}`); }
  if (!ok) { log('넣은 값이 남지 않음 — 적용하지 않음'); process.exit(2); }
  if (!apply) { log('시험 끝 — 적용하지 않음'); process.exit(0); }
  if (files.length) {
    await tab('파일업로드');
    await page.setInputFiles('input.fileupload', files.map((f) => join(ROOT, 'skin', f)));
    await page.waitForTimeout(5000);
    log('파일 올림', files.join(', '));
  }
  if (await page.isEnabled('.btn-save')) await page.click('.btn-save'); // html·css가 그대로면 「적용」이 꺼져 있다(파일만 올릴 때 — 파일은 올리는 즉시 반영)
  else log('html·css 변경 없음 — 적용 생략');
  await page.waitForTimeout(4000);
  log('적용 누름', dialogs.length ? `확인창: ${dialogs.join(' / ')}` : '');
  // 검증: 편집기를 다시 열어 저장된 값 대조
  await page.goto(BLOG + '/manage/design/skin/edit', { waitUntil: 'networkidle' });
  await page.click('.btn-edit-html');
  await page.waitForFunction(() => window.monaco?.editor?.getModels().length, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  for (const name of ['HTML', 'CSS']) { await tab(name); const same = norm(await value()) === norm(want[name]); ok &&= same; log(`저장본 ${name}: ${same ? '같음' : '다름'}`); }
  // 올린 파일: 블로그 홈에 걸린 주소(버전 붙음)에서 받아 로컬과 같은지
  const home = await (await fetch(BLOG + '/')).text();
  for (const f of files) {
    const src = home.match(new RegExp(`src="([^"]*/skin/${f.replace(/[.]/g, '[.]')}[^"]*)"`))?.[1];
    const live = src ? await (await fetch(src.startsWith('//') ? 'https:' + src : src)).text() : '';
    const same = norm(live) === norm(await readFile(join(ROOT, 'skin', f), 'utf8'));
    ok &&= same; log(`블로그의 ${f}: ${same ? '같음' : src ? '다름' : '못 찾음'}`);
  }
  process.exitCode = ok ? 0 : 2;
} finally { await context.close(); }

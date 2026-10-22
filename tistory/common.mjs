// 티스토리 자동화 공용: 전용 브라우저 프로필(로그인 세션)과 로그인 여부 확인
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SESSION = join(ROOT, 'data', 'tistory-session'); // 절대 커밋·공유하지 않는다(.gitignore)
// 티스토리 로그인 쿠키는 세션 쿠키라 브라우저를 닫으면 프로필에서 사라진다 → 로그인 직후 따로 저장해 두고 실행 때 다시 넣는다
const COOKIES = join(ROOT, 'data', 'tistory-cookies.json');
const isTistory = (c) => /(^|\.)tistory\.com$/.test(c.domain.replace(/^\./, ''));

export async function saveTistoryCookies(context) {
  const cookies = (await context.cookies()).filter(isTistory);
  await writeFile(COOKIES, JSON.stringify(cookies));
  return cookies.length;
}
export const BLOG = 'https://aulee.tistory.com';
export const NEWPOST = BLOG + '/manage/newpost/';

export async function launch({ headless = true } = {}) {
  const context = await chromium.launchPersistentContext(SESSION, {
    headless,
    viewport: { width: 1440, height: 1000 },
    locale: 'ko-KR',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  try { await context.addCookies(JSON.parse(await readFile(COOKIES, 'utf8'))); } catch { /* 저장본 없음: 로그인 필요 */ }
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

// 관리 화면이 로그인 페이지로 튕기지 않으면 로그인된 것
export async function isLoggedIn(page) {
  await page.goto(BLOG + '/manage', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const u = page.url();
  return u.startsWith(BLOG + '/manage') && !/auth\/login|accounts\.kakao\.com/.test(u);
}

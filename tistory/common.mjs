// 티스토리 자동화 공용: 전용 브라우저 프로필(로그인 세션)과 로그인 여부 확인
// 작업 스케줄러로 화면이 잠긴 때 돌면 콘솔 제목을 못 읽어 Node가 'Assertion failed: process_title'로 꺼진 일이 있었다(2026-10-24 00:30·07:00)
// → 제목을 먼저 정해 둔다(이 파일은 자동 실행 스크립트들이 가장 먼저 불러온다)
try { process.title = 'cheongyak'; } catch { /* 무시 */ }
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
  // TISTORY_PROFILE: 다른 자동화가 전용 프로필을 쓰는 중일 때 임시 프로필로(로그인은 저장된 쿠키로)
  const context = await chromium.launchPersistentContext(process.env.TISTORY_PROFILE || SESSION, {
    headless,
    viewport: { width: 1440, height: 1000 },
    locale: 'ko-KR',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  try { await context.addCookies(JSON.parse(await readFile(COOKIES, 'utf8'))); } catch { /* 저장본 없음: 로그인 필요 */ }
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

// 티스토리 세션이 끊겼으면 살아 있는 카카오 로그인으로 다시 들어간다. 버튼만 누르고 아무것도 입력하지 않는다.
// 비밀번호 입력·추가 인증·동의 화면이 나오면 그 자리에서 멈추고 { ok:false, reason }을 돌려준다(사람이 tistory_login.bat으로).
export async function ensureLogin(page, context) {
  if (await isLoggedIn(page)) return { ok: true, how: '세션 유지' };
  await page.goto(`https://www.tistory.com/auth/login?redirectUrl=${encodeURIComponent(BLOG + '/manage')}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const btn = page.locator('a.link_kakao_id');
  if (!(await btn.count())) return { ok: false, reason: '티스토리 로그인 화면에서 "카카오계정으로 로그인" 버튼을 찾지 못했습니다.' };
  await btn.first().click();
  // 카카오를 거쳐 관리 화면으로 돌아오기를 기다린다
  await page.waitForURL((u) => u.href.startsWith(BLOG + '/manage') || /accounts\.kakao\.com|kauth\.kakao\.com/.test(u.href), { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  // 카카오 간편로그인(저장된 계정 고르기): 저장된 계정이 정확히 하나일 때만 그것을 누른다.
  // "새로운 계정으로 로그인", "간편로그인 계정 삭제"는 절대 누르지 않는다.
  if (/accounts\.kakao\.com\/login\/simple/.test(page.url())) {
    const saved = page.locator('.wrap_profile').filter({ hasNotText: '새로운 계정' });
    const n = await saved.count();
    if (n !== 1) return { ok: false, reason: `카카오 간편로그인에 저장된 계정이 ${n}개라 고르지 않았습니다. tistory_login.bat으로 직접 로그인해 주세요.` };
    await saved.first().click();
    await page.waitForURL((x) => x.href.startsWith(BLOG + '/manage') || !/login\/simple/.test(x.href), { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    if (!page.url().startsWith(BLOG + '/manage')) await page.waitForURL((x) => x.href.startsWith(BLOG + '/manage'), { timeout: 10000 }).catch(() => {});
  }
  const u = page.url();
  if (u.startsWith(BLOG + '/manage')) {
    await saveTistoryCookies(context).catch(() => {});
    return { ok: true, how: '카카오 로그인으로 재로그인' };
  }
  const hasPassword = await page.locator('input[type="password"]').count().catch(() => 0);
  const host = new URL(u).host;
  return {
    ok: false,
    reason: hasPassword
      ? `카카오 비밀번호 입력이 필요합니다(${host}). tistory_login.bat으로 직접 로그인해 주세요.`
      : `자동으로 돌아오지 못했습니다(${host}${new URL(u).pathname} — 추가 인증이나 동의 화면일 수 있음). tistory_login.bat으로 직접 로그인해 주세요.`,
  };
}

// 관리 화면이 로그인 페이지로 튕기지 않으면 로그인된 것
export async function isLoggedIn(page) {
  await page.goto(BLOG + '/manage', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const u = page.url();
  return u.startsWith(BLOG + '/manage') && !/auth\/login|accounts\.kakao\.com/.test(u);
}

// 발행 가드: 임시저장 흐름은 '완료'를 누를 일이 없다. 완료 버튼과 '발행' 글자가 든 버튼 클릭을 캡처 단계에서 막는다. 절대 제거하지 않는다.
// 예외(2026-10-23 사용자 결정, CLAUDE.md 규칙 3): --schedule 일 때만 '완료'(레이어 열기)와, 발행일이 '예약'이고 그 시각이 10분 넘게 뒤일 때의 마지막 버튼을 통과시킨다. 즉시 발행은 계속 막는다.
// 예외 2(2026-10-23 사용자 결정): --update-published 일 때만, 발행일이 원래의 지난 시각 그대로 선택돼 있으면 마지막 버튼 통과(공개된 글 고치기 — 공개 시각은 안 바뀐다).
export function GUARD({ block, blockText, schedule, republish }) {
  if (window.__cheongyakGuard) return;
  window.__cheongyakGuard = true;
  const reservedLater = () => {
    const on = document.querySelector('.btn_date.on');
    if (!on || on.innerText.trim() !== '예약') return false;
    const d = (document.querySelector('.btn_reserve')?.innerText || '').trim();
    const hm = ['#dateHour', '#dateMinute'].map((s) => String(document.querySelector(s)?.value || '').padStart(2, '0')).join(':');
    const t = new Date(`${d}T${hm}:00`);
    return !isNaN(t) && t - Date.now() > 10 * 60 * 1000;
  };
  const keptPastDate = () => {
    const on = (document.querySelector('.btn_date.on')?.innerText || '').trim();
    const m = on.match(/^(\d{4}-\d\d-\d\d) (\d\d:\d\d)$/);
    return !!m && new Date(`${m[1]}T${m[2]}:00`) < Date.now();
  };
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest && e.target.closest('button, a, [role="button"]');
    if (!t) return;
    if (republish && (t.matches('#publish-layer-btn') || (t.matches('#publish-btn') && keptPastDate()))) return;
    if (schedule && (t.matches('#publish-layer-btn') || (t.matches('#publish-btn') && reservedLater()))) return;
    if (block.some((s) => t.matches(s)) || (t.innerText || '').includes(blockText)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      console.warn('[PUBLISH GUARD] 발행 차단');
    }
  }, true);
}

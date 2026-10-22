// 티스토리 로그인: 전용 브라우저 창을 열고, 사용자가 직접 카카오 로그인한 뒤 창을 닫으면 세션이 남는다.
// node tistory/login.mjs          로그인 창 열기 (아이디·비밀번호는 사람이 입력, 자동화는 입력하지 않음)
// node tistory/login.mjs --check  창 없이 로그인 상태만 확인 (0=로그인됨, 3=로그인 필요)
import { launch, isLoggedIn, saveTistoryCookies, SESSION, BLOG } from './common.mjs';

async function check() {
  const { context, page } = await launch({ headless: true });
  try {
    const ok = await isLoggedIn(page);
    console.log(ok ? `로그인됨 — ${BLOG}/manage 접근 가능` : '로그인 필요 — tistory_login.bat 실행 후 창에서 직접 로그인하세요.');
    return ok;
  } finally {
    await context.close();
  }
}

async function login() {
  const { context, page } = await launch({ headless: false });
  console.log('브라우저 창에서 티스토리(카카오) 로그인을 직접 해 주세요.');
  console.log('로그인 후 관리 화면이 보이면 창을 닫으면 됩니다. 세션 폴더: ' + SESSION);
  // 관리 화면에 도착하면(=로그인 완료) 티스토리 쿠키를 저장해 둔다
  let saved = false;
  page.on('framenavigated', async (f) => {
    if (f !== page.mainFrame() || !f.url().startsWith(BLOG + '/manage')) return;
    const n = await saveTistoryCookies(context).catch(() => 0);
    if (n && !saved) { saved = true; console.log(`로그인 확인 — 티스토리 쿠키 ${n}개 저장. 이제 창을 닫아도 됩니다.`); }
  });
  await page.goto(`https://www.tistory.com/auth/login?redirectUrl=${encodeURIComponent(BLOG + '/manage')}`);
  await new Promise((r) => context.on('close', r));
  if (!saved) console.log('관리 화면에 도착하지 않아 쿠키를 저장하지 못했습니다. 로그인 후 관리 화면이 뜰 때까지 기다린 뒤 창을 닫아 주세요.');
}

if (process.argv.includes('--check')) {
  process.exit((await check()) ? 0 : 3);
} else {
  await login();
  process.exit((await check()) ? 0 : 3);
}

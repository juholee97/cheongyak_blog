// 자동 재로그인 실제 시험: 티스토리 세션 쿠키만 지워 "세션이 끊긴 상태"를 만든 뒤 ensureLogin이 카카오 로그인으로 다시 들어오는지 본다.
// node tistory/relogin.check.mjs   (입력·저장·발행 없음. 성공하면 새 티스토리 쿠키를 저장)
import { launch, ensureLogin, isLoggedIn } from './common.mjs';
const { context, page } = await launch({ headless: true });
try {
  await context.clearCookies({ name: 'TSSESSION' });
  console.log('세션 쿠키 지운 직후 로그인 상태:', (await isLoggedIn(page)) ? '로그인됨(예상 밖)' : '끊김');
  const r = await ensureLogin(page, context);
  console.log(r.ok ? `✓ ${r.how}` : `✗ ${r.reason}`);
  console.log('다시 확인:', (await isLoggedIn(page)) ? '로그인됨' : '끊김');
  process.exitCode = r.ok ? 0 : 3;
} finally {
  await context.close();
}

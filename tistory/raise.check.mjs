// 보안 확인 때 창 올리기(common.mjs raiseWindow → tistory/raise_window.ps1) 자체 점검: node tistory/raise.check.mjs
// 임시 프로필로 화면 있는 브라우저를 띄워 about:blank만 연다(티스토리 접속 없음) → raiseWindow → 그 창이 맨 위(WS_EX_TOPMOST)이고
// 창 한가운데를 가리키면 그 창이 잡히는지(WindowFromPoint → GetAncestor GA_ROOT) raise_window.ps1 -Mode probe로 확인한다. 실패하면 종료 코드 1. 알림음이 한 번 난다.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

if (process.platform !== 'win32') { console.log('윈도우 전용 점검 — 건너뜀'); process.exit(0); }
const dir = await mkdtemp(join(tmpdir(), 'cheongyak-raise-'));
process.env.TISTORY_PROFILE = dir; // 진짜 세션 프로필(data/tistory-session)은 쓰지 않는다
const { launch, raiseWindow, raisePs } = await import('./common.mjs');

const probe = () => new Promise((ok) => {
  const c = raisePs(dir, 'probe', { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
  c.on('error', (e) => ok({ out, err: String(e) }));
  c.on('close', () => ok({ out, err }));
});

let context, failed = true;
try {
  ({ context } = await launch({ headless: false }));
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('about:blank');
  await page.waitForTimeout(1500);

  const t = Date.now();
  const child = raiseWindow(dir);
  if (!child) throw new Error('raiseWindow가 PowerShell을 띄우지 못함');
  const code = await new Promise((ok) => { child.on('exit', ok); setTimeout(() => ok('시간 초과'), 30000); });
  console.log(`raise_window.ps1 -Mode raise 끝: 종료 ${code}, ${Date.now() - t}ms`);
  await page.waitForTimeout(1000); // 올린 뒤 1초 지나도 그대로인지

  const r = await probe();
  console.log(r.out.trim() || '(PowerShell 출력 없음)');
  if (r.err.trim()) console.log('stderr:', r.err.trim());
  const wins = r.out.split(/\r?\n/).filter((l) => l.startsWith('WIN '));
  const how = (r.out.match(/how=(\w+)/) || [])[1];
  if (how && how !== 'pid') console.log(`※ 창을 프로세스(프로필 폴더)로 찾지 못하고 「${how}」 방식으로 찾음`);
  const ok = wins.length > 0 && wins.every((l) => /topmost=True/.test(l) && /hitIsSelf=True/.test(l));
  console.log(ok ? `통과 — 자동화 창 ${wins.length}개가 맨 위이고 가운데 지점이 그 창` : `실패 — ${wins.length ? '맨 위가 아니거나 가운데 지점이 다른 창' : '자동화 창을 찾지 못함'}`);
  failed = !ok;
} catch (e) {
  console.log('실패 —', e.message);
} finally {
  await context?.close().catch(() => {});
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
process.exit(failed ? 1 : 0);

// 무인 저장 알림(2026-11-19 사용자 결정 「저장 요청할 때 PlayMCP로 카톡 나에게 보내기 하나 보내기」): tistory_save_auto.bat(11:30)이
// TISTORY_NOTIFY=kakao를 두면, draft.mjs가 실제 저장하러 브라우저를 띄우기 직전에 카카오톡 「나와의 채팅방」으로 한 통 보낸다 — 보안 확인 창을 사람이 풀 수 있게.
// 보내는 길: 클로드 명령줄을 헤드리스로(claude -p, haiku) 불러 claude.ai 커넥터 PlayMCP의 도구를 쓰게 한다. 도구 이름·인자는 모르므로 서버 단위로만 허용
// (--allowedTools mcp__claude_ai_PlayMCP). 프롬프트는 stdin으로 — 글 제목이 명령줄 인자로 깨지거나 셸에 해석되지 않게.
// 알림 실패는 저장을 막지 않는다: 명령 없음·시간 초과(90초)·도구 없음·실패·호출 한도 모두 기록 한 줄만 남기고 돌아온다. 예외를 던지지 않는다.
// 호출 수 한도는 zip/guard.mjs DEFAULTS.kakao_notify(useApi). 보낼 때만 불러온다 — guard.mjs는 명령줄에 --check가 있으면 자기 점검을 돌리므로 notify.mjs --check에서 불러오지 않게.
// claude 위치는 PATH에 기대지 않고 findClaude가 직접 찾는다(CLAUDE_CMD → PATH → 정해 둔 자리). 못 찾으면 띄우지 않고 「claude 명령 없음」.
// node tistory/notify.mjs --check   보내지 않고 claude 위치·버전(claude --version만)과 메시지 예시(글자 수)만
// node tistory/notify.mjs --test    실제로 시험 메시지 한 통(PlayMCP 도구함에 「카카오톡 나와의 채팅방」을 담은 뒤)
// 점검(가짜 실행기, 네트워크 없음): node tistory/notify.check.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, statSync, readdirSync } from 'node:fs';
import { join, win32 } from 'node:path';
import { tmpdir } from 'node:os';

export const MAX_CHARS = 200;
export const TIMEOUT_MS = 90e3;
export const API = 'kakao_notify';
const HEAD = '[청약달력] 티스토리 저장을 시작해요';
const TAIL = '보안 확인 창이 뜨면 5분 안에 PC에서 풀어 주세요.';
const len = (s) => [...s].length; // 한글·이모지도 한 글자로

const modeLine = (mode, when) => ({
  schedule: `예약 ${when}`,
  'update-scheduled': `예약 글 고치기 (예약 ${when} 그대로)`,
  'update-published': '공개 글 고치기 (공개 시각 그대로)',
  save: '임시저장 (발행은 직접)',
  test: '알림 시험이에요 (저장 없음)',
}[mode] || (when ? `예약 ${when}` : '임시저장'));

// 200자 안으로. 넘으면 제목만 줄이고 끝에 「…」
export function buildMessage({ title = '', when = null, mode = 'save' } = {}) {
  const t = String(title).replace(/\s+/g, ' ').trim() || '(제목 없음)';
  const make = (x) => [HEAD, `글: ${x}`, modeLine(mode, when), TAIL].join('\n');
  let msg = make(t);
  if (len(msg) <= MAX_CHARS) return msg;
  const room = MAX_CHARS - len(make('')) - 1; // 「…」 한 자
  msg = make([...t].slice(0, Math.max(0, room)).join('') + '…');
  return len(msg) <= MAX_CHARS ? msg : [...msg].slice(0, MAX_CHARS).join('');
}

export function buildPrompt(message) {
  return [
    'PlayMCP에 연결된 카카오톡 「나와의 채팅방」(나에게 보내기) 도구로, 아래 <메시지> 사이의 글자를 한 글자도 고치지 말고 그대로 딱 한 번만 보내세요.',
    '- 그 도구를 찾는 일과 그 도구로 한 번 보내는 일 말고는 어떤 도구도 부르지 말고, 다른 행동(파일 읽기·쓰기, 명령 실행, 다른 메시지 보내기, 다시 보내기)도 하지 마세요.',
    '- 끝나면 아래 셋 중 하나를 한 줄만 출력하세요. 다른 말은 쓰지 마세요.',
    '  보냈으면: SENT',
    '  그런 도구가 없으면: NO_TOOL',
    '  보내다 실패하면: FAILED: 이유',
    '<메시지>',
    message,
    '</메시지>',
  ].join('\n');
}

// 자식 출력 풀기: Buffer(또는 문자열)를 UTF-8로, UTF-8로 못 읽는 바이트면 cp949(euc-kr)로 — 한국어 윈도우 cmd의 오류 문구가 깨지지 않게
export function decodeOutput(b) {
  if (b == null) return '';
  if (typeof b === 'string') return b;
  const buf = Buffer.isBuffer(b) ? b : Buffer.from(b);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { /* cp949로 */ }
  try { return new TextDecoder('euc-kr').decode(buf); } catch { return buf.toString('latin1'); }
}
const NOT_FOUND_RE = /배치 파일이 아닙니다|is not recognized/i;
const lastLine = (s) => String(s).trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).at(-1) || '';
const oneLine = (s) => String(s).trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ');

// claude 출력 판독 → { status: 'sent'|'no_tool'|'failed'|'no_cmd', reason? }
export function parseResult({ stdout = '', stderr = '', status = 0, timedOut = false, error = null, noCmd = null } = {}) {
  stdout = decodeOutput(stdout); stderr = decodeOutput(stderr);
  if (noCmd) return { status: 'no_cmd', reason: String(noCmd) }; // findClaude가 못 찾아 띄우지 않음
  if (timedOut) return { status: 'failed', reason: `시간 초과 ${TIMEOUT_MS / 1000}초` };
  if (error) return { status: 'no_cmd', reason: String(error.code || error.message || error) };
  if (status === 9009) return { status: 'no_cmd', reason: 'claude 명령 없음(cmd 9009)' }; // cmd /c 에서 명령을 못 찾을 때
  // cmd /c 는 명령을 못 찾으면 1로 끝나기도 한다(2026-11-19 11:30 스케줄러 실행: 「…배치 파일이 아닙니다.」 cp949)
  if (status === 1 && NOT_FOUND_RE.test(`${stderr}\n${stdout}`)) return { status: 'no_cmd', reason: `cmd가 claude를 못 찾음(종료 1 · ${oneLine(stderr || stdout).slice(0, 120)})` };
  const lines = String(stdout).split(/\r?\n/).map((l) => l.trim().replace(/^[`*]+|[`*]+$/g, '')).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    const f = l.match(/^FAILED\b:?\s*(.*)$/);
    if (f) return { status: 'failed', reason: f[1].slice(0, 80) || '이유 없음' };
    if (/^NO_TOOL\b/.test(l)) return { status: 'no_tool' };
    if (/^SENT\b/.test(l)) return { status: 'sent' };
  }
  const tail = (lines.at(-1) || lastLine(stderr) || '').slice(0, 120);
  return { status: 'failed', reason: status ? `종료 코드 ${status}${tail ? ' · ' + tail : ''}` : `알 수 없는 응답${tail ? ': ' + tail : ''}` };
}

export const describe = (r) => ({
  sent: '카톡 알림: 보냄',
  no_tool: '카톡 알림: 도구 없음 — PlayMCP 도구함에 「카카오톡 나와의 채팅방」을 담아야 보냄',
  no_cmd: `카톡 알림: claude 명령 없음(${r.reason})`,
  skipped: `카톡 알림: 건너뜀(${r.reason})`,
}[r.status] || `카톡 알림: 실패(${r.reason})`);

// 작업 폴더 = 저장소 밖의 빈 폴더(저장소 CLAUDE.md가 실리지 않게)
const workDir = () => { const d = join(tmpdir(), 'cheongyak-notify'); try { mkdirSync(d, { recursive: true }); } catch { /* 없으면 아래 spawn이 오류로 알려 줌 */ } return d; };

export const CLAUDE_ARGS = ['-p', '--model', 'haiku', '--allowedTools', 'mcp__claude_ai_PlayMCP', '--permission-mode', 'dontAsk', '--no-session-persistence'];

// claude 위치 찾기(2026-11-19: 11:30 스케줄러 실행에서 cmd가 PATH로 claude를 못 찾아 첫 알림 실패 → PATH에 기대지 않고 직접 찾는다).
// 윈도우 순서: CLAUDE_CMD → PATH(Path) 각 폴더의 claude.cmd·claude.exe → 정해 둔 자리
// (%APPDATA%\fnm\node-versions\*\installation\claude.cmd 중 가장 최근에 고쳐진 것, %APPDATA%\npm\claude.cmd, %USERPROFILE%\.local\bin\claude.exe).
// 돌려줌: { path, source: 'CLAUDE_CMD'|'PATH'|'정해 둔 자리', kind: 'cmd'|'exe'|'bin', tried } 또는 { path: null, tried }
// opts.env·platform·fs(isFile·readdir·mtime)는 점검용 가짜를 넣는 자리
const realFs = {
  isFile: (p) => { try { return statSync(p).isFile(); } catch { return false; } },
  readdir: (d) => { try { return readdirSync(d); } catch { return []; } },
  mtime: (p) => { try { return statSync(p).mtimeMs; } catch { return 0; } },
};
export function findClaude({ env = process.env, platform = process.platform, fs = realFs } = {}) {
  if (platform !== 'win32') return { path: 'claude', source: 'PATH', kind: 'bin', tried: 0 };
  const get = (name) => { const k = Object.keys(env).find((x) => x.toUpperCase() === name); return k ? env[k] : undefined; };
  let tried = 0;
  const hit = (p) => { tried++; return fs.isFile(p); };
  const kindOf = (p) => (/\.exe$/i.test(p) ? 'exe' : 'cmd');
  const own = (get('CLAUDE_CMD') || '').trim().replace(/^"|"$/g, '');
  if (own && hit(own)) return { path: own, source: 'CLAUDE_CMD', kind: kindOf(own), tried };
  const dirs = String(get('PATH') || '').split(';').map((d) => d.trim().replace(/^"|"$/g, '')).filter(Boolean);
  for (const d of dirs) for (const n of ['claude.cmd', 'claude.exe']) { const p = win32.join(d, n); if (hit(p)) return { path: p, source: 'PATH', kind: kindOf(p), tried }; }
  const appData = get('APPDATA'), home = get('USERPROFILE');
  const fixed = [];
  if (appData) {
    const base = win32.join(appData, 'fnm', 'node-versions');
    const fnm = fs.readdir(base).map((v) => win32.join(base, v, 'installation', 'claude.cmd')).filter(hit);
    fnm.sort((a, b) => fs.mtime(b) - fs.mtime(a));
    if (fnm[0]) return { path: fnm[0], source: '정해 둔 자리', kind: 'cmd', tried };
    fixed.push(win32.join(appData, 'npm', 'claude.cmd'));
  }
  if (home) fixed.push(win32.join(home, '.local', 'bin', 'claude.exe'));
  for (const p of fixed) if (hit(p)) return { path: p, source: '정해 둔 자리', kind: kindOf(p), tried };
  return { path: null, source: null, kind: null, tried };
}

// 띄울 모양: .exe면 바로, .cmd면 cmd.exe /d /s /c ""경로" 인자…" (windowsVerbatimArguments — /s가 바깥 따옴표 한 쌍만 벗겨 경로의 빈칸이 안전)
export function spawnPlan(found, args) {
  if (found.kind === 'cmd') return { file: 'cmd.exe', args: ['/d', '/s', '/c', `""${found.path}" ${args.join(' ')}"`], verbatim: true };
  return { file: found.path, args: [...args], verbatim: false };
}

// claude 실행(인자는 고정 ASCII, 프롬프트는 stdin). 시간이 넘으면 프로세스 트리째 끈다(cmd만 끄면 claude가 남는다).
// windowsHide + 모든 입출력 파이프 → 자식은 콘솔이 없다(claude.cmd의 title 명령이 실행기 창 제목을 바꾸지 않음).
// 못 찾으면 띄우지 않고 { noCmd } — parseResult가 no_cmd로. 결과의 claude에 찾은 위치.
export function runClaude(args, input, timeoutMs = TIMEOUT_MS, opts = {}) {
  return new Promise((done) => {
    const win = process.platform === 'win32';
    const found = opts.found || findClaude();
    if (!found.path) { done({ stdout: '', stderr: '', status: null, noCmd: `claude 위치 못 찾음(찾아본 자리 ${found.tried}곳)`, claude: found }); return; }
    const plan = spawnPlan(found, args);
    let child, timedOut = false, finished = false;
    const out = [], err = [];
    const finish = (r) => { if (!finished) { finished = true; clearTimeout(timer); done({ stdout: decodeOutput(Buffer.concat(out)), stderr: decodeOutput(Buffer.concat(err)), claude: found, ...r }); } };
    try {
      child = spawn(plan.file, plan.args, { cwd: workDir(), windowsHide: true, windowsVerbatimArguments: plan.verbatim, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { done({ stdout: '', stderr: '', status: null, error: e, claude: found }); return; }
    const timer = setTimeout(() => {
      timedOut = true;
      try { if (win) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {}); else child.kill('SIGKILL'); } catch { /* 무시 */ }
      setTimeout(() => finish({ status: null, timedOut: true }), 3000).unref?.(); // 끄는 데 늦어도 기다리지 않는다
    }, timeoutMs);
    child.stdout.on('data', (d) => out.push(Buffer.from(d)));
    child.stderr.on('data', (d) => err.push(Buffer.from(d)));
    child.on('error', (e) => finish({ status: null, error: e, timedOut }));
    child.on('close', (code) => finish({ status: code, timedOut }));
    child.stdin.on('error', () => {});
    child.stdin.end(input == null ? '' : Buffer.from(input, 'utf8'));
  });
}

// 실제 보내기(환경 변수 검사 없음). opts.run·opts.use는 점검용 가짜를 넣는 자리
export async function sendKakao(message, opts = {}) {
  const run = opts.run || ((input) => runClaude(CLAUDE_ARGS, input));
  try { const use = opts.use || (await import('../zip/guard.mjs')).useApi; use(API); } catch (e) { return { status: 'skipped', reason: /API_BUDGET/.test(e?.message || '') ? '호출 한도 — zip/guard.mjs kakao_notify' : `한도 확인 실패: ${e?.message || e}` }; }
  try { return parseResult(await run(buildPrompt(message))); } catch (e) { return { status: 'failed', reason: e?.message || String(e) }; }
}

// draft.mjs가 부른다. TISTORY_NOTIFY=kakao가 아니면 바로 null. 결과는 기록 한 줄로 찍고 돌려준다. 절대 던지지 않는다.
export async function notifySave({ title, when, mode } = {}, opts = {}) {
  const env = opts.env || process.env;
  if (env.TISTORY_NOTIFY !== 'kakao') return null;
  const log = opts.log || ((s) => console.log(s));
  let r;
  try { r = await sendKakao(buildMessage({ title, when, mode }), opts); } catch (e) { r = { status: 'failed', reason: e?.message || String(e) }; }
  const line = describe(r);
  try { log(line); } catch { /* 무시 */ }
  return { ...r, line };
}

if (process.argv[1] && /notify\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  if (process.argv.includes('--check')) {
    const where = findClaude();
    console.log(where.path ? `claude 위치: ${where.path}  (${where.source}에서 찾음, 띄우기 ${where.kind === 'cmd' ? 'cmd.exe /d /s /c' : '바로'})` : `claude 위치: 못 찾음 (찾아본 자리 ${where.tried}곳 — PATH·정해 둔 자리·CLAUDE_CMD)`);
    const v = await runClaude(['--version'], '', 20e3, { found: where });
    const found = v.status === 0 && /\d+\.\d+/.test(v.stdout);
    console.log(found ? `claude 명령 있음: ${v.stdout.trim()}` : `claude 명령 없음/실패: ${v.noCmd || v.error?.code || (v.timedOut ? '시간 초과' : `종료 ${v.status}`)} ${oneLine(v.stderr || v.stdout).slice(0, 120)}`);
    console.log(`TISTORY_NOTIFY=${process.env.TISTORY_NOTIFY || '(없음 — 이 실행에선 알림 안 보냄)'}`);
    console.log(`보낼 명령: ${where.path || 'claude'} ${CLAUDE_ARGS.join(' ')}  (작업 폴더 ${join(tmpdir(), 'cheongyak-notify')}, 제한 ${TIMEOUT_MS / 1000}초)`);
    const samples = [
      { title: '청년 전세임대 신청 방법, 서류와 순서 한 번에 정리', when: '2026-11-20 15:38', mode: 'schedule' },
      { title: '2026년 11월 넷째 주 청약 일정', mode: 'save' },
      { title: '아주 긴 제목 '.repeat(30).trim(), when: '2026-11-21 12:07', mode: 'schedule' },
    ];
    for (const s of samples) { const m = buildMessage(s); console.log(`\n--- 메시지 예시 (${len(m)}자 / ${MAX_CHARS}자)\n${m}`); }
    console.log('\n점검 끝 — 아무것도 보내지 않음');
    process.exit(found ? 0 : 1);
  } else if (process.argv.includes('--test')) {
    const r = await sendKakao(buildMessage({ title: '카톡 알림 시험', mode: 'test' }));
    console.log(describe(r));
    process.exit(r.status === 'sent' ? 0 : 1);
  } else {
    console.log('사용: node tistory/notify.mjs --check (보내지 않음) | --test (시험 한 통 보냄)');
  }
}

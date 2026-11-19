// 카톡 알림(tistory/notify.mjs) 자체 점검 — 가짜 실행기만 쓴다. claude를 부르지 않고 아무것도 보내지 않는다: node tistory/notify.check.mjs
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildMessage, buildPrompt, parseResult, notifySave, MAX_CHARS, CLAUDE_ARGS, findClaude, spawnPlan, decodeOutput, runClaude, describe, tokenFromEnvText, claudeToken, childEnv } from './notify.mjs';

process.env.ZIP_USAGE_FILE = join(mkdtempSync(join(tmpdir(), 'notify-check-')), 'u.json'); // 진짜 data/api_usage.json은 건드리지 않는다
const len = (s) => [...s].length;

// 메시지: 4줄, 예약이면 「예약 시각」, 200자 이내
const m = buildMessage({ title: '청년 전세임대 신청 방법', when: '2026-11-20 15:38', mode: 'schedule' });
assert.deepEqual(m.split('\n'), ['[청약달력] 티스토리 저장을 시작해요', '글: 청년 전세임대 신청 방법', '예약 2026-11-20 15:38', '보안 확인 창이 뜨면 5분 안에 PC에서 풀어 주세요.']);
assert.match(buildMessage({ title: 'x', mode: 'save' }), /\n임시저장/);
assert.match(buildMessage({ title: 'x', when: '2026-11-01 12:07', mode: 'update-published' }), /공개 글 고치기/);
assert.match(buildMessage({ title: 'x', when: '2026-11-21 12:07', mode: 'update-scheduled' }), /예약 2026-11-21 12:07 그대로/);
// 긴 제목은 줄여서 200자 안, 끝에 「…」, 나머지 줄은 그대로
const long = buildMessage({ title: '가'.repeat(400), when: '2026-11-21 12:07', mode: 'schedule' });
assert.ok(len(long) <= MAX_CHARS, `긴 제목 ${len(long)}자`);
assert.equal(len(long), MAX_CHARS);
assert.match(long.split('\n')[1], /^글: 가+…$/);
assert.equal(long.split('\n')[2], '예약 2026-11-21 12:07');
assert.equal(long.split('\n')[3], '보안 확인 창이 뜨면 5분 안에 PC에서 풀어 주세요.');
assert.ok(len(buildMessage({ title: '😀'.repeat(300), mode: 'save' })) <= MAX_CHARS); // 이모지(서로게이트 쌍)도 반으로 잘리지 않게 글자 단위
assert.match(buildMessage({ title: '  여러\n줄   제목 ' }), /\n글: 여러 줄 제목\n/);
// 프롬프트에 메시지가 그대로, 셋 중 한 줄 출력 지시. 제목에 셸 특수문자가 있어도 인자가 아니라 stdin 글자일 뿐
const odd = buildMessage({ title: 'a & b | "c" %PATH% ^ <d>', mode: 'save' });
assert.ok(buildPrompt(odd).includes(odd));
assert.match(buildPrompt(odd), /SENT[\s\S]*NO_TOOL[\s\S]*FAILED: 이유/);
assert.ok(CLAUDE_ARGS.every((a) => /^[\w,-]+$/.test(a)), '명령줄 인자는 고정 ASCII만(빈칸·따옴표 없음)');
assert.deepEqual(CLAUDE_ARGS.slice(0, 5), ['-p', '--model', 'haiku', '--allowedTools', 'mcp__claude_ai_PlayMCP,mcp__playmcp']);
// 프롬프트: 두 서버의 도구 이름, 둘 다 있으면 playmcp 하나만, 보내기는 딱 한 번
const pr = buildPrompt(odd);
assert.ok(pr.includes('mcp__playmcp__KakaotalkChat-MemoChat') && pr.includes('mcp__claude_ai_PlayMCP__KakaotalkChat-MemoChat'));
assert.match(pr, /둘 다 있으면 mcp__playmcp__KakaotalkChat-MemoChat 하나만/);
assert.match(pr, /딱 한 번[\s\S]*다른 쪽으로 다시 보내지 말고/);

// 출력 판독
assert.equal(parseResult({ stdout: 'SENT\n' }).status, 'sent');
assert.equal(parseResult({ stdout: '보냈습니다.\n**SENT**' }).status, 'sent');
assert.equal(parseResult({ stdout: 'NO_TOOL' }).status, 'no_tool');
assert.deepEqual(parseResult({ stdout: 'FAILED: 권한 없음' }), { status: 'failed', reason: '권한 없음' });
assert.equal(parseResult({ stdout: '', timedOut: true }).status, 'failed');
assert.match(parseResult({ stdout: '', timedOut: true }).reason, /시간 초과 90초/);
assert.equal(parseResult({ status: 9009, stderr: "'claude' is not recognized" }).status, 'no_cmd');
assert.equal(parseResult({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) }).status, 'no_cmd');
assert.match(parseResult({ stdout: '음… 모르겠어요', status: 0 }).reason, /알 수 없는 응답/);
assert.match(parseResult({ stdout: '', stderr: 'boom', status: 1 }).reason, /종료 코드 1/);
// 로그인 풀림(2026-11-19·20 실제 출력 셋, 종료 1) → no_login. stdout·stderr 어느 쪽이든, 종료 코드와 상관없이
const revoked = 'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"OAuth access token has been revoked."},"request_id":"req_x"}';
const expired = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const notIn = 'Not logged in · Please run /login';
for (const s of [revoked, expired, notIn]) {
  assert.equal(parseResult({ stdout: s, status: 1 }).status, 'no_login', s);
  assert.equal(parseResult({ stderr: s + '\n', status: 1 }).status, 'no_login', s);
  assert.equal(parseResult({ stdout: s, status: 0 }).status, 'no_login', s);
  assert.equal(parseResult({ stderr: Buffer.from(s, 'utf8'), status: null }).status, 'no_login', s);
}
assert.equal(describe(parseResult({ stdout: notIn, status: 1 })), '카톡 알림: 클로드 로그인 풀림 — 터미널에서 claude 를 띄워 /login 해야 보냄');
assert.equal(parseResult({ stdout: 'Please run /login', status: 1 }).status, 'no_login');
assert.equal(parseResult({ stdout: 'not logged in', status: 1 }).status, 'no_login');
// 약속한 한 줄이 있으면 그쪽이 먼저(카카오 쪽 인증 실패를 모델이 FAILED로 알린 경우는 그대로 실패)
assert.deepEqual(parseResult({ stdout: 'FAILED: authentication_error from kakao', status: 0 }), { status: 'failed', reason: 'authentication_error from kakao' });
assert.equal(parseResult({ stdout: 'SENT', stderr: 'warn', status: 0 }).status, 'sent');
// 로그인과 무관한 종료 1은 지금처럼 실패
assert.equal(parseResult({ stdout: 'Error: something else', status: 1 }).status, 'failed');

// notifySave: 환경 변수 없으면 무동작(실행기·한도 둘 다 안 부름)
let calls = 0;
const fake = (out) => async (input) => { calls++; assert.ok(input.includes('<메시지>')); return out; };
assert.equal(await notifySave({ title: 't' }, { env: {}, run: fake({ stdout: 'SENT' }), use: () => { throw new Error('불리면 안 됨'); }, log: () => {} }), null);
assert.equal(await notifySave({ title: 't' }, { env: { TISTORY_NOTIFY: '1' }, run: fake({ stdout: 'SENT' }), log: () => {} }), null);
assert.equal(calls, 0);

// 켜져 있으면 결과마다 기록 한 줄, 예외 없이 돌아옴
const on = { TISTORY_NOTIFY: 'kakao' };
const lines = [];
const opts = (run, use = () => {}) => ({ env: on, run, use, log: (s) => lines.push(s) });
assert.equal((await notifySave({ title: 't', when: '2026-11-20 15:38', mode: 'schedule' }, opts(fake({ stdout: 'SENT', status: 0 })))).status, 'sent');
assert.equal((await notifySave({ title: 't' }, opts(fake({ stdout: 'NO_TOOL', status: 0 })))).status, 'no_tool');
assert.equal((await notifySave({ title: 't' }, opts(fake({ stdout: 'FAILED: 서버 오류', status: 0 })))).status, 'failed');
assert.equal((await notifySave({ title: 't' }, opts(fake({ stdout: '', status: null, timedOut: true })))).status, 'failed');
assert.equal((await notifySave({ title: 't' }, opts(async () => { throw new Error('spawn 터짐'); }))).status, 'failed');
assert.equal((await notifySave({ title: 't' }, opts(fake({ status: 9009 })))).status, 'no_cmd');
const nl = await notifySave({ title: 't' }, opts(fake({ stdout: 'Not logged in · Please run /login', status: 1 })));
assert.deepEqual([nl.status, nl.line], ['no_login', '카톡 알림: 클로드 로그인 풀림 — 터미널에서 claude 를 띄워 /login 해야 보냄']);
assert.deepEqual(lines.slice(0, 3), ['카톡 알림: 보냄', '카톡 알림: 도구 없음 — PlayMCP 연결(인증)이 풀렸거나 도구함에 「카카오톡 나와의 채팅방」이 없음(claude mcp list로 확인)', '카톡 알림: 실패(서버 오류)']);
assert.match(lines[3], /^카톡 알림: 실패\(시간 초과 90초\)$/);
assert.match(lines[4], /^카톡 알림: 실패\(spawn 터짐\)$/);
assert.match(lines[5], /^카톡 알림: claude 명령 없음/);
// 기록 함수가 터져도 던지지 않음
assert.equal((await notifySave({ title: 't' }, { env: on, run: fake({ stdout: 'SENT' }), use: () => {}, log: () => { throw new Error('x'); } })).status, 'sent');

// 호출 한도(진짜 zip/guard.mjs, 임시 사용량 파일): 하루 5번 뒤엔 실행기를 부르지 않고 「건너뜀」만
calls = 0;
const real = [];
for (let i = 0; i < 7; i++) real.push(await notifySave({ title: 't' }, { env: on, run: fake({ stdout: 'SENT' }), log: (s) => lines.push(s) }));
assert.deepEqual(real.map((r) => r.status), ['sent', 'sent', 'sent', 'sent', 'sent', 'skipped', 'skipped']);
assert.equal(calls, 5);
assert.match(real[5].line, /^카톡 알림: 건너뜀\(호출 한도/);

// claude 위치 찾기(가짜 파일 목록·환경 — 진짜 디스크·PATH는 안 봄)
const fakeFs = (files) => {
  const norm = (p) => p.toLowerCase();
  const map = new Map(Object.entries(files).map(([p, t]) => [norm(p), t]));
  return {
    isFile: (p) => map.has(norm(p)),
    readdir: (d) => { const pre = norm(d).replace(/\\$/, '') + '\\'; return [...new Set(Object.keys(files).filter((k) => norm(k).startsWith(pre)).map((k) => k.slice(pre.length).split('\\')[0]))]; },
    mtime: (p) => map.get(norm(p)) || 0,
  };
};
const AD = 'C:\\Users\\u\\AppData\\Roaming', HOME = 'C:\\Users\\u';
const fnmOld = `${AD}\\fnm\\node-versions\\v20.1.0\\installation\\claude.cmd`, fnmNew = `${AD}\\fnm\\node-versions\\v22.22.2\\installation\\claude.cmd`;
const baseEnv = { APPDATA: AD, USERPROFILE: HOME, Path: 'C:\\Program Files\\nodejs;C:\\Windows\\system32;C:\\Windows' };
const native = `${HOME}\\.local\\bin\\claude.exe`;
// 새 설치본(%USERPROFILE%\.local\bin\claude.exe)이 PATH·fnm·npm보다 먼저, 출처 「새 설치본」
let f = findClaude({ platform: 'win32', env: { ...baseEnv, Path: 'C:\\x' }, fs: fakeFs({ 'C:\\x\\claude.cmd': 1, [fnmNew]: 900, [`${AD}\\npm\\claude.cmd`]: 1, [native]: 1 }) });
assert.deepEqual([f.path, f.source, f.kind], [native, '새 설치본', 'exe']);
f = findClaude({ platform: 'win32', env: baseEnv, fs: fakeFs({ [native]: 1 }) });
assert.deepEqual([f.path, f.source, f.kind], [native, '새 설치본', 'exe']);
f = findClaude({ platform: 'win32', env: baseEnv, fs: fakeFs({ [`${AD}\\npm\\claude.cmd`]: 1, [native]: 1 }) });
assert.equal(f.source, '새 설치본');
// 새 설치본이 PATH 안에 있어도 출처는 「새 설치본」(먼저 봄)
f = findClaude({ platform: 'win32', env: { ...baseEnv, Path: `${HOME}\\.local\\bin` }, fs: fakeFs({ [native]: 1 }) });
assert.deepEqual([f.path, f.source], [native, '새 설치본']);
// 새 설치본이 없으면 PATH(fnm보다 먼저)
f = findClaude({ platform: 'win32', env: { ...baseEnv, Path: 'C:\\x' }, fs: fakeFs({ 'C:\\x\\claude.cmd': 1, [fnmNew]: 900 }) });
assert.deepEqual([f.path, f.source, f.kind], ['C:\\x\\claude.cmd', 'PATH', 'cmd']);
// PATH에도 없으면 정해 둔 자리(fnm, 여러 버전이면 가장 최근에 고쳐진 것 → npm)
f = findClaude({ platform: 'win32', env: baseEnv, fs: fakeFs({ [fnmOld]: 100, [fnmNew]: 200, [`${AD}\\npm\\claude.cmd`]: 300 }) });
assert.deepEqual([f.path, f.source, f.kind], [fnmNew, '정해 둔 자리', 'cmd']);
f = findClaude({ platform: 'win32', env: baseEnv, fs: fakeFs({ [fnmOld]: 300, [fnmNew]: 200 }) });
assert.equal(f.path, fnmOld);
f = findClaude({ platform: 'win32', env: baseEnv, fs: fakeFs({ [`${AD}\\npm\\claude.cmd`]: 1 }) });
assert.deepEqual([f.path, f.source, f.kind], [`${AD}\\npm\\claude.cmd`, '정해 둔 자리', 'cmd']);
// PATH 안에선 앞 폴더 먼저(대소문자 Path·PATH 둘 다), 폴더 안에선 .cmd → .exe
f = findClaude({ platform: 'win32', env: { ...baseEnv, Path: `C:\\Tools;"C:\\My Bin"` }, fs: fakeFs({ 'C:\\My Bin\\claude.exe': 1, 'C:\\My Bin\\claude.cmd': 1, [fnmNew]: 1 }) });
assert.deepEqual([f.path, f.source, f.kind], ['C:\\My Bin\\claude.cmd', 'PATH', 'cmd']);
f = findClaude({ platform: 'win32', env: { APPDATA: AD, PATH: 'C:\\x' }, fs: fakeFs({ 'C:\\x\\claude.exe': 1, [fnmNew]: 1 }) });
assert.deepEqual([f.path, f.source, f.kind], ['C:\\x\\claude.exe', 'PATH', 'exe']);
// CLAUDE_CMD가 맨 먼저(파일이 있을 때만 — 새 설치본보다도 먼저)
f = findClaude({ platform: 'win32', env: { ...baseEnv, CLAUDE_CMD: 'D:\\x\\claude.exe' }, fs: fakeFs({ 'D:\\x\\claude.exe': 1, [fnmNew]: 1, [native]: 1 }) });
assert.deepEqual([f.path, f.source], ['D:\\x\\claude.exe', 'CLAUDE_CMD']);
f = findClaude({ platform: 'win32', env: { ...baseEnv, CLAUDE_CMD: 'D:\\없음\\claude.exe' }, fs: fakeFs({ [fnmNew]: 1 }) });
assert.equal(f.source, '정해 둔 자리');
// 어디에도 없으면 path null + 찾아본 자리 수, runClaude는 띄우지 않고 noCmd → no_cmd
f = findClaude({ platform: 'win32', env: baseEnv, fs: fakeFs({}) });
assert.equal(f.path, null);
assert.ok(f.tried >= 8, `찾아본 자리 ${f.tried}`); // .local + PATH 3폴더×2 + npm
const r0 = await runClaude(['--version'], '', 1000, { found: f }); // 진짜 runClaude지만 띄우지 않고 바로 돌아옴
assert.equal(r0.status, null);
assert.match(r0.noCmd, /claude 위치 못 찾음\(찾아본 자리 \d+곳\)/);
assert.equal(parseResult(r0).status, 'no_cmd');
assert.match(describe(parseResult(r0)), /^카톡 알림: claude 명령 없음\(claude 위치 못 찾음/);
// 윈도우가 아니면 지금처럼 claude
assert.deepEqual(findClaude({ platform: 'linux', env: {}, fs: fakeFs({}) }).path, 'claude');

// 장기 토큰 읽기(글자 그대로의 가짜 .env — 진짜 .env는 안 읽음)
const K = 'CLAUDE_CODE_OAUTH_TOKEN';
assert.equal(tokenFromEnvText(''), '');
assert.equal(tokenFromEnvText(null), '');
assert.equal(tokenFromEnvText('OTHER=1\nTISTORY_NOTIFY=kakao\n'), ''); // 키 없음
assert.equal(tokenFromEnvText(`${K}=\n`), ''); // 빈 값
assert.equal(tokenFromEnvText(`${K}=   \n`), '');
assert.equal(tokenFromEnvText(`${K}=""\n`), '');
assert.equal(tokenFromEnvText(`${K}=sk-ant-oat01-abc_DEF-123`), 'sk-ant-oat01-abc_DEF-123');
assert.equal(tokenFromEnvText(`${K}="sk-ant-oat01-q"`), 'sk-ant-oat01-q'); // 큰따옴표
assert.equal(tokenFromEnvText(`${K}='sk-ant-oat01-s'`), 'sk-ant-oat01-s'); // 작은따옴표
assert.equal(tokenFromEnvText(`${K} = "sk-ant-oat01-sp" `), 'sk-ant-oat01-sp'); // = 앞뒤 빈칸
assert.equal(tokenFromEnvText(`A=1\r\n${K}=sk-ant-oat01-crlf\r\nB=2\r\n`), 'sk-ant-oat01-crlf'); // CRLF
assert.equal(tokenFromEnvText(`# ${K}=sk-ant-oat01-old\n`), ''); // 주석 줄
assert.equal(tokenFromEnvText(`#${K}=sk-ant-oat01-old\n  # ${K}=x\n${K}=sk-ant-oat01-new`), 'sk-ant-oat01-new');
assert.equal(tokenFromEnvText(`MY_${K}=nope\n${K}_OLD=nope\nX_CLAUDE=1`), ''); // 다른 키는 무시
assert.equal(tokenFromEnvText(`export ${K}=sk-ant-oat01-exp`), 'sk-ant-oat01-exp');
assert.equal(tokenFromEnvText(`${K}=sk-ant-oat01-c # 1년 토큰`), 'sk-ant-oat01-c'); // 따옴표 없는 값 뒤 주석
assert.equal(tokenFromEnvText(`\uFEFF${K}=sk-ant-oat01-bom`), 'sk-ant-oat01-bom'); // BOM
assert.equal(tokenFromEnvText(`${K}=a\n${K}=b`), 'b'); // 여러 줄이면 마지막
// 어디서 찾았나: 환경 변수 먼저, 비었으면 .env, 둘 다 없으면 null. 자식 env는 .env에서 찾았을 때만 사본
let envReads = 0;
const fakeRead = (t) => () => { envReads++; return t; };
assert.deepEqual(claudeToken({ env: { [K]: 'from-env' }, readText: fakeRead(`${K}=from-file`) }), { token: 'from-env', from: '환경 변수' });
assert.equal(envReads, 0); // 환경 변수에 있으면 .env는 안 읽음
assert.deepEqual(claudeToken({ env: { [K]: '  ' }, readText: fakeRead(`${K}=from-file`) }), { token: 'from-file', from: '.env' });
assert.deepEqual(claudeToken({ env: {}, readText: fakeRead('A=1') }), { token: '', from: null });
assert.deepEqual(claudeToken({ env: {}, readText: () => { throw new Error('읽기 실패'); } }), { token: '', from: null });
const base = { PATH: 'C:\\x', TISTORY_NOTIFY: 'kakao' };
const ce = childEnv({ env: base, readText: fakeRead(`${K}="from-file"`) });
assert.deepEqual(ce, { ...base, [K]: 'from-file' });
assert.equal(base[K], undefined); // 넘겨준 env(process.env 자리)는 안 바뀜
assert.equal(childEnv({ env: { ...base, [K]: 'from-env' }, readText: fakeRead(`${K}=from-file`) }), undefined); // 그대로 물려받음
assert.equal(childEnv({ env: base, readText: fakeRead('') }), undefined);

// 띄울 모양: .cmd는 cmd /d /s /c ""경로" 인자…"(verbatim), .exe는 바로
const sp = spawnPlan({ path: 'C:\\Program Files\\my tools\\claude.cmd', kind: 'cmd' }, CLAUDE_ARGS);
assert.equal(sp.file, 'cmd.exe');
assert.equal(sp.verbatim, true);
assert.deepEqual(sp.args.slice(0, 3), ['/d', '/s', '/c']);
assert.equal(sp.args[3], `""C:\\Program Files\\my tools\\claude.cmd" ${CLAUDE_ARGS.join(' ')}"`);
const spe = spawnPlan({ path: 'C:\\Users\\u\\.local\\bin\\claude.exe', kind: 'exe' }, ['--version']);
assert.deepEqual(spe, { file: 'C:\\Users\\u\\.local\\bin\\claude.exe', args: ['--version'], verbatim: false });

// 출력 풀기: UTF-8은 그대로, cp949 바이트는 읽히는 글자로
const notFoundMsg = "'claude'은(는) 내부 또는 외부 명령, 실행할 수 있는 프로그램, 또는\r\n배치 파일이 아닙니다.\r\n";
const enc949 = (s) => { // 점검용 cp949 인코더: euc-kr 디코더로 2바이트 표를 거꾸로 만든다
  const dec = new TextDecoder('euc-kr'); const table = new Map();
  for (let a = 0x81; a <= 0xfe; a++) for (let b = 0x41; b <= 0xfe; b++) { const ch = dec.decode(Buffer.from([a, b])); if ([...ch].length === 1 && ch !== '\ufffd' && !table.has(ch)) table.set(ch, [a, b]); }
  return Buffer.from([...s].flatMap((ch) => (ch.charCodeAt(0) < 0x80 ? [ch.charCodeAt(0)] : table.get(ch))));
};
const nf949 = enc949(notFoundMsg);
assert.notEqual(nf949.toString('utf8'), notFoundMsg); // UTF-8로 읽으면 깨짐(로그의 「��ġ ������ �ƴմϴ�」)
assert.equal(decodeOutput(nf949), notFoundMsg);
assert.equal(decodeOutput(Buffer.from('SENT 보냄', 'utf8')), 'SENT 보냄');
assert.equal(decodeOutput('이미 문자열'), '이미 문자열');
assert.equal(decodeOutput(null), '');

// 「배치 파일이 아닙니다」 + 종료 1 → no_cmd (Buffer로 와도, 영어 문구여도)
const nf = parseResult({ status: 1, stderr: nf949, stdout: Buffer.alloc(0) });
assert.equal(nf.status, 'no_cmd');
assert.match(nf.reason, /배치 파일이 아닙니다/);
assert.equal(parseResult({ status: 1, stderr: "'claude' is not recognized as an internal or external command," }).status, 'no_cmd');
assert.equal(parseResult({ status: 2, stderr: '배치 파일이 아닙니다.' }).status, 'failed'); // 1일 때만
// 실패 이유 꼬리는 120자까지
const longErr = 'e'.repeat(200);
assert.equal(parseResult({ status: 3, stderr: longErr }).reason, `종료 코드 3 · ${'e'.repeat(120)}`);
// 켜진 알림에서도 명령 못 찾음은 no_cmd 한 줄
assert.match((await notifySave({ title: 't' }, opts(fake({ status: 1, stderr: nf949 }), () => {}))).line, /^카톡 알림: claude 명령 없음\(cmd가 claude를 못 찾음/);

console.log('notify.check 통과');

// 카톡 알림(tistory/notify.mjs) 자체 점검 — 가짜 실행기만 쓴다. claude를 부르지 않고 아무것도 보내지 않는다: node tistory/notify.check.mjs
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildMessage, buildPrompt, parseResult, notifySave, MAX_CHARS, CLAUDE_ARGS } from './notify.mjs';

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
assert.ok(CLAUDE_ARGS.every((a) => /^[\w-]+$/.test(a)), '명령줄 인자는 고정 ASCII만');
assert.deepEqual(CLAUDE_ARGS.slice(0, 5), ['-p', '--model', 'haiku', '--allowedTools', 'mcp__claude_ai_PlayMCP']);

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
assert.deepEqual(lines.slice(0, 3), ['카톡 알림: 보냄', '카톡 알림: 도구 없음 — PlayMCP 도구함에 「카카오톡 나와의 채팅방」을 담아야 보냄', '카톡 알림: 실패(서버 오류)']);
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

console.log('notify.check 통과');

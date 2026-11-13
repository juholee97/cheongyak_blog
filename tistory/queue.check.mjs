// 하루 저장 한도 값·대기열 날짜 판정 자체 점검(네트워크 없음): node tistory/queue.check.mjs
import assert from 'node:assert/strict';
import { dayMax, dueOn, queueLeft } from './common.mjs';

// TISTORY_DAY_MAX: 없거나 이상하면 3, 낮추기만(올리지 못함)
delete process.env.TISTORY_DAY_MAX;
assert.equal(dayMax(undefined), 3);
assert.equal(dayMax(''), 3);
assert.equal(dayMax('x'), 3);
assert.equal(dayMax('1'), 1);
assert.equal(dayMax('0'), 0);
assert.equal(dayMax('5'), 3);
assert.equal(dayMax('-1'), 3);

// slug@YYYY-MM-DD: 그날 전엔 건너뜀, 그날부터 처리
assert.ok(dueOn('youth-jeonse-apply', '2026-11-14'));
assert.ok(!dueOn('equity-share@2026-11-16', '2026-11-15'));
assert.ok(dueOn('equity-share@2026-11-16', '2026-11-16'));
assert.ok(dueOn('equity-share@2026-11-16', '2026-11-17'));

// 대기열 쓰기: 처리한 글만 빠지고 남는 항목은 원래 표기·순서 그대로
const raw = ['youth-jeonse-apply', 'equity-share@2026-11-16'];
assert.deepEqual(queueLeft(raw, [], '2026-11-14'), ['equity-share@2026-11-16']); // 청년 전세임대 예약됨
assert.deepEqual(queueLeft(raw, ['youth-jeonse-apply'], '2026-11-14'), raw); // 한도로 못 함 → 그대로
assert.deepEqual(queueLeft(['a@2026-11-10', 'b'], ['a'], '2026-11-13'), ['a@2026-11-10']); // 날짜 지난 글이 남을 때도 표기 유지
assert.deepEqual(queueLeft(['equity-share@2026-11-16'], [], '2026-11-16'), []);

console.log('queue.check 통과');

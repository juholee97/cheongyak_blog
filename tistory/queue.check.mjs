// 하루 저장 한도 값·대기열 날짜 판정 자체 점검(네트워크 없음): node tistory/queue.check.mjs
import assert from 'node:assert/strict';
import { dayMax, dueOn, queueLeft, nudgeMin, nudged, slotTaken } from './common.mjs';

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

// 예약 시각 빗김: 같은 입력 같은 값, 3~17분 뒤, 분이 5의 배수 아님, 날마다 고르게 다름
const days = Array.from({ length: 30 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
const offs = new Set();
for (const d of days) for (const t of ['08:00', '09:30', '12:00', '15:30', '19:00']) {
  const w = `${d} ${t}`, o = nudgeMin(w), n = nudged(w);
  assert.equal(nudgeMin(w), o); assert.equal(nudged(w), n);
  assert.ok(o >= 3 && o <= 17, `${w} 빗김 ${o}`);
  assert.ok(+n.slice(14) % 5, `${w} → ${n} 분이 5의 배수`);
  assert.ok(n > w && n.slice(0, 13) === w.slice(0, 13), `${w} → ${n} 늦게, 같은 시`);
  if (t === '12:00') offs.add(o);
}
assert.ok(offs.size >= 6, `30일 12:00 빗김 ${offs.size}가지뿐`);
assert.equal(nudged('2026-12-31 23:59').slice(0, 10), '2027-01-01'); // 자정 넘김도 날짜 맞게
// 자리 판정: 정각으로 저장된 예전 글, 빗긴 시각의 글 모두 찬 자리. 다른 자리·하루 전 글은 아님
assert.ok(slotTaken('2026-11-11 15:30', ['2026-11-11 15:30']));
assert.ok(slotTaken('2026-11-14 09:30', [nudged('2026-11-14 09:30')]));
assert.ok(slotTaken('2026-11-14 12:00', ['2026-11-14 12:17']));
assert.ok(!slotTaken('2026-11-14 12:00', ['2026-11-14 12:18', '2026-11-14 11:59', '2026-11-13 12:00', '2026-11-14 19:00']));

console.log('queue.check 통과');

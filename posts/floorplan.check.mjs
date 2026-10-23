// 평면도 고르기 자체 점검: node posts/floorplan.check.mjs
import assert from 'node:assert/strict';
import { matchType, blockOf } from './floorplan.mjs';
const a = [59, 84, 102, 112];
assert.deepEqual(matchType('unit_84a.jpg', a), { area: 84, letter: 'A' });
assert.deepEqual(matchType('084B_plan.jpg', a), { area: 84, letter: 'B' });
assert.deepEqual(matchType('img_112.jpg', a), { area: 112, letter: '' });
assert.equal(matchType('plan_2026.jpg', a), null);
assert.equal(blockOf('아크메르 동탄 95'), '95');
assert.equal(blockOf('트리븐센텀 2단지'), '2');
assert.equal(blockOf('화성 향남 롯데캐슬 시그니처'), null);
console.log('ok');

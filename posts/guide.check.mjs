// 기준 시점 표기 정리 자체 점검: node posts/guide.check.mjs
import assert from 'node:assert/strict';
import { undate } from './guide.mjs';
const d = { checked: '2026-10-23', title: '디딤돌대출 조건 총정리(2026년 10월 기준) — 소득', thumbStats: [['2026년 10월 금리', '연 2%']], intro: ['(2026년 10월 1일 시행) 규정, 2026년 10월 기준 한도'], sections: [] };
const nov = undate(d, '2026-11-03 19:00');
assert.equal(nov.title, '디딤돌대출 조건 총정리(2026년) — 소득');
assert.equal(nov.thumbStats[0][0], '고시 금리');
assert.equal(nov.intro[0], '(2026년 10월 1일 시행) 규정, 2026년 기준 한도'); // 법령 시행일은 그대로
assert.equal(undate(d, '2026-10-30 08:00').title, d.title); // 확인한 달에 나가면 그대로
console.log('ok');

// weekly.mjs 자체 점검: 계약은 시작·종료일이 그 주일 때만, 연도가 다른 기간은 연도까지 표기
import assert from 'node:assert/strict';
import { build, render, autoSummary, draftOf } from './weekly.mjs';
import { checkDraft } from './check.mjs';

const base = { updatedAt: '2026-10-22T06:00:00+09:00' };
const long = { id: 'a', name: '긴계약', region: '경기', district: '과천시', kind: '오피스텔', phases: [{ k: 'p1', date: '2026-11-02' }, { k: 'con', date: '2026-09-12', end: '2029-09-12' }] };
const carry = { id: 'b', name: '이어지는계약', region: '서울', district: '중구', kind: 'APT', phases: [{ k: 'con', date: '2026-10-30', end: '2026-11-03' }] };
const w = build({ ...base, items: [long, carry] }, '2026-11-02');
assert.deepEqual(w.con.map((c) => c.it.name), ['이어지는계약']); // 몇 년짜리 계약 기간은 매주 끼지 않는다
assert.ok(render(w).includes('2026.09.12 (토) ~ 2029.09.12 (수)')); // 단지 일정표에는 연도까지
// 자동 요약은 검수를 통과해야 한다(단지 4곳 이하는 이름, 5곳 이상은 종류·지역 수)
const many = { ...base, items: [long, carry, ...[1, 2, 3, 4, 5].map((i) => ({ id: 'm' + i, name: `${i}단지`, region: i % 2 ? '서울' : '부산', district: null, kind: i < 4 ? 'APT' : '무순위', units: 100 * i, phases: [{ k: 'p1', date: '2026-11-0' + (i + 2) }, { k: 'win', date: '2026-11-08' }] }))] };
for (const data of [{ ...base, items: [long, carry] }, many, { ...base, items: [] }]) {
  const sum = autoSummary(build(data, '2026-11-02'));
  assert.deepEqual(checkDraft(draftOf(data, '2026-11-02', sum), data), [], sum.join(' / '));
}
console.log('weekly check OK');

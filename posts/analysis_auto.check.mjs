// 공개 시각 고르기 자체 점검: node posts/analysis_auto.check.mjs
import assert from 'node:assert/strict';
const { publishAt } = await import('./analysis_auto.mjs');
const now = new Date('2026-10-23T07:00:00');
const none = new Set();
assert.equal(publishAt('2026-10-30', now, none), '2026-10-23 10:00'); // 7일 전 10:00이 오늘
assert.equal(publishAt('2026-10-31', now, none), null); // 내일 이후 → 다음 실행
assert.equal(publishAt('2026-10-26', now, none), '2026-10-23 07:30'); // 이미 지남 → 30분 뒤
assert.equal(publishAt('2026-10-23', now, none), null); // 접수 시작됨
assert.equal(publishAt('2026-10-30', now, new Set(['2026-10-23 10:00'])), '2026-10-23 10:10'); // 겹치면 10분 뒤
assert.equal(publishAt('2026-10-26', new Date('2026-10-23T07:05:00'), none), '2026-10-23 07:40'); // 10분 단위 올림
console.log('ok');

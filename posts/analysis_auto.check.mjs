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
// 제목용 단지 이름: 블록 번호만 남기고 괄호 설명은 뺀다(같은 단지의 다른 블록이 같은 제목이 되지 않게)
const { shortName } = await import('./analysis_post.mjs');
assert.equal(shortName('계양신도시 카이브 유보라(AC4BL)'), '계양신도시 카이브 유보라 AC4BL');
assert.equal(shortName('인천계양 A17블록 신혼희망타운(공공분양)(본청약)'), '인천계양 A17블록 신혼희망타운');
assert.equal(shortName('GTX운정중앙역 시티프라디움 4단지(후속사업)'), 'GTX운정중앙역 시티프라디움 4단지');
console.log('shortName ok');

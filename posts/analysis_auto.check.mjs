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
// 제목 앞 지역 꼬리표: 주소에 생활권 이름이 있을 때만 그 이름, 아니면 시·도 시·군·구
const { areaOf } = await import('./analysis_post.mjs');
const A = (address, region, district) => areaOf({ address, region, district });
assert.equal(A('경기도 성남시 분당구 삼평동 1', '경기', '성남시'), '판교');
assert.equal(A('경기도 성남시 분당구 정자동 90번지', '경기', '성남시'), '분당');
assert.equal(A('경기도 화성특례시 동탄구 반송동 95번지[동탄(1) M1-1-2블록]', '경기', '화성특례시'), '동탄');
assert.equal(A('부산광역시 해운대구 우동 1', '부산', '해운대구'), '부산 센텀시티');
assert.equal(A('부산광역시 해운대구 반여동 610-5번지 일원', '부산', '해운대구'), '부산 해운대'); // 단지 이름의 「센텀」은 근거 아님
assert.equal(A('경기도 화성시 만세구 향남읍 상신리', '경기', '화성시'), '경기 화성');
assert.equal(A('전남광주통합특별시 북구 임동 100-1 일원', '광주', '북구'), '광주 북구');
assert.equal(A('제주특별자치도 제주시 이도이동 1045-3번지', '제주', '제주시'), '제주');
assert.equal(A('광주연구개발특구 첨단3지구 A6블록', '광주', '첨단3지구'), '광주 첨단');
console.log('areaOf ok');

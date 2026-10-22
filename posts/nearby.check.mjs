// nearby.mjs 자체 점검: 거리 계산, 같은 학교 이름 묶기, 교육부 분류만 학교로
import assert from 'node:assert/strict';
import { meters, schoolKey, pickSchools } from './nearby.mjs';

assert.ok(Math.abs(meters(127, 37.5, 127, 37.509) - 1001) < 5); // 위도 0.009도 ≈ 1km
assert.equal(schoolKey('서울강빛초등학교'), schoolKey('강빛초교'));
const pt = { x: '127', y: '37.5' };
const items = [
  { title: '서울강빛초등학교', category: '중앙행정기관 > 교육부 > 초등학교', point: { x: '127', y: '37.502' } },
  { title: '강빛초교', category: '중앙행정기관 > 교육부 > 초등학교', point: { x: '127', y: '37.501' } },
  { title: '강빛초등학교입구', category: '진출입시설', point: pt },
  { title: '먼초등학교', category: '중앙행정기관 > 교육부 > 초등학교', point: { x: '127', y: '37.53' } },
];
const s = pickSchools(items, 127, 37.5, '초등학교');
assert.deepEqual(s.map((x) => x.name), ['강빛초등학교']); // 가까운 쪽 하나, 1.5km 밖·입구 제외
console.log('nearby check OK');

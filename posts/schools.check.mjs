// schools.mjs 자체 점검(학구도 파일 없이): 좌표 변환 원점, 짝홀 규칙 포함 판정
import assert from 'node:assert/strict';
import { tm, contains } from './schools.mjs';

const [x, y] = tm(127, 38);
assert.ok(Math.abs(x - 200000) < 0.01 && Math.abs(y - 600000) < 0.01); // EPSG:5186 원점
const sq = (a, b) => [[a, a], [b, a], [b, b], [a, b], [a, a]];
assert.equal(contains({ type: 'Polygon', coordinates: [sq(0, 10)] }, [5, 5]), true);
assert.equal(contains({ type: 'Polygon', coordinates: [sq(0, 10), sq(4, 6)] }, [5, 5]), false); // 구멍 안
assert.equal(contains({ type: 'MultiPolygon', coordinates: [[sq(0, 1)], [sq(4, 6)]] }, [5, 5]), true);
console.log('schools check OK');

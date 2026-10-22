// map.mjs 자체 점검 (키 없이): 주소 정리, 메르카토르 투영, 줌 맞춤
import assert from 'node:assert/strict';
import { cleanAddress, project, zoomForRadius, metersPerPx, addressVariants } from './map.mjs';

assert.equal(cleanAddress('경기도 의정부시 의정부동 253-19번지 일원'), '경기도 의정부시 의정부동 253-19');
assert.equal(cleanAddress('서울특별시 강서구 방화동 584-1'), '서울특별시 강서구 방화동 584-1');
assert.equal(cleanAddress('부산광역시 해운대구 재송동 1209번지 일대'), '부산광역시 해운대구 재송동 1209');
assert.equal(cleanAddress('인천광역시 서구 불로동 검단신도시 AA32블록'), '인천광역시 서구 불로동 검단신도시');
assert.equal(cleanAddress(null), '');
assert.equal(cleanAddress('서울특별시 강동구 강일동 174 일원 (고덕강일지구 3단지)'), '서울특별시 강동구 강일동 174');
assert.equal(cleanAddress('경기도 화성특례시 동탄구 반송동 99번지[동탄(1) M1-2-2블록]'), '경기도 화성특례시 동탄구 반송동 99');
const [x, y] = project(126.978, 37.5665, 17); // 서울시청 근처 → z17 타일 (111767, 50757)
assert.deepEqual([Math.floor(x / 256), Math.floor(y / 256)], [111767, 50757]);
// 위도 37.5에서 z16은 약 1.9m/px → 500m ≈ 264px로 높이 안에 들어오고, 1km는 z15
assert.ok(Math.abs(metersPerPx(0, 0) - 156543.03) < 0.1);
assert.equal(zoomForRadius(37.5, 500), 16);
assert.equal(zoomForRadius(37.5, 1000), 15);
assert.deepEqual(addressVariants('경기도 화성특례시 동탄구 반송동 95'), ['경기도 화성특례시 동탄구 반송동 95', '경기도 화성시 반송동 95', '경기도 화성시 동탄구 반송동 95']);
assert.deepEqual(addressVariants('서울특별시 강서구 방화동 584-1'), ['서울특별시 강서구 방화동 584-1']);
console.log('map check OK');

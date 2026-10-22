// map.mjs 자체 점검 (키 없이): 주소 정리, 메르카토르 투영, 줌 맞춤
import assert from 'node:assert/strict';
import { cleanAddress, project, fitZoom, addressVariants } from './map.mjs';

assert.equal(cleanAddress('경기도 의정부시 의정부동 253-19번지 일원'), '경기도 의정부시 의정부동 253-19');
assert.equal(cleanAddress('서울특별시 강서구 방화동 584-1'), '서울특별시 강서구 방화동 584-1');
assert.equal(cleanAddress('부산광역시 해운대구 재송동 1209번지 일대'), '부산광역시 해운대구 재송동 1209');
assert.equal(cleanAddress('인천광역시 서구 불로동 검단신도시 AA32블록'), '인천광역시 서구 불로동 검단신도시');
assert.equal(cleanAddress(null), '');
const [x, y] = project(126.978, 37.5665, 17); // 서울시청 근처 → z17 타일 (111767, 50757)
assert.deepEqual([Math.floor(x / 256), Math.floor(y / 256)], [111767, 50757]);
const z = fitZoom([[[127, 37.5], [127.003, 37.5], [127.003, 37.502], [127, 37.502]]]); // 약 260m×220m
assert.ok(z >= 15 && z <= 18, `z=${z}`);
assert.deepEqual(addressVariants('경기도 화성특례시 동탄구 반송동 95'), ['경기도 화성특례시 동탄구 반송동 95', '경기도 화성시 반송동 95', '경기도 화성시 동탄구 반송동 95']);
assert.deepEqual(addressVariants('서울특별시 강서구 방화동 584-1'), ['서울특별시 강서구 방화동 584-1']);
console.log('map check OK');

// fetch.mjs 필드 매핑 자체 점검 (API 키 없이 실행)
import assert from 'node:assert/strict';
import { regionOf, ymd, toItem, pricePerPyeong } from './fetch.mjs';

assert.equal(regionOf('서울'), '서울');
assert.equal(regionOf('서울특별시'), '서울');
assert.equal(regionOf('충청북도'), '충북');
assert.equal(regionOf('전북특별자치도'), '전북');
assert.equal(regionOf('경상남도'), '경남');
assert.equal(regionOf('강원특별자치도'), '강원');
assert.equal(regionOf(''), null);

assert.equal(ymd('20261005'), '2026-10-05');
assert.equal(ymd('2026-10-05'), '2026-10-05');
assert.equal(ymd(null), null);

const apt = toItem({
  HOUSE_MANAGE_NO: '2026000123', PBLANC_NO: '2026000123', HOUSE_NM: ' 래미안 원펜타스 2차 ',
  SUBSCRPT_AREA_CODE_NM: '서울', HSSPLY_ADRES: '서울특별시 서초구 반포동 1-1', TOT_SUPLY_HSHLDCO: '641',
  SPSPLY_RCEPT_BGNDE: '2026-10-05', GNRL_RNK1_CRSPAREA_RCPTDE: '2026-10-06', GNRL_RNK2_CRSPAREA_RCPTDE: '2026-10-07',
  PRZWNER_PRESNATN_DE: '2026-10-13', CNTRCT_CNCLS_BGNDE: '2026-10-25',
  PBLANC_URL: 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=2026000123', HMPG_ADRES: 'www.example.co.kr',
}, 'APT');
assert.equal(apt.name, '래미안 원펜타스 2차');
assert.equal(apt.region, '서울');
assert.equal(apt.district, '서초구');
assert.equal(apt.units, 641);
assert.equal(apt.homepageUrl, 'http://www.example.co.kr');
assert.deepEqual(apt.phases.map((p) => p.k), ['sp', 'p1', 'p2', 'win', 'con']);

const remndr = toItem({ HOUSE_MANAGE_NO: '1', PBLANC_NO: '2', HOUSE_NM: '잠실 르엘', SUBSCRPT_AREA_CODE_NM: '서울', SUBSCRPT_RCEPT_BGNDE: '2026-11-18', PRZWNER_PRESNATN_DE: '2026-11-21', CNTRCT_CNCLS_BGNDE: '2026-12-01' }, '무순위');
assert.deepEqual(remndr.phases.map((p) => p.k), ['p1', 'win']); // 무순위는 접수·발표만

const ofc = toItem({ HOUSE_MANAGE_NO: '3', PBLANC_NO: '4', HOUSE_DTL_SECD: '02', HOUSE_NM: '제주 노형', HSSPLY_ADRES: '제주특별자치도 제주시 노형동', SUBSCRPT_RCEPT_BGNDE: '20261110' }, 'URBTY');
assert.equal(ofc.kind, '오피스텔');
assert.equal(ofc.region, '제주'); // 공급지역명이 없으면 주소로
assert.deepEqual(ofc.phases, [{ k: 'p1', date: '2026-11-10' }]);
assert.equal(toItem({ HOUSE_DTL_SECD: '03' }, 'URBTY'), null); // 민간임대 제외

// 84.99㎡ 최고 12억(120,000만원) → 약 4,668만원/3.3㎡
assert.equal(pricePerPyeong([{ LTTOT_TOP_AMOUNT: '120,000', SUPLY_AR: '84.99', SUPLY_HSHLDCO: '10', SPSPLY_HSHLDCO: '0' }]), 4668);
assert.equal(pricePerPyeong([{ LTTOT_TOP_AMOUNT: '', SUPLY_AR: '84', SUPLY_HSHLDCO: '1' }]), null);

console.log('crawler check OK');

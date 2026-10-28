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
assert.equal(apt.address, '서울특별시 서초구 반포동 1-1');
assert.equal(apt.units, 641);
assert.equal(apt.homepageUrl, 'http://www.example.co.kr');
assert.deepEqual(apt.phases.map((p) => p.k), ['sp', 'p1', 'p2', 'win', 'con']);

// 서울 자치구: 25개 구 중 하나만, 아니면 null
assert.equal(toItem({ SUBSCRPT_AREA_CODE_NM: '서울', HSSPLY_ADRES: '서울특별시 중구 신당동' }, 'APT').district, '중구');
assert.equal(toItem({ SUBSCRPT_AREA_CODE_NM: '서울', HSSPLY_ADRES: '서울특별시' }, 'APT').district, null);
assert.equal(toItem({ SUBSCRPT_AREA_CODE_NM: '서울', HSSPLY_ADRES: '서울시 강남 대치동' }, 'APT').district, null);

const remndr = toItem({ HOUSE_MANAGE_NO: '1', PBLANC_NO: '2', HOUSE_NM: '잠실 르엘', SUBSCRPT_AREA_CODE_NM: '서울', SUBSCRPT_RCEPT_BGNDE: '2026-11-18', PRZWNER_PRESNATN_DE: '2026-11-21', CNTRCT_CNCLS_BGNDE: '2026-12-01' }, '무순위');
assert.deepEqual(remndr.phases.map((p) => p.k), ['p1', 'win']); // 무순위는 접수·발표만

// 종료일·모집공고일
const withEnd = toItem({ HOUSE_NM: 'x', SUBSCRPT_AREA_CODE_NM: '경기', RCRIT_PBLANC_DE: '2026-10-10', SPSPLY_RCEPT_BGNDE: '2026-10-26', SPSPLY_RCEPT_ENDDE: '2026-10-27', GNRL_RNK1_CRSPAREA_RCPTDE: '2026-10-28', GNRL_RNK1_CRSPAREA_ENDDE: '2026-10-28', CNTRCT_CNCLS_BGNDE: '2026-11-09', CNTRCT_CNCLS_ENDDE: '2026-11-11' }, 'APT');
assert.equal(withEnd.noticeDate, '2026-10-10');
assert.deepEqual(withEnd.phases, [{ k: 'sp', date: '2026-10-26', end: '2026-10-27' }, { k: 'p1', date: '2026-10-28' }, { k: 'con', date: '2026-11-09', end: '2026-11-11' }]);

const ofc = toItem({ HOUSE_MANAGE_NO: '3', PBLANC_NO: '4', HOUSE_DTL_SECD: '02', HOUSE_NM: '제주 노형', HSSPLY_ADRES: '제주특별자치도 제주시 노형동', SUBSCRPT_RCEPT_BGNDE: '20261110' }, 'URBTY');
assert.equal(ofc.kind, '오피스텔');
assert.equal(ofc.region, '제주'); // 공급지역명이 없으면 주소로
assert.deepEqual(ofc.phases, [{ k: 'p1', date: '2026-11-10' }]);
assert.equal(toItem({ HOUSE_DTL_SECD: '03' }, 'URBTY'), null); // 민간임대 제외

// 임의공급·공공지원 민간임대: 날짜 YYYYMMDD, 단계는 접수·발표·계약 (실제 응답 2026-10-22 기준)
const opt = toItem({
  HOUSE_MANAGE_NO: '2026940231', PBLANC_NO: '2026940231', HOUSE_NM: '의정부역 센트럴 아이파크 (5차)', SUBSCRPT_AREA_CODE_NM: '경기',
  HSSPLY_ADRES: '경기도 의정부시 의정부동 253-19번지 일원', TOT_SUPLY_HSHLDCO: 8, RCRIT_PBLANC_DE: '20261020',
  SPSPLY_RCEPT_BGNDE: null, GNRL_RCEPT_BGNDE: null, SUBSCRPT_RCEPT_BGNDE: '20261023', PRZWNER_PRESNATN_DE: '20261028', CNTRCT_CNCLS_BGNDE: '20261030',
}, '임의공급');
assert.equal(opt.kind, '임의공급');
assert.equal(opt.district, '의정부시');
assert.equal(opt.units, 8);
assert.deepEqual(opt.phases, [{ k: 'p1', date: '2026-10-23' }, { k: 'win', date: '2026-10-28' }, { k: 'con', date: '2026-10-30' }]);
const rent = toItem({ HOUSE_MANAGE_NO: '5', PBLANC_NO: '6', HOUSE_NM: '울산반구 수자인 더센트럴', SUBSCRPT_AREA_CODE_NM: '울산', HSSPLY_ADRES: '울산광역시 중구 반구동', SUBSCRPT_RCEPT_BGNDE: '20261020', PRZWNER_PRESNATN_DE: '20261026', CNTRCT_CNCLS_BGNDE: '20261029' }, '공공지원 민간임대');
assert.equal(rent.kind, '공공지원 민간임대');
assert.equal(rent.pricePerPyeong, null);
assert.deepEqual(rent.phases.map((p) => p.k), ['p1', 'win', 'con']);

// 84.99㎡ 최고 12억(120,000만원) → 약 4,668만원/3.3㎡
assert.equal(pricePerPyeong([{ LTTOT_TOP_AMOUNT: '120,000', SUPLY_AR: '84.99', SUPLY_HSHLDCO: '10', SPSPLY_HSHLDCO: '0' }]), 4668);
assert.equal(pricePerPyeong([{ LTTOT_TOP_AMOUNT: '', SUPLY_AR: '84', SUPLY_HSHLDCO: '1' }]), null);

// 청년안심주택(youth.mjs): 본문 「■청약신청 : …」 줄에서 일정 — 실제 공고 문구 그대로(2026-10-26)
const { toYouthItem, dates } = await import('./youth.mjs');
assert.deepEqual(dates(' 26. 09. 30. (수) 09:00 ~ 10. 05. (월) 23:00', 2026), ['2026-09-30', '2026-10-05']);
assert.deepEqual(dates(' 2026. 08. 11. (화 ) 10:00 ~ 2026. 08. 13. (목 )', 2026), ['2026-08-11', '2026-08-13']);
assert.deepEqual(dates(' 26. 12. 30. ~ 01. 02.', 2026), ['2026-12-30', '2027-01-02']); // 해 넘김
const jangji = toYouthItem({ boardId: 6679, optn1: '2026-09-22', optn2: '2', nttSj: '[민간임대] 장지역 송파해링턴타워 최초모집공고',
  content: '<p>청약신청 시 중복 신청은 무효</p><p>■주택위치 : 서울특별시 송파구 장지동 842-1 (8호선 장지역)</p><p>■공급호수 : 총 484세대 중 공공지원민간임대 245세대</p><p>[공급일정] ■모집공고 : ‘26. 09. 22. (화) ■청약신청 : ‘26. 09. 30. (수) 09:00 ~ 10. 05. (월) 23:00 ■서류심사 대상자 발표 : ‘26. 10. 07. (수) 17:00 ■계약체결: ‘26. 10. 21. (수) 10:00 ~ 10. 26. (월) [청약신청] ■ 청약신청 페이지 : https://songpaht484.com ■ 문의전화</p>' });
assert.equal(jangji.name, '장지역 송파해링턴타워 (최초모집)');
assert.equal(jangji.kind, '청년안심주택');
assert.equal(jangji.district, '송파구');
assert.equal(jangji.units, 245);
assert.equal(jangji.homepageUrl, 'https://songpaht484.com');
assert.deepEqual(jangji.phases, [{ k: 'p1', date: '2026-09-30', end: '2026-10-05' }, { k: 'win', date: '2026-10-07' }, { k: 'con', date: '2026-10-21', end: '2026-10-26' }]);
const reserve = toYouthItem({ boardId: 6707, optn1: '2026-10-22', optn2: '2', nttSj: '[민간임대] 청량리역 퀸즈W 청량리역 추가모집공고',
  content: '■공급호수 : 총 206세대 중 금회 추가모집 공공지원민간임대 예비자 모집 [공급일정] ■청약신청 : ‘26. 10. 26. (월) 09:00 ~ 18:00 ■서류심사 대상자 발표 : ‘26. 10. 27. (화)' });
assert.equal(reserve.name, '청량리역 퀸즈W 청량리역 (추가모집·예비자)');
assert.equal(reserve.units, null);
assert.deepEqual(reserve.phases, [{ k: 'p1', date: '2026-10-26' }, { k: 'win', date: '2026-10-27' }]);
const sh = toYouthItem({ boardId: 6624, optn1: '2026-07-31', optn2: '1', nttSj: '[공공임대] 2026년 2차 청년안심주택 모집공고',
  content: '■ 청약 접수일 : 2026. 08. 11. (화 ) 10:00 ~ 2026. 08. 13. (목 ) 17:00 ■ 서류심사대상자 발표 : 2026. 08. 21.(금 ) ■ 당첨자발표 : 2026. 12. 11.(금 ) 예정' });
assert.equal(sh.name, '2026년 2차 청년안심주택 (공공임대)');
assert.equal(sh.district, null); // 여러 구를 한 공고로
assert.deepEqual(sh.phases, [{ k: 'p1', date: '2026-08-11', end: '2026-08-13' }, { k: 'win', date: '2026-12-11' }]);

// LH 임대공고(lh.mjs): 응답 모양에 기대지 않고 PAN_ID 행을 모으고, 마감일을 「접수 마감」(p1)으로
const { rowsOf, toLhItem, dot } = await import('./lh.mjs');
assert.equal(dot('2026.10.23'), '2026-10-23');
assert.equal(dot('20261023'), '2026-10-23');
const lhRows = rowsOf([{ dsSch: [{ PAN_NT_ST_DT: '2026.09.01' }] }, { dsList: [{ PAN_ID: '0000059133', PAN_NM: '서울 강남 행복주택 입주자 모집', AIS_TP_CD_NM: '행복주택', CNP_CD_NM: '서울특별시', PAN_NT_ST_DT: '2026.10.20', CLSG_DT: '2026.11.03', DTL_URL: 'https://apply.lh.or.kr/x' }], resHeader: [{ SS_CODE: 'Y' }] }]);
assert.equal(lhRows.length, 1);
const lh = toLhItem(lhRows[0]);
assert.equal(lh.id, 'lh-0000059133');
assert.equal(lh.kind, '행복주택');
assert.equal(lh.region, '서울');
assert.equal(lh.noticeDate, '2026-10-20');
assert.deepEqual(lh.phases, [{ k: 'p1', date: '2026-11-03' }]);
assert.equal(toLhItem({ PAN_ID: '1', CNP_CD_NM: '전국', CLSG_DT: '2026.11.03' }).region, null); // 전국 공고는 시·도 필터에 못 걸어 뺀다

// SH 모집공고(sh.mjs): 모집공고 글만, 글자 사이 띄어쓰기가 든 본문에서도 접수·발표일을 읽고, 접수일을 못 읽으면 일정을 비운다
const { toShItem, isRecruit, kindOf, dates: shDates } = await import('./sh.mjs');
assert.equal(isRecruit('제50차 장기전세주택 입주자 모집공고'), true);
assert.equal(isRecruit('제50차 장기전세주택 입주자 모집공고 당첨자 및 예비입주자 발표'), false);
assert.equal(isRecruit('2026년 2차 장기미임대 매입임대주택 입주자 모집공고(2026. 8. 28.) 서류심사 대상자 발표'), false);
assert.equal(kindOf('[토지임대부 사회주택] 옥류서원 입주자 모집 공고문'), '사회주택');
assert.deepEqual(shDates('2026.10.26.( 월 ) ~ 2026.11.02.( 월 ) 까지', 2026), ['2026-10-26', '2026-11-02']);
const shItem = toShItem({ seq: '311987', date: '2026-10-26', title: '[토지지원 사회주택]유니버설디자인하우스_장안 입주자 모집 공고' },
  '<p>등록일 : 2026-10-26 ▷ 접 수 기 간 : 2026.10.26.( 월 ) ~ 2026.11.02.( 월 ) 까지 ▷ 모 집 세 대 : 405 호 ( 총 1 호 ) ▷ 대상자 발표 : 2026 년 11 월 03 일 ( 화 ) 내외로 이전글 서울특별시 강남구 개포로621</p>');
assert.equal(shItem.id, 'sh-311987');
assert.equal(shItem.district, null); // 본사 주소(강남구)는 본문 밖이라 읽지 않는다
assert.deepEqual(shItem.phases, [{ k: 'p1', date: '2026-10-26', end: '2026-11-02' }, { k: 'win', date: '2026-11-03' }]);
assert.deepEqual(toShItem({ seq: '2', date: '2026-10-02', title: '2026년 하반기 신혼 매입임대주택 입주자 모집공고' }, '<p>등록일 : 2026-10-02 서류 제출일 2026.10.19 ~ 2026.10.20 이전글</p>').phases, []); // 접수일 없으면 비움

console.log('crawler check OK');

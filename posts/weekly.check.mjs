// weekly.mjs 자체 점검: 계약은 시작·종료일이 그 주일 때만, 연도가 다른 기간은 연도까지 표기
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { build, render, autoSummary, draftOf, deepUrl, linkKey, pickDeepLinks } from './weekly.mjs';
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

// 우리의 집 심층 분석 링크(--deep-links, 2026-11-16)
const KO = 'https://auleezip.com/%ea%b3%a0%eb%8d%95%ea%b0%95%ec%9d%bc-3%eb%8b%a8%ec%a7%80/'; // 한글 슬러그(%인코딩)
const DEEP = 'https://auleezip.com/deep-2026000500/', APT = 'https://auleezip.com/apt-2026000501/';
const sale = { id: '2026000500-01', name: '표본 자이', region: '서울', district: '강남구', kind: 'APT', applyhomeUrl: 'https://www.applyhome.co.kr/x?houseManageNo=2026000500', phases: [{ k: 'p1', date: '2026-11-03' }, { k: 'win', date: '2026-11-06' }] };
const lh = { id: 'lh-77', name: '행복주택', region: '경기', district: '수원시', kind: '공공임대', source: 'lh', phases: [{ k: 'p1', date: '2026-11-04' }, { k: 'con', date: '2026-11-07' }] };
const aptOnly = { id: '2026000501-01', name: '시세단지', region: '부산', district: null, kind: 'APT', phases: [{ k: 'p1', date: '2026-11-05' }, { k: 'win', date: '2026-11-08' }] };
const ldata = { ...base, items: [sale, lh, aptOnly] };
const lw = build(ldata, '2026-11-02');
assert.equal(linkKey(sale), '2026000500'); assert.equal(linkKey(lh), 'lh-77'); // 달력 postLink와 같은 열쇠
// 링크 인자가 없거나 비면 본문·초안이 그대로
const plainDraft = draftOf(ldata, '2026-11-02', ['요약']);
assert.equal(render(lw, ['요약'], [], {}), render(lw, ['요약']));
assert.deepEqual(draftOf(ldata, '2026-11-02', ['요약'], [], {}), plainDraft);
assert.ok(!('deepLinks' in plainDraft) && !plainDraft.html.includes('auleezip'));
// 주소 판정: todo.js wpLink의 deep과 같다(apt-·영문만·밖 주소·깨진 인코딩·쿼리 붙은 주소는 버림)
const sb = {}; vm.runInNewContext(readFileSync(new URL('../skin/images/todo.js', import.meta.url), 'utf8'), sb);
const urls = [KO, DEEP, APT, 'https://auleezip.com/고덕-자이/', 'https://auleezip.com/method/', 'https://auleezip.com/', 'https://auleezip.com/deep-1/?utm=x', 'https://auleezip.com/a/b/',
  'http://auleezip.com/deep-1/', 'https://www.auleezip.com/deep-1/', 'https://example.com/deep-1/', 'https://auleezip.com/%e0%a4/', 'https://auleezip.com/deep-/', null, ''];
for (const u of urls) assert.equal(deepUrl(u), sb.CY_TODO.wpLink(u)?.label === '이 단지 심층 분석' ? u : null, String(u));
assert.equal(deepUrl(APT), null); assert.equal(deepUrl('https://auleezip.com/method/'), null); assert.equal(deepUrl(KO), KO); assert.equal(deepUrl(DEEP), DEEP);
// 그리기: 접수 상자(공고 링크 아래 한 줄)·발표·계약 목록. apt- 주소는 넣어도 그리지 않는다
const linked = render(lw, [], [], { [sale.id]: KO, [lh.id]: DEEP, [aptOnly.id]: APT });
assert.ok(linked.includes(`청약홈 공고 보기 →</a></p>\n<p style="margin:6px 0 0"><a href="${KO}" target="_blank" rel="noopener">표본 자이 심층 분석 보기 →</a></p>`));
assert.ok(linked.includes(`<p style="margin:14px 0 0"><a href="${DEEP}" target="_blank" rel="noopener">행복주택 심층 분석 보기 →</a></p>`)); // 공고 링크가 없으면 그 자리
assert.ok(linked.includes(`<li>11.06(금) 표본 자이 · 서울 강남구 · <a href="${KO}" target="_blank" rel="noopener">심층 분석</a></li>`));
assert.ok(linked.includes(`<li>11.07(토) 행복주택 · 경기 수원시 · <a href="${DEEP}" target="_blank" rel="noopener">심층 분석</a></li>`));
assert.ok(!linked.includes('apt-') && !linked.includes('nofollow') && !linked.includes('utm'));
assert.equal(linked.split('심층 분석').length - 1, 4);
// 고르기: 장부의 apt-·영문만 주소는 요청도 안 하고 뺌, 200이 아니거나 첫 화면으로 넘어가면 뺌, 요청은 후보마다 한 번
const sale2 = { ...sale, id: '2026000502-01', name: '넘김단지', applyhomeUrl: null }, sale3 = { ...sale, id: '2026000503-01', name: '영문단지' }, sale4 = { ...sale, id: '2026000504-01', name: '없음단지' };
const sale5 = { ...sale, id: '2026000500-02', name: '표본 자이 2단지' }; // 같은 공고번호 = 같은 글 → 요청은 한 번
const pw = build({ ...base, items: [sale, lh, aptOnly, sale2, sale3, sale4, sale5] }, '2026-11-02');
const ledger = { 2026000500: KO, 'lh-77': DEEP, 2026000501: APT, 2026000502: 'https://auleezip.com/deep-2026000502/', 2026000503: 'https://auleezip.com/method/' };
const asked = [];
const fakeFetch = async (u) => { asked.push(u); if (u === DEEP) return { status: 404, url: u }; if (u.includes('2026000502')) return { status: 200, url: 'https://auleezip.com/' }; return { status: 200, url: u }; };
const picked = await pickDeepLinks(pw, ledger, { fetchImpl: fakeFetch, log: () => {} });
assert.deepEqual(picked.links, { [sale.id]: KO, [sale5.id]: KO });
assert.deepEqual(asked.sort(), [KO, DEEP, 'https://auleezip.com/deep-2026000502/'].sort());
const why = Object.fromEntries(picked.rows.map((r) => [r.name, r.result]));
assert.equal(why['시세단지'], '뺌: apt(시세 비교)'); assert.equal(why['영문단지'], '뺌: 심층 분석 주소 아님'); assert.equal(why['없음단지'], '글 없음'); assert.match(why['행복주택'], /상태 404/); assert.match(why['넘김단지'], /첫 화면/);
// 요청이 던져도(시간 초과 등) 초안 만들기는 계속, 장부가 없으면 링크 없음
assert.deepEqual((await pickDeepLinks(pw, ledger, { fetchImpl: async () => { throw new Error('x'); }, log: () => {} })).links, {});
assert.deepEqual((await pickDeepLinks(pw, null, { fetchImpl: () => assert.fail('요청하면 안 됨'), log: () => {} })).links, {});
// 링크가 켜진 초안도 검수 통과, 저장된 링크로 다시 그린 결과가 같다. 손으로 apt- 주소를 넣으면 검수가 잡는다
const sumL = autoSummary(lw);
const ld = draftOf(ldata, '2026-11-02', sumL, [], { [sale.id]: KO });
assert.deepEqual(ld.deepLinks, { [sale.id]: KO });
assert.deepEqual(checkDraft(ld, ldata), []);
assert.ok(checkDraft({ ...ld, deepLinks: {} }, ldata).some((i) => i.includes('다시 그린')));
assert.ok(checkDraft({ ...ld, deepLinks: { [sale.id]: APT } }, ldata).some((i) => i.includes('심층 분석 글 주소가 아닙니다')));
console.log('weekly check OK');

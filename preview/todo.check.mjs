// 내 청약 할 일 점검: node preview/todo.check.mjs — preview/serve.mjs --check가 부른다
// ① todo.js 규칙(날짜·접수 시간·지난 일정·.ics 형식) ② 달력 상세 창에서 실제로 파일을 받고 복사하는 흐름(휴대폰·PC 폭)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { chromium } from 'playwright';

const sandbox = {};
vm.runInNewContext(readFileSync(new URL('../skin/images/todo.js', import.meta.url), 'utf8'), sandbox);
const T = sandbox.CY_TODO;
const plain = (x) => JSON.parse(JSON.stringify(x));
const build = (it, picks, today) => plain(T.build(it, picks, today));
const ids = (tasks) => tasks.map((t) => t.id);

const APPLYHOME = 'https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=1&pblancNo=1';
const apt = { id: '1-1', name: '표본 자이, 1단지; 긴 이름', kind: 'APT', region: '경기', applyhomeUrl: APPLYHOME, homepageUrl: 'http://example.com',
  phases: [{ k: 'sp', date: '2026-11-16' }, { k: 'p1', date: '2026-11-17' }, { k: 'p2', date: '2026-11-18' }, { k: 'win', date: '2026-11-24' }, { k: 'con', date: '2026-12-30', end: '2027-01-01' }] };

// 고를 수 있는 유형, 처음 켜 둘 유형
assert.deepEqual(plain(T.options(apt, '2026-11-09')).map((o) => o.label), ['특별공급', '1순위(해당지역)', '2순위(해당지역)']);
assert.deepEqual(plain(T.defaultPicks(T.options(apt, '2026-11-09'))), ['sp', 'p1']);
assert.deepEqual(plain(T.defaultPicks(T.options(apt, '2026-11-18'))), [], '2순위만 남으면 켜 두지 않음(이미 신청했을 수 있음)');
assert.deepEqual(plain(T.options(apt, '2026-11-17', '17:29')).map((o) => o.k), ['p1', 'p2'], '17:30 전엔 오늘 접수 포함');
assert.deepEqual(plain(T.options(apt, '2026-11-17', '17:30')).map((o) => o.k), ['p2'], '청약홈 접수는 17:30에 끝');

// 청약홈 민영: 시각 있음, 날짜순, 권장 표시, 공고 날짜 그대로
const a = build(apt, ['sp', 'p1'], '2026-11-09');
assert.deepEqual(ids(a), ['tip-read', 'tip-cert', 'tip-eve', 'sp', 'p1', 'win', 'tip-after', 'con']);
assert.deepEqual(a.map((t) => t.date), ['2026-11-09', '2026-11-13', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-24', '2026-11-24', '2026-12-30']);
assert.ok(a.filter((t) => t.tip).length === 4 && !a.find((t) => t.id === 'sp').tip && !a.find((t) => t.id === 'win').tip);
assert.deepEqual([a[3].from, a[3].to], ['09:00', '17:30']);
assert.ok(a.find((t) => t.id === 'p1').note.includes('기타지역'), '1순위는 해당지역 날짜임을 밝힘');
assert.ok(!a.find((t) => t.id === 'sp').note.includes('기타지역'));
assert.ok(!a.find((t) => t.id === 'win').from && !a.find((t) => t.id === 'con').from, '발표·계약 시각은 자료에 없음');
assert.equal(T.whenText(a[3]), '2026.11.16 (월) 09:00~17:30');
assert.equal(T.whenText(a[7]), '2026.12.30 (수) ~ 01.01 (금)');

// 준비 날짜: 고른 유형의 첫 접수 기준, 오늘보다 앞서면 오늘로
assert.deepEqual(build(apt, ['p2'], '2026-11-09').filter((t) => t.tip && t.id !== 'tip-after').map((t) => t.date), ['2026-11-11', '2026-11-15', '2026-11-17']);
assert.deepEqual(build(apt, ['sp'], '2026-11-15').filter((t) => t.tip && t.id !== 'tip-after').map((t) => t.date), ['2026-11-15', '2026-11-15', '2026-11-15']);
assert.deepEqual(ids(build(apt, [], '2026-11-09')), ['win', 'tip-after', 'con'], '유형을 모두 끄면 발표·계약만');
assert.deepEqual(ids(build({ ...apt, phases: [{ k: 'p1', date: '2026-11-17' }] }, [], '2026-11-09')), [], '발표·계약도 없으면 빈 목록');
assert.deepEqual(ids(build(apt, ['sp'], '2026-11-16')).slice(0, 4), ['tip-read', 'tip-cert', 'tip-eve', 'sp'], '같은 날이면 준비 먼저');
const mixed = { ...apt, phases: [{ k: 'win', date: '2026-11-12' }, { k: 'p1', date: '2026-11-20' }] };
assert.deepEqual(ids(build(mixed, ['p1'], '2026-11-09')).slice(0, 3), ['win', 'tip-after', 'tip-read'], '순서는 날짜가 먼저');
assert.ok(build(apt, ['p1'], '2026-11-16').find((t) => t.id === 'tip-cert').note.includes('청약연습'), '전날까지는 청약연습 안내');
assert.ok(!build(apt, ['p1'], '2026-11-17').find((t) => t.id === 'tip-cert').note.includes('청약연습'), '당일엔 청약연습 안내 없음');
assert.ok(!build(apt, ['sp'], '2026-11-09').find((t) => t.id === 'tip-cert').note.includes('청약연습'));
assert.ok(!build(apt, ['sp'], '2026-11-09').find((t) => t.id === 'tip-eve').note.includes('가점제'), '특공만이면 가점 안내 없음');
assert.ok(build(apt, ['p1'], '2026-11-09').find((t) => t.id === 'tip-eve').note.includes('본인 통장 기간은 자동 입력'));
assert.ok(build(apt, ['sp'], '2026-11-09').find((t) => t.id === 'sp').note.includes('종류에 따라 접수 기간과 장소'), '특공 종류별 차이');
assert.ok(build(apt, ['p2'], '2026-11-09').find((t) => t.id === 'p2').note.includes('2순위 접수는 없을 수'), '2순위 안내');
assert.equal(build(apt, ['p1'], '2026-11-09').find((t) => t.id === 'p1').title, '1순위 접수(해당지역)', '제목·알림에 해당지역');
const noSp = { ...apt, phases: apt.phases.filter((p) => p.k !== 'sp') };
assert.ok(T.spMissing(noSp) && !T.spMissing(apt) && !T.spMissing({ ...noSp, kind: '무순위' }));
assert.ok(build(noSp, ['p1'], '2026-11-09').find((t) => t.id === 'p1').note.includes('특별공급 일정은 자료에 없어요'), '특공 일정 없음 안내');

// 지난 일정은 뺀다
assert.deepEqual(ids(build(apt, [], '2026-11-20')), ['win', 'tip-after', 'con'], '접수가 끝나면 발표·계약만');
assert.deepEqual(ids(build(apt, [], '2026-12-31')), ['con'], '계약 기간 중');
assert.deepEqual(build(apt, [], '2027-01-02'), [], '모두 지남');

// 여러 날 접수: 시작·마지막 날, 진행 중이면 마지막 날만
const multi = { ...apt, phases: [{ k: 'sp', date: '2026-11-16', end: '2026-11-17' }] };
assert.deepEqual(ids(build(multi, ['sp'], '2026-11-09')).filter((i) => !i.startsWith('tip')), ['sp-start', 'sp-end']);
assert.deepEqual(ids(build(multi, ['sp'], '2026-11-17')).filter((i) => !i.startsWith('tip')), ['sp-end']);
assert.deepEqual(ids(plain(T.build(multi, ['sp'], '2026-11-16', '18:00'))).filter((i) => !i.startsWith('tip')), ['sp-end'], '시작일 17:30 뒤엔 시작 항목 없음');
assert.deepEqual(ids(plain(T.build(multi, ['sp'], '2026-11-16', '10:00'))).filter((i) => !i.startsWith('tip')), ['sp-start', 'sp-end']);

// 무순위: 공동·금융인증서만, 계약일 없음 안내, 라벨 「접수」
const rem = { id: '2-2', name: '표본 무순위', kind: '무순위', applyhomeUrl: APPLYHOME, phases: [{ k: 'p1', date: '2026-11-20' }, { k: 'win', date: '2026-11-21' }] };
const r = build(rem, ['p1'], '2026-11-09');
assert.ok(!r.find((t) => t.id === 'p1').note.includes('기타지역'), '무순위에 해당지역 안내 없음');
assert.ok(r.find((t) => t.id === 'tip-read').note.includes('청약통장을 쓰지 않아요') && !/청약통장 순위|주택소유/.test(r.find((t) => t.id === 'tip-read').note), '무순위 준비 문구');
assert.ok(!r.find((t) => t.id === 'tip-eve').note.includes('주민등록표등본'));
const anyone = { ...rem, kind: '임의공급', phases: [{ k: 'p1', date: '2026-11-20' }, { k: 'win', date: '2026-11-21' }, { k: 'con', date: '2026-11-25' }] };
assert.equal(build(anyone, ['p1'], '2026-11-09').find((t) => t.id === 'p1').from, '09:00', '임의공급도 청약홈 시각');
assert.equal(r.find((t) => t.id === 'p1').title, '접수');
assert.equal(r.find((t) => t.id === 'p1').from, '09:00');
assert.ok(r.find((t) => t.id === 'tip-cert').note.startsWith('공동인증서나 금융인증서'));
assert.ok(r.find((t) => t.id === 'tip-after').note.includes('계약일은 자료에 없어요'));
assert.ok(!r.some((t) => t.id === 'con'));

// 공공분양·LH·SH·오피스텔: 청약홈 시각·메뉴를 지어내지 않는다
const pub = { ...apt, name: '표본지구 A1블록 신혼희망타운(공공분양)', homepageUrl: 'https://apply.lh.or.kr' };
const lhHome = { ...apt, name: '표본 단지', homepageUrl: 'https://apply.lh.or.kr/' };
assert.ok(!build({ ...apt, name: '표본 신혼희망타운', homepageUrl: 'https://apply.lh.or.kr' }, ['p2'], '2026-11-09').find((t) => t.id === 'p2').note.includes('청약홈'), '공공 2순위에 청약홈 없음');
const privHome = { ...apt, name: '힐스테이트 표본 A65BL 공공분양주택', homepageUrl: 'https://hillstate.co.kr/s/x' };
const equity = { ...apt, name: '표본 A17BL 지분적립형 분양주택', homepageUrl: 'http://example.com' };
const ofc = { id: '3-3', name: '표본 오피스텔', kind: '오피스텔', applyhomeUrl: APPLYHOME.replace('APT', 'PRMO'), phases: [{ k: 'p1', date: '2026-11-20' }, { k: 'win', date: '2026-11-21' }, { k: 'con', date: '2026-11-25' }] };
const lh = { id: 'lh-1', name: '표본 행복주택', kind: '행복주택', source: 'lh', applyhomeUrl: 'https://apply.lh.or.kr/x', phases: [{ k: 'p1', date: '2026-11-20' }] };
for (const it of [pub, lhHome, privHome, equity, ofc, lh]) for (const t of build(it, plain(T.defaultPicks(T.options(it, '2026-11-09'))), '2026-11-09')) {
  assert.ok(!t.from, `${it.name} ${t.id}: 시각 없음`);
  assert.ok(!/청약홈|17:30|인증서로|공동·금융/.test(t.note), `${it.name} ${t.id}: 청약홈 안내 없음 — ${t.note}`);
}
const l = build(lh, ['p1'], '2026-11-09');
assert.deepEqual(ids(l), ['tip-read', 'tip-prep', 'p1']);
assert.equal(l[2].title, '접수 마감');
assert.ok(l[2].note.includes('마감일만') && l[2].note.includes('발표·계약 일정은 자료에 없어요'));
const lhRange = build({ ...lh, startKnown: true, phases: [{ k: 'p1', date: '2026-11-18', end: '2026-11-20' }] }, ['p1'], '2026-11-09'); // 접수 시작일을 받은 LH 공고
assert.deepEqual(lhRange.filter((t) => !t.tip).map((t) => t.title), ['접수 시작', '접수 마지막 날']);
assert.ok(!lhRange.some((t) => (t.note || '').includes('마감일만')));

// 깨진 날짜·이상한 주소
const bad = { id: '4-4', name: '표본', kind: 'APT', applyhomeUrl: 'javascript:alert(1)', phases: [{ k: 'p1', date: '미정' }, { k: 'win', date: '2026-11-21' }] };
assert.deepEqual(ids(build(bad, [], '2026-11-09')), ['win', 'tip-after']);
assert.ok(!T.ics(bad, T.build(bad, [], '2026-11-09'), new Date()).includes('javascript:') && !T.text(bad, T.build(bad, [], '2026-11-09'), '').includes('javascript:'));

// .ics 형식
const NOW = new Date('2026-11-09T01:02:03.456Z');
const raw = T.ics(apt, T.build(apt, ['sp', 'p1'], '2026-11-09'), NOW);
assert.ok(raw.endsWith('\r\n') && !/[^\r]\n/.test(raw), 'CRLF만');
for (const line of raw.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `75바이트 넘음: ${line}`);
assert.ok(!raw.includes('�'));
const un = raw.replace(/\r\n /g, '').split('\r\n').filter(Boolean);
assert.equal(un[0], 'BEGIN:VCALENDAR');
assert.equal(un.at(-1), 'END:VCALENDAR');
assert.equal(un.filter((x) => x === 'BEGIN:VEVENT').length, 8);
assert.equal(un.filter((x) => x === 'END:VEVENT').length, 8);
assert.equal(un.filter((x) => x === 'BEGIN:VALARM').length, 8);
const ev = (id) => { const i = un.indexOf(`UID:1-1-${id}@aulee.tistory.com`); assert.ok(i > 0, id); return un.slice(i, un.indexOf('END:VEVENT', i)); };
assert.ok(ev('sp').includes('DTSTART:20261116T000000Z') && ev('sp').includes('DTEND:20261116T083000Z'), '09:00~17:30 KST = 00:00~08:30 UTC');
assert.ok(ev('win').includes('DTSTART;VALUE=DATE:20261124') && ev('win').includes('DTEND;VALUE=DATE:20261125'), '하루 종일: 끝은 다음 날');
assert.ok(ev('con').includes('DTSTART;VALUE=DATE:20261230') && ev('con').includes('DTEND;VALUE=DATE:20270102'), '연도 넘김: 끝 날짜 포함되게 하루 뒤');
assert.ok(ev('sp').includes('DTSTAMP:20261109T010203Z'));
assert.ok(ev('sp').includes('SEQUENCE:' + Math.floor(NOW.getTime() / 60000)), '다시 받으면 커지는 값');
assert.ok(ev('sp').some((x) => x.startsWith('SUMMARY:[청약] 특별공급 접수 - 표본 자이\\, 1단지\\; 긴 이름')), '쉼표·세미콜론 이스케이프');
assert.ok(ev('tip-read').some((x) => x.startsWith('SUMMARY:[청약 준비] ')) && ev('tip-read').some((x) => x.includes(T.TIP_NOTE)), '권장 날짜 표시');
assert.ok(ev('sp').some((x) => x.startsWith('DESCRIPTION:') && x.includes('\\n') && x.includes('입주자모집공고')), '설명 줄바꿈·면책 문구');
assert.ok(ev('sp').includes('TRIGGER:-PT30M') && ev('win').includes('TRIGGER:PT9H'));
assert.ok(ev('sp').includes('URL:' + APPLYHOME));
const inject = { ...apt, name: 'X\r\nEND:VCALENDAR\r\nBEGIN:VEVENT' };
assert.ok(!/\r\nEND:VCALENDAR\r\nBEGIN:VEVENT/.test(T.ics(inject, T.build(inject, ['p1'], '2026-11-09'), NOW)), '이름 안 줄바꿈으로 항목을 끼워 넣지 못함');

// 파일 이름, 복사 글
assert.equal(T.fileName({ name: 'A/B:C*D?"E<F>G|H' }), '청약 할 일 - A B C D E F G H.ics');
assert.equal(T.fileName({ name: '' }), '청약 할 일 - 공고.ics');
const txt = T.text(apt, T.build(apt, ['sp'], '2026-11-09'), '2026-11-09T09:10:47+09:00');
assert.ok(txt.startsWith('표본 자이, 1단지; 긴 이름 청약 할 일') && txt.includes('□ 2026.11.16 (월) 09:00~17:30 특별공급 접수') && txt.includes('(권장 시점)') && txt.includes('일정 수집: 2026.11.09') && txt.includes(APPLYHOME));

// 개인 링크·보내는 글
assert.equal(T.linkHash({ id: 'lh-1/가' }, ['sp', 'p1']), '#todo=lh-1%2F%EA%B0%80&p=sp,p1');
assert.deepEqual(plain(T.parseHash('#todo=lh-1%2F%EA%B0%80&p=sp,p1')), { id: 'lh-1/가', picks: ['sp', 'p1'] });
assert.deepEqual(plain(T.parseHash('#todo=a&p=sp,evil,p2')), { id: 'a', picks: ['sp', 'p2'] }, '모르는 유형은 버림');
assert.deepEqual(plain(T.parseHash('#todo=a')), { id: 'a', picks: null });
for (const h of ['', '#week', '#todo=', '#todo=%E0%A4%A', '#todo=a&p=<x>']) assert.equal(T.parseHash(h), null, h);
const shared = T.shareText(apt, T.build(apt, ['sp'], '2026-11-09'), 'https://x/#todo=1');
assert.ok(shared.includes('2026.11.16 (월) 09:00~17:30 특별공급 접수') && shared.includes('https://x/#todo=1') && shared.includes('입주자모집공고'));
assert.ok(!shared.includes('권장') && !shared.includes('인증서 준비'), '보내는 글에는 공고 날짜만');
assert.equal(T.linkHash({ id: 'a' }, []), '#todo=a&p=');
assert.deepEqual(plain(T.parseHash('#todo=a&p=')), { id: 'a', picks: [] }, '빈 선택도 선택');

// 함께 볼 글: 공고 종류별, 공개된 글만
const published = Object.values(JSON.parse(readFileSync(new URL('../posts/published.json', import.meta.url), 'utf8'))).map((u) => u.replace('https://aulee.tistory.com', ''));
const allLinks = (it, picks, an) => plain(T.links(it, picks, an));
const names = (gs) => gs.map((g) => g.name);
const sale = { ...apt, id: '2026000557-2026000557' };
const sg = allLinks(sale, ['sp', 'p1'], 'https://auleezip.com/deep-2026000557/');
assert.deepEqual(names(sg), ['이 단지', '대출', '지원 혜택', '유의점']);
assert.equal(sg[0].items[0].path, 'https://auleezip.com/deep-2026000557/');
assert.equal(sg[0].items[0].label, '이 단지 심층 분석(우리의 집)');
assert.equal(T.wpLink('https://auleezip.com/apt-2026000557/').label, '이 단지 주변 시세 비교');
assert.equal(T.wpLink('/74'), null, '티스토리 분석 글은 더 안 받음');
assert.equal(T.wpLink('https://auleezip.com/method/'), null, '글 주소만');
assert.equal(sg[1].items[0].path, '/75#n=2026000557', '이 공고로 계산기');
assert.ok(sg[2].items.some((x) => x.path === '/27'), '특공을 고르면 특공 글');
assert.ok(!allLinks(sale, ['p1']).find((g) => g.name === '지원 혜택').items.some((x) => x.path === '/27'));
assert.deepEqual(names(allLinks(sale, ['p1'])), ['대출', '지원 혜택', '유의점'], '우리의 집 글 없으면 칸 없음');
assert.deepEqual(names(allLinks(sale, ['p1'], 'javascript:alert(1)')), ['대출', '지원 혜택', '유의점'], '이상한 주소는 버림');
assert.equal(allLinks({ ...sale, name: '표본 신혼희망타운(공공분양)' }, ['p1']).find((g) => g.name === '지원 혜택').items[0].path, '/50');
assert.deepEqual(names(allLinks(ofc, ['p1'])), ['대출', '유의점'], '오피스텔: 맞는 지원 글이 없어 비움');
const hp = allLinks(lh, ['p1']);
assert.equal(hp[0].items[0].path, '/75#calc=loan&t=jeonse');
assert.equal(hp.find((g) => g.name === '지원 혜택').items[0].path, '/60', '행복주택 자격 글');
assert.ok(hp.flatMap((g) => g.items).every((x) => !['/5', '/9', '/6'].includes(x.path)), '임대에 분양 대출 글 없음');
for (const it of [sale, pub, ofc, lh, rem, { ...lh, kind: '매입임대' }, { ...lh, kind: '청년안심주택' }, { ...apt, kind: '임의공급', name: '표본 10년 공공임대주택' }])
  for (const g of allLinks(it, ['sp', 'p1', 'p2'])) {
    assert.ok(g.items.length <= 3, `${g.name} 3개 이하`);
    for (const x of g.items) assert.ok(published.includes(x.path.split('#')[0]), `공개 글 아님: ${x.path}`);
  }
const land = { ...sale, id: '2026000434-2026000434', name: '삼도이동 1지구 토지임대부 공공분양주택' };
assert.equal(allLinks(land, ['p1']).find((g) => g.name === '대출').items[0].path, '/75#n=2026000434', '토지임대부는 분양');
assert.equal(allLinks({ ...sale, name: '익산 10년 공공임대주택' }, ['p1']).find((g) => g.name === '대출').items[0].path, '/75#calc=loan&t=jeonse', '공공임대는 임대');
assert.equal(allLinks({ id: 'sh-1', kind: '분양', source: 'sh', name: '2026년 공공분양' }, ['p1']).find((g) => g.name === '대출').items[0].label, '정책대출 자격 확인', 'SH 분양: 공고 번호 없음');
assert.equal(allLinks(sale, ['p1']).find((g) => g.name === '대출').items[0].label, '이 공고로 정책대출·특공 자격 확인');
assert.equal(allLinks(pub, ['p1']).find((g) => g.name === '대출').items[0].label, '이 공고로 정책대출 자격 확인', '공공분양은 특공 계산 범위 밖');
const remLinks = allLinks({ ...rem, id: '5-5' }, ['p1']);
assert.equal(remLinks.find((g) => g.name === '대출').items[0].label, '이 공고로 정책대출 자격 확인');
for (const kind of ['무순위', '임의공급']) assert.ok(!allLinks({ ...rem, kind }, ['p1']).flatMap((g) => g.items).some((x) => ['/54', '/55'].includes(x.path)), `${kind}: 부적격·포기 글 없음`);
const young = (kind, name = '표본') => allLinks({ ...lh, kind, name }, ['p1']).find((g) => g.name === '지원 혜택').items.map((x) => x.path);
assert.deepEqual(young('영구임대'), ['/47'], '영구임대에 청년 글 없음');
assert.deepEqual(young('통합공공임대', '청년 고령자복지형'), ['/47']);
assert.deepEqual(young('매입임대'), ['/59', '/58', '/47']);
assert.deepEqual(allLinks({ ...lh, kind: '매입임대', source: 'sh' }, ['p1']).find((g) => g.name === '지원 혜택').items.map((x) => x.path), ['/58', '/47'], 'SH 매입임대에 LH 글 없음');
assert.equal(allLinks(ofc, ['p1']).find((g) => g.name === '유의점').items.length, 1);
assert.ok(hp.find((g) => g.name === '유의점').items[0].label.includes('분양 기준'));
// 글 칸은 일정 설명에 한 번씩: 임대(접수뿐)에도, 접수가 끝난 뒤에도
const count = (raw, s) => raw.replace(/\r\n /g, '').split(s).length - 1;
const lhIcs = T.ics(lh, T.build(lh, ['p1'], '2026-11-09'), NOW, T.links(lh, ['p1']));
for (const g of ['대출', '지원 혜택', '유의점']) assert.equal(count(lhIcs, `함께 볼 글(${g})`), 1, `임대 파일에 ${g}`);
const lateIcs = T.ics(sale, T.build(sale, [], '2026-11-20'), NOW, T.links(sale, [], 'https://auleezip.com/deep-2026000557/'));
for (const g of ['이 단지', '대출', '지원 혜택', '유의점']) assert.equal(count(lateIcs, `함께 볼 글(${g})`), 1, `발표 전 파일에 ${g}`);
assert.equal(T.linkUrl('/75#n=1', 'ics'), 'https://aulee.tistory.com/75?utm_source=todo&utm_medium=ics#n=1');
assert.equal(T.linkUrl('/5'), 'https://aulee.tistory.com/5');
const gIcs = T.ics(sale, T.build(sale, ['sp', 'p1'], '2026-11-09'), NOW, T.links(sale, ['sp', 'p1'], 'https://auleezip.com/deep-2026000557/')).replace(/\r\n /g, '');
assert.ok(gIcs.includes('https://auleezip.com/deep-2026000557/?utm_source=todo&utm_medium=ics') && gIcs.includes('함께 볼 글(유의점)') && gIcs.includes('함께 볼 글(대출)') && gIcs.includes('함께 볼 글(지원 혜택)'), '달력 파일에 글 링크');
assert.ok(T.text(sale, T.build(sale, ['sp'], '2026-11-09'), '', T.links(sale, ['sp'], 'https://auleezip.com/deep-2026000557/')).includes('[함께 볼 글: 유의점]'));
const gShare = T.shareText(sale, T.build(sale, ['sp'], '2026-11-09'), 'https://x/#todo=1', T.links(sale, ['sp'], 'https://auleezip.com/deep-2026000557/'));
assert.ok(gShare.includes('대출: 이 공고로 정책대출·특공 자격 확인 https://aulee.tistory.com/75?utm_source=todo&utm_medium=share#n=2026000557'));

assert.ok(gShare.includes('이 단지: 이 단지 심층 분석(우리의 집) https://auleezip.com/deep-2026000557/?utm_source=todo&utm_medium=share'));

// ② 화면
const BASE = 'http://localhost:5178';
const alive = () => fetch(`${BASE}/rules.json`).then((r) => r.ok, () => false);
let server = null;
if (!(await alive())) {
  server = spawn(process.execPath, [fileURLToPath(new URL('./serve.mjs', import.meta.url))], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await alive()); i++) await new Promise((res) => setTimeout(res, 200));
}
const SCHEDULE = { updatedAt: '2026-11-09T09:10:47+09:00', items: [
  { ...apt, id: 'apt', name: '표본 자이', region: '서울', district: '강남구', units: 100, pricePerPyeong: 3000, address: '서울', noticeDate: '2026-11-06' },
  { ...lh, id: 'lh', region: '서울', district: '강남구', units: 10, address: '서울', noticeDate: '2026-11-01' },
  { ...lh, id: 'youth-6718', name: '표본 청년안심', region: '서울', district: '강남구', units: 10, address: '서울', noticeDate: '2026-11-01' },
  { ...apt, id: 'old', name: '표본 끝난 단지', region: '서울', district: '강남구', phases: [{ k: 'p1', date: '2026-11-02' }, { k: 'win', date: '2026-11-03' }] },
] };
const browser = await chromium.launch();
try {
  for (const [width, height] of [[320, 640], [375, 812], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.clock.setFixedTime(new Date('2026-11-09T10:00:00+09:00'));
    await page.route(/^https?:\/\/(?!localhost)/, (x) => x.abort());
    await page.route('**/schedule.json', (x) => x.fulfill({ json: SCHEDULE }));
    await page.route('**/auleezip_links.json', (x) => x.fulfill({ json: { apt: 'https://auleezip.com/deep-2026000557/', 'youth-6718': 'https://auleezip.com/deep-youth-6718/' } }));
    await page.goto(`${BASE}/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95`);
    await page.waitForFunction(() => window.CY_TODO && document.querySelector('[data-ref=modal]'));
    const openModal = async (id) => {
      await page.evaluate((i) => { const el = document.createElement('div'); el.dataset.act = 'open'; el.dataset.id = i; document.querySelector('[data-ref=modal]').parentElement.appendChild(el); el.click(); el.remove(); }, id);
      await page.waitForSelector('.modal');
    };
    await openModal('apt');
    const where = `${width}px`;
    assert.equal(await page.locator('.todo[open]').count(), 0, `${where}: 처음엔 접혀 있음`);
    await page.click('.todo summary');
    assert.equal(await page.locator('.todo-picks input').count(), 3, `${where}: 유형 3개`);
    assert.equal(await page.locator('.todo-list li').count(), 8, `${where}: 할 일 8개`);
    const hrefs = await page.$$eval('.todo-links a', (es) => es.map((e) => e.getAttribute('href')));
    assert.ok(hrefs.includes('https://auleezip.com/deep-2026000557/') && hrefs.includes('https://aulee.tistory.com/5') && hrefs.includes('https://aulee.tistory.com/27'), `${where}: 함께 볼 글 ${hrefs}`);
    const wpBtn = page.locator('.modal-btns a.wp');
    assert.equal(await wpBtn.getAttribute('href'), 'https://auleezip.com/deep-2026000557/?utm_source=calendar&utm_medium=modal', `${where}: 우리의 집 버튼`);
    assert.equal(await wpBtn.getAttribute('target'), '_blank');
    assert.ok((await wpBtn.innerText()).includes('이 단지 심층 분석'));
    assert.ok((await wpBtn.boundingBox()).height >= 44, `${where}: 버튼 높이`);
    // 유형을 끄면 목록만 바뀌고 창은 그대로
    await page.locator('.todo-picks label', { hasText: '특별공급' }).click();
    assert.equal(await page.locator('.todo[open]').count(), 1, `${where}: 유형을 바꿔도 펼친 채`);
    assert.ok(new URL(page.url()).hash.startsWith('#todo=apt&p=p1'), `${where}: 고른 유형이 주소에`);
    assert.equal(await page.locator('.todo-list li').count(), 7, `${where}: 특공을 끄면 7개`);
    assert.ok(!(await page.locator('.todo-list').innerText()).includes('특별공급 접수'));
    await page.locator('.todo-picks label', { hasText: '1순위' }).click();
    assert.equal(await page.locator('.todo-list li').count(), 3, `${where}: 모두 끄면 발표·계약만`);
    await page.locator('.todo-picks label', { hasText: '1순위' }).click();
    assert.ok(await page.locator('.todo-picks label', { hasText: '1순위' }).locator('input').isChecked());
    // 다운로드
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=todoics]')]);
    assert.equal(dl.suggestedFilename(), '청약 할 일 - 표본 자이.ics', where);
    const file = readFileSync(await dl.path(), 'utf8');
    assert.ok(file.startsWith('BEGIN:VCALENDAR\r\n') && file.includes('1순위 접수'), `${where}: 파일 내용`);
    assert.ok(file.replace(/\r\n /g, '').includes('https://auleezip.com/deep-2026000557/?utm_source=todo&utm_medium=ics'), `${where}: 파일에 글 링크`);
    assert.ok(!file.includes('특별공급 접수'), `${where}: 끈 유형은 파일에도 없음`);
    assert.ok((await page.locator('.todo-status').innerText()).includes('받기를 시작'));
    // 카톡으로 나에게 보내기: 공유창이 없으면 복사, 있으면 공유창에 개인 링크
    await page.click('[data-act=todoshare]');
    await page.waitForFunction(() => document.querySelector('.todo-status').textContent.includes('나와의 채팅에 붙여'));
    const pasted = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(pasted.includes('#todo=apt&p=p1') && !pasted.includes('특별공급 접수'), `${where}: 복사된 링크에 고른 유형 — ${pasted.slice(0, 80)}`);
    await page.evaluate(() => { navigator.share = (d) => { window.__shared = d; window.__shares = (window.__shares || 0) + 1; return new Promise((res) => { window.__resolveShare = res; }); }; });
    await page.click('[data-act=todoshare]');
    if (width < 768) {
      await page.click('[data-act=todoshare]');
      assert.equal(await page.evaluate(() => window.__shares), 1, `${where}: 두 번 눌러도 공유창 하나`);
      const sharedData = await page.evaluate(() => window.__shared);
      assert.ok(sharedData.title === '표본 자이 청약 할 일' && sharedData.text.includes('#todo=apt&p=p1'), `${where}: 공유창 내용`);
      assert.ok((await page.locator('.todo-status').innerText()).includes('나와의 채팅을 골라'), `${where}: 공유창 안내`);
      await page.evaluate(() => window.__resolveShare());
      await page.waitForFunction(() => document.querySelector('.todo-status').textContent === '');
      await page.evaluate(() => { navigator.share = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })); });
      await page.click('[data-act=todoshare]');
      await page.waitForFunction(() => document.querySelector('.todo-status').textContent === '');
      await page.evaluate(() => { navigator.share = () => Promise.reject(new TypeError('blocked')); });
      await page.click('[data-act=todoshare]');
      await page.waitForFunction(() => document.querySelector('.todo-status').textContent.includes('나와의 채팅에 붙여'));
    } else {
      assert.equal(await page.evaluate(() => window.__shares || 0), 0, `${where}: PC는 공유창 대신 복사`);
    }
    await page.evaluate(() => { delete navigator.share; });
    // 복사
    await page.click('[data-act=todocopy]');
    await page.waitForFunction(() => document.querySelector('.todo-status').textContent.includes('복사했어요'));
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied.startsWith('표본 자이 청약 할 일') && copied.includes('일정 수집: 2026.11.09'), `${where}: 복사 내용`);
    // 복사가 모두 막히면 내용을 칸에 보여 준다
    await page.evaluate(() => { window.__clip = navigator.clipboard.writeText; navigator.clipboard.writeText = () => Promise.reject(new Error('no')); document.execCommand = () => false; });
    await page.click('[data-act=todoshare]');
    await page.waitForSelector('.todo-manual');
    assert.ok((await page.locator('.todo-manual').inputValue()).includes('#todo=apt&p=p1'), `${where}: 칸에 개인 링크`);
    await page.evaluate(() => { navigator.clipboard.writeText = window.__clip; delete document.execCommand; });
    // 폭·누르는 크기
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${where}: 가로 넘침`);
    const inner = await page.evaluate(() => { const m = document.querySelector('.modal'); return m.scrollWidth - m.clientWidth; });
    assert.ok(inner <= 0, `${where}: 창 안 가로 넘침 ${inner}`);
    const small = await page.$$eval('.todo summary, .todo-picks label, .todo-btns button, .todo-links a', (es) => es.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent.trim()));
    assert.deepEqual(small, [], `${where}: 44px 미만 ${small}`);
    // 창을 닫았다 다시 열면 처음 상태
    await page.click('.modal-close');
    await openModal('youth-6718');
    assert.equal(await page.locator('.modal-btns a.wp').getAttribute('href'), 'https://auleezip.com/deep-youth-6718/?utm_source=calendar&utm_medium=modal', `${where}: lh·youth 공고도 id 전체로 찾음`);
    await page.click('.modal-close');
    await openModal('lh');
    assert.equal(await page.locator('.modal-btns a.wp').count(), 0, `${where}: 글 없는 공고엔 버튼 없음`);
    await page.click('.todo summary');
    assert.equal(await page.locator('.todo-picks input').count(), 1, `${where}: 유형 하나도 끌 수 있음`);
    assert.ok((await page.locator('.todo-list').innerText()).includes('접수 마감'));
    await page.locator('.todo-picks label').click();
    assert.ok((await page.locator('.todo-empty').innerText()).includes('하나 이상'), `${where}: 남는 일정이 없으면 안내`);
    await page.click('[data-act=todoics]');
    assert.ok((await page.locator('.todo-status').innerText()).includes('하나 이상'), `${where}: 빈 목록은 받지 않음`);
    await page.click('.modal-close');
    await openModal('old');
    assert.equal(await page.locator('.todo').count(), 0, `${where}: 끝난 공고엔 칸 없음`);
    assert.ok(await page.locator('.modal-btns a').count(), `${where}: 공고 버튼은 그대로`);
    await page.click('.modal-close');
    // 개인 링크로 열면 고른 유형 그대로 펼친 채, 닫으면 주소에서 지움. 없는 공고는 안내
    const CAL = `${BASE}/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95`;
    await page.goto('about:blank');
    await page.goto(`${CAL}#todo=apt&p=p2`);
    await page.waitForSelector('.todo[open] .todo-list');
    assert.ok(await page.locator('.todo-picks label', { hasText: '2순위' }).locator('input').isChecked(), `${where}: 링크의 유형`);
    assert.ok(!(await page.locator('.todo-picks label', { hasText: '특별공급' }).locator('input').isChecked()), `${where}: 링크에 없는 유형`);
    assert.ok((await page.locator('.todo-list').innerText()).includes('2순위 접수'));
    await page.click('.modal-close');
    assert.equal(new URL(page.url()).hash, '', `${where}: 닫으면 해시 지움`);
    await page.evaluate(() => { location.hash = 'todo=apt'; });
    await page.waitForSelector('.todo[open] .todo-list');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'modal-close', `${where}: 창으로 포커스`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.modal').count(), 0, `${where}: Esc로 닫힘`);
    await page.evaluate(() => { location.hash = 'todo=apt&p=sp'; });
    await page.waitForSelector('.todo[open] .todo-list');
    await page.goBack();
    await page.waitForFunction(() => !document.querySelector('.modal'));
    // 이번 주 탭에서 쓴 뒤 닫아도 탭 주소는 남는다
    if (width < 700) {
      await page.goto('about:blank');
      await page.goto(`${CAL}#week`);
      await page.waitForFunction(() => window.CY_TODO && document.querySelector('[data-ref=modal]'));
      await page.waitForTimeout(200);
      await openModal('apt');
      await page.click('.todo summary');
      assert.ok(new URL(page.url()).hash.startsWith('#todo='), `${where}: 주소에 선택`);
      await page.click('.modal-close');
      assert.equal(new URL(page.url()).hash, '#week', `${where}: #week 복원`);
    }
    // 링크에 고른 유형이 끝났으면 다른 유형을 켜지 않는다
    await page.clock.setFixedTime(new Date('2026-11-18T10:00:00+09:00'));
    await page.goto('about:blank');
    await page.goto(`${CAL}#todo=apt&p=p1`);
    await page.waitForSelector('.todo[open] .todo-list');
    assert.ok(!(await page.locator('.todo-list').innerText()).includes('2순위 접수'), `${where}: 고른 적 없는 2순위`);
    assert.ok((await page.locator('.todo-list').innerText()).includes('당첨자 발표'), `${where}: 발표는 남음`);
    assert.ok(!(await page.locator('.todo-in').innerText()).includes('권장 시점은') || (await page.locator('.todo-tip').count()) > 0, `${where}: 권장 시점 항목이 없으면 설명도 없음`);
    await page.clock.setFixedTime(new Date('2026-11-09T10:00:00+09:00'));
    await page.goto('about:blank');
    await page.goto(`${CAL}#todo=nope`);
    await page.waitForSelector('.modal');
    assert.ok((await page.locator('.modal').innerText()).includes('공고를 찾을 수 없어요'), `${where}: 없는 공고 안내`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.modal').count(), 0, `${where}: 안내 닫힘`);
    await page.goto('about:blank');
    await page.goto(`${CAL}#week`);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.modal').count(), 0, `${where}: #week는 그대로`);
    assert.deepEqual(errors, [], `${where}: 페이지 오류`);
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) server.kill();
}
console.log('  내 청약 할 일 점검 통과');

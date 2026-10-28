// 서울주택도시개발공사(SH) 입주자 모집공고(i-sh.co.kr 「주택임대 > 공고 및 공지」) → schedule.json 항목 (2026-10-28).
// 공식 API가 없다(공공데이터포털에 SH 공고 API 0건 — 파일 자료뿐): 게시판 목록(robots.txt가 허용하는 /main 경로)을 읽고, 모집공고 글 본문에서 접수 일정을 뽑는다.
// 호출은 zip/guard.mjs의 'sh'로 센다(하루 쪽 수·글 수 한도). 사이트에 부담 주지 않게 요청 사이에 쉰다.
import { useApi } from '../zip/guard.mjs';
const BASE = 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_241';
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; cheongyak-calendar; +https://aulee.tistory.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const clean = (h) => String(h || '').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');

// 모집공고 글만: 「입주자 모집공고」·「모집 공고」. 당첨자 발표·사전점검·계약 안내·입주 안내·정정·변경은 뺀다
export const isRecruit = (title) => /모집\s*공고|입주자\s*모집/.test(title) && !/당첨자|예비입주자\s*발표|사전점검|계약\s*안내|입주\s*안내|입주안내|정정|변경|취소|연기|결과|발표|서류\s*심사|심사\s*서류|서류\s*제출|제출\s*안내|임대상가|기숙사/.test(title);

// 제목 → 종류
export function kindOf(title) {
  if (/장기전세|시프트/.test(title)) return '장기전세';
  if (/미리내집/.test(title)) return '미리내집';
  if (/사회주택/.test(title)) return '사회주택';
  if (/행복주택/.test(title)) return '행복주택';
  if (/수요자\s*맞춤/.test(title)) return '수요자맞춤형';
  if (/매입임대|전세형|신혼부부\(?수요자|든든전세|도심\s*내/.test(title)) return '매입임대';
  if (/국민임대|공공임대|통합공공|영구임대|재개발임대/.test(title)) return '공공임대';
  if (/분양|공공주택\s*분양/.test(title)) return '분양';
  return '공공임대'; // 종류를 못 정하면 SH 임대주택으로 보고 공공임대
}

// 본문에서 날짜 범위 뽑기: 「2026년 10월 28일(수) ~ 2026년 11월 3일(화)」「’26. 11. 4. ~ 11. 6.」「11월 4일 ~ 11월 6일」
export function dates(s, year) {
  const out = [];
  let y = year;
  // 한글 표기(2026년 10월 28일 · 11월 3일)와 점 표기(’26. 11. 4. · 11. 6.)를 둘 다 읽는다. 점 표기는 끝 점이 있어야 날짜로 본다
  const re = /(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일|(?<![\d.])(2[5-9])\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})(?!\d)|(?:(?:20)?(\d{2})\s*\.\s*)?(\d{1,2})\s*\.\s*(\d{1,2})\s*\./g; // 마지막: 「26.10.02」처럼 끝 점이 없는 표(표 첨부를 OCR로 읽을 때)
  for (const m of s.replace(/[’‘'`]/g, '').matchAll(re)) {
    const yy = m[1] ? +m[1] : m[4] ? 2000 + +m[4] : m[7] ? 2000 + +m[7] : null, mo = +(m[2] || m[5] || m[8]), d = +(m[3] || m[6] || m[9]); // 그룹: 1~3 한글 표기, 4~6 「26.10.02」, 7~9 「’26. 11. 4.」·「11. 6.」
    if (yy) y = yy;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    let date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (out[0] && date < out[0]) date = `${y + 1}${date.slice(4)}`;
    out.push(date);
    if (out.length === 2) break;
  }
  return out;
}

// 본문 줄 머리 → 단계. 게시글에 「접 수 기 간」처럼 글자 사이에 띄어쓰기가 든 것이 많아 글자마다 공백을 허용한다. 먼저 맞는 것을 쓴다
const BS = String.fromCharCode(92); // 역슬래시
const lab = (w) => w.split('').join(`${BS}s*`); // 라벨은 한글뿐이라 따로 이스케이프할 것이 없다
const head = (words) => new RegExp(`(?:${words.map(lab).join('|')})${BS}s*[:：]?`);
const LINES = [
  ['p1', head(['서류접수'])], // 표로 된 첨부(OCR)에서 「서류접수 26.10.02 ~26.10.03」 — 「모집일정」 줄보다 먼저 본다
  ['p1', head(['모집신청일', '신청접수기간', '접수기간', '청약접수기간', '청약접수일', '신청기간', '접수일정', '모집일정'])],
  ['win', head(['당첨자발표', '대상자발표', '합격자발표', '발표일'])],
];

// 글(또는 첨부 이미지를 읽은) 텍스트 → 단계 목록. 접수일을 못 읽으면 빈 목록(발표일만 남기지 않는다)
export function phasesOf(t, year) {
  const phases = [];
  for (const [k, re] of LINES) {
    if (phases.some((p) => p.k === k)) continue;
    const m = re.exec(t);
    if (!m) continue;
    const [date, end] = dates(t.slice(m.index + m[0].length, m.index + m[0].length + 90), year);
    if (date) phases.push(end && end > date ? { k, date, end } : { k, date });
  }
  if (!phases.some((p) => p.k === 'p1')) phases.length = 0;
  return phases;
}

export function toShItem(row, body) {
  const whole = clean(body), a = whole.indexOf('등록일'), b = whole.indexOf('이전글'), t = a >= 0 && b > a ? whole.slice(a, b) : whole, year = +String(row.date).slice(0, 4) || new Date().getFullYear();
  const phases = phasesOf(t, year); // 첨부파일에만 일정이 있는 글은 비어 있다 — crawler/sh_attach.mjs가 첨부 이미지를 읽어 채운다
  // 「상시 접수」처럼 날짜가 없으면 접수일 = 공고일, 발표는 비움
  const name = row.title.replace(/^(\[NEW\]\s*)/, '').replace(/\s+/g, ' ').trim();
  const addr = /(?:소재지|위치|사업지)\s*[:：]\s*([^-■·]{4,60})/.exec(t)?.[1]?.trim() || null;
  const units = +((/(?:모집\s*(?:호수|세대)|공급\s*호수)\s*[:：]?\s*(?:총\s*)?(\d{1,5})\s*(?:호|세대)/.exec(t) || /총\s*(\d{1,5})\s*(?:호|세대)/.exec(t) || [])[1]) || null;
  const gu = /([가-힣]{1,4}구)\s*(?:신혼|도전숙|은빛|청년|주택|\()/.exec(row.title)?.[1] || /서울(?:특별)?시\s*([가-힣]+구)/.exec(addr || t)?.[1] || null; // 제목의 「노원구 도전숙」이 먼저, 없으면 본문 소재지
  return {
    id: `sh-${row.seq}`, name, source: 'sh', region: '서울', district: gu, kind: kindOf(row.title), units, pricePerPyeong: null, address: addr,
    noticeDate: /^\d{4}-\d\d-\d\d$/.test(row.date) ? row.date : null,
    applyhomeUrl: `${BASE}/view.do?seq=${row.seq}`, homepageUrl: 'https://www.i-sh.co.kr', phases,
  };
}

// 공고일이 noticeFrom 이후인 모집공고만(최근 쪽부터), 목록은 최대 maxPages쪽
export async function fetchSH(noticeFrom, maxPages = 12) {
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    useApi('sh');
    const r = await fetch(`${BASE}/list.do?page=${page}`, { headers: UA });
    if (!r.ok) throw new Error(`SH 목록 HTTP ${r.status}`);
    const h = await r.text();
    const list = [...h.matchAll(/<tr>\s*<td>\d+<\/td>[\s\S]*?getDetailView\('(\d+)'\)[\s\S]*?<\/a>\s*<\/td>[\s\S]*?<td class="num">\s*(\d{4}-\d\d-\d\d)\s*<\/td>/g)]
      .map((m) => ({ seq: m[1], date: m[2], title: clean(m[0].match(/getDetailView[\s\S]*?<\/a>/)[0]).replace(/^.*?;return false;"?>?/, '').replace(/\bNEW\b/, '').replace(/\s+/g, ' ').trim() }));
    rows.push(...list.filter((x) => x.date >= noticeFrom));
    if (!list.length || list.some((x) => x.date < noticeFrom)) break;
    await sleep(500);
  }
  const out = [];
  for (const row of rows.filter((x) => isRecruit(x.title))) {
    useApi('sh');
    const r = await fetch(`${BASE}/view.do?seq=${row.seq}`, { headers: UA });
    if (!r.ok) continue;
    out.push(toShItem(row, await r.text()));
    await sleep(500);
  }
  return out;
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  assert.equal(isRecruit('제50차 장기전세주택 입주자 모집공고'), true);
  assert.equal(isRecruit('제50차 장기전세주택 입주자 모집공고 당첨자 및 예비입주자 발표'), false);
  assert.equal(isRecruit('[사전점검 안내문] 동작 보라매역 프리센트(제50차 장기전세)'), false);
  assert.equal(kindOf('강북구 신혼부부(수요자맞춤형)주택 입주자 모집 공고'), '수요자맞춤형'); assert.equal(isRecruit('2026년 2차 장기미임대 매입임대주택 입주자 모집공고(2026. 8. 28.) 서류심사 대상자 발표'), false);
  assert.deepEqual(dates('모집신청일: 2026년 10월 28일(수) ~ 2026년 11월 3일(화)', 2026), ['2026-10-28', '2026-11-03']);
  assert.deepEqual(dates('’26. 11. 4. ~ 11. 6.', 2026), ['2026-11-04', '2026-11-06']);
  assert.deepEqual(dates('서류접수 26.10.02 ~26.10.03', 2026), ['2026-10-02', '2026-10-03']);
  assert.deepEqual(dates('12월 29일 ~ 1월 3일', 2026), ['2026-12-29', '2027-01-03']); // 끝이 앞서면 다음 해
  const it = toShItem({ seq: '1', date: '2026-10-28', title: '[NEW][토지임대부 사회주택] 옥류서원 입주자 모집 공고문' }, '<p>모집호수: 총 2호 - 사회주택 소재지: 서울시 종로구 옥인동 47-334 외 2필지 - 신청접수기간: 모집공고일 이후 상시 접수 (모집신청일: 2026년 10월 28일(수) ~ 2026년 11월 3일(화))</p>');
  assert.equal(it.kind, '사회주택'); assert.equal(it.units, 2); assert.equal(it.district, '종로구'); assert.equal(it.phases[0].date, '2026-10-28'); assert.equal(it.phases[0].end, '2026-11-03');
  console.log('sh 점검 통과');
} else if (process.argv[1]?.endsWith('sh.mjs')) {
  const from = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
  const items = await fetchSH(from);
  for (const i of items) console.log(`${i.noticeDate} ${i.kind.padEnd(5)} ${i.district || '-'} ${i.units ?? '-'}호 ${i.phases.map((p) => `${p.k}:${p.date}${p.end ? '~' + p.end.slice(5) : ''}`).join(' ') || '(일정 못 읽음)'} | ${i.name.slice(0, 50)}`);
  console.log(`\n${items.length}건 · 일정 못 읽음 ${items.filter((i) => !i.phases.length).length}건`);
}

// 우리의 집(auleezip) 고정 페이지: 현재 열린 공고(첫 화면 — 매일 다시 만든다) · 비교 기준 · 소개 · 개인정보처리방침. 틀은 zip/ui.mjs, 모양은 zip/site.css
import { esc } from '../posts/weekly.mjs';
import { shortName, areaOf } from '../posts/analysis_post.mjs';
import { closedOf, receiptOf, span, OPEN_URL, CAL_URL, METHOD_URL } from './post.mjs';
import { table, cmpBar, note, src } from './ui.mjs';
import { GAP, RATE } from './deals.mjs';

const link = (u, t) => `<a href="${esc(u)}">${esc(t)}</a>`;
const page = (html) => `<!-- wp:html -->\n<div class="az az-page">\n${html}\n</div>\n<!-- /wp:html -->`;
const days = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 864e5);

// list: 장부(data/zip_registry.json)의 공고들. res: 공고번호 → { d(분양가가 비교 시세보다 높으면 + %), leasehold } | { text }
export function openPage(list, today, res = {}) {
  const status = (r) => { const rc = receiptOf(r.phases); if (!rc) return ''; if (today < rc.start) return `<span class="az-status">D-${days(today, rc.start)}</span>`; return rc.end >= today ? '<span class="az-status">접수 중</span>' : ''; };
  const result = (r) => { const x = res[r.no]; if (!x) return '-'; if (x.text) return `<span class="az-cmp-t">${esc(x.text)}</span>`; if (x.leasehold) return '<span class="az-cmp-t">토지임대부라 땅값이 빠진 분양가예요</span>'; return cmpBar(x.d); };
  const row = (r) => { const rc = receiptOf(r.phases); return [`${link(`https://auleezip.com/${r.slug || 'apt-' + r.no}/`, shortName(r.name))} ${status(r)}`, esc(areaOf(r)), r.source === 'sh' ? esc(r.kind) : r.kind === '무순위' ? '무순위' : '분양', rc ? span(rc.start, rc.end) : '-', result(r)]; };
  const start = (r) => receiptOf(r.phases)?.start || '9999';
  const open = list.filter((r) => !closedOf(r.phases, today)).sort((a, b) => (start(a) < start(b) ? -1 : 1));
  const done = list.filter((r) => closedOf(r.phases, today)).sort((a, b) => ((receiptOf(a.phases)?.end || '') < (receiptOf(b.phases)?.end || '') ? 1 : -1));
  const head = ['단지', '지역', '구분', { t: '접수', n: true }, '분양가와 주변 시세'];
  return page([
    `<p>청약 공고마다 분양가(임대 공고는 임대료)를 주변 단지 실거래와 맞춰 본 글을 모았어요. 막대는 분양가가 비교 단지 시세보다 얼마나 높거나 낮은지예요. ${esc(today.replaceAll('-', '.'))} 기준이고 매일 아침 다시 만들어요.</p>`,
    `<h2>접수 중·예정 공고 ${open.length}곳</h2>`,
    open.length ? table(head, open.map(row)) : '<p>지금 열려 있는 공고가 없어요.</p>',
    `<h2>접수가 끝난 공고 ${done.length}곳</h2>`,
    done.length ? table(head, done.map(row)) : '<p>아직 없어요.</p>',
    src(`막대는 ±40%까지 그려요. 분양가는 주력 주택형 최고가, 주변 시세는 비교 단지 실거래 중앙값을 같은 면적으로 환산한 값이에요. 계산 방법은 ${link(METHOD_URL, '비교 기준')}에 있어요. 청약 일정 전체는 ${link(CAL_URL, '우리의 청약달력')}에서 볼 수 있어요. 접수 일정은 입주자모집공고 기준이며 사업주체 사정에 따라 바뀔 수 있으니, 신청 전 공고문을 확인하세요.`),
  ].join('\n'));
}

// 비교 기준: zip/deals.mjs(분양)·zip/sh_rent.mjs(임대)·zip/ui.mjs(눈금)가 실제로 하는 그대로 적는다 — 코드를 바꾸면 이 글도 같이 고친다
export const methodPage = () => page([
  '<p>우리의 집 글이 숫자를 어떻게 고르고 계산하는지 한곳에 적었어요. 글마다 쓴 기간과 단지 수는 각 글의 「이 글의 자료」에 있어요.</p>',
  '<h2>분양 공고: 분양가와 비교 단지 실거래</h2>',
  '<ul><li><b>분양가</b>: 청약홈 입주자모집공고에서 세대수가 가장 많은 주력 주택형의 최고 분양가를 써요. 발코니 확장·옵션 비용은 빠져 있어요.</li>'
  + '<li><b>비교 단지</b>: 반경으로 자르지 않고, 같은 생활권으로 받아들여지는지·상급지/하급지·브랜드·단지 규모를 보고 aulee가 직접 골라요. 같은 시·군·구와 생활권이 이어지는 옆 시·군·구에서 고르고, 단지마다 고른 이유를 글에 적어요. 고르는 일은 판단이라 다른 의견이 있을 수 있어요.</li>'
  + '<li><b>실거래</b>: 국토교통부 실거래가(아파트 매매·분양권 전매·오피스텔 매매, 공공데이터포털)의 최근 12개월 거래를 써요.</li>'
  + '<li><b>비교 단지 시세</b>: 단지마다 전용 3.3㎡당 거래가의 중앙값을 내고, 그 값들의 중앙값을 써요. 거래 몇 건이 크게 튀어도 덜 흔들리게 평균 대신 중앙값을 써요.</li>'
  + '<li><b>같은 면적 환산</b>: 비교 단지 시세(전용 3.3㎡당)를 주력 주택형의 전용면적에 맞춰 바꾼 뒤 분양가와 견줘요.</li></ul>',
  '<h2>비교 결과 눈금</h2>',
  '<p>분양가가 비교 단지 시세보다 몇 % 높거나 낮은지를 반올림한 값으로 다섯 구간에 놓아요.</p>',
  `<div style="max-width:720px">${table(['구간', '기준'], [['많이 낮음', '20% 이상 낮음'], ['낮음', '5~19% 낮음'], ['비슷', '위아래 4% 안'], ['높음', '5~19% 높음'], ['많이 높음', '20% 이상 높음']], { stack: false })}</div>`,
  `<p>토지임대부 공고는 땅값이 빠진 분양가라 일반 아파트 거래가와 그대로 견줄 수 없어서 눈금을 그리지 않아요. 「꿀분양」은 주력 주택형 기준으로 비교 단지 시세보다 ${GAP / 10000}억원 이상 또는 ${Math.round(RATE * 100)}% 이상 낮은 공고예요(토지임대부는 넣지 않아요).</p>`,
  '<h2>임대 공고: 임대보증금·월세와 주변 전월세 실거래</h2>',
  '<ul><li><b>임대조건</b>: SH 입주자 모집공고에 적힌 호별 임대보증금·월세를 옮겨 적고, 공고문 이미지에서 글자를 읽는 프로그램(OCR)으로 숫자를 다시 대조해요.</li>'
  + '<li><b>주변 거래</b>: 국토교통부 전월세 실거래(아파트·연립다세대·오피스텔) 중 같은 구에서 최근 6개월 안에 새로 맺은 계약만 써요. 갱신 계약과 같은 건물의 거래는 빼요.</li>'
  + '<li><b>맞추는 조건</b>: 전용면적이 비슷하고(±5㎡ 또는 ±15% 중 큰 쪽) 임대보증금이 ±30% 안인 월세 거래만 봐요. 같은 층대(반지하·1층·저층·중층·고층)와 연식대끼리 먼저 보고, 거래가 3건 미만이면 조건을 풀어요. 실제로 쓴 조건은 글의 표에 적어요. 신축은 비슷한 연식의 거래가 없으면 판단하지 않아요.</li>'
  + '<li><b>월세 비율</b>: 이 집 월세 ÷ 그 거래들의 월세 중앙값이에요.</li></ul>',
  '<h2>날짜와 고친 기록</h2>',
  '<p>글 위에는 처음 올린 날과 마지막으로 고친 날을 적어요. 실거래가 새로 쌓이거나 공고가 정정돼 숫자가 바뀌면 같은 글을 고치고, 글 끝 「고친 기록」에 날짜와 바뀐 내용을 남겨요. 화면 모양만 바꾼 것은 기록하지 않아요. 접수가 끝난 공고의 글은 「접수 마감」 표시를 달고 그대로 둬요.</p>',
  '<h2>하지 않는 것</h2>',
  '<ul><li>청약이나 투자를 권하지 않아요.</li><li>분양 홍보를 하지 않아요. 전화번호나 상담 신청 칸을 두지 않아요.</li><li>기사·영상의 이야기는 공식 자료와 맞춰 본 것만 「확인」으로 적어요.</li></ul>',
].join('\n'));

export const aboutPage = () => page([
  '<p>우리의 집(auleezip.com)은 청약 공고의 분양가를 주변 단지의 실제 거래 가격과 나란히 놓고 보는 블로그예요. aulee가 개인으로 운영해요. 분양가가 비교 단지보다 낮은지 높은지, 높다면 왜 그런지를 숫자와 근거로 살펴봅니다.</p>',
  '<h2>이렇게 만들어요</h2>',
  `<ul><li><b>분양가:</b> 청약홈(한국부동산원) 입주자모집공고의 주택형별 최고 분양가를 써요. 발코니 확장·옵션 비용은 빠져 있어요.</li><li><b>시세:</b> 국토교통부 실거래가(아파트 매매·분양권 전매·오피스텔 매매, 공공데이터포털)의 최근 12개월 거래를 써요.</li><li><b>비교 단지:</b> 반경으로 자르지 않고, 같은 생활권으로 받아들여지는지·상급지/하급지·브랜드·단지 규모를 보고 aulee가 직접 골라요. 단지마다 고른 이유를 글에 적어요. 이 선택은 판단이라 다른 의견이 있을 수 있어요.</li><li><b>확인표:</b> 기사나 영상에서 자주 나오는 이야기를 정부·지자체·사업주체 공식 자료와 맞춰 보고, 확인되지 않은 것은 「공식 자료 없음」이라고 적어요.</li><li><b>관심도:</b> 검색량·기사·영상 수는 화제성을 보여 줄 뿐 정보의 정확성이나 단지의 가치를 뜻하지 않아요.</li></ul>`,
  `<p>자세한 계산 방법은 ${link(METHOD_URL, '비교 기준')}에 있어요.</p>`,
  '<h2>하지 않는 것</h2>',
  '<ul><li>청약이나 투자를 권하지 않아요. 글은 공고와 공개 자료를 비교한 것이에요.</li><li>시세 상승이나 수익을 약속하는 말은 쓰지 않아요.</li><li>분양 홍보를 하지 않아요.</li></ul>',
  `<h2>함께 보면 좋은 곳</h2><p>청약 일정과 대출·정책 가이드는 ${link('https://aulee.tistory.com', '우리의 청약달력')}에서 매일 정리해요. 지금 열린 공고는 ${link(OPEN_URL, '현재 열린 공고')}에서 볼 수 있어요.</p>`,
  '<h2>광고</h2><p>이 사이트에는 구글 애드센스 같은 광고가 게재될 수 있어요. 광고는 글의 비교 결과와 관계없이 노출돼요.</p>',
].join('\n'));

export const privacyPage = () => page([
  '<p>우리의 집(auleezip.com, 이하 「사이트」)은 방문자의 개인정보를 직접 수집하지 않아요. 회원가입과 댓글 기능이 없어요.</p>',
  '<h2>자동으로 처리되는 정보</h2>',
  '<ul><li><b>방문 통계:</b> 구글 애널리틱스(Site Kit)를 통해 방문 기록(접속 페이지, 대략적인 지역, 기기 종류 등)이 익명으로 집계돼요.</li><li><b>글꼴:</b> 한글 글꼴(IBM Plex Sans KR)을 구글 글꼴 서버에서 불러와요. 이때 브라우저가 구글 서버에 접속해요.</li><li><b>쿠키:</b> 통계와 광고(구글 애드센스 사용 시)를 위해 쿠키가 쓰일 수 있어요. 브라우저 설정에서 쿠키를 막거나 지울 수 있어요.</li><li><b>서버 기록:</b> 호스팅 서버에는 접속 IP와 접속 시각이 보안·장애 대응을 위해 기록될 수 있어요.</li></ul>',
  '<h2>제3자 제공</h2><p>위 서비스(구글 등)가 각자의 정책에 따라 처리하는 것 외에 개인정보를 제3자에게 제공하지 않아요.</p>',
  '<h2>문의</h2><p>개인정보와 관련한 문의는 <a href="https://aulee.tistory.com">우리의 청약달력</a> 블로그의 방명록으로 남겨 주세요.</p>',
  note('이 방침은 사이트 운영 방식이 바뀌면 고쳐서 이 페이지에 알려요.'),
].join('\n'));

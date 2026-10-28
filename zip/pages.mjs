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
  const result = (r) => { const x = res[r.no]; if (!x) return '-'; if (x.text) return `<span class="az-cmp-t">${esc(x.text)}</span>`; if (x.leasehold) return '<span class="az-cmp-t">토지임대부라 땅값이 빠진 분양가입니다</span>'; return cmpBar(x.d); };
  const row = (r) => { const rc = receiptOf(r.phases); return [`${link(`https://auleezip.com/${r.slug || 'apt-' + r.no}/`, shortName(r.name))} ${status(r)}`, esc(areaOf(r)), r.source === 'sh' ? esc(r.kind) : r.kind === '무순위' ? '무순위' : '분양', rc ? span(rc.start, rc.end) : '-', result(r)]; };
  const start = (r) => receiptOf(r.phases)?.start || '9999';
  const open = list.filter((r) => !closedOf(r.phases, today)).sort((a, b) => (start(a) < start(b) ? -1 : 1));
  const done = list.filter((r) => closedOf(r.phases, today)).sort((a, b) => ((receiptOf(a.phases)?.end || '') < (receiptOf(b.phases)?.end || '') ? 1 : -1));
  const head = ['단지', '지역', '구분', { t: '접수', n: true }, '분양가와 주변 시세'];
  return page([
    `<p>청약 공고마다 분양가(임대 공고는 임대료)를 주변 단지 실거래와 맞춰 본 글을 모았습니다. 막대는 분양가가 비교 단지 시세보다 얼마나 높거나 낮은지입니다. ${esc(today.replaceAll('-', '.'))} 기준이고 매일 아침 다시 만듭니다.</p>`,
    `<h2>접수 중·예정 공고 ${open.length}곳</h2>`,
    open.length ? table(head, open.map(row)) : '<p>지금 열려 있는 공고가 없습니다.</p>',
    `<h2>접수가 끝난 공고 ${done.length}곳</h2>`,
    done.length ? table(head, done.map(row)) : '<p>아직 없습니다.</p>',
    src(`막대는 ±40%까지 그립니다. 분양가는 주력 주택형 최고가, 주변 시세는 비교 단지 실거래 중앙값을 같은 면적으로 환산한 값입니다. 계산 방법은 ${link(METHOD_URL, '비교 기준')}에 있습니다. 청약 일정 전체는 ${link(CAL_URL, '우리의 청약달력')}에서 볼 수 있습니다. 접수 일정은 입주자모집공고 기준이며 사업주체 사정에 따라 바뀔 수 있으니, 신청 전 공고문을 확인하시기 바랍니다.`),
  ].join('\n'));
}

// 「분양 시세비교」 목록(카테고리 템플릿 category-5에 들어간다): 글마다 왼쪽 글, 오른쪽 조감도(2026-10-29 사용자 요청 — 정보 제공용, 출처는 사업주체 분양 홈페이지).
// posts: 공고번호 → { title, excerpt, link }. views: 공고번호 → { url, homepage }(조감도가 없으면 단지 이름 칸으로 자리만 채운다)
export function saleList(list, today, res = {}, posts = {}, views = {}) {
  const start = (r) => receiptOf(r.phases)?.start || '9999';
  const items = list.filter((r) => r.source !== 'sh' && posts[r.no]);
  const open = items.filter((r) => !closedOf(r.phases, today)).sort((a, b) => (start(a) < start(b) ? -1 : 1));
  const done = items.filter((r) => closedOf(r.phases, today)).sort((a, b) => ((receiptOf(a.phases)?.end || '') < (receiptOf(b.phases)?.end || '') ? 1 : -1));
  const item = (r) => {
    const p = posts[r.no], v = views[r.no], rc = receiptOf(r.phases), x = res[r.no];
    const status = !rc ? '' : closedOf(r.phases, today) ? '접수 마감' : today < rc.start ? `D-${days(today, rc.start)}` : '접수 중';
    const meta = [esc(areaOf(r)), r.kind === '무순위' ? '무순위' : '분양', rc ? `접수 ${span(rc.start, rc.end)}` : '', status ? `<span class="az-status${status === '접수 마감' ? ' end' : ''}">${status}</span>` : ''].filter(Boolean).join(' · ');
    const img = v?.url
      ? `<figure class="az-vimg"><a href="${esc(p.link)}" tabindex="-1" aria-hidden="true"><img src="${esc(v.url)}" alt="${esc(shortName(r.name))} 조감도" width="800" height="500" loading="lazy"></a><figcaption>조감도 · ${v.homepage ? `<a href="${esc(v.homepage)}" rel="nofollow noopener">분양 홈페이지</a>` : '분양 홈페이지'}</figcaption></figure>`
      : `<div class="az-vph" aria-hidden="true">${esc(shortName(r.name))}</div>`;
    return `<li class="az-vitem"><div class="az-vtext"><p class="az-vmeta">${meta}</p><h2><a href="${esc(p.link)}">${esc(p.title)}</a></h2><p class="az-vex">${esc(p.excerpt)}</p>${x && !x.text && !x.leasehold ? `<p class="az-vcmp">${cmpBar(x.d)}</p>` : ''}</div>${img}</li>`;
  };
  return [
    `<p class="az-vlead">청약 공고마다 주력 주택형 분양가를 주변 단지 실거래(전용 3.3㎡당 중앙값)와 비교합니다. 접수 중이거나 곧 열리는 공고가 위에 있고, ${esc(today.replaceAll('-', '.'))} 기준입니다.</p>`,
    open.length ? `<h2 class="az-vgroup">접수 중·예정 ${open.length}곳</h2><ul class="az-vlist">${open.map(item).join('')}</ul>` : '',
    done.length ? `<h2 class="az-vgroup">접수가 끝난 공고 ${done.length}곳</h2><ul class="az-vlist">${done.map(item).join('')}</ul>` : '',
    src('조감도·투시도는 사업주체 분양 홈페이지(청약홈 공고에 적힌 주소)에서 정보 제공을 위해 옮긴 그림으로, 실제와 다를 수 있습니다. 그림이 없는 공고는 공식 홈페이지에서 찾지 못한 경우입니다.'),
  ].filter(Boolean).join('\n');
}

// 비교 기준: zip/deals.mjs(분양)·zip/sh_rent.mjs(임대)·zip/ui.mjs(눈금)가 실제로 하는 그대로 적는다 — 코드를 바꾸면 이 글도 같이 고친다
export const methodPage = () => page([
  '<p>우리의 집 글이 숫자를 어떻게 고르고 계산하는지 한곳에 적었습니다. 글마다 쓴 기간과 단지 수는 각 글의 「이 글의 자료」에 있습니다.</p>',
  '<h2>분양 공고: 분양가와 비교 단지 실거래</h2>',
  '<ul><li><b>분양가</b>: 청약홈 입주자모집공고에서 세대수가 가장 많은 주력 주택형의 최고 분양가를 씁니다. 발코니 확장·옵션 비용은 빠져 있습니다.</li>'
  + '<li><b>비교 단지</b>: 반경으로 자르지 않고, 같은 생활권으로 받아들여지는지·상급지/하급지·브랜드·단지 규모를 보고 aulee가 직접 고릅니다. 같은 시·군·구와 생활권이 이어지는 옆 시·군·구에서 고르고, 단지마다 고른 이유를 글에 적습니다. 고르는 일은 판단이라 다른 의견이 있을 수 있습니다.</li>'
  + '<li><b>실거래</b>: 국토교통부 실거래가(아파트 매매·분양권 전매·오피스텔 매매, 공공데이터포털)의 최근 12개월 거래를 씁니다.</li>'
  + '<li><b>비교 단지 시세</b>: 단지마다 전용 3.3㎡당 거래가의 중앙값을 내고, 그 값들의 중앙값을 씁니다. 거래 몇 건이 크게 튀어도 덜 흔들리게 평균 대신 중앙값을 씁니다.</li>'
  + '<li><b>같은 면적 환산</b>: 비교 단지 시세(전용 3.3㎡당)를 주력 주택형의 전용면적에 맞춰 바꾼 뒤 분양가와 견줍니다.</li></ul>',
  '<h2>비교 결과 눈금</h2>',
  '<p>분양가가 비교 단지 시세보다 몇 % 높거나 낮은지를 반올림한 값으로 다섯 구간에 놓습니다.</p>',
  `<div style="max-width:720px">${table(['구간', '기준'], [['많이 낮음', '20% 이상 낮음'], ['낮음', '5~19% 낮음'], ['비슷', '위아래 4% 안'], ['높음', '5~19% 높음'], ['많이 높음', '20% 이상 높음']], { stack: false })}</div>`,
  `<p>토지임대부 공고는 땅값이 빠진 분양가라 일반 아파트 거래가와 그대로 견줄 수 없어서 눈금을 그리지 않습니다. 「꿀분양」은 주력 주택형 기준으로 비교 단지 시세보다 ${GAP / 10000}억원 이상 또는 ${Math.round(RATE * 100)}% 이상 낮은 공고입니다(토지임대부는 넣지 않습니다).</p>`,
  '<h2>임대 공고: 임대보증금·월세와 주변 전월세 실거래</h2>',
  '<ul><li><b>임대조건</b>: SH 입주자 모집공고에 적힌 호별 임대보증금·월세를 옮겨 적고, 공고문 이미지에서 글자를 읽는 프로그램(OCR)으로 숫자를 다시 대조합니다.</li>'
  + '<li><b>주변 거래</b>: 국토교통부 전월세 실거래(아파트·연립다세대·오피스텔·단독다가구) 중 이 집과 같은 종류의 주택을, 같은 구에서 최근 6개월 안에 새로 맺은 계약만 씁니다. 갱신 계약과 같은 건물의 거래는 뺍니다. 단독·다가구 거래에는 층 정보가 없어 층대는 맞추지 못하고, 면적은 계약면적으로 봅니다.</li>'
  + '<li><b>맞추는 조건</b>: 전용면적이 비슷하고(±5㎡ 또는 ±15% 중 큰 쪽) 임대보증금이 ±30% 안인 월세 거래만 봅니다. 같은 층대(반지하·1층·저층·중층·고층)와 연식대끼리 먼저 보고, 거래가 3건 미만이면 조건을 풉니다. 실제로 쓴 조건은 글의 표에 적습니다. 신축은 비슷한 연식의 거래가 없으면 판단하지 않습니다.</li>'
  + '<li><b>월세 비율</b>: 이 집 월세 ÷ 그 거래들의 월세 중앙값입니다.</li></ul>',
  '<h2>날짜와 고친 기록</h2>',
  '<p>글 위에는 처음 올린 날과 마지막으로 고친 날을 적습니다. 실거래가 새로 쌓이거나 공고가 정정돼 숫자가 바뀌면 같은 글을 고치고, 글 끝 「고친 기록」에 날짜와 바뀐 내용을 남깁니다. 화면 모양만 바꾼 것은 기록하지 않습니다. 접수가 끝난 공고의 글은 「접수 마감」 표시를 달고 그대로 둡니다.</p>',
  '<h2>비교 글에서 지키는 것</h2>',
  '<ul><li>숫자는 공고문과 국토교통부 실거래 자료에서만 가져오고, 계산은 이 페이지에 적은 방법 그대로 합니다.</li><li>기사·영상의 이야기는 공식 자료와 맞춰 본 것만 「확인」으로 적습니다.</li><li>광고나 협찬을 받은 글은 글 첫머리에 따로 밝힙니다.</li></ul>',
].join('\n'));

export const aboutPage = () => page([
  '<p>우리의 집(auleezip.com)은 청약 공고의 분양가를 주변 단지의 실제 거래 가격과 나란히 놓고 보는 블로그입니다. aulee가 개인으로 운영합니다. 분양가가 비교 단지보다 낮은지 높은지, 높다면 왜 그런지를 숫자와 근거로 살펴봅니다.</p>',
  '<h2>이렇게 만듭니다</h2>',
  `<ul><li><b>분양가:</b> 청약홈(한국부동산원) 입주자모집공고의 주택형별 최고 분양가를 씁니다. 발코니 확장·옵션 비용은 빠져 있습니다.</li><li><b>시세:</b> 국토교통부 실거래가(아파트 매매·분양권 전매·오피스텔 매매, 공공데이터포털)의 최근 12개월 거래를 씁니다.</li><li><b>비교 단지:</b> 반경으로 자르지 않고, 같은 생활권으로 받아들여지는지·상급지/하급지·브랜드·단지 규모를 보고 aulee가 직접 고릅니다. 단지마다 고른 이유를 글에 적습니다. 이 선택은 판단이라 다른 의견이 있을 수 있습니다.</li><li><b>확인표:</b> 기사나 영상에서 자주 나오는 이야기를 정부·지자체·사업주체 공식 자료와 맞춰 보고, 확인되지 않은 것은 「공식 자료 없음」이라고 적습니다.</li><li><b>관심도:</b> 검색량·기사·영상 수는 화제성을 보여 줄 뿐 정보의 정확성이나 단지의 가치를 뜻하지 않습니다.</li></ul>`,
  `<p>자세한 계산 방법은 ${link(METHOD_URL, '비교 기준')}에 있습니다.</p>`,
  '<h2>글을 쓸 때 지키는 것</h2>',
  '<ul><li>비교 글은 공고와 공개 자료를 견준 것이라 청약이나 투자를 권하는 글이 아닙니다.</li><li>시세 상승이나 수익을 약속하는 말은 쓰지 않습니다.</li><li>광고나 협찬을 받은 글은 글 첫머리에 따로 밝힙니다.</li></ul>',
  `<h2>함께 보면 좋은 곳</h2><p>청약 일정과 대출·정책 가이드는 ${link('https://aulee.tistory.com', '우리의 청약달력')}에서 매일 정리합니다. 지금 열린 공고는 ${link(OPEN_URL, '현재 열린 공고')}에서 볼 수 있습니다.</p>`,
  '<h2>광고</h2><p>이 사이트에는 구글 애드센스 같은 광고가 게재될 수 있습니다. 광고는 글의 비교 결과와 관계없이 노출됩니다.</p>',
].join('\n'));

export const privacyPage = () => page([
  '<p>우리의 집(auleezip.com, 이하 「사이트」)은 방문자의 개인정보를 직접 수집하지 않습니다. 회원가입과 댓글 기능이 없습니다.</p>',
  '<h2>자동으로 처리되는 정보</h2>',
  '<ul><li><b>방문 통계:</b> 구글 애널리틱스(Site Kit)를 통해 방문 기록(접속 페이지, 대략적인 지역, 기기 종류 등)이 익명으로 집계됩니다.</li><li><b>글꼴:</b> 한글 글꼴(IBM Plex Sans KR)을 구글 글꼴 서버에서 불러옵니다. 이때 브라우저가 구글 서버에 접속합니다.</li><li><b>쿠키:</b> 통계와 광고(구글 애드센스 사용 시)를 위해 쿠키가 쓰일 수 있습니다. 브라우저 설정에서 쿠키를 막거나 지울 수 있습니다.</li><li><b>서버 기록:</b> 호스팅 서버에는 접속 IP와 접속 시각이 보안·장애 대응을 위해 기록될 수 있습니다.</li></ul>',
  '<h2>제3자 제공</h2><p>위 서비스(구글 등)가 각자의 정책에 따라 처리하는 것 외에 개인정보를 제3자에게 제공하지 않습니다.</p>',
  '<h2>문의</h2><p>개인정보와 관련한 문의는 <a href="https://aulee.tistory.com">우리의 청약달력</a> 블로그의 방명록으로 남겨 주시기 바랍니다.</p>',
  note('이 방침은 사이트 운영 방식이 바뀌면 고쳐서 이 페이지에 알립니다.'),
].join('\n'));

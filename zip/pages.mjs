// auleezip 고정 페이지: 현재 열린 공고(글이 늘 때마다 다시 만든다) · 소개 · 개인정보처리방침
import { esc, md, C, TH, TD } from '../posts/weekly.mjs';
import { shortName, areaOf } from '../posts/analysis_post.mjs';
import { closedOf, OPEN_URL, CAL_URL } from './post.mjs';

const link = (u, t) => `<a href="${esc(u)}">${esc(t)}</a>`;
const table = (head, rows) => `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:480px"><thead><tr>${head.map((h) => `<th ${TH}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td ${TD}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const first = (r) => (r.phases || []).filter((p) => ['sp', 'p1'].includes(p.k) && p.date).map((p) => p.date).sort()[0] || '';
const last = (r) => (r.phases || []).filter((p) => p.date).map((p) => p.date).sort().at(-1) || '';

// list: 글이 있는 공고들(r: deals 한 줄, title: 글 제목). 열린 공고는 접수일 빠른 순, 마감은 최근 순
export function openPage(list, today) {
  const row = (r) => [link(`https://auleezip.com/${r.slug || 'apt-' + r.no}/`, `${shortName(r.name)}`), esc(areaOf(r)), r.source === 'sh' ? esc(r.kind) : r.kind === '무순위' ? '무순위' : '분양', first(r) ? md(first(r)) : '-', last(r) ? md(last(r)) : '-'];
  const open = list.filter((r) => !closedOf(r.phases, today)).sort((a, b) => (first(a) < first(b) ? -1 : 1));
  const done = list.filter((r) => closedOf(r.phases, today)).sort((a, b) => (last(a) < last(b) ? 1 : -1));
  return [
    `<p>청약 공고마다 분양가를 주변 단지 실거래와 맞춰 본 글을 모았어요. 접수 중이거나 곧 열리는 공고가 위에, 접수가 끝난 공고는 아래에 있어요. (${esc(today)} 기준)</p>`,
    `<h2>접수 중·예정 공고 ${open.length}곳</h2>`,
    open.length ? table(['단지', '지역', '구분', '접수 시작', '접수 마지막'], open.map(row)) : '<p>지금 열려 있는 공고가 없어요.</p>',
    `<h2>접수가 끝난 공고 ${done.length}곳</h2>`,
    done.length ? table(['단지', '지역', '구분', '접수 시작', '접수 마지막'], done.map(row)) : '<p>아직 없어요.</p>',
    `<p style="font-size:13px;color:${C.muted}">청약 일정 전체는 ${link(CAL_URL, '우리의 청약달력')}에서 볼 수 있어요. 접수 일정은 입주자모집공고 기준이며 사업주체 사정에 따라 바뀔 수 있으니, 신청 전 청약홈 공고문을 확인하세요.</p>`,
  ].join('\n');
}

export const aboutPage = () => [
  '<p>aulee의 집은 청약 공고의 분양가를 주변 단지의 실제 거래 가격과 나란히 놓고 보는 블로그예요. 분양가가 비교 단지보다 낮은지 높은지, 높다면 왜 그런지를 숫자와 근거로 살펴봅니다.</p>',
  '<h2>이렇게 만들어요</h2>',
  `<ul><li><b>분양가:</b> 청약홈(한국부동산원) 입주자모집공고의 주택형별 최고 분양가를 써요. 발코니 확장·옵션 비용은 빠져 있어요.</li><li><b>시세:</b> 국토교통부 실거래가(아파트 매매·분양권 전매·오피스텔 매매, 공공데이터포털)의 최근 12개월 거래를 써요.</li><li><b>비교 단지:</b> 반경으로 자르지 않고, 같은 생활권으로 받아들여지는지·상급지/하급지·브랜드·단지 규모를 보고 aulee가 직접 골라요. 단지마다 고른 이유를 글에 적어요. 이 선택은 판단이라 다른 의견이 있을 수 있어요.</li><li><b>확인표:</b> 기사나 영상에서 자주 나오는 이야기를 정부·지자체·사업주체 공식 자료와 맞춰 보고, 확인되지 않은 것은 「공식 자료 없음」이라고 적어요.</li><li><b>관심도:</b> 검색량·기사·영상 수는 화제성을 보여 줄 뿐 정보의 정확성이나 단지의 가치를 뜻하지 않아요.</li></ul>`,
  '<h2>하지 않는 것</h2>',
  '<ul><li>청약이나 투자를 권하지 않아요. 글은 공고와 공개 자료를 비교한 것이에요.</li><li>시세 상승이나 수익을 약속하는 말은 쓰지 않아요.</li></ul>',
  `<h2>함께 보면 좋은 곳</h2><p>청약 일정과 대출·정책 가이드는 ${link('https://aulee.tistory.com', '우리의 청약달력')}에서 매일 정리해요. 지금 열린 공고는 ${link(OPEN_URL, '현재 열린 공고')}에서 볼 수 있어요.</p>`,
  '<h2>광고</h2><p>이 사이트에는 구글 애드센스 같은 광고가 게재될 수 있어요. 광고는 글의 비교 결과와 관계없이 노출돼요.</p>',
].join('\n');

export const privacyPage = () => [
  '<p>aulee의 집(auleezip.com, 이하 「사이트」)은 방문자의 개인정보를 직접 수집하지 않아요. 회원가입과 댓글 기능이 없어요.</p>',
  '<h2>자동으로 처리되는 정보</h2>',
  '<ul><li><b>방문 통계:</b> 구글 애널리틱스(Site Kit)를 통해 방문 기록(접속 페이지, 대략적인 지역, 기기 종류 등)이 익명으로 집계돼요.</li><li><b>쿠키:</b> 통계와 광고(구글 애드센스 사용 시)를 위해 쿠키가 쓰일 수 있어요. 브라우저 설정에서 쿠키를 막거나 지울 수 있어요.</li><li><b>서버 기록:</b> 호스팅 서버에는 접속 IP와 접속 시각이 보안·장애 대응을 위해 기록될 수 있어요.</li></ul>',
  '<h2>제3자 제공</h2><p>위 서비스(구글 등)가 각자의 정책에 따라 처리하는 것 외에 개인정보를 제3자에게 제공하지 않아요.</p>',
  '<h2>문의</h2><p>개인정보와 관련한 문의는 <a href="https://aulee.tistory.com">우리의 청약달력</a> 블로그의 방명록으로 남겨 주세요.</p>',
  '<p style="font-size:13px;color:#4b5260">이 방침은 사이트 운영 방식이 바뀌면 고쳐서 이 페이지에 알려요.</p>',
].join('\n');

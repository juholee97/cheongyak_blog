// 서울시 청년안심주택 모집공고(soco.seoul.go.kr/youth) → schedule.json 항목. 청약홈에 올라오지 않는 공고라 따로 받는다(2026-10-26).
// 공식 API가 없어 모집공고 화면이 쓰는 목록 JSON(bbsListJson.json)을 읽는다 — 한 쪽 10건, 항목마다 공고 본문 HTML이 들어 있다.
// 일정은 본문의 「■청약신청 : ‘26. 09. 30. (수) 09:00 ~ 10. 05. (월)」 같은 줄에서 뽑는다(민간: [공급일정] 칸, SH 공공임대: 「■ 청약 접수일」).
const LIST = 'https://soco.seoul.go.kr/youth/pgm/home/yohome/bbsListJson.json';
const VIEW = 'https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do';
const SEOUL_GU = new Set('강남구 강동구 강북구 강서구 관악구 광진구 구로구 금천구 노원구 도봉구 동대문구 동작구 마포구 서대문구 서초구 성동구 성북구 송파구 양천구 영등포구 용산구 은평구 종로구 중구 중랑구'.split(' '));

export const text = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/[‘’'`]/g, '').replace(/\s+/g, ' ');

// 「26. 09. 30. (수) 09:00 ~ 10. 05.」·「2026. 08. 11. (화 ) 10:00 ~ 2026. 08. 13.」 → 시작·끝(연도가 없으면 앞 날짜의 연도, 끝이 앞서면 다음 해)
export function dates(s, year) {
  const out = [];
  let y = year;
  for (const m of s.matchAll(/(?:(?:20)?(\d{2})\s*\.\s*)?(\d{1,2})\s*\.\s*(\d{1,2})\s*\./g)) {
    if (m[1]) y = 2000 + +m[1];
    let d = `${y}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    if (out[0] && d < out[0]) d = `${y + 1}${d.slice(4)}`;
    out.push(d);
    if (out.length === 2) break;
  }
  return out;
}

// [단계, 본문 줄 머리] — 발표는 SH 공고의 「당첨자발표」가 있으면 그것, 없으면 민간 공고의 「서류심사 대상자 발표」
const LINES = [
  ['p1', /■\s*(?:청약\s*신청|청약\s*접수일?|신청\s*기간|접수\s*기간)\s*:/],
  ['win', /■\s*당첨자\s*발표\s*:/],
  ['win', /■\s*서류\s*심사\s*대상자\s*발표\s*:/],
  ['con', /■\s*계약\s*체결[^:■]*:/],
];

export function toYouthItem(row) {
  const t = text(row.content);
  const sched = t.includes('[공급일정]') ? t.slice(t.indexOf('[공급일정]')) : t; // 앞쪽 안내문의 「청약신청」을 잡지 않게
  const year = +String(row.optn1 || '').slice(0, 4) || new Date().getFullYear();
  const phases = [];
  for (const [k, re] of LINES) {
    if (phases.some((p) => p.k === k)) continue;
    const m = re.exec(sched);
    if (!m) continue;
    const [date, end] = dates(sched.slice(m.index + m[0].length).split('■')[0], year);
    if (date) phases.push(end && end > date ? { k, date, end } : { k, date });
  }
  phases.sort((a, b) => ['p1', 'win', 'con'].indexOf(a.k) - ['p1', 'win', 'con'].indexOf(b.k));
  const title = String(row.nttSj || '').trim();
  const pub = /^\[공공/.test(title) || row.optn2 === '1';
  const round = /(최초|추가)모집/.exec(title)?.[1];
  const base = title.replace(/^\[[^\]]*\]\s*/, '').replace(/\s*(입주자\s*)?(최초|추가)?\s*모집\s*공고.*$/, '').trim();
  const address = /주택위치\s*:\s*([^■(]+)/.exec(t)?.[1].trim() || null;
  const gu = /서울(?:특별)?시\s*([가-힣]+구)/.exec(address || t)?.[1];
  const units = +(/금회\s*(?:추가\s*모집\s*)?공공지원\s*민간임대\s*(\d+)\s*세대/.exec(t) || /중\s*공공지원\s*민간임대\s*(\d+)\s*세대/.exec(t) || [])[1] || null;
  const reserve = /■\s*공급\s*호수[^■]*예비자/.test(t); // 세대 수 없이 예비 입주자만 뽑는 추가모집
  return {
    id: `youth-${row.boardId}`,
    name: `${base} (${pub ? '공공임대' : `${round || ''}모집${reserve ? '·예비자' : ''}`})`,
    region: '서울',
    district: SEOUL_GU.has(gu) && !pub ? gu : null, // SH 공공임대는 여러 구를 한 공고로 모집
    kind: '청년안심주택',
    units,
    pricePerPyeong: null,
    address,
    noticeDate: /^\d{4}-\d\d-\d\d$/.test(row.optn1) ? row.optn1 : null,
    applyhomeUrl: `${VIEW}?boardId=${row.boardId}&menuNo=400008`, // 공고 원문(청년안심주택 홈페이지)
    homepageUrl: /청약\s*신청\s*페이지\s*:\s*(https?:\/\/[^\s■]+)/.exec(t)?.[1] || null,
    phases,
  };
}

// 공고게시일이 noticeFrom(YYYY-MM-DD) 이후인 공고만, 최근 쪽부터 최대 maxPages쪽
export async function fetchYouth(noticeFrom, maxPages = 15) {
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await fetch(LIST, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'cheongyak-calendar (aulee.tistory.com)' }, body: `bbsId=BMSR00015&pageIndex=${page}` });
    if (!r.ok) throw new Error(`청년안심주택 목록 HTTP ${r.status}`);
    const list = (await r.json()).resultList || [];
    rows.push(...list.filter((x) => x.optn1 >= noticeFrom));
    if (!list.length || list.some((x) => x.optn1 < noticeFrom)) break;
    await new Promise((res) => setTimeout(res, 300));
  }
  return rows.map(toYouthItem);
}

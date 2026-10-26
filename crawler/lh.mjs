// LH 임대주택 공고(행복주택·국민임대·영구임대 등, apply.lh.or.kr) → schedule.json 항목. 청약홈에 올라오지 않는 공고라 따로 받는다(2026-10-27).
// 공공데이터포털 「한국토지주택공사_임대공고문 정보」(15058530, lhLeaseNoticeInfo1) — 같은 DATA_GO_KR_KEY, 활용신청은 운영자가 했다.
// 목록에는 공고 게시일·마감일만 있어(접수 시작·당첨자 발표는 「공급정보 조회」 15056765에) 달력에는 마감일을 「접수 마감」으로 싣는다.
const URL_ = 'https://apis.data.go.kr/B552555/lhLeaseNoticeInfo1/lhLeaseNoticeInfo1';
const REGIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const LONG = { 충청북: '충북', 충청남: '충남', 전라북: '전북', 전라남: '전남', 경상북: '경북', 경상남: '경남' };

export const dot = (s) => (/^(\d{4})[.\-/]?(\d{2})[.\-/]?(\d{2})/.exec(String(s || '').trim()) || []).slice(1).join('-') || null; // 2026.10.23 → 2026-10-23
const regionOf = (s) => { s = String(s || '').trim(); const r = LONG[s.slice(0, 3)] || s.slice(0, 2); return REGIONS.includes(r) ? r : null; };

// 응답은 [{dsSch:[…]}, {dsList:[…], resHeader:[…]}] 꼴 — 위치에 기대지 않고 PAN_ID가 있는 행을 모은다
export function rowsOf(j) {
  const out = [];
  const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') { if (v.PAN_ID || v.PAN_NM) out.push(v); else Object.values(v).forEach(walk); } };
  walk(j);
  return out;
}

export function toLhItem(row) {
  const close = dot(row.CLSG_DT);
  return {
    id: `lh-${row.PAN_ID}`,
    name: String(row.PAN_NM || '').trim(),
    region: regionOf(row.CNP_CD_NM), // 「전국」·여러 시·도 공고는 null → 달력에서 빠짐
    district: null,
    kind: String(row.AIS_TP_CD_NM || '').trim() || 'LH 임대',
    source: 'lh',
    units: null,
    pricePerPyeong: null,
    address: null,
    noticeDate: dot(row.PAN_NT_ST_DT),
    applyhomeUrl: String(row.DTL_URL || '').trim() || null, // LH청약플러스 공고 상세
    homepageUrl: null,
    phases: close ? [{ k: 'p1', date: close }] : [],
  };
}

// 공고 게시일 noticeFrom(YYYY-MM-DD) 이후 임대주택(06) 공고 전부. 오류 메시지에 주소를 넣지 않는다(serviceKey가 로그에 남지 않게)
export async function fetchLH(key, noticeFrom) {
  const rows = [];
  for (let page = 1; page <= 20; page++) {
    const u = new URL(URL_);
    u.searchParams.set('serviceKey', key);
    for (const [k, v] of Object.entries({ PG_SZ: 500, PAGE: page, UPP_AIS_TP_CD: '06', PAN_NT_ST_DT: noticeFrom.replace(/-/g, '.'), CLSG_DT: '2099.12.31' })) u.searchParams.set(k, v);
    const r = await fetch(u);
    const text = await r.text();
    if (!r.ok || !/^\s*[[{]/.test(text)) throw new Error(`LH 임대공고 HTTP ${r.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
    const got = rowsOf(JSON.parse(text));
    rows.push(...got);
    if (got.length < 500) break;
  }
  return rows.map(toLhItem);
}

// 분양분석 글 초안: 공고 1건 → 청약홈 상세(규제·주택형별 금액) + 주변 같은 등급 실거래 + 학교·역 + 대출 기준 → drafts/analysis_{공고번호}.json
// node posts/analysis_post.mjs 2026000373 [--data drafts/2026-11-02_weekly.data.json]   새 초안(notes는 비워 둠)
// node posts/analysis_post.mjs --render drafts/analysis_2026000373.json                  notes를 고친 뒤 본문만 다시 그림
// 규칙: 숫자는 facts(수집·조회 값)에서만. notes(사람/Claude가 쓰는 문장)의 숫자도 facts에 있어야 검수 통과(checkAnalysis). 투자 권유·"로또" 류 금지.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadData, esc, span, label, where, full, md, C, TH, TD, IMG, BLOG_URL, DISCLAIMER } from './weekly.mjs';
import { BANNED } from './check.mjs';
import { stations } from './nearby.mjs';
import { schoolsAt, SOURCE as SCHOOL_SOURCE } from './schools.mjs';
import { busNear, isCore } from './bus.mjs';
import { routeReach, canonLine, ASSUMED_KMH, LIMIT_MIN } from './routes.mjs';
import { nearbyTrades, dataKey, tierOf, locate, PY } from './trades.mjs';
import { keyOf, mapHtml } from './map.mjs';
import { itemHtml, renderPngs } from './card.mjs';

const ODCLOUD = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/';
const LOANS_CHECKED = '2026-10-23';
const SCHOOL_SELECT_KM = 5; // schools.mjs SELECT_RANGE와 같게 // docs/policy/loans.md 확인일
// 대출 가격·면적 요건(docs/policy/loans.md). 바뀌면 여기와 문서를 같이 고친다
export const LOAN = [
  { name: '디딤돌대출(일반)', max: 50000, area: 85, src: 'https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030101.jsp' },
  { name: '디딤돌대출(신혼·2자녀 이상)', max: 60000, area: 85, src: 'https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030101.jsp' },
  { name: '보금자리론', max: 60000, area: null, src: 'https://www.hf.go.kr/ko/sub01/sub01_01_01.do' },
  { name: '신생아 특례 디딤돌대출', max: 90000, area: 85, src: 'https://nhuf.molit.go.kr/FP/FP05/FP0503/FP05030801.jsp' },
];
const FLAGS = { SPECLT_RDN_EARTH_AT: '투기과열지구', MDAT_TRGET_AREA_SECD: '조정대상지역', PARCPRC_ULS_AT: '분양가상한제 적용', PUBLIC_HOUSE_EARTH_AT: '공공주택지구', LRSCL_BLDLND_AT: '대규모 택지개발지구', IMPRMN_BSNS_AT: '정비사업', NPLN_PRVOPR_PUBLIC_HOUSE_AT: '수도권 민영 공공주택지구' };

async function odcloud(op, no, key) {
  const u = new URL(ODCLOUD + op);
  u.searchParams.set('serviceKey', key); u.searchParams.set('returnType', 'JSON'); u.searchParams.set('page', 1); u.searchParams.set('perPage', 200);
  u.searchParams.set('cond[HOUSE_MANAGE_NO::EQ]', no);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${op} HTTP ${r.status}`); // URL은 키가 들어 있어 찍지 않는다
  return (await r.json()).data || [];
}

const ar = (ty) => +String(ty).slice(0, 3); // "049.0000A" → 49(전용)
const man = (n) => n.toLocaleString() + '만원';
const eok = (n) => (n >= 10000 ? `${Math.floor(n / 10000)}억${n % 10000 ? ' ' + (n % 10000).toLocaleString() + '만' : ''}원` : man(n));
const pyOf = (amount, area) => Math.round(amount / (area / PY));
// 거리: 100m 이상은 100m 아래를 버려 "약 1.7km", 100m 안이면 그대로 "85m"
export const dist = (m) => (m < 100 ? `${m}m` : `약 ${(Math.floor(m / 100) / 10).toFixed(1)}km`);

export async function collect(no, dataSrc) {
  const key = await dataKey(), vkey = await keyOf();
  if (!key || !vkey) throw new Error('.env에 DATA_GO_KR_KEY·VWORLD_KEY 필요');
  const data = await loadData(dataSrc);
  const it = data.items.find((x) => x.id.startsWith(no + '-'));
  if (!it) throw new Error(`수집본에 공고 ${no} 없음`);
  const [d] = await odcloud('getAPTLttotPblancDetail', no, key);
  const models = await odcloud('getAPTLttotPblancMdl', no, key);
  if (!d) throw new Error(`청약홈 상세 없음: ${no}`);
  // 주택형(전용)별로 묶기: 공급면적·세대·최고 분양가
  const byAr = new Map();
  for (const m of models) {
    const a = ar(m.HOUSE_TY), top = +m.LTTOT_TOP_AMOUNT || 0, units = (+m.SUPLY_HSHLDCO || 0) + (+m.SPSPLY_HSHLDCO || 0);
    const g = byAr.get(a) || { area: a, supply: [], units: 0, types: 0, min: Infinity, max: 0 };
    g.supply.push(+m.SUPLY_AR); g.units += units; g.types += 1; g.min = Math.min(g.min, top); g.max = Math.max(g.max, top);
    byAr.set(a, g);
  }
  const types = [...byAr.values()].sort((x, y) => x.area - y.area).map((g) => ({ area: g.area, supply: Math.round((g.supply.reduce((s, v) => s + v, 0) / g.supply.length) * 100) / 100, units: g.units, types: g.types, min: g.min, max: g.max, perPy: pyOf(g.max, g.area) }));
  const main = types.reduce((a, b) => (b.units > a.units ? b : a), types[0]);
  const tier = tierOf(it.name, d.BSNS_MBY_NM, d.CNSTRCT_ENTRPS_NM);
  const leasehold = /토지임대부/.test(it.name);
  const site = await locate(it.address, vkey);
  const near = site ? { stations: await stations(site.lon, site.lat), bus: await busNear(site.lon, site.lat, it.region), schools: await schoolsAt(site.lon, site.lat) } : { skip: '위치 못 찾음' };
  // 핵심 버스 노선마다 갈아타지 않고 닿는 역(정거장 수)
  if (site && near.bus?.routes) for (const r of near.bus.routes.filter(isCore).slice(0, 8)) r.reach = await routeReach(r, site.lon, site.lat, key);
  const trades = await nearbyTrades(it.address, main.area, { tier });
  return {
    item: it, dataUpdatedAt: data.updatedAt,
    detail: {
      no, name: d.HOUSE_NM, kind: d.HOUSE_DTL_SECD_NM, rent: d.RENT_SECD_NM, units: d.TOT_SUPLY_HSHLDCO, developer: d.BSNS_MBY_NM, builder: d.CNSTRCT_ENTRPS_NM,
      moveIn: d.MVN_PREARNGE_YM ? `${d.MVN_PREARNGE_YM.slice(0, 4)}.${d.MVN_PREARNGE_YM.slice(4)}` : null, notice: d.RCRIT_PBLANC_DE, url: d.PBLANC_URL, homepage: d.HMPG_ADRES,
      flags: Object.entries(FLAGS).filter(([k]) => d[k] === 'Y').map(([, v]) => v), area: d.SUBSCRPT_AREA_CODE_NM,
    },
    tier, leasehold, types, mainArea: main.area, nearby: near, trades,
  };
}

// ── 본문 ─────────────────────────────────────────
const H2 = (t) => `<h2 style="font-weight:700">${t}</h2>`;
const note = (lines) => (lines || []).filter(Boolean).map((s) => `<p>${esc(s)}</p>`).join('\n');
const box = (inner) => `<div style="border:1px solid ${C.line};border-radius:16px;padding:16px 20px;margin:16px 0">${inner}</div>`;
const table = (head, rows) => `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:560px"><thead><tr>${head.map((h) => `<th ${TH}>${h}</th>`).join('')}</tr></thead><tbody>
${rows.map((r) => `<tr>${r.map((c) => `<td ${TD}>${c}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>`;

// 색: 지하철 노선색(posts/line_colors.json), 버스 종류색(빨강 광역·직행좌석, 파랑 간선·좌석, 초록 지선·일반·마을, 노랑 순환)
const LINE_COLORS = JSON.parse(await readFile(new URL('./line_colors.json', import.meta.url), 'utf8')).colors;
const BUS_COLORS = { 광역: '#E60012', 직행좌석버스: '#E60012', 광역급행버스: '#E60012', 간선: '#0068B7', 좌석버스: '#0068B7', 공항: '#0068B7', 지선: '#3D9B35', 일반버스: '#3D9B35', 마을: '#3D9B35', 마을버스: '#3D9B35', 순환: '#F2A900' };
const lum = (hex) => { const c = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const onWhite = (hex) => 1.05 / (lum(hex) + 0.05);
// 흰 바탕 글씨로 쓸 색: 대비 4.5:1이 될 때까지 검정 쪽으로 조금씩 진하게
export function ink(hex) {
  let c = hex.slice(1).match(/../g).map((x) => parseInt(x, 16));
  const h = () => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  while (onWhite(h()) < 4.5) c = c.map((v) => v * 0.92);
  return h();
}
// 색 알약: 노선·버스 종류 표시(밝은 색은 검은 글씨)
const pill = (text, bg) => `<span style="display:inline-block;padding:0 7px;border-radius:999px;background:${bg};color:${onWhite(bg) >= 3 ? '#ffffff' : '#1c1f24'};font-size:12px;font-weight:700;line-height:1.6;vertical-align:1px">${text}</span>`;
const lineShort = (l) => l.replace(/^(\d+)호선$/, '$1');
const busColor = (t) => BUS_COLORS[t] || '#6b7280';

// 두 줄 칸: 위는 굵은 값, 아래는 작은 설명(줄 중간에서 끊기지 않게 nowrap)
const two = (top, sub) => `<span style="font-weight:700;white-space:nowrap">${top}</span>${sub ? `<br><span style="font-size:13px;font-weight:400;color:${C.muted};white-space:nowrap">${sub}</span>` : ''}`;

export function renderFacts(f) {
  const { item: it, detail: d, types, trades: t, nearby: n } = f;
  const out = {};
  out.glance = box(`<p style="margin:0 0 6px"><span style="font-weight:700">${esc(where(it))}</span> · ${esc(d.kind)} · ${d.units.toLocaleString()}세대 · 시행 ${esc(d.developer)}</p>
<p style="margin:0 0 6px">시공 ${esc(d.builder)}${d.moveIn ? ` · 입주 예정 ${d.moveIn}` : ''} · 모집공고 ${full(d.notice)}</p>
<p style="margin:0">${it.phases.map((p) => `<span style="font-weight:700">${label(it, p.k)}</span> ${span(p, md)}`).join(' · ')}</p>`);
  out.types = table([two('주택형', '공급면적(평균)'), '세대(일반+특별)', two('분양가', '최고가 기준'), two('3.3㎡당', '전용면적 기준')],
    types.map((g) => [two(`전용 ${g.area}㎡`, `${g.types > 1 ? `${g.types}개 타입 · ` : ''}공급 ${g.supply}㎡`), `${g.units.toLocaleString()}세대`, g.min === g.max ? two(eok(g.max)) : two(eok(g.max), `가장 낮은 타입 ${eok(g.min)}`), man(g.perPy)]));
  const row = (g) => [two(`${esc(g.apt)}${g.leasehold ? ' (토지임대부)' : ''}`, `${(g.d / 1000).toFixed(1)}km · ${g.built ? `${g.built}년 준공` : '준공 연도 없음'}`), g.near ? two(eok(g.near.amount), `전용 ${g.near.ar}㎡ · ${g.near.count}건 · 최근 ${g.near.last.replace('-', '.')}`) : `<span style="color:${C.muted}">비교 면적 거래 없음</span>`, two(man(Math.round(g.perPy)), `${g.count}건`)];
  out.trades = t.skip ? `<p>실거래를 불러오지 못했습니다(${esc(t.skip)}).</p>` : `${table([two('단지', '거리 · 준공'), two('비슷한 면적 거래가', `전용 ${t.area}±15㎡ 중앙값`), two('3.3㎡당', '전용 기준 중앙값')], t.same.map(row))}
<p style="font-size:14px;color:${C.muted}">비교 기준: 같은 등급(${esc(t.tier)}) 단지, 반경 ${t.widened ? `${t.wide / 1000}km(1.5km 안에 2곳 미만이라 넓힘)` : `${t.range / 1000}km`}, ${t.months} 거래, 해제·직거래 제외, 직선거리. 법정동코드 ${t.lawd} 안 거래만 포함(경계 너머 단지는 빠짐).</p>
${t.others.length ? `<p style="font-size:14px;color:${C.muted}">참고 — 1.5km 안 다른 등급 단지: ${t.others.map((g) => `${esc(g.apt)}(${g.tier}, ${g.built}년, 3.3㎡당 ${man(Math.round(g.perPy))})`).join(', ')}</p>` : ''}`;
  out.leasehold = f.leasehold ? box(`<p style="margin:0"><span style="font-weight:700">토지임대부 분양주택</span>: 분양가에 토지값이 들어 있지 않고, 토지는 사업주체에 매달 임대료를 냅니다(금액은 입주자모집공고 확인). 그래서 토지 소유권이 있는 주변 아파트와 분양가를 그대로 비교할 수 없습니다. 관련 법령상 전매제한 10년·거주의무 5년입니다(주택법 시행령 별표3·제60조의2, 공고문으로 최종 확인).</p>`) : '';
  // 학교: 학구도(배정) 기준. 중·고는 학교군 안 가까운 3곳, 초등은 통학구역(지정 전이면 인접 구역). 지원·선발 학교는 따로
  const sc = n.schools || {}, list = (xs, k = 3) => xs.slice(0, k).map((s) => `${esc(s.name)} ${dist(s.d)}`).join(', ');
  const elem = (sc.elem || []).length ? sc.elem.map((z) => (z.near != null ? `${list(z.schools, 1)} (통학구역 지정 전 · 인접 구역)` : list(z.schools))).join(', ') : '확인 못 함';
  const group = (zs) => (zs || []).map((z) => `<span style="font-weight:700">${esc(z.name)}</span> ${z.schools.length}곳 중 가까운 곳: ${list(z.schools)}`).join('<br>') || '확인 못 함';
  const sel = Object.entries(sc.selective || {}).filter(([, v]) => v.length).map(([k, v]) => `${k.replace('학교', '')}: ${v.map((s) => `${esc(s.name)}(${s.type}) ${dist(s.d)}`).join(', ')}`).join('<br>') || `${SCHOOL_SELECT_KM}km 안 없음`;
  // 버스: 가까운 정류장 2곳 + 지나는 노선을 종류별로
  const busCell = (b) => {
    if (!b || b.skip) return '확인 못 함';
    if (!b.stops.length) return '반경 안 정류장 없음';
    const by = new Map(); for (const r of b.routes) { if (!by.has(r.type)) by.set(r.type, []); by.get(r.type).push(`<span style="font-weight:700;color:${ink(busColor(r.type))}">${esc(r.no)}</span>`); }
    return `${b.stops.slice(0, 2).map((s) => `${esc(s.name)} ${dist(s.d)}`).join(', ')}${b.stops.length > 2 ? ` 외 ${b.stops.length - 2}곳` : ''}<br>${[...by].map(([t, ns]) => `${pill(esc(t), busColor(t))} ${ns.join(' · ')}`).join('&nbsp;&nbsp;') || '노선 정보 없음'}`;
  };
  // 핵심 버스 노선: 기점 ↔ 종점(어디까지 가는지), 배차 간격
  const core = (n.bus?.routes || []).filter(isCore).slice(0, 8);
  const reachCell = (x) => {
    if (!x || x.skip || !x.stations.length) return `<span style="color:${C.muted}">약 ${LIMIT_MIN}분 안에 지나는 역 없음</span>`;
    const hubs = [...new Set(x.stations.map((s) => s.hub).filter(Boolean))];
    // 30분 안 역은 모두(최대 8곳), 역마다 한 덩어리로 줄바꿈되게
    return x.stations.slice(0, 8).map((s) => {
      const c = LINE_COLORS[s.lines?.[0]] || '#6b7280';
      const pills = (s.lines || []).map((l) => pill(esc(lineShort(l)), LINE_COLORS[l] || '#6b7280')).join(' ');
      return `<span style="white-space:nowrap"><span style="font-weight:700;color:${ink(c)}">${esc(s.name)}</span> ${pills} ${s.n}정거장·약 ${s.min}분</span>`;
    }).join('<br>') + (hubs.length ? `<br><span style="font-size:13px;color:${C.muted}">업무 중심지: ${hubs.map(esc).join(', ')}</span>` : '');
  };
  out.busRoutes = core.length ? `<p style="font-weight:700;margin:20px 0 8px">버스 핵심 노선 — 갈아타지 않고 닿는 곳</p>` + table([two('노선', '배차 간격'), two('기점 ↔ 종점', '노선 양 끝'), two(`약 ${LIMIT_MIN}분 안에 닿는 역`, '노선마다 가장 가까운 역 · 정거장 수 · 추정 시간')],
    core.map((r) => [two(`<span style="color:${ink(busColor(r.type))}">${esc(r.no)}번</span> ${pill(esc(r.type), busColor(r.type))}`, r.term ? `${r.term}분 간격` : ''), r.from && r.to ? `${esc(r.from)} ↔ ${esc(r.to)}` : '정보 없음', reachCell(r.reach)]))
    + `<p style="font-size:14px;color:${C.muted}">단지에서 가까운 정류장(${esc(core.find((r) => r.reach?.board)?.reach.board || '-')} 등)에서 타서 단지에서 멀어지는 방향 기준입니다. 정류장 250m 안 철도역을 셌습니다. 시간은 노선 거리를 평균 시속 ${ASSUMED_KMH}km로 나눈 추정치라 실제와 다를 수 있고, 약 ${LIMIT_MIN}분을 넘는 역은 뺐습니다. 업무 중심지 목록: 강남·잠실·여의도·도심·판교·성수 등.</p>` : '';
  out.place = n.skip ? `<p>주변 정보를 찾지 못했습니다.</p>` : table([two('구분'), two('교통·학교', '직선거리, 가까운 순')], [
    [two('지하철·철도역'), (Array.isArray(n.stations) && n.stations.length ? n.stations.map((s) => { const ls = [...new Set((s.lines || []).map(canonLine))]; return `<span style="white-space:nowrap"><span style="font-weight:700;color:${ink(LINE_COLORS[ls[0]] || '#6b7280')}">${esc(s.name)}</span> ${ls.length ? ls.map((l) => pill(esc(lineShort(l)), LINE_COLORS[l] || '#6b7280')).join(' ') : `(${esc(s.kind)})`} ${dist(s.d)}</span>`; }).join('<br>') : '3km 안 없음')],
    [two('버스', `정류장 반경 ${n.bus?.radius ?? 500}m`), busCell(n.bus)],
    [two('초등학교', '배정(통학구역)'), elem],
    [two('중학교', '배정 학교군'), group(sc.middle)],
    [two('고등학교', sc.nonflat?.length ? '비평준화 지역' : '배정 학교군'), sc.nonflat?.length ? `비평준화 지역(${esc(sc.nonflat.join(', '))}) — 학교별 선발` : group(sc.high)],
    [two('지원·선발 학교', `반경 ${SCHOOL_SELECT_KM}km`), sel],
  ]) + `<p style="font-size:14px;color:${C.muted}">배정 기준: ${SCHOOL_SOURCE}. 중·고는 학교군 안에서 지망·추첨으로 배정되므로 가까운 학교가 곧 배정 학교는 아닙니다. 지원·선발 학교는 사립·국립 초등학교, 국제·예술·체육중, 특수목적고(이름 기준)이며 자율형사립고는 빠져 있습니다. 최종 배정은 교육지원청에서 확인하세요. 역: © OpenStreetMap contributors. 버스: ${esc(n.bus?.source || '')}.</p>`;
  const flags = d.flags.length ? d.flags.join(' · ') : '해당 표시 없음';
  out.rules = table(['항목', '내용'], [
    ['규제·지구 (청약홈 공고 정보)', esc(flags)],
    ['청약 지역 구분', esc(d.area || '-')],
    ['공급 유형', `${esc(d.kind)} · ${esc(d.rent)}`],
  ]) + `<p style="font-size:14px;color:${C.muted}">전매제한·실거주 의무 기간은 공고문에 적힌 내용이 기준입니다. 분양가상한제 수도권 주택은 법령상 실거주 의무가 있습니다.</p>`;
  const ok = '<span style="font-weight:700;color:#0a7a5c;white-space:nowrap">요건 안</span>', no = `<span style="color:${C.muted};white-space:nowrap">요건 밖</span>`;
  const loanRows = types.map((g) => [two(`전용 ${g.area}㎡`, `최고 ${eok(g.max)}`), ...LOAN.map((l) => (g.max <= l.max && (!l.area || g.area <= l.area) ? ok : no))]);
  out.loans = table([two('주택형', '최고 분양가'), ...LOAN.map((l) => two(l.name, `${eok(l.max)} 이하${l.area ? `·전용 ${l.area}㎡ 이하` : ''}`))], loanRows) + `<p style="font-size:14px;color:${C.muted}">주택가격·전용면적 요건만 따진 표입니다(요건 안 = 그 기준 안에 든다는 뜻). 실제 대상·한도는 소득·자산·무주택 여부와 심사로 정해집니다${f.leasehold ? '. 토지임대부 주택의 정책대출 취급 여부는 각 기관에 확인하세요' : ''}. 기준: ${LOAN.map((l) => `<a href="${l.src}" target="_blank" rel="noopener">${l.name}</a>`).join(', ')} (확인일 ${LOANS_CHECKED}).${d.flags.includes('투기과열지구') || d.flags.includes('조정대상지역') ? ' 규제지역이라 일반 주택담보대출 LTV는 무주택 40%(생애최초 70%)이고, 수도권 주담대 한도는 시가 15억원 이하 6억원입니다(금융위원회, 확인일 ' + LOANS_CHECKED + ').' : ''}</p>`;
  out.links = `<p><a href="${esc(d.url)}" target="_blank" rel="noopener">청약홈 입주자모집공고 보기</a>${d.homepage ? ` · <a href="${esc(d.homepage)}" target="_blank" rel="noopener">사업주체 홈페이지</a>` : ''}</p>`;
  return out;
}

export function render(f, notes = {}, images = []) {
  const x = renderFacts(f), has = new Set(images.map((i) => i.key));
  const img = (k) => (has.has(k) ? IMG(k) : '');
  return [
    img('card'), note(notes.intro), H2('한눈에'), x.glance, x.types,
    H2('분양가와 주변 실거래'), x.leasehold, note(notes.price), x.trades,
    H2('입지 — 교통·학교'), img('map'), note(notes.place), x.place, x.busRoutes,
    H2('자격·규제'), note(notes.rules), x.rules,
    H2('대출·자금'), note(notes.loans), x.loans,
    H2('공고문·문의'), x.links,
    `<p style="font-size:13px;color:${C.muted}">기준: 청약홈(한국부동산원) 분양정보 ${f.dataUpdatedAt.slice(0, 10)} 수집 · 실거래 ${esc(f.trades.source || '')} · 이 글은 공고와 공개 자료를 정리한 것이며 청약·투자 권유가 아닙니다.</p>`,
    `<p style="font-size:13px;color:${C.muted}">※ ${DISCLAIMER}</p>`,
  ].filter(Boolean).join('\n');
}

export function titleOf(f) {
  const short = f.item.name.replace(/\(.*?\)/g, '').trim();
  return `[분양분석] ${short} — 분양가·주변 실거래·교통·학군·대출 정리`;
}

export function draftOf(f, notes = {}, images = []) {
  return { type: 'analysis', no: f.detail.no, title: titleOf(f), category: '분양분석', tags: [...new Set(['분양분석', '청약', f.item.region + '청약', f.item.name.replace(/\(.*?\)|\s/g, '').slice(0, 20), f.leasehold ? '토지임대부' : null, f.detail.kind === '국민' ? '공공분양' : null].filter(Boolean))].slice(0, 10), facts: f, notes, images, html: render(f, notes, images) };
}

// 검수: 본문 = 다시 그린 결과, notes의 숫자는 facts로 그린 글자 안에 있어야, 금지어 없음
export function checkAnalysis(draft) {
  const issues = [];
  if (render(draft.facts, draft.notes, draft.images || []) !== draft.html) issues.push('본문이 facts·notes로 다시 그린 결과와 다릅니다(--render).');
  const factsText = render(draft.facts, {}, []).replace(/<[^>]+>/g, ' ').replace(/,/g, '');
  const nums = new Set(factsText.match(/\d+(\.\d+)?/g));
  for (const [k, lines] of Object.entries(draft.notes || {})) for (const line of lines || []) {
    let rest = line; [draft.facts.item.name].forEach((nm) => { rest = rest.split(nm).join(' '); });
    for (const m of rest.replace(/,/g, '').match(/\d+(\.\d+)?/g) || []) if (!nums.has(m)) issues.push(`notes.${k}의 숫자 "${m}"가 수집·조회 값에 없습니다: ${line}`);
  }
  const text = [draft.title, ...Object.values(draft.notes || {}).flat()].join('\n').split(draft.facts.item.name).join(' ');
  BANNED.forEach((b) => { if (text.includes(b)) issues.push(`금지 표현 "${b}"`); });
  if (!draft.html.includes(DISCLAIMER)) issues.push('면책 문구 없음');
  if (!Object.values(draft.notes || {}).flat().length) issues.push('notes가 비어 있습니다(intro·price·place·rules·loans).');
  return issues;
}

async function images(f, out) {
  await mkdir(out, { recursive: true });
  const it = f.item, rec = it.phases.find((p) => ['sp', 'p1', 'p2'].includes(p.k)) || it.phases[0];
  const mon = new Date(rec.date + 'T00:00:00Z'); mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7));
  const start = mon.toISOString().slice(0, 10), end = new Date(mon.getTime() + 6 * 864e5).toISOString().slice(0, 10);
  const pages = [{ name: 'card', html: itemHtml(it, { start, end }) }];
  const m = await mapHtml(it, await keyOf());
  if (!m.skip) pages.push({ name: 'map', html: m.html });
  const files = await renderPngs(pages, out);
  return files.map((file, i) => ({ key: pages[i].name, file: file.replace(/\\/g, '/'), alt: pages[i].name === 'card' ? `${it.name} 청약 일정 카드` : `${it.name} 위치 지도(반경 500m·1km)` }));
}

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const rp = arg('--render');
  if (rp) {
    const d = JSON.parse(await readFile(rp, 'utf8'));
    await writeFile(rp, JSON.stringify(draftOf(d.facts, d.notes, d.images), null, 2));
    const issues = checkAnalysis(JSON.parse(await readFile(rp, 'utf8')));
    console.log(issues.length ? issues.map((i) => '✗ ' + i).join('\n') : `검수 통과 — ${d.title}`);
    process.exitCode = issues.length ? 4 : 0;
    return;
  }
  const no = process.argv[2];
  if (!/^\d{10}$/.test(no || '')) { console.log('사용: node posts/analysis_post.mjs <공고번호10자리> [--data 수집본]'); process.exit(1); }
  const f = await collect(no, arg('--data') || undefined);
  const base = `drafts/analysis_${no}`;
  const imgs = await images(f, base + '.img');
  await writeFile(base + '.json', JSON.stringify(draftOf(f, {}, imgs), null, 2));
  console.log(`${base}.json — ${titleOf(f)}\n등급 ${f.tier} · 같은 급 비교 ${f.trades.same?.length ?? 0}곳 · 그림 ${imgs.length}장`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

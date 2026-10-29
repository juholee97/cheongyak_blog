// 분양분석 글 초안: 공고 1건 → 청약홈 상세(규제·주택형별 금액) + 주변 같은 등급 실거래 + 학교·역 + 대출 기준 → drafts/analysis_{공고번호}.json
// node posts/analysis_post.mjs 2026000373 [--data drafts/2026-11-02_weekly.data.json]   새 초안(notes는 비워 둠)
// node posts/analysis_post.mjs --render drafts/analysis_2026000373.json                  notes를 고친 뒤 본문만 다시 그림
// 규칙: 숫자는 facts(수집·조회 값)에서만. notes(사람/Claude가 쓰는 문장)의 숫자도 facts에 있어야 검수 통과(checkAnalysis). 투자 권유·"로또" 류 금지.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadData, esc, span, label, where, full, md, C, TH, TD, IMG, BLOG_URL, DISCLAIMER, toc } from './weekly.mjs';
import { BANNED } from './check.mjs';
import { useApi } from '../zip/guard.mjs';
import { stations } from './nearby.mjs';
import { schoolsAt, SOURCE as SCHOOL_SOURCE } from './schools.mjs';
import { busNear, isCore } from './bus.mjs';
import { routeReach, canonLine, ASSUMED_KMH, LIMIT_MIN } from './routes.mjs';
import { nearbyTrades, dataKey, tierOf, locate, PY } from './trades.mjs';
import { keyOf, mapHtml } from './map.mjs';
import { itemHtml, renderPngs, searchThumbHtml } from './card.mjs';
import { plansFor } from './floorplan.mjs';
import { noticeText, termsOf } from './notice_terms.mjs';
import { feeNear, feeFor } from './kapt_fee.mjs';
import { moneyOf, checkMoney, bankRate, BANK, POLICY_YEARS, INCOME, incomeAt, PRIVATE_RULES, PRIVATE_ASSET, MONEY_CHECKED } from './money.mjs';

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

export async function odcloud(op, no, key) {
  useApi('datago'); // 호출 한도 가드(zip/guard.mjs)
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
// 같은 등급 비교 단지는 핵심 3~5곳만 보여 준다(2026-10-28 사용자 지시): 비슷한 면적 거래가 있는 단지 먼저, 가까운 순. 3곳 이하면 그대로
export const CORE_MAX = 5;
export function coreOf(t) {
  const s = [...(t.same || [])].sort((a, b) => (!!b.near - !!a.near) || a.d - b.d);
  return s.slice(0, CORE_MAX).sort((a, b) => a.d - b.d);
}
export const dist = (m) => (m < 100 ? `${m}m` : `약 ${(Math.floor(m / 100) / 10).toFixed(1)}km`);

export async function collect(no, dataSrc, { v2 = false } = {}) {
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
  const trades = v2 ? { skip: '시세 비교는 우리의 집 글에서' } : await nearbyTrades(it.address, main.area, { tier }); // v2는 시세 절이 없다(2026-10-29)
  const f = {
    item: it, dataUpdatedAt: data.updatedAt,
    detail: {
      no, name: d.HOUSE_NM, kind: d.HOUSE_DTL_SECD_NM, rent: d.RENT_SECD_NM, units: d.TOT_SUPLY_HSHLDCO, developer: d.BSNS_MBY_NM, builder: d.CNSTRCT_ENTRPS_NM,
      moveIn: d.MVN_PREARNGE_YM ? `${d.MVN_PREARNGE_YM.slice(0, 4)}.${d.MVN_PREARNGE_YM.slice(4)}` : null, notice: d.RCRIT_PBLANC_DE, url: d.PBLANC_URL, homepage: d.HMPG_ADRES,
      flags: Object.entries(FLAGS).filter(([k]) => d[k] === 'Y').map(([, v]) => v), area: d.SUBSCRPT_AREA_CODE_NM,
    },
    tier, leasehold, types, mainArea: main.area, nearby: near, trades,
  };
  if (v2) f.titleV = 2; // 새 제목(공개된 글은 enrich해도 옛 제목 유지)
  return v2 ? addV2(f, d, models) : f;
}

// v2 자료(2026-10-29): 공급 유형별 세대·공고문 조건·은행 금리. 이 값이 있는 초안만 새 절(필요 현금·가구별·주택형 비교·따져 볼 점)을 그린다 —
// 이 값이 없는 옛 초안은 옛 모양 그대로 그린다. 새로 모으는 초안은 기본 v2(2026-10-29 샘플 승인, --v1이면 옛 모양), 공개 글은 --enrich로 더한 뒤 재수정 대기열로.
async function addV2(f, d, models) {
  const doc = await noticeText(f.detail.no).catch((e) => ({ skip: e.message }));
  f.detail.publicLaw = d.PUBLIC_HOUSE_SPCLW_APPLC_AT === 'Y'; // 공공주택 특별법 적용(공공분양 소득·자산 기준)
  f.supply = supplyOf(models);
  f.terms = doc.skip ? { skip: doc.skip } : termsOf(doc, models);
  const saved = await bankRate(); // 한국은행 금리는 월 1회 발표 — 저장값이 20일 넘었으면 다시 받는다(ECOS_KEY 없으면 저장값)
  f.bank = !saved || Date.now() - Date.parse(saved.fetched) > 20 * 864e5 ? await bankRate({ refresh: true }) : saved;
  return addFee(f);
}
// 관리비 가정 계산: 같은 시·군·구 최근 입주 단지의 K-apt 공개 관리비(주소 좌표는 저장본이라 브이월드를 다시 부르지 않는다).
// 공공주택지구 주소(「시흥거모 공공주택지구 내 S-1블록」)는 지오코더가 못 찾아서 「시·도 시·군·구 ○○동」까지만으로 시·군·구 코드를 다시 찾는다
export function dongOf(addr) {
  const inner = /\(([^)]*(?:동|읍|면|리)\s[^)]*)\)/.exec(addr)?.[1];
  const t = (inner && /^\S+(도|시)\s/.test(inner) ? inner : addr).split(/\s+/);
  const i = t.findIndex((w, j) => j > 0 && /(동|읍|면|리|가),?$/.test(w));
  return i > 0 ? t.slice(0, i + 1).join(' ').replace(/,$/, '') : null;
}
export async function addFee(f) {
  const vkey = await keyOf();
  let lawd = (await locate(f.item.address, vkey).catch(() => null))?.lawd;
  if (!lawd && dongOf(f.item.address)) lawd = (await locate(dongOf(f.item.address), vkey).catch(() => null))?.lawd;
  f.fee = await feeNear(lawd).catch((e) => ({ skip: e.message }));
  return f;
}
export async function enrich(f) {
  const key = await dataKey();
  const [d] = await odcloud('getAPTLttotPblancDetail', f.detail.no, key);
  return addV2(f, d || {}, await odcloud('getAPTLttotPblancMdl', f.detail.no, key));
}

// 특별공급 유형별 세대(청약홈 주택형 자료): 주택형(전용)별로 묶고, 유형 합이 특별공급 수와 맞는지 검산
const SP = [['NWBB_HSHLDCO', '신생아'], ['NWWDS_HSHLDCO', '신혼부부'], ['LFE_FRST_HSHLDCO', '생애최초'], ['YGMN_HSHLDCO', '청년'], ['MNYCH_HSHLDCO', '다자녀'], ['OLD_PARNTS_SUPORT_HSHLDCO', '노부모부양'], ['INSTT_RECOMEND_HSHLDCO', '기관추천'], ['TRANSR_INSTT_ENFSN_HSHLDCO', '이전기관'], ['ETC_HSHLDCO', '그 밖']];
export function supplyOf(models) {
  const by = new Map();
  for (const m of models) {
    const a = ar(m.HOUSE_TY), g = by.get(a) || { area: a, general: 0, special: 0, sp: Object.fromEntries(SP.map(([k]) => [k, 0])) };
    g.general += +m.SUPLY_HSHLDCO || 0; g.special += +m.SPSPLY_HSHLDCO || 0;
    for (const [k] of SP) g.sp[k] += +m[k] || 0;
    by.set(a, g);
  }
  const rows = [...by.values()].sort((x, y) => x.area - y.area);
  return { rows, ok: rows.every((g) => Object.values(g.sp).reduce((s, v) => s + v, 0) === g.special) };
}

// ── 본문 ─────────────────────────────────────────
const H2 = (t, id) => `<h2${id ? ` id="${id}"` : ''} style="font-weight:700">${t}</h2>`;
// 목차에 싣는 소제목(id 고정)
const HEADS = [['glance', '한눈에'], ['price', '분양가와 주변 실거래'], ['place', '입지 — 교통·학교'], ['rules', '자격·규제'], ['loans', '대출·자금'], ['links', '공고문·문의']];
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
  out.trades = t.skip ? `<p>실거래를 불러오지 못했습니다(${esc(t.skip)}).</p>` : `${table([two('단지', '거리 · 준공'), two('비슷한 면적 거래가', `전용 ${t.area}±15㎡ 중앙값`), two('3.3㎡당', '전용 기준 중앙값')], coreOf(t).map(row))}
${(t.same || []).length > coreOf(t).length ? `<p style="font-size:13px;color:${C.muted}">같은 등급 ${t.same.length}곳 중 비슷한 면적 거래가 있는 가까운 ${coreOf(t).length}곳만 보여요.</p>` : ''}
<p style="font-size:13px;color:${C.muted}">같은 등급(${esc(t.tier)}) · 반경 ${(t.widened ? t.wide : t.range) / 1000}km${t.widened ? '(넓힘)' : ''} · ${t.months} · 해제·직거래 제외 · ${esc(it.district || '같은 시군구')} 안 거래만</p>
${t.others.length ? `<p style="font-size:13px;color:${C.muted}">같은 등급이 아닌 단지 ${t.others.length}곳은 위 표에서 뺐어요(단지 목록은 생략).</p>` : ''}`; // 다른 등급 단지를 한 줄씩 나열하던 긴 목록은 뺐다(2026-10-28 사용자 지시: 불필요한 설명)
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
    + `<p style="font-size:13px;color:${C.muted}">시간은 평균 시속 ${ASSUMED_KMH}km 기준 추정 · ${esc(n.bus?.source || '')}</p>` : '';
  out.place = n.skip ? `<p>주변 정보를 찾지 못했습니다.</p>` : table([two('구분'), two('교통·학교', '직선거리, 가까운 순')], [
    [two('지하철·철도역'), (Array.isArray(n.stations) && n.stations.length ? n.stations.map((s) => { const ls = [...new Set((s.lines || []).map(canonLine))]; return `<span style="white-space:nowrap"><span style="font-weight:700;color:${ink(LINE_COLORS[ls[0]] || '#6b7280')}">${esc(s.name)}</span> ${ls.length ? ls.map((l) => pill(esc(lineShort(l)), LINE_COLORS[l] || '#6b7280')).join(' ') : `(${esc(s.kind)})`} ${dist(s.d)}</span>`; }).join('<br>') : '3km 안 없음')],
    [two('버스', `정류장 반경 ${n.bus?.radius ?? 500}m`), busCell(n.bus)],
    [two('초등학교', '배정(통학구역)'), elem],
    [two('중학교', '배정 학교군'), group(sc.middle)],
    [two('고등학교', sc.nonflat?.length ? '비평준화 지역' : '배정 학교군'), sc.nonflat?.length ? `비평준화 지역(${esc(sc.nonflat.join(', '))}) — 학교별 선발` : group(sc.high)],
    [two('지원·선발 학교', `반경 ${SCHOOL_SELECT_KM}km`), sel],
  ]) + `<p style="font-size:13px;color:${C.muted}">학구도 2026.09 기준, 중·고는 학교군 안 추첨 · 배정은 교육지원청 확인 · 역 © OpenStreetMap</p>`;
  const flags = d.flags.length ? d.flags.join(' · ') : '해당 표시 없음';
  out.rulesTable = table(['항목', '내용'], [
    ['규제·지구 (청약홈 공고 정보)', esc(flags)],
    ['청약 지역 구분', esc(d.area || '-')],
    ['공급 유형', `${esc(d.kind)} · ${esc(d.rent)}`],
  ]);
  out.rules = out.rulesTable + `<p style="font-size:14px;color:${C.muted}">전매제한·실거주 의무 기간은 공고문에 적힌 내용이 기준입니다. 분양가상한제 수도권 주택은 법령상 실거주 의무가 있습니다.</p>`; // v2는 공고문 기간 표가 있어 이 문장 없이 rulesTable만
  const ok = '<span style="font-weight:700;color:#0a7a5c;white-space:nowrap">요건 안</span>', no = `<span style="color:${C.muted};white-space:nowrap">요건 밖</span>`;
  const loanRows = types.map((g) => [two(`전용 ${g.area}㎡`, `최고 ${eok(g.max)}`), ...LOAN.map((l) => (g.max <= l.max && (!l.area || g.area <= l.area) ? ok : no))]);
  out.loans = table([two('주택형', '최고 분양가'), ...LOAN.map((l) => two(l.name, `${eok(l.max)} 이하${l.area ? `·전용 ${l.area}㎡ 이하` : ''}`))], loanRows) + `<p style="font-size:13px;color:${C.muted}">가격·면적 요건만 · 실제 한도는 소득·심사로 결정${d.flags.includes('투기과열지구') || d.flags.includes('조정대상지역') ? ' · 규제지역 LTV 40%(생애최초 70%), 수도권 주담대 한도 6억원' : ''} · <a href="${LOAN[0].src}" target="_blank" rel="noopener">주택도시기금</a>·<a href="${LOAN[2].src}" target="_blank" rel="noopener">주택금융공사</a>·금융위원회, 확인일 ${LOANS_CHECKED}</p>`;
  out.links = `<p><a href="${esc(d.url)}" target="_blank" rel="noopener">청약홈 입주자모집공고 보기</a>${d.homepage ? ` · <a href="${esc(d.homepage)}" target="_blank" rel="noopener">사업주체 홈페이지</a>` : ''}</p>`;
  return out;
}

// 같은 단지의 시세 비교 글(auleezip.com)이 있으면 서로 연결 — 목록은 zip/post.mjs가 data/zip_posts/index.json에 쓴다
const ZIP_INDEX = JSON.parse(await readFile(new URL('../data/zip_posts/index.json', import.meta.url), 'utf8').catch(() => '{}'));
const zipLink = (f) => { const slug = ZIP_INDEX[String(f.item.id).split('-')[0]]; return slug ? `<p>이 단지의 분양가를 주변 단지 실거래와 맞춰 본 글은 <a href="https://auleezip.com/${slug}/">우리의 집</a>에서 볼 수 있어요.</p>` : ''; };

export function render(f, notes = {}, images = []) {
  if (f.terms || f.supply) return renderV2(f, notes, images);
  const x = renderFacts(f), has = new Set(images.map((i) => i.key));
  const img = (k) => (has.has(k) ? IMG(k) : '');
  return [
    img('thumb'), img('card'), (notes.intro || []).filter(Boolean).length ? `<p>${notes.intro.filter(Boolean).map(esc).join(' ')}</p>` : '',
    has.has('aerial') ? `${img('aerial')}\n<p style="font-size:13px;color:${C.muted}">단지 조감도 · 출처: ${srcOf(f, images.find((i) => i.key === 'aerial'))} · 실제와 다를 수 있습니다.</p>` : '',
    summaryBox(f), toc(HEADS.map(([id, t]) => ({ id, t }))),
    H2('한눈에', 'glance'), x.glance, x.types, plans(f, images),
    H2('분양가와 주변 실거래', 'price'), x.leasehold, note(notes.price), x.trades,
    H2('입지 — 교통·학교', 'place'), img('map'), note(notes.place), x.place, x.busRoutes,
    H2('자격·규제', 'rules'), note(notes.rules), x.rules,
    H2('대출·자금', 'loans'), note(notes.loans), x.loans,
    H2('공고문·문의', 'links'), x.links, zipLink(f),
    `<p style="font-size:13px;color:${C.muted}">기준: 청약홈(한국부동산원) 분양정보 ${f.dataUpdatedAt.slice(0, 10)} 수집 · 실거래 ${esc(f.trades.source || '')} · 이 글은 공고와 공개 자료를 정리한 것이며 청약·투자 권유가 아닙니다.</p>`,
    `<p style="font-size:13px;color:${C.muted}">※ ${DISCLAIMER}</p>`,
  ].filter(Boolean).join('\n');
}

// 자동 설명(분석 글 자동 예약용, 2026-10-23 사용자 결정): facts 값만으로 짧은 문장. 숫자는 renderFacts와 같은 형식이라 검수를 통과한다.
export function autoNotes(f) {
  if (f.terms || f.supply) return autoNotesV2(f);
  const { item: it, detail: d, types, trades: t, nearby: n } = f;
  const main = types.find((g) => g.area === f.mainArea) || types[0];
  const ph = it.phases.filter((p) => ['sp', 'p1', 'win'].includes(p.k)).map((p) => `${label(it, p.k)} ${span(p, md)}`);
  const near = coreOf(t).filter((g) => g.near).map((g) => g.near.amount);
  const sc = n.schools || {}, elem = sc.elem?.[0]?.schools?.[0];
  const st = Array.isArray(n.stations) ? n.stations[0] : null;
  const fit = LOAN.filter((l) => main.max <= l.max && (!l.area || main.area <= l.area)).map((l) => l.name);
  const notes = {
    intro: [`${where(it)}의 ${d.units.toLocaleString()}세대 ${d.kind === '국민' ? '국민주택' : '민영주택'} 단지로, 시공은 ${d.builder}입니다.`, `${ph.join(', ')}입니다.`],
    price: [
      `가장 많은 주택형은 전용 ${main.area}㎡(${main.units.toLocaleString()}세대)이고, 최고 분양가는 ${eok(main.max)}(전용면적 기준 3.3㎡당 ${man(main.perPy)})입니다.`,
      f.leasehold ? '토지임대부라 분양가에 땅값이 빠져 있어 주변 아파트 거래가와 그대로 비교할 수 없습니다.' : null,
      t.skip ? null : near.length
        ? `반경 ${(t.widened ? t.wide : t.range) / 1000}km 안 같은 ${t.tier} 등급 단지의 비슷한 면적 거래 중앙값은 ${eok(Math.min(...near))}~${eok(Math.max(...near))}입니다.`
        : `반경 ${(t.widened ? t.wide : t.range) / 1000}km 안에 같은 ${t.tier} 등급 단지의 비슷한 면적 거래가 없어 비교표가 비어 있습니다.`,
    ],
    place: n.skip ? [] : [
      st ? `가장 가까운 역은 ${st.name}으로 직선 ${dist(st.d)}입니다.` : '3km 안에 지하철·철도역이 없습니다.',
      elem ? `초등학교는 ${elem.name}(${dist(elem.d)}) ${sc.elem[0].near != null ? '인접 구역(통학구역 지정 전)' : '통학구역'}입니다.` : null,
    ],
    rules: [d.flags.length ? `청약홈 공고 정보상 ${d.flags.join('·')}입니다.` : '청약홈 공고 정보에 규제지역 표시가 없는 단지입니다.', '전매제한·실거주 의무는 공고문에 적힌 기간을 확인해야 합니다.'],
    loans: [fit.length ? `전용 ${main.area}㎡(최고 ${eok(main.max)})는 ${fit.join('·')} 가격·면적 기준 안에 듭니다.` : `전용 ${main.area}㎡(최고 ${eok(main.max)})는 정책대출 가격·면적 기준 밖입니다.`, '실제 한도는 소득과 심사로 정해집니다.'],
  };
  return Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, v.filter(Boolean)]));
}

// 한 줄 요약(2026-10-25): 검색 AI 답변이 인용하기 쉬운 첫 상자 — 주력 주택형 최고 분양가와 반경 안 같은 등급 거래 중앙값의 높낮이, 첫 접수일.
// 사실 비교만(투자 판단 문구 없음). 값은 facts 그대로라 본문 숫자와 같다.
export function summaryOf(f) {
  const { item: it, types, trades: t } = f;
  const main = types.find((g) => g.area === f.mainArea) || types[0];
  const near = coreOf(t).filter((g) => g.near).map((g) => g.near.amount);
  const rec = it.phases.filter((p) => ['sp', 'p1'].includes(p.k)).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const km = (t.widened ? t.wide : t.range) / 1000;
  let cmp;
  if (f.leasehold) cmp = '토지임대부라 땅값이 빠진 분양가여서 주변 거래가와 바로 비교하기 어려워요.';
  else if (t.skip) cmp = '주변 실거래를 불러오지 못해 시세와 비교하지 못했어요.'; // 위치를 못 찾으면 반경·등급 값이 없다(2026-10-29 「반경 NaNkm·undefined 등급」)
  else if (!near.length) cmp = `반경 ${km}km 안에 같은 ${t.tier} 등급 단지의 비슷한 면적 거래가 없어요.`;
  else {
    const lo = Math.min(...near), hi = Math.max(...near);
    const pos = main.max < lo ? '보다 낮아요' : main.max > hi ? '보다 높아요' : ' 범위 안이에요';
    cmp = `반경 ${km}km 같은 ${t.tier} 등급 단지 거래 중앙값(${lo === hi ? eok(lo) : `${eok(lo)}~${eok(hi)}`})${pos}.`;
  }
  return `전용 ${main.area}㎡ 최고 분양가는 ${eok(main.max)}이고, ${cmp}${rec ? ` 첫 접수는 ${label(it, rec.k)} ${md(rec.date)}예요.` : ''}`;
}
const summaryBox = (f, text = summaryOf(f)) => `<div style="border:1px solid ${C.line};border-left:4px solid #4a3fa0;border-radius:12px;padding:14px 18px;margin:16px 0;background:#f6f5fc"><p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#4a3fa0">한 줄 요약</p><p style="margin:0;font-weight:700">${esc(text)}</p></div>`;
// v2 한 줄 요약: 시세 비교 대신 최고 분양가 · 입주 때 자기 돈(가정 계산) · 첫 접수일(2026-10-29 시세 절 뺌)
function summaryV2(f, m) {
  const it = f.item, rec = it.phases.filter((p) => ['sp', 'p1'].includes(p.k)).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const c = m.byType.find((x) => x.area === m.main.area)?.base;
  return `전용 ${m.main.area}㎡ 최고 분양가는 ${W(m.main.price)}이고${c ? `, ${c.name} 기준으로 입주 때까지 자기 돈 ${W(c.cash)}이 필요해요(가정 계산)` : '요'}.${rec ? ` 첫 접수는 ${label(it, rec.k)} ${md(rec.date)}예요.` : ''}`;
}

// 평면도·조감도(posts/floorplan.mjs): 주택형마다 한 장 + 그림마다 출처
// origin 'home' = 사업주체 분양 홈페이지, 'notice:15' = 청약홈 입주자모집공고문 15쪽
const homeLink = (f) => (f.detail.homepage ? `<a href="${esc(f.detail.homepage)}" target="_blank" rel="noopener">사업주체 분양 홈페이지</a>` : '사업주체 분양 홈페이지');
const srcOf = (f, i) => (/^notice:/.test(i?.origin || '') ? `<a href="${esc(f.detail.url)}" target="_blank" rel="noopener">청약홈 입주자모집공고문</a> ${i.origin.slice(7)}쪽` : homeLink(f));
function plans(f, images) {
  const ps = images.filter((i) => i.key.startsWith('plan:'));
  if (!ps.length) return '';
  return [H2('주택형 평면도'), ...ps.map((i) => `${IMG(i.key)}\n<p style="font-size:13px;color:${C.muted};text-align:center">전용 ${esc(i.key.slice(5))}㎡${i.type && i.type !== i.key.slice(5) ? ` (${esc(i.type)} 타입)` : ''} · 출처: ${srcOf(f, i)}</p>`),
    `<p style="font-size:13px;color:${C.muted}">주택형마다 대표 타입 한 장(같은 면적의 다른 타입·확장 여부는 입주자모집공고에서 확인) · 정보 제공용으로 실었으며 실제와 다를 수 있고, 요청이 있으면 바로 내립니다.</p>`].join('\n');
}

// 괄호 설명((공공분양)·(본청약))은 빼되 블록 번호((AC4BL)·(S-1BL))는 남긴다 — 같은 단지 이름의 블록 두 곳이 같은 제목이 됐었다(2026-10-26 계양 카이브 유보라 AC3BL·AC4BL)
export const shortName = (name) => name.replace(/\((.*?)\)/g, (m, x) => (/^[A-Z]{0,3}-?\d+[A-Z]?\s*(BL|블록)$/i.test(x.trim()) ? ` ${x.trim()}` : '')).replace(/\s+/g, ' ').trim();

// 제목 앞 지역 꼬리표: 검색에서 많이 찾는 생활권 이름(판교·동탄·청라…)을 우선, 없으면 「시·도 시·군·구」(2026-10-26 사용자 지시: 상급지 키워드 강조).
// 사실만: 공고 주소(법정동·지구 이름)에 그 이름이 있을 때만 붙인다 — 단지 이름의 마케팅 표현(예: 트리븐「센텀」, 반여동)은 근거로 쓰지 않는다. 위에서부터 먼저 맞는 것.
const AREAS = [
  [/판교|분당구 (백현|삼평|운중|하산운)동/, '판교'], [/분당구/, '분당'], [/광교/, '광교'], [/위례/, '위례'], [/동탄/, '동탄'], [/과천시/, '과천'],
  [/송도/, '인천 송도'], [/청라/, '인천 청라'], [/검단/, '인천 검단'],
  [/고덕강일/, '서울 고덕강일'], [/평택고덕|평택시 고덕/, '평택 고덕'],
  [/용산구 한남/, '용산 한남'], [/용산구/, '용산'], [/서초구 반포/, '반포'], [/압구정/, '압구정'], [/강남구/, '강남'], [/서초구/, '서초'],
  [/송파구 (잠실|신천)/, '잠실'], [/송파구/, '송파'], [/성동구 성수/, '성수'], [/여의도/, '여의도'], [/양천구 목동/, '목동'], [/마곡/, '마곡'],
  [/운정/, '파주 운정'], [/일산/, '고양 일산'], [/미사/, '하남 미사'], [/다산/, '남양주 다산'],
  [/에코델타/, '부산 에코델타시티'], [/해운대구 (우|재송)동/, '부산 센텀시티'], [/해운대구/, '부산 해운대'],
  [/수성구 범어/, '대구 범어'], [/대구광역시 수성구/, '대구 수성'], [/세종특별자치시/, '세종'], [/광주.*첨단/, '광주 첨단'],
];
export function areaOf(it) {
  const hit = AREAS.find(([re]) => re.test(it.address || ''));
  if (hit) return hit[1];
  // 「해운대구」→「해운대」, 「화성특례시」→「화성」(한 글자가 남는 「북구」「중구」는 그대로). 행정구역 이름이 아니거나 시·도와 같으면 시·도만
  const d0 = (it.district || '').split(' ')[0];
  const d = /(특례시|시|군|구)$/.test(d0) && !/지구$/.test(d0) ? d0.replace(/(특례시|시|군|구)$/, (m) => (d0.length - m.length >= 2 ? '' : m)) : '';
  return [it.region, d !== it.region ? d : ''].filter(Boolean).join(' ');
}

export function titleOf(f) {
  if (f.titleV === 2) return `[${areaOf(f.item)}] ${shortName(f.item.name)} 분양가·청약 분석 — 필요 현금·월 상환·교통·학군`; // 2026-10-29 시세 절 뺌
  return `[${areaOf(f.item)}] ${shortName(f.item.name)} 분양가·청약 분석 — 주변 실거래·교통·학군·대출`;
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
    if (k === 'price' && (draft.facts.terms || draft.facts.supply)) continue; // v2는 시세 절이 없어 notes.price를 그리지 않는다
    let rest = line; [draft.facts.item.name].forEach((nm) => { rest = rest.split(nm).join(' '); });
    for (const m of rest.replace(/,/g, '').match(/\d+(\.\d+)?/g) || []) if (!nums.has(m)) issues.push(`notes.${k}의 숫자 "${m}"가 수집·조회 값에 없습니다: ${line}`);
  }
  const text = [draft.title, ...Object.values(draft.notes || {}).flat()].join('\n').split(draft.facts.item.name).join(' ');
  BANNED.forEach((b) => { if (text.includes(b)) issues.push(`금지 표현 "${b}"`); });
  if (!draft.html.includes(DISCLAIMER)) issues.push('면책 문구 없음');
  if (!Object.values(draft.notes || {}).flat().length) issues.push('notes가 비어 있습니다(intro·price·place·rules·loans).');
  // v2: 가정 계산을 다른 방법으로 다시 계산해 대조, 새로 자동으로 쓰는 문장에도 금지 표현 검사
  if (draft.facts.terms || draft.facts.supply) {
    issues.push(...checkMoney(draft.facts, draft.html, { pay: M, amt: W }));
    // 관리비 어림: 단지별 ㎡당 값·중간값을 다시 구하고, 주택형별 금액이 본문에 있는지
    const fn = draft.facts.fee;
    if (fn?.perM2) {
      const v = fn.rows.map((r) => r.total / r.priv).sort((a, b) => a - b), h = v.length >> 1, med = v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
      if (fn.rows.length < 2 || Math.abs(med - fn.perM2) > 0.01 || Math.abs(v[0] - fn.range[0]) > 0.01 || Math.abs(v[v.length - 1] - fn.range[1]) > 0.01) issues.push('관리비 어림: ㎡당 중간값·범위 검산이 맞지 않습니다');
      for (const g of draft.facts.types) if (!draft.html.includes(`월 약 ${B(M(feeFor(fn, g.area)))}`)) issues.push(`관리비 어림: 전용 ${g.area}㎡ 금액이 본문에 없습니다`);
    }
    const body = render(draft.facts, {}, []).replace(/<[^>]+>/g, ' ').split(draft.facts.item.name).join(' ').split('기관추천').join(' '); // 「기관추천」은 특별공급 이름
    BANNED.forEach((b) => { if (body.includes(b)) issues.push(`금지 표현 "${b}"(자동 문장)`); });
  }
  return issues;
}

// ── v2 본문(2026-10-29 사용자 지시: 첫 분석 글처럼 필요한 돈·월 지출·가구별 분석) ─────────────────────────
// 숫자는 facts(청약홈·공고문·공개 자료)와 money.mjs 계산에서만. 계산은 「가정 계산」 상자에 가정·기준일·출처와 함께.
const W = (won) => eok(Math.round(won / 10000)); // 원 → 「3억 1,240만원」(만원 반올림)
const M = (won) => `${Math.round(won / 10000).toLocaleString()}만원`; // 월 금액(만원 반올림)
const R = (won) => (won >= 1e8 ? W(won) : won % 10000 ? `${won >= 1e4 ? `${Math.floor(won / 10000).toLocaleString()}만 ` : ''}${(won % 10000).toLocaleString()}원` : man(won / 10000)); // 원 단위까지
const span2 = (a, b, f) => (f(a) === f(b) ? f(a) : `${f(a)}~${f(b)}`);
const rt = (v) => (Number.isInteger(v) ? v.toFixed(1) : String(v)); // 금리 3 → 「3.0」
const has = (v) => !!(v && (v.y || v.mo)), per = (v) => (v?.y ? `${v.y}년` : v?.mo ? `${v.mo}개월` : '없음'); // 공고문 기간(년·개월)
// 조사: 끝 글자 받침으로 을/를·이/가(괄호 설명은 빼고 앞말 기준, 숫자는 읽는 소리 기준)
const batchim = (w) => { const c = [...String(w).replace(/\s*\([^)]*\)\s*$/, '').replace(/[^가-힣0-9]+$/, '')].pop() || ''; if (/\d/.test(c)) return /[013678]/.test(c); const k = c.charCodeAt(0) - 0xac00; return k >= 0 && k <= 11171 && k % 28 !== 0; };
const eul = (w) => `${w}${batchim(w) ? '을' : '를'}`, iga = (w) => `${w}${batchim(w) ? '이' : '가'}`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const small = (s) => `<p style="font-size:13px;color:${C.muted}">${s}</p>`;
const pg = (p) => (p ? `공고문 ${p}쪽` : '공고문');
const calcBox = (title, inner) => `<div style="border:1px solid #c9c3ea;border-radius:16px;padding:16px 20px;margin:16px 0;background:#faf9ff"><p style="margin:0 0 8px;font-weight:700;color:#4a3fa0">가정 계산 · ${title}</p>${inner}</div>`;
const bankLabel = (b) => { const [y, mo] = b.month.split('-'); return `한국은행 ${y}년 ${+mo}월 예금은행 주택담보대출 평균 금리(신규취급액) 연 ${b.rate}%`; };
// 휴대폰에서 가로 스크롤 없이 읽히게: 열이 적은 표는 최소 폭 없이, 대출·소득별 줄은 세로 카드로
const tableN = (head, rows, min = 0) => `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%${min ? `;min-width:${min}px` : ''}"><thead><tr>${head.map((h) => `<th ${TH}>${h}</th>`).join('')}</tr></thead><tbody>
${rows.map((r) => `<tr>${r.map((c) => `<td ${TD}>${c}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>`;
const B = (s) => `<span style="font-weight:700">${s}</span>`;
// 강조(2026-10-29 사용자 지시): 답이 되는 숫자만 — 노랑 = 핵심 금액, 연빨강 = 제한 기간. 글 한 편에 몇 곳만
const HL = (s) => `<span style="font-weight:700;background:#fff3b0;padding:0 3px;border-radius:3px;white-space:nowrap">${s}</span>`;
const WARN = (s) => `<span style="font-weight:700;background:#fde8e8;color:#8a1c1c;padding:0 3px;border-radius:3px;white-space:nowrap">${s}</span>`;
// 문장 속 금액·기간 숫자만 굵게(따져 볼 점): 3억 9,050만원 · 51만 1,500원 · 93만원~112만원 · 10년 · 6개월 · 248세대
const AMT = '\\d[\\d,.]*억(?: [\\d,]+만)?원|\\d[\\d,]*만 [\\d,]+원|\\d[\\d,.]*(?:만원|원|년|개월|세대)';
const NUM_RE = new RegExp(`(?:${AMT})(?:~(?:${AMT}))?`, 'g');
const boldNums = (s) => s.replace(NUM_RE, (m) => B(m));
// 가정·전제·출처는 접어 둔다(2026-10-29 사용자 지시: 읽는 자리를 너무 차지함). <details>는 편집기가 지워도 글자는 그대로 남는다
const fold = (label, inner) => `<details style="margin:6px 0 0"><summary style="cursor:pointer;font-size:13px;color:${C.muted}">${label}</summary>${inner}</details>`;
const foldNote = (label, s) => fold(label, small(s));
// v1과 같이 쓰는 표의 작은 글씨 설명(renderFacts)도 v2에서만 접는다 — renderFacts 자체는 그대로라 옛 초안 모양은 안 바뀐다
const foldSmalls = (html, label) => html.replace(new RegExp(`<p style="font-size:13px;color:${C.muted}">[\\s\\S]*?</p>`, 'g'), (m) => fold(label, m));
const card = (title, sub, main, foot) => `<div style="border-top:1px solid ${C.line};padding:10px 0"><p style="margin:0">${B(title)}${sub ? ` <span style="font-size:13px;color:${C.muted}">${sub}</span>` : ''}</p><p style="margin:4px 0 0">${main}</p>${foot ? `<p style="margin:2px 0 0;font-size:13px;color:${C.muted}">${foot}</p>` : ''}</div>`;
const V2_HEADS = [['glance', '한눈에'],['money', '얼마 있어야 하고, 매달 얼마 낼까?'], ['household', '우리 집은 어느 공급으로 넣을까?'], ['types', '주택형마다 무엇이 다를까?'], ['place', '출퇴근·학교는 어떨까?'], ['rules', '언제 팔 수 있고, 꼭 살아야 할까?'], ['check', '청약 전 따져 볼 점'], ['links', '공고문·문의']];

// 한눈에 표: 분양가는 공고문 동·층별 공급금액의 최저~최고(읽은 주택형만, 최고가는 청약홈 값과 맞춘 것)
function typesV2(f) {
  const pr = f.terms?.prices?.byArea || {}, any = Object.keys(pr).length;
  return table([two('주택형', '공급면적(평균)'), '세대(일반+특별)', two('분양가', any ? `동·층별 최저~최고(${pg(f.terms.prices.pages[0])})` : '최고가 기준'), two('3.3㎡당', '최고가·전용면적 기준')],
    f.types.map((g) => { const p = pr[g.area]; return [two(`전용 ${g.area}㎡`, `${g.types > 1 ? `${g.types}개 타입 · ` : ''}공급 ${g.supply}㎡`), `${g.units.toLocaleString()}세대`, p ? two(`${W(p.min)}~${W(p.max)}`) : g.min === g.max ? two(eok(g.max)) : two(eok(g.max), `가장 낮은 타입 ${eok(g.min)}`), man(g.perPy)]; }));
}

function moneyHtml(f, m, x) {
  const t = f.terms || {}, out = [];
  if (m.pay) {
    out.push(`<p>${pg(m.pay.p)} 기준으로 분양대금은 계약금 ${m.pay.down}%${m.pay.mid ? `, 중도금 ${m.pay.mid}%` : ''}, 잔금 ${m.pay.bal}% 순서로 내요.${t.midLoan ? ` 중도금은 ${t.midLoan.pct ? `분양대금의 ${t.midLoan.pct}% 범위에서 ` : ''}${esc(t.midLoan.kind)} 조건으로 대출을 알선한다고 적혀 있어요(${pg(t.midLoan.p)}).` : ''}</p>`);
    out.push(tableN([two('주택형', '최고 분양가'), two(`계약금 ${m.pay.down}%`, '계약할 때'), ...(m.pay.mid ? [two(`중도금 ${m.pay.mid}%`, '공사 기간')] : []), two(`잔금 ${m.pay.bal}%`, '입주할 때')],
      f.types.map((g) => { const p = g.max * 10000; return [two(`전용 ${g.area}㎡`, eok(g.max)), W((p * m.pay.down) / 100), ...(m.pay.mid ? [W((p * m.pay.mid) / 100)] : []), W((p * m.pay.bal) / 100)]; })));
  } else out.push('<p>계약금·중도금·잔금 비율은 공고문에서 읽지 못했어요. 공고문의 공급금액·납부 일정 표를 확인하세요.</p>');
  const base = m.byType.find((b) => b.area === m.main.area);
  if (m.cases.length) {
    const cards = m.cases.map((c) => card(esc(c.name), esc(c.who), `월 상환 ${B(span2(c.pay[0], c.pay[1], M))} · 입주 때 자기 돈 ${B(W(c.cash))}`, `대출 ${W(c.loan)}(LTV ${c.ltv}%${c.limit ? ` · 한도 ${W(c.limit)}` : ''}) · 연 ${span2(c.rate[0], c.rate[1], rt)}% · ${c.years}년 원리금균등`)).join('');
    const rent = m.rent && base?.base ? `<p style="margin:8px 0 0">여기에 토지임대료 ${iga(`월 ${R(m.rent.won)}`)} 따로 나가서, ${esc(base.base.name)} 기준 매달 내는 돈은 원리금과 합쳐 ${HL(`월 ${span2(base.total[0], base.total[1], M)}`)}이에요.</p>` : '';
    const src = [t.balLoan ? `${pg(t.balLoan.p)} 잔금 대출 안내` : null, `정책대출은 주택도시기금·한국주택금융공사 기준(확인일 ${MONEY_CHECKED}, ${POLICY_YEARS}년 가정)`, f.bank ? bankLabel(f.bank) : null].filter(Boolean).join(' · ');
    out.push(calcBox(`전용 ${m.main.area}㎡(최고 ${W(m.main.price)})를 대출받아 산다면`, cards + rent
      + foldNote('계산 가정·출처', `가정: 최고 분양가 기준, 대출액은 한도와 분양가×LTV 중 작은 값, 금리 구간의 낮은 쪽과 높은 쪽으로 각각 계산, 입주 때 자기 돈 = 분양가 − 대출. 금리: ${src}. 실제 대출 여부·금액·금리는 소득·신용·심사로 달라지고, 중도금 대출 이자·발코니 확장비·관리비는 빠져 있어요.`)));
  }
  if (m.rent) out.push(calcBox('토지임대료를 오래 내면', tableN([two('기간'), two('토지임대료 합계', '인상이 없다고 가정')], [['1년', R(m.rent.y1)], ['10년', R(m.rent.y10)], ['20년', R(m.rent.y20)]])
    + foldNote('계산 방법', `전용 ${m.main.area}㎡ 월 ${R(m.rent.won)}(${pg(t.landRent.p)}) × 개월 수. 토지임대료는 약정 후 2년이 지나면 지역 지가상승률 등을 고려해 법령 한도 안에서 올릴 수 있어요(주택법 시행령 제81조).`)));
  if (m.conv) out.push(calcBox('토지임대료를 보증금으로 바꾸면', m.conv.map((r) => card(`전용 ${r.area}㎡`, `월 ${R(r.before)}의 ${r.ratio}%를 전환이율 ${r.rate}%로`, `보증금 ${B(R(r.deposit))}을 더 내면 토지임대료가 ${B(`월 ${R(r.after)}`)}`, r.total ? `기준 대출 원리금과 합친 월 부담 ${span2(r.total[0], r.total[1], M)}` : '')).join('')
    + foldNote('예시 출처·주의', `${pg(t.conversion.p)}의 예시(실제 전환 조건은 입주 전 따로 안내). 매달 내는 돈은 줄지만 보증금만큼 현금이 더 필요하고, 그 돈을 빌리면 이자를 따로 따져야 해요.`)));
  if (m.dsr) out.push(calcBox('소득에 따라 은행에서 빌릴 수 있는 돈(DSR)', `<p style="margin:0 0 8px">은행 주택담보대출은 1년 원리금이 소득의 ${BANK.dsr}%를 넘지 않게만 빌려줘요(DSR). 3인 이하 가구 도시근로자 월평균소득(2025년도)의 70·100·130%인 가구라면:</p>`
    + m.dsr.rows.map((r) => card(`연 소득 ${W(r.income)}`, `월 ${R(incomeAt(3, r.pct))} · 3인 이하 ${r.pct}%`, `대출 ${B(W(r.loan))} · 월 상환 ${B(M(r.pay))} · 입주 때 자기 돈 ${B(W(r.cash))}`, `DSR로 빌릴 수 있는 최대 ${W(r.max)}${r.loan < r.max ? ` — LTV ${m.dsr.ltv}%${m.dsr.cap ? `·한도 ${W(m.dsr.cap)}` : ''}에 걸려 ${W(r.loan)}` : ''}`)).join('')
    + foldNote('계산 가정·출처', `가정: 다른 대출 없음, 가구 소득 전부를 대출 심사 소득으로 봄, DSR은 금리 ${rt(m.dsr.rate)}%에 스트레스 금리 ${rt(m.dsr.stress)}%p(${m.reg ? '규제지역' : m.capital ? '수도권 하한' : '지방'})를 모두 더해 심사, 월 상환은 연 ${rt(m.dsr.rate)}% · ${m.dsr.years}년 원리금균등. 금리는 ${bankLabel(f.bank)} — 은행·상품마다 금리와 심사가 달라요(금융위원회 DSR·LTV 기준, 확인일 ${MONEY_CHECKED}).`)));
  if (f.fee?.perM2) out.push(feeHtml(f));
  out.push(`<p>취득세 등(1주택 취득, 생애최초 감면 전)은 분양가의 ${m.tax.rate}%로 계산하면 약 ${W(m.tax.won)}이에요. 발코니 확장·옵션 금액을 더하면 늘어나요(지방세법 제11조, 확인일 ${MONEY_CHECKED}).</p>`);
  out.push(`<p style="font-weight:700;margin:20px 0 8px">정책대출 가격·면적 요건</p>`, foldSmalls(x.loans, '기준·출처'));
  return out.join('\n');
}

// 관리비: 새 단지는 자료가 없어 같은 시·군·구 최근 입주 단지의 ㎡당 관리비 중간값으로 어림한다
const ymLabel = (ym) => `${ym.slice(0, 4)}년 ${+ym.slice(4)}월`;
function feeHtml(f) {
  const fn = f.fee, lo = Math.round(fn.range[0]), hi = Math.round(fn.range[1]);
  return calcBox('관리비는 얼마쯤 나올까', `<p style="margin:0 0 8px">같은 시·군·구에서 최근 10년 안에 입주한 ${fn.rows.length}곳 단지의 ${ymLabel(fn.ym)} 관리비는 전용면적 1㎡당 ${R(lo)}~${R(hi)}이었고, 중간값은 ${R(Math.round(fn.perM2))}이에요. 중간값으로 어림하면:</p>`
    + f.types.map((g) => card(`전용 ${g.area}㎡`, '', `월 약 ${B(M(feeFor(fn, g.area)))}`, `가장 낮은 곳~높은 곳 기준 월 ${span2(lo * g.area, hi * g.area, M)}`)).join('')
    + foldNote('계산 가정·출처', `국토교통부 공동주택관리정보시스템(K-apt) 공개 관리비(공용관리비 17항목 + 난방·급탕·전기·수도 등 개별사용료 10항목, 단지 전체 금액) ÷ 단지 주거전용면적 합. 비교 단지: ${fn.rows.map((r) => `${esc(r.name)}(${r.used.slice(0, 4)}년 사용승인, ${r.units.toLocaleString()}세대, 1㎡당 ${R(Math.round(r.perM2))})`).join(' · ')}. 한 달 값이라 계절(겨울 난방)에 따라 달라지고, 이 단지의 실제 관리비는 입주 뒤 정해져요. 장기수선충당금은 빠져 있어요(${fn.fetched} 조회).`));
}

function householdHtml(f) {
  const s = f.supply, t = f.terms || {}, out = [];
  if (s) {
    const tot = (get) => s.rows.reduce((a, g) => a + get(g), 0), gen = tot((g) => g.general), spc = tot((g) => g.special), all = gen + spc;
    const kinds = s.ok ? SP.filter(([k]) => tot((g) => g.sp[k]) > 0) : [];
    const top = kinds.map(([k, n]) => [n, tot((g) => g.sp[k])]).sort((a, b) => b[1] - a[1])[0];
    out.push(`<p>이번 공급 ${all.toLocaleString()}세대 중 특별공급이 ${spc.toLocaleString()}세대(${pct(spc, all)}%), 일반공급이 ${gen.toLocaleString()}세대예요.${top ? ` 특별공급에서는 ${top[0]} 몫이 ${top[1].toLocaleString()}세대로 가장 많아요.` : ''}</p>`);
    const areas = s.rows.length <= 4 ? s.rows : [];
    const line = (name, get) => [name, ...areas.map((g) => `${get(g).toLocaleString()}세대`), `<span style="font-weight:700">${tot(get).toLocaleString()}세대</span>`];
    out.push(tableN(['공급', ...areas.map((g) => `전용 ${g.area}㎡`), '합계'], [line('일반공급', (g) => g.general), ...kinds.map(([k, n]) => line(`특별공급 · ${n}`, (g) => g.sp[k]))])
      + foldNote('자료 기준', `청약홈 주택형별 공급 세대${s.ok ? ' · 특별공급은 유형별 합이 특별공급 수와 같은지 맞춰 봄' : ' · 유형별 세대 합이 특별공급 수와 달라 유형은 공고문에서 확인'}`));
  }
  const amt = (n, p, dual) => `${incomeAt(n, p).toLocaleString()}원${dual ? `<br><span style="font-size:13px;color:${C.muted}">맞벌이 ${incomeAt(n, dual).toLocaleString()}원</span>` : ''}`;
  if (f.detail.kind === '민영') {
    const pcts = t.income?.pcts;
    const rules = PRIVATE_RULES.filter((r) => (!s?.ok || s.rows.some((g) => g.sp[r.k] > 0)) && (!pcts || [r.pri, r.all, r.priDual, r.allDual].filter(Boolean).every((p) => pcts.includes(p))));
    if (rules.length) out.push(`<p>민영주택 특별공급은 가구원수별 월평균소득 기준이 있어요. 기준을 넘어도 세대 부동산가액이 ${W(PRIVATE_ASSET)} 이하면 추첨공급에 넣을 수 있어요.</p>`
      + tableN([two('특별공급', '월평균소득 기준'), '3인 이하', '4인', '5인'], rules.flatMap((r) => [[two(`${r.name} 우선공급`, `${r.pri}% 이하${r.priDual ? `(맞벌이 ${r.priDual}%)` : ''}`), ...[3, 4, 5].map((n) => amt(n, r.pri, r.priDual))], [two(`${r.name} 그 밖`, `${r.all}% 이하${r.allDual ? `(맞벌이 ${r.allDual}%)` : ''}`), ...[3, 4, 5].map((n) => amt(n, r.all, r.allDual))]]))
      + foldNote('기준·출처', `2025년도 도시근로자 가구원수별 월평균소득(2026년 적용) · 주택공급에 관한 규칙 제35조의3·제41조·제43조(확인일 ${MONEY_CHECKED})${pcts ? ` · 같은 금액이 ${pg(t.income.p)} 등에 있음` : ''} · 6인 이상·세부 요건은 공고문 확인`));
  } else if (t.income) {
    const pcts = t.income.pcts.filter((p) => [70, 100, 120, 130, 140, 150, 160, 200].includes(p));
    out.push(`<p>공공분양은 공급 유형과 단계마다 소득 기준(%)이 달라요. 이 공고문 소득 기준 표에 나오는 비율별 금액은 아래와 같고, 어느 공급에 몇 %가 적용되는지는 ${pg(t.income.p)} 표에서 확인하세요.</p>`
      + tableN([two('기준', '월평균소득의'), '3인 이하', '4인', '5인'], pcts.map((p) => [`${p}%`, ...[3, 4, 5].map((n) => amt(n, p))]))
      + foldNote('기준·출처', `2025년도 도시근로자 가구원수별 월평균소득(2026년 적용) — 금액이 공고문 표와 같은지 맞춰 봄${t.asset ? ` · 자산 기준: 총자산(부동산·자동차·금융자산 − 부채) ${W(t.asset.total)} 이하(${pg(t.asset.p)})` : ''}`));
  }
  return out.join('\n');
}

function typesCompare(f, m) {
  if (f.types.length < 2) return '';
  const t = f.terms || {}, pr = t.prices?.byArea || {}, s = f.supply;
  const rows = m.byType.map((b) => {
    const g = f.types.find((x) => x.area === b.area), sp = s?.rows.find((x) => x.area === b.area), room = t.rooms?.[b.area];
    return [two(`전용 ${b.area}㎡`, `공급 ${g.supply}㎡${room ? ` · 침실 ${room.bed}개` : ''}`), b.base ? two(`월 ${span2(b.base.pay[0], b.base.pay[1], M)}`, esc(b.base.name)) : '-', b.base ? W(b.base.cash) : '-', pr[b.area] ? `${W(pr[b.area].min)}~${W(pr[b.area].max)}` : eok(g.max), ...(m.rent ? [b.rent ? `월 ${R(b.rent)}` : '-'] : []), `${(sp ? sp.general + sp.special : g.units).toLocaleString()}세대`];
  });
  const [a, b] = [m.byType[0], m.byType[m.byType.length - 1]];
  const diff = a.base && b.base ? `<p>전용 ${a.area}㎡와 ${b.area}㎡는 최고 분양가가 ${W(b.price - a.price)} 차이 나고, 같은 대출로 계산하면 월 상환이 ${span2(b.base.pay[0] - a.base.pay[0], b.base.pay[1] - a.base.pay[1], M)}${a.rent && b.rent ? `, 토지임대료가 월 ${R(b.rent - a.rent)}` : ''} 더 들어요.</p>` : '';
  return diff + table([two('주택형', '공급면적'), two('월 상환', '최고가·기준 대출'), two('입주 때 자기 돈', '최고가 기준'), two('분양가', Object.keys(pr).length ? '동·층별 최저~최고' : '최고'), ...(m.rent ? [two('토지임대료', '월')] : []), '이번 공급'], rows)
    + (t.rooms ? foldNote('침실 수 기준', `침실 수는 공고문 평면도(${Object.entries(t.rooms).map(([ar2, v]) => `${ar2}㎡ ${v.p}쪽`).join(', ')}) 대표 타입 기준 — 같은 면적이라도 타입마다 다를 수 있어요.`) : '');
}

function rulesV2(f) {
  const t = f.terms || {}, p = t.periods, out = [];
  if (p) {
    const row = (name, v) => (v ? [name, has(v) ? WARN(per(v)) : per(v), has(v) && v.from ? `${esc(v.from)}부터` : '-'] : [name, '공고문 확인', '-']);
    out.push(tableN(['구분', '기간', '언제부터'], [row('재당첨 제한', p.rewin), row('전매 제한', p.resale), row('거주 의무', p.residence)]) + foldNote('출처', `${pg(p.p)}${p.resale?.note ? ` · 전매 제한: ${esc(p.resale.note)}` : ''} · 기간과 기준일은 공고문이 우선이에요.`));
  } else out.push('<p>재당첨·전매 제한과 거주 의무 기간은 공고문에서 읽지 못했어요. 공고문 앞쪽 단지 주요정보에서 확인하세요.</p>');
  if (f.leasehold) {
    const ls = t.lease;
    out.push(box(`<p style="margin:0 0 6px"><span style="font-weight:700">토지임대부라 팔 때도 다릅니다.</span> 건물(내 집 부분)은 분양받은 사람이, 토지는 사업주체가 가지고 토지는 임대차 계약으로 써요${ls ? `(기간 ${ls.years}년 이내, 소유자 ${ls.renewPct}% 이상이 갱신을 청구하면 ${ls.renewYears}년 범위에서 갱신 — ${pg(ls.p)})` : ''}.</p><p style="margin:0">거주 의무 기간 안에 이사하려면 사업주체에 집을 사 달라고 신청해야 하고, 그 값은 낸 입주금에 이자를 더한 금액이에요. 거주 의무가 끝나고 전매 제한 기간 안이면 입주금 + (감정평가액 − 입주금)의 70%예요(주택법 제57조의2·제78조의2, 시행령 제82조의2).</p>`));
  }
  return out.join('\n');
}

// 따져 볼 점(2026-10-29 사용자 지시: 시선이 흩어짐): 문장 대신 「항목 · 답 하나 · 짧은 설명」 줄, 강조는 줄마다 답 하나만
function checklist(f, m) {
  const t = f.terms || {}, s = f.supply, rows = [];
  const b = m.byType.find((x) => x.area === m.main.area), c = b?.base;
  if (c) rows.push(['필요한 현금', `입주 때 자기 돈 ${HL(W(c.cash))}`, `${m.pay ? `계약할 때 계약금 ${W(m.pay.downWon)} · ` : ''}${esc(c.name)} 기준 가정 계산`]);
  if (c) rows.push(['매달 내는 돈', HL(`월 ${span2(b.total[0], b.total[1], M)}`), m.rent ? `원리금 월 ${span2(c.pay[0], c.pay[1], M)} + 토지임대료 월 ${R(m.rent.won)}` : `원리금 · ${c.years}년 원리금균등`]);
  const mid = m.dsr?.rows.find((r) => r.pct === 100);
  if (mid) rows.push(['은행 대출', `최대 ${B(W(mid.loan))}`, `연 소득 ${W(mid.income)}(3인 이하 평균) · DSR·LTV 가정 · 그때 자기 돈 ${W(mid.cash)}`]);
  if (t.periods) { const p = t.periods; rows.push(['팔기·거주', `전매 제한 ${has(p.resale) ? WARN(per(p.resale)) : B('없음')} · 거주 의무 ${has(p.residence) ? WARN(per(p.residence)) : B('없음')}`, `재당첨 제한 ${per(p.rewin)}${has(p.resale) ? ' · 전매 제한 기간에는 자유롭게 팔 수 없어요' : ''}`]); }
  if (s?.ok) { const kinds = SP.map(([k, n]) => [n, s.rows.reduce((a, g) => a + g.sp[k], 0)]).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]); if (kinds.length) rows.push(['특별공급', `${kinds[0][0]} ${B(`${kinds[0][1].toLocaleString()}세대`)}로 가장 많음`, `${kinds.slice(1, 3).map(([n, v]) => `${n} ${v.toLocaleString()}세대`).join(' · ')} — 넣을 수 있는 공급과 소득 기준부터 확인`]); }
  if (f.fee?.perM2) rows.push(['관리비', `월 약 ${B(M(feeFor(f.fee, m.main.area)))}`, `전용 ${m.main.area}㎡ · 근처 최근 입주 단지 ${ymLabel(f.fee.ym)} 중간값 어림`]);
  if (m.rent) rows.push(['주의', '토지임대료 인상 가능', '약정 2년 뒤부터 법령 한도 안에서']);
  const chip = 'display:inline-block;min-width:72px;margin-right:8px;padding:1px 8px;border-radius:999px;background:#eef0f6;color:#3a3f4b;font-size:12px;font-weight:700;text-align:center;vertical-align:1px';
  return rows.map(([tag, main, sub]) => `<div style="border-top:1px solid ${C.line};padding:10px 0"><p style="margin:0"><span style="${chip}">${tag}</span>${main}</p>${sub ? `<p style="margin:3px 0 0;font-size:13px;color:${C.muted}">${sub}</p>` : ''}</div>`).join('\n');
}

// 한 줄 요약 아래 「핵심 숫자」 띠: 입주 때 자기 돈 · 매달 내는 돈 · 전매 제한(가정 계산은 기준 대출 하나로)
function keyBand(f, m) {
  const b = m.byType.find((x) => x.area === m.main.area), c = b?.base, p = f.terms?.periods, items = [];
  if (c) items.push(`입주 때 자기 돈 ${HL(W(c.cash))}`, `매달 ${HL(`${span2(b.total[0], b.total[1], M)}`)}${m.rent ? '(토지임대료 포함)' : ''}`);
  if (p?.resale) items.push(`전매 제한 ${has(p.resale) ? WARN(per(p.resale)) : B('없음')}`);
  if (!items.length) return '';
  return `<div style="border:1px solid #f0dc8c;border-radius:12px;padding:12px 16px;margin:12px 0;background:#fffbea"><p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#6b5000">핵심 숫자 · 전용 ${m.main.area}㎡ 최고가 기준</p><p style="margin:0;line-height:2">${items.join(' · ')}</p>${c ? `<p style="margin:4px 0 0;font-size:13px;color:${C.muted}">가정 계산 — ${esc(c.name)} 기준, 자세한 가정은 아래 「얼마 있어야 하고, 매달 얼마 낼까?」</p>` : ''}</div>`;
}

function renderV2(f, notes = {}, images = []) {
  const x = renderFacts(f), m = moneyOf(f), has = new Set(images.map((i) => i.key)), t = f.terms || {};
  const img = (k) => (has.has(k) ? IMG(k) : '');
  const heads = V2_HEADS.filter(([id]) => id !== 'types' || f.types.length > 1);
  const H = (id) => H2(V2_HEADS.find(([k]) => k === id)[1], id);
  const question = f.leasehold ? '분양가는 낮아 보여도 대출 원리금에 토지임대료까지 더하면 매달 얼마일까요?' : `전용 ${m.main.area}㎡를 분양받으려면 현금은 얼마나 있어야 하고, 대출을 받으면 매달 얼마를 갚아야 할까요?`;
  return [
    img('thumb'), img('card'), (notes.intro || []).filter(Boolean).length ? `<p>${notes.intro.filter(Boolean).map(esc).join(' ')}</p>` : '',
    `<p style="font-weight:700">${esc(question)} 공고문 조건과 공개 자료로 계산해 봤어요.</p>`,
    has.has('aerial') ? `${img('aerial')}\n<p style="font-size:13px;color:${C.muted}">단지 조감도 · 출처: ${srcOf(f, images.find((i) => i.key === 'aerial'))} · 실제와 다를 수 있습니다.</p>` : '',
    summaryBox(f, summaryV2(f, m)), keyBand(f, m), toc(heads.map(([id, t2]) => ({ id, t: t2 }))),
    H('glance'), x.glance, typesV2(f), x.leasehold, plans(f, images), zipLink(f),
    // 「분양가, 주변 시세와 견주면?」 절은 뺐다(2026-10-29 사용자 결정: 반경 안 실거래 비교는 의미가 약하고, 시세 분석은 우리의 집이 맡음)
    H('money'), note(notes.loans), moneyHtml(f, m, x),
    H('household'), householdHtml(f),
    ...(f.types.length > 1 ? [H('types'), typesCompare(f, m)] : []),
    H('place'), img('map'), note(notes.place), foldSmalls(x.place, '자료 기준'), foldSmalls(x.busRoutes, '추정 방법'),
    H('rules'), note(notes.rules), rulesV2(f), t.periods ? x.rulesTable : x.rules,
    H('check'), checklist(f, m),
    H('links'), x.links,
    foldNote('출처·기준일', `기준: 청약홈(한국부동산원) 분양정보 ${f.dataUpdatedAt.slice(0, 10)} 수집 · 입주자모집공고문(청약홈 PDF${t.fetched ? `, ${t.fetched} 읽음` : ''}) · 대출·세금·소득 기준 확인일 ${MONEY_CHECKED}(주택도시기금·한국주택금융공사·금융위원회·지방세법·주택공급에 관한 규칙)${f.bank ? ` · ${bankLabel(f.bank)}` : ''}${f.fee?.perM2 ? ` · 관리비: K-apt ${ymLabel(f.fee.ym)} 공개값(${f.fee.fetched} 조회)` : ''}`),
    `<p style="font-size:13px;color:${C.muted}">이 글은 공고와 공개 자료를 정리한 것이며 청약·투자 권유가 아닙니다.</p>`,
    `<p style="font-size:13px;color:${C.muted}">※ ${DISCLAIMER}</p>`,
  ].filter(Boolean).join('\n');
}

// v2 자동 설명: v1 문장에 규제 기간·가정 계산 한 줄을 바꿔 넣는다(숫자는 본문 표와 같은 형식)
function autoNotesV2(f) {
  const v1 = autoNotes({ ...f, terms: undefined, supply: undefined }), m = moneyOf(f), p = f.terms?.periods;
  const c = m.byType.find((b) => b.area === m.main.area)?.base;
  return {
    ...v1,
    price: [], // 시세 절 없음
    rules: p ? [`공고문 기준 ${[['재당첨 제한', p.rewin], ['전매 제한', p.resale], ['거주 의무', p.residence]].map(([n, v]) => `${n} ${per(v)}`).join(', ')}이에요.`] : v1.rules,
    loans: c ? [`전용 ${m.main.area}㎡ 최고가에 ${eul(c.name)} 받는다고 가정하면 대출 ${W(c.loan)}, 입주 때 자기 돈 ${W(c.cash)}, 월 상환 ${span2(c.pay[0], c.pay[1], M)}이에요.`, '실제 한도는 소득과 심사로 정해집니다.'] : v1.loans,
  };
}

// 검색용 썸네일(첫 그림 = 대표 이미지): 단지 이름 두 줄 + 3.3㎡당 분양가(없으면 첫 접수일) + 지역·접수일
export function thumbOf(f) {
  const it = f.item, name = shortName(it.name), w = name.split(' ');
  let cut = 1, best = Infinity; // 두 줄 길이가 비슷하게 띄어쓰기에서 나눈다
  for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length); if (d < best) { best = d; cut = i; } }
  const lines = w.length > 1 ? `${w.slice(0, cut).join(' ')}\n${w.slice(cut).join(' ')}` : name;
  const rec = it.phases.filter((p) => ['sp', 'p1'].includes(p.k)).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const price = it.pricePerPyeong ? ['분양가 3.3㎡당(공급면적)', man(it.pricePerPyeong)] : rec ? [label(it, rec.k), md(rec.date)] : [];
  return searchThumbHtml({ category: '분양분석', lines, label: price[0], value: price[1], foot: `${where(it)}${rec ? ` · ${label(it, rec.k)} ${md(rec.date)}` : ''}` });
}

export async function images(f, out) {
  await mkdir(out, { recursive: true });
  const it = f.item, rec = it.phases.find((p) => ['sp', 'p1', 'p2'].includes(p.k)) || it.phases[0];
  const mon = new Date(rec.date + 'T00:00:00Z'); mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7));
  const start = mon.toISOString().slice(0, 10), end = new Date(mon.getTime() + 6 * 864e5).toISOString().slice(0, 10);
  const pages = [{ name: 'thumb', html: thumbOf(f) }, { name: 'card', html: itemHtml(it, { start, end, badge: '접수 주' }) }];
  const m = await mapHtml(it, await keyOf());
  if (!m.skip) pages.push({ name: 'map', html: m.html });
  const files = await renderPngs(pages, out);
  const extra = await plansFor(f, out).catch((e) => { console.log(`- 평면도 없음(${e.message})`); return []; });
  return [...files.map((file, i) => ({ key: pages[i].name, file: file.replace(/\\/g, '/'), alt: { thumb: `${it.name} 분양가·청약 분석 대표 이미지`, card: `${it.name} 청약 일정 카드` }[pages[i].name] || `${it.name} 위치 지도(반경 500m·1km)` })), ...extra];
}

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const rp = arg('--render'), ep = arg('--enrich'), fp = arg('--add-fee');
  if (fp) { // 공개 글: 관리비만 더함(2026-10-29) — 다른 자료(은행 금리 등)와 설명은 그대로라 본문의 다른 숫자가 바뀌지 않는다
    const d = JSON.parse(await readFile(fp, 'utf8'));
    await addFee(d.facts);
    await writeFile(fp, JSON.stringify(draftOf(d.facts, d.notes, d.images), null, 2));
    const issues = checkAnalysis(JSON.parse(await readFile(fp, 'utf8')));
    console.log(`${fp} · 관리비 ${d.facts.fee.skip || `${d.facts.fee.ym} ${Math.round(d.facts.fee.perM2)}원/㎡`}\n${issues.length ? issues.map((i) => '✗ ' + i).join('\n') : `검수 통과 — ${d.title}`}`);
    process.exitCode = issues.length ? 4 : d.facts.fee.skip ? 9 : 0;
    return;
  }
  if (ep) { // 있는 초안에 v2 자료를 더해 다시 그림(notes는 그대로, --auto면 자동 설명을 새로, --auto-if-unedited면 손댄 적 없는 자동 설명일 때만 새로) → --out 파일(없으면 같은 파일)
    const d = JSON.parse(await readFile(ep, 'utf8'));
    const unedited = JSON.stringify(d.notes) === JSON.stringify(autoNotes(d.facts)); // 옛 facts로 만든 자동 설명과 같으면 사람이 고치지 않은 것
    const f = await enrich(d.facts), out = arg('--out') || ep;
    const auto = process.argv.includes('--auto') || (process.argv.includes('--auto-if-unedited') && unedited);
    await writeFile(out, JSON.stringify(draftOf(f, auto ? autoNotes(f) : d.notes, d.images), null, 2));
    if (process.argv.includes('--auto-if-unedited')) console.log(auto ? '설명: 자동 설명을 새로 씀' : '설명: 손으로 고친 설명이라 그대로 둠');
    const issues = checkAnalysis(JSON.parse(await readFile(out, 'utf8')));
    console.log(`${out}\n${issues.length ? issues.map((i) => '✗ ' + i).join('\n') : `검수 통과 — ${d.title}`}`);
    process.exitCode = issues.length ? 4 : 0;
    return;
  }
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
  const f = await collect(no, arg('--data') || undefined, { v2: !process.argv.includes('--v1') }); // 기본 v2(새 절), --v1이면 옛 모양
  const out = arg('--out') || `drafts/analysis_${no}.json`;
  const imgs = await images(f, out.replace(/\.json$/, '') + '.img'); // --out이면 그림도 그 이름 폴더에(기존 초안 그림을 덮지 않게)
  await writeFile(out, JSON.stringify(draftOf(f, process.argv.includes('--auto') ? autoNotes(f) : {}, imgs), null, 2)); // --auto: 자동 설명(분석 글 자동 예약)
  console.log(`${out} — ${titleOf(f)}\n등급 ${f.tier} · 같은 급 비교 ${f.trades.same?.length ?? 0}곳 · 그림 ${imgs.length}장${f.terms ? ` · 공고문 조건 ${Object.keys(f.terms).filter((k) => f.terms[k] && !['src', 'fetched', 'pages'].includes(k)).join('·') || '없음'}` : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

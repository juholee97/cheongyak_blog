// 주변 아파트 매매 실거래(국토교통부 실거래가 상세 API) — 분양분석 글의 "분양가와 주변 실거래가" 표
// node posts/trades.mjs "서울특별시 강동구 강일동 174" 49   → 반경 1.5km 단지별 최근 12개월 거래 요약(전용 3.3㎡당 중앙값)
// 키: .env의 DATA_GO_KR_KEY(로그·파일에 남기지 않는다). 브이월드 응답은 법정동코드·거리 계산에만 쓰고 저장하지 않는다.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { keyOf, cleanAddress, addressVariants } from './map.mjs';
import { meters } from './nearby.mjs';
import { ROOT } from '../tistory/common.mjs';
import { useApi } from '../zip/guard.mjs';

const RTMS = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';
export const PY = 3.3058; // ㎡ → 평

// 브랜드 등급(posts/brands.json): 단지명·시공사·시행사에 든 낱말로 하이엔드 / 1군 / 공공 / 중견 / 기타. 비교는 같은 등급끼리
const BRANDS = JSON.parse(await readFile(new URL('./brands.json', import.meta.url), 'utf8')).tiers;
export function tierOf(...names) {
  const text = names.filter(Boolean).join(' ');
  for (const t of BRANDS) if (t.keywords.some((k) => text.includes(k))) return t.id;
  return '기타';
}

export async function dataKey() {
  let k = process.env.DATA_GO_KR_KEY || (await readFile(join(ROOT, '.env'), 'utf8').catch(() => '')).match(/^DATA_GO_KR_KEY=(.+)$/m)?.[1]?.trim();
  if (k && /%[0-9a-f]{2}/i.test(k)) k = decodeURIComponent(k);
  return k || null;
}

// 브이월드가 연속 호출 중 연결을 끊을 때가 있어(UND_ERR_SOCKET) 잠깐 쉬고 3번까지 다시
async function getJson(u) {
  for (let i = 0; i < 3; i++) {
    try { return await (await fetch(u)).json(); } catch { await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
  }
  return null;
}

// 주소 → 좌표 + 법정동코드 앞 5자리(실거래 API의 LAWD_CD). 한 번 실행 안에서는 같은 주소를 다시 묻지 않는다
// 주소 → 좌표는 디스크에 저장해 다음 실행에서도 다시 묻지 않는다(브이월드 일일 사용량 한도 — 2026-10-28 한도를 넘겨 비교 자료를 못 만든 일). 찾은 것만 저장한다
const GEO_FILE = join(ROOT, 'data/geo_cache.json');
let GEO = null, geoDirty = 0;
async function geo() { return (GEO ??= JSON.parse(await readFile(GEO_FILE, 'utf8').catch(() => '{}'))); }
const PLACES = new Map();
export function locate(address, vkey) {
  if (!PLACES.has(address)) PLACES.set(address, (async () => {
    const g = await geo();
    if (g[address]) return g[address];
    const r = await locateOnce(address, vkey);
    if (r) { g[address] = r; if (++geoDirty % 20 === 0) await writeFile(GEO_FILE, JSON.stringify(g)).catch(() => {}); }
    return r;
  })());
  return PLACES.get(address);
}
// 실행이 끝나기 전에 남은 것도 저장
process.on('beforeExit', () => { if (GEO && geoDirty) { geoDirty = 0; writeFile(GEO_FILE, JSON.stringify(GEO)).catch(() => {}); } });
async function locateOnce(address, vkey) {
  for (const a of addressVariants(cleanAddress(address))) {
    for (const type of ['PARCEL', 'ROAD']) {
      const u = `https://api.vworld.kr/req/address?service=address&request=getCoord&version=2.0&crs=EPSG:4326&format=json&type=${type}&refine=true&simple=false&key=${vkey}&address=${encodeURIComponent(a)}`;
      useApi('vworld'); // 호출 한도 가드(zip/guard.mjs)
      const j = await getJson(u);
      // 일일 사용량 한도를 넘으면 나머지 주소·종류를 계속 두드려 봐야 전부 실패다 — 바로 알리고 멈춘다(실행 쪽이 이 오류를 보고 멈춘다)
      if (/사용량|일일 제한/.test(j?.response?.error?.text || '')) throw new Error('VWORLD_QUOTA: 브이월드 일일 사용량 한도 초과');
      const p = j?.response?.result?.point, code = j?.response?.refined?.structure?.level4LC;
      if (j?.response?.status === 'OK' && p) return { lon: +p.x, lat: +p.y, lawd: code ? code.slice(0, 5) : null };
    }
  }
  return null;
}

const tag = (xml, t) => (xml.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1]?.trim() ?? '';
export function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, x]) => ({
    apt: tag(x, 'aptNm') || tag(x, 'offiNm'), seq: tag(x, 'aptSeq') || `${tag(x, 'umdNm')} ${tag(x, 'jibun')} ${tag(x, 'aptNm') || tag(x, 'offiNm')}`, umd: tag(x, 'umdNm'), jibun: tag(x, 'jibun'), built: +tag(x, 'buildYear') || null,
    ar: +tag(x, 'excluUseAr'), amount: +tag(x, 'dealAmount').replace(/,/g, ''), floor: +tag(x, 'floor'),
    ym: `${tag(x, 'dealYear')}-${tag(x, 'dealMonth').padStart(2, '0')}`, cancelled: tag(x, 'cdealType') !== '', direct: tag(x, 'dealingGbn') === '직거래', leasehold: tag(x, 'landLeaseholdGbn') === 'Y',
  }));
}

// 실거래 종류: apt 아파트 매매(기본), silv 아파트 분양권·입주권 전매, offi 오피스텔 매매 — 같은 키, 같은 요청 형식(2026-10-28 활용신청)
const RTMS_OF = { apt: RTMS, silv: 'https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade', offi: 'https://apis.data.go.kr/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade' };
// 한 번 실행 안에서 같은 시군구·달은 한 번만 부른다(zip/deals.mjs가 공고 여러 곳을 돌 때)
const MONTHS = new Map();
function month(lawd, ym, key, kind = 'apt') {
  const k = kind + lawd + ym;
  if (!MONTHS.has(k)) MONTHS.set(k, fetchMonth(lawd, ym, key, kind).catch((e) => { MONTHS.delete(k); throw e; }));
  return MONTHS.get(k);
}
async function fetchMonth(lawd, ym, key, kind) {
  // 지난 달 거래는 거의 안 바뀌니 파일에 저장해 다시 받지 않는다(공공데이터포털 일일 호출 한도). 이번 달은 하루 안만 재사용
  const f = join(ROOT, 'data/rtms_cache', `${kind}_${lawd}_${ym}.json`), nowYm = new Date().toISOString().slice(0, 7).replace('-', ''), today = new Date().toISOString().slice(0, 10);
  const hit = JSON.parse(await readFile(f, 'utf8').catch(() => 'null'));
  if (hit && (ym < nowYm || hit.at === today)) return hit.items;
  const out = await fetchMonthRaw(lawd, ym, key, kind);
  await (await import('node:fs/promises')).mkdir(join(ROOT, 'data/rtms_cache'), { recursive: true });
  await writeFile(f, JSON.stringify({ at: today, items: out })).catch(() => {});
  return out;
}
async function fetchMonthRaw(lawd, ym, key, kind) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    useApi('datago'); // 호출 한도 가드(zip/guard.mjs)
    const u = `${RTMS_OF[kind]}?serviceKey=${encodeURIComponent(key)}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&pageNo=${page}&numOfRows=1000`;
    const r = await fetch(u);
    const xml = await r.text();
    if (!r.ok || !/<resultCode>0*0<\/resultCode>/.test(xml)) throw new Error(`실거래 API ${ym} 응답 이상(HTTP ${r.status})`); // URL은 키가 들어 있어 찍지 않는다
    const items = parseItems(xml);
    out.push(...items);
    if (items.length < 1000) break;
  }
  return out;
}

// 한 번에 n개씩 돌리기(브이월드 위치 찾기가 단지마다 1초 가까이 걸려 수백 곳이면 몇 분)
async function each(xs, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) await fn(xs[i++]); })); }

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
export const perPy = (amount, ar) => Math.round(amount / (ar / PY)); // 만원 / 전용 3.3㎡

// 단지별 요약: 해제 거래 빼고, 전용 3.3㎡당 중앙값, 비교 면적(area±15㎡) 거래의 중앙값
export function summarize(items, area) {
  const by = new Map();
  for (const t of items) {
    if (t.cancelled || t.direct || !t.amount || !t.ar) continue; // 해제·직거래(가족 간 등 시세와 다를 수 있음) 제외
    if (!by.has(t.seq)) by.set(t.seq, { apt: t.apt, umd: t.umd, jibun: t.jibun, built: t.built, leasehold: false, all: [], near: [] });
    const g = by.get(t.seq);
    g.leasehold ||= t.leasehold;
    g.all.push(t);
    if (Math.abs(t.ar - area) <= 15) g.near.push(t);
  }
  return [...by.values()].map((g) => ({
    apt: g.apt, umd: g.umd, jibun: g.jibun, built: g.built, leasehold: g.leasehold, tier: tierOf(g.apt), count: g.all.length,
    perPy: median(g.all.map((t) => perPy(t.amount, t.ar))),
    near: g.near.length ? { count: g.near.length, ar: Math.round(median(g.near.map((t) => t.ar)) * 100) / 100, amount: median(g.near.map((t) => t.amount)), last: g.near.map((t) => t.ym).sort().at(-1) } : null,
  }));
}

// 공고 위치(site)에서 한 단지(g.loc 주소)까지 직선거리(m). 못 찾으면 null — 최종 비교 단지에만 쓴다
export async function distanceOf(site, loc) {
  const vkey = await keyOf();
  const p = site && loc && vkey ? await locate(loc, vkey) : null;
  return p ? meters(site.lon, site.lat, p.lon, p.lat) : null;
}

// 공고 주소는 「○○지구 A1블록」「(○○동 400-7번지 일원)」처럼 덧붙은 말이 많다 — 그대로 못 찾으면 줄여 가며 찾는다(마지막은 동 단위)
export function siteVariants(address) {
  const a = String(address).replace(/\s+/g, ' ').trim();
  const head = a.match(/^\S+ \S+(?: \S+구)?/)?.[0] || '';
  const out = [a];
  for (const [, x0] of a.matchAll(/\(([^)]*)\)/g)) {
    const x = x0.trim();
    if (/^\S+(도|시) /.test(x)) out.push(x.replace(/번지.*$/, '').replace(/\s*일원.*$/, '').trim());
    else if (/(동|읍|면)$/.test(x)) out.push(`${head} ${x}`);
  }
  out.push(a.replace(/\(.*?\)/g, ' ').replace(/번지.*$/, '').replace(/\s*일원.*$/, '').split(',')[0].replace(/\s+/g, ' ').trim());
  const dong = a.match(/^\S+ \S+(?: \S+구)? \S+(동|읍|면|가)(?= |$|,)/)?.[0];
  if (dong) out.push(dong);
  return [...new Set(out.filter(Boolean))];
}

export async function nearbyTrades(address, area, { tier = null, months = 12, range = 1500, wide = 3000, now = new Date(), geo: withGeo = true } = {}) {
  const key = await dataKey(), vkey = await keyOf();
  if (!key || !vkey) return { skip: 'DATA_GO_KR_KEY 또는 VWORLD_KEY 없음' };
  let site = null;
  for (const v of siteVariants(address)) if ((site = await locate(v, vkey))?.lawd) break;
  if (!site?.lawd) return { skip: `위치·법정동코드 못 찾음: ${address}` };
  const yms = Array.from({ length: months }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const items = [];
  for (const ym of yms) items.push(...(await month(site.lawd, ym, key)));
  const groups = summarize(items, area);
  // 단지 위치: 같은 시군구 + 법정동 + 지번으로 좌표를 찾아 직선거리(좌표는 저장하지 않고 거리만)
  const sgg = cleanAddress(address).split(' ').slice(0, 2).join(' ');
  // geo:false(zip/deals.mjs): 후보 단지의 거리는 구하지 않는다 — 거리는 최종 비교 단지에만 distanceOf로(브이월드 호출을 수백 번에서 몇 번으로)
  for (const g of groups) g.loc = `${sgg} ${g.umd} ${g.jibun}`;
  if (withGeo) await each(groups, 8, async (g) => {
    const p = g.jibun ? await locate(g.loc, vkey) : null;
    g.d = p ? meters(site.lon, site.lat, p.lon, p.lat) : null;
  });
  const near = (r) => groups.filter((g) => g.d != null && g.d <= r).sort((a, b) => a.d - b.d);
  const inRange = near(range);
  // 같은 등급이 1.5km 안에 2곳보다 적으면 3km까지 넓힌다(넓혔다고 글에 쓴다)
  let same = tier ? inRange.filter((g) => g.tier === tier) : inRange, widened = false;
  if (tier && same.length < 2) { same = near(wide).filter((g) => g.tier === tier); widened = true; }
  return {
    lawd: site.lawd, months: `${yms.at(-1).slice(0, 4)}.${yms.at(-1).slice(4)}~${yms[0].slice(0, 4)}.${yms[0].slice(4)}`, area, range, wide, tier, widened, total: items.length,
    site: { lon: site.lon, lat: site.lat }, // 옆 시군구 풀(poolIn) 거리 계산용 — 호출한 쪽은 파일에 남기지 않는다
    same, all: withGeo ? groups.filter((g) => g.d != null).sort((a, b) => a.d - b.d) : [...groups].sort((a, b) => b.count - a.count), others: tier ? inRange.filter((g) => g.tier !== tier) : [], source: '국토교통부 아파트 매매 실거래가(공공데이터포털)',
  };
}

// 생활권이 이어지는 옆 시군구의 거래 단지: address(그 시군구의 아무 동 주소)로 법정동코드를 찾고, site(공고 위치)에서의 거리를 붙인다
export async function poolIn(address, site, area, { months = 12, now = new Date(), kind = 'apt', geo: withGeo = true } = {}) {
  const key = await dataKey(), vkey = await keyOf();
  let at = null;
  if (key && vkey) for (const v of siteVariants(address)) if ((at = await locate(v, vkey))?.lawd) break;
  if (!at?.lawd) return [];
  const yms = Array.from({ length: months }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const items = [];
  for (const ym of yms) items.push(...(await month(at.lawd, ym, key, kind)));
  const groups = summarize(items, area).filter((g) => g.count >= 2), sgg = cleanAddress(address).split(' ').slice(0, 2).join(' '); // 1건뿐인 단지는 후보에서 어차피 빠지니 위치도 안 찾는다
  if (kind !== 'apt') for (const g of groups) g.kind = kind;
  for (const g of groups) { g.sgg = sgg; g.loc = `${sgg} ${g.umd} ${g.jibun}`; }
  if (!withGeo) return groups.sort((a, b) => b.count - a.count);
  await each(groups, 8, async (g) => {
    const p = g.jibun ? await locate(g.loc, vkey) : null;
    g.d = p ? meters(site.lon, site.lat, p.lon, p.lat) : null;
  });
  return groups.filter((g) => g.d != null).sort((a, b) => a.d - b.d);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await nearbyTrades(process.argv[2], +process.argv[3] || 59, { tier: process.argv[4] || null });
  if (r.skip) { console.log(r.skip); process.exit(3); }
  const line = (g) => `${g.d}m [${g.tier}] ${g.apt}${g.leasehold ? '(토지임대부)' : ''} (${g.umd} ${g.jibun}, ${g.built}년) ${g.count}건 · 3.3㎡당 ${g.perPy?.toLocaleString()}만 · ${g.near ? `전용${g.near.ar} ${g.near.amount.toLocaleString()}만(${g.near.count}건, 최근 ${g.near.last})` : '비교 면적 거래 없음'}`;
  console.log(`법정동 ${r.lawd} · ${r.months} · 거래 ${r.total}건 · 비교 면적 전용 ${r.area}±15㎡ · 기준 등급 ${r.tier || '전체'}${r.widened ? ` (1.5km에 부족해 ${r.wide}m까지)` : ''}`);
  console.log('같은 등급:'); r.same.forEach((g) => console.log('  ' + line(g)));
  console.log('그 밖(1.5km):'); r.others.forEach((g) => console.log('  ' + line(g)));
}

// 주변 아파트 매매 실거래(국토교통부 실거래가 상세 API) — 분양분석 글의 "분양가와 주변 실거래가" 표
// node posts/trades.mjs "서울특별시 강동구 강일동 174" 49   → 반경 1.5km 단지별 최근 12개월 거래 요약(전용 3.3㎡당 중앙값)
// 키: .env의 DATA_GO_KR_KEY(로그·파일에 남기지 않는다). 브이월드 응답은 법정동코드·거리 계산에만 쓰고 저장하지 않는다.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { keyOf, cleanAddress, addressVariants } from './map.mjs';
import { meters } from './nearby.mjs';
import { ROOT } from '../tistory/common.mjs';

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

// 주소 → 좌표 + 법정동코드 앞 5자리(실거래 API의 LAWD_CD)
export async function locate(address, vkey) {
  for (const a of addressVariants(cleanAddress(address))) {
    for (const type of ['PARCEL', 'ROAD']) {
      const u = `https://api.vworld.kr/req/address?service=address&request=getCoord&version=2.0&crs=EPSG:4326&format=json&type=${type}&refine=true&simple=false&key=${vkey}&address=${encodeURIComponent(a)}`;
      const j = await getJson(u);
      const p = j?.response?.result?.point, code = j?.response?.refined?.structure?.level4LC;
      if (j?.response?.status === 'OK' && p) return { lon: +p.x, lat: +p.y, lawd: code ? code.slice(0, 5) : null };
    }
  }
  return null;
}

const tag = (xml, t) => (xml.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1]?.trim() ?? '';
export function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, x]) => ({
    apt: tag(x, 'aptNm'), seq: tag(x, 'aptSeq'), umd: tag(x, 'umdNm'), jibun: tag(x, 'jibun'), built: +tag(x, 'buildYear') || null,
    ar: +tag(x, 'excluUseAr'), amount: +tag(x, 'dealAmount').replace(/,/g, ''), floor: +tag(x, 'floor'),
    ym: `${tag(x, 'dealYear')}-${tag(x, 'dealMonth').padStart(2, '0')}`, cancelled: tag(x, 'cdealType') !== '', direct: tag(x, 'dealingGbn') === '직거래', leasehold: tag(x, 'landLeaseholdGbn') === 'Y',
  }));
}

// 한 번 실행 안에서 같은 시군구·달은 한 번만 부른다(zip/deals.mjs가 공고 여러 곳을 돌 때)
const MONTHS = new Map();
function month(lawd, ym, key) {
  const k = lawd + ym;
  if (!MONTHS.has(k)) MONTHS.set(k, fetchMonth(lawd, ym, key).catch((e) => { MONTHS.delete(k); throw e; }));
  return MONTHS.get(k);
}
async function fetchMonth(lawd, ym, key) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const u = `${RTMS}?serviceKey=${encodeURIComponent(key)}&LAWD_CD=${lawd}&DEAL_YMD=${ym}&pageNo=${page}&numOfRows=1000`;
    const r = await fetch(u);
    const xml = await r.text();
    if (!r.ok || !/<resultCode>0*0<\/resultCode>/.test(xml)) throw new Error(`실거래 API ${ym} 응답 이상(HTTP ${r.status})`); // URL은 키가 들어 있어 찍지 않는다
    const items = parseItems(xml);
    out.push(...items);
    if (items.length < 1000) break;
  }
  return out;
}

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

export async function nearbyTrades(address, area, { tier = null, months = 12, range = 1500, wide = 3000, now = new Date() } = {}) {
  const key = await dataKey(), vkey = await keyOf();
  if (!key || !vkey) return { skip: 'DATA_GO_KR_KEY 또는 VWORLD_KEY 없음' };
  const site = await locate(address, vkey);
  if (!site?.lawd) return { skip: `위치·법정동코드 못 찾음: ${address}` };
  const yms = Array.from({ length: months }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const items = [];
  for (const ym of yms) items.push(...(await month(site.lawd, ym, key)));
  const groups = summarize(items, area);
  // 단지 위치: 같은 시군구 + 법정동 + 지번으로 좌표를 찾아 직선거리(좌표는 저장하지 않고 거리만)
  const sgg = cleanAddress(address).split(' ').slice(0, 2).join(' ');
  for (const g of groups) {
    const p = g.jibun ? await locate(`${sgg} ${g.umd} ${g.jibun}`, vkey) : null;
    g.d = p ? meters(site.lon, site.lat, p.lon, p.lat) : null;
  }
  const near = (r) => groups.filter((g) => g.d != null && g.d <= r).sort((a, b) => a.d - b.d);
  const inRange = near(range);
  // 같은 등급이 1.5km 안에 2곳보다 적으면 3km까지 넓힌다(넓혔다고 글에 쓴다)
  let same = tier ? inRange.filter((g) => g.tier === tier) : inRange, widened = false;
  if (tier && same.length < 2) { same = near(wide).filter((g) => g.tier === tier); widened = true; }
  return {
    lawd: site.lawd, months: `${yms.at(-1).slice(0, 4)}.${yms.at(-1).slice(4)}~${yms[0].slice(0, 4)}.${yms[0].slice(4)}`, area, range, wide, tier, widened, total: items.length,
    same, others: tier ? inRange.filter((g) => g.tier !== tier) : [], source: '국토교통부 아파트 매매 실거래가(공공데이터포털)',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await nearbyTrades(process.argv[2], +process.argv[3] || 59, { tier: process.argv[4] || null });
  if (r.skip) { console.log(r.skip); process.exit(3); }
  const line = (g) => `${g.d}m [${g.tier}] ${g.apt}${g.leasehold ? '(토지임대부)' : ''} (${g.umd} ${g.jibun}, ${g.built}년) ${g.count}건 · 3.3㎡당 ${g.perPy?.toLocaleString()}만 · ${g.near ? `전용${g.near.ar} ${g.near.amount.toLocaleString()}만(${g.near.count}건, 최근 ${g.near.last})` : '비교 면적 거래 없음'}`;
  console.log(`법정동 ${r.lawd} · ${r.months} · 거래 ${r.total}건 · 비교 면적 전용 ${r.area}±15㎡ · 기준 등급 ${r.tier || '전체'}${r.widened ? ` (1.5km에 부족해 ${r.wide}m까지)` : ''}`);
  console.log('같은 등급:'); r.same.forEach((g) => console.log('  ' + line(g)));
  console.log('그 밖(1.5km):'); r.others.forEach((g) => console.log('  ' + line(g)));
}

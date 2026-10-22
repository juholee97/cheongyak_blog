// 단지 주변 학교·철도역 (분양분석 글용). 직선거리만 쓰고 도보 시간은 추정하지 않는다.
// node posts/nearby.mjs "서울특별시 강동구 강일동 174"   → 초·중·고 가까운 순 3곳씩, 1.5km 안 철도역
// 학교: 브이월드 검색 API(장소, 분류가 "교육부 > 초/중/고등학교"인 것). 역: posts/stations.json(OpenStreetMap 전국 철도역).
// 브이월드 응답의 좌표는 저장하지 않는다(거리 계산에만 쓰고 이름·거리만 남김).
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { keyOf, geocode, cleanAddress, addressVariants } from './map.mjs';

const VW = 'https://api.vworld.kr/req/search';
export const RANGE = 1500; // m, 학교
export const STATION_RANGE = 3000; // m, 역은 1.5km 안에 없을 때가 많아 3km 안 가까운 3곳

// 두 점 사이 직선거리(m)
export function meters(lon1, lat1, lon2, lat2) {
  const R = 6371000, t = (x) => (x * Math.PI) / 180;
  const h = Math.sin(t(lat2 - lat1) / 2) ** 2 + Math.cos(t(lat1)) * Math.cos(t(lat2)) * Math.sin(t(lon2 - lon1) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const LEVEL = { 초등학교: '초', 중학교: '중', 고등학교: '고' };
// 같은 학교가 이름을 바꿔 여러 번 나온다("서울강빛초등학교"·"강빛초교", 정문·후문 점): 앞의 "서울"과 "학교/교" 꼬리를 떼고 같은 이름이면 가까운 것 하나
export const schoolKey = (name) => name.replace(/^서울(?=.)/, '').replace(/(초등학교|중학교|고등학교|초교|중교|고교)$/, '');
export function pickSchools(items, lon, lat, level) {
  const best = new Map();
  for (const i of items) {
    if (!new RegExp(`교육부 > ${level}$`).test(i.category || '')) continue;
    if (/입구|병설|유치원|정류장/.test(i.title)) continue;
    const d = meters(lon, lat, +i.point.x, +i.point.y);
    if (d > RANGE) continue;
    const k = schoolKey(i.title);
    if (!best.has(k) || best.get(k).d > d) best.set(k, { name: i.title.replace(/(초교|중교|고교)$/, (m) => ({ 초교: '초등학교', 중교: '중학교', 고교: '고등학교' })[m]), d });
  }
  return [...best.values()].sort((a, b) => a.d - b.d).slice(0, 3);
}

async function vwSearch(query, bbox, key) {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const u = `${VW}?service=search&request=search&version=2.0&crs=EPSG:4326&bbox=${bbox}&size=100&page=${page}&query=${encodeURIComponent(query)}&type=place&format=json&key=${key}`;
    const j = await (await fetch(u)).json();
    const items = j.response?.result?.items || [];
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

// 역: posts/stations.json(전국 철도역, stations_update.mjs로 받아 둔 OpenStreetMap 자료)에서 직선거리로
let STATIONS = null;
export async function stations(lon, lat) {
  STATIONS ??= JSON.parse(await readFile(new URL('./stations.json', import.meta.url), 'utf8')).stations;
  const best = new Map();
  for (const s of STATIONS) {
    const d = meters(lon, lat, s.lon, s.lat);
    if (d > STATION_RANGE) continue;
    const name = s.name.endsWith('역') ? s.name : s.name + '역';
    if (!best.has(name) || best.get(name).d > d) best.set(name, { name, kind: s.kind, operator: s.operator, d });
  }
  return [...best.values()].sort((a, b) => a.d - b.d).slice(0, 3);
}

export async function nearby(address, key) {
  const a = cleanAddress(address);
  let pt = null;
  for (const v of addressVariants(a)) if ((pt = await geocode(v, key))) break;
  if (!pt) return { skip: `좌표 못 찾음: ${a}` };
  const d = 0.018; // 약 2km 상자 안에서 찾고 1.5km로 자른다
  const bbox = [pt.lon - d * 1.25, pt.lat - d, pt.lon + d * 1.25, pt.lat + d].join(',');
  const schools = {};
  for (const level of Object.keys(LEVEL)) schools[LEVEL[level]] = pickSchools(await vwSearch(level, bbox, key), pt.lon, pt.lat, level);
  const st = await stations(pt.lon, pt.lat).catch((e) => ({ error: e.message }));
  return { address: a, range: RANGE, schools, stations: st, sources: ['브이월드 검색(학교)', '© OpenStreetMap contributors(철도역)'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const key = await keyOf();
  if (!key) { console.log('VWORLD_KEY가 없습니다.'); process.exit(3); }
  console.log(JSON.stringify(await nearby(process.argv[2], key), null, 2));
}

// 단지 근처 버스 정류장과 지나는 노선(분양분석 글 입지). 서울은 서울시 정류소정보조회, 그 밖은 국토교통부 TAGO 버스정류소정보.
// node posts/bus.mjs 127.1695 37.5725 서울
// 키: .env DATA_GO_KR_KEY(공공데이터포털 활용신청 2건). 오류 메시지에 URL(키 포함)을 넣지 않는다.
import { pathToFileURL } from 'node:url';
import { dataKey } from './trades.mjs';
import { meters } from './nearby.mjs';

export const RADIUS = 500; // m, 이 안의 정류장
// 출퇴근에 쓰는 핵심 노선: 마을버스 말고 전부(지선은 지하철역 연결이 많아 포함)
export const isCore = (r) => !/마을/.test(r.type);
const MAX_STOPS = 4;
// 노선 종류 순서(앞일수록 주요 노선으로 먼저 보여 줌)
const SEOUL_TYPE = { 1: '공항', 2: '마을', 3: '간선', 4: '지선', 5: '순환', 6: '광역', 7: '인천', 8: '경기', 0: '공용' };
export const ORDER = ['광역', '공항', '광역급행버스', '직행좌석버스', '좌석버스', '간선', '경기', '인천', '일반버스', '지선', '순환', '공용', '마을', '마을버스'];
const rank = (t) => { const i = ORDER.indexOf(t); return i < 0 ? ORDER.length : i; };

const json = async (u, what) => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${what} HTTP ${r.status}`);
  return r.json();
};
const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);

async function seoul(lon, lat, key) {
  const K = encodeURIComponent(key);
  const j = await json(`http://ws.bus.go.kr/api/rest/stationinfo/getStationByPos?serviceKey=${K}&tmX=${lon}&tmY=${lat}&radius=${RADIUS}&resultType=json`, '서울 정류소');
  const stops = arr(j.msgBody?.itemList).filter((s) => s.arsId && s.arsId !== '0' && !/미정차/.test(s.stationNm)).map((s) => ({ name: s.stationNm, d: +s.dist, id: s.arsId })).sort((a, b) => a.d - b.d).slice(0, MAX_STOPS);
  for (const s of stops) {
    const r = await json(`http://ws.bus.go.kr/api/rest/stationinfo/getRouteByStation?serviceKey=${K}&arsId=${s.id}&resultType=json`, '서울 경유노선');
    s.routes = arr(r.msgBody?.itemList).map((x) => ({ id: x.busRouteId, city: null, no: x.busRouteNm, type: SEOUL_TYPE[x.busRouteType] || '기타', from: x.stBegin, to: x.stEnd, term: +x.term || null, km: +x.length || null }));
  }
  return stops;
}

async function tago(lon, lat, key) {
  const K = encodeURIComponent(key), base = 'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/';
  const j = await json(`${base}getCrdntPrxmtSttnList?serviceKey=${K}&gpsLati=${lat}&gpsLong=${lon}&numOfRows=30&_type=json`, 'TAGO 정류소');
  // 같은 이름(길 건너 양쪽 정류장)은 가까운 하나로 묶되 노선은 합친다
  const near = arr(j.response?.body?.items?.item).map((s) => ({ name: s.nodenm, d: meters(lon, lat, +s.gpslong, +s.gpslati), city: s.citycode, id: s.nodeid })).filter((s) => s.d <= RADIUS).sort((a, b) => a.d - b.d);
  const byName = new Map();
  for (const s of near) {
    const r = await json(`${base}getSttnThrghRouteList?serviceKey=${K}&cityCode=${s.city}&nodeid=${s.id}&numOfRows=100&_type=json`, 'TAGO 경유노선');
    const routes = arr(r.response?.body?.items?.item).map((x) => ({ id: x.routeid, city: s.city, no: String(x.routeno), type: x.routetp || '기타', from: x.startnodenm || null, to: x.endnodenm || null, term: null, km: null }));
    if (!byName.has(s.name)) byName.set(s.name, { name: s.name, d: s.d, routes: [] });
    byName.get(s.name).routes.push(...routes);
    if (byName.size >= MAX_STOPS && ![...byName.keys()].includes(s.name)) break;
  }
  return [...byName.values()].slice(0, MAX_STOPS);
}

// 정류장 목록 + 노선(중복 없이, 종류 순)
export async function busNear(lon, lat, region) {
  const key = await dataKey();
  if (!key) return { skip: 'DATA_GO_KR_KEY 없음' };
  try {
    const stops = region === '서울' ? await seoul(lon, lat, key) : await tago(lon, lat, key);
    const seen = new Map();
    for (const s of stops) for (const r of s.routes) if (!seen.has(r.no)) seen.set(r.no, r);
    const routes = [...seen.values()].sort((a, b) => rank(a.type) - rank(b.type) || a.no.localeCompare(b.no, 'ko', { numeric: true }));
    return { stops: stops.map(({ name, d, routes: r }) => ({ name, d, count: new Set(r.map((x) => x.no)).size })), routes, radius: RADIUS, source: region === '서울' ? '서울특별시 정류소정보조회 서비스' : '국토교통부 TAGO 버스정류소정보' };
  } catch (e) {
    return { skip: e.message };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await busNear(+process.argv[2], +process.argv[3], process.argv[4] || '서울');
  if (r.skip) { console.log(r.skip); process.exit(3); }
  console.log('정류장:', r.stops.map((s) => `${s.name} ${s.d}m(${s.count}개 노선)`).join(', '));
  const by = {}; for (const x of r.routes) (by[x.type] ??= []).push(x.no);
  console.log('노선:', Object.entries(by).map(([t, n]) => `${t} ${n.join('·')}`).join(' / '));
}

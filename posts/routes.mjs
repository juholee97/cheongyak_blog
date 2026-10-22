// 버스 노선이 갈아타지 않고 닿는 지하철역과 정거장 수(분양분석 "출퇴근 범위").
// 서울: 서울특별시 노선정보조회(getStaionByRoute), 그 밖: 국토교통부 TAGO 버스노선정보(getRouteAcctoThrghSttnList)
// 방법: 단지에서 가까운 정류장에서 타서, 단지에서 가장 멀어지는 정류장(반대 방향으로 돌아오기 전)까지 간다고 보고
//       각 정류장 250m 안 철도역(posts/stations.json)을 처음 만나는 순서대로 센다. 걸리는 시간은 추정하지 않는다.
import { readFile } from 'node:fs/promises';
import { meters } from './nearby.mjs';

const STATION_NEAR = 250; // m, 정류장-역 연결로 보는 거리
const BOARD_NEAR = 600; // m, 단지에서 탈 정류장으로 보는 거리
// 걸리는 시간 추정: 노선 거리 ÷ 평균 시속(공개 API에 소요 시간이 없어서). 이 시간 안에 닿는 역만 남긴다
export const ASSUMED_KMH = 20, LIMIT_MIN = 30;
export const minutesOf = (m) => Math.round((m / 1000 / ASSUMED_KMH) * 60);
const HUBS = JSON.parse(await readFile(new URL('./hubs.json', import.meta.url), 'utf8')).hubs;
let STATIONS = null;
const stationsList = async () => (STATIONS ??= JSON.parse(await readFile(new URL('./stations.json', import.meta.url), 'utf8')).stations);
const bare = (n) => n.replace(/역$/, '').replace(/\(.*\)$/, '').trim();
// 역의 노선(급행은 같은 노선으로)
const LC = JSON.parse(await readFile(new URL('./line_colors.json', import.meta.url), 'utf8'));
const ALIAS = Object.entries(LC.aliases).sort((a, b) => b[0].length - a[0].length);
// 노선 이름 정리: "1호선 급행"·"1호선 경인·경원 계통" → "1호선", "인천국제공항철도 직통열차" → "공항철도". 모르는 이름(KTX 등)은 그대로
export const canonLine = (l) => (ALIAS.find(([k]) => l.startsWith(k)) || [null, l.replace(/\s*급행\s*/, ' ').trim()])[1];
const lineSet = (s) => [...new Set((s.lines || []).map(canonLine))];
export function hubOf(name) {
  const b = bare(name);
  for (const [hub, names] of Object.entries(HUBS)) if (names.includes(b)) return hub;
  return null;
}

const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
async function stopsOf(r, key) {
  const K = encodeURIComponent(key);
  if (!r.city) {
    const res = await fetch(`http://ws.bus.go.kr/api/rest/busRouteInfo/getStaionByRoute?serviceKey=${K}&busRouteId=${r.id}&resultType=json`);
    if (!res.ok) throw new Error(`서울 노선 HTTP ${res.status}`);
    return arr((await res.json()).msgBody?.itemList).sort((a, b) => a.seq - b.seq).map((s) => ({ name: s.stationNm, lon: +s.gpsX, lat: +s.gpsY, seg: +s.fullSectDist || 0 })); // seg: 앞 정류장부터 노선 거리(m)
  }
  const res = await fetch(`https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteAcctoThrghSttnList?serviceKey=${K}&cityCode=${r.city}&routeId=${r.id}&numOfRows=400&_type=json`);
  if (!res.ok) throw new Error(`TAGO 노선 HTTP ${res.status}`);
  const list = arr((await res.json()).response?.body?.items?.item).sort((a, b) => a.nodeord - b.nodeord).map((s) => ({ name: s.nodenm, lon: +s.gpslong, lat: +s.gpslati }));
  return list.map((s, i) => ({ ...s, seg: i ? meters(list[i - 1].lon, list[i - 1].lat, s.lon, s.lat) : 0 })); // TAGO는 구간 거리가 없어 정류장 사이 직선거리
}

// 정류장 목록 → { board, end, stations: [{name, n, hub}] }
export async function reachFrom(stops, lon, lat) {
  const st = (await stationsList()).filter((s) => ['지하철', '경전철', '철도'].includes(s.kind));
  const d = stops.map((s) => meters(lon, lat, s.lon, s.lat));
  // 탈 정류장: 가까운 순으로 보되, 그 뒤로 2km 넘게 멀어지는(바깥으로 나가는) 방향이어야 한다
  const cand = d.map((v, i) => [v, i]).filter(([v]) => v <= BOARD_NEAR).sort((a, b) => a[0] - b[0]);
  for (const [, b] of cand) {
    let m = b;
    for (let i = b; i < stops.length; i++) if (d[i] > d[m]) m = i;
    if (d[m] < 2000) continue;
    const seen = new Map();
    const names = new Set(st.map((s) => bare(s.name)));
    let run = 0;
    for (let j = b; j <= m; j++) {
      if (j > b) run += stops[j].seg;
      if (minutesOf(run) > LIMIT_MIN) break;
      // 정류장 이름에 역 이름이 있으면(예: "상일동역4번출구") 그 역, 아니면 250m 안 가장 가까운 역
      const hit = [...stops[j].name.matchAll(/([가-힣A-Za-z0-9]+)역/g)].map((x) => x[1]).find((x) => names.has(x));
      let best = null;
      for (const s of st) {
        if (hit && bare(s.name) !== hit) continue;
        const x = meters(stops[j].lon, stops[j].lat, s.lon, s.lat);
        if ((hit || x <= STATION_NEAR) && (!best || x < best.x)) best = { name: bare(s.name) + '역', x, lines: lineSet(s) };
      }
      if (best && !seen.has(best.name)) seen.set(best.name, { name: best.name, lines: best.lines, n: j - b, min: minutesOf(run), hub: hubOf(best.name) });
    }
    // 같은 노선은 가장 먼저(가깝게) 닿는 역 하나만: 새 노선이 하나라도 있는 역만 남긴다(환승역은 노선을 함께 표시)
    const covered = new Set(), kept = [];
    for (const s of seen.values()) {
      const ls = s.lines.length ? s.lines : [s.name];
      if (ls.some((l) => !covered.has(l))) { kept.push(s); ls.forEach((l) => covered.add(l)); }
    }
    return { board: stops[b].name, boardD: d[b], end: stops[m].name, stops: m - b, stations: kept };
  }
  return null;
}

export async function routeReach(r, lon, lat, key) {
  try { return await reachFrom(await stopsOf(r, key), lon, lat); } catch (e) { return { skip: e.message }; }
}

// 전국 철도역 목록(지하철·경전철·일반철도)을 OpenStreetMap에서 한 번 받아 posts/stations.json으로 저장한다.
// 역은 자주 바뀌지 않으니 가끔(새 노선 개통 때) 다시 돌린다: node posts/stations_update.mjs
// 출처 표기: © OpenStreetMap contributors (ODbL)
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';

const URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter'];
const Q = '[out:json][timeout:300];area["ISO3166-1"="KR"][admin_level=2]->.kr;node["railway"="station"](area.kr);out body;';

let data = null;
for (let round = 0; round < 3 && !data; round++) {
  for (const url of URLS) {
    const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(Q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'cheongyak-blog (aulee.tistory.com)' } }).catch(() => null);
    if (r?.ok) { data = await r.json(); break; }
    console.log(`${url} → ${r?.status ?? '연결 실패'}`);
  }
  if (!data) await new Promise((res) => setTimeout(res, 20000));
}
if (!data) { console.error('Overpass 응답 없음 — 나중에 다시 실행'); process.exit(1); }

// 노선(호선) 붙이기: 철도 노선 관계(route relation)의 정차 노드 중 같은 이름·400m 안에 있는 것의 노선명
const QL = '[out:json][timeout:300];area["ISO3166-1"="KR"][admin_level=2]->.kr;rel["route"~"^(subway|light_rail|train)$"](area.kr);out body;node(r);out body;';
let lines = null;
for (let round = 0; round < 3 && !lines; round++) for (const url of URLS) {
  const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(QL), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'cheongyak-blog (aulee.tistory.com)' } }).catch(() => null);
  if (r?.ok) { lines = await r.json(); break; }
}
const bareName = (n) => String(n || '').replace(/역$/, '').replace(/\s*\(.*\)$/, '').trim();
// "수도권 전철 3호선: 대화 → 오금" → "3호선", "서울 지하철 9호선" → "9호선", "신분당선" 그대로
const lineName = (t) => (t.name || t.ref || '').split(':')[0].replace(/\s*급행\s*/, ' ').replace(/^(수도권 전철|서울 지하철|서울 도시철도|부산 도시철도|대구 도시철도|광주 도시철도|대전 도시철도|인천 도시철도|인천 지하철)\s*/, '').trim();
const stopsByName = new Map();
if (lines) {
  const nodes = new Map(lines.elements.filter((e) => e.type === 'node').map((n) => [n.id, n]));
  for (const rel of lines.elements.filter((e) => e.type === 'relation')) {
    const ln = lineName(rel.tags || {});
    if (!ln) continue;
    for (const m of rel.members) {
      const n = m.type === 'node' && nodes.get(m.ref);
      if (!n?.tags?.name || n.lat == null) continue;
      const k = bareName(n.tags.name);
      if (!stopsByName.has(k)) stopsByName.set(k, []);
      stopsByName.get(k).push({ lat: n.lat, lon: n.lon, line: ln });
    }
  }
} else console.log('노선 정보 받기 실패 — 역 목록만 저장');
const near400 = (a, b) => Math.abs(a.lat - b.lat) < 0.0036 && Math.abs(a.lon - b.lon) < 0.0045;

const kind = (t) => (t.station === 'subway' ? '지하철' : t.station === 'light_rail' ? '경전철' : '철도');
const list = data.elements.filter((e) => e.tags?.name).map((e) => {
  const lines = [...new Set((stopsByName.get(bareName(e.tags.name)) || []).filter((x) => near400(x, e)).map((x) => x.line))].sort();
  return { name: e.tags.name, kind: kind(e.tags), operator: e.tags.operator || null, lines, lat: +e.lat.toFixed(6), lon: +e.lon.toFixed(6) };
});
await mkdir(join(ROOT, 'data'), { recursive: true });
await writeFile(join(ROOT, 'posts', 'stations.json'), JSON.stringify({ source: '© OpenStreetMap contributors (ODbL)', fetchedAt: new Date().toISOString(), stations: list }));
console.log(`역 ${list.length}곳 저장(노선 붙은 역 ${list.filter((x) => x.lines.length).length}곳) → posts/stations.json`);

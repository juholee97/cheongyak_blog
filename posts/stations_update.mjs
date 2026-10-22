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

const kind = (t) => (t.station === 'subway' ? '지하철' : t.station === 'light_rail' ? '경전철' : '철도');
const list = data.elements.filter((e) => e.tags?.name).map((e) => ({ name: e.tags.name, kind: kind(e.tags), operator: e.tags.operator || null, lat: +e.lat.toFixed(6), lon: +e.lon.toFixed(6) }));
await mkdir(join(ROOT, 'data'), { recursive: true });
await writeFile(join(ROOT, 'posts', 'stations.json'), JSON.stringify({ source: '© OpenStreetMap contributors (ODbL)', fetchedAt: new Date().toISOString(), stations: list }));
console.log(`역 ${list.length}곳 저장 → posts/stations.json`);

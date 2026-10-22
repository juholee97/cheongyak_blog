// 배정 학교(학구도) + 지원·선발 학교. 자료: 학구도안내서비스(한국교육시설안전원) 2026.09.20 기준 — data/schoolzone/ (커밋 안 함)
// 받는 법: https://schoolzone.emac.kr/publicData/publicDataList.do 의 "초중고 학교 위치 / 초등학교 통학구역 / 중학교 학구 및 학군 /
//   고등학교 학교군 / 고등학교 비평준화지역 / 학교-학구도 연계정보" zip을 data/schoolzone/{school_location,elem_zone,middle_zone,high_zone,high_nonflat,school_link}/에 푼다(매년 3월·9월 갱신).
// node posts/schools.mjs 127.1695 37.5725
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import shapefile from 'shapefile';
import { ROOT } from '../tistory/common.mjs';
import { meters } from './nearby.mjs';

const DIR = join(ROOT, 'data', 'schoolzone');
export const SOURCE = '학구도안내서비스(한국교육시설안전원) 2026.09.20 기준';
export const SELECT_RANGE = 5000; // m, 지원·선발 학교를 찾는 범위

// 위경도 → EPSG:5186(GRS80 횡메르카토르, 중부원점 127°E·38°N, 가산 200000/600000)
export function tm(lon, lat) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 1, lon0 = (127 * Math.PI) / 180, lat0 = (38 * Math.PI) / 180;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2), r = Math.PI / 180;
  const M = (p) => a * ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * p - ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p) + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
  const p = lat * r, l = lon * r, N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2), T = Math.tan(p) ** 2, Cc = ep2 * Math.cos(p) ** 2, A = (l - lon0) * Math.cos(p);
  const x = 200000 + k0 * N * (A + ((1 - T + Cc) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * Cc - 58 * ep2) * A ** 5) / 120);
  const y = 600000 + k0 * (M(p) - M(lat0) + N * Math.tan(p) * (A ** 2 / 2 + ((5 - T + 9 * Cc + 4 * Cc ** 2) * A ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * Cc - 330 * ep2) * A ** 6) / 720));
  return [x, y];
}

const inRing = ([x, y], ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// 링 방향(바깥/구멍)이 파일마다 섞여 있어 짝홀 규칙으로: 점을 감싸는 링이 홀수 개면 안
export const contains = (geom, pt) => {
  const rings = geom.type === 'Polygon' ? geom.coordinates : geom.type === 'MultiPolygon' ? geom.coordinates.flat() : [];
  return rings.filter((r) => inRing(pt, r)).length % 2 === 1;
};

async function shp(dir) {
  const base = (await readdir(join(DIR, dir))).find((f) => f.endsWith('.shp')).replace(/\.shp$/, '');
  return join(DIR, dir, base);
}
// 점에서 구역 경계까지 최단 거리(m, 같은 평면좌표)
const segDist = ([px, py], [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
const edgeDist = (geom, pt) => { let m = Infinity; for (const r of geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat()) for (let i = 1; i < r.length; i++) m = Math.min(m, segDist(pt, r[i - 1], r[i])); return m; };

// 점이 든 구역들(속성만). 하나도 없으면(신규 택지 등 지정 전) near 안의 가장 가까운 구역을 near: true로
async function zonesAt(dir, pt, near = 0) {
  const base = await shp(dir);
  const src = await shapefile.open(base + '.shp', base + '.dbf', { encoding: 'euc-kr' });
  const hits = [], close = [];
  for (let r = await src.read(); !r.done; r = await src.read()) {
    if (contains(r.value.geometry, pt)) hits.push(r.value.properties);
    else if (near) { const d = edgeDist(r.value.geometry, pt); if (d <= near) close.push({ ...r.value.properties, near: Math.round(d) }); }
  }
  return hits.length ? hits : close.sort((a, b) => a.near - b.near).slice(0, 2);
}

const csv = async (dir) => {
  const f = (await readdir(join(DIR, dir))).find((x) => x.endsWith('.csv'));
  const [head, ...rows] = (await readFile(join(DIR, dir, f), 'utf8')).replace(/^﻿/, '').trim().split(/\r?\n/).map((l) => l.split(','));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
};
let CACHE = null;
async function tables() {
  if (CACHE) return CACHE;
  const loc = await csv('school_location'), link = await csv('school_link');
  const byId = new Map(loc.filter((s) => s.운영상태 === '운영').map((s) => [s.학교ID, s]));
  const byZone = new Map();
  for (const l of link) { if (!byZone.has(l.학구ID)) byZone.set(l.학구ID, []); byZone.get(l.학구ID).push(l.학교ID); }
  return (CACHE = { loc: [...byId.values()], byId, byZone });
}

const SELECTIVE = { 초등학교: (s) => s.설립형태 !== '공립', 중학교: (s) => /국제중|예술중|체육중/.test(s.학교명), 고등학교: (s) => /과학고|외국어고|국제고|예술고|체육고|마이스터|영재|외고/.test(s.학교명) };

export async function schoolsAt(lon, lat) {
  const pt = tm(lon, lat), { loc, byId, byZone } = await tables();
  const school = (id) => { const s = byId.get(id); return s && { name: s.학교명, type: s.설립형태, d: meters(lon, lat, +s.경도, +s.위도) }; };
  const zone = (z) => ({ name: z.HAKGUDO_NM, id: z.HAKGUDO_ID, near: z.near ?? null, schools: (byZone.get(z.HAKGUDO_ID) || []).map(school).filter(Boolean).sort((a, b) => a.d - b.d) });
  const [elem, middle, high, nonflat] = await Promise.all([zonesAt('elem_zone', pt, 1000), zonesAt('middle_zone', pt, 1000), zonesAt('high_zone', pt), zonesAt('high_nonflat', pt)]);
  const selective = {};
  for (const [level, test] of Object.entries(SELECTIVE)) {
    selective[level] = loc.filter((s) => s.학교급구분 === level && test(s)).map((s) => ({ name: s.학교명, type: s.설립형태, d: meters(lon, lat, +s.경도, +s.위도) })).filter((s) => s.d <= SELECT_RANGE).sort((a, b) => a.d - b.d).slice(0, 5);
  }
  return { elem: elem.map(zone), middle: middle.map(zone), high: high.map(zone), nonflat: nonflat.map((z) => z.HAKGUDO_NM), selective, source: SOURCE };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await schoolsAt(+process.argv[2], +process.argv[3]);
  const z = (zs) => zs.map((x) => `${x.name}${x.near != null ? `[지정 전, 경계까지 ${x.near}m]` : ''}(${x.schools.length}곳): ${x.schools.slice(0, 6).map((s) => `${s.name} ${s.d}m`).join(', ')}`).join(' / ') || '없음';
  console.log('초등 통학구역:', z(r.elem)); console.log('중학교 학구·학군:', z(r.middle)); console.log('고등학교 학교군:', z(r.high)); console.log('비평준화:', r.nonflat.join(', ') || '아님');
  for (const [k, v] of Object.entries(r.selective)) console.log(`지원·선발 ${k}:`, v.map((s) => `${s.name}(${s.type}) ${s.d}m`).join(', ') || '없음');
}

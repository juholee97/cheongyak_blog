// 단지 위치 지도(1200×630 PNG): 브이월드(국토교통부) 배경지도 위에 공급위치 대표 필지 테두리를 하이라이트.
// node posts/map.mjs drafts/2026-10-26_weekly.json [--only 3]  → drafts/2026-10-26_weekly.maps/*.png
// 키: 환경변수 VWORLD_KEY 또는 프로젝트 .env의 VWORLD_KEY=... (커밋 금지)
// 브이월드 지오코더 응답은 저장하지 않고 그 자리에서 그림을 그리는 데만 쓴다(이용 조건).
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { build } from './weekly.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const API = 'https://api.vworld.kr/req';
const W = 1200, H = 630, TILE = 256;

// "경기도 의정부시 의정부동 253-19번지 일원" → "경기도 의정부시 의정부동 253-19"
export function cleanAddress(a) {
  let s = String(a || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/(\d+(?:-\d+)?)\s*번지.*$/, '$1');
  s = s.replace(/\s+\S*(블록|BL)\S*.*$/i, ''); // "AA32블록", "A-1BL" 같은 택지 블록 표기는 지번이 아니다
  s = s.replace(/\s*(일원|일대|외\s*\d*\s*필지|외)$/, '');
  return s.replace(/\s+/g, ' ').trim();
}

// 웹 메르카토르: 경위도 → 줌 z의 전역 픽셀 좌표
export function project(lon, lat, z) {
  const n = TILE * 2 ** z, rad = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n];
}

// 위도 lat, 줌 z에서 1픽셀이 몇 m인지(웹 메르카토르)
export const metersPerPx = (lat, z) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

// 반경 radius(m) 원이 그림 높이 안(위아래 여백 fitPx)에 들어오는 가장 큰 정수 줌 — 반경 안 학교·역·상가가 다 보이게
export function zoomForRadius(lat, radius, fitPx = H / 2 - 30, zMin = 12, zMax = 17) {
  for (let z = zMax; z >= zMin; z--) if (radius / metersPerPx(lat, z) <= fitPx) return z;
  return zMin;
}

async function keyOf() {
  if (process.env.VWORLD_KEY) return process.env.VWORLD_KEY;
  const env = await readFile(join(ROOT, '.env'), 'utf8').catch(() => '');
  const m = env.match(/^VWORLD_KEY=(.+)$/m);
  return m ? m[1].trim() : null;
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// 행정구역 개편(예: 2026 화성특례시 동탄구)을 지오코더가 아직 모를 때 옛 이름으로 다시 시도
export const addressVariants = (a) => [...new Set([a, a.replace(/(\S+)특례시\s+\S+구\s/, '$1시 '), a.replace(/특례시/, '시')])];

// 주소 → 좌표(지번, 실패하면 도로명)
async function geocode(address, key) {
  for (const a of addressVariants(address)) {
    for (const type of ['PARCEL', 'ROAD']) {
      const u = `${API}/address?service=address&request=getCoord&version=2.0&crs=EPSG:4326&format=json&type=${type}&key=${key}&address=${encodeURIComponent(a)}`;
      const j = await getJson(u);
      const p = j.response?.result?.point;
      if (j.response?.status === 'OK' && p) return { lon: +p.x, lat: +p.y, type };
    }
  }
  return null;
}

const ringsOf = (g) => (g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : []).map((p) => p[0]);
const lotOf = (jibun) => String(jibun || '').replace(/^산\s*/, '').replace(/[^\d-]/g, ''); // "584-1대" → "584-1"

// 좌표 주변(buffer m) 필지 중 지번이 lot과 같은 것, lot이 없으면 좌표가 든 필지
async function parcelAt(lon, lat, key, lot) {
  const u = `${API}/data?service=data&request=GetFeature&version=2.0&data=LP_PA_CBND_BUBUN&format=json&crs=EPSG:4326&size=${lot ? 300 : 1}&buffer=${lot ? 80 : 0}&geomFilter=POINT(${lon} ${lat})&key=${key}`;
  const j = await getJson(u);
  const fs = j.response?.result?.featureCollection?.features || [];
  const f = lot ? fs.find((x) => lotOf(x.properties?.jibun) === lot) : fs[0];
  return f ? { rings: ringsOf(f.geometry), jibun: f.properties?.jibun || '' } : null;
}

// 배경지도 타일을 서버에서 받아 data URI로 넣는다(브라우저 도메인 제한과 무관하게)
async function tileUri(z, x, y, key) {
  const r = await fetch(`${API}/wmts/1.0.0/${key}/Base/${z}/${y}/${x}.png`);
  if (!r.ok) throw new Error(`타일 HTTP ${r.status}`);
  return 'data:image/png;base64,' + Buffer.from(await r.arrayBuffer()).toString('base64');
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export async function mapHtml(it, key, radius = 500) {
  const address = cleanAddress(it.address);
  if (!address) return { skip: '주소 없음' };
  // 지번(또는 도로명 건물번호)으로 끝나지 않는 주소("검단신도시 AA32블록" 등)는 좌표가 엉뚱한 곳에 찍히므로 그리지 않는다
  const lot = (address.match(/(?:산\s*)?(\d+(?:-\d+)?)$/) || [])[1];
  if (!lot) return { skip: `지번 없음: ${address}` };
  const pt = await geocode(address, key);
  if (!pt) return { skip: `좌표 못 찾음: ${address}` };
  // 지번 주소면 주변에서 지번이 정확히 같은 필지를 찾고(없으면 지점만), 도로명 주소면 좌표가 든 필지
  const parcel = await parcelAt(pt.lon, pt.lat, key, pt.type === 'PARCEL' ? lot : null);
  const rings = parcel?.rings?.length ? parcel.rings : [[[pt.lon, pt.lat]]];
  const z = zoomForRadius(pt.lat, radius);
  const all = rings.flat().map(([x, y]) => project(x, y, z));
  const cx = (Math.min(...all.map((p) => p[0])) + Math.max(...all.map((p) => p[0]))) / 2;
  const cy = (Math.min(...all.map((p) => p[1])) + Math.max(...all.map((p) => p[1]))) / 2;
  const ox = cx - W / 2, oy = cy - H / 2; // 그림 왼쪽 위의 전역 픽셀
  // 반경 원: 500m는 항상, 1km 모드면 1km도 (중심 = 필지 중심)
  const radii = radius >= 1000 ? [500, 1000] : [500];
  const circles = radii.map((r) => {
    const rp = r / metersPerPx(pt.lat, z);
    return `<circle cx="${W / 2}" cy="${H / 2}" r="${rp.toFixed(1)}" fill="none" stroke="#0f2557" stroke-width="3" stroke-dasharray="10 8" opacity=".75"/>
<text x="${W / 2}" y="${(H / 2 - rp + 26).toFixed(1)}" text-anchor="middle" font-size="20" font-weight="800" fill="#0f2557" stroke="#fff" stroke-width="5" paint-order="stroke">반경 ${r >= 1000 ? r / 1000 + 'km' : r + 'm'}</text>`;
  }).join('');
  const tiles = [];
  for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + H) / TILE); ty++)
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + W) / TILE); tx++)
      tiles.push(`<img src="${await tileUri(z, tx, ty, key)}" style="position:absolute;left:${tx * TILE - ox}px;top:${ty * TILE - oy}px;width:${TILE}px;height:${TILE}px">`);
  const paths = parcel ? rings.map((r) => r.map(([x, y]) => project(x, y, z)).map(([x, y], i) => `${i ? 'L' : 'M'}${(x - ox).toFixed(1)},${(y - oy).toFixed(1)}`).join('') + 'Z').join('') : '';
  const [px, py] = project(pt.lon, pt.lat, z);
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>body{margin:0;width:${W}px;height:${H}px;overflow:hidden;font-family:Pretendard,sans-serif;letter-spacing:-0.02em}</style></head><body>
<div style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#eef1f5">${tiles.join('')}
<svg width="${W}" height="${H}" style="position:absolute;left:0;top:0">
${circles}
${paths ? `<path d="${paths}" fill="rgba(10,78,194,.22)" stroke="#0a4ec2" stroke-width="5" stroke-linejoin="round"/>` : `<circle cx="${px - ox}" cy="${py - oy}" r="16" fill="#0a4ec2" stroke="#fff" stroke-width="5"/>`}
</svg>
<div style="position:absolute;left:32px;top:28px;background:#fff;border-top:6px solid #0f2557;border-radius:12px;padding:18px 24px;box-shadow:0 10px 30px -12px rgba(0,0,0,.35);max-width:760px">
  <div style="font-size:20px;font-weight:700;color:#464c53">${esc(it.kind)} · ${esc([it.region, it.district].filter(Boolean).join(' '))}</div>
  <div style="font-size:40px;font-weight:800;color:#1e2124;line-height:1.2;word-break:keep-all">${esc(it.name)}</div>
  <div style="font-size:19px;color:#464c53;margin-top:6px">${parcel ? '부지 위치(대표 필지)' : '부지 위치(지점)'} · ${esc(address)}</div>
</div>
<div style="position:absolute;right:0;bottom:0;background:rgba(255,255,255,.92);padding:8px 16px;font-size:16px;color:#464c53">지도: 브이월드(국토교통부) · 필지: 연속지적도 · aulee.tistory.com</div>
</div></body></html>`;
  return { html, zoom: z, parcel: !!parcel };
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('사용: node posts/map.mjs drafts/<월요일>_weekly.json [--only N]');
  const key = await keyOf();
  if (!key) { console.log('VWORLD_KEY가 없습니다 — .env에 VWORLD_KEY=키 를 넣어 주세요(커밋 금지).'); process.exitCode = 3; return; }
  const draft = JSON.parse(await readFile(path, 'utf8'));
  const di = process.argv.indexOf('--data'); // 초안의 수집본 사본 대신 다른 수집본(예: 주소가 들어간 최신 site/schedule.json)
  const data = JSON.parse(await readFile(di > 0 ? process.argv[di + 1] : path.replace(/\.json$/, '.data.json'), 'utf8'));
  const w = build(data, draft.week.start);
  const i = process.argv.indexOf('--only');
  const items = i > 0 ? w.receipt.slice(0, +process.argv[i + 1]) : w.receipt;
  const ri = process.argv.indexOf('--radius');
  const radius = ri > 0 ? +process.argv[ri + 1] : 500; // 500(기본) 또는 1000
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const out = path.replace(/\.json$/, radius === 500 ? '.maps' : `.maps${radius}`);
  await mkdir(out, { recursive: true });
  for (const [n, { it }] of items.entries()) {
    try {
      const r = await mapHtml(it, key, radius);
      if (r.skip) { console.log(`- ${it.name}: 건너뜀 (${r.skip})`); continue; }
      await page.setContent(r.html, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const f = `${out}/${String(n + 1).padStart(2, '0')}_${it.id}.png`;
      await page.screenshot({ path: f, clip: { x: 0, y: 0, width: W, height: H } });
      console.log(`✓ ${it.name}: ${f} (줌 ${r.zoom}, ${r.parcel ? '필지 테두리' : '지점만'})`);
    } catch (e) {
      console.log(`✗ ${it.name}: ${e.message}`); // 키 값이 담긴 URL은 찍지 않는다
    }
  }
  await browser.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

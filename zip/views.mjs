// 우리의 집 「분양 시세비교」 목록 옆 칸의 단지 조감도(2026-10-29 사용자 요청: 정보 제공 목적 — 그림마다 출처를 밝힌다)
// node zip/views.mjs [--only 공고번호,…] [--force]  → data/zip_views/<번호>.jpg(800×500, 가운데 맞춰 자름) + data/zip_views.json { 번호: { file, homepage, page, from, label?, site?, at } }
// 찾는 법: 청약홈 공고의 사업주체 홈페이지(HMPG_ADRES)에서 posts/floorplan.mjs findPlans(조감도·투시도 메뉴의 큰 그림).
// 쓰는 출처는 공식 경로만(사칭 분양 사이트를 피한다, 2026-10-29 사용자: LH 공고 첨부·시행사·시공사 홈페이지 등): 청약홈 공고(이번 또는 같은 단지의 이전 공고)에 적힌 홈페이지,
// LH 청약플러스 공고의 「단지조감도」(공고 화면 소스의 list.push 항목 cmnAhflSn → /lhapply/lhFile.do?fileid=…), 입주자모집공고문 PDF, 시공사 브랜드 사이트.
// 자동으로 못 찾으면 사람이 그 출처의 사업개요·메인 그림을 받아 --add로 넣는다. 새 글을 올릴 때 한 번 돌리고 그림을 눈으로 확인한다(매일 자동 실행엔 넣지 않음).
// 받은 그림은 사람이 한 번 눈으로 확인한다(로고·배너가 잡힐 수 있다) — 틀린 것은 data/zip_views.json에서 지우고 { skip: '이유' }로 둔다.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';

const DIR = join(ROOT, 'data/zip_views'), INDEX = join(ROOT, 'data/zip_views.json');
const DETAIL = { APT: 'getAPTLttotPblancDetail', 무순위: 'getRemndrLttotPblancDetail' };
export const loadViews = async () => JSON.parse(await readFile(INDEX, 'utf8').catch(() => '{}'));

async function homepageOf(r) {
  const d = JSON.parse(await readFile(join(ROOT, 'drafts', `analysis_${r.no}.json`), 'utf8').catch(() => 'null'));
  if (d?.facts?.detail?.homepage) return d.facts.detail.homepage;
  const { odcloud } = await import('../posts/analysis_post.mjs'), { dataKey } = await import('../posts/trades.mjs');
  const [x] = await odcloud(DETAIL[r.kind] || DETAIL.APT, r.no, await dataKey()).catch(() => []);
  return x?.HMPG_ADRES || null;
}

// 원본(크기 제각각) → 800×500 JPEG. 브라우저로 그려 찍는다(새 의존성 없이)
// zoom > 1: 하늘이 넓은 눈높이 그림을 건물 쪽으로 확대(focus 지점이 제자리) — 카드 아래쪽은 훅 글자가 덮어서 건물이 위로 와야 보인다(2026-11-05 사용자)
export async function frame(src, out, focus = 'center', zoom = 1) {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 800, height: 500 } });
    const type = /\.png$/i.test(src) ? 'image/png' : 'image/jpeg';
    await p.setContent(`<body style="margin:0"><img src="data:${type};base64,${(await readFile(src)).toString('base64')}" style="width:800px;height:500px;object-fit:cover;object-position:${focus};display:block;transform:scale(${zoom});transform-origin:${focus}"></body>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: out, type: 'jpeg', quality: 78 });
  } finally { await b.close(); }
}

// 자동으로 못 찾은 곳은 사람이 공식 출처의 사업개요·메인 그림을 받아 등록한다(2026-10-29: 13곳 중 6곳, 이어서 나머지 9곳 중 8곳)
// node zip/views.mjs --add 공고번호 그림파일 그림이있던페이지 [초점(object-position, 예 'center 20%')] [--label 투시도] [--site 'LH 청약플러스 공고'] [--zoom 1.4]
// label: 그림 이름(기본 조감도 — 눈높이 그림이면 투시도), site: 목록 그림 밑에 적는 출처 이름(기본 분양 홈페이지). 출처 링크는 그림이 있던 페이지
// 공식 조감도를 못 찾은 단지의 카드 그림 = 입지 지도(2026-11-08 사용자: 지도 기반으로, 미드나이트 말고 색을 입혀 단지 땅 테두리 + 가까운 지하철역까지 동선 + 초·중·고 + 대형마트)
// 바탕 브이월드 Base 지도, 단지 경계는 OpenStreetMap 아파트 단지 면(이름이 맞는 면 → 좌표가 든 이름 없는 면 → 200m 안 공사 면, 없으면 점선 원),
// 역은 posts/stations.json(OSM), 학교는 브이월드 검색(1.5km 안 가장 가까운 초·중·고, 「망미초」처럼 줄여 씀), 마트는 3km 안 이마트·홈플러스·롯데마트·코스트코·트레이더스.
// 거리는 모두 직선거리. 카드 아래쪽은 훅 글자가 덮으니 표시는 위 60%(y 46~282)에만. 좌표는 지번·건물번호로 끝나는 주소만(아니면 그리지 않음)
// 브이월드 응답 좌표는 그리는 데만 쓰고 저장하지 않는다(이용 조건)
// node zip/views.mjs --map 공고번호,…  (publish.mjs --pages가 그림 없는 심층 분석 글에 자동으로 부른다)
export async function siteMap(no, out) {
  const { keyOf, project, cleanAddress, geocode } = await import('../posts/map.mjs'), { meters } = await import('../posts/nearby.mjs'), { useApi } = await import('./guard.mjs');
  const key = await keyOf(); if (!key) return { skip: 'VWORLD_KEY 없음' };
  const reg = JSON.parse(await readFile(join(ROOT, 'data/zip_registry.json'), 'utf8'))[no];
  const fix = JSON.parse(await readFile(join(ROOT, 'data/zip_address.json'), 'utf8').catch(() => '{}'))[no];
  if (!reg) return { skip: '등록부에 없음' };
  if (fix?.approx) return { skip: '위치가 동 단위 추정' };
  const address = cleanAddress(fix?.address || reg.address);
  if (!/\d$/.test(address)) return { skip: `지번 없는 주소: ${address}` };
  useApi('vworld', 2);
  const pt = await geocode(address, key); if (!pt) return { skip: `좌표 못 찾음: ${address}` };
  const { lon, lat } = pt, name = shortName(reg.name), W = 800, H = 500, T = 256;
  // 단지 경계(OSM)
  useApi('overpass');
  const q = `[out:json][timeout:25];(way(around:300,${lat},${lon})[landuse~"residential|construction"];relation(around:300,${lat},${lon})[landuse~"residential|construction"];);out geom;`;
  const ask = () => fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'user-agent': 'auleezip-map/1.0 (auleezip.com)', 'content-type': 'application/x-www-form-urlencoded' } }).then((r) => r.json());
  const oj = await ask().catch(async () => { await new Promise((r) => setTimeout(r, 4000)); useApi('overpass'); return ask().catch(() => ({})); }); // 공용 서버가 가끔 바쁘다(429·504)
  const ringOf = (e) => (e.type === 'way' ? (e.geometry || []).map((p) => [p.lon, p.lat]) : (e.members || []).filter((m) => m.role === 'outer' && m.geometry).flatMap((m) => m.geometry.map((p) => [p.lon, p.lat])));
  const inside = (r) => { let c = false; for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const [xi, yi] = r[i], [xj, yj] = r[k]; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const cen = (r) => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];
  const norm = (s) => String(s || '').replace(/\s|아파트|단지|\(.*?\)/g, ''), key4 = norm(name).slice(0, 4);
  const els = (oj.elements || []).map((e) => ({ name: e.tags?.name, use: e.tags?.landuse, r: ringOf(e) })).filter((e) => e.r.length > 3);
  const ol = els.find((e) => e.name && norm(e.name).includes(key4)) || els.find((e) => !e.name && inside(e.r))
    || els.filter((e) => !e.name && e.use === 'construction').map((e) => ({ ...e, d: meters(lon, lat, ...cen(e.r)) })).filter((e) => e.d <= 200).sort((a, b) => a.d - b.d)[0] || null;
  // 거리는 단지 한가운데(경계 면의 중심, 없으면 주소 좌표)에서 잰다 — 주소 좌표는 단지 한쪽 끝일 때가 있다(망미동: 민락역이 수영역보다 가깝게 나옴)
  const [cx0, cy0] = ol ? cen(ol.r) : [lon, lat], dist = (x, y) => meters(cx0, cy0, x, y);
  // 역(OSM 전국 철도역): 8km 안 가장 가까운 역 + 거리 차이가 크지 않은(가장 가까운 역의 1.6배·+800m 안, 3km 안) 다른 호선 역 최대 3곳 — 2026-11-08 사용자
  // 같은 새 호선을 주는 역이 여럿이면 환승역(노선 수 많은 역) → 가까운 역 순
  const all = JSON.parse(await readFile(join(ROOT, 'posts/stations.json'), 'utf8')).stations.map((s) => ({ name: s.name.endsWith('역') ? s.name : s.name + '역', op: s.operator || '', lines: s.lines || [], lon: s.lon, lat: s.lat, d: dist(s.lon, s.lat) })).sort((a, b) => a.d - b.d);
  const sts = all[0]?.d <= 8000 ? [all[0]] : [], seen = new Set(all[0]?.lines);
  if (all[0]?.d <= 3000) {
    const pool = all.slice(1).filter((s) => s.d <= Math.min(3000, Math.max(all[0].d * 1.6, all[0].d + 800)) && s.name !== all[0].name);
    for (;;) {
      const best = pool.filter((s) => !sts.includes(s)).map((s) => ({ s, n: s.lines.filter((l) => !seen.has(l)).length })).filter((x) => x.n).sort((a, b) => b.n - a.n || b.s.lines.length - a.s.lines.length || a.s.d - b.s.d)[0];
      if (!best || sts.length >= 3) break;
      sts.push(best.s); best.s.lines.forEach((l) => seen.add(l));
    }
  }
  const st = sts[0], near = st && st.d <= 3000;
  // 학교·대형마트(브이월드 검색)
  const search = async (query, d = 0.03) => { useApi('vworld'); const bbox = [lon - d * 1.25, lat - d, lon + d * 1.25, lat + d].join(','); const j = await fetch(`https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&bbox=${bbox}&size=100&query=${encodeURIComponent(query)}&type=place&format=json&key=${key}`).then((r) => r.json()).catch(() => ({})); return (j.response?.result?.items || []).map((i) => ({ title: i.title, cat: i.category || '', lon: +i.point.x, lat: +i.point.y })); };
  const ps = [];
  for (const [lv, ab] of [['초등학교', '초'], ['중학교', '중'], ['고등학교', '고']]) {
    const s = (await search(lv, 0.018)).filter((i) => new RegExp(`교육부 > ${lv}$`).test(i.cat) && !/입구|병설|유치원|정류장/.test(i.title)).map((i) => ({ ...i, d: dist(i.lon, i.lat) })).filter((i) => i.d <= 1500).sort((a, b) => a.d - b.d)[0];
    if (s) { const base = s.title.replace(/^서울(?=.)/, '').replace(/(초등학교|중학교|고등학교|초교|중교|고교)$/, ''); ps.push({ kind: ab, name: base === s.title ? s.title : base + ab, lon: s.lon, lat: s.lat, d: s.d }); }
  }
  // 대형마트·가전(2km 안, 브랜드마다 가장 가까운 곳, 가까운 2곳). 로고는 data/zip_logos/<brand>.png(위키미디어 공용 퍼블릭 도메인·CC0), 없으면 이름 배지
  const BR = [['트레이더스', /^(이마트\s*)?트레이더스/], ['이마트', /^이마트/], ['홈플러스', /^홈플러스/], ['롯데마트', /^롯데마트/], ['코스트코', /^코스트코/], ['하이마트', /하이마트/]];
  const marts = new Map();
  for (const qn of ['이마트', '트레이더스', '홈플러스', '롯데마트', '코스트코', '하이마트']) for (const i of await search(qn)) {
    if (/24|에브리데이|익스프레스|편의점|슈퍼|노브랜드|일렉트로마트|입구|주차|창고|물류|정류장|정류소|코리아$|본사/.test(i.title + i.cat)) continue;
    const brand = BR.find(([, re]) => re.test(i.title))?.[0]; if (!brand) continue;
    const d = dist(i.lon, i.lat); if (d <= 2000 && (!marts.has(brand) || d < marts.get(brand).d)) marts.set(brand, { kind: '마트', brand, name: i.title, lon: i.lon, lat: i.lat, d });
  }
  ps.push(...[...marts.values()].sort((a, b) => a.d - b.d).slice(0, 2));
  // 줌: 단지·(3km 안) 가장 가까운 역·1km 안 학교·마트가 위 60% 상자에 들어오는 가장 큰 줌(14~16). 상자 밖 표시는 가장자리에 방향 화살표로(멀리 넓혀 글자가 뭉개지지 않게)
  const pts = [[lon, lat], ...(ol ? ol.r : []), ...(near ? [[st.lon, st.lat]] : []), ...ps.filter((p) => p.d <= 1000).map((p) => [p.lon, p.lat])], box = { x0: 70, x1: 730, y0: 75, y1: 280 };
  let z = 16, P;
  for (; z >= 14; z--) { P = pts.map(([x, y]) => project(x, y, z)); const w = Math.max(...P.map((p) => p[0])) - Math.min(...P.map((p) => p[0])), h = Math.max(...P.map((p) => p[1])) - Math.min(...P.map((p) => p[1])); if ((w <= box.x1 - box.x0 && h <= box.y1 - box.y0) || z === 14) break; }
  const ox = (Math.min(...P.map((p) => p[0])) + Math.max(...P.map((p) => p[0]))) / 2 - (box.x0 + box.x1) / 2, oy = (Math.min(...P.map((p) => p[1])) + Math.max(...P.map((p) => p[1]))) / 2 - (box.y0 + box.y1) / 2;
  const xy = (x, y) => { const [a, b] = project(x, y, z); return [a - ox, b - oy]; };
  const tiles = [];
  for (let ty = Math.floor(oy / T); ty <= Math.floor((oy + H) / T); ty++) for (let tx = Math.floor(ox / T); tx <= Math.floor((ox + W) / T); tx++) {
    const r = await fetch(`https://api.vworld.kr/req/wmts/1.0.0/${key}/Base/${z}/${ty}/${tx}.png`);
    if (!r.ok) return { skip: `지도 타일 HTTP ${r.status}` };
    tiles.push(`<img src="data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}" style="position:absolute;left:${tx * T - ox}px;top:${ty * T - oy}px;width:256px;height:256px">`);
  }
  const poly = ol ? ol.r.map(([x, y]) => xy(x, y)) : null;
  const [hx, hy] = poly ? [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length] : xy(lon, lat);
  const land = poly ? `<path d="${poly.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('')}Z" fill="rgba(255,216,77,.72)" stroke="#17212b" stroke-width="3.5" stroke-linejoin="round"/>`
    : `<circle cx="${hx}" cy="${hy}" r="30" fill="rgba(255,216,77,.3)" stroke="#17212b" stroke-width="2" stroke-dasharray="5 4"/><circle cx="${hx}" cy="${hy}" r="11" fill="#ffd84d" stroke="#17212b" stroke-width="4"/>`;
  // 역: 3km 안이면 실제 자리, 멀면 그 방향 지도 가장자리에 「가장 가까운 ○○역」
  const VIEW = { x0: 24, x1: 776, y0: 48, y1: 276 }, inView = ([x, y]) => x >= VIEW.x0 && x <= VIEW.x1 && y >= VIEW.y0 && y <= VIEW.y1;
  const toEdge = ([x, y]) => { const dx = x - hx, dy = y - hy, k = Math.min((dx > 0 ? VIEW.x1 - 60 - hx : hx - VIEW.x0 - 60) / Math.abs(dx || 1e-9), (dy > 0 ? VIEW.y1 - 6 - hy : hy - VIEW.y0 - 6) / Math.abs(dy || 1e-9)); return [hx + dx * k, hy + dy * k]; };
  const ARROW = (x, y) => '→↘↓↙←↖↑↗'[Math.round(((Math.atan2(y - hy, x - hx) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8];
  const spos = sts.map((x) => { const p = xy(x.lon, x.lat); return inView(p) ? p : toEdge(p); });
  const route = spos.map(([sx, sy], i) => `<line x1="${hx}" y1="${hy}" x2="${sx}" y2="${sy}" stroke="${i ? '#64748b' : '#1d4ed8'}" stroke-width="${i ? 5 : 6}" stroke-dasharray="1 11" stroke-linecap="round"/>`).join('');
  const rate = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8')).items.find((x) => x.no === no)?.rate;
  const stat = rate >= 0.05 ? `<div style="position:absolute;left:16px;top:14px;background:#17212b;border-radius:10px;padding:7px 13px"><div style="font-size:34px;font-weight:700;color:#ffd84d;line-height:1">−${Math.round(rate * 100)}%</div><div style="font-size:15px;color:#dfe6ee;margin-top:3px">주변 단지 실거래 대비</div></div>` : '';
  const tw = (t, f = 18) => [...String(t)].reduce((a, ch) => a + (/[가-힣]/.test(ch) ? f : f * 0.6), 0);
  const km = (d) => (d >= 1000 ? (d / 1000).toFixed(1) + 'km' : Math.round(d / 10) * 10 + 'm');
  // 칩은 점에서 단지 반대쪽으로 비켜 놓고, 겹치면 위아래로 민다(단지 이름·출처·숫자 상자 자리는 비워 둔다)
  const nw = Math.min(W - 20, name.length * 21 + 24), below = hy - 32 - 34 < 46, nx = Math.max(nw / 2 + 8, Math.min(W - nw / 2 - 8, hx)), ny = below ? hy + 49 : hy - 49; // 단지가 위쪽 끝이면 이름을 아래로
  const placed = [{ x: nx, y: ny, w: nw, h: 34 }, { x: hx, y: hy, w: 70, h: 70 }, { x: 640, y: 16, w: 330, h: 26 }, ...(stat ? [{ x: 100, y: 52, w: 180, h: 84 }] : [])];
  const hit = (c) => placed.some((o) => Math.abs(o.x - c.x) < (o.w + c.w) / 2 + 4 && Math.abs(o.y - c.y) < (o.h + c.h) / 2 + 2);
  // 빈자리 찾기: 원하는 중심(bx,by)에서 둘레를 20px씩 넓히며 16방향(위 40px~아래 290px, 좌우 6px 안). 멀리 밀리면 점까지 가는 가는 선을 긋는다
  const leaders = [];
  const findSpot = (bx, by, w, h) => {
    for (let r = 0; r <= 300; r += 20) for (let a = 0; a < (r ? 16 : 1); a++) {
      const t = { x: bx + r * Math.cos((a * Math.PI) / 8), y: by + r * 0.75 * Math.sin((a * Math.PI) / 8), w, h };
      if (t.x - w / 2 >= 6 && t.x + w / 2 <= W - 6 && t.y - h / 2 >= 40 && t.y + h / 2 <= 292 && !hit(t)) { placed.push(t); return t; }
    }
    return null;
  };
  const lead = (x, y, c) => { if (Math.hypot(c.x - x, c.y - y) > Math.max(c.w, c.h) / 2 + 30) leaders.push(`<line x1="${x}" y1="${y}" x2="${c.x}" y2="${c.y}" stroke="#334155" stroke-width="1.5" opacity=".6"/>`); };
  const chip = (x0, y0, text, sub, bg, inner = null, w0 = 0, fg = '#fff') => {
    const out = !inView([x0, y0]), arrow = out ? ARROW(x0, y0) : '', [x, y] = out ? toEdge([x0, y0]) : [x0, y0];
    if (arrow) { sub = arrow + ' ' + sub; }
    const dx = x - hx, dy = y - hy, len = Math.hypot(dx, dy) || 1, w = (w0 || tw(text) + tw(sub) + 34) + (arrow ? 14 : 0);
    // 점 바깥쪽부터 둘레를 넓혀 가며 빈자리를 찾고(지도 위 60% 안), 없으면 이 표시는 뺀다 — 칩이 겹쳐 읽히지 않는 것보다 낫다
    const bx = out ? x : x + (dx / len) * 34, by = out ? y : y + (dy / len) * 26;
    const c = findSpot(bx, by, w, 32);
    if (!c) return '';
    if (!out) lead(x, y, c);
    return `${out ? '' : '<!--dot-->'}<div style="position:absolute;left:${x - 7}px;top:${y - 7}px;display:${out ? 'none' : 'block'};width:14px;height:14px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div><div style="position:absolute;left:${c.x}px;top:${c.y}px;transform:translate(-50%,-50%);background:${bg};color:${fg};font-weight:700;font-size:18px;padding:3px 10px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid ${fg === '#fff' ? '#fff' : '#cbd5e1'};display:flex;align-items:center;gap:6px">${inner ?? esc(text)} <span style="font-weight:500;opacity:.9">${sub}</span></div>`;
  };
  const color = { 초: '#16a34a', 중: '#0d9488', 고: '#7c3aed', 마트: '#e11d48' };
  const logos = {};
  for (const m of ps.filter((p) => p.kind === '마트')) logos[m.brand] ??= await readFile(join(ROOT, 'data/zip_logos', ({ 이마트: 'emart', 홈플러스: 'homeplus', 롯데마트: 'lottemart', 코스트코: 'costco' }[m.brand] || 'none') + '.png')).then((b) => 'data:image/png;base64,' + b.toString('base64')).catch(() => null);
  // 역은 지하철 출입구 기둥 표지처럼: 짙은 올리브색 두 면 기둥(위에서 내려다본 v 모양), 면마다 노란 열차 표지 → 세로 역 이름 → 노선 배지, 기둥 밑에 거리(2026-11-08 사용자)
  const TRAIN = '<svg width="16" height="16" viewBox="0 0 26 26" style="display:block;flex:none"><rect width="26" height="26" fill="#f5c400"/><rect x="6" y="3.5" width="14" height="14.5" rx="2.5" fill="none" stroke="#3a3f32" stroke-width="2"/><rect x="8.5" y="6" width="9" height="4.5" fill="#3a3f32"/><circle cx="10" cy="14.3" r="1.4" fill="#3a3f32"/><circle cx="16" cy="14.3" r="1.4" fill="#3a3f32"/><path d="M8.5 18.5 6 22.5M17.5 18.5 20 22.5M7 21h12" stroke="#3a3f32" stroke-width="1.7" fill="none"/></svg>';
  const SK = 25, FW = 20, SKH = Math.round(FW * Math.tan((SK * Math.PI) / 180));
  const pillar = (x) => {
    if (!near) { // 3km 넘게 먼 역: 지도 왼쪽 위(숫자 상자 아래)에 방향과 거리만 — 기둥을 엉뚱한 자리에 세우지 않는다
      const t = `가장 가까운 ${x.name} ${ARROW(...xy(x.lon, x.lat))} ${km(x.d)}`, w = tw(t, 17) + x.lines.reduce((a, l) => a + lineW(l), 0) + 36, c = { x: 16 + w / 2, y: stat ? 118 : 30, w, h: 34 };
      while (hit(c) && c.y < 250) c.y += 40;
      placed.push(c);
      return `<div style="position:absolute;left:16px;top:${c.y - 17}px;height:34px;box-sizing:border-box;background:#fff;border:2px solid #17212b;border-radius:8px;padding:0 10px;display:flex;align-items:center;gap:6px;font-size:17px;font-weight:700;color:#17212b;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.3)">${x.lines.map((l) => lineBadge(l, x.op)).join('')}${esc(t)}</div>`;
    }
    const p0 = xy(x.lon, x.lat), out = !inView(p0), [px, py] = out ? toEdge(p0) : p0, label = x.name.replace(/역$/, '');
    const fs = label.length > 5 ? 10 : 13, fh = 3 + 16 + 3 + label.length * Math.ceil(fs * 1.2 + 1) + 3 + x.lines.length * 19 + 6, tag = `${out ? ARROW(...p0) + ' ' : ''}${km(x.d)}`, w = Math.max(FW * 2 + 4, tw(tag, 13) + 16), h = fh + SKH * 2 + 3 + 20;
    const by = Math.min(290, Math.max(40 + h, py)) - h / 2;
    let c = findSpot(px, by, w, h);
    // 점을 피하느라 역 방향과 엉뚱하게 멀어지면 점 위에 겹치는 쪽을 택한다(점은 기둥 밑에 깔린다)
    if (!c || Math.abs(c.x - px) > 170) {
      if (c) placed.splice(placed.indexOf(c), 1);
      for (const d of dots) placed.splice(placed.indexOf(d), 1);
      c = findSpot(px, by, w, h);
      placed.push(...dots);
    }
    if (!c) return '';
    if (!out) lead(px, py, { ...c, y: c.y + h / 2 });
    const top = c.y - h / 2;
    // 면 하나: 왼쪽 면은 오른쪽(접힌 모서리)을 축으로, 오른쪽 면은 왼쪽을 축으로 기울여 가운데 모서리가 아래로 내려온 v 모양
    // 위에서 내려다본 두 면 기둥(면 사이 130°): 뚜껑(마름모) + 왼쪽 면 + 오른쪽 면을 한 그림으로, 글씨는 똑바로 세워 얹는다
    const PW = FW * 2, FH = fh, PH = FH + SKH * 2, pt = (a) => a.map(([u, v]) => `${u},${v}`).join(' ');
    const body = `<svg width="${PW}" height="${PH}" style="position:absolute;left:0;top:0"><polygon points="${pt([[0, SKH], [FW, SKH * 2], [FW, SKH * 2 + FH], [0, SKH + FH]])}" fill="#5f6553"/><polygon points="${pt([[FW, SKH * 2], [PW, SKH], [PW, SKH + FH], [FW, SKH * 2 + FH]])}" fill="#484d3f"/><polygon points="${pt([[FW, 0], [0, SKH], [FW, SKH * 2], [PW, SKH]])}" fill="#8b917b" stroke="#3a3f32" stroke-width="1"/></svg>`;
    // 글씨·그림도 면 기울기대로: 왼쪽 면은 바깥(왼쪽) 모서리를 축으로 +25°, 오른쪽 면은 바깥(오른쪽) 모서리를 축으로 −25°
    const col = (left) => `<div style="width:${FW}px;height:${fh}px;box-sizing:border-box;transform:skewY(${left ? SK : -SK}deg);transform-origin:${left ? 'left' : 'right'} top;display:flex;flex-direction:column;align-items:center;padding:3px 0">${TRAIN}<div style="writing-mode:vertical-rl;text-orientation:upright;font-size:${fs}px;font-weight:700;color:#fff;letter-spacing:1px;margin:3px 0;white-space:nowrap">${esc(label)}</div><div style="display:flex;flex-direction:column;align-items:center;gap:3px">${x.lines.map((l) => lineBadge(l, x.op, true)).join('')}</div></div>`;
    return `${out ? '' : `<div style="position:absolute;left:${px - 6}px;top:${py - 6}px;width:12px;height:12px;border-radius:50%;background:#3a3f32;border:3px solid #fff"></div>`}
<div style="position:absolute;left:${c.x}px;top:${top}px;z-index:2;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 3px 5px rgba(0,0,0,.4))">
<div style="position:relative;width:${PW}px;height:${PH}px">${body}<div style="position:absolute;left:0;top:${SKH}px;display:flex">${col(true)}${col(false)}</div></div>
<div style="margin-top:3px;background:#3a3f32;color:#fff;font-size:13px;font-weight:700;padding:0 6px;border-radius:999px;white-space:nowrap">${tag}</div></div>`;
  };
  const stChip = (x) => pillar(x);
  // 마트는 캡슐 없이 로고(없으면 브랜드 이름 글자) 아래에 거리 — 지도 위에서 읽히게 흰 테두리 그림자(2026-11-08 사용자)
  const HALO = 'filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 3px #fff)';
  const martChip = (p) => {
    const p0 = xy(p.lon, p.lat), out = !inView(p0), [x, y] = out ? toEdge(p0) : p0, lg = logos[p.brand], tag = (out ? ARROW(...p0) + ' ' : '') + km(p.d);
    const w = lg ? 104 : p.brand.length * 22 + 10, h = 54;
    const c = findSpot(x, y - 30, w, h);
    if (!c) return '';
    if (!out) lead(x, y, c);
    const mark = lg ? `<img src="${lg}" style="height:28px;max-width:104px;object-fit:contain;display:block">` : `<div style="font-size:21px;font-weight:800;color:#e11d48;letter-spacing:-.02em">${esc(p.brand)}</div>`;
    return `${out ? '' : `<div style="position:absolute;left:${x - 6}px;top:${y - 6}px;width:12px;height:12px;border-radius:50%;background:#e11d48;border:3px solid #fff"></div>`}<div style="position:absolute;left:${c.x}px;top:${c.y}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:1px;${HALO}">${mark}<div style="font-size:16px;font-weight:700;color:#17212b">${tag}</div></div>`;
  };
  const rank = { 초: 0, 마트: 1, 중: 2, 고: 3 };
  // 기둥이 학교·마트 점을 덮지 않게, 역을 놓는 동안만 그 점 자리를 막아 둔다
  const dots = ps.map((p) => xy(p.lon, p.lat)).filter(inView).map(([x, y]) => ({ x, y, w: 12, h: 12 }));
  placed.push(...dots);
  const stHtml = sts.map((x) => stChip(x)).join('');
  for (const d of dots) placed.splice(placed.indexOf(d), 1);
  const chips = stHtml + [...ps].sort((a, b) => rank[a.kind] - rank[b.kind]).map((p) => { if (p.kind === '마트') return martChip(p); const [x, y] = xy(p.lon, p.lat); return chip(x, y, p.name, km(p.d), color[p.kind]); }).join('');
  const html = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap"><style>body{margin:0;width:${W}px;height:${H}px;overflow:hidden;position:relative;font-family:'IBM Plex Sans KR',sans-serif;background:#eef1f5}</style>
<div style="position:absolute;inset:0;filter:saturate(.85) brightness(1.02)">${tiles.join('')}</div><div style="position:absolute;inset:0;background:rgba(255,255,255,.18)"></div>
<svg width="${W}" height="${H}" style="position:absolute;left:0;top:0">${route}${land}</svg><!--chips-->
<div style="position:absolute;left:${nx}px;top:${ny}px;transform:translate(-50%,-50%);background:#17212b;color:#ffd84d;font-weight:700;font-size:20px;padding:4px 12px;border-radius:8px;white-space:nowrap">${esc(name)}</div>${stat}
<div style="position:absolute;right:8px;top:8px;font-size:13px;color:#33404d;background:rgba(255,255,255,.85);padding:1px 7px;border-radius:4px">지도 브이월드 · 경계·역 © OpenStreetMap · 직선거리</div>`;
  const { chromium } = await import('playwright'), b = await chromium.launch();
  try { const p = await b.newPage({ viewport: { width: W, height: H } }); await p.setContent(html.replace('<!--chips-->', `<svg width="${W}" height="${H}" style="position:absolute;left:0;top:0">${leaders.join('')}</svg>${chips}`)); await p.waitForTimeout(1000); await p.screenshot({ path: out, type: 'jpeg', quality: 86 }); } finally { await b.close(); }
  return { zoom: z, outline: ol ? ol.name || '이름 없는 면' : null, station: sts.map((x) => `${x.name}(${x.lines.join('·')}) ${x.d}m`).join(', '), pois: ps.map((x) => `${x.name} ${x.d}m`) };
}
// 노선 배지: 「3호선」은 노선색 동그라미에 숫자(운영사 이름으로 지역 구분), 이름 노선은 노선색 알약 — 2026-11-08 사용자: 몇 호선인지 한눈에
const LINE = { 서울: ['#0052A4', '#00A84D', '#EF7C1C', '#00A5DE', '#996CAC', '#CD7C2F', '#747F00', '#E6186C', '#BDB092'], 부산: ['#F06A00', '#81BF48', '#BB8C00', '#217DCB'], 인천: ['#7CA8D5', '#ED8B00'], 대구: ['#D93F5C', '#00AA80', '#FFB100'], 광주: ['#009088'], 대전: ['#007448'] };
const NAMED = [[/수인|분당/, '#F5A200', '수인분당'], [/신분당/, '#D4003B', '신분당'], [/경의|중앙/, '#77C4A3', '경의중앙'], [/공항/, '#0090D2', '공항철도'], [/경춘/, '#0C8E72', '경춘'], [/경강/, '#003DA5', '경강'], [/서해/, '#8FC31F', '서해'], [/동해/, '#0054A6', '동해'], [/GTX-?A/i, '#9A6292', 'GTX-A'], [/우이/, '#B0CE18', '우이신설'], [/신림/, '#6789CA', '신림'], [/김포/, '#AD8605', '김포골드'], [/의정부/, '#FDA600', '의정부'], [/에버라인|용인/, '#509F22', '에버라인'], [/김해/, '#8652A1', '김해']];
function lineColor(l = '', op = '') {
  const n = (l.match(/^(\d)호선$/) || [])[1];
  if (n) return LINE[Object.keys(LINE).find((k) => op.includes(k)) || '서울'][n - 1] || '#555';
  return (NAMED.find(([re]) => re.test(l)) || [0, '#555'])[1];
}
function lineBadge(l, op = '', ring = false) {
  const n = (l.match(/^(\d)호선$/) || [])[1], c = lineColor(l, op), b = ring ? 'border:1.5px solid #fff;' : '';
  if (n) return `<span style="flex:none;width:${ring ? 16 : 26}px;height:${ring ? 16 : 26}px;box-sizing:border-box;${b}border-radius:50%;background:${c};color:#fff;font-size:${ring ? 10 : 15}px;font-weight:700;display:inline-flex;align-items:center;justify-content:center">${n}</span>`;
  const t = (NAMED.find(([re]) => re.test(l)) || [0, 0, l.replace(/선$/, '')])[2];
  return ring ? `<span style="flex:none;width:18px;box-sizing:border-box;${b}background:${c};color:#fff;font-size:7px;font-weight:700;line-height:1.05;padding:2px 0;border-radius:4px;text-align:center;word-break:keep-all">${t.length > 2 ? t.slice(0, 2) + '<br>' + t.slice(2, 4) : t}</span>`
    : `<span style="flex:none;background:${c};color:#fff;font-size:13px;font-weight:700;padding:2px 7px;border-radius:999px">${t}</span>`;
}
const lineW = (l) => (/^\d호선$/.test(l) ? 30 : (NAMED.find(([re]) => re.test(l)) || [0, 0, l])[2].length * 13 + 20);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const shortName = (s) => String(s || '').replace(/\s*(입주자\s*모집|무순위|임의공급|공고).*$/, '').replace(/\s+[A-Z]*\d+[A-Z0-9-]*\s*(블록|BL)$/i, '').trim();
// 입지 지도를 만들어 zip_views.json에 넣는다(공식 그림이 있으면 건드리지 않는다)
export async function mapFor(no, index) {
  if ((index[no]?.file && !index[no]?.map) || index[no]?.mapSkip) return null; // 공식 그림이 있거나, 전에 그릴 수 없다고 본 공고(지번 없는 주소 등)는 매일 다시 보지 않는다
  await mkdir(DIR, { recursive: true });
  const r = await siteMap(no, join(DIR, `${no}.jpg`)).catch((e) => ({ skip: e.message, transient: true }));
  if (r.skip) { if (!r.transient && !/API_BUDGET|HTTP/.test(r.skip)) index[no] = { ...index[no], mapSkip: r.skip }; return r; }
  index[no] = { file: `data/zip_views/${no}.jpg`, homepage: index[no]?.homepage || null, page: 'https://map.vworld.kr/', label: '입지 지도', site: '브이월드 · OpenStreetMap', map: true, at: new Date().toISOString().slice(0, 10) };
  return r;
}

if (process.argv[1]?.endsWith('views.mjs') && process.argv.includes('--map')) {
  const index = await loadViews();
  for (const no of process.argv[process.argv.indexOf('--map') + 1].split(',')) { const r = await mapFor(no, index); console.log(r?.skip ? `✗ ${no} ${r.skip}` : `✓ ${no} ${JSON.stringify(r)}`); }
  await writeFile(INDEX, JSON.stringify(index, null, 1));
} else if (process.argv[1]?.endsWith('views.mjs') && process.argv.includes('--add')) {
  const rest = process.argv.slice(process.argv.indexOf('--add') + 1), cut = rest.findIndex((a) => a.startsWith('--'));
  const [no, file, page, focus = 'center'] = cut < 0 ? rest : rest.slice(0, cut);
  const flag = (k) => (rest.includes(k) ? rest[rest.indexOf(k) + 1] : null), label = flag('--label'), site = flag('--site'), zoom = Number(flag('--zoom') || 1);
  const reg = JSON.parse(await readFile(join(ROOT, 'data/zip_registry.json'), 'utf8')), index = await loadViews();
  await mkdir(DIR, { recursive: true });
  await frame(file, join(DIR, `${no}.jpg`), focus, zoom);
  index[no] = { file: `data/zip_views/${no}.jpg`, homepage: reg[no] ? await homepageOf(reg[no]) : null, page, from: '공식 출처에서 받음', ...(label && { label }), ...(site && { site }), at: new Date().toISOString().slice(0, 10) };
  await writeFile(INDEX, JSON.stringify(index, null, 1));
  console.log('✓', no, index[no].homepage);
} else if (process.argv[1]?.endsWith('views.mjs')) {
  const reg = JSON.parse(await readFile(join(ROOT, 'data/zip_registry.json'), 'utf8'));
  const oi = process.argv.indexOf('--only'), only = oi > 0 ? process.argv[oi + 1].split(',') : null, force = process.argv.includes('--force');
  const index = await loadViews();
  await mkdir(DIR, { recursive: true });
  for (const r of Object.values(reg).filter((x) => x.source !== 'sh')) {
    if (only && !only.includes(r.no)) continue;
    if (!force && index[r.no]) continue; // 한 번 본 공고(그림 있음·못 찾음·틀려서 뺌)는 다시 안 본다
    const out = join(DIR, `${r.no}.jpg`), tmp = join(DIR, `_${r.no}`);
    let raw = null, page = null, from = null;
    const homepage = await homepageOf(r);
    // 자동은 홈페이지의 조감도·투시도 메뉴에서만 — 공고문 PDF·분석 글 그림은 글자 쪽이 잡힌 적이 있어(2026-10-29 확인) 쓰지 않는다. 못 찾으면 --add로 사람이 캡처
    if (homepage) {
      const { findPlans } = await import('../posts/floorplan.mjs');
      const res = await findPlans(homepage, [], tmp, { name: r.name });
      const a = res.images?.find((x) => x.key === 'aerial');
      if (a) { raw = join(ROOT, a.file); page = a.source; from = '분양 홈페이지'; }
    }
    if (raw) {
      await frame(raw, out);
      index[r.no] = { file: `data/zip_views/${r.no}.jpg`, homepage, page, from, at: new Date().toISOString().slice(0, 10) };
      console.log(`✓ ${r.no} ${r.name} · ${from}`);
      console.log('  → 그림을 열어 조감도가 맞는지 확인하세요(틀리면 { skip } 으로)');
    } else { index[r.no] = { tried: new Date().toISOString().slice(0, 10), homepage }; console.log(`✗ ${r.no} ${r.name} · 조감도 못 찾음 (${homepage || '홈페이지 없음'}) — 공식 홈페이지에서 캡처해 --add로`); }
    await rm(tmp, { recursive: true, force: true });
  }
  await writeFile(INDEX, JSON.stringify(index, null, 1));
}

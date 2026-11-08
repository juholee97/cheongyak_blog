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
  const oj = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'user-agent': 'auleezip-map/1.0 (auleezip.com)', 'content-type': 'application/x-www-form-urlencoded' } }).then((r) => r.json()).catch(() => ({}));
  const ringOf = (e) => (e.type === 'way' ? (e.geometry || []).map((p) => [p.lon, p.lat]) : (e.members || []).filter((m) => m.role === 'outer' && m.geometry).flatMap((m) => m.geometry.map((p) => [p.lon, p.lat])));
  const inside = (r) => { let c = false; for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const [xi, yi] = r[i], [xj, yj] = r[k]; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const cen = (r) => [r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length];
  const norm = (s) => String(s || '').replace(/\s|아파트|단지|\(.*?\)/g, ''), key4 = norm(name).slice(0, 4);
  const els = (oj.elements || []).map((e) => ({ name: e.tags?.name, use: e.tags?.landuse, r: ringOf(e) })).filter((e) => e.r.length > 3);
  const ol = els.find((e) => e.name && norm(e.name).includes(key4)) || els.find((e) => !e.name && inside(e.r))
    || els.filter((e) => !e.name && e.use === 'construction').map((e) => ({ ...e, d: meters(lon, lat, ...cen(e.r)) })).filter((e) => e.d <= 200).sort((a, b) => a.d - b.d)[0] || null;
  // 가까운 역(OSM 전국 철도역)
  // 8km 안 가장 가까운 역 + 거리 차이가 크지 않은(가장 가까운 역의 1.6배·+800m 안, 3km 안) 다른 호선 역(최대 3곳) — 2026-11-08 사용자
  const all = JSON.parse(await readFile(join(ROOT, 'posts/stations.json'), 'utf8')).stations.map((s) => ({ name: s.name.endsWith('역') ? s.name : s.name + '역', op: s.operator || '', lines: s.lines || [], lon: s.lon, lat: s.lat, d: meters(lon, lat, s.lon, s.lat) })).sort((a, b) => a.d - b.d);
  const sts = all[0]?.d <= 8000 ? [all[0]] : [], seen = new Set(all[0]?.lines);
  if (all[0]?.d <= 3000) for (const s of all.slice(1)) { if (s.d > Math.min(3000, Math.max(all[0].d * 1.6, all[0].d + 800)) || sts.length >= 3) break; if (s.lines.some((l) => !seen.has(l)) && !sts.some((x) => x.name === s.name)) { sts.push(s); s.lines.forEach((l) => seen.add(l)); } }
  const st = sts[0], near = st && st.d <= 3000;
  // 학교·대형마트(브이월드 검색)
  const search = async (query, d = 0.03) => { useApi('vworld'); const bbox = [lon - d * 1.25, lat - d, lon + d * 1.25, lat + d].join(','); const j = await fetch(`https://api.vworld.kr/req/search?service=search&request=search&version=2.0&crs=EPSG:4326&bbox=${bbox}&size=100&query=${encodeURIComponent(query)}&type=place&format=json&key=${key}`).then((r) => r.json()).catch(() => ({})); return (j.response?.result?.items || []).map((i) => ({ title: i.title, cat: i.category || '', lon: +i.point.x, lat: +i.point.y })); };
  const ps = [];
  for (const [lv, ab] of [['초등학교', '초'], ['중학교', '중'], ['고등학교', '고']]) {
    const s = (await search(lv, 0.018)).filter((i) => new RegExp(`교육부 > ${lv}$`).test(i.cat) && !/입구|병설|유치원|정류장/.test(i.title)).map((i) => ({ ...i, d: meters(lon, lat, i.lon, i.lat) })).filter((i) => i.d <= 1500).sort((a, b) => a.d - b.d)[0];
    if (s) { const base = s.title.replace(/^서울(?=.)/, '').replace(/(초등학교|중학교|고등학교|초교|중교|고교)$/, ''); ps.push({ kind: ab, name: base === s.title ? s.title : base + ab, lon: s.lon, lat: s.lat, d: s.d }); }
  }
  // 대형마트·가전(2km 안, 브랜드마다 가장 가까운 곳, 가까운 2곳). 로고는 data/zip_logos/<brand>.png(위키미디어 공용 퍼블릭 도메인·CC0), 없으면 이름 배지
  const BR = [['트레이더스', /^(이마트\s*)?트레이더스/], ['이마트', /^이마트/], ['홈플러스', /^홈플러스/], ['롯데마트', /^롯데마트/], ['코스트코', /^코스트코/], ['하이마트', /하이마트/]];
  const marts = new Map();
  for (const qn of ['이마트', '트레이더스', '홈플러스', '롯데마트', '코스트코', '하이마트']) for (const i of await search(qn)) {
    if (/24|에브리데이|익스프레스|편의점|슈퍼|노브랜드|일렉트로마트|입구|주차|창고|물류|정류장|정류소|코리아$|본사/.test(i.title + i.cat)) continue;
    const brand = BR.find(([, re]) => re.test(i.title))?.[0]; if (!brand) continue;
    const d = meters(lon, lat, i.lon, i.lat); if (d <= 2000 && (!marts.has(brand) || d < marts.get(brand).d)) marts.set(brand, { kind: '마트', brand, name: i.title, lon: i.lon, lat: i.lat, d });
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
  const km = (d) => (d >= 1000 ? (d / 1000).toFixed(1) + 'km' : Math.round(d / 10) * 10 + 'm');
  // 칩은 점에서 단지 반대쪽으로 비켜 놓고, 겹치면 위아래로 민다(단지 이름·출처·숫자 상자 자리는 비워 둔다)
  const nw = Math.min(W - 20, name.length * 21 + 24), below = hy - 32 - 34 < 46, nx = Math.max(nw / 2 + 8, Math.min(W - nw / 2 - 8, hx)), ny = below ? hy + 49 : hy - 49; // 단지가 위쪽 끝이면 이름을 아래로
  const placed = [{ x: nx, y: ny, w: nw, h: 34 }, { x: hx, y: hy, w: 70, h: 70 }, { x: 640, y: 16, w: 330, h: 26 }, ...(stat ? [{ x: 100, y: 52, w: 180, h: 84 }] : [])];
  const hit = (c) => placed.some((o) => Math.abs(o.x - c.x) < (o.w + c.w) / 2 + 4 && Math.abs(o.y - c.y) < (o.h + c.h) / 2 + 2);
  const chip = (x0, y0, text, sub, bg, inner = null, w0 = 0, fg = '#fff') => {
    const out = !inView([x0, y0]), arrow = out ? ARROW(x0, y0) : '', [x, y] = out ? toEdge([x0, y0]) : [x0, y0];
    if (arrow) { sub = arrow + ' ' + sub; }
    const dx = x - hx, dy = y - hy, len = Math.hypot(dx, dy) || 1, w = (w0 || (text.length + sub.length) * 12 + 30) + (arrow ? 14 : 0);
    // 점 바깥쪽부터 둘레를 넓혀 가며 빈자리를 찾고(지도 위 60% 안), 없으면 이 표시는 뺀다 — 칩이 겹쳐 읽히지 않는 것보다 낫다
    const bx = out ? x : x + (dx / len) * 34, by = out ? y : y + (dy / len) * 26;
    let c = null;
    for (const r of [0, 30, 60, 95, 130]) { for (let a = 0; a < 8 && !c; a++) { const t = { x: bx + r * Math.cos((a * Math.PI) / 4), y: by + r * 0.7 * Math.sin((a * Math.PI) / 4), w, h: 32 }; if (t.x >= w / 2 + 6 && t.x <= W - w / 2 - 6 && t.y >= 46 && t.y <= 282 && !hit(t)) c = t; if (!r) break; } if (c) break; }
    if (!c) return '';
    placed.push(c);
    return `${out ? '' : '<!--dot-->'}<div style="position:absolute;left:${x - 7}px;top:${y - 7}px;display:${out ? 'none' : 'block'};width:14px;height:14px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div><div style="position:absolute;left:${c.x}px;top:${c.y}px;transform:translate(-50%,-50%);background:${bg};color:${fg};font-weight:700;font-size:18px;padding:3px 10px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.35);border:2px solid ${fg === '#fff' ? '#fff' : '#cbd5e1'};display:flex;align-items:center;gap:6px">${inner ?? esc(text)} <span style="font-weight:500;opacity:.9">${sub}</span></div>`;
  };
  const color = { 초: '#16a34a', 중: '#0d9488', 고: '#7c3aed', 마트: '#e11d48' };
  const logos = {};
  for (const m of ps.filter((p) => p.kind === '마트')) logos[m.brand] ??= await readFile(join(ROOT, 'data/zip_logos', ({ 이마트: 'emart', 홈플러스: 'homeplus', 롯데마트: 'lottemart', 코스트코: 'costco' }[m.brand] || 'none') + '.png')).then((b) => 'data:image/png;base64,' + b.toString('base64')).catch(() => null);
  const stChip = (x, i) => { const t = (near ? '' : '가장 가까운 ') + x.name; return chip(...xy(x.lon, x.lat), t, km(x.d), '#fff', `${x.lines.map((l) => lineBadge(l, x.op)).join('')}<span>${esc(t)}</span>`, (t.length + km(x.d).length) * 12 + x.lines.reduce((a, l) => a + lineW(l), 0) + 40, '#17212b'); };
  const martChip = (p) => { const [x, y] = xy(p.lon, p.lat), lg = logos[p.brand]; return lg ? chip(x, y, p.brand, km(p.d), '#fff', `<img src="${lg}" style="height:22px;max-width:96px;object-fit:contain">`, 96 + km(p.d).length * 12 + 40, '#17212b') : chip(x, y, p.brand, km(p.d), color.마트); };
  const chips = sts.map(stChip).join('') + ps.map((p) => { if (p.kind === '마트') return martChip(p); const [x, y] = xy(p.lon, p.lat); return chip(x, y, p.name, km(p.d), color[p.kind]); }).join('');
  const html = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;700&display=swap"><style>body{margin:0;width:${W}px;height:${H}px;overflow:hidden;position:relative;font-family:'IBM Plex Sans KR',sans-serif;background:#eef1f5}</style>
<div style="position:absolute;inset:0;filter:saturate(.85) brightness(1.02)">${tiles.join('')}</div><div style="position:absolute;inset:0;background:rgba(255,255,255,.18)"></div>
<svg width="${W}" height="${H}" style="position:absolute;left:0;top:0">${route}${land}</svg>${chips}
<div style="position:absolute;left:${nx}px;top:${ny}px;transform:translate(-50%,-50%);background:#17212b;color:#ffd84d;font-weight:700;font-size:20px;padding:4px 12px;border-radius:8px;white-space:nowrap">${esc(name)}</div>${stat}
<div style="position:absolute;right:8px;top:8px;font-size:13px;color:#33404d;background:rgba(255,255,255,.85);padding:1px 7px;border-radius:4px">지도 브이월드 · 경계·역 © OpenStreetMap · 직선거리</div>`;
  const { chromium } = await import('playwright'), b = await chromium.launch();
  try { const p = await b.newPage({ viewport: { width: W, height: H } }); await p.setContent(html); await p.waitForTimeout(1000); await p.screenshot({ path: out, type: 'jpeg', quality: 86 }); } finally { await b.close(); }
  return { zoom: z, outline: ol ? ol.name || '이름 없는 면' : null, station: sts.map((x) => `${x.name}(${x.lines.join('·')}) ${x.d}m`).join(', '), pois: ps.map((x) => `${x.name} ${x.d}m`) };
}
// 노선 배지: 「3호선」은 노선색 동그라미에 숫자(운영사 이름으로 지역 구분), 이름 노선은 노선색 알약 — 2026-11-08 사용자: 몇 호선인지 한눈에
const LINE = { 서울: ['#0052A4', '#00A84D', '#EF7C1C', '#00A5DE', '#996CAC', '#CD7C2F', '#747F00', '#E6186C', '#BDB092'], 부산: ['#F06A00', '#81BF48', '#BB8C00', '#217DCB'], 인천: ['#7CA8D5', '#ED8B00'], 대구: ['#D93F5C', '#00AA80', '#FFB100'], 광주: ['#009088'], 대전: ['#007448'] };
const NAMED = [[/수인|분당/, '#F5A200', '수인분당'], [/신분당/, '#D4003B', '신분당'], [/경의|중앙/, '#77C4A3', '경의중앙'], [/공항/, '#0090D2', '공항철도'], [/경춘/, '#0C8E72', '경춘'], [/경강/, '#003DA5', '경강'], [/서해/, '#8FC31F', '서해'], [/동해/, '#0054A6', '동해'], [/GTX-?A/i, '#9A6292', 'GTX-A'], [/우이/, '#B0CE18', '우이신설'], [/신림/, '#6789CA', '신림'], [/김포/, '#AD8605', '김포골드'], [/의정부/, '#FDA600', '의정부'], [/에버라인|용인/, '#509F22', '에버라인'], [/김해/, '#8652A1', '김해']];
function lineBadge(l, op = '') {
  const n = (l.match(/^(\d)호선$/) || [])[1];
  if (n) { const reg = Object.keys(LINE).find((k) => op.includes(k)) || '서울', c = LINE[reg][n - 1] || '#555'; return `<span style="flex:none;width:24px;height:24px;border-radius:50%;background:${c};color:#fff;font-size:15px;font-weight:700;display:inline-flex;align-items:center;justify-content:center">${n}</span>`; }
  const [, c, t] = NAMED.find(([re]) => re.test(l)) || [0, '#555', l.replace(/선$/, '')];
  return `<span style="flex:none;background:${c};color:#fff;font-size:13px;font-weight:700;padding:2px 7px;border-radius:999px">${t}</span>`;
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

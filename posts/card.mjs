// 주간 글용 그림(1200×630 PNG): 주간 썸네일 + 단지별 일정 카드. 조감도 대신 직접 그린 그림이라 저작권 걱정이 없다.
// node posts/card.mjs drafts/2026-10-26_weekly.json [--only 3]   → drafts/2026-10-26_weekly.cards/*.png
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build, md, full, updatedLabel } from './weekly.mjs';

// 디자인 시스템 「우리의 청약달력」 토큰: 단계 색은 접수(특공·1·2순위) / 당첨자 발표 / 계약 세 가지 뜻으로만 쓴다
const T = { brand: '#0b4fc4', ink: '#1c1f24', muted: '#4b5260', panel: '#f3f4f7', line: '#e3e6ec', receipt: '#0a7a5c', announce: '#b3261e', contract: '#4a4fa0' };
const PH = [
  { k: 'sp', label: '특별공급', c: T.receipt },
  { k: 'p1', label: '1순위', c: T.receipt },
  { k: 'p2', label: '2순위', c: T.receipt },
  { k: 'win', label: '당첨자 발표', c: T.announce },
  { k: 'con', label: '계약', c: T.contract },
];
// V06 Region Map: 17개 시·도를 실제 위치에 가깝게 놓은 4×5 타일, 진하기 5단계(0 / 1 / 2 / 3–4 / 5+)
const MAP = ['인천', '서울', '경기', '강원', '충남', '세종', '충북', '경북', '전북', '대전', '대구', '울산', '광주', '전남', '경남', '부산', '제주'];
const TILE = [['#eef1f5', '#5f687a'], ['#d3e2fb', '#0b2557'], ['#93b8f4', '#0b2557'], ['#2f67d8', '#ffffff'], ['#0b3a96', '#ffffff']];
const level = (n) => (n >= 5 ? 4 : n >= 3 ? 3 : n);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mdKo = (s) => `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일`;

const BASE = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap">
<style>
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;font-family:'Noto Sans KR',sans-serif;color:${T.ink};-webkit-font-smoothing:antialiased}
.card{width:1200px;height:630px;background:#fff;display:flex;flex-direction:column;position:relative;overflow:hidden}
.brand{display:flex;align-items:center;gap:12px;font-size:21px;font-weight:700}
.mark{width:36px;height:36px;border-radius:9px;background:${T.brand};color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900}
.foot{display:flex;justify-content:space-between;align-items:center;padding:0 64px;height:64px;border-top:1px solid ${T.line};font-size:17px;color:${T.muted}}
.foot b{color:${T.brand}}
</style></head><body>`;

// 주간 썸네일 = 디자인 시스템 V06 Region Map (왼쪽 제목·기간·단계별 수, 오른쪽 시·도 타일 지도)
export function weeklyHtml(w) {
  const stat = (label, n, c) => `<div style="width:184px;border-top:6px solid ${c};padding-top:12px"><div style="font-size:20px;font-weight:700;color:${T.muted}">${label}</div><div style="font-size:68px;font-weight:900;line-height:1.05;letter-spacing:-0.04em;color:${c}">${n}<small style="font-size:22px;margin-left:4px;color:${T.ink}">곳</small></div></div>`;
  const tiles = MAP.map((r) => {
    const n = w.facts.regions[r] || 0, [bg, fg] = TILE[level(n)];
    return `<div style="border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;justify-content:space-between;background:${bg};color:${fg}"><span style="font-size:18px;font-weight:700">${r}</span><b style="font-size:34px;font-weight:900;line-height:1;align-self:flex-end">${n || ''}</b></div>`;
  }).join('');
  const legend = TILE.map(([bg], i) => `<i style="display:inline-block;width:16px;height:16px;border-radius:4px;margin-left:6px;background:${bg}"></i>${['0', '1', '2', '3–4', '5+'][i]}`).join('');
  return `${BASE}<div class="card" style="padding:52px 64px">
  <div style="width:600px">
    <div class="brand"><span class="mark">우</span>우리의 청약달력</div>
    <h1 style="margin:30px 0 0;font-size:84px;font-weight:900;line-height:1.04;letter-spacing:-0.05em">이번 주<br>청약 일정</h1>
    <p style="margin:16px 0 0;font-size:30px;font-weight:700;color:${T.brand}">${mdKo(w.start)} ~ ${mdKo(w.end)}</p>
    <div style="display:flex;gap:16px;margin-top:38px">${stat('접수', w.facts.receipt, T.receipt)}${stat('당첨자 발표', w.facts.win, T.announce)}${stat('계약', w.facts.con, T.contract)}</div>
  </div>
  <div style="position:absolute;right:64px;top:28px;display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:${T.muted}"><em style="font-style:normal;margin-right:6px">지역별 접수 곳 수</em>${legend}</div>
  <div style="position:absolute;right:64px;top:62px;display:grid;grid-template-columns:repeat(4,92px);grid-auto-rows:92px;gap:8px">${tiles}</div>
  <p style="position:absolute;left:64px;bottom:44px;margin:0;font-size:16px;color:${T.muted}">기준 ${updatedLabel(w.updatedAt)} · 출처 청약홈(한국부동산원)<b style="color:${T.brand};margin-left:10px">aulee.tistory.com</b></p>
</div></body></html>`;
}

export function itemHtml(it, w) {
  const inWeek = (p) => p.date <= w.end && (p.end || p.date) >= w.start;
  const steps = PH.map((ph) => ({ ph, p: it.phases.find((x) => x.k === ph.k) })).filter((s) => s.p);
  const lab = (s) => (s.ph.k === 'p1' && it.kind !== 'APT' ? '접수' : s.ph.label);
  const facts = [
    ['공급', it.units ? `${it.units.toLocaleString()}세대` : '-'],
    it.pricePerPyeong ? ['분양가(3.3㎡)', `${it.pricePerPyeong.toLocaleString()}만원`] : null,
    ['모집공고', it.noticeDate ? full(it.noticeDate) : '-'],
  ].filter(Boolean);
  const timeline = steps.map((s, i) => {
    const hot = inWeek(s.p);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;position:relative">
  ${i ? `<span style="position:absolute;top:15px;right:50%;width:100%;height:4px;background:${T.line};z-index:0"></span>` : ''}
  <span style="width:34px;height:34px;border-radius:17px;background:${hot ? s.ph.c : '#fff'};border:4px solid ${s.ph.c};z-index:1"></span>
  <span style="font-size:22px;font-weight:900;color:${s.ph.c};white-space:nowrap">${lab(s)}</span>
  <span style="font-size:22px;font-weight:${hot ? 900 : 500};color:${hot ? T.ink : T.muted};white-space:nowrap">${s.p.end ? `${s.p.date.slice(5).replace('-', '.')}~${s.p.end.slice(5).replace('-', '.')}` : md(s.p.date)}</span>
  ${hot ? `<span style="font-size:17px;font-weight:700;color:#fff;background:${T.brand};border-radius:999px;padding:3px 12px">이번 주</span>` : '<span style="height:27px"></span>'}
</div>`;
  }).join('');
  return `${BASE}<div class="card">
<div style="flex:1;padding:44px 64px 30px;display:flex;flex-direction:column;gap:20px">
  <div style="display:flex;align-items:center;gap:12px;font-size:22px;font-weight:700;color:${T.muted}">
    <span style="padding:5px 16px;border-radius:999px;background:#eaf1fd;border:1px solid #b9cff5;color:#0a3a91">${esc(it.kind)}</span>${esc([it.region, it.district].filter(Boolean).join(' '))}
    <span style="margin-left:auto;color:${T.ink}" class="brand"><span class="mark">우</span>우리의 청약달력</span>
  </div>
  <div style="font-size:${it.name.length > 18 ? 52 : 64}px;font-weight:900;letter-spacing:-0.05em;line-height:1.12;word-break:keep-all">${esc(it.name)}</div>
  <div style="display:flex;gap:14px">${facts.map(([k, v]) => `<div style="background:${T.panel};border-radius:16px;padding:12px 22px"><span style="font-size:19px;color:${T.muted};font-weight:700">${k}</span> <span style="font-size:28px;font-weight:900;margin-left:6px">${v}</span></div>`).join('')}</div>
  <div style="margin-top:auto;border-top:1px solid ${T.line};padding-top:18px">
    <div style="font-size:19px;font-weight:700;color:${T.muted};margin-bottom:16px">청약 일정 · 채워진 점 = 이번 주(${md(w.start)}~${md(w.end)})</div>
    <div style="display:flex">${timeline}</div>
  </div>
</div>
<div class="foot"><span>입주자모집공고 기준 · 출처 청약홈(한국부동산원)</span><b>aulee.tistory.com</b></div></div></body></html>`;
}

export async function renderPngs(pages, outDir) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await mkdir(outDir, { recursive: true });
  const files = [];
  for (const { name, html } of pages) {
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const f = `${outDir}/${name}.png`;
    await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1200, height: 630 } });
    files.push(f);
  }
  await browser.close();
  return files;
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('사용: node posts/card.mjs drafts/<월요일>_weekly.json [--only N]');
  const draft = JSON.parse(await readFile(path, 'utf8'));
  const data = JSON.parse(await readFile(path.replace(/\.json$/, '.data.json'), 'utf8'));
  const w = build(data, draft.week.start);
  const i = process.argv.indexOf('--only');
  const items = i > 0 ? w.receipt.slice(0, +process.argv[i + 1]) : w.receipt;
  const pages = [{ name: '00_weekly', html: weeklyHtml(w) }, ...items.map(({ it }, n) => ({ name: `${String(n + 1).padStart(2, '0')}_${it.id}`, html: itemHtml(it, w) }))];
  const files = await renderPngs(pages, path.replace(/\.json$/, '.cards'));
  console.log(files.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

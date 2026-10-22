// 주간 글용 그림(1200×630 PNG): 주간 썸네일 + 단지별 일정 카드. 조감도 대신 직접 그린 그림이라 저작권 걱정이 없다.
// node posts/card.mjs drafts/2026-10-26_weekly.json [--only 3]   → drafts/2026-10-26_weekly.cards/*.png
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build, md, full, updatedLabel } from './weekly.mjs';

const PH = [
  { k: 'sp', label: '특별공급', c: '#0a4ec2' },
  { k: 'p1', label: '1순위', c: '#00745f' },
  { k: 'p2', label: '2순위', c: '#9a5a00' },
  { k: 'win', label: '당첨발표', c: '#b3261e' },
  { k: 'con', label: '계약', c: '#4b4f9c' },
];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mdKo = (s) => `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일`;

const BASE = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;font-family:Pretendard,sans-serif;color:#1e2124;letter-spacing:-0.02em;font-feature-settings:'tnum'}
.card{width:1200px;height:630px;background:#fff;display:flex;flex-direction:column;position:relative;overflow:hidden}
.top{height:14px;background:#0f2557}
.brand{display:flex;align-items:center;gap:12px;font-size:22px;font-weight:700;color:#464c53}
.mark{width:40px;height:40px;border-radius:9px;background:#0a4ec2;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800}
.foot{display:flex;justify-content:space-between;align-items:center;padding:0 64px;height:64px;background:#f4f6f9;border-top:1px solid #e4e8ee;font-size:19px;color:#464c53}
.foot b{color:#0a4ec2}
</style></head><body>`;

export function weeklyHtml(w) {
  const chips = Object.entries(w.facts.regions).sort((a, b) => b[1] - a[1]).map(([r, n]) => `<span style="padding:8px 16px;border-radius:999px;background:#eef3fc;color:#0a4ec2;border:1px solid #a9c1ee;font-weight:700">${esc(r)} ${n}</span>`).join('');
  const stat = (label, n, c) => `<div style="flex:1;background:#f4f6f9;border-radius:18px;padding:22px 28px"><div style="font-size:24px;font-weight:700;color:#464c53">${label}</div><div style="font-size:64px;font-weight:800;color:${c};line-height:1.1">${n}<span style="font-size:30px;color:#464c53;margin-left:6px">곳</span></div></div>`;
  return `${BASE}<div class="card"><div class="top"></div>
<div style="flex:1;padding:44px 64px 36px;display:flex;flex-direction:column;gap:22px">
  <div class="brand"><span class="mark">우</span>우리의 청약달력</div>
  <div><div style="font-size:72px;font-weight:800;letter-spacing:-0.04em;line-height:1.1">이번 주 청약 일정</div>
  <div style="font-size:34px;font-weight:700;color:#0a4ec2;margin-top:10px">${mdKo(w.start)} ~ ${mdKo(w.end)}</div></div>
  <div style="display:flex;gap:18px">${stat('접수', w.facts.receipt, '#00745f')}${stat('당첨자 발표', w.facts.win, '#b3261e')}${stat('계약', w.facts.con, '#4b4f9c')}</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:22px">${chips}</div>
</div>
<div class="foot"><span>기준 ${updatedLabel(w.updatedAt)} · 출처 청약홈(한국부동산원)</span><b>aulee.tistory.com</b></div></div></body></html>`;
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
  ${i ? `<span style="position:absolute;top:15px;right:50%;width:100%;height:4px;background:#e4e8ee;z-index:0"></span>` : ''}
  <span style="width:34px;height:34px;border-radius:17px;background:${hot ? s.ph.c : '#fff'};border:4px solid ${s.ph.c};z-index:1"></span>
  <span style="font-size:24px;font-weight:800;color:${s.ph.c}">${lab(s)}</span>
  <span style="font-size:22px;font-weight:${hot ? 800 : 600};color:${hot ? '#1e2124' : '#464c53'};white-space:nowrap">${s.p.end ? `${s.p.date.slice(5).replace('-', '.')}~${s.p.end.slice(5).replace('-', '.')}` : md(s.p.date)}</span>
  ${hot ? '<span style="font-size:17px;font-weight:700;color:#fff;background:#0f2557;border-radius:8px;padding:3px 10px">이번 주</span>' : '<span style="height:27px"></span>'}
</div>`;
  }).join('');
  return `${BASE}<div class="card"><div class="top"></div>
<div style="flex:1;padding:40px 64px 30px;display:flex;flex-direction:column;gap:20px">
  <div style="display:flex;align-items:center;gap:12px;font-size:24px;font-weight:700;color:#464c53">
    <span style="padding:6px 14px;border-radius:8px;border:2px solid #0a4ec2;color:#0a4ec2">${esc(it.kind)}</span>${esc([it.region, it.district].filter(Boolean).join(' '))}
    <span style="margin-left:auto" class="brand"><span class="mark" style="width:34px;height:34px;font-size:19px">우</span></span>
  </div>
  <div style="font-size:${it.name.length > 18 ? 50 : 60}px;font-weight:800;letter-spacing:-0.04em;line-height:1.15;word-break:keep-all">${esc(it.name)}</div>
  <div style="display:flex;gap:14px">${facts.map(([k, v]) => `<div style="background:#f4f6f9;border-radius:14px;padding:12px 22px"><span style="font-size:20px;color:#464c53;font-weight:600">${k}</span> <span style="font-size:28px;font-weight:800;margin-left:6px">${v}</span></div>`).join('')}</div>
  <div style="margin-top:auto;border-top:2px solid #e4e8ee;padding-top:18px">
    <div style="font-size:20px;font-weight:800;color:#464c53;margin-bottom:16px">청약 일정 <span style="font-weight:600;color:#6d7882">· 채워진 점 = 이번 주(${md(w.start)}~${md(w.end)})</span></div>
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

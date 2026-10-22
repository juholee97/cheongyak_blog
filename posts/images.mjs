// 주간 초안의 그림을 만들고 본문에 자리를 넣는다: 주간 썸네일(첫 이미지) + 단지마다 단지 카드 → 위치 지도(반경 1km)
// node posts/images.mjs drafts/2026-11-02_weekly.json   → drafts/2026-11-02_weekly.img/*.png, 초안의 images·html 갱신
// 위치 지도는 VWORLD_KEY가 있을 때만, 주소로 위치를 확실히 못 찾는 단지는 지도 없이(카드만).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { build, draftOf } from './weekly.mjs';
import { weeklyHtml, itemHtml } from './card.mjs';
import { mapHtml, keyOf } from './map.mjs';

const path = process.argv[2];
if (!path) { console.error('사용: node posts/images.mjs drafts/<월요일>_weekly.json'); process.exit(1); }
const d = JSON.parse(await readFile(path, 'utf8'));
const data = JSON.parse(await readFile(path.replace(/\.json$/, '.data.json'), 'utf8'));
const w = build(data, d.week.start);
const out = path.replace(/\.json$/, '.img');
await mkdir(out, { recursive: true });
const key = await keyOf();
if (!key) console.log('※ VWORLD_KEY 없음 — 위치 지도 없이 카드만 만듭니다.');

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
const shoot = async (html, file) => {
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  return file.replace(/\\/g, '/');
};

const images = [];
const fmt = (s) => `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일`;
images.push({ key: 'weekly', file: await shoot(weeklyHtml(w), `${out}/00_weekly.png`), alt: `이번 주 청약 일정 ${fmt(w.start)}~${fmt(w.end)}: 접수 ${w.facts.receipt}곳, 당첨자 발표 ${w.facts.win}곳, 계약 ${w.facts.con}곳` });
let maps = 0;
for (const [n, { it }] of w.receipt.entries()) {
  const no = String(n + 1).padStart(2, '0');
  images.push({ key: 'card:' + it.id, file: await shoot(itemHtml(it, w), `${out}/${no}_card_${it.id}.png`), alt: `${it.name} 청약 일정 카드` });
  if (!key) continue;
  try {
    const r = await mapHtml(it, key);
    if (r.skip) { console.log(`- ${it.name}: 위치 지도 없음 (${r.skip})`); continue; }
    images.push({ key: 'map:' + it.id, file: await shoot(r.html, `${out}/${no}_map_${it.id}.png`), alt: `${it.name} 위치 지도(반경 500m·1km, ${r.parcel ? '대표 필지' : '지점'})` });
    maps++;
  } catch (e) {
    console.log(`✗ ${it.name}: 위치 지도 실패 (${e.message})`);
  }
}
await browser.close();

const next = draftOf(data, d.week.start, d.summary, images);
await writeFile(path, JSON.stringify(next, null, 2));
console.log(`그림 ${images.length}장 (썸네일 1 · 카드 ${w.receipt.length} · 지도 ${maps}) → ${out}/`);

// 로고 파일 만들기: node brand/make.mjs  → brand/blog-image.png(티스토리 블로그 이미지 800×800), icon-512.png, favicon.ico(16·32·48)
// 로고 원본은 skin/images/logo.svg 하나. 로고를 바꾸면 그 파일과 posts/card.mjs LOGO를 같이 고치고 이 스크립트를 다시 돌린다.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';

const svg = await readFile(join(ROOT, 'skin/images/logo.svg'), 'utf8');
const out = (f) => join(ROOT, 'brand', f);
const browser = await chromium.launch();
const shot = async (html, w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@900&display=swap"><style>body{margin:0}svg{display:block;width:100%;height:100%}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return png;
};
const logo = (n) => shot(`<div style="width:${n}px;height:${n}px">${svg}</div>`, n, n);
await writeFile(out('icon-512.png'), await logo(512));
await writeFile(out('blog-image.png'), await shot(`<div style="width:800px;height:800px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;font-family:'Noto Sans KR'"><div style="width:400px;height:400px">${svg}</div><div style="font-size:76px;font-weight:900;letter-spacing:-0.05em;color:#1c1f24">우리의 청약달력</div></div>`, 800, 800));
// ICO: 크기마다 PNG를 그대로 담는다(Vista 이후 표준)
const sizes = [16, 32, 48], pngs = [];
for (const n of sizes) pngs.push(await logo(n));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((n, i) => {
  const e = 6 + 16 * i;
  head[e] = n; head[e + 1] = n; head[e + 2] = 0; head[e + 3] = 0;
  head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
  off += pngs[i].length;
});
await writeFile(out('favicon.ico'), Buffer.concat([head, ...pngs]));
await browser.close();
console.log('brand/blog-image.png · icon-512.png · favicon.ico');

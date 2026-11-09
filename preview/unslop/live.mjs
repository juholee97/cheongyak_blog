// 실제 블로그 화면에 다듬기 CSS를 브라우저에서만 얹어 본다(블로그는 바뀌지 않음). node preview/unslop/live.mjs <출력 폴더>
import { chromium } from 'playwright';
import { join } from 'node:path';
import { flat } from './steps.mjs';
const OUT = process.argv[2];
const TRACK = /tiara|wcs\.pstatic|googletag|google-analytics|googlesyndication|doubleclick|adfit|daumcdn\.net\/kas/;
const b = await chromium.launch();
for (const [name, path] of [['home', '/'], ['cal', '/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95'], ['post', '/61']]) for (const [w, h] of [[1440, 900], [390, 844]]) for (const tag of ['before', 'after']) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.route(TRACK, (r) => r.abort());
  await p.goto('https://aulee.tistory.com' + path, { waitUntil: 'networkidle' }).catch(() => {});
  if (tag === 'after') await p.addStyleTag({ content: flat() });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);
  await p.screenshot({ path: join(OUT, `live_${tag}_${name}_${w}.png`) });
  if (tag === 'after' && name === 'home' && w === 1440) console.log(await p.evaluate(() => [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family + ' ' + x.weight).join(', ')));
  await p.close();
}
await b.close();

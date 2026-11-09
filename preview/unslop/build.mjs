// unslop 미리보기 만들기(블로그에는 아무것도 올리지 않는다).
// node preview/unslop/build.mjs <출력 폴더>
//   story.html            바뀌는 과정 영상용(홈 첫 화면을 그대로 굳힌 사본 + 단계별 CSS)
//   before_*.png/after_*.png  로컬 미리보기(preview/serve.mjs)에 다듬기 CSS를 얹기 전·후, 홈·달력·글, PC·휴대폰
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { flat, story, STEPS } from './steps.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = process.argv[2];
if (!OUT) { console.log('사용: node preview/unslop/build.mjs <출력 폴더>'); process.exit(1); }
await mkdir(OUT, { recursive: true });
const BASE = 'http://localhost:5178';
const alive = () => fetch(BASE + '/rules.json').then((r) => r.ok, () => false);
let server = null;
if (!(await alive())) { server = spawn(process.execPath, [join(ROOT, 'preview/serve.mjs')], { stdio: 'ignore', cwd: ROOT }); for (let i = 0; i < 50 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 200)); }
const sched = await (await fetch('https://juholee97.github.io/cheongyak_blog/schedule.json')).json();
const css = await readFile(join(ROOT, 'skin/style.css'), 'utf8');
const browser = await chromium.launch();
const open = async (path, w, h, extra) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.route(/^https?:\/\/(?!localhost|cdn\.jsdelivr\.net)/, (x) => x.abort());
  await p.route('**/schedule.json', (x) => x.fulfill({ json: sched }));
  await p.goto(BASE + path);
  await p.waitForSelector(path === '/' ? '.src-block' : path.startsWith('/category') ? '.src-list .hero-group' : 'body', { timeout: 15000 }).catch(() => {});
  if (extra) await p.addStyleTag({ content: extra });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  return p;
};
try {
  // 1) 영상용 story.html
  const p = await open('/', 1440, 1000);
  let html = await p.evaluate(() => {
    document.querySelectorAll('script').forEach((s) => s.remove());
    document.querySelector('.hero-main h2')?.setAttribute('data-gap', 'hero');
    document.querySelector('.hero-date')?.setAttribute('data-gap', 'hero');
    document.querySelector('.hero-stats')?.setAttribute('data-gap', 'hero');
    document.querySelector('.hero-cta')?.setAttribute('data-gap', 'hero');
    document.querySelector('.hero-cta')?.setAttribute('data-radius', '');
    document.querySelector('.tile.l4')?.setAttribute('data-radius', '');
    return '<!doctype html>' + document.documentElement.outerHTML;
  });
  await p.close();
  html = html
    .replace(/<link[^>]*pretendard[^>]*>/i, '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">')
    .replace(/<link[^>]*href="[^"]*style\.css"[^>]*>/i, () => `<style>${css.replace(/Pretendard,/g, '"Pretendard Variable", Pretendard,')}</style>`)
    .replace('</head>', () => `<meta name="unslop-steps" content="${STEPS.map((s) => s.name).join(', ')}"><meta name="unslop-frame" content="96 64 1248"><style>.hero-cta { border-radius: 22px; } .wrap { min-height: 0; }
${story()}</style></head>`);
  await writeFile(join(OUT, 'story.html'), html);
  // 2) 전·후 그림
  for (const [name, path] of [['home', '/'], ['cal', '/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95'], ['post', '/post']]) for (const [w, h] of [[1440, 900], [390, 844]]) for (const [tag, extra] of [['before', ''], ['after', flat()]]) {
    const q = await open(path, w, h, extra);
    await q.screenshot({ path: join(OUT, `${tag}_${name}_${w}.png`), fullPage: name !== 'cal' || w < 700 ? false : false });
    const over = await q.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) console.log(`가로 넘침 ${tag} ${name} ${w}: ${over}px`);
    await q.close();
  }
  // 3) 달력 상세 창(모서리·그림자 확인)
  for (const [tag, extra] of [['before', ''], ['after', flat()]]) {
    const q = await open('/category/%EC%B2%AD%EC%95%BD%EC%9D%BC%EC%A0%95', 1440, 900, extra);
    await q.evaluate(() => { const b = [...document.querySelectorAll('[data-act=open]')].find((e) => e.offsetParent); b && b.click(); });
    await q.waitForSelector('.modal', { timeout: 5000 }).catch(() => {});
    await q.waitForTimeout(300);
    await q.screenshot({ path: join(OUT, `${tag}_modal_1440.png`) });
    await q.close();
  }
  console.log('만듦:', OUT);
} finally { await browser.close(); if (server) server.kill(); }

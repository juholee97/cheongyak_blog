// 홈 지역 지도 → 이번 달 달력 뒤집기 효과 미리보기(블로그에는 올리지 않음).
// node preview/unslop/flip.mjs <출력 폴더>   → flip_idle.png, flip_hover.png, flip_390.png, flip.mp4(마우스 올림·뗌을 두 번)
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = process.argv[2];
await mkdir(OUT, { recursive: true });
const BASE = 'http://localhost:5178';
const alive = () => fetch(BASE + '/rules.json').then((r) => r.ok, () => false);
let server = null;
if (!(await alive())) { server = spawn(process.execPath, [join(ROOT, 'preview/serve.mjs')], { stdio: 'ignore', cwd: ROOT }); for (let i = 0; i < 50 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 200)); }
const sched = await (await fetch('https://juholee97.github.io/cheongyak_blog/schedule.json')).json();
const browser = await chromium.launch();
const setup = async (ctx) => {
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.route(/^https?:\/\/(?!localhost|cdn\.jsdelivr\.net)/, (x) => x.abort());
  await p.route('**/schedule.json', (x) => x.fulfill({ json: sched }));
  await p.goto(BASE + '/');
  await p.waitForSelector('.map-cal .mc-day', { state: 'attached', timeout: 15000 });
  await p.evaluate(() => document.fonts.ready);
  return { p, errs };
};
let bad = 0;
try {
  // 그림: 평소·마우스 올림
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { p, errs } = await setup(ctx);
  await p.mouse.move(10, 10);
  await p.waitForTimeout(300);
  await p.locator('.hero > .hero-inner').first().screenshot({ path: join(OUT, 'flip_idle.png') });
  await p.hover('.hero-cta');
  await p.waitForTimeout(1200);
  await p.locator('.hero > .hero-inner').first().screenshot({ path: join(OUT, 'flip_hover.png') });
  const st = await p.evaluate(() => ({ cal: document.querySelector('.hero-map').classList.contains('is-cal'), days: document.querySelectorAll('.mc-day:not(.is-pad)').length, tagged: document.querySelectorAll('.mc-tags i').length, over: document.documentElement.scrollWidth - innerWidth }));
  st.label = await p.locator('.hero-cta').textContent();
  st.href = await p.locator('.mc-day:not(.is-pad)').nth(19).getAttribute('href');
  // 버튼에서 달력 날짜 칸으로 옮겨도 달력이 유지되는지, 날짜 칸 강조
  const day = p.locator('.mc-day:not(.is-pad)').nth(19);
  await day.hover();
  await p.waitForTimeout(900);
  st.stay = await p.evaluate(() => document.querySelector('.hero-map').classList.contains('is-cal'));
  await p.locator('.hero > .hero-inner').first().screenshot({ path: join(OUT, 'flip_day.png') });
  console.log('1440', JSON.stringify(st), errs.join(' / '));
  if (!st.cal || !st.days || st.over > 0 || errs.length || !st.stay || !/#d=\d{4}-\d{2}-20$/.test(st.href)) bad++;
  // 날짜 칸을 누르면 달력 페이지가 그 날을 고른 채로 열린다
  await day.click();
  await p.waitForSelector('.day.sel', { timeout: 15000 });
  const sel = await p.evaluate(() => document.querySelector('.day.sel').dataset.d);
  console.log('click', p.url().replace(BASE, ''), 'sel', sel);
  if (!st.href.endsWith(sel)) bad++;
  await p.screenshot({ path: join(OUT, 'flip_click.png') });
  await ctx.close();
  // 시각 효과를 꺼 둔(최적화) 컴퓨터에서도 뒤집기 전환이 돈다
  const rm_ = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const rp = await setup(rm_);
  await rp.p.hover('.hero-cta');
  await rp.p.waitForTimeout(150);
  const running = await rp.p.evaluate(() => document.getAnimations().filter((a) => a.transitionProperty && a.playState === 'running').length);
  await rp.p.waitForTimeout(1300);
  const done = await rp.p.evaluate(() => getComputedStyle(document.querySelector('.mc-day:not(.is-pad)')).opacity);
  console.log('reduced-motion', 'running', running, 'opacity', done);
  if (running < 20 || done !== '1') bad++;
  await rm_.close();
  // 휴대폰: 효과 없음, 넘침 없음
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const mm = await setup(m);
  const ms = await mm.p.evaluate(() => ({ bound: !!document.querySelector('.hero-cta').dataset.flip, over: document.documentElement.scrollWidth - innerWidth, calVisible: getComputedStyle(document.querySelector('.mc-head')).opacity }));
  console.log('390', JSON.stringify(ms));
  if (ms.bound || ms.over > 0 || ms.calVisible !== '0') bad++;
  await mm.p.screenshot({ path: join(OUT, 'flip_390.png') });
  await m.close();
  // 영상: 마우스를 버튼에 올렸다 떼기를 두 번
  const vdir = join(OUT, 'flip_video');
  await rm(vdir, { recursive: true, force: true });
  const vc = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', recordVideo: { dir: vdir, size: { width: 1440, height: 900 } } });
  const v = await setup(vc);
  // 영상에는 마우스 포인터가 안 찍혀서, 보는 사람이 알 수 있게 포인터 모양을 그려 따라다니게 한다(영상에만)
  await v.p.evaluate(() => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:99999;pointer-events:none;transform:translate(-100px,-100px)';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l14 9-6.5 1.5L15 20l-3 1.5-3.5-7.5L4 18z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`; });
  });
  const box = await v.p.locator('.hero-cta').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await v.p.mouse.move(cx - 260, cy + 120);
  await v.p.waitForTimeout(900);
  const dbox = await v.p.locator('.mc-day:not(.is-pad)').nth(19).boundingBox();
  await v.p.mouse.move(cx, cy, { steps: 18 });
  await v.p.waitForTimeout(1700);
  // 버튼에서 달력으로 옮겨 날짜 칸 위를 지나간다
  await v.p.mouse.move(dbox.x + dbox.width / 2, dbox.y + dbox.height / 2, { steps: 24 });
  await v.p.waitForTimeout(900);
  await v.p.mouse.move(dbox.x + dbox.width * 1.6, dbox.y + dbox.height * 0.6, { steps: 10 });
  await v.p.waitForTimeout(900);
  await v.p.mouse.move(cx - 260, cy + 220, { steps: 24 });
  await v.p.waitForTimeout(1600);
  await vc.close();
  const webm = (await readdir(vdir)).find((f) => f.endsWith('.webm'));
  const hero = { x: 120, y: 100, w: 1200, h: 680 };
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(vdir, webm), '-vf', `crop=${hero.w}:${hero.h}:${hero.x}:${hero.y},fps=30`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', join(OUT, 'flip.mp4')]);
  console.log(bad ? 'FAIL' : 'ALL OK', '→', join(OUT, 'flip.mp4'));
} finally { await browser.close(); if (server) server.kill(); }

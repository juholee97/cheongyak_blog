// 공개 사이트(auleezip.com) 화면 확인용 스크린샷 — 구글 애널리틱스를 막고 연다(2026-11-01: 점검 브라우저 32명이 그날 방문자로 잡힘)
// node zip/shot.mjs <url> [out.png] [--w 1400] [--h 1000] [--full]   → 기본 out: data/shots/<경로>.png
// 사이트 화면을 headless로 열 때는 이 스크립트나 blockAnalytics(page)를 쓴다. 맨 playwright로 열면 매번 새 방문자로 센다.
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ROOT } from '../tistory/common.mjs';

const TRACKERS = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/;
export const blockAnalytics = (page) => page.route((u) => TRACKERS.test(u.host), (r) => r.abort());

if (process.argv[1]?.endsWith('shot.mjs')) {
  const a = process.argv.slice(2), opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const url = a[0];
  if (!url?.startsWith('https://')) { console.log('node zip/shot.mjs <https://…> [out.png] [--w 1400] [--h 1000] [--full]'); process.exit(1); }
  const out = a[1] && !a[1].startsWith('--') ? a[1] : join(ROOT, 'data/shots', (new URL(url).pathname.replace(/\W+/g, '_').replace(/^_|_$/g, '') || 'home') + '.png');
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  try {
    // HeadlessChrome UA는 NinjaFirewall이 403으로 막는다 — 보통 크롬 UA로
    const p = await b.newPage({ viewport: { width: +opt('--w', 1400), height: +opt('--h', 1000) }, userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${b.version()} Safari/537.36` });
    let sent = 0;
    p.on('request', (r) => { if (TRACKERS.test(new URL(r.url()).host)) sent++; });
    await blockAnalytics(p);
    await p.goto(url, { waitUntil: 'networkidle' });
    await mkdir(dirname(out), { recursive: true });
    await p.screenshot({ path: out, fullPage: a.includes('--full') });
    console.log(out, `(애널리틱스 요청 ${sent}건 막음)`);
  } finally { await b.close(); }
}

// 주간 글 + 우리의 집 심층 분석 링크(--deep-links) 미리보기 — drafts/는 건드리지 않는다
// node preview/weekly_links.mjs [--week 2026-11-16 --week 2026-11-23] [--out preview/out/weekly_links_20261116] [--reuse]
// 공개 수집본(SCHEDULE_URL)·장부(LINKS_URL)로 주마다 바꾸기 전/후 본문을 그리고, 글 화면(preview/serve.mjs의 /post 틀)에 넣어
// 1280·375px 폭으로 링크가 들어간 단지 상자와 발표·계약 목록을 캡처한다. 우리의 집에는 후보 주소마다 GET 한 번(두 주에 겹치면 한 번만).
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadData, loadLedger, build, autoSummary, render, titleOf, pickDeepLinks, SCHEDULE_URL, LINKS_URL } from '../posts/weekly.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
const weeks = argv.flatMap((a, i) => (a === '--week' ? [argv[i + 1]] : []));
if (!weeks.length) weeks.push('2026-11-16', '2026-11-23');
const OUT = join(ROOT, argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'preview/out/weekly_links_20261116');
const PORT = 5178, ORIGIN = `http://localhost:${PORT}`;
const SAMPLE_TITLE = '11월 수도권 분양 물량 총정리 — 놓치면 안 될 단지 5곳'; // serve.mjs /post 표본 글 제목
const SAMPLE_DESC = /<div class="post-body tt_article_useless_p_margin contents_style">[\s\S]*?<\/table><\/div>/;

const up = () => fetch(ORIGIN + '/post').then((r) => r.ok, () => false);
let server = null;
if (!(await up())) {
  server = spawn(process.execPath, [join(ROOT, 'preview', 'serve.mjs')], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}
const shell = await (await fetch(ORIGIN + '/post')).text();
if (!SAMPLE_DESC.test(shell)) throw new Error('serve.mjs /post 본문 자리를 못 찾음');
const page = (title, body) => shell.split(SAMPLE_TITLE).join(title).replace(SAMPLE_DESC, () => `<div class="post-body tt_article_useless_p_margin contents_style">${body}</div>`)
  .replace('<head>', `<head><base href="${ORIGIN}/">`);

// 두 주에 같은 단지가 나오면 우리의 집 요청은 한 번만
const seen = new Map();
const onceFetch = (u, o) => { if (!seen.has(u)) seen.set(u, fetch(u, o)); return seen.get(u); };

await mkdir(OUT, { recursive: true });
const reuse = argv.includes('--reuse') ? await readFile(join(OUT, 'links_report.json'), 'utf8').then(JSON.parse, () => null) : null;
const data = await loadData(SCHEDULE_URL);
const ledger = await loadLedger(LINKS_URL);
console.log(`수집본 ${data.items.length}건(기준 ${data.updatedAt}) · 장부 ${ledger ? Object.keys(ledger).length + '건' : '못 받음'}`);
const browser = await chromium.launch({ headless: true });
const report = { scheduleUrl: SCHEDULE_URL, dataUpdatedAt: data.updatedAt, linksUrl: LINKS_URL, weeks: [] };
try {
  for (const wk of weeks) {
    const w = build(data, wk), summary = autoSummary(w), title = titleOf(w);
    const old = reuse?.weeks.find((x) => x.week === wk); // --reuse: 지난번 결과의 링크를 그대로(우리의 집에 다시 요청하지 않음)
    const { links, rows } = old ? { links: old.links, rows: old.rows } : ledger ? await pickDeepLinks(w, ledger, { fetchImpl: onceFetch }) : { links: {}, rows: [] };
    const before = render(w, summary), after = render(w, summary, [], links);
    const count = (xs) => xs.filter(({ it }) => links[it.id]).length;
    const sum = { week: wk, title, receipt: `${count(w.receipt)}/${w.receipt.length}`, win: `${count(w.win)}/${w.win.length}`, con: `${count(w.con)}/${w.con.length}`, links, rows };
    report.weeks.push(sum);
    for (const [k, body] of [['before', before], ['after', after]]) {
      await writeFile(join(OUT, `${wk}_body_${k}.html`), body); // 티스토리에 들어갈 본문 그대로
      await writeFile(join(OUT, `${wk}_page_${k}.html`), page(title, body)); // 글 화면(serve.mjs가 떠 있을 때 열림)
    }
    console.log(`\n${wk} ${title}\n  접수 단지 중 링크 ${sum.receipt} · 발표 목록 ${sum.win} · 계약 목록 ${sum.con}`);
    rows.filter((r) => r.url).forEach((r) => console.log(`  ${r.result.padEnd(6)} ${r.name} [${r.secs.join('·')}] ${decodeURI(r.url)}${r.final && r.final !== r.url ? ' → ' + decodeURI(r.final) : ''}`));
    console.log(`  장부에 없음 ${rows.filter((r) => !r.url).length}곳`);

    for (const width of [1280, 375]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: width === 375 ? 2 : 1 });
      const pg = await ctx.newPage();
      for (const [k, body] of [['after', after], ['before', before]]) {
        await pg.route(`${ORIGIN}/__weekly_links`, (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: page(title, body) }));
        await pg.goto(`${ORIGIN}/__weekly_links`, { waitUntil: 'networkidle' });
        await pg.evaluate(() => document.fonts.ready);
        // 링크가 들어간 첫 단지 상자(전에는 같은 번호 상자)
        const idx = w.receipt.findIndex(({ it }) => links[it.id]);
        if (idx >= 0) await pg.locator('.post-body > div').nth(idx).screenshot({ path: join(OUT, `${wk}_box_${k}_${width}.png`) });
        // 발표·계약 목록: 「이번 주 당첨자 발표」 제목부터 「이번 주 계약」 목록 끝까지
        const clip = await pg.evaluate(() => {
          const hs = [...document.querySelectorAll('.post-body h2')];
          const a = hs.find((h) => h.textContent.includes('당첨자 발표')), c = hs.find((h) => h.textContent.includes('이번 주 계약'));
          const end = c.nextElementSibling, r1 = a.getBoundingClientRect(), r2 = end.getBoundingClientRect();
          const x = Math.min(r1.left, r2.left) - 8;
          return { x: Math.max(0, x), y: r1.top + scrollY - 8, width: Math.max(r1.right, r2.right) - x + 8, height: r2.bottom - r1.top + 16 };
        });
        await pg.screenshot({ path: join(OUT, `${wk}_lists_${k}_${width}.png`), clip, fullPage: true });
        await pg.unroute(`${ORIGIN}/__weekly_links`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
if (reuse) report.weeks.unshift(...reuse.weeks.filter((x) => !weeks.includes(x.week))); // 이번에 안 그린 주의 지난 결과는 남긴다
report.requests =[...new Set([...(reuse?.requests || []), ...seen.keys()])];
await writeFile(join(OUT, 'links_report.json'), JSON.stringify(report, null, 2));
console.log(`\n우리의 집 요청 ${seen.size}건 · 결과 ${OUT}`);

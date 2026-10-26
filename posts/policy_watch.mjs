// 정책 소식 후보 모으기(2026-10-27): 공식 출처의 새 보도자료·입법예고 중 청약·주택·대출 관련만 골라 목록으로 남긴다.
// 글은 쓰지 않는다 — 후보를 보고 사람이 고르면 가이드 틀(posts/guide.mjs, 대출·정책)로 초안 → 채팅 승인 → 예약.
// 출처: 국토교통부 보도자료(브라우저로만 열림), 금융위원회 보도자료, 법제처 국민참여입법센터 입법예고(국토교통부·금융위원회 소관). 정책브리핑 RSS는 서비스 중단.
// node posts/policy_watch.mjs [--days 14]   → data/policy_watch.json(본 것 기록) · data/policy_candidates.md(최근 후보, 사람이 읽는 목록)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { ROOT } from '../tistory/common.mjs';

// 청약·주택·대출 관련 제목만(항공·도로 등 다른 국토부 소식은 뺀다)
export const KW = /주택|청약|분양|임대|전세|월세|부동산|대출|DSR|LTV|주담대|보금자리|디딤돌|버팀목|주택도시기금|재건축|재개발|정비사업|공시가격|취득세|양도세|종부세|토지거래허가|규제지역|신도시|공공주택|택지|가계부채|전월세|도시정비|노후계획도시|주거|공동주택|도시개발|임대차/;
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
const clean = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const ymd = (s) => (/(\d{4})[.\-]\s*(\d{1,2})[.\-]\s*(\d{1,2})/.exec(s) || []).slice(1).map((v, i) => (i ? v.padStart(2, '0') : v)).join('-') || null;

// 국토교통부: 서버가 브라우저가 아니면 307로 돌려보내서 Playwright로 연다. 분야 「주택토지」이거나 제목에 키워드
async function molit(browser, pages = 2) {
  const page = await browser.newPage();
  const out = [];
  try {
    for (let n = 1; n <= pages; n++) {
      await page.goto(`https://www.molit.go.kr/USR/NEWS/m_71/lst.jsp?lcmspage=${n}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('table tbody tr', { timeout: 15000 });
      const rows = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')].map((tr) => ({ c: [...tr.cells].map((x) => x.innerText.trim()), href: tr.querySelector('a')?.getAttribute('href') || '' })));
      for (const r of rows) {
        const [, title, field, date] = r.c, id = /id=(\d+)/.exec(r.href)?.[1];
        if (id && (field === '주택토지' || KW.test(title))) out.push({ src: '국토교통부 보도자료', id: `molit-${id}`, title, date: ymd(date), url: `https://www.molit.go.kr/USR/NEWS/m_71/dtl.jsp?id=${id}` });
      }
    }
  } finally { await page.close(); }
  return out;
}

// 금융위원회: 목록 HTML에 제목 링크와 날짜가 차례로 있다
async function fsc(pages = 2) {
  const out = [];
  for (let n = 1; n <= pages; n++) {
    const s = await (await fetch(`https://www.fsc.go.kr/no010101?curPage=${n}`, { headers: UA })).text();
    const items = s.split('<div class="count">').slice(1);
    for (const it of items) {
      const m = /<a href="\/no010101\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(it);
      if (!m) continue;
      const title = clean(m[2]);
      if (KW.test(title)) out.push({ src: '금융위원회 보도자료', id: `fsc-${m[1]}`, title, date: ymd(it), url: `https://www.fsc.go.kr/no010101/${m[1]}` });
    }
  }
  return out;
}

// 법제처 국민참여입법센터 입법예고: 소관 부처 코드(국토교통부 1613000, 금융위원회 1160100)로 거른다
async function lawmaking() {
  const out = [];
  for (const [org, name] of [['1613000', '국토교통부'], ['1160100', '금융위원회']]) {
    const s = await (await fetch(`https://opinion.lawmaking.go.kr/gcom/ogLmPp?cptOfiOrgCd=${org}`, { headers: UA })).text();
    const tb = s.slice(s.indexOf('<tbody'), s.indexOf('</tbody>'));
    for (const tr of tb.split('<tr').slice(1)) {
      const id = /href="\/gcom\/ogLmPp\/(\d+)[?"]/.exec(tr)?.[1];
      const cells = tr.split(/<td[^>]*>/).slice(1).map(clean);
      const title = (cells.find((c) => /입법예고|개정|제정/.test(c)) || '').replace(/\s*(일부|전부|제정|폐지)$/, ''); // 제목 뒤 제·개정 구분 표시는 뺀다
      const period = (cells.find((c) => /\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\..*~/.test(c)) || '').split('~'); // 「2026. 10. 23. ~2026. 12. 2.」 의견 접수기간
      if (id && KW.test(title)) out.push({ src: `입법예고(${name})`, id: `law-${id}`, title, date: ymd(period[0] || ''), until: ymd(period[1] || ''), url: `https://opinion.lawmaking.go.kr/gcom/ogLmPp/${id}` });
    }
  }
  return out;
}

async function main() {
  const di = process.argv.indexOf('--days');
  const days = di > 0 ? +process.argv[di + 1] : 14;
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const since = new Date(Date.now() + 9 * 3600e3 - days * 864e5).toISOString().slice(0, 10);
  const SEEN = join(ROOT, 'data', 'policy_watch.json');
  const seen = JSON.parse(await readFile(SEEN, 'utf8').catch(() => '{}'));
  const browser = await chromium.launch();
  const found = [], errors = [];
  try {
    for (const [name, f] of [['국토교통부', () => molit(browser)], ['금융위원회', () => fsc()], ['입법예고', () => lawmaking()]]) {
      try { found.push(...(await f())); } catch (e) { errors.push(`${name}: ${e.message.slice(0, 120)}`); }
    }
  } finally { await browser.close(); }
  const fresh = found.filter((x) => !seen[x.id]);
  for (const x of found) seen[x.id] ??= { ...x, firstSeen: today };
  await mkdir(join(ROOT, 'data'), { recursive: true });
  await writeFile(SEEN, JSON.stringify(seen, null, 1));
  // 사람이 읽는 목록: 최근 N일 안에 처음 본 후보(새 것 표시)
  const recent = Object.values(seen).filter((x) => (x.date || x.firstSeen) >= since).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const newIds = new Set(fresh.map((x) => x.id));
  const md = [`# 정책 소식 후보 (최근 ${days}일, ${today} 갱신)`, '', '청약·주택·대출 관련 공식 보도자료·입법예고. 글로 쓸 것을 고르면 대출·정책 가이드 초안으로 만든다(채팅 승인 뒤 예약).', '',
    ...recent.map((x) => `- ${newIds.has(x.id) ? '**[새]** ' : ''}${x.date || '?'} · ${x.src} · [${x.title}](${x.url})${x.until ? ` · 의견 마감 ${x.until}` : ''}`),
    ...(errors.length ? ['', `수집 실패: ${errors.join(' / ')}`] : [])].join('\n');
  await writeFile(join(ROOT, 'data', 'policy_candidates.md'), md + '\n');
  console.log(`정책 소식: 이번에 찾은 관련 ${found.length}건, 새로 본 ${fresh.length}건${errors.length ? ` · 실패 ${errors.join(' / ')}` : ''}`);
  fresh.forEach((x) => console.log(`  [새] ${x.date} ${x.src} — ${x.title}`));
  process.exitCode = errors.length === 3 ? 1 : 0;
}

if (process.argv[1]?.endsWith('policy_watch.mjs')) main();

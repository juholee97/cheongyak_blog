// 분양 홈페이지에서 주택형별 평면도와 조감도를 찾아 받는다(분석 글용). 2026-10-24 사용자 결정: 출처를 밝히고 정보 제공 목적으로 싣는다.
// node posts/floorplan.mjs <공고번호>   → drafts/analysis_<no>.img/plan_<전용>.jpg·aerial.jpg, 찾은 것만 출력
// 방식: 홈페이지 첫 화면에서 「평면·세대안내·UNIT·타입」과 「조감도·투시도」 링크를 찾아 연다 → 큰 그림 중
// 파일 이름·설명에 주택형 숫자(84, 59A …)가 있는 것을 주택형마다 하나씩(가장 앞 글자 타입). 모바일용(/m/, m_)은 뺀다.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../tistory/common.mjs';

const PLAN = /평면|세대\s*안내|세대정보|유니트|unit|type|타입/i, AERIAL = /조감|투시|단지\s*전경|aerial|bird/i;
const MOBILE = /(^|\/)m\/|\/m_|_m\.|mobile/i;
// 그림 점수: 확장형 > 기본형 > 그 밖, 정보 띠·키맵·옵션·로고는 뺀다(신분평 에피트 실측: 59a_info.png는 띠, 59a_expanded.png가 평면)
const score = (c) => (/info|key|map|option|logo|icon|btn|tit/i.test(c.src) ? -10 : 0) + (/expand|확장/i.test(c.src + c.alt) ? 2 : /basic|기본/i.test(c.src + c.alt) ? 1 : 0);

// 그림 하나 → 주택형(전용 숫자) 맞추기: 파일 이름·설명 안의 2~3자리 숫자 + 뒤 글자(A·B…)
export function matchType(text, areas) {
  const s = decodeURIComponent(text || '').toLowerCase();
  for (const m of s.matchAll(/(?:^|[^0-9])(\d{2,3})(?:\.\d+)?(?:㎡|m2|형)?\s*-?\s*([a-z])?(?=[^0-9a-z]|$)/g)) {
    const n = +m[1];
    if (areas.includes(n)) return { area: n, letter: (m[2] || '').toUpperCase() };
  }
  return null;
}

async function collect(page) {
  return page.evaluate(() => {
    const out = [];
    const add = (src, w, h, alt, el) => { if (src && !/^data:/.test(src)) out.push({ src: new URL(src, location.href).href, w, h, alt: alt || '', ctx: (el?.closest('section, li, div')?.innerText || '').slice(0, 60) }); };
    for (const i of document.querySelectorAll('img')) {
      for (const s of new Set([i.currentSrc || i.src, i.dataset.src, i.dataset.original, i.dataset.lazy].filter(Boolean))) add(s, i.naturalWidth, i.naturalHeight, i.alt, i);
    }
    for (const e of document.querySelectorAll('[style*="background"]')) { const m = getComputedStyle(e).backgroundImage.match(/url\("?([^")]+)"?\)/); if (m) add(m[1], 0, 0, '', e); }
    return out;
  });
}

// name: 단지 이름. 끝의 블록·단지 번호(「아크메르 동탄 95」의 95, 「트리븐센텀 2단지」의 2)가 그림 주소에 폴더·이름으로 있으면 그것만 쓴다
// (블록 여럿이 홈페이지 하나를 같이 쓸 때 — 아크메르 동탄 실측: /sub/unit/95/84c.jpg · /sub/unit/99/84a.jpg)
export const blockOf = (name) => (String(name || '').replace(/\(.*?\)/g, '').match(/(\d{1,3})(?:단지|블록|BL)?\s*$/i) || [])[1] || null;
const inBlock = (src, b) => new RegExp(`(^|[/_-])${b}(블록|단지|bl)?([/_.-]|$)`, 'i').test(decodeURIComponent(new URL(src).pathname).replace(/[^/]+$/, (f) => f.replace(/^\d{2,3}[a-z]?\./i, '')));
export async function findPlans(homepage, areas, outDir, { timeoutMs = 90000, name } = {}) {
  const block = blockOf(name);
  if (!homepage) return { skip: '홈페이지 주소 없음' };
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const kill = setTimeout(() => browser.close().catch(() => {}), timeoutMs); // 홈페이지가 멈춰도 글 만들기는 계속되게
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
    await page.goto(homepage, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const origin = new URL(page.url()).origin;
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ t: (a.innerText || a.title || '').replace(/\s+/g, ' ').trim(), href: a.href })));
    const pick = (re) => [...new Set(links.filter((l) => re.test(l.t) || re.test(l.href)).map((l) => l.href).filter((h) => h.startsWith(origin) && !/#$/.test(h)))].slice(0, 4);
    const planPages = pick(PLAN), aerialPages = pick(AERIAL);
    // 타입마다 따로 있는 페이지(…unit?type=84a 같은 주소)도 연다
    const typePages = [...new Set(links.map((l) => l.href).filter((h) => h.startsWith(origin) && matchType(h.split('/').pop(), areas)))].slice(0, 12);
    const cands = []; // {area, letter, src, page, sc}
    let aerial = null;
    for (const url of [...new Set([...planPages, ...typePages, homepage])]) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
      for (const c of await collect(page)) {
        if (MOBILE.test(c.src)) continue;
        if (c.w && c.w < 500) continue;
        if (c.w && c.h / c.w < 0.4) continue; // 가로로 긴 띠(제목·정보 줄)
        const t = matchType(c.src.split('/').pop(), areas) || matchType(c.alt, areas);
        if (!t) continue;
        const sc = score(c);
        if (sc < 0) continue;
        if (process.env.FP_DEBUG) console.log('후보', t.area + t.letter, sc, c.src.slice(-70), '|', c.ctx.replace(/\s+/g, ' ').slice(0, 40), '|', url.slice(-40));
        if (!cands.some((x) => x.src === c.src)) cands.push({ area: t.area, letter: t.letter, src: c.src, page: url, sc });
      }
    }
    // 주택형마다 하나: 블록 번호가 맞는 그림이 있으면 그것들 중에서, 앞 글자 타입(A) → 확장형·기본형 점수 순
    const found = new Map();
    for (const area of areas) {
      let xs = cands.filter((x) => x.area === area);
      if (block && xs.some((x) => inBlock(x.src, block))) xs = xs.filter((x) => inBlock(x.src, block));
      xs.sort((a, b) => (a.letter || 'Z').localeCompare(b.letter || 'Z') || b.sc - a.sc);
      if (xs[0]) found.set(area, xs[0]);
    }
    for (const url of aerialPages) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const big = (await collect(page)).filter((c) => !MOBILE.test(c.src) && c.w >= 900 && c.w / Math.max(c.h, 1) > 1.2 && !/logo|icon|btn|bg_|banner/i.test(c.src)).sort((a, b) => b.w * b.h - a.w * a.h)[0];
      if (big) { aerial = { src: big.src, page: url }; break; }
    }
    // 받기: 홈페이지에서 연 그대로(Referer 포함) 받아 파일로
    await mkdir(outDir, { recursive: true });
    const get = async (src) => { const r = await page.request.get(src, { headers: { Referer: origin + '/' } }); if (!r.ok()) throw new Error(`${r.status()} ${src}`); const b = await r.body(); if (b.length < 20000) throw new Error(`너무 작음 ${src}`); return b; };
    const ext = (src) => (/\.png(\?|$)/i.test(src) ? 'png' : 'jpg');
    const images = [];
    for (const area of areas) {
      const f = found.get(area);
      if (!f) continue;
      try {
        const file = join(outDir, `plan_${area}.${ext(f.src)}`).replace(/\\/g, '/');
        await writeFile(file, await get(f.src));
        images.push({ key: `plan:${area}`, file: file.replace(ROOT.replace(/\\/g, '/'), '').replace(/^\//, ''), alt: `전용 ${area}㎡${f.letter ? ` ${area}${f.letter}` : ''} 평면도`, type: `${area}${f.letter}`, source: f.page });
      } catch (e) { console.log(`- 평면도 ${area} 받기 실패: ${e.message}`); }
    }
    if (aerial) {
      try {
        const file = join(outDir, `aerial.${ext(aerial.src)}`).replace(/\\/g, '/');
        await writeFile(file, await get(aerial.src));
        images.push({ key: 'aerial', file: file.replace(ROOT.replace(/\\/g, '/'), '').replace(/^\//, ''), alt: '단지 조감도(분양 홈페이지)', source: aerial.page });
      } catch (e) { console.log(`- 조감도 받기 실패: ${e.message}`); }
    }
    return { images, planPages, aerialPages };
  } catch (e) {
    return { skip: e.message.split('\n')[0] };
  } finally {
    clearTimeout(kill);
    await browser.close().catch(() => {});
  }
}

// ── 청약홈 입주자모집공고문 PDF에서(홈페이지에 없는 주택형만) ─────────────────────────
// 2026-10-24 실측(고덕강일 3단지): 상세 페이지의 getAtchmnfl.do 링크가 공고문 PDF, 평면도 쪽은 그림이 아닌 선 도면이라
// 브라우저 안 pdf.js로 쪽을 그려 낸다. 쪽 글자의 「(주거)전용면적 49.96」으로 주택형을 맞추고, 같은 면적이면 앞 쪽(A 타입).
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
export async function noticePlans(no, areas, outDir, { wantAerial = true } = {}) {
  const detail = `https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=${no}&pblancNo=${no}`;
  const html = await (await fetch(detail, { headers: { 'User-Agent': UA } })).text();
  const pdfUrl = (html.match(/https:\/\/static\.applyhome\.co\.kr\/ai\/aia\/getAtchmnfl\.do\?[^"'\s<]+/) || [])[0]?.replace(/&amp;/g, '&');
  if (!pdfUrl) return { skip: '공고문 PDF 링크 없음' };
  const r = await fetch(pdfUrl, { headers: { 'User-Agent': UA, Referer: 'https://www.applyhome.co.kr/' } });
  if (!r.ok) return { skip: `공고문 PDF ${r.status}` };
  const pdf = Buffer.from(await r.arrayBuffer());
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<script src="${PDFJS}/pdf.min.js"></script>`);
    await page.waitForFunction(() => window.pdfjsLib, null, { timeout: 30000 });
    const picked = await page.evaluate(async ({ b64, areas, PDFJS, wantAerial }) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
      const doc = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) }).promise;
      const plans = {}; let aerial = null;
      for (let n = 1; n <= Math.min(doc.numPages, 150); n++) {
        const pg = await doc.getPage(n);
        const t = (await pg.getTextContent()).items.map((i) => i.str).join(' ').replace(/\s+/g, ' ');
        // 조감도: 글자가 적고(안내문 쪽 제외 — 주의사항 속 "조감도" 단어에 걸렸던 실측) 그림이 들어 있는 쪽
        if (wantAerial && !aerial && /조감도/.test(t) && !/개요|지역도|목차/.test(t) && t.length < 1500) {
          const ops = await pg.getOperatorList();
          if (ops.fnArray.includes(pdfjsLib.OPS.paintImageXObject)) aerial = n;
        }
        if (!/평면/.test(t) || t.length > 3000) continue; // 평면도 쪽은 글자가 적다(표·안내문 쪽 제외)
        const m = t.match(/(?:주거\s*)?전용\s*면적\s*:?\s*(\d{2,3}(?:\.\d+)?)/);
        if (!m) continue;
        const area = areas.find((a) => Math.floor(+m[1]) === a || Math.round(+m[1]) === a);
        if (!area || plans[area]) continue;
        const letter = (t.match(new RegExp(`\\b${area}\\s?([A-Z])\\b`)) || [])[1] || '';
        plans[area] = { n, letter };
      }
      const draw = async (n) => { const pg = await doc.getPage(n); const vp = pg.getViewport({ scale: 1.5 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: ctx, viewport: vp }).promise; return c.toDataURL('image/jpeg', 0.85); };
      const out = {};
      for (const [a, v] of Object.entries(plans)) out[a] = { ...v, url: await draw(v.n) };
      return { plans: out, aerial: aerial ? { n: aerial, url: await draw(aerial) } : null };
    }, { b64: pdf.toString('base64'), areas, PDFJS, wantAerial });
    await mkdir(outDir, { recursive: true });
    const rel = (f) => f.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/'), '').replace(/^\//, '');
    const images = [];
    for (const [a, v] of Object.entries(picked.plans)) {
      const file = join(outDir, `plan_${a}.jpg`);
      await writeFile(file, Buffer.from(v.url.split(',')[1], 'base64'));
      images.push({ key: `plan:${a}`, file: rel(file), alt: `전용 ${a}㎡${v.letter ? ` ${a}${v.letter}` : ''} 평면도(입주자모집공고문 ${v.n}쪽)`, type: `${a}${v.letter}`, origin: `notice:${v.n}` });
    }
    if (picked.aerial) {
      const file = join(outDir, 'aerial.jpg');
      await writeFile(file, Buffer.from(picked.aerial.url.split(',')[1], 'base64'));
      images.push({ key: 'aerial', file: rel(file), alt: `단지 조감도(입주자모집공고문 ${picked.aerial.n}쪽)`, origin: `notice:${picked.aerial.n}` });
    }
    return { images, pdfUrl };
  } catch (e) {
    return { skip: e.message.split('\n')[0] };
  } finally { await browser.close().catch(() => {}); }
}

// 홈페이지 먼저, 없는 주택형·조감도만 공고문 PDF에서
export async function plansFor(f, outDir) {
  const areas = f.types.map((g) => g.area);
  const home = await findPlans(f.detail.homepage, areas, outDir, { name: f.item.name }).catch((e) => ({ skip: e.message }));
  const images = (home.images || []).map((i) => ({ ...i, origin: 'home' }));
  const missing = areas.filter((a) => !images.some((i) => i.key === `plan:${a}`));
  const needAerial = !images.some((i) => i.key === 'aerial');
  if (missing.length || needAerial) {
    const nt = await noticePlans(f.detail.no, missing, outDir, { wantAerial: needAerial }).catch((e) => ({ skip: e.message }));
    if (nt.skip) console.log(`- 공고문 PDF: ${nt.skip}`);
    images.push(...(nt.images || []));
  }
  if (home.skip) console.log(`- 홈페이지 평면도: ${home.skip}`);
  return images.map(({ key, file, alt, type, origin }) => ({ key, file, alt, type, origin }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const no = process.argv[2];
  const d = JSON.parse(await readFile(join(ROOT, 'drafts', `analysis_${no}.json`), 'utf8'));
  const areas = d.facts.types.map((g) => g.area);
  const r = await findPlans(d.facts.detail.homepage, areas, join(ROOT, 'drafts', `analysis_${no}.img`));
  console.log(JSON.stringify(r, null, 1));
  process.exit(0);
}

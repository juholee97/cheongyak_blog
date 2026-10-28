// 입주자모집공고문(청약홈 PDF) 글자에서 분양분석 글에 쓸 조건을 읽는다(2026-10-29 사용자 지시: 첫 분석 글 수준의 깊이).
// 읽는 것: 재당첨·전매·거주의무 기간, 납부 비율, 중도금·잔금 대출 안내, 토지임대료·보증금 전환·임대차 기간(토지임대부), 동·층별 공급금액(주택형별 최저~최고), 주택형별 침실 수, 소득 기준 금액.
// 값마다 쪽 번호를 남기고, 모양이 안 맞으면(합계 검산 실패·청약홈 최고가와 불일치·비율 합 100 아님) 그 항목은 비운다 — 글은 "공고문 확인"으로 둔다.
// node posts/notice_terms.mjs 2026000373     읽은 조건 출력(공고문 글자는 data/notice_text/{번호}.json에 보관 — 다시 받지 않음)
// node posts/notice_terms.mjs --check        자체 점검(공고문 3편에서 옮긴 짧은 글줄)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { INCOME } from './money.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174'; // posts/floorplan.mjs와 같은 판
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// 공고문 쪽별 글자(floorplan.mjs noticePlans와 같은 경로: 상세 페이지의 getAtchmnfl.do → 브라우저 안 pdf.js)
export async function noticeText(no) {
  const file = join(ROOT, 'data', 'notice_text', `${no}.json`);
  const cached = await readFile(file, 'utf8').then(JSON.parse, () => null);
  if (cached?.pages?.length) return cached;
  const html = await (await fetch(`https://www.applyhome.co.kr/ai/aia/selectAPTLttotPblancDetail.do?houseManageNo=${no}&pblancNo=${no}`, { headers: { 'User-Agent': UA } })).text();
  const pdfUrl = (html.match(/https:\/\/static\.applyhome\.co\.kr\/ai\/aia\/getAtchmnfl\.do\?[^"'\s<]+/) || [])[0]?.replace(/&amp;/g, '&');
  if (!pdfUrl) return { skip: '공고문 PDF 링크 없음' };
  const r = await fetch(pdfUrl, { headers: { 'User-Agent': UA, Referer: 'https://www.applyhome.co.kr/' } });
  if (!r.ok) return { skip: `공고문 PDF ${r.status}` };
  const b64 = Buffer.from(await r.arrayBuffer()).toString('base64');
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<script src="${PDFJS}/pdf.min.js"></script>`);
    await page.waitForFunction(() => window.pdfjsLib, null, { timeout: 30000 });
    const pages = await page.evaluate(async ({ b64, PDFJS }) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
      const doc = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) }).promise;
      const out = [];
      for (let n = 1; n <= Math.min(doc.numPages, 200); n++) out.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(' ').replace(/\s+/g, ' '));
      return out;
    }, { b64, PDFJS });
    const got = { no, pdfUrl, fetched: new Date().toISOString().slice(0, 10), pages };
    await mkdir(join(ROOT, 'data', 'notice_text'), { recursive: true });
    await writeFile(file, JSON.stringify(got));
    return got;
  } catch (e) {
    return { skip: e.message.split('\n')[0] };
  } finally {
    await browser.close();
  }
}

const num = (s) => +String(s).replace(/[,\s]/g, '');
const first = (pages, re) => { for (let i = 0; i < pages.length; i++) { const m = pages[i].match(re); if (m) return { m, p: i + 1 }; } return null; };

// 재당첨·전매·거주의무: 민영 공고 1쪽 「단지 주요정보」 칸(머리글 다음에 값이 차례로) 또는 SH식 「구분 기준일 기간」 표
function periodsOf(pages) {
  const yr = (v) => (/없음/.test(v) ? 0 : num(v.match(/\d+/)[0]));
  const a = first(pages, /재당첨\s*제한\s*전매\s*제한\s*거주\s*의무\s*기간\s*분양가\s*상한제\s*택지\s*유형\s*(\d+\s*년|없음)\s*(\d+\s*년|없음)\s*(\*\s*[^*]*?\)\s*)?(\d+\s*년|없음)/);
  if (a) {
    const note = a.m[3] ? a.m[3].replace(/^\*\s*/, '').replace(/\s*([(),])\s*/g, '$1').replace(/,/g, ', ').replace(/\s+/g, ' ').trim() : null;
    const from = pages.some((t) => /전매\s*제한\s*기간[\s\S]{0,200}당첨자\s*발표일로부터/.test(t)) ? '당첨자 발표일' : null;
    return { rewin: { y: yr(a.m[1]), from }, resale: { y: yr(a.m[2]), from, note }, residence: { y: yr(a.m[4]), from: yr(a.m[4]) ? '최초 입주가능일' : null }, p: a.p };
  }
  for (let i = 0; i < pages.length; i++) {
    const rows = [...pages[i].matchAll(/(재당첨\s*제한|전매\s*제한|거주\s*의무)\s+(당첨자\s*발표일|최초\s*입주\s*가능일|입주\s*가능일|소유권\s*이전\s*등기일)\s+(\d+)\s*년/g)];
    if (rows.length < 2) continue;
    const by = Object.fromEntries(rows.map((m) => [m[1].replace(/\s/g, ''), { y: +m[3], from: m[2].replace(/\s+/g, ' ').replace('최초 입주 가능일', '최초 입주가능일') }]));
    return { rewin: by['재당첨제한'] || null, resale: by['전매제한'] || null, residence: by['거주의무'] || null, p: i + 1 };
  }
  return null;
}

// 동·층별 공급금액: 줄마다 「대지비+건축비+부가세 = 계」 또는 「계 = 계약금+중도금…+잔금」이 맞는 숫자를 그 줄의 공급금액으로 본다.
// 주택형 표기(059.0000B·84A)는 다음 표기가 나올 때까지(표가 다음 쪽으로 이어져도) 이어진다. 같은 쪽 발코니·옵션 표 금액이 섞이므로
// 주택형마다 청약홈 최고가(만원)의 80~100%인 금액만 받고, 그 안의 가장 큰 금액이 최고가와 맞아야 쓴다(단위 원·천원도 이것으로 정함).
// 2026-10-29 실측: 3편의 1층 최저가는 최고가의 90~96%, 발코니(원)·옵션 금액은 이 범위 밖.
const TYPE_LONG = /^0?(\d{2,3})\.(\d{2,4})([A-Z]{1,2}\d?)$/, TYPE_SHORT = /^(\d{2,3})([A-Z]{1,2}\d?)$/, BIG = /^\d{1,3}(,\d{3})+$/;
function pricesOf(pages, models) {
  const want = new Map((models || []).map((m) => [String(m.HOUSE_TY).trim(), +m.LTTOT_TOP_AMOUNT || 0])); // "049.0000A" → 최고가(만원)
  if (!want.size) return null;
  const keyOf = (area, letter) => [...want.keys()].find((k) => +k.slice(0, 3) === +area && k.slice(-letter.length) === letter && /^[A-Z]/.test(k.slice(-letter.length)) && !/[A-Z]/.test(k.slice(-letter.length - 1, -letter.length))) || null;
  const totals = new Map();
  let cur = null;
  pages.forEach((t, i) => {
    if (!cur && !/공급\s*금액|주택\s*가격|분양\s*가격/.test(t)) return; // 표 머리글 없는 쪽은 앞 쪽 표가 이어질 때만
    let run = [], found = 0;
    const flush = () => {
      const r = run; run = [];
      if (!cur || r.length < 3) return;
      for (let k = 0; k < r.length; k++) {
        const before = r.slice(Math.max(0, k - 3), k), after = r.slice(k + 1);
        const pre = before.length >= 2 && [2, 3].some((j) => j <= before.length && before.slice(-j).reduce((s, v) => s + v, 0) === r[k]);
        let post = false, s = 0;
        for (let j = 0; j < after.length && !post; j++) { s += after[j]; if (j >= 1 && s === r[k]) post = true; }
        if (r[k] > 0 && (pre || post)) { if (!totals.has(cur)) totals.set(cur, []); totals.get(cur).push([r[k], i + 1]); found++; return; }
      }
    };
    for (const tok of t.split(' ')) {
      const L = tok.match(TYPE_LONG), S = !L && tok.match(TYPE_SHORT);
      if (L || S) { flush(); const k = L ? keyOf(L[1], L[3]) : keyOf(S[1], S[2]); if (k) cur = k; continue; }
      if (BIG.test(tok)) { run.push(num(tok)); continue; }
      if (tok === '-' && run.length) { run.push(0); continue; }
      flush();
    }
    flush();
    if (!found) cur = null; // 이 쪽에 금액 줄이 없으면 표가 끝난 것
  });
  if (!totals.size) return null;
  const byType = {}, pagesUsed = new Set();
  for (const [k, vs] of totals) {
    const top = want.get(k) * 10000;
    for (const u of [1, 1000]) { // 원 표 또는 천원 표(주택가격(천원))
      const ok = vs.map(([v, p]) => [v * u, p]).filter(([v]) => v >= top * 0.8 && v < top + 10000);
      if (!ok.length || Math.abs(Math.max(...ok.map(([v]) => v)) - top) >= 10000) continue;
      byType[k] = { min: Math.min(...ok.map(([v]) => v)), max: Math.max(...ok.map(([v]) => v)), rows: ok.length };
      ok.forEach(([, p]) => pagesUsed.add(p));
      break;
    }
  }
  // 전용면적(정수)별로 묶되, 그 면적의 모든 주택형이 맞았을 때만(빠진 타입이 있으면 최저가가 틀릴 수 있다)
  const byArea = {};
  for (const k of want.keys()) {
    const a = +k.slice(0, 3);
    if (!byArea[a]) byArea[a] = { min: Infinity, max: 0, types: 0, ok: true };
    const v = byType[k];
    if (!v) { byArea[a].ok = false; continue; }
    byArea[a].min = Math.min(byArea[a].min, v.min); byArea[a].max = Math.max(byArea[a].max, v.max); byArea[a].types++;
  }
  const good = Object.fromEntries(Object.entries(byArea).filter(([, v]) => v.ok && v.types).map(([a, v]) => [a, { min: v.min, max: v.max, types: v.types }]));
  return Object.keys(good).length ? { byArea: good, pages: [...pagesUsed].sort((x, y) => x - y).slice(0, 3) } : null;
}

// 주택형별 침실 수: 평면도 쪽(글자가 적고 「전용면적 49.96」이 하나뿐인 쪽)의 「침실N」 가장 큰 N. 면적마다 가장 많이 나온 값
function roomsOf(pages) {
  const seen = {};
  pages.forEach((t, i) => {
    if (t.length > 3000 || !/평면/.test(t)) return;
    const areas = [...new Set([...t.matchAll(/전용\s*면적\s*:?\s*(\d{2,3})\.\d+/g)].map((m) => +m[1]))];
    const beds = [...t.matchAll(/침실\s*(\d)/g)].map((m) => +m[1]);
    if (areas.length !== 1 || !beds.length) return;
    (seen[areas[0]] = seen[areas[0]] || []).push({ bed: Math.max(...beds), p: i + 1 });
  });
  const out = {};
  for (const [a, xs] of Object.entries(seen)) {
    const cnt = {}; xs.forEach((x) => { cnt[x.bed] = (cnt[x.bed] || 0) + 1; });
    const bed = +Object.entries(cnt).sort((x, y) => y[1] - x[1])[0][0];
    out[a] = { bed, p: xs.find((x) => x.bed === bed).p };
  }
  return Object.keys(out).length ? out : null;
}

// 가구원수별 소득 기준: 공고문 소득 표에 「3인 이하·4인·5인」 금액이 나란히 나오는 비율(%)만 모은다. 금액이 기준값×비율과 같아야 한다
// (기준값 = money.mjs INCOME, 2025년도 도시근로자 월평균소득). 표의 블록 이름은 공고마다 섞여 나와 유형별로 붙이지 않는다 — 글은 「공고문 n쪽 표」를 가리킨다.
export function incomePctsOf(pages, base) {
  const fmt = (v) => v.toLocaleString('en-US');
  // 3인 이하·4인·5인 금액이 나란히 있으면 그 비율, 그런 표가 없는 공고(민영 일부)는 3인 이하 금액이 따로 나오는 비율
  for (const single of [false, true]) {
    const found = new Map();
    for (let pct = 50; pct <= 200; pct += 10) {
      const [a, b, c] = [3, 4, 5].map((n) => fmt(Math.round((base[n] * pct) / 100)));
      const re = single ? new RegExp(`\\b${a}\\b`) : new RegExp(`${a}\\s*원?\\s*${b}\\s*원?\\s*${c}`);
      const i = pages.findIndex((t) => re.test(t));
      if (i >= 0) found.set(pct, i + 1);
    }
    if (found.size) return { pcts: [...found.keys()], p: Math.min(...found.values()), single };
  }
  return null;
}

export function termsOf(doc, models = []) {
  const pages = doc?.pages || [];
  if (!pages.length) return null;
  const out = { src: doc.pdfUrl || null, fetched: doc.fetched || null, pages: pages.length };
  out.periods = periodsOf(pages);
  out.prices = pricesOf(pages, models);
  // 납부 비율: 공급금액 표 쪽(없으면 처음 나오는 쪽)의 「계약금(5%) 중도금(60%) 잔금(35%)」 — 합이 100일 때만
  const payRe = /계약금\s*\(\s*(?:계약\s*시\s*)?(\d{1,2})\s*%\s*\)\s*(?:중도금\s*\(\s*(\d{1,2})\s*%\s*\)\s*)?잔금\s*\(\s*(?:입주\s*시\s*)?(\d{1,2})\s*%\s*\)/;
  const payPages = [...(out.prices?.pages || []), ...pages.map((_, i) => i + 1)];
  for (const p of payPages) {
    const m = pages[p - 1].match(payRe);
    if (m && +m[1] + +(m[2] || 0) + +m[3] === 100) { out.pay = { down: +m[1], mid: +(m[2] || 0), bal: +m[3], p }; break; }
  }
  const ml = first(pages, /중도금\s*(?:대출|융자)[^■]{0,200}?(이자\s*후불제|무이자)[^■]{0,120}/);
  if (ml) { const pct = ml.m[0].match(/(\d{2})\s*%\s*(?:범위|이내)/); out.midLoan = { kind: ml.m[1].replace(/\s/g, ''), pct: pct ? +pct[1] : null, p: ml.p }; }
  const bl = first(pages, /잔금\s*대출\s*안내\)?[^■]{0,300}?(주택도시기금\s*[^\s]*\s*모기지|[가-힣]+\s*모기지)[^■]{0,120}?최대\s*(\d+)\s*억\s*원\s*한도\s*\(\s*LTV\s*최대\s*(\d+)\s*%\s*,\s*만기\s*최장\s*(\d+)\s*년\s*,\s*(고정|변동)?\s*금리\s*([\d.]+)\s*~\s*([\d.]+)\s*%/);
  if (bl) out.balLoan = { kind: bl.m[1].replace(/\s+/g, ' '), limit: +bl.m[2] * 10000, ltv: +bl.m[3], years: +bl.m[4], fixed: bl.m[5] === '고정', rate: [+bl.m[6], +bl.m[7]], p: bl.p };
  // 토지임대부: 월 토지임대료 표·보증금 전환 예시·임대차 기간
  const lr = first(pages, /토지\s*임대료\s*전용\s*면적\s*\(㎡\)\s*토지\s*임대료\s*\(원\s*\/\s*월\)\s*비\s*고\s*((?:\d{2,3}\s+[\d,]{5,}\s+전용\s*\d{2,3}\s*㎡[^0-9]*)+)/);
  if (lr) out.landRent = { rows: [...lr.m[1].matchAll(/(\d{2,3})\s+([\d,]{5,})\s+전용/g)].map((m) => ({ area: +m[1], won: num(m[2]) })), p: lr.p };
  const cv = first(pages, /보증금\s*전환\s*예시\]?\s*전용\s*면적\s*\(㎡\)[^0-9]*?((?:\d{2,3}\s+[\d,]{5,}\s+\d{1,3}\s*%\s+[\d.]+\s*%\s+[\d,]{7,}\s+[\d,]{5,}\s*)+)/);
  if (cv) {
    const rows = [...cv.m[1].matchAll(/(\d{2,3})\s+([\d,]{5,})\s+(\d{1,3})\s*%\s+([\d.]+)\s*%\s+([\d,]{7,})\s+([\d,]{5,})/g)].map((m) => ({ area: +m[1], before: num(m[2]), ratio: +m[3], rate: +m[4], deposit: num(m[5]), after: num(m[6]) }));
    // 검산: 전환 후 = 전환 전 − 보증금×이율÷12(10원 아래 버림), 보증금 ≤ 전환 전×비율×12÷이율
    const ok = rows.length && rows.every((r) => Math.floor((r.before - (r.deposit * r.rate) / 100 / 12) / 10) * 10 === r.after && r.deposit <= (r.before * r.ratio * 12) / r.rate);
    if (ok) out.conversion = { rows, p: cv.p };
  }
  const ls = first(pages, /(\d{2})\s*년\s*이내의\s*임대차\s*기간\s*\(\s*토지임대부\s*분양주택\s*소유자의\s*(\d{2})\s*퍼센트\s*이상이\s*계약갱신을\s*청구하는\s*경우\s*(\d{2})\s*년의\s*범위에서\s*갱신/);
  if (ls) out.lease = { years: +ls.m[1], renewPct: +ls.m[2], renewYears: +ls.m[3], p: ls.p };
  out.rooms = roomsOf(pages);
  out.income = incomePctsOf(pages, INCOME);
  // 공공분양 총자산 기준(토지임대부·나눔형 362백만원, public.md 6-3)이 공고문에 적혀 있는지
  const assetAt = pages.findIndex((t) => /362\s*백만\s*원|362,000,000\s*원|3억\s*6,?200만\s*원/.test(t));
  out.asset = assetAt >= 0 ? { total: 362000000, p: assetAt + 1 } : null;
  return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href; // 다른 스크립트의 --check에서 불릴 때는 돌지 않게
if (isMain && process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  // 기간: 민영 1쪽(2026000530) · 각주 달린 전매(2026000496) · SH 표(2026000373)
  const p530 = ['※ 단지 주요정보 재당첨제한 전매제한 거주의무기간 분양가상한제 택지유형 10 년 3 년 없음 적용 대규모 택지개발지구', '전매제한기간 3 년간 ( 단 , 소유권이전등기를 완료한 경우 소유권이전등기를 완료한 때 ) 당첨된 주택의 구분 적용기간 ( 당첨자 발표일로부터 )'];
  let t = termsOf({ pages: p530 });
  assert.deepEqual([t.periods.rewin.y, t.periods.resale.y, t.periods.residence.y, t.periods.resale.from, t.periods.p], [10, 3, 0, '당첨자 발표일', 1]);
  t = termsOf({ pages: ['재당첨제한 전매제한 거주의무기간 분양가상한제 택지유형 10 년 3 년 * 소유권이전등기일까지 ( 다만 , 그 기간이 3 년을 초과하는 경우 3 년 ) 없음 적용 공공택지'] });
  assert.equal(t.periods.resale.y, 3); assert.equal(t.periods.residence.y, 0); assert.match(t.periods.resale.note, /^소유권이전등기일까지\(다만, 그 기간이 3 년을 초과하는 경우 3 년\)$/);
  t = termsOf({ pages: ['x', '구분 기준일 (~로부터) 기간 관련법령 재당첨제한 당첨자 발표일 10년 「주택공급에 관한 규칙」 제54조 전매제한 당첨자 발표일 10년 「주택법」 제64조 거주의무 최초 입주가능일 5년 「주택법」 제57조의2'] });
  assert.deepEqual([t.periods.rewin.y, t.periods.resale.y, t.periods.residence.y, t.periods.residence.from, t.periods.p], [10, 10, 5, '최초 입주가능일', 2]);
  // 공급금액(천원·계 = 계약금+잔금) — 주택형마다 최고가가 청약홈 값과 맞을 때만
  const models = [{ HOUSE_TY: '059.0000B', LTTOT_TOP_AMOUNT: '37912' }, { HOUSE_TY: '049.0000F', LTTOT_TOP_AMOUNT: '30800' }];
  t = termsOf({ pages: ['동 호 주택형 평면유형 주택가격(천원) 발코니 확장비용 (원, 부가세 포함) 계 계약금 (계약 시 10%) 잔금 (입주 시 90%) 301 201 059.0000B 59B 371,544 37,154 334,390 5,825,600 301 203 049.0000F 49F 301,842 30,184 271,658 2,506,900 301 301 059.0000B 59B 379,126 37,913 341,213 5,825,600 301 304 049.0000F 49F 308,002 30,800 277,202 2,506,900'] }, models);
  assert.deepEqual(t.prices.byArea['59'], { min: 371544000, max: 379126000, types: 1 });
  assert.deepEqual(t.prices.byArea['49'], { min: 301842000, max: 308002000, types: 1 });
  assert.deepEqual(t.pay, { down: 10, mid: 0, bal: 90, p: 1 });
  // 원 단위·대지비+건축비+부가세 = 계(2026000530), 동 목록 「201,202,203」은 금액이 아님
  t = termsOf({ pages: ['■ 공급금액 및 납부일정 ( 단위 : 원 ) 계약금 (5%) 중도금 (60%) 잔금 (35%) 084.3473A 84A 301 동 (2,4,5 호 ) 1 층 5 401,517,200 341,482,800 - 743,000,000 37,150,000 74,300,000 74,300,000 74,300,000 74,300,000 74,300,000 74,300,000 260,050,000 201,202,203 동 5 층 이상 180 446,370,400 379,629,600 - 826,000,000 41,300,000 82,600,000 82,600,000 82,600,000 82,600,000 82,600,000 82,600,000 289,100,000'] }, [{ HOUSE_TY: '084.3473A', LTTOT_TOP_AMOUNT: '82600' }]);
  assert.deepEqual(t.prices.byArea['84'], { min: 743000000, max: 826000000, types: 1 });
  assert.deepEqual([t.pay.down, t.pay.mid, t.pay.bal], [5, 60, 35]);
  // 최고가가 안 맞으면 쓰지 않는다
  assert.equal(termsOf({ pages: ['공급금액 084.3473A 401,517,200 341,482,800 - 743,000,000 37,150,000'] }, [{ HOUSE_TY: '084.3473A', LTTOT_TOP_AMOUNT: '82600' }]).prices, null);
  // 대출 안내·토지임대료·전환 예시·임대차(2026000373 44·46·81·82쪽 글줄)
  t = termsOf({ pages: [
    '■ (잔금 대출 안내) 본 주택은 사전청약 당첨자와 본 입주자모집공고를 통해 당첨된 자 모두 소득·자산, 주택가격 등과 관계없이 주택도시기금 전용 모기지 대출을 지원할 예정이며, 대출심사를 거쳐 최대 5억원 한도(LTV 최대 80%, 만기 최장 40년, 고정금리 1.9~3.0% 등) 내에서 대출이 가능함',
    '그 토지 위에 40년 이내의 임대차기간 (토지임대부 분양주택 소유자의 75퍼센트 이상이 계약갱신을 청구하는 경우 40년의 범위에서 갱신이 가능) 동안 지상권이 설정된 것으로 봅니다.',
    '5. 토지임대료 전용면적(㎡) 토지임대료(원/월) 비 고 49 426,000 전용 49㎡ 전체 주택형에 동일 적용 59 511,500 전용 59㎡ 전체 주택형에 동일 적용',
    '[토지임대료 보증금 전환 예시] 전용면적(㎡) 전환 전 토지임대료(원/월) 보증금 전환율 전환이율 전환보증금 전환 후 토지임대료 49 426,000 60% 2.5% 122,000,000 171,830 59 511,500 60% 2.5% 147,000,000 205,250 6. 분양금 납부 안내',
    '중도금 대출은 공급대금의 60% 범위 ( 중도금 1 회부터 중도금 6 회까지 ) 내에서 이자후불제 조건으로 융자 알선을 할 예정',
  ] });
  assert.deepEqual(t.balLoan, { kind: '주택도시기금 전용 모기지', limit: 50000, ltv: 80, years: 40, fixed: true, rate: [1.9, 3.0], p: 1 });
  assert.deepEqual(t.lease, { years: 40, renewPct: 75, renewYears: 40, p: 2 });
  assert.deepEqual(t.landRent, { rows: [{ area: 49, won: 426000 }, { area: 59, won: 511500 }], p: 3 });
  assert.deepEqual(t.conversion.rows[1], { area: 59, before: 511500, ratio: 60, rate: 2.5, deposit: 147000000, after: 205250 });
  assert.deepEqual(t.midLoan, { kind: '이자후불제', pct: 60, p: 5 });
  // 침실 수: 평면도 쪽
  t = termsOf({ pages: ['평면도 전용면적 49.96 현관 거실 침실2 침실2 침실1 침실1 욕실', '평면도 전용면적 59.70 침실3 침실2 침실1'] });
  assert.deepEqual(t.rooms, { 49: { bed: 2, p: 1 }, 59: { bed: 3, p: 2 } });
  // 소득 기준 %: 3인 이하·4인·5인 금액이 나란히 나오는 표(2026000373 90쪽 글줄), 총자산 기준
  t = termsOf({ pages: ['x', '신생아 우선공급 (70%) 도시근로자 가구당 월평균소득액의 100% 7,533,763원 8,802,202원 9,326,985원 9,906,263원 일반공급 (20%) 도시근로자 가구당 월평균소득액의 140% 10,547,268원 12,323,083원 13,057,779원 ①+②+③+④ 합계액에서 ⑤를 차감한 금액이 362백만원 이하'] });
  assert.deepEqual(t.income, { pcts: [100, 140], p: 2, single: false }); assert.deepEqual(t.asset, { total: 362000000, p: 2 });
  console.log('notice_terms 점검 통과');
} else if (isMain) {
  const no = process.argv[2];
  if (!/^\d{10}$/.test(no || '')) { console.log('사용: node posts/notice_terms.mjs <공고번호10자리> | --check'); process.exit(1); }
  const { odcloud } = await import('./analysis_post.mjs');
  const { dataKey } = await import('./trades.mjs');
  const doc = await noticeText(no);
  if (doc.skip) { console.log('공고문 못 읽음:', doc.skip); process.exit(2); }
  console.log(JSON.stringify(termsOf(doc, await odcloud('getAPTLttotPblancMdl', no, await dataKey())), null, 1));
}

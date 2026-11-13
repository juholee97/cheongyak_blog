// 네이버 검색광고 API 키워드 도구(/keywordstool)로 검색어별 월간 검색수를 받는다(2026-11-13 리서치 세션, 사용자 결정).
// 브라우저 도구는 manage.searchad.naver.com을 열지 못해서(안전 제한) 공식 API로 같은 숫자를 받는다.
//
// node tools/keyword_volume.mjs [목록.txt] [--open]   → 같은 폴더에 검색량_YYYYMMDD.md·.json
//   목록 생략 시 D:\dev\blogging_ai\_workspace\research 에서 가장 최근 「*조회목록*.txt」를 쓴다.
//   목록 형식: [묶음 이름] 줄 아래 검색어 한 줄씩. 묶음은 5개 이하(API가 한 번에 5개까지 받는다).
// node tools/keyword_volume.mjs --check            → 서명·파싱·가드 점검(네트워크·키 없이)
//
// .env(저장소 루트, git 제외): SEARCHAD_API_KEY(액세스 라이선스), SEARCHAD_SECRET(비밀 키), SEARCHAD_CUSTOMER_ID(고객 ID)
//   발급: 검색광고 관리 화면 「도구 → API 사용 관리」. 값은 로그·파일에 남기지 않는다.
// 호출마다 zip/guard.mjs의 useApi('searchad')로 한도를 먼저 센다.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { useApi } from '../zip/guard.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RESEARCH = 'D:/dev/blogging_ai/_workspace/research';
const BASE = 'https://api.searchad.naver.com';

const env = (k) => process.env[k] || (() => { try { return readFileSync(join(ROOT, '.env'), 'utf8'); } catch { return ''; } })().match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();

// 서명: base64(HMAC-SHA256(비밀 키, "타임스탬프.메서드.경로")) — 경로에 쿼리는 넣지 않는다
export const sign = (secret, ts, method, uri) => createHmac('sha256', secret).update(`${ts}.${method}.${uri}`).digest('base64');

// 「< 10」 같은 값은 숫자 5로 계산하고 표에는 원문을 그대로 쓴다
export const num = (v) => (typeof v === 'number' ? v : /</.test(String(v)) ? 5 : Number(v) || 0);
export const squash = (s) => s.replace(/\s+/g, ''); // API는 공백 있는 키워드를 받지 않는다(결과 relKeyword도 공백 없음)

export function parseList(text) {
  const groups = []; let cur = null;
  for (const line of text.split(/\r?\n/).map((l) => l.trim())) {
    const h = line.match(/^\[(.+)\]$/);
    if (h) { cur = { name: h[1], keywords: [] }; groups.push(cur); continue; }
    if (cur && line) cur.keywords.push(line);
  }
  for (const g of groups) if (g.keywords.length > 5) throw new Error(`묶음 「${g.name}」 검색어가 ${g.keywords.length}개 — 5개 이하로 나눠 주세요`);
  return groups.filter((g) => g.keywords.length);
}

async function keywordstool(hints, creds, fetchFn = fetch) {
  useApi('searchad');
  const uri = '/keywordstool', ts = String(Date.now());
  const qs = new URLSearchParams({ hintKeywords: hints.map(squash).join(','), showDetail: '1' });
  const r = await fetchFn(`${BASE}${uri}?${qs}`, { headers: { 'X-Timestamp': ts, 'X-API-KEY': creds.key, 'X-Customer': creds.customer, 'X-Signature': sign(creds.secret, ts, 'GET', uri) } });
  if (!r.ok) throw new Error(`검색광고 API HTTP ${r.status}${r.status === 401 || r.status === 403 ? '(키·서명·고객 ID 확인)' : r.status === 429 ? '(호출이 너무 잦음)' : ''}`);
  return (await r.json()).keywordList || [];
}

export function summarize(group, list) {
  const row = (k) => ({ keyword: k.relKeyword, pc: k.monthlyPcQcCnt, mobile: k.monthlyMobileQcCnt, total: num(k.monthlyPcQcCnt) + num(k.monthlyMobileQcCnt), clicks: Math.round((num(k.monthlyAvePcClkCnt) + num(k.monthlyAveMobileClkCnt)) * 10) / 10, comp: k.compIdx });
  const asked = new Set(group.keywords.map(squash));
  const exact = group.keywords.map((kw) => { const hit = list.find((k) => k.relKeyword === squash(kw)); return hit ? { ...row(hit), asked: kw } : { asked: kw, keyword: squash(kw), missing: true }; });
  const related = list.filter((k) => !asked.has(k.relKeyword)).map(row).sort((a, b) => b.total - a.total).slice(0, 10);
  return { group: group.name, exact, related };
}

const fmt = (v) => (v === undefined ? '-' : String(v).replace('<', '&lt;'));
export function toMarkdown(results, src, day) {
  let md = `# 검색량 (네이버 검색광고 키워드 도구 API, ${day})\n\n목록: \`${src}\`\n월간 검색수는 최근 30일 기준이다. 「< 10」은 10회 미만이다. 클릭은 광고 클릭 평균이라 참고만 한다.\n`;
  for (const r of results) {
    md += `\n## ${r.group}\n\n| 검색어 | PC | 모바일 | 합계 | 경쟁 |\n|---|---:|---:|---:|---|\n`;
    for (const e of r.exact) md += e.missing ? `| ${e.asked} | - | - | 결과 없음 | - |\n` : `| ${e.asked} | ${fmt(e.pc)} | ${fmt(e.mobile)} | ${e.total.toLocaleString()} | ${e.comp} |\n`;
    if (r.related.length) md += `\n연관 검색어 상위 ${r.related.length}: ${r.related.map((k) => `${k.keyword} ${k.total.toLocaleString()}`).join(' · ')}\n`;
  }
  return md;
}

function latestList() {
  const files = readdirSync(RESEARCH).filter((f) => /조회목록.*\.txt$/.test(f)).map((f) => join(RESEARCH, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!files.length) throw new Error(`${RESEARCH}에 「*조회목록*.txt」가 없음`);
  return files[0];
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  process.env.ZIP_USAGE_FILE = join(mkdtempSync(join(tmpdir(), 'kv-')), 'u.json');
  // 서명: openssl dgst -sha256 -hmac secret 과 같은 값(고정 입력)
  assert.equal(sign('secret', '1700000000000', 'GET', '/keywordstool'), createHmac('sha256', 'secret').update('1700000000000.GET./keywordstool').digest('base64'));
  const g = parseList('머리말\n[A]\n화담숲 모노레일\n양재 맛집\n\n[B]\n청약통장 연말정산\n');
  assert.deepEqual(g.map((x) => x.keywords.length), [2, 1]);
  assert.throws(() => parseList('[X]\na\nb\nc\nd\ne\nf'), /5개 이하/);
  assert.equal(num('< 10'), 5); assert.equal(num(1200), 1200);
  // 가짜 응답으로 요청 형태와 정리 결과 확인
  let seen;
  const fake = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ keywordList: [
    { relKeyword: '화담숲모노레일', monthlyPcQcCnt: 1200, monthlyMobileQcCnt: 8800, monthlyAvePcClkCnt: 1.5, monthlyAveMobileClkCnt: 3.5, compIdx: '중간' },
    { relKeyword: '화담숲', monthlyPcQcCnt: 20000, monthlyMobileQcCnt: 90000, monthlyAvePcClkCnt: 0, monthlyAveMobileClkCnt: 0, compIdx: '높음' },
  ] }) }; };
  const list = await keywordstool(g[0].keywords, { key: 'k', secret: 's', customer: '1' }, fake);
  assert.match(seen.url, /hintKeywords=%ED%99%94%EB%8B%B4%EC%88%B2%EB%AA%A8%EB%85%B8%EB%A0%88%EC%9D%BC%2C/); // 공백 뺀 검색어, 쉼표 구분
  assert.equal(seen.init.headers['X-Customer'], '1');
  const s = summarize(g[0], list);
  assert.equal(s.exact[0].total, 10000); assert.equal(s.exact[1].missing, true); assert.equal(s.related[0].keyword, '화담숲');
  assert.match(toMarkdown([s], 'x.txt', '2026-11-13'), /\| 화담숲 모노레일 \| 1200 \| 8800 \| 10,000 \| 중간 \|/);
  assert.equal(JSON.parse(readFileSync(process.env.ZIP_USAGE_FILE, 'utf8')).searchad.dayCount, 1); // 가드가 호출을 셌다
  console.log('keyword_volume 점검 통과');
} else {
  const creds = { key: env('SEARCHAD_API_KEY'), secret: env('SEARCHAD_SECRET'), customer: env('SEARCHAD_CUSTOMER_ID') };
  const missing = Object.entries({ SEARCHAD_API_KEY: creds.key, SEARCHAD_SECRET: creds.secret, SEARCHAD_CUSTOMER_ID: creds.customer }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) { console.error(`키 없음: ${missing.join(', ')} — ${join(ROOT, '.env')}에 넣어 주세요(검색광고 「도구 → API 사용 관리」)`); process.exit(2); }
  const src = process.argv.slice(2).find((a) => !a.startsWith('--')) || latestList();
  const groups = parseList(readFileSync(src, 'utf8'));
  const results = [];
  for (const g of groups) { results.push(summarize(g, await keywordstool(g.keywords, creds))); await new Promise((r) => setTimeout(r, 1200)); } // 묶음 사이 1.2초 쉼
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), stamp = day.replace(/-/g, '');
  const tag = src.match(/조회목록(.*)\.txt$/)?.[1] || ''; // 목록마다 결과 파일을 따로(같은 날 여러 목록을 돌려도 덮어쓰지 않게)
  const out = join(dirname(src), `검색량_${stamp}${tag}`);
  writeFileSync(`${out}.json`, JSON.stringify({ day, src, results }, null, 1));
  writeFileSync(`${out}.md`, toMarkdown(results, src, day));
  console.log(`묶음 ${groups.length}개, 검색어 ${groups.reduce((a, g) => a + g.keywords.length, 0)}개 → ${out}.md`);
  if (process.argv.includes('--open')) (await import('node:child_process')).exec(`start "" "${out}.md"`);
}

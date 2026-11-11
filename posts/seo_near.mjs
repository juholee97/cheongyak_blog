// 「2쪽 글을 1쪽으로」(2026-11-11 사용자): 서치콘솔에서 노출이 있고 평균 11~20위인 「검색어 × 글」을 뽑고,
// 그 검색어가 글 제목 앞 30자·첫 문단에 들어 있는지 표시한다. 고칠 글을 고르는 목록일 뿐, 글은 고치지 않는다.
// node posts/seo_near.mjs [--site https://aulee.tistory.com/] [--days 28] [--json]    결과는 data/seo_near.json에도 쌓는다
// node posts/seo_near.mjs --check                                                      판정 규칙 자체 점검(네트워크 없음)
// 키: 서비스 계정 JSON(GSC_KEY_FILE, 없으면 D:\dev\blog_ga_dashboard\keys의 것 — GA4 대시보드와 같은 읽기 전용 계정).
// 그 계정 이메일을 서치콘솔 속성에 사용자(제한)로 추가해야 읽힌다. 호출은 zip/guard.mjs 「gsc」 한도를 쓴다.
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { useApi } from '../zip/guard.mjs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

const compact = (s) => String(s || '').toLowerCase().replace(/[\s·\-—–,()[\]「」『』"']/g, '');
// 검색어 낱말이 모두 들어 있으면 '○', 일부만 '△', 하나도 없으면 '×'
export function has(text, query) {
  const t = compact(text), words = query.split(/\s+/).map(compact).filter(Boolean);
  const n = words.filter((w) => t.includes(w)).length;
  return n === words.length ? '○' : n ? '△' : '×';
}
export const near = (r) => r.position > 10 && r.position <= 20;

function keyFile() {
  if (process.env.GSC_KEY_FILE) return process.env.GSC_KEY_FILE;
  const dir = 'D:/dev/blog_ga_dashboard/keys';
  const f = existsSync(dir) && readdirSync(dir).find((n) => n.endsWith('.json'));
  if (!f) throw new Error('서비스 계정 JSON을 찾지 못함 — GSC_KEY_FILE에 경로를 넣어 주세요');
  return join(dir, f);
}

async function token(key) {
  const now = Math.floor(Date.now() / 1000), b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: key.token_uri, iat: now, exp: now + 3600 })}`;
  const jwt = `${body}.${createSign('RSA-SHA256').update(body).sign(key.private_key, 'base64url')}`;
  const r = await fetch(key.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  if (!r.ok) throw new Error(`구글 토큰 HTTP ${r.status}`);
  return (await r.json()).access_token;
}

// 글의 제목과 첫 문단(본문 첫 <p>)
async function pageText(url) {
  const h = await (await fetch(url)).text();
  const strip = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const title = strip((h.match(/<meta property="og:title" content="([^"]*)"/) || h.match(/<title>([^<]*)/) || [])[1]);
  const body = h.slice(h.search(/class="[^"]*(tt_article_useless_p_margin|contents_style|entry-content)/) + 1 || 0);
  const p = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => strip(m[1])).find((s) => s.length > 20) || '';
  return { title, first: p };
}

async function main() {
  const site = arg('--site', 'https://aulee.tistory.com/'), days = +arg('--days', 28);
  const key = JSON.parse(readFileSync(keyFile(), 'utf8'));
  const day = (d) => new Date(Date.now() + 9 * 3600e3 - d * 86400e3).toISOString().slice(0, 10);
  useApi('gsc');
  const tk = await token(key);
  const query = async (dimensions) => {
    useApi('gsc');
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: day(days + 2), endDate: day(2), dimensions, rowLimit: 1000 }),
    });
    if (r.status === 403) throw new Error(`서치콘솔 「${site}」 읽기 권한 없음 — 설정 → 사용자 및 권한에서 ${key.client_email} 을(를) 「제한」 사용자로 추가해 주세요`);
    if (!r.ok) throw new Error(`서치콘솔 HTTP ${r.status}`);
    return ((await r.json()).rows || []).map((x) => ({ query: dimensions[0] === 'query' ? x.keys[0] : '', page: x.keys.at(-1), impressions: x.impressions, clicks: x.clicks, position: Math.round(x.position * 10) / 10 }));
  };
  const rows = await query(['query', 'page']);
  const list = rows.filter(near).sort((a, b) => b.impressions - a.impressions);
  // 노출이 적은 검색어는 구글이 숨긴다(익명 검색어) — 글 단위 평균 11~20위도 따로 본다
  const pages = (await query(['page'])).filter(near).sort((a, b) => b.impressions - a.impressions);
  const cache = {};
  for (const x of list) {
    cache[x.page] ||= await pageText(x.page).catch(() => ({ title: '', first: '' }));
    x.title = cache[x.page].title;
    x.inTitle30 = has(x.title.slice(0, 30), x.query);
    x.inFirst = has(cache[x.page].first, x.query);
  }
  for (const x of pages) x.title = (cache[x.page] ||= await pageText(x.page).catch(() => ({ title: '', first: '' }))).title;
  const out = { site, from: day(days + 2), to: day(2), at: new Date().toISOString(), rows: rows.length, near: list, nearPages: pages };
  const f = join(ROOT, 'data', 'seo_near.json');
  const hist = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
  writeFileSync(f, JSON.stringify([...hist.filter((h) => !(h.site === site && h.to === out.to)), out], null, 1) + '\n');
  if (process.argv.includes('--json')) return console.log(JSON.stringify(out, null, 1));
  console.log(`${site} ${out.from}~${out.to} · 검색어×글 ${rows.length}줄 중 11~20위 ${list.length}줄 (제목 앞 30자·첫 문단: ○ 다 있음 △ 일부 × 없음)`);
  for (const x of list) console.log(`${String(x.position).padStart(4)}위 노출 ${String(x.impressions).padStart(3)} 클릭 ${x.clicks} | 제목30 ${x.inTitle30} 첫문단 ${x.inFirst} | 「${x.query}」 ${x.page.replace(site, '/')} ${x.title.slice(0, 40)}`);
  console.log(`글 단위 평균 11~20위 ${pages.length}편 (검색어가 숨겨진 노출 포함)`);
  for (const x of pages) console.log(`${String(x.position).padStart(4)}위 노출 ${String(x.impressions).padStart(3)} 클릭 ${x.clicks} | ${x.page.replace(site, '/')} ${x.title.slice(0, 50)}`);
}

if (process.argv.includes('--check')) {
  assert.equal(has('청약 가점 계산법 총정리(2026년) — 84점 만점', '청약 가점 계산'), '○');
  assert.equal(has('청약 가점 계산법 총정리', '청약가점 계산'), '○'); // 띄어쓰기 달라도 같은 말
  assert.equal(has('청약 가점 계산법 총정리', '청약 가점 부양가족'), '△');
  assert.equal(has('디딤돌대출 조건 총정리', '버팀목'), '×');
  assert.deepEqual([9.9, 10, 10.1, 20, 20.1].map((position) => near({ position })), [false, false, true, true, false]);
  console.log('seo_near 점검 통과');
} else {
  await main().catch((e) => { console.error('✗ ' + e.message); process.exitCode = 1; });
}

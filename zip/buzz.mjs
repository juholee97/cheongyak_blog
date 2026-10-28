// 「우리의 집」 관심도: 공고 단지마다 공식 API로 화제성만 센다 — 사실 근거로는 쓰지 않는다(2026-10-28 사용자 결정)
// node zip/buzz.mjs            → data/buzz.json { 공고번호: { trend, news, youtube } }
// node zip/buzz.mjs --check    → 계산 점검(네트워크 없음)
// .env: NAVER_CLIENT_ID·NAVER_CLIENT_SECRET(NAVER API HUB의 검색·Search Trend), YOUTUBE_API_KEY(YouTube Data API v3) — 값은 로그·파일에 남기지 않는다.
// 남의 글·영상 본문은 가져오지 않는다: 뉴스는 제목·링크·날짜, 유튜브는 제목·채널·조회수·날짜(메타데이터)만. 자막·영상 내려받기 없음(약관).
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { shortName } from '../posts/analysis_post.mjs';
import { useApi, isBudgetError } from './guard.mjs';

const env = async (k) => process.env[k] || (await readFile(join(ROOT, '.env'), 'utf8').catch(() => '')).match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").trim();
const iso = (d) => d.toISOString().slice(0, 10);

// 검색어: 단지 이름에서 괄호(회차·블록)와 「(본청약)」 같은 꼬리를 뺀 것
export const queryOf = (name) => shortName(name).replace(/\s*\d+단지$/, '').replace(/\s*(토지임대부\s*)?(공공분양주택|공공분양)$/, '').replace(/\s*(추가\s*)?입주자모집(공고)?$/, '').replace(/\s+/g, ' ').trim();

// 데이터랩 비율(0~100) → 최근 4주 평균 vs 그 앞 8주 평균
export function trendOf(points) {
  const r = points.map((p) => p.ratio);
  if (r.length < 6) return null;
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const recent = avg(r.slice(-4)), before = avg(r.slice(-12, -4));
  return { recent: Math.round(recent * 10) / 10, before: Math.round(before * 10) / 10, peak: points.reduce((a, b) => (b.ratio > a.ratio ? b : a)).period, weeks: r.length };
}

// 2026-07-31부터 네이버 개발자센터는 검색·데이터랩 신규 신청을 막았다 — 신규 키는 NCP의 NAVER API HUB(Application 등록 → 인증 정보)
// 헤더는 X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY. 옛 개발자센터 키(X-Naver-Client-*)는 NAVER_LEGACY=1로 지금처럼 쓸 수 있다
async function naver(path, init = {}) {
  const [id, secret] = [await env('NAVER_CLIENT_ID'), await env('NAVER_CLIENT_SECRET')];
  if (!id || !secret) return null;
  useApi(/datalab|search-trend/.test(path) ? 'naver_trend' : 'naver_search'); // 호출 한도 가드 — 네이버 API HUB는 무료 구간을 넘으면 유료(zip/guard.mjs)
  const legacy = (await env('NAVER_LEGACY')) === '1';
  const base = legacy ? 'https://openapi.naver.com' : 'https://naverapihub.apigw.ntruss.com';
  const key = legacy ? { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret } : { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret };
  const headers = { ...key, ...(init.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }; // GET 검색에는 Content-Type을 붙이지 않는다
  const real = legacy ? path : path.replace('/v1/datalab/search', '/search-trend/v1/search').replace('/v1/search/news.json', '/search/v1/news'); // HUB 경로(공식 문서): 트렌드 POST /search-trend/v1/search, 뉴스 GET /search/v1/news
  const r = await fetch(`${base}${real}`, { ...init, headers });
  if (!r.ok) throw new Error(`네이버 ${path.split('?')[0]} HTTP ${r.status}${r.status === 429 ? '(하루 호출 한도)' : ''}`);
  return r.json();
}

async function trend(q, now) {
  const start = new Date(now); start.setDate(start.getDate() - 7 * 26);
  const j = await naver('/v1/datalab/search', { method: 'POST', body: JSON.stringify({ startDate: iso(start), endDate: iso(now), timeUnit: 'week', keywordGroups: [{ groupName: q, keywords: [q] }] }) });
  return j ? trendOf(j.results?.[0]?.data || []) : null;
}

async function news(q) {
  const j = await naver(`/v1/search/news.json?query=${encodeURIComponent(`"${q}"`)}&display=20&sort=date`); // 따옴표 = 정확히 그 말이 든 기사만(안 그러면 낱말 하나만 맞아도 잡힌다)
  if (!j) return null;
  return { total: j.total, items: (j.items || []).map((x) => ({ title: strip(x.title), link: x.originallink || x.link, date: new Date(x.pubDate).toISOString().slice(0, 10) })) };
}

async function youtube(q, now) {
  const key = await env('YOUTUBE_API_KEY');
  if (!key) return null;
  const after = new Date(now); after.setFullYear(after.getFullYear() - 1);
  useApi('youtube', 100); // 검색 1번 = 100단위
  const s = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=20&order=relevance&regionCode=KR&relevanceLanguage=ko&publishedAfter=${after.toISOString()}&q=${encodeURIComponent(q)}&key=${key}`)).json();
  if (s.error) throw new Error(`유튜브 검색 ${s.error.code} ${s.error.status || ''}`); // URL엔 키가 있어 찍지 않는다
  const ids = (s.items || []).map((x) => x.id.videoId).filter(Boolean);
  if (!ids.length) return { count: 0, items: [] };
  useApi('youtube', 1);
  const v = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(',')}&key=${key}`)).json();
  const items = (v.items || []).filter((x) => q.split(' ').slice(0, 2).every((w) => x.snippet.title.replace(/\s+/g, '').includes(w))) // 제목에 단지 이름 앞 두 낱말이 모두 든 영상만(「청라」 하나로는 안 됨)
    .map((x) => ({ title: x.snippet.title, channel: x.snippet.channelTitle, date: x.snippet.publishedAt.slice(0, 10), views: +x.statistics.viewCount || 0, url: `https://www.youtube.com/watch?v=${x.id}` }))
    .sort((a, b) => b.views - a.views);
  return { count: items.length, views: items.reduce((a, b) => a + b.views, 0), items: items.slice(0, 8) };
}

async function main() {
  const { items } = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8'));
  const out = JSON.parse(await readFile(join(ROOT, 'data/buzz.json'), 'utf8').catch(() => '{}')), now = new Date();
  const missing = [!(await env('NAVER_CLIENT_ID')) && '네이버', !(await env('YOUTUBE_API_KEY')) && '유튜브'].filter(Boolean);
  if (missing.length) console.log(`키 없음: ${missing.join('·')} — 그 부분은 건너뜀`);
  const oi = process.argv.indexOf('--only'), only = oi > 0 ? process.argv[oi + 1].split(',') : null; // --only 공고번호,공고번호: 그 공고만(비교 단지를 아직 안 골라 skip 표시인 공고도 포함)
  for (const r of items.filter((x) => (only ? only.includes(x.no) : !x.skip))) {
    const q = queryOf(r.name);
    if (!process.argv.includes('--force') && out[r.no]?.at && Date.now() - Date.parse(out[r.no].at) < 12 * 3600e3) { console.log(`건너뜀(12시간 안에 모음) ${q}`); continue; } // 같은 공고를 하루에 여러 번 부르지 않는다(유튜브 검색 한도)
    try {
      out[r.no] = { q, at: now.toISOString(), trend: await trend(q, now), news: await news(q), youtube: await youtube(q, now) };
      const b = out[r.no];
      console.log(`${q} · 검색 최근 ${b.trend?.recent ?? '-'} (전 ${b.trend?.before ?? '-'}) · 뉴스 ${b.news?.total ?? '-'} · 영상 ${b.youtube?.count ?? '-'}곳 조회 ${b.youtube?.views?.toLocaleString() ?? '-'}`);
    } catch (e) { console.log(`✗ ${q}: ${e.message}`); if (isBudgetError(e)) { console.log('호출 한도에 도달 — 여기서 멈춥니다'); break; } }
  }
  await writeFile(join(ROOT, 'data/buzz.json'), JSON.stringify(out, null, 2));
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  assert.equal(queryOf('트리븐센텀 2단지'), '트리븐센텀');
  assert.equal(queryOf('충정로역자이르네(2차)'), '충정로역자이르네');
  const pts = Array.from({ length: 12 }, (_, i) => ({ period: `2026-0${(i % 9) + 1}-01`, ratio: i < 8 ? 10 : 40 }));
  const t = trendOf(pts);
  assert.equal(t.recent, 40); assert.equal(t.before, 10);
  assert.equal(trendOf(pts.slice(0, 3)), null); // 몇 주 안 되면 판단 안 함
  console.log('buzz 점검 통과');
} else if (process.argv[1]?.endsWith('buzz.mjs')) await main();

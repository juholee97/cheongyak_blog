// auleezip.com 단지 글: zip/deals.mjs 결과(data/deals.json) 한 줄 → 워드프레스 글 { slug, title, html, excerpt, tags, categories }
// node zip/post.mjs              비교된 공고마다 data/zip_posts/{공고번호}.json + 미리보기 data/zip_posts/preview.html
// 모든 공고는 「분양 시세비교」, 기준(2억원·20%)을 넘은 곳은 「꿀분양」 카테고리도 함께 + 글머리 강조 상자.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { esc, md, label, C, TH, TD, DISCLAIMER } from '../posts/weekly.mjs';
import { areaOf, shortName } from '../posts/analysis_post.mjs';
import { BANNED } from '../posts/check.mjs';
import { GAP, RATE } from './deals.mjs';

export const CAT_ALL = '분양 시세비교', CAT_DEAL = '꿀분양';
const GOLD = '#a15c00';
const eok = (n) => { const a = Math.abs(n), s = a >= 10000 ? `${Math.floor(a / 10000)}억${a % 10000 ? ' ' + (a % 10000).toLocaleString() + '만' : ''}원` : `${a.toLocaleString()}만원`; return s; };
const pct = (r) => `${Math.round(Math.abs(r) * 100)}%`;
const km = (m) => (m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`);
const table = (head, rows) => `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:480px"><thead><tr>${head.map((h) => `<th ${TH}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td ${TD}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

// 관심도(화제성) — 공식 API로 센 숫자만. 사실 근거가 아니라고 글에 적는다. 금지 표현이 든 남의 제목은 싣지 않고 수만 센다
export function buzzHtml(b) {
  if (!b || (!b.trend && !b.news && !b.youtube)) return [];
  const ok = (t) => !BANNED.some((w) => t.includes(w));
  const rows = [];
  if (b.trend) rows.push(['네이버 검색량(상대값)', `최근 4주 평균 ${b.trend.recent} · 그 전 8주 ${b.trend.before} (가장 많았던 주 ${md(b.trend.peak)})`]);
  if (b.news) rows.push(['네이버 뉴스', `${b.news.total.toLocaleString()}건 (최근 기사 ${b.news.items[0] ? md(b.news.items[0].date) : '-'})`]);
  if (b.youtube) rows.push(['유튜브(최근 1년)', `제목에 단지명이 든 영상 ${b.youtube.count}개 · 조회수 합 ${(b.youtube.views || 0).toLocaleString()}`]);
  const news = (b.news?.items || []).filter((x) => ok(x.title)).slice(0, 3).map((x) => `<li><a href="${esc(x.link)}" rel="nofollow noopener">${esc(x.title)}</a> <span style="color:${C.muted}">${md(x.date)}</span></li>`);
  const vids = (b.youtube?.items || []).filter((x) => ok(x.title)).slice(0, 3).map((x) => `<li><a href="${esc(x.url)}" rel="nofollow noopener">${esc(x.title)}</a> <span style="color:${C.muted}">${esc(x.channel)} · 조회 ${x.views.toLocaleString()}</span></li>`);
  return ['<h2>관심도</h2>', table(['지표', '값'], rows),
    ...(news.length ? ['<p style="margin:12px 0 4px;font-weight:700">최근 기사</p>', `<ul>${news.join('')}</ul>`] : []),
    ...(vids.length ? ['<p style="margin:12px 0 4px;font-weight:700">많이 본 영상</p>', `<ul>${vids.join('')}</ul>`] : []),
    `<p style="font-size:13px;color:${C.muted}">관심도는 화제성일 뿐 정보의 정확성이나 단지의 가치를 뜻하지 않아요. 기사·영상 내용은 aulee가 확인한 사실이 아니에요. 기준: 네이버 데이터랩·뉴스 검색, YouTube Data API(${esc((b.at || '').slice(0, 10))} 수집).</p>`];
}

// 자주 나오는 이야기 확인표(data/zip_claims.json — 세션에서 공식 자료로 대조해 적는다): { claim, status: 확인|다름|공식 자료 없음, fact, source: { name, url } }
export function claimsHtml(cs) {
  if (!cs?.length) return [];
  const mark = { 확인: '✔ 확인', 다름: '✖ 공식 자료와 다름', '공식 자료 없음': '? 공식 자료 없음' };
  return ['<h2>자주 나오는 이야기, 공식 자료로 확인</h2>',
    table(['이야기', '확인 결과', '공식 자료'], cs.map((c) => [esc(c.claim), `<b>${mark[c.status] || esc(c.status)}</b>${c.fact ? `<br><span style="font-size:13px">${esc(c.fact)}</span>` : ''}`, c.source?.url ? `<a href="${esc(c.source.url)}">${esc(c.source.name)}</a>` : '-'])),
    `<p style="font-size:13px;color:${C.muted}">기사·영상에서 자주 나온 이야기를 정부·지자체·사업주체 공식 자료와 맞춰 본 결과예요. 공식 자료가 없는 이야기는 사실이 아니라는 뜻이 아니라 확인되지 않았다는 뜻이에요.</p>`];
}

export function postOf(r, buzz, claims) {
  r = { ...r, med: Math.round(r.med), own: Math.round(r.own) };
  const peer = '비교 단지';
  const name = shortName(r.name), area = areaOf(r), cheap = r.gap > 0, m = r.main;
  const diff = `${eok(r.gap)}(${pct(r.rate)}) ${cheap ? '낮아요' : '높아요'}`;
  const title = r.hit
    ? `[${area}] ${name} 분양가, 비교 단지 시세보다 전용 ${m.area}㎡ 한 채 약 ${eok(r.gap)} 낮아요 — 실거래 비교`
    : `[${area}] ${name} 분양가 vs ${peer} 실거래 — 전용 ${m.area}㎡ 3.3㎡당 ${Math.abs(r.med - r.own).toLocaleString()}만원 ${cheap ? '낮음' : '높음'}`;
  const lead = `${name} 전용 ${m.area}㎡ 최고 분양가는 ${eok(m.max)}(3.3㎡당 ${r.own.toLocaleString()}만원)이에요. 생활권·급지·브랜드를 보고 고른 비교 단지 ${r.n}곳의 최근 12개월 실거래 중앙값(3.3㎡당 ${r.med.toLocaleString()}만원)으로 같은 면적을 환산하면 분양가가 ${diff}.${r.leasehold ? ' 다만 토지임대부라 땅값이 빠진(토지는 따로 임대료를 내는) 분양가여서 일반 아파트 거래가와 그대로 비교할 수는 없어요.' : ''}`;
  // 글머리 상자는 정말 한 줄(근거는 바로 아래 표·기준 문단에). lead는 검색 요약(excerpt)으로만 쓴다
  const one = `전용 ${m.area}㎡ 분양가 ${eok(m.max)} · 비교 단지 시세보다 ${diff}`;
  const sub = r.leasehold ? `<p style="margin:4px 0 0;font-size:13px;color:${C.muted}">토지임대부 — 땅값이 빠진 분양가라 일반 아파트 거래가와 그대로 비교할 수 없어요.</p>` : '';
  const [tint, bg, tag] = r.hit ? [GOLD, '#fff8ec', '꿀분양'] : [C.brand, '#f5f8fe', '한 줄 비교'];
  const box = `<div style="border-left:4px solid ${tint};border-radius:8px;padding:10px 14px;margin:12px 0;background:${bg}"><p style="margin:0;font-weight:700"><span style="font-size:13px;color:${tint};margin-right:8px">${tag}</span>${esc(one)}</p>${sub}</div>`;
  const when = (r.phases || []).filter((p) => p.date).map((p) => [esc(label(r, p.k) || p.k), md(p.date)]);
  const html = [
    box,
    '<h2>분양가와 비교 단지 실거래</h2>',
    table(['구분', '전용 3.3㎡당', `전용 ${m.area}㎡ 환산`], [
      [`<b>${esc(name)}</b> 최고 분양가`, `${r.own.toLocaleString()}만원`, eok(m.max)],
      [`${peer} ${r.n}곳 중앙값`, `${r.med.toLocaleString()}만원`, eok(Math.round((r.med * m.area) / 3.3058))],
      ['차이', `${Math.abs(r.med - r.own).toLocaleString()}만원 ${cheap ? '낮음' : '높음'}`, `${eok(r.gap)} ${cheap ? '낮음' : '높음'}`],
    ]),
    '<h3>비교한 단지와 고른 이유</h3>',
    table(['단지', '준공', '거리', '전용 3.3㎡당', '고른 이유'], r.refs.map((g) => [esc(g.apt) + (g.kind ? ` <b style="font-size:12px">${g.kind === 'silv' ? '분양권' : '오피스텔'}</b>` : '') + (g.sgg && !(r.district || '').includes(g.sgg.split(' ')[1]) ? ` <span style="font-size:13px;color:${C.muted}">(${esc(g.sgg.split(' ').slice(1).join(' '))})</span>` : ''), g.built ? `${g.built}년` : '-', g.d != null ? km(g.d) : '-', `${g.perPy.toLocaleString()}만원`, esc(g.why)])),
    ...(r.note ? [`<p>${esc(r.note)}</p>`] : []),
    `<p style="font-size:13px;color:${C.muted}">기준: 국토교통부 아파트 매매·분양권 전매·오피스텔 매매 실거래가(${esc(r.months)}) · 같은 시·군·구와 생활권이 이어지는 옆 시·군·구에서 생활권 인식·상급지/하급지·브랜드·단지 규모를 보고 고른 단지 · 단지별 전용 3.3㎡당 중앙값의 중앙값. 고른 기준은 aulee의 판단이고, 값은 모두 실거래예요. 분양가는 주력 주택형(세대수 최다)의 최고 분양가로, 발코니 확장·옵션 비용은 빠져 있어요.</p>`,
    ...(when.length ? ['<h2>청약 일정</h2>', table(['단계', '날짜'], when)] : []),
    ...claimsHtml(claims),
    ...buzzHtml(buzz),
    '<h2>확인할 조건</h2>',
    `<p>분양가가 낮은 단지일수록 전매제한·실거주 의무·재당첨 제한이 붙는 경우가 많아요. 적용 여부와 기간은 ${(r.links || [r.applyhomeUrl]).map((u, i, a) => `<a href="${esc(u)}">청약홈 입주자모집공고${a.length > 1 ? ` ${i + 1}` : ''}</a>`).join(' · ')}에서 확인하세요.</p>`,
    `<p style="font-size:13px;color:${C.muted}">이 글은 공고와 공개 실거래 자료를 비교한 것이며 청약·투자 권유가 아닙니다. ${esc(DISCLAIMER)}</p>`,
  ].join('\n');
  const excerpt = lead;
  const tags = [area, r.district, r.kind === '무순위' ? '무순위 청약' : '아파트 분양', ...(r.hit ? ['꿀분양'] : [])].filter(Boolean);
  return { slug: `apt-${r.no}`, title, html, excerpt, tags, categories: r.hit ? [CAT_ALL, CAT_DEAL] : [CAT_ALL] };
}

export function checkPost(p) {
  const text = [p.title, p.html, p.excerpt].join('\n');
  return BANNED.filter((b) => text.includes(b)).map((b) => `금지 표현 "${b}"`);
}

if (process.argv[1]?.endsWith('post.mjs')) {
  const { items } = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8'));
  const buzz = JSON.parse(await readFile(join(ROOT, 'data/buzz.json'), 'utf8').catch(() => '{}')), claims = JSON.parse(await readFile(join(ROOT, 'data/zip_claims.json'), 'utf8').catch(() => '{}'));
  const dir = join(ROOT, 'data/zip_posts');
  await mkdir(dir, { recursive: true });
  const posts = [];
  // 같은 단지·같은 분양가·같은 일정으로 공고가 둘 이상(무순위 회차 등)이면 글 하나로 — 청약홈 공고 링크만 모은다
  const seen = new Map();
  for (const r of items.filter((x) => !x.skip)) {
    const k = `${shortName(r.name)}|${r.main.max}|${JSON.stringify(r.phases)}`;
    if (seen.has(k)) { seen.get(k).links.push(r.applyhomeUrl); continue; }
    seen.set(k, Object.assign(r, { links: [r.applyhomeUrl] }));
  }
  for (const r of seen.values()) {
    const p = postOf(r, buzz[r.no], claims[r.no]), issues = checkPost(p);
    if (issues.length) { console.log(`✗ ${r.name}: ${issues.join(', ')}`); continue; }
    await writeFile(join(dir, `${r.no}.json`), JSON.stringify(p, null, 2));
    posts.push(p);
    console.log(`${r.hit ? '★' : ' '} ${p.title}`);
  }
  await writeFile(join(dir, 'preview.html'), `<!doctype html><meta charset="utf-8"><body style="max-width:760px;margin:24px auto;padding:0 16px;font:16px/1.7 sans-serif;color:${C.ink}">${posts.map((p) => `<article style="border-bottom:3px solid #ccc;padding-bottom:32px;margin-bottom:32px"><p style="color:${C.muted};font-size:13px">${p.categories.join(' · ')}</p><h1 style="font-size:24px">${esc(p.title)}</h1>${p.html}</article>`).join('')}</body>`);
  console.log(`\n글 ${posts.length}편 → data/zip_posts/ (미리보기 preview.html)`);
}

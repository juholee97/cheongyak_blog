// auleezip.com 단지 글: zip/deals.mjs 결과(data/deals.json) 한 줄 → 워드프레스 글 { slug, title, html, excerpt, tags, categories, snap }
// node zip/post.mjs              비교된 공고마다 data/zip_posts/{공고번호}.json + 미리보기 data/zip_posts/preview.html(사이트 CSS를 붙여 실제 화면처럼)
// 모든 공고는 「분양 시세비교」, 기준(2억원·20%)을 넘은 곳은 「꿀분양」 카테고리도 함께.
// 화면 구성(2026-10-29 디자인): 비교 결과 눈금 → 주요 내용 → 이 글의 자료 → 점 그래프 → 비교 단지 표 → 분석 → 일정 → 확인표 → 관심도 → 고친 기록. 조각은 zip/ui.mjs, 모양은 zip/site.css
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { esc, md, label, DISCLAIMER } from '../posts/weekly.mjs';
import { areaOf, shortName } from '../posts/analysis_post.mjs';
import { BANNED } from '../posts/check.mjs';
import { table, verdict, keyBox, rail, dotPlot, src, note, chip, banner, links, num, keepUnits, LOG_MARK } from './ui.mjs';

export const CAT_ALL = '분양 시세비교', CAT_DEAL = '꿀분양';
export const OPEN_URL = 'https://auleezip.com/open-notices/', CAL_URL = 'https://aulee.tistory.com/category/청약일정', METHOD_URL = 'https://auleezip.com/method/';
const eok = (n) => { const a = Math.abs(n), s = a >= 10000 ? `${Math.floor(a / 10000)}억${a % 10000 ? ' ' + (a % 10000).toLocaleString() + '만' : ''}원` : `${a.toLocaleString()}만원`; return s; };
// 「약 …」으로 쓰는 금액은 백만원 단위로 반올림(10만원 자리에서)
const about = (n) => `약 ${eok(Math.round(Math.abs(n) / 100) * 100)}`;
const pct = (r) => `${Math.round(Math.abs(r) * 100)}%`;
const km = (m) => (m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`);
// 워드프레스가 문단 자동 변환(wpautop)으로 틀을 건드리지 않게 HTML 블록 하나로 감싼다
export const wrap = (html) => `<!-- wp:html -->\n<div class="az">\n${html}\n</div>\n<!-- /wp:html -->`;
// 접수 기간: 특별공급·1순위 등 첫 날 ~ 마지막 접수 날(계약·발표는 빼고)
export const RECEIPT = ['sp', 'p1', 'p2'];
export const receiptOf = (phases) => { const ps = (phases || []).filter((p) => RECEIPT.includes(p.k) && p.date); return ps.length ? { start: ps.map((p) => p.date).sort()[0], end: ps.map((p) => p.end || p.date).sort().at(-1) } : null; };
export const span = (a, b) => (a === b ? md(a) : `${md(a)} ~ ${md(b)}`);

// 관심도(화제성) — 공식 API로 센 숫자만. 사실 근거가 아니라고 글에 적는다. 금지 표현이 든 남의 제목은 싣지 않고 수만 센다
export function buzzHtml(b) {
  if (!b || (!b.trend && !b.news && !b.youtube)) return [];
  const ok = (t) => !BANNED.some((w) => t.includes(w));
  const rows = [];
  if (b.trend) rows.push(['네이버 검색량(상대값)', `최근 4주 평균 ${b.trend.recent} · 그 전 8주 ${b.trend.before}<small>가장 많았던 주 ${md(b.trend.peak)}</small>`]);
  if (b.news) rows.push(['네이버 뉴스', `단지명이 본문에 언급된 기사 ${b.news.total.toLocaleString()}건<small>최근 ${b.news.items[0] ? md(b.news.items[0].date) : '-'}</small>`]);
  if (b.youtube) rows.push(['유튜브(최근 1년)', `제목에 단지명이 든 영상 ${b.youtube.count}개 · 조회수 합 ${(b.youtube.views || 0).toLocaleString()}`]);
  const named = (t) => (b.q || '').split(' ').slice(0, 2).every((w) => t.replace(/\s+/g, '').includes(w)); // 제목에 단지명이 든 것만 목록에
  const news = (b.news?.items || []).filter((x) => ok(x.title) && named(x.title)).slice(0, 3).map((x) => `<li><a href="${esc(x.link)}" rel="nofollow noopener">${esc(x.title)}</a> <span class="az-s">${md(x.date)}</span></li>`);
  const vids = (b.youtube?.items || []).filter((x) => ok(x.title)).slice(0, 3).map((x) => `<li><a href="${esc(x.url)}" rel="nofollow noopener">${esc(x.title)}</a> <span class="az-s">${esc(x.channel)}${(b.q || '').split(' ').slice(0, 2).every((w) => x.channel.replace(/\s+/g, '').includes(w)) ? ' (단지 이름을 딴 채널 — 분양 홍보 영상일 수 있어요)' : ''} · 조회 ${x.views.toLocaleString()}</span></li>`);
  return ['<h2>관심도</h2>', table(['지표', '값'], rows, { stack: false }),
    ...(news.length ? ['<h3>최근 기사</h3>', `<ul>${news.join('')}</ul>`] : []),
    ...(vids.length ? ['<h3>많이 본 영상</h3>', `<ul>${vids.join('')}</ul>`] : []),
    src(`관심도는 화제성일 뿐 정보의 정확성이나 단지의 가치를 뜻하지 않아요. 기사·영상 내용은 aulee가 확인한 사실이 아니에요. 기준: 네이버 데이터랩·뉴스 검색, YouTube Data API(${esc((b.at || '').slice(0, 10))} 수집).`)];
}

// 자주 나오는 이야기 확인표(data/zip_claims.json — 세션에서 공식 자료로 대조해 적는다): { claim, status: 확인|다름|공식 자료 없음, fact, source: { name, url } }
export function claimsHtml(cs) {
  if (!cs?.length) return [];
  return ['<h2>자주 나오는 이야기, 공식 자료로 확인</h2>',
    table(['이야기', '확인 결과', '공식 자료'], cs.map((c) => [esc(c.claim), `${chip(c.status)}${c.fact ? `<small>${esc(c.fact)}</small>` : ''}`, c.source?.url ? `<a href="${esc(c.source.url)}">${esc(c.source.name)}</a>` : '-'])),
    src('기사·영상에서 자주 나온 이야기를 정부·지자체·사업주체 공식 자료와 맞춰 본 결과예요. 공식 자료가 없는 이야기는 사실이 아니라는 뜻이 아니라 확인되지 않았다는 뜻이에요.')];
}

// 접수 마감 여부: 접수(특별공급·1순위 등) 날짜가 모두 지났으면 마감
export function closedOf(phases, today) {
  const r = receiptOf(phases); // 접수 기간(date~end)은 끝나는 날이 지나야 마감
  return !!r && r.end < today;
}

// 분석 문단(data/zip_analysis.json — 세션에서 공식 자료·이전 공고로 쓰고 zip/check_analysis.mjs로 숫자를 대조한다)
export const analysisHtml = (secs) => (secs || []).flatMap((x) => [`<h2>${esc(x.h)}</h2>`, ...x.p.map((t) => `<p>${esc(t)}</p>`)]);

export function postOf(r, buzz, claims, ctx = {}) {
  r = { ...r, med: Math.round(r.med), own: Math.round(r.own) };
  const name = shortName(r.name), area = areaOf(r), cheap = r.gap > 0, m = r.main;
  const diff = `${about(r.gap)}(${pct(r.rate)}) ${cheap ? '낮아요' : '높아요'}`;
  // 제목은 결과(싸다/비싸다·금액)를 드러내지 않는다 — 의문형·주제형으로 돌려 쓴다(2026-10-28 사용자 지시)
  const head = `[${area}] ${name}`;
  const forms = r.kind === '무순위'
    ? [`${head} 무순위 — 다시 찾아온 기회일까? 주변 시세 비교`, `${head} 무순위, 주변 단지와 시세 전격 비교`]
    : [`${head} 분양가 — 주변 단지와 시세 전격 비교`, `${head} 분양가, 주변 단지 평균 시세는?`, `${head} 분양가, 적정 시세일까?`];
  let title = forms[(+r.no.slice(-2) || 0) % forms.length];
  if (title.length > 44) title = `${head} 분양가, 주변 시세는?`; // 너무 길면 짧은 형태로
  const leaseNote = '토지임대부라 땅값이 빠진(토지는 따로 임대료를 내는) 분양가여서 일반 아파트 거래가와 그대로 비교할 수 없어요.';
  const lead = `${name} 전용 ${m.area}㎡ 최고 분양가는 ${eok(m.max)}(3.3㎡당 ${r.own.toLocaleString()}만원)이에요. 생활권·급지·브랜드를 보고 고른 비교 단지 ${r.n}곳의 최근 12개월 실거래 중앙값(3.3㎡당 ${r.med.toLocaleString()}만원)으로 같은 면적을 환산하면 분양가가 ${diff}.${r.leasehold ? ` 다만 ${leaseNote}` : ''}`;
  const conv = Math.round((r.med * m.area) / 3.3058);
  // B 비교 결과 눈금(토지임대부는 그대로 견줄 수 없어 그리지 않는다). d: 분양가가 비교 시세보다 높으면 +
  const d = -r.rate * 100, rounded = Math.round(Math.abs(d));
  const verdictHtml = r.leasehold ? '' : verdict(d, {
    title: rounded === 0 ? '주변 시세와 같은 수준이에요' : `주변 시세보다 <strong>${pct(r.rate)} ${cheap ? '낮아요' : '높아요'}</strong>`,
    rows: [[`분양가 (전용 ${m.area}㎡ 최고)`, eok(m.max)], [`비교 단지 ${r.n}곳 시세로 환산`, eok(conv)], ['차이', `${cheap ? '−' : '+'}${eok(Math.abs(r.gap))}`]],
    note: r.hit ? '「꿀분양」 기준(비교 단지 시세보다 2억원 이상 또는 20% 이상 낮음)을 넘었어요.' : '',
  });
  const keys = [
    `전용 ${m.area}㎡ 최고 분양가는 <b>${eok(m.max)}</b>, 전용 3.3㎡당 ${num(r.own)}만원이에요.`,
    `생활권·급지·브랜드로 고른 비교 단지 ${r.n}곳의 3.3㎡당 실거래 중앙값은 <b>${num(r.med)}만원</b>이에요.`,
    `같은 면적으로 환산하면 분양가가 <b>${diff}</b>.`,
    ...(r.leasehold ? [leaseNote] : []),
  ];
  const rc = receiptOf(r.phases);
  const notices = (r.links || [r.applyhomeUrl]).map((u, i, a) => `<a href="${esc(u)}">청약홈 입주자모집공고${a.length > 1 ? ` ${i + 1}` : ''}</a>`).join(' · ');
  const railHtml = rail([
    ['실거래 기간', esc(r.months)],
    ['비교 단지', `${r.n}곳 · 생활권·급지·브랜드로 고름`],
    ['분양가 출처', notices],
    ...(rc ? [['접수', span(rc.start, rc.end)]] : []),
  ], `<a href="${METHOD_URL}">비교 기준 보기 →</a>`);
  const refs = [...r.refs].sort((a, b) => b.perPy - a.perPy);
  const plot = dotPlot([{ label: `${esc(name)}<small>분양가</small>`, v: r.own, me: true }, ...refs.map((g) => ({ label: esc(g.apt), v: g.perPy }))], {
    med: r.med, medLabel: `${r.n}곳 중앙값`,
    caption: `단위 만원. 자료: 국토교통부 실거래(${esc(r.months)}), 단지별 전용 3.3㎡당 중앙값. 분양가는 주력 주택형(전용 ${m.area}㎡) 최고가이며 확장비·옵션은 빠져 있어요.`,
  });
  const out = (g) => (g.sgg && !(r.district || '').includes(g.sgg.split(' ')[1]) ? `${esc(g.sgg.split(' ').slice(1).join(' '))} · ` : '');
  const peers = table(['단지', { t: '준공', n: true }, { t: '거리', n: true }, { t: '전용 3.3㎡당', n: true }],
    r.refs.map((g) => [`${esc(g.apt)}${g.kind ? `<span class="az-kind">${g.kind === 'silv' ? '분양권' : '오피스텔'}</span>` : ''}<small>${out(g)}${esc(g.why)}</small>`, g.built ? `${g.built}년` : '-', g.d != null ? km(g.d) : '-', `${num(g.perPy)}만원`]),
    { foot: [`${r.n}곳 중앙값`, '', '', `${num(r.med)}만원`] });
  const when = (r.phases || []).filter((p) => p.date).map((p) => [esc(label(r, p.k) || p.k), p.end && p.end !== p.date ? span(p.date, p.end) : md(p.date)]);
  const html = [
    ctx.closed ? banner(OPEN_URL) : '',
    verdictHtml,
    keyBox(keys),
    railHtml,
    '<h2>전용 3.3㎡당 가격</h2>',
    plot,
    '<h2>비교한 단지와 고른 이유</h2>',
    peers,
    ...(r.note ? [note(esc(r.note))] : []),
    src(`기준: 국토교통부 아파트 매매·분양권 전매·오피스텔 매매 실거래가(${esc(r.months)}) · 같은 시·군·구와 생활권이 이어지는 옆 시·군·구에서 생활권 인식·상급지/하급지·브랜드·단지 규모를 보고 고른 단지 · 단지별 전용 3.3㎡당 중앙값의 중앙값. 고른 기준은 aulee의 판단이고, 값은 모두 실거래예요. 분양가는 주력 주택형(세대수 최다)의 최고 분양가로, 발코니 확장·옵션 비용은 빠져 있어요.`),
    ...analysisHtml(ctx.analysis),
    ...(when.length ? ['<h2>청약 일정</h2>', table(['단계', { t: '날짜', n: true }], when, { stack: false })] : []),
    ...claimsHtml(claims),
    ...buzzHtml(buzz),
    ...((r.links || []).length > 1 ? [note(`청약홈에 같은 단지 공고가 ${r.links.length}건 따로 올라와 있어 글 하나로 묶었어요. 공고마다 구분(불법행위 재공급·무순위)과 세대수가 달라서 위 공식 자료 확인표와 각 공고 링크를 함께 보세요.`)] : []),
    '<h2>확인할 조건</h2>',
    `<p>분양가가 낮은 단지일수록 전매제한·실거주 의무·재당첨 제한이 붙는 경우가 많아요. 적용 여부와 기간은 ${notices}에서 확인하세요.</p>`,
    ...(ctx.more?.length ? ['<h2>함께 보면 좋은 글</h2>', links(ctx.more)] : []),
    LOG_MARK,
    note(`이 글은 공고와 공개 실거래 자료를 비교한 것이며 청약·투자 권유가 아닙니다. ${esc(DISCLAIMER)}`),
  ].filter(Boolean).join('\n');
  const tags = [area, r.district, r.kind === '무순위' ? '무순위 청약' : '아파트 분양', ...(r.hit ? ['꿀분양'] : [])].filter(Boolean);
  return { slug: `apt-${r.no}`, title, html: wrap(keepUnits(html)), excerpt: lead, closed: !!ctx.closed, tags, categories: r.hit ? [CAT_ALL, CAT_DEAL] : [CAT_ALL], snap: { months: r.months, n: r.n, own: r.own, med: r.med } };
}

export function checkPost(p) {
  const text = [p.title, p.html, p.excerpt].join('\n');
  return BANNED.filter((b) => text.includes(b)).map((b) => `금지 표현 "${b}"`);
}

// 미리보기: 사이트 CSS와 글꼴을 붙여 워드프레스 글 화면처럼(머리·본문 틀만) — 올리기 전에 눈으로 확인
export async function previewHtml(posts) {
  const css = await readFile(join(ROOT, 'zip/site.css'), 'utf8');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600&display=swap"><style>body{margin:0}${css}</style><body>${posts.map((p) => `<article style="border-bottom:6px solid #dde3e8;padding-bottom:40px"><div class="az-head"><p class="az-eyebrow">${esc(p.categories.join(' · '))}</p><h1 class="az-title">${esc(p.title)}</h1><div class="az-meta" style="display:flex"><div class="wp-block-post-author-name">aulee</div></div></div><div class="az-content">${p.html.replace(LOG_MARK, '')}</div></article>`).join('')}</body></html>`;
}

if (process.argv[1]?.endsWith('post.mjs')) {
  const { items } = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8'));
  const buzz = JSON.parse(await readFile(join(ROOT, 'data/buzz.json'), 'utf8').catch(() => '{}')), claims = JSON.parse(await readFile(join(ROOT, 'data/zip_claims.json'), 'utf8').catch(() => '{}'));
  const analysis = JSON.parse(await readFile(join(ROOT, 'data/zip_analysis.json'), 'utf8').catch(() => '{}'));
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
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const pub = JSON.parse(await readFile(join(ROOT, 'posts/published.json'), 'utf8').catch(() => '{}'));
  const list = [...seen.values()];
  const oi = process.argv.indexOf('--only'), only = oi > 0 ? process.argv[oi + 1].split(',') : null; // --only 공고번호: 그 글만 새로 쓴다(나머지 글 파일은 그대로)
  for (const r of list) {
    if (only && !only.includes(r.no)) continue;
    const closed = closedOf(r.phases, today);
    const more = [];
    // 티스토리에 같은 단지 분양분석 글이 있으면 서로 연결
    const ad = JSON.parse(await readFile(join(ROOT, 'drafts', `analysis_${r.no}.json`), 'utf8').catch(() => 'null'));
    if (ad?.title && pub[ad.title]) more.push({ url: pub[ad.title], label: `${shortName(r.name)} 분양 분석 — 교통·학군·대출까지 (우리의 청약달력)` });
    // 같은 지역의 다른 시세 비교 글 최대 2편(열린 공고 먼저)
    for (const o of list.filter((x) => x.no !== r.no && x.region === r.region).sort((a, b) => closedOf(a.phases, today) - closedOf(b.phases, today)).slice(0, 2)) more.push({ url: `https://auleezip.com/apt-${o.no}/`, label: `${shortName(o.name)} 시세 비교` });
    more.push({ url: OPEN_URL, label: '현재 열린 공고 보기' }, { url: CAL_URL, label: '청약 일정 달력 (우리의 청약달력)' });
    const p = postOf(r, buzz[r.no], claims[r.no], { closed, more, analysis: analysis[r.no] }), issues = checkPost(p);
    if (issues.length) { console.log(`✗ ${r.name}: ${issues.join(', ')}`); continue; }
    await writeFile(join(dir, `${r.no}.json`), JSON.stringify(p, null, 2));
    posts.push(p);
    console.log(`${r.hit ? '★' : ' '}${closed ? '[마감]' : '      '} ${p.title}`);
  }
  await writeFile(join(dir, 'preview.html'), await previewHtml(posts));
  // 티스토리 분양분석 글이 자기 단지의 auleezip 글로 링크 걸 때 쓰는 목록(posts/analysis_post.mjs가 읽는다)
  const index = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8').catch(() => '{}'));
  for (const r of items.filter((x) => !x.skip)) { const m = [...seen.values()].find((x) => shortName(x.name) === shortName(r.name) && x.main.max === r.main.max); if (m) index[r.no] = `apt-${m.no}`; }
  await writeFile(join(dir, 'index.json'), JSON.stringify(index, null, 1));
  console.log(`\n글 ${posts.length}편 → data/zip_posts/ (미리보기 preview.html)`);
}

// 티스토리 치환자를 샘플 값으로 채워 skin/을 로컬에서 미리 본다.
// node preview/serve.mjs [--open]   → http://localhost:5178/ (홈) · /post (글) · /category (목록)
// node preview/serve.mjs --check    → 렌더·문법·수집기 매핑 자동 점검
import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { execFileSync, exec } from 'node:child_process';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draftOf, IMG_RE } from '../posts/weekly.mjs';
import { checkDraft } from '../posts/check.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIN = join(ROOT, 'skin');
const PORT = 5178;

// skin.html에 쓴 치환자는 모두 여기 있어야 한다(문서에 있는 이름만).
const KNOWN = new Set(`page_title title desc blog_link rss_url body_id blog_menu category_list comment_group guestbook_group
revenue_list_upper revenue_list_lower var_schedule-url list_conform list_count list_rep_link list_rep_thumbnail_url
list_rep_category list_rep_title_text list_rep_summary list_rep_regdate list_rep_rp_cnt article_rep_link
article_rep_thumbnail_url article_rep_category article_rep_title article_rep_summary article_rep_simple_date
article_rep_rp_cnt article_rep_category_link article_rep_date article_rep_desc tag_label_rep s_ad_m_link
s_ad_s2_onclick s_ad_s2_label s_ad_d_onclick notice_rep_title notice_rep_date notice_rep_desc tag_link tag_class
tag_name prev_page no_more_prev paging_rep_link paging_rep_link_num next_page no_more_next rctps_rep_link
rctps_rep_title`.split(/\s+/));
const KNOWN_GROUPS = new Set(`t3 list list_rep list_rep_thumbnail list_empty article_rep index_article_rep
article_rep_thumbnail rp_count permalink_article_rep tag_label ad_div notice_rep guest tag tag_rep paging paging_rep
sidebar sidebar_element rctps_popular_rep random_tags`.split(/\s+/));

const POSTS = [
  ['분양분석', '11월 수도권 분양 물량 총정리 — 놓치면 안 될 단지 5곳', '2026. 10. 20.', 14],
  ['청약가이드', '신생아 특별공급, 2026년 바뀐 소득 기준 한눈에 보기', '2026. 10. 18.', 3],
  ['분양분석', '래미안 원펜타스 2차 1순위 경쟁률 분석', '2026. 10. 16.', 8],
  ['대출·정책', '디딤돌·버팀목 대출 조건 한눈에 정리', '2026. 10. 14.', 21],
  ['청약가이드', '무순위 줍줍, 신청 전에 꼭 확인할 3가지', '2026. 10. 11.', 5],
  ['분양분석', '세종 6-3생활권 분양가, 주변 시세와 비교', '2026. 10. 09.', 2],
  ['청약가이드', '청약통장 납입 인정액 25만원 상향, 지금 바꿔야 할까', '2026. 10. 06.', 9],
].map(([cat, title, date, rp], i) => ({ cat, title, date, rp, link: '/post', summary: '분양가 상한제 적용 단지와 특별공급 비중이 높은 단지를 중심으로 일정과 예상 경쟁률을 정리했습니다.', thumb: i === 2 ? 'https://picsum.photos/seed/cy/800/500' : '' }));
const CATEGORY_HTML = `<ul class="tt_category"><li><a href="/category" class="link_tit">분류 전체보기 <span class="c_cnt">(248)</span></a>
<ul class="category_list">${[['청약일정', 96], ['분양분석', 71], ['청약가이드', 52], ['대출·정책', 29]].map(([n, c]) => `<li><a href="/category/${n}" class="link_item">${n} <span class="c_cnt">(${c})</span></a></li>`).join('')}</ul></li></ul>`;
const MENU_HTML = `<ul>${[['청약일정', '/category/청약일정'], ['분양분석', '/category/분양분석'], ['청약가이드', '/category/청약가이드'], ['대출·정책', '/category/대출·정책'], ['방명록', '/guestbook']].map(([n, h]) => `<li><a href="${h}">${n}</a></li>`).join('')}</ul>`;
const POPULAR = ['청약 가점 계산법 총정리 (2026 최신)', '특별공급 중복 신청, 되는 것과 안 되는 것', '서울 분양가 상한제 단지 리스트', '계약금 10% vs 5%, 자금 계획 세우기'];
const TAGS = ['청약가점', '특별공급', '무순위', '분양가상한제', '신혼부부', '생애최초', '서울분양', '경기분양'];

const group = (html, name, fn) => html.replace(new RegExp(`<s_${name}>([\\s\\S]*?)</s_${name}>`, 'g'), (_, inner) => fn(inner));
const fill = (html, vals) => html.replace(/\[##_([\w-]+)_##\]/g, (m, k) => (k in vals ? vals[k] : m));

function postVals(p) {
  return {
    article_rep_link: p.link, article_rep_title: p.title, article_rep_category: p.cat, article_rep_category_link: `/category/${p.cat}`,
    article_rep_summary: p.summary, article_rep_simple_date: p.date, article_rep_date: p.date + ' 09:00', article_rep_rp_cnt: p.rp,
    article_rep_thumbnail_url: p.thumb, article_rep_desc: p.desc ?? '<p>본문 예시입니다. 표·이미지·인용 등 에디터 내용이 여기에 들어갑니다.</p><table><tr><th>단계</th><th>날짜</th></tr><tr><td>특별공급</td><td>10.05 (월)</td></tr></table>',
    list_rep_link: p.link, list_rep_title_text: p.title, list_rep_category: p.cat, list_rep_summary: p.summary, list_rep_regdate: p.date.replace(/\. ?/g, '.').replace(/\.$/, ''), list_rep_rp_cnt: p.rp, list_rep_thumbnail_url: p.thumb,
  };
}

export async function render(page, post = POSTS[0]) {
  let html = await readFile(join(SKIN, 'skin.html'), 'utf8');
  const unknown = new Set();
  for (const m of html.matchAll(/\[##_([\w-]+)_##\]/g)) if (!KNOWN.has(m[1])) unknown.add(`[##_${m[1]}_##]`);
  for (const m of html.matchAll(/<s_([\w]+)>/g)) if (!KNOWN_GROUPS.has(m[1])) unknown.add(`<s_${m[1]}>`);

  const keep = (inner) => inner, drop = () => '';
  const withThumb = (h, p) => group(group(h, 'article_rep_thumbnail', p.thumb ? keep : drop), 'list_rep_thumbnail', p.thumb ? keep : drop);
  html = group(html, 't3', keep);
  html = group(html, 'list', page === 'category'
    ? (inner) => fill(group(group(inner, 'list_empty', drop), 'list_rep', (rep) => POSTS.map((p) => fill(withThumb(rep, p), postVals(p))).join('')), { list_conform: '분양분석', list_count: 71 })
    : drop);
  html = group(html, 'article_rep', (inner) => {
    if (page === 'index') return POSTS.map((p) => fill(withThumb(group(group(inner, 'permalink_article_rep', drop), 'index_article_rep', keep), p), postVals(p))).join('');
    if (page === 'post') return fill(group(group(inner, 'index_article_rep', drop), 'permalink_article_rep', keep), postVals(post));
    return '';
  });
  for (const g of ['rp_count', 'sidebar', 'sidebar_element']) html = group(html, g, keep);
  for (const g of ['notice_rep', 'guest', 'tag', 'ad_div', 'tag_label']) html = group(html, g, drop);
  html = group(html, 'paging', (inner) => group(inner, 'paging_rep', (rep) => [1, 2, 3, 4].map((n) => fill(rep, { paging_rep_link: 'href="#"', paging_rep_link_num: n === 1 ? '<span class="selected">1</span>' : n })).join('')));
  html = group(html, 'rctps_popular_rep', (rep) => POPULAR.map((t) => fill(rep, { rctps_rep_link: '/post', rctps_rep_title: t })).join(''));
  html = group(html, 'random_tags', (rep) => TAGS.map((t) => fill(rep, { tag_link: '#', tag_name: t })).join(''));
  html = fill(html, {
    page_title: 'aulee의 청약달력', title: 'aulee의 청약달력', desc: '우리의 청약 일정, 매일 아침 갱신', blog_link: '/', rss_url: '/rss',
    body_id: { index: 'tt-body-index', post: 'tt-body-page', category: 'tt-body-category' }[page],
    blog_menu: MENU_HTML, category_list: CATEGORY_HTML, comment_group: '<p class="empty">(댓글 영역)</p>',
    'var_schedule-url': '/schedule.json', prev_page: 'href="#"', next_page: 'href="#"', no_more_prev: 'no-more-prev', no_more_next: '',
  });
  html = html.replace(/\[##_[\w-]+_##\]/g, ''); // 광고 등 나머지는 빈 값
  html = html.replace(/(href|src)="\.\//g, '$1="/'); // 티스토리처럼 스킨 파일은 절대 경로로(/category/... 아래에서도 열리게)
  const leftover = [...html.matchAll(/<\/?s_\w+>|\[##_/g)].map((m) => m[0]);
  return { html, unknown: [...unknown], leftover };
}

// 실제 수집본(site/schedule.json)이 있으면 그걸, 없으면 샘플
async function schedulePath() {
  const real = join(ROOT, 'site', 'schedule.json');
  return access(real).then(() => real, () => join(ROOT, 'preview', 'sample-schedule.json'));
}

const TYPES = { '.png': 'image/png', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.html': 'text/html; charset=utf-8' };

async function check() {
  let ok = true;
  const fail = (msg) => { ok = false; console.log('  ✗ ' + msg); };
  for (const page of ['index', 'post', 'category']) {
    const r = await render(page);
    if (r.unknown.length) fail(`${page}: 문서에 없는 치환자 ${r.unknown.join(', ')}`);
    if (r.leftover.length) fail(`${page}: 남은 치환자 ${[...new Set(r.leftover)].join(', ')}`);
    if (!r.html.includes(`id="tt-body-${page === 'post' ? 'page' : page}"`)) fail(`${page}: body id`);
    if (page === 'index' && (r.html.match(/class="card"/g) || []).length !== POSTS.length) fail('index: 글 카드 수');
    if (page === 'post' && !r.html.includes('class="post"')) fail('post: 본문 없음');
    console.log(`  ${page} 렌더 확인`);
  }
  try { execFileSync(process.execPath, ['--check', join(SKIN, 'images', 'calendar.js')]); console.log('  calendar.js 문법 확인'); } catch (e) { fail('calendar.js 문법 오류\n' + e.stderr); }
  try { execFileSync(process.execPath, [join(ROOT, 'crawler', 'check.mjs')], { stdio: 'inherit' }); } catch { fail('crawler/check.mjs 실패'); }
  try { execFileSync(process.execPath, [join(ROOT, 'posts', 'map.check.mjs')], { stdio: 'inherit' }); } catch { fail('posts/map.check.mjs 실패'); }
  try { execFileSync(process.execPath, [join(ROOT, 'posts', 'nearby.check.mjs')], { stdio: 'inherit' }); } catch { fail('posts/nearby.check.mjs 실패'); }
  try { execFileSync(process.execPath, [join(ROOT, 'posts', 'weekly.check.mjs')], { stdio: 'inherit' }); } catch { fail('posts/weekly.check.mjs 실패'); }
  const sch = JSON.parse(await readFile(await schedulePath(), 'utf8'));
  if (!sch.items?.length) fail('schedule.json 비어 있음'); else console.log(`  schedule.json ${sch.items.length}건${sch.sample ? ' (샘플)' : ''}`);
  // 주간 글: 샘플 수집본으로 초안을 만들고 검수가 통과하는지, 틀린 숫자를 잡는지
  const sample = JSON.parse(await readFile(join(ROOT, 'preview', 'sample-schedule.json'), 'utf8'));
  const good = draftOf(sample, '2026-10-19', ['이번 주 일정 요약입니다.']);
  const bad = { ...good, summary: ['접수 999곳'] };
  const gi = checkDraft(good, sample), bi = checkDraft(bad, sample);
  if (gi.length || !good.facts.receipt) fail('주간 초안 검수: ' + (gi.join(' / ') || '접수 0곳'));
  else if (!bi.some((i) => i.includes('999'))) fail('주간 초안 검수가 틀린 숫자를 못 잡음');
  else console.log(`  주간 초안 생성·검수 확인 (샘플 접수 ${good.facts.receipt}곳)`);
  console.log(ok ? '점검 통과' : '점검 실패');
  return ok;
}

if (process.argv.includes('--check')) {
  process.exit((await check()) ? 0 : 1);
} else {
  createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      // 주간 초안 미리보기: /draft/2026-10-26_weekly → 글 화면에 drafts/…json 본문을 넣어 보여 준다
      const dm = /^\/draft\/([\w-]+)$/.exec(path);
      if (dm) {
        const d = JSON.parse(await readFile(join(ROOT, 'drafts', dm[1] + '.json'), 'utf8'));
        const files = Object.fromEntries((d.images || []).map((i) => [i.key, i]));
        const desc = d.html.replace(IMG_RE, (m, k) => (files[k] ? `<p><img src="/${files[k].file}" alt="${files[k].alt}" style="max-width:100%;height:auto"></p>` : m));
        const { html } = await render('post', { cat: d.category, title: d.title, date: '[발행일]', rp: 0, link: '#', summary: '', thumb: '', desc });
        res.writeHead(200, { 'content-type': TYPES['.html'] });
        return res.end(html);
      }
      const page = path.startsWith('/category') ? 'category' : { '/': 'index', '/post': 'post' }[path];
      if (page) {
        const { html } = await render(page);
        res.writeHead(200, { 'content-type': TYPES['.html'] });
        return res.end(html);
      }
      const DRAFTS = join(ROOT, 'drafts');
      const file = path === '/schedule.json' ? await schedulePath() : path.startsWith('/drafts/') ? join(ROOT, path) : join(SKIN, path);
      if (!file.startsWith(SKIN) && !file.startsWith(DRAFTS) && path !== '/schedule.json') throw new Error('forbidden');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  }).listen(PORT, () => {
    console.log(`미리보기: http://localhost:${PORT}/  (글 /post, 목록 /category)`);
    if (process.argv.includes('--open')) exec(`start "" http://localhost:${PORT}/`);
  });
}

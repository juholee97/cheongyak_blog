// auleezip.com 사이트 모양 맞추기(2026-10-29 디자인 적용): 글쓴이 이름·주소, 전역 스타일(zip/site.css), 템플릿(글·페이지·목록), 머리·바닥 템플릿 파트
// node zip/site.mjs            바꿀 것만 출력(올리지 않음)
// node zip/site.mjs --go       올리고 다시 불러와 대조 → 캐시 비우기
// node zip/site.mjs --purge    WP Super Cache 전체 비우기(글·페이지를 고친 뒤 — 이 사이트는 글을 고쳐도 캐시를 자동으로 안 비운다)
// 되돌리기: 워드프레스 사이트 편집기에서 템플릿 「초기화」, 또는 REST DELETE templates/twentytwentyfive//single 등
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { wp } from './wp.mjs';

const THEME = 'twentytwentyfive', SITE = 'https://auleezip.com';
// url은 구조화 데이터의 sameAs로 나간다(호스팅 기본 주소 juholee97.mycafe24.com이 나가던 것) — 같은 사람이 쓰는 티스토리로
export const AUTHOR = { name: 'aulee', nickname: 'aulee', slug: 'aulee', url: 'https://aulee.tistory.com/', description: '청약 공고의 분양가·임대료를 주변 실거래와 맞춰 보는 「우리의 집」과 청약 일정을 정리하는 「우리의 청약달력」을 운영합니다.' };
// 한글 글꼴: 구글 글꼴 조각(쓰인 글자만 받음). 사이트 서버에 두면 188조각 @font-face가 모든 페이지에 붙어 오히려 무거워진다
const FONT = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600&amp;display=swap">';
// 로고 「우리의 집」: 우리 위에 aulee, 집 위에 zip(루비) — 주소 auleezip.com을 그대로 읽게 한다(2026-10-29 사용자: 이름은 우리의 집, aulee는 디자인으로)
export const LOGO = `<a class="az-logo" href="${SITE}/" rel="home" aria-label="우리의 집"><ruby>우리<rt aria-hidden="true">aulee</rt></ruby>의 <ruby>집<rt aria-hidden="true">zip</rt></ruby></a>`;
const NAV = [['열린 공고', `${SITE}/`], ['분양 시세', `${SITE}/category/분양-시세비교/`], ['임대 시세', `${SITE}/category/임대-시세비교/`], ['비교 기준', `${SITE}/method/`]];

const header = `<!-- wp:html -->
${FONT}
<!-- /wp:html -->
<!-- wp:group {"className":"az-header","layout":{"type":"default"}} -->
<div class="wp-block-group az-header"><!-- wp:group {"className":"az-header-in","layout":{"type":"default"}} -->
<div class="wp-block-group az-header-in"><!-- wp:group {"className":"az-brand","layout":{"type":"flex","flexWrap":"nowrap","verticalAlignment":"center"}} -->
<div class="wp-block-group az-brand"><!-- wp:html -->
${LOGO}
<!-- /wp:html -->
<!-- wp:paragraph {"className":"az-tag"} -->
<p class="az-tag">청약 공고 × 실거래 비교</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->
<!-- wp:navigation {"overlayBackgroundColor":"base","overlayTextColor":"contrast","layout":{"type":"flex","justifyContent":"right","flexWrap":"wrap"}} -->
${NAV.map(([label, url]) => `<!-- wp:navigation-link {"label":"${label}","url":"${encodeURI(url)}","kind":"custom","isTopLevelLink":true} /-->`).join('\n')}
<!-- /wp:navigation --></div>
<!-- /wp:group --></div>
<!-- /wp:group -->`;

const footer = `<!-- wp:group {"className":"az-footer","layout":{"type":"default"}} -->
<div class="wp-block-group az-footer"><!-- wp:html -->
<div class="az-footer-in"><div class="az-foot-cols"><div><p class="az-foot-name">${LOGO}</p><p>청약 공고의 분양가·임대료를 주변 실거래와 나란히 놓고 봅니다. auleezip.com</p></div>
<nav class="az-foot-nav" aria-label="사이트 안내"><a href="${SITE}/">현재 열린 공고</a><a href="${SITE}/method/">비교 기준</a><a href="${SITE}/about/">소개</a><a href="${SITE}/privacy/">개인정보처리방침</a><a href="https://aulee.tistory.com">우리의 청약달력</a></nav></div>
<p class="az-foot-note">분석은 aulee가 직접 합니다. 청약 공고문과 국토교통부 실거래 자료를 하나하나 맞춰 보고, 비교 단지를 고른 이유와 계산 방법을 글마다 밝힙니다. 신청 전에는 반드시 입주자모집공고 원문을 확인하시기 바랍니다.</p></div>
<!-- /wp:html --></div>
<!-- /wp:group -->`;

const part = (slug) => `<!-- wp:template-part {"slug":"${slug}","theme":"${THEME}"} /-->`;
// 글: 카테고리 → 제목 → 글쓴이·올린 날·고친 날 → 본문(zip/ui.mjs 틀) → 태그. 대표 이미지는 화면에선 빼고(제목과 겹침) 검색·공유 미리보기용으로만 둔다. 댓글 없음
const single = `${part('header')}
<!-- wp:group {"tagName":"main","className":"az-main","layout":{"type":"default"}} -->
<main class="wp-block-group az-main"><!-- wp:group {"className":"az-head","layout":{"type":"default"}} -->
<div class="wp-block-group az-head"><!-- wp:post-terms {"term":"category","separator":" · ","className":"az-eyebrow"} /-->
<!-- wp:post-title {"level":1,"className":"az-title"} /-->
<!-- wp:group {"className":"az-meta","layout":{"type":"flex","flexWrap":"wrap"}} -->
<div class="wp-block-group az-meta"><!-- wp:post-author-name /-->
<!-- wp:post-date {"format":"Y.m.d"} /-->
<!-- wp:post-date {"format":"Y.m.d","displayType":"modified"} /--></div>
<!-- /wp:group --></div>
<!-- /wp:group -->
<!-- wp:post-content {"className":"az-content","layout":{"type":"default"}} /-->
<!-- wp:group {"className":"az-after","layout":{"type":"default"}} -->
<div class="wp-block-group az-after"><!-- wp:post-terms {"term":"post_tag","separator":"","className":"az-tags"} /--></div>
<!-- /wp:group --></main>
<!-- /wp:group -->
${part('footer')}`;

const page = `${part('header')}
<!-- wp:group {"tagName":"main","className":"az-main","layout":{"type":"default"}} -->
<main class="wp-block-group az-main"><!-- wp:group {"className":"az-head","layout":{"type":"default"}} -->
<div class="wp-block-group az-head"><!-- wp:post-title {"level":1,"className":"az-title"} /--></div>
<!-- /wp:group -->
<!-- wp:post-content {"className":"az-content","layout":{"type":"default"}} /--></main>
<!-- /wp:group -->
${part('footer')}`;

const archive = `${part('header')}
<!-- wp:group {"tagName":"main","className":"az-main","layout":{"type":"default"}} -->
<main class="wp-block-group az-main"><!-- wp:group {"className":"az-head","layout":{"type":"default"}} -->
<div class="wp-block-group az-head"><!-- wp:query-title {"type":"archive","showPrefix":false,"className":"az-title"} /-->
<!-- wp:term-description {"className":"az-note"} /--></div>
<!-- /wp:group -->
<!-- wp:group {"className":"az-content","layout":{"type":"default"}} -->
<div class="wp-block-group az-content"><!-- wp:query {"queryId":1,"query":{"perPage":20,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true},"className":"az-list"} -->
<div class="wp-block-query az-list"><!-- wp:post-template -->
<!-- wp:group {"className":"az-item","layout":{"type":"default"}} -->
<div class="wp-block-group az-item"><!-- wp:post-title {"level":2,"isLink":true} /-->
<!-- wp:post-excerpt {"excerptLength":70} /-->
<!-- wp:post-date {"format":"Y.m.d"} /--></div>
<!-- /wp:group -->
<!-- /wp:post-template -->
<!-- wp:query-pagination -->
<!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /-->
<!-- /wp:query-pagination -->
<!-- wp:query-no-results -->
<!-- wp:paragraph -->
<p>아직 글이 없습니다.</p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results --></div>
<!-- /wp:query --></div>
<!-- /wp:group --></main>
<!-- /wp:group -->
${part('footer')}`;

export const TEMPLATES = { single, page, archive }, PARTS = { header, footer };

export async function purge() {
  const env = await readFile(join(ROOT, '.env'), 'utf8');
  const g = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();
  const r = await fetch(`${g('WP_URL').replace(/\/$/, '')}/wp-json/wp-super-cache/v1/cache`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${g('WP_USER')}:${g('WP_APP_PASSWORD')}`).toString('base64'), 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) });
  return r.ok;
}

if (process.argv[1]?.endsWith('site.mjs')) {
  const go = process.argv.includes('--go');
  if (process.argv.includes('--purge')) console.log('캐시 비우기', (await purge()) ? '✓' : '✗');
  else await apply(go);
}

async function apply(go) {
  const css = await readFile(join(ROOT, 'zip/site.css'), 'utf8');
  const todo = [];
  // 1) 글쓴이: 화면·작성자 주소·구조화 데이터에 로그인 아이디 대신 aulee
  const me = await wp('users/me?context=edit');
  if (Object.entries(AUTHOR).some(([k, v]) => me[k] !== v)) todo.push(['글쓴이', () => wp('users/me', { method: 'POST', body: AUTHOR }), async () => { const u = await wp('users/me?context=edit'); return Object.entries(AUTHOR).every(([k, v]) => u[k] === v); }]);
  // 2) 전역 스타일: 본문·제목 폭, 추가 CSS
  const [t] = await wp('themes?status=active&context=edit');
  const gsId = t._links['wp:user-global-styles'][0].href.match(/global-styles\/(\d+)/)[1];
  const gs = await wp(`global-styles/${gsId}?context=edit`);
  const settings = { ...gs.settings, layout: { contentSize: '720px', wideSize: '1040px' } };
  if (gs.styles?.css !== css || JSON.stringify(gs.settings?.layout) !== JSON.stringify(settings.layout)) todo.push(['전역 스타일', () => wp(`global-styles/${gsId}`, { method: 'POST', body: { styles: { ...gs.styles, css }, settings } }), async () => (await wp(`global-styles/${gsId}?context=edit`)).styles?.css === css]);
  // 3) 템플릿·파트
  for (const [kind, map] of [['templates', TEMPLATES], ['template-parts', PARTS]]) {
    for (const [slug, content] of Object.entries(map)) {
      const cur = await wp(`${kind}/${THEME}//${slug}?context=edit`);
      if (cur.content?.raw?.trim() !== content.trim()) todo.push([`${kind === 'templates' ? '템플릿' : '파트'} ${slug}${cur.source === 'theme' ? '(테마 기본 → 사용자 수정)' : ''}`, () => wp(`${kind}/${THEME}//${slug}`, { method: 'POST', body: { content } }), async () => (await wp(`${kind}/${THEME}//${slug}?context=edit`)).content.raw.trim() === content.trim()]);
    }
  }
  if (!todo.length) console.log('바꿀 것 없음');
  for (const [what, run, check] of todo) {
    if (!go) { console.log('바꿀 것:', what); continue; }
    await run();
    console.log(`${(await check()) ? '✓' : '✗ 다시 불러온 값이 다름'} ${what}`);
  }
  if (go && todo.length) console.log('캐시 비우기', (await purge()) ? '✓' : '✗');
}

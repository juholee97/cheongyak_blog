// auleezip.com 공개 규칙(2026-10-28 사용자 결정): 접수까지 7일 넘게 남은 공고만 접수 7일 전 09:00 예약, 나머지는 즉시 발행.
// 접수가 끝난 공고도 글에 「접수 마감」 표시를 달아 계속 공개한다(현재 열린 공고 페이지로 보내 사이트 안을 돌게 한다).
// node zip/publish.mjs          계획만 출력(올리지 않음)
// node zip/publish.mjs --go     계획대로 올리고 다시 불러와 대조 + 고정 페이지(열린 공고·비교 기준·소개·개인정보) 갱신 + 캐시 비우기
// node zip/publish.mjs --go --pages   글은 그대로 두고 고정 페이지만(매일 아침 analysis_auto.bat — 접수 중/마감·D-day가 날짜 따라 바뀐다)
// 올릴 때 글 끝 「고친 기록」을 채운다(zip/revlog.mjs — 처음 올린 날, 숫자가 바뀐 날)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { upsert, upsertPage, uploadMedia, wp } from './wp.mjs';
import { closedOf } from './post.mjs';
import { openPage, methodPage, aboutPage, privacyPage, saleList } from './pages.mjs';
import { loadViews } from './views.mjs';
import { loadLog, saveLog, applyLog } from './revlog.mjs';
import { purge } from './site.mjs';

const kst = () => new Date(Date.now() + 9 * 3600e3);
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

// 공고 → 공개 계획: { mode: 'now' | 'at', at?, why }
export function planOf(phases, today) {
  const dates = (phases || []).filter((p) => ['sp', 'p1'].includes(p.k) && p.date).map((p) => p.date).sort();
  if (!dates.length) return { mode: 'now', why: '접수일 없음 — 즉시' };
  if (closedOf(phases, today)) return { mode: 'now', why: '접수 마감 표시로 공개' };
  const when = addDays(dates[0], -7);
  if (when > today) return { mode: 'at', at: `${when} 09:00`, why: `접수 ${dates[0]} — 1주일 전 예약` };
  return { mode: 'now', why: `접수 ${dates[0]} — 1주일 안이라 즉시` };
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const P = (d) => [{ k: 'p1', date: d }];
  assert.equal(planOf(P('2026-11-20'), '2026-10-28').at, '2026-11-13 09:00');
  assert.equal(planOf(P('2026-11-04'), '2026-10-28').mode, 'now'); // 정확히 7일 전이면 오늘이 그날이라 즉시
  assert.equal(planOf(P('2026-11-05'), '2026-10-28').mode, 'at'); // 8일 남음 → 내일 09:00 예약
  assert.equal(planOf(P('2026-10-27'), '2026-10-28').why, '접수 마감 표시로 공개'); // 끝난 공고도 공개
  console.log('publish 점검 통과');
} else if (process.argv[1]?.endsWith('publish.mjs')) {
  const go = process.argv.includes('--go');
  const { items } = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8')), today = ymd(kst());
  // 공개한 공고 장부: 자료가 일시적으로 비어도(예: 지도 사용량 한도) 「현재 열린 공고」 페이지에서 글이 빠지지 않게 쌓아 둔다
  const regFile = join(ROOT, 'data/zip_registry.json'), reg = JSON.parse(await readFile(regFile, 'utf8').catch(() => '{}'));
  const oi = process.argv.indexOf('--only'), only = oi > 0 ? process.argv[oi + 1].split(',') : null; // --only 공고번호: 그 글만 올린다(고정 페이지는 장부로 늘 갱신)
  const seen = new Set(), live = [], pagesOnly = process.argv.includes('--pages'), store = await loadLog();
  for (const r of pagesOnly ? [] : items.filter((x) => !x.skip)) {
    const post = JSON.parse(await readFile(join(ROOT, 'data/zip_posts', `${r.no}.json`), 'utf8').catch(() => 'null'));
    if (!post || seen.has(post.slug) || (only && !only.includes(r.no))) continue; // 합쳐진 공고는 글이 하나
    seen.add(post.slug);
    const phases = items.filter((x) => x.name === r.name).flatMap((x) => x.phases || []);
    const pl = planOf(phases, today);
    let res = '';
    if (go) {
      post.featured = await uploadMedia(join(ROOT, 'data/zip_posts/img', `${r.no}.png`), `apt-${r.no}.png`, post.title).catch(() => undefined); // 대표 이미지(없으면 글만)
      post.html = applyLog(store, post, { today, first: pl.mode === 'at' ? pl.at.slice(0, 10) : today });
      const o = await upsert(post, pl.mode === 'at' ? pl.at : null, pl.mode === 'now');
      if (o.ok) await saveLog(store);
      res = ` → ${o.ok ? '✓' : '✗'} ${o.status} ${o.link}`;
    }
    if (pl.mode === 'now') live.push({ ...r, phases });
    if (go && pl.mode === 'now') reg[r.no] = { no: r.no, name: r.name, region: r.region, district: r.district, kind: r.kind, address: r.address, phases };
    console.log(`${pl.mode.padEnd(4)} ${pl.at || ''} ${post.title.slice(0, 44)} · ${pl.why}${res}`);
  }
  if (go) {
    await (await import('node:fs/promises')).writeFile(regFile, JSON.stringify(reg, null, 1));
    // 첫 화면 막대: 분양은 deals.json의 차이(%), 임대(SH)는 월세 비율 범위
    const res = {};
    for (const r of items.filter((x) => !x.skip)) res[r.no] = { d: -r.rate * 100, leasehold: !!r.leasehold };
    const sh = JSON.parse(await readFile(join(ROOT, 'data/sh_rent.json'), 'utf8').catch(() => '[]')), by = {};
    for (const u of sh) if (u.result && !u.result.insufficient) (by[u.id] ||= []).push(Math.round(u.result.ratio * 100));
    for (const [id, rs] of Object.entries(by)) { const lo = Math.min(...rs), hi = Math.max(...rs); res[id] = { text: `월세가 주변 거래의 ${lo === hi ? lo : `${lo}~${hi}`}%` }; }
    const pages = [['open-notices', '현재 열린 공고', openPage(Object.values(reg), today, res)], ['method', '비교 기준', methodPage()], ['about', '소개', aboutPage()], ['privacy', '개인정보처리방침', privacyPage()]];
    let openId;
    for (const [slug, title, html] of pages) { const o = await upsertPage({ slug, title, html }); if (slug === 'open-notices') openId = o.id; console.log(`${o.ok ? '✓' : '✗'} 페이지 ${slug} ${o.link}`); }
    // 첫 화면을 「현재 열린 공고」로: 방문자가 사이트 안을 돌게 한다
    await wp('settings', { method: 'POST', body: { show_on_front: 'page', page_on_front: openId } }).then((s) => console.log('첫 화면:', s.show_on_front, s.page_on_front)).catch((e) => console.log('첫 화면 설정 못 바꿈:', e.message));
    // 「분양 시세비교」 목록 = 카테고리 템플릿 category-<id>(글 왼쪽, 조감도 오른쪽). 조감도는 data/zip_views.json(zip/views.mjs)을 미디어로 올려 쓴다
    const views = await loadViews(), posts = {};
    for (const [no, v] of Object.entries(views)) if (v.file && !v.url) {
      const id = await uploadMedia(join(ROOT, v.file), `view-${no}.jpg`, `${reg[no]?.name || no} 조감도`).catch(() => null);
      if (id) Object.assign(v, { mid: id, url: (await wp(`media/${id}`)).source_url });
    }
    await (await import('node:fs/promises')).writeFile(join(ROOT, 'data/zip_views.json'), JSON.stringify(views, null, 1));
    for (const r of Object.values(reg)) { const j = JSON.parse(await readFile(join(ROOT, 'data/zip_posts', `${r.slug || r.no}.json`), 'utf8').catch(() => 'null')); if (j) posts[r.no] = { title: j.title, excerpt: j.excerpt, link: `https://auleezip.com/${j.slug}/` }; }
    const [cat] = await wp(`categories?slug=${encodeURIComponent('분양-시세비교')}`);
    if (cat) {
      const slug = `category-${cat.id}`, content = `<!-- wp:template-part {"slug":"header","theme":"twentytwentyfive"} /-->
<!-- wp:html -->
<main class="az-main"><div class="az-head"><h1 class="az-title">${cat.name}</h1></div><div class="az-content"><div class="az az-page">
${saleList(Object.values(reg), today, res, posts, views)}
</div></div></main>
<!-- /wp:html -->
<!-- wp:template-part {"slug":"footer","theme":"twentytwentyfive"} /-->`;
      const old = await wp(`templates/twentytwentyfive//${slug}?context=edit`).catch(() => null);
      const t = old ? await wp(`templates/twentytwentyfive//${slug}`, { method: 'POST', body: { content } }) : await wp('templates', { method: 'POST', body: { slug, title: `${cat.name} 목록`, content } });
      console.log(`${t?.content?.raw === content ? '✓' : '✗'} 목록 템플릿 ${slug} (조감도 ${Object.values(views).filter((v) => v.url).length}곳)`);
    }
    console.log('캐시 비우기', (await purge()) ? '✓' : '✗'); // 이 사이트는 글을 고쳐도 캐시를 자동으로 안 비운다
  }
}

// auleezip.com 공개 규칙(2026-10-28 사용자 결정): 접수까지 7일 넘게 남은 공고만 접수 7일 전 09:00 예약, 나머지는 즉시 발행.
// 접수가 끝난 공고도 글에 「접수 마감」 표시를 달아 계속 공개한다(현재 열린 공고 페이지로 보내 사이트 안을 돌게 한다).
// node zip/publish.mjs          계획만 출력(올리지 않음)
// node zip/publish.mjs --go     계획대로 올리고 다시 불러와 대조 + 고정 페이지(열린 공고·소개·개인정보) 갱신
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { upsert, upsertPage, uploadMedia, wp } from './wp.mjs';
import { closedOf } from './post.mjs';
import { openPage, aboutPage, privacyPage } from './pages.mjs';

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
  const seen = new Set(), live = [];
  for (const r of items.filter((x) => !x.skip)) {
    const post = JSON.parse(await readFile(join(ROOT, 'data/zip_posts', `${r.no}.json`), 'utf8').catch(() => 'null'));
    if (!post || seen.has(post.slug)) continue; // 합쳐진 공고는 글이 하나
    seen.add(post.slug);
    const phases = items.filter((x) => x.name === r.name).flatMap((x) => x.phases || []);
    const pl = planOf(phases, today);
    let res = '';
    if (go) {
      post.featured = await uploadMedia(join(ROOT, 'data/zip_posts/img', `${r.no}.png`), `apt-${r.no}.png`, post.title).catch(() => undefined); // 대표 이미지(없으면 글만)
      const o = await upsert(post, pl.mode === 'at' ? pl.at : null, pl.mode === 'now');
      res = ` → ${o.ok ? '✓' : '✗'} ${o.status} ${o.link}`;
    }
    if (pl.mode === 'now') live.push({ ...r, phases });
    if (go && pl.mode === 'now') reg[r.no] = { no: r.no, name: r.name, region: r.region, district: r.district, kind: r.kind, address: r.address, phases };
    console.log(`${pl.mode.padEnd(4)} ${pl.at || ''} ${post.title.slice(0, 44)} · ${pl.why}${res}`);
  }
  if (go) {
    await (await import('node:fs/promises')).writeFile(regFile, JSON.stringify(reg, null, 1));
    const pages = [['open-notices', '현재 열린 공고', openPage(Object.values(reg), today)], ['about', '소개', aboutPage()], ['privacy', '개인정보처리방침', privacyPage()]];
    let openId;
    for (const [slug, title, html] of pages) { const o = await upsertPage({ slug, title, html }); if (slug === 'open-notices') openId = o.id; console.log(`${o.ok ? '✓' : '✗'} 페이지 ${slug} ${o.link}`); }
    // 첫 화면을 「현재 열린 공고」로: 방문자가 사이트 안을 돌게 한다
    await wp('settings', { method: 'POST', body: { show_on_front: 'page', page_on_front: openId } }).then((s) => console.log('첫 화면:', s.show_on_front, s.page_on_front)).catch((e) => console.log('첫 화면 설정 못 바꿈:', e.message));
  }
}

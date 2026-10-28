// 고친 기록(디자인 C, 2026-10-29): data/zip_revlog.json { slug: { first: 'YYYY-MM-DD', snap, log: [{ d, t }] } }
// 글 파일(zip/post.mjs·zip/sh_write.mjs)은 본문에 LOG_MARK 자리만 두고 post.snap(비교 숫자 요약)을 함께 저장한다. 올리기 직전 applyLog가
//  · 처음 올리는 글: first = 올리는 날(예약이면 예약일), 「처음 올림 · …」 한 줄
//  · 이미 올린 글인데 snap이 바뀜: 오늘 날짜로 무엇이 바뀌었는지 한 줄(같은 날 또 바뀌면 그날 줄을 고쳐 씀)
// 을 기록하고 LOG_MARK를 기록 목록으로 바꾼다. 디자인만 바뀐 경우(숫자 그대로)는 기록하지 않는다 — 날짜만 바꾸는 갱신은 하지 않는다.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { LOG_MARK, logHtml, num } from './ui.mjs';

const FILE = join(ROOT, 'data/zip_revlog.json');
export const loadLog = async () => JSON.parse(await readFile(FILE, 'utf8').catch(() => '{}'));
export const saveLog = (store) => writeFile(FILE, JSON.stringify(store, null, 1));

const firstText = (snap) => (snap?.months ? `처음 올림 · 실거래 ${snap.months} 기준` : snap?.ratios ? '처음 올림 · 주변 전월세 실거래 최근 6개월 기준' : '처음 올림');
const range = (a) => (Math.min(...a) === Math.max(...a) ? `${Math.min(...a)}%` : `${Math.min(...a)}~${Math.max(...a)}%`);
export function changeText(a, b) {
  const t = [];
  if (a.months !== b.months && b.months) t.push(`실거래 ${b.months} 기준으로 다시 계산`);
  if (a.own !== b.own && b.own != null) t.push(`분양가 3.3㎡당 ${num(a.own)}→${num(b.own)}만원`);
  if (a.n !== b.n && b.n != null) t.push(`비교 단지 ${a.n}→${b.n}곳`);
  if (a.med !== b.med && b.med != null) t.push(`비교 단지 시세 3.3㎡당 ${num(a.med)}→${num(b.med)}만원`);
  if (b.ratios && JSON.stringify(a.ratios) !== JSON.stringify(b.ratios)) t.push(`주변 월세 비교 다시 계산(월세 비율 ${a.ratios ? range(a.ratios) + '→' : ''}${range(b.ratios)})`);
  return t.join(' · ');
}

// post: { slug, html, snap } → html(기록 채움). store는 고쳐진다(저장은 올리기가 성공한 뒤 saveLog로)
export function applyLog(store, post, { today, first }) {
  const e = store[post.slug];
  if (!e) store[post.slug] = { first, snap: post.snap || null, log: [{ d: first, t: firstText(post.snap) }] };
  else if (post.snap && e.snap && JSON.stringify(e.snap) !== JSON.stringify(post.snap)) {
    const t = changeText(e.snap, post.snap);
    if (t) { const last = e.log.at(-1); if (last?.d === today && last.t !== firstText(e.snap)) last.t = t; else e.log.push({ d: today, t }); }
    e.snap = post.snap;
  } else if (post.snap && !e.snap) e.snap = post.snap;
  return post.html.replace(LOG_MARK, logHtml(store[post.slug].log));
}

if (process.argv[1]?.endsWith('revlog.mjs') && process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const st = {}, snap = { months: '2025.11~2026.10', n: 6, own: 3623, med: 3041 };
  let h = applyLog(st, { slug: 'a', html: `x${LOG_MARK}y`, snap }, { today: '2026-10-28', first: '2026-10-28' });
  assert.ok(h.includes('처음 올림 · 실거래 2025.11~2026.10 기준') && !h.includes(LOG_MARK));
  h = applyLog(st, { slug: 'a', html: `x${LOG_MARK}`, snap }, { today: '2026-10-29', first: '2026-10-29' });
  assert.equal(st.a.log.length, 1); // 숫자 그대로면 기록 안 함(디자인만 바뀐 경우)
  applyLog(st, { slug: 'a', html: LOG_MARK, snap: { ...snap, med: 3100 } }, { today: '2026-10-30', first: '' });
  applyLog(st, { slug: 'a', html: LOG_MARK, snap: { ...snap, med: 3120 } }, { today: '2026-10-30', first: '' });
  assert.equal(st.a.log.length, 2); assert.equal(st.a.log[1].t, '비교 단지 시세 3.3㎡당 3,100→3,120만원'); // 같은 날 두 번 바뀌면 그날 줄을 고쳐 씀
  assert.equal(changeText({ ratios: [42, 46] }, { ratios: [40, 45] }), '주변 월세 비교 다시 계산(월세 비율 42~46%→40~45%)');
  console.log('revlog 점검 통과');
}

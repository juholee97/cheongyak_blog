// auleezip.com 공개 규칙(2026-10-28 사용자 결정): 접수 1주일 전에 올리는 글(접수까지 7일 넘게 남은 공고)만 그날 09:00 예약,
// 나머지는 즉시 발행. 접수가 이미 끝난 공고는 올리지 않는다.
// node zip/publish.mjs          계획만 출력(올리지 않음)
// node zip/publish.mjs --go     계획대로 올리고 다시 불러와 대조(사용자 승인 뒤에만)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { upsert } from './wp.mjs';

const kst = () => new Date(Date.now() + 9 * 3600e3);
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

// 공고 → 공개 계획: { mode: 'now' | 'at' | 'skip', at?, why }
export function planOf(phases, today) {
  const dates = (phases || []).filter((p) => ['sp', 'p1'].includes(p.k) && p.date).map((p) => p.date).sort();
  if (!dates.length) return { mode: 'skip', why: '접수일 없음' };
  const start = dates[0], end = (phases || []).filter((p) => p.k === 'p1' || p.k === 'sp').map((p) => p.date).sort().at(-1);
  if (end < today) return { mode: 'skip', why: `접수 끝남(${end})` };
  const when = addDays(start, -7);
  if (when > today) return { mode: 'at', at: `${when} 09:00`, why: `접수 ${start} — 1주일 전 예약` };
  return { mode: 'now', why: `접수 ${start} — 1주일 안이라 즉시` };
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const P = (d) => [{ k: 'p1', date: d }];
  assert.equal(planOf(P('2026-11-20'), '2026-10-28').mode, 'at');
  assert.equal(planOf(P('2026-11-20'), '2026-10-28').at, '2026-11-13 09:00');
  assert.equal(planOf(P('2026-11-04'), '2026-10-28').mode, 'now'); // 정확히 7일 전이면 오늘이 그날이라 즉시
  assert.equal(planOf(P('2026-11-05'), '2026-10-28').mode, 'at'); // 8일 남음 → 내일 09:00 예약
  assert.equal(planOf(P('2026-10-27'), '2026-10-28').mode, 'skip');
  console.log('publish 점검 통과');
} else if (process.argv[1]?.endsWith('publish.mjs')) {
  const go = process.argv.includes('--go');
  const { items } = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8')), today = ymd(kst());
  const seen = new Set();
  for (const r of items.filter((x) => !x.skip)) {
    const post = JSON.parse(await readFile(join(ROOT, 'data/zip_posts', `${r.no}.json`), 'utf8').catch(() => 'null'));
    if (!post || seen.has(post.slug)) continue; // 합쳐진 공고는 글이 하나
    seen.add(post.slug);
    // 합쳐진 글은 묶인 공고 가운데 접수가 가장 늦은 일정까지 본다
    const phases = items.filter((x) => x.name === r.name).flatMap((x) => x.phases || []);
    const pl = planOf(phases, today);
    let res = '';
    if (go && pl.mode !== 'skip') { const o = await upsert(post, pl.mode === 'at' ? pl.at : null, pl.mode === 'now'); res = ` → ${o.ok ? '✓' : '✗'} ${o.status} ${o.link}`; }
    console.log(`${pl.mode.padEnd(4)} ${pl.at || ''} ${post.title.slice(0, 40)} · ${pl.why}${res}`);
  }
}

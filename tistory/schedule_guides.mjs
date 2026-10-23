// 승인된 가이드 여러 편을 빈 예약 시각에 차례로 예약발행한다(채팅 승인을 받은 글만 넘긴다).
// node tistory/schedule_guides.mjs --start "2026-10-24 19:00" --times 08:00,19:00 slug1 slug2 ...
// 순서: 빈 시각마다, 그 시각에 이미 공개돼 있을 관련 글이 가장 많은 글부터. 링크는 늘 더 이른 시각의 글만 가리킨다(guide.mjs --at).
// 한 편마다 posts/guide.mjs로 다시 그려(관련 글 갱신) 검수한 뒤 draft.mjs --schedule. 하나라도 실패하면 멈춘다.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './common.mjs';
import { relatedOf } from '../posts/guide.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const start = arg('--start'), times = (arg('--times') || '08:00,12:00,19:00').split(',');
const slugs = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !['--start', '--times'].includes(all[i - 1]));
const json = async (p, d = {}) => JSON.parse(await readFile(join(ROOT, p), 'utf8').catch(() => JSON.stringify(d)));
const pad = (n) => String(n).padStart(2, '0');

if (!start || !slugs.length) { console.log('사용: node tistory/schedule_guides.mjs --start "YYYY-MM-DD HH:MM" [--times 08:00,12:00,19:00] slug ...'); process.exit(4); }

// 빈 시각: start부터 하루씩 times를 돌며, 이미 예약된 시각은 건너뛴다
const taken = new Set(Object.values(await json('posts/scheduled.json')).map((v) => v.when));
function* slots() {
  const day = new Date(start.slice(0, 10) + 'T00:00:00');
  for (;;) {
    const d = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
    for (const t of times) { const w = `${d} ${t}`; if (w >= start && !taken.has(w)) yield w; }
    day.setDate(day.getDate() + 1);
  }
}

const left = [...slugs];
const gen = slots();
while (left.length) {
  const when = gen.next().value;
  const score = async (s) => (await relatedOf(s, when)).length; // 이 시각에 이미 공개돼 있을 관련 글 수
  const scored = [];
  for (const s of left) scored.push([s, await score(s)]);
  scored.sort((a, b) => b[1] - a[1]);
  const [slug, n] = scored[0];
  console.log(`\n=== ${when} ${slug} (관련 글 ${n})`);
  const run = (args) => spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' }).status;
  if (run(['posts/guide.mjs', `drafts/guide_${slug}.json`, '--at', when]) !== 0) { console.log(`검수 실패 — ${slug}에서 멈춤`); process.exit(4); }
  const code = run(['tistory/draft.mjs', `drafts/guide_${slug}.json`, '--approved', '--schedule', when]);
  if (code !== 0) { console.log(`예약 실패(코드 ${code}) — ${slug}에서 멈춤. 티스토리 글 목록을 확인하세요.`); process.exit(code); }
  left.splice(left.indexOf(slug), 1);
}
console.log('\n모두 예약했습니다.');

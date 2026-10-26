// 승인된 가이드 여러 편을 빈 예약 시각에 차례로 예약발행한다(채팅 승인을 받은 글만 넘긴다).
// node tistory/schedule_guides.mjs --start "2026-10-24 19:00" --times 08:00,19:00 slug1 slug2 ...
// node tistory/schedule_guides.mjs --queue data/guide_queue.txt   승인된 대기열(공백으로 나눈 slug)을 빈 시각에. 예약한 글은 대기열에서 빼고,
//   티스토리 하루 글 한도(10-27부터 5개)에 걸리면 나머지는 남겨 둔 채 끝낸다(10-27부터 analysis_auto.bat 07:00 분석 글 뒤 --max 3, 예전 작업 스케줄러 cheongyak_guide_queue가 매일 00:30에 다시).
// 순서: 빈 시각마다, 그 시각에 이미 공개돼 있을 관련 글이 가장 많은 글부터. 링크는 늘 더 이른 시각의 글만 가리킨다(guide.mjs --at).
// 한 편마다 posts/guide.mjs로 다시 그려(관련 글 갱신) 검수한 뒤 draft.mjs --schedule. 하나라도 실패하면 멈춘다.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './common.mjs';
import { relatedOf } from '../posts/guide.mjs';

// 대기열 자동 실행(작업 스케줄러)에서 멈추면 화면에 알림 창 하나
const notify = (msg) => { if (!queue) return; const ps = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${msg.replace(/'/g, "''")}', '청약 가이드 대기열 예약') | Out-Null`; spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' }); };
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const queue = arg('--queue');
const pad0 = (n) => String(n).padStart(2, '0');
const later = new Date(Date.now() + 3600e3), tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0, 0, 0, 0);
const from = later > tomorrow ? later : tomorrow; // 대기열은 내일부터(오늘 편수는 이미 정해져 있음), 적어도 1시간 뒤
// --soon: 오늘이라도 1시간 뒤부터(정책 소식처럼 빨리 나가야 하는 글 — data/priority_queue.txt, 2026-10-27)
const soon = process.argv.includes('--soon') ? `${later.getFullYear()}-${pad0(later.getMonth() + 1)}-${pad0(later.getDate())} ${pad0(later.getHours())}:00` : null;
const start = arg('--start') || soon || (queue ? `${from.getFullYear()}-${pad0(from.getMonth() + 1)}-${pad0(from.getDate())} ${pad0(from.getHours())}:00` : null);
const times = (arg('--times') || '08:00,12:00,19:00').split(',');
const gap = +(arg('--gap') ?? (queue ? 180 : 0));
const max = +(arg('--max') ?? (queue ? 6 : Infinity)); // 한 번에 예약할 최대 편수(대기열은 하루 6편 — 하루 3편씩 나가니 앞으로 쌓이는 양이 늘 2주쯤 앞서 있다) // 글 사이 쉬는 초(짧은 시간에 저장이 몰리면 보안 확인이 뜬다 — 2026-10-24)
const slugs = queue ? (await readFile(join(ROOT, queue), 'utf8').catch(() => '')).split(/\s+/).filter(Boolean)
  : process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !['--start', '--times', '--queue', '--gap', '--max'].includes(all[i - 1]));
if (queue && !slugs.length) { console.log('대기열 비어 있음'); process.exit(0); }
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
let done = 0;
while (left.length && done < max) {
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
  if (code === 6) { const m = `티스토리 보안 확인(reCAPTCHA)이 떠서 멈춤 — ${left.length}편은 대기열에 남김. 티스토리에서 직접 글을 한 번 저장해 보거나 시간이 지난 뒤 다시`; console.log(m); notify(m); process.exit(6); }
  if (code === 5) { console.log(`티스토리 하루 글 한도 — ${left.length}편은 대기열에 남겨 두고 내일 다시`); process.exit(0); }
  if (code !== 0) { const m = `예약 실패(코드 ${code}) — ${slug}에서 멈춤. 티스토리 글 목록을 확인하세요.`; console.log(m); notify(m); process.exit(code); }
  left.splice(left.indexOf(slug), 1);
  done++;
  if (queue) await writeFile(join(ROOT, queue), left.join(' '));
  if (gap && left.length) await new Promise((r) => setTimeout(r, gap * 1000));
}
console.log('\n모두 예약했습니다.');

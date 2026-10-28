// 이미 공개된 분양분석 글을 하루 몇 편씩 새 그림·새 제목으로 고친다(2026-10-26 사용자 지시: 일정 카드 새로, 제목 앞 지역 꼬리표).
// 대기열 data/analysis_retrofit.txt — 한 줄에 「공고번호 글번호 원래공개시각」(예: 2026000517 67 2026-10-26 13:00). 고친 줄은 지운다.
// node posts/retrofit_analysis.mjs [--max 3]    analysis_auto.bat이 매일 07:00 분석 글 예약 뒤에 부른다. 하루 글 한도·보안 확인에 걸리면 남은 줄은 다음 날.
// 2026-10-29 사용자 지시(하나씩 확인하니 너무 오래 걸림): 고칠 때는 저장 뒤 대조를 건너뛰고(--no-verify), 다 고친 뒤 한꺼번에 전문 대조·목록 썸네일 확인.
// 대조에 실패한 글은 대기열 끝에 다시 넣는다.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, BLOG } from '../tistory/common.mjs';

const Q = join(ROOT, 'data', 'analysis_retrofit.txt');
const mi = process.argv.indexOf('--max');
const max = mi > 0 ? +process.argv[mi + 1] : 3;
const run = (args) => spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' }).status;

let lines = (await readFile(Q, 'utf8').catch(() => '')).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
if (!lines.length) { console.log('고칠 분석 글 없음'); process.exit(0); }
const done = [];
let stop = 0;
for (const line of lines.slice(0, max)) {
  const [no, id, d, t] = line.split(/\s+/);
  const draft = `drafts/analysis_${no}.json`;
  console.log(`\n— 고치기 ${no} (/${id}, ${d} ${t})`);
  if (run(['posts/retrofit_thumb.mjs', draft]) || run(['posts/analysis_post.mjs', '--render', draft])) { console.log(`그림·검수 실패 — ${no}에서 멈춤`); stop = 4; break; }
  const code = run(['tistory/draft.mjs', draft, '--approved', '--update-published', '--schedule', `${d} ${t}`, '--post', id, '--no-verify']);
  if (code === 5 || code === 6) { console.log(`${code === 5 ? '티스토리 하루 글 한도' : '티스토리 보안 확인'} — 남은 글은 다음 실행에 다시`); stop = code === 5 ? 0 : 6; break; }
  if (code) { console.log(`고치기 실패(코드 ${code}) — ${no}에서 멈춤`); stop = code; break; }
  done.push(line);
  lines = lines.filter((l) => l !== line);
  await writeFile(Q, lines.join('\n') + (lines.length ? '\n' : ''));
}

// 한꺼번에 확인: 글마다 전문 대조(--verify-scheduled, 저장 없음) + 카테고리 목록 썸네일(공개 화면, 로그인 없음)
if (done.length) {
  console.log(`\n=== 고친 ${done.length}편 한꺼번에 확인 ===`);
  const thumbs = new Map();
  for (let n = 1; n <= 8; n++) {
    const html = await (await fetch(`${BLOG}/category/${encodeURIComponent('분양분석')}?page=${n}`)).text().catch(() => '');
    const cards = [...html.matchAll(/<a[^>]*class="card"[^>]*href="\/(\d+)"[\s\S]*?<\/a>/g)];
    if (!cards.length) break;
    for (const m of cards) thumbs.set(m[1], /<img[^>]+src="[^"]+"/.test(m[0]));
  }
  const failed = [];
  for (const line of done) {
    const [no, id, d, t] = line.split(/\s+/);
    const code = run(['tistory/draft.mjs', `drafts/analysis_${no}.json`, '--verify-scheduled', '--schedule', `${d} ${t}`, '--post', id]);
    const thumb = thumbs.get(id);
    console.log(`${code === 0 && thumb !== false ? '✓' : '✗'} ${no} (/${id}) 전문 대조 ${code === 0 ? '통과' : `실패(코드 ${code})`} · 목록 썸네일 ${thumb === undefined ? '목록에서 못 찾음' : thumb ? '있음' : '빈칸'}`);
    if (code !== 0 || thumb === false) failed.push(line);
  }
  if (failed.length) {
    lines = [...lines, ...failed];
    await writeFile(Q, lines.join('\n') + '\n');
    console.log(`확인 실패 ${failed.length}편은 대기열 끝에 다시 넣음`);
  }
}
console.log(`\n남은 분석 글 ${lines.length}편`);
process.exit(stop);

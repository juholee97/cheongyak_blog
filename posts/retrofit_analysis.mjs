// 이미 공개된 분양분석 글을 하루 몇 편씩 새 그림·새 제목으로 고친다(2026-10-26 사용자 지시: 일정 카드 새로, 제목 앞 지역 꼬리표).
// 대기열 data/analysis_retrofit.txt — 한 줄에 「공고번호 글번호 원래공개시각」(예: 2026000517 67 2026-10-26 13:00). 고친 줄은 지운다.
// node posts/retrofit_analysis.mjs [--max 3]    analysis_auto.bat이 매일 07:00 분석 글 예약 뒤에 부른다. 하루 글 한도·보안 확인에 걸리면 남은 줄은 다음 날.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';

const Q = join(ROOT, 'data', 'analysis_retrofit.txt');
const mi = process.argv.indexOf('--max');
const max = mi > 0 ? +process.argv[mi + 1] : 3;
const run = (args) => spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' }).status;

let lines = (await readFile(Q, 'utf8').catch(() => '')).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
if (!lines.length) { console.log('고칠 분석 글 없음'); process.exit(0); }
for (const line of lines.slice(0, max)) {
  const [no, id, d, t] = line.split(/\s+/);
  const draft = `drafts/analysis_${no}.json`;
  console.log(`\n— 고치기 ${no} (/${id}, ${d} ${t})`);
  if (run(['posts/retrofit_thumb.mjs', draft]) || run(['posts/analysis_post.mjs', '--render', draft])) { console.log(`그림·검수 실패 — ${no}에서 멈춤`); process.exit(4); }
  const code = run(['tistory/draft.mjs', draft, '--approved', '--update-published', '--schedule', `${d} ${t}`, '--post', id]);
  if (code === 5 || code === 6) { console.log(`${code === 5 ? '티스토리 하루 글 한도' : '티스토리 보안 확인'} — ${lines.length}편 남김, 다음 실행에 다시`); process.exit(code === 5 ? 0 : 6); }
  if (code) { console.log(`고치기 실패(코드 ${code}) — ${no}에서 멈춤`); process.exit(code); }
  lines = lines.filter((l) => l !== line);
  await writeFile(Q, lines.join('\n') + (lines.length ? '\n' : ''));
}
console.log(`\n남은 분석 글 ${lines.length}편`);

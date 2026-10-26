// 월간 갱신 대기열(data/guide_refresh.txt, refresh_guides.mjs가 채움)을 하루 몇 편씩 티스토리에 반영한다.
// 한 줄 「slug 글번호 원래공개시각」 — 이미 공개된 글은 --update-published(공개 시각 그대로), 예약 글은 --update-scheduled. 고친 줄은 지운다.
// node posts/refresh_run.mjs [--max 2]    analysis_auto.bat이 07:00 분석 글 뒤에 부른다. 하루 글 한도·보안 확인에 걸리면 남은 줄은 다음 날.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';

const Q = join(ROOT, 'data', 'guide_refresh.txt');
const mi = process.argv.indexOf('--max');
const max = mi > 0 ? +process.argv[mi + 1] : 2;
const now = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

let lines = [...new Set((await readFile(Q, 'utf8').catch(() => '')).split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
if (!lines.length) { console.log('갱신할 가이드 없음'); process.exit(0); }
for (const line of lines.slice(0, max)) {
  const [slug, id, d, t] = line.split(/\s+/), when = `${d} ${t}`;
  console.log(`\n— 갱신 ${slug} (/${id}, ${when})`);
  const mode = when > now ? '--update-scheduled' : '--update-published';
  const code = spawnSync(process.execPath, ['tistory/draft.mjs', `drafts/guide_${slug}.json`, '--approved', mode, '--schedule', when, '--post', id], { cwd: ROOT, stdio: 'inherit' }).status;
  if (code === 5 || code === 6) { console.log(`${code === 5 ? '티스토리 하루 글 한도' : '티스토리 보안 확인'} — ${lines.length}편 남김, 다음 실행에 다시`); process.exit(code === 5 ? 0 : 6); }
  if (code) { console.log(`갱신 실패(코드 ${code}) — ${slug}에서 멈춤`); process.exit(code); }
  lines = lines.filter((l) => l !== line);
  await writeFile(Q, lines.join('\n') + (lines.length ? '\n' : ''));
}
console.log(`\n남은 갱신 ${lines.length}편`);

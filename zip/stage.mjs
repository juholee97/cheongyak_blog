// 공개된 글의 제목 앞 표시(2026-11-09 사용자 지시): 접수가 모두 끝나면 [신청마감], 일정이 모두 끝나면 [종료]. 접수 마감까지 남은 날(D-3)은 제목이 아니라 목록 상태 줄에 쓴다(pages.mjs recLabel).
// 일정은 자료에 있는 것만 본다 — 무순위는 계약일이 자료에 없어 당첨자 발표가 지나면 [종료]다. 주소(slug)는 바꾸지 않는다.
// [종료]가 되면 더 추적하지 않는다: 매일 글 다시 올리기(publish.mjs)와 게시 뒤 검수(deep.mjs --verify all)에서 빠진다. 글은 계속 공개된다.
// 장부 data/zip_stage.json { slug: { stage, phases } } — 일정 자료에서 공고가 사라져도 마지막 일정으로 판정한다. [종료]는 되돌리지 않는다.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { wp } from './wp.mjs';
import { receiptOf } from './post.mjs';

const FILE = join(ROOT, 'data/zip_stage.json'), LABEL = { closed: '신청마감', ended: '종료' };
export const loadStages = async () => JSON.parse(await readFile(FILE, 'utf8').catch(() => '{}'));
// → '' (접수일 없음·접수 마감 전) | 'closed' | 'ended'
export function stageOf(phases, today) {
  const rc = receiptOf(phases);
  if (!rc || rc.end >= today) return '';
  return phases.flatMap((p) => [p.date, p.end]).filter(Boolean).every((d) => d < today) ? 'ended' : 'closed';
}
export const stamped = (title, stage) => (stage ? `[${LABEL[stage] || stage}] ` : '') + title.replace(/^\[(?:종료|신청마감|D-(?:\d+|Day))\]\s*/, '');
export const isEnded = (stages, slug) => stages[slug]?.stage === 'ended';

// entries: [{ slug, title(표시 없는 제목), phases }]. 단계가 바뀐 글만 제목을 고친다. 아직 공개 안 된 글은 건너뛴다
export async function stampLive(entries, stages, today) {
  for (const { slug, title, phases } of entries) {
    if (isEnded(stages, slug)) continue;
    const ph = phases.length ? phases : stages[slug]?.phases || [], stage = stageOf(ph, today);
    if (stage === (stages[slug]?.stage || '')) continue;
    try {
      const [p] = await wp(`posts?slug=${encodeURIComponent(slug)}&status=publish&context=edit`);
      if (!p) continue;
      const want = stamped(title, stage);
      if (p.title.raw !== want) await wp(`posts/${p.id}`, { method: 'POST', body: { title: want } });
      stages[slug] = { stage, phases: ph };
      console.log(`제목 표시 ${slug}: ${want}`);
    } catch (e) { console.log(`제목 표시 못 함 ${slug}: ${e.message}`); }
  }
  await writeFile(FILE, JSON.stringify(stages, null, 1));
}

// 정정공고를 검토해 [종료] 글을 다시 고칠 때(글 일정은 자동으로 안 바뀐다 — zip/new_notices.mjs가 알린다):
// node zip/stage.mjs --reopen apt-공고번호,deep-공고번호 → 추적을 되살린다. 그 뒤 zip/deals.mjs --only·post.mjs·publish.mjs --go로 일정을 고치면 제목도 다시 판정한다
if (process.argv[1]?.endsWith('stage.mjs') && process.argv.includes('--reopen')) {
  const stages = await loadStages();
  for (const slug of process.argv[process.argv.indexOf('--reopen') + 1].split(',')) if (stages[slug]) stages[slug].stage = 'reopened';
  await writeFile(FILE, JSON.stringify(stages, null, 1));
  console.log('다시 추적', process.argv[process.argv.indexOf('--reopen') + 1]);
}

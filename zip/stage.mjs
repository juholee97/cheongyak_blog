// 공개된 글의 제목 앞 표시(2026-11-09 사용자 지시): 일정이 모두 끝나면 [종료]. 접수 마감까지 남은 날(D-3)과 접수 마감은 제목이 아니라 목록 상태 줄에 쓴다(pages.mjs recLabel·statusOf).
// 2026-11-13 사용자: [신청마감]은 제목에서 뺀다 — 목록 상태 줄 「접수 마감」과 겹치고 제목 앞 7자가 단지명을 뒤로 민다. 단계 closed는 판정·장부에 그대로 있고 제목에만 안 붙는다. 이미 붙은 글은 stampLive가 제목만 고쳐 뗀다.
// 일정은 자료에 있는 것만 본다 — 무순위는 계약일이 자료에 없어 당첨자 발표가 지나면 [종료]다. 주소(slug)는 바꾸지 않는다.
// [종료]가 되면 더 추적하지 않는다: 매일 글 다시 올리기(publish.mjs)와 게시 뒤 검수(deep.mjs --verify all)에서 빠진다. 글은 계속 공개된다.
// 장부 data/zip_stage.json { slug: { stage, phases } } — 일정 자료에서 공고가 사라져도 마지막 일정으로 판정한다. [종료]는 되돌리지 않는다.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { wp, takeBudget } from './wp.mjs';
import { receiptOf } from './post.mjs';

const FILE = join(ROOT, 'data/zip_stage.json');
export const loadStages = async () => JSON.parse(await readFile(FILE, 'utf8').catch(() => '{}'));
// → '' (접수일 없음·접수 마감 전) | 'closed' | 'ended'
export function stageOf(phases, today) {
  const rc = receiptOf(phases);
  if (!rc || rc.end >= today) return '';
  return phases.flatMap((p) => [p.date, p.end]).filter(Boolean).every((d) => d < today) ? 'ended' : 'closed';
}
export const stamped = (title, stage) => (stage === 'ended' ? '[종료] ' : '') + title.replace(/^\[(?:종료|신청마감|D-(?:\d+|Day))\]\s*/, '');
export const isEnded = (stages, slug) => stages[slug]?.stage === 'ended';

// 옛 [신청마감] 떼기는 11.14 오전 색인 확인이 끝난 뒤(11.15)부터, 한꺼번에 46편을 고치지 않게 하루 수정 한도(wp.mjs UPDATE_CAP) 안에서 심층 분석 글부터
const UNSTAMP_FROM = '2026-11-15';
export const deepFirst = (a, b) => b.slug.startsWith('deep-') - a.slug.startsWith('deep-');

// entries: [{ slug, title(표시 없는 제목), phases }]. 단계가 바뀐 글은 제목을 바로 고친다. 아직 공개 안 된 글은 건너뛴다
export async function stampLive(entries, stages, today) {
  let left = 0;
  for (const { slug, title, phases } of [...entries].sort(deepFirst)) {
    if (isEnded(stages, slug)) continue;
    const ph = phases.length ? phases : stages[slug]?.phases || [], stage = stageOf(ph, today), changed = stage !== (stages[slug]?.stage || '');
    // ponytail: closed 글은 옛 [신청마감] 제목을 떼려고 매번 읽는다(읽기만, 다를 때만 고침). 장부의 closed 글이 모두 [신청마감] 없는 제목이 되면 이 예외를 지워도 된다
    if (!changed && (stage !== 'closed' || today < UNSTAMP_FROM)) continue;
    try {
      const [p] = await wp(`posts?slug=${encodeURIComponent(slug)}&status=publish&context=edit`);
      if (!p) continue;
      const want = stamped(title, stage);
      if (p.title.raw !== want) {
        if (!changed && !(await takeBudget())) { left++; continue; } // 장부는 그대로라 다음 날 다시 걸린다
        await wp(`posts/${p.id}`, { method: 'POST', body: { title: want } });
        console.log(`제목 표시 ${slug}: ${want}`);
      }
      stages[slug] = { stage, phases: ph };
    } catch (e) { console.log(`제목 표시 못 함 ${slug}: ${e.message}`); }
  }
  if (left) console.log(`옛 [신청마감] 떼기 ${left}편 미룸: 오늘 공개 글 수정 한도를 다 씀 — 내일 다시`);
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

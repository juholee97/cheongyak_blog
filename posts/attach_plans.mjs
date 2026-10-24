// 이미 만든 분석 글 초안에 평면도·조감도(posts/floorplan.mjs)를 붙여 본문을 다시 그린다. 내용·설명은 그대로.
// node posts/attach_plans.mjs <공고번호> ...   → 그 뒤 tistory/draft.mjs --update-scheduled|--update-published 로 고친다
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { plansFor } from './floorplan.mjs';
import { draftOf, checkAnalysis } from './analysis_post.mjs';

for (const no of process.argv.slice(2)) {
  const p = join(ROOT, 'drafts', `analysis_${no}.json`);
  const d = JSON.parse(await readFile(p, 'utf8'));
  const imgs = await plansFor(d.facts, join(ROOT, 'drafts', `analysis_${no}.img`));
  if (!imgs.length) { console.log(`${no}: 평면도 없음`); continue; }
  const keep = d.images.filter((i) => !i.key.startsWith('plan:') && i.key !== 'aerial');
  const next = draftOf(d.facts, d.notes, [...keep, ...imgs]);
  const issues = checkAnalysis(next);
  if (issues.length) { console.log(`${no}: 검수 실패`, issues); continue; }
  await writeFile(p, JSON.stringify(next, null, 2));
  console.log(`${no}: ${imgs.map((i) => `${i.type || i.key}(${i.origin})`).join(', ')} — ${next.title}`);
}
process.exit(0);

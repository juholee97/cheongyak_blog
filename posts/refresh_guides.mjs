// 월간 갱신(2026-10-27 사용자 결정): 근거 문서(docs/policy/*.md)를 공식 출처로 다시 확인한 뒤, 그 문서를 쓰는 공개·예약 가이드의
// 확인일(checked)과 제목·본문의 「(2026년 10월 기준)」 같은 기준 시점을 새 달로 올리고 다시 그려 고치기 대기열(data/guide_refresh.txt)에 넣는다.
// 숫자가 바뀐 내용은 이 스크립트가 고치지 않는다 — 문서와 초안 본문을 먼저 고치고(사람 승인) 이걸 돌린다.
// node posts/refresh_guides.mjs --doc docs/policy/loans.md --checked 2026-11-02 [--dry-run]
import { readFile, writeFile, readdir, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../tistory/common.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const doc = arg('--doc'), checked = arg('--checked'), dry = process.argv.includes('--dry-run');
if (!doc || !/^\d{4}-\d\d-\d\d$/.test(checked || '')) { console.log('사용: node posts/refresh_guides.mjs --doc docs/policy/<문서>.md --checked YYYY-MM-DD'); process.exit(4); }

// 「2026년 10월」(기준 시점 표기)만 새 달로. 법령 시행일처럼 날짜까지 붙은 「2026년 10월 1일」은 사실이라 그대로
export function restamp(d, to) {
  const [cy, cm] = d.checked.split('-').map(Number), [ty, tm] = to.split('-').map(Number);
  const re = new RegExp(`${cy}년 ${cm}월(?!\\s*\\d+일)`, 'g');
  const fix = (v) => (typeof v === 'string' ? v.replace(re, `${ty}년 ${tm}월`) : Array.isArray(v) ? v.map(fix) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)])) : v);
  return { ...d, checked: to, title: fix(d.title), subtitle: fix(d.subtitle), thumbTitle: fix(d.thumbTitle), thumbStats: fix(d.thumbStats), answer: fix(d.answer), faq: fix(d.faq), intro: fix(d.intro), sections: fix(d.sections) };
}

const json = (p) => readFile(join(ROOT, p), 'utf8').then(JSON.parse, () => ({}));
const sched = await json('posts/scheduled.json'), pub = await json('posts/published.json');
const now = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
let n = 0;
for (const f of (await readdir(join(ROOT, 'drafts'))).filter((f) => /^guide_[\w-]+\.json$/.test(f))) {
  const p = `drafts/${f}`, d = JSON.parse(await readFile(join(ROOT, p), 'utf8'));
  if (d.factsDoc !== doc || d.checked >= checked) continue;
  // 공개 시각: 예약 기록, 없으면(사람이 직접 발행한 /5~/8) 마지막 공개 글 고치기 기록
  const saved = await json(p.replace(/\.json$/, '.save.json'));
  const rec = sched[d.title] || Object.values(sched).find((v) => v.url === pub[d.title]) || (pub[d.title] && saved.mode === 'update-published' && saved.when ? { url: pub[d.title], when: saved.when } : null);
  if (!rec?.url) continue; // 아직 올리지 않은 글은 대기열에서 예약할 때 새 확인일로 그려진다
  const id = rec.url.split('/').pop(), when = rec.when;
  const next = restamp(d, checked);
  // 기준 달 표기가 없는 글(11월 이후 공개로 예약돼 「(2026년)」으로 그려진 글)은 고칠 게 없다 — 하루 글 한도(5개)를 아낀다
  if (JSON.stringify({ ...next, checked: d.checked }) === JSON.stringify(d)) continue;
  console.log(`${f}: /${id} ${when}\n  ${d.title}\n→ ${next.title}`);
  if (dry) continue;
  await writeFile(join(ROOT, p), JSON.stringify(next, null, 2));
  // 공개된 글은 지금 달 기준으로, 예약 글은 공개 시각 기준으로 다시 그린다(undate: 공개 달 ≠ 확인 달이면 달 표기를 뺀다)
  const r = spawnSync(process.execPath, ['posts/guide.mjs', p, '--at', when > now ? when : now], { cwd: ROOT, stdio: 'inherit' });
  if (r.status) { console.log(`  ✗ 검수 실패 — 대기열에 넣지 않음`); continue; }
  await appendFile(join(ROOT, 'data', 'guide_refresh.txt'), `${f.replace(/^guide_|\.json$/g, '')} ${id} ${when}\n`);
  n++;
}
console.log(`\n${dry ? '시험 — ' : ''}${n}편 고치기 대기열에 넣음(data/guide_refresh.txt)`);

// 주간 초안 검수: node posts/check.mjs drafts/2026-10-26_weekly.json
// 1) 본문이 수집본에서 그대로 다시 그려지는지(손으로 고친 사실 없음) 2) 요약 문장의 숫자가 집계·데이터에 있는지
// 3) 투자 권유·과장 표현 없음 4) 출처·기준일시·면책 문구 있음
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { draftOf, build, DISCLAIMER, updatedLabel } from './weekly.mjs';

export const BANNED = ['추천', '강추', '로또', '무조건', '대박', '반드시 넣', '꼭 넣', '오른다', '오를', '시세차익', '수익', '투자 가치', '투자가치', '놓치면 후회', '안전한 투자', '확실'];

export function checkDraft(draft, data) {
  const issues = [];
  const again = draftOf(data, draft.week.start, draft.summary);
  if (again.html !== draft.html) issues.push('본문이 수집본에서 다시 그린 결과와 다릅니다(본문을 직접 고치지 말고 summary만 고친 뒤 --render).');
  if (again.title !== draft.title) issues.push('제목이 집계와 다릅니다.');

  // 요약 숫자: 집계값, 접수 단지 세대수·분양가, 주간 날짜의 월·일, 연도만 허용
  const w = build(data, draft.week.start);
  const ok = new Set([String(w.facts.receipt), String(w.facts.win), String(w.facts.con), ...Object.values(w.facts.kinds).map(String), ...Object.values(w.facts.regions).map(String), w.start.slice(0, 4)]);
  for (let s = w.start; s <= w.end; s = new Date(Date.parse(s) + 864e5).toISOString().slice(0, 10)) { ok.add(String(+s.slice(5, 7))); ok.add(String(+s.slice(8, 10))); }
  w.receipt.forEach(({ it }) => { if (it.units) ok.add(String(it.units)); if (it.pricePerPyeong) ok.add(String(it.pricePerPyeong)); });
  const names = data.items.map((it) => it.name);
  for (const line of draft.summary || []) {
    let rest = line;
    names.forEach((n) => { rest = rest.split(n).join(' '); }); // 단지명 속 숫자는 제외
    for (const m of rest.match(/\d[\d,]*/g) || []) if (!ok.has(m.replace(/,/g, ''))) issues.push(`요약의 숫자 "${m}"가 집계·데이터에 없습니다: ${line}`);
  }

  let text = [draft.title, ...(draft.summary || []), draft.html.replace(/<[^>]+>/g, ' ')].join('\n');
  names.forEach((n) => { text = text.split(n).join(' '); });
  BANNED.forEach((b) => { if (text.includes(b)) issues.push(`금지 표현 "${b}"`); });

  if (!draft.html.includes(DISCLAIMER)) issues.push('면책 문구 없음');
  if (!draft.html.includes('청약홈(한국부동산원)')) issues.push('출처 표기 없음');
  if (!draft.html.includes(updatedLabel(data.updatedAt))) issues.push('기준일시 없음');
  if (draft.tags.length > 10) issues.push('태그 10개 초과');
  if (!(draft.summary || []).filter(Boolean).length) issues.push('요약 문장이 비어 있습니다(2~3줄).');
  return issues;
}

async function main() {
  const p = process.argv[2];
  if (!p) throw new Error('사용: node posts/check.mjs drafts/<월요일>_weekly.json');
  const draft = JSON.parse(await readFile(p, 'utf8'));
  const data = JSON.parse(await readFile(p.replace(/\.json$/, '.data.json'), 'utf8'));
  const issues = checkDraft(draft, data);
  if (issues.length) { issues.forEach((i) => console.log('✗ ' + i)); console.log(`검수 실패 ${issues.length}건`); process.exit(1); }
  console.log(`검수 통과 — ${draft.title}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

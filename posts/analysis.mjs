// 분양분석 글 후보 고르기(docs/analysis-post-design.md 1장). 점수는 관심도 추정일 뿐이고, 쓸 단지는 사용자가 정한다.
// node posts/analysis.mjs --candidates drafts/2026-11-02_weekly.json
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from './weekly.mjs';

// 핵심지(사용자가 고치는 목록): 시·도 전체 또는 "시·도 시군구"
export const CORE = ['서울', '경기 과천시', '경기 성남시', '경기 하남시', '경기 광명시', '경기 용인시 수지구'];
const METRO = ['서울', '경기', '인천'];

export function score(it) {
  const why = [];
  let s = 0;
  const where = [it.region, it.district].filter(Boolean).join(' ');
  if (CORE.some((c) => where === c || where.startsWith(c + ' ') || it.region === c)) { s += 3; why.push('핵심지'); }
  if (it.units >= 1000) { s += 2; why.push(`대단지 ${it.units.toLocaleString()}세대`); } else if (it.units >= 500) { s += 1; why.push(`${it.units.toLocaleString()}세대`); }
  if (/토지임대부|신혼희망타운|공공분양|본청약/.test(it.name)) { s += 2; why.push('공공·저가 공급 유형'); }
  if (['무순위', '임의공급'].includes(it.kind) && METRO.includes(it.region)) { s += 2; why.push(`${it.kind}(통장 없이) 수도권`); }
  if (it.kind === 'APT' && it.pricePerPyeong) why.push(`분양가(3.3㎡) ${it.pricePerPyeong.toLocaleString()}만원 — 주변 실거래 비교 필요`);
  return { s, why };
}

export function candidates(data, start, n = 3) {
  return build(data, start).receipt.map(({ it }) => ({ it, ...score(it) })).filter((c) => c.s > 0).sort((a, b) => b.s - a.s || b.it.units - a.it.units).slice(0, n);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--candidates');
  if (i < 0) { console.log('사용: node posts/analysis.mjs --candidates drafts/<월요일>_weekly.json'); process.exit(1); }
  const p = process.argv[i + 1];
  const d = JSON.parse(await readFile(p, 'utf8'));
  const data = JSON.parse(await readFile(p.replace(/\.json$/, '.data.json'), 'utf8'));
  for (const c of candidates(data, d.week.start)) console.log(`${c.s}점 ${c.it.name} (${c.it.region} ${c.it.district || ''}, ${c.it.kind}) — ${c.why.join(' · ')}`);
}

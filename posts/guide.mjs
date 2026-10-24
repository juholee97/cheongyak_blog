// 청약가이드·대출·정책 글(제도 설명): 사람이/Claude가 쓴 drafts/guide_{slug}.json → 본문 HTML + 썸네일
// node posts/guide.mjs drafts/guide_loans-2026.json   본문을 다시 그리고 썸네일(1200×630)을 만들고 검수
// 규칙: 숫자는 근거 문서(factsDoc, 공식 출처를 확인일과 함께 정리한 docs/policy/*.md)에 있는 것만 — 검수(checkGuide)가 막는다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { esc, C, TH, TD, IMG, DISCLAIMER } from './weekly.mjs';
import { BANNED } from './check.mjs';
import { renderPngs, searchThumbHtml } from './card.mjs';
import { ROOT } from '../tistory/common.mjs';

const two = (top, sub) => `<span style="font-weight:700;white-space:nowrap">${top}</span>${sub ? `<br><span style="font-size:13px;font-weight:400;color:${C.muted};white-space:nowrap">${sub}</span>` : ''}`;
const cell = (c) => (Array.isArray(c) ? two(esc(c[0]), c[1] ? esc(c[1]) : '') : esc(c));
const table = (t) => `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:560px"><thead><tr>${t.head.map((h) => `<th ${TH}>${cell(h)}</th>`).join('')}</tr></thead><tbody>
${t.rows.map((r) => `<tr>${r.map((c, i) => `<td ${TD}>${i === 0 ? `<span style="font-weight:700">${cell(c)}</span>` : cell(c)}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>`;
const foot = (s) => `<p style="font-size:13px;color:${C.muted}">${esc(s)}</p>`;

// draft: { type:'guide', category, title, subtitle, tags, intro:[문장], sections:[{h, notes:[문장], table:{head,rows}, foot}], sources:[{name,url}], checked, factsDoc, images }
export function render(d) {
  const out = [];
  if ((d.images || []).some((i) => i.key === 'thumb')) out.push(IMG('thumb'));
  if (d.intro?.length) out.push(`<p>${d.intro.map(esc).join(' ')}</p>`);
  for (const s of d.sections) {
    out.push(`<h2 style="font-weight:700">${esc(s.h)}</h2>`);
    (s.notes || []).forEach((n) => out.push(`<p>${esc(n)}</p>`));
    if (s.table) out.push(table(s.table));
    if (s.foot) out.push(foot(s.foot));
  }
  if (d.related?.length) out.push(`<h2 style="font-weight:700">함께 보면 좋은 글</h2>\n<ul>${d.related.map((r) => `<li><a href="${esc(r.url)}">${esc(r.title)}</a></li>`).join('')}</ul>`);
  out.push(`<p style="font-size:13px;color:${C.muted}">출처(확인일 ${esc(d.checked)}): ${d.sources.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>`).join(' · ')} · 제도 요건 정리이며 대출·청약 권유가 아닙니다. 실제 대상·한도는 기관 심사로 정해집니다.</p>`);
  out.push(`<p style="font-size:13px;color:${C.muted}">※ ${DISCLAIMER}</p>`);
  return out.join('\n');
}

const textOf = (d) => [d.title, d.subtitle, d.thumbTitle, ...(d.thumbStats || []).flat(), ...(d.intro || []), ...d.sections.flatMap((s) => [s.h, ...(s.notes || []), s.foot || '', ...(s.table ? [...s.table.head.flat(), ...s.table.rows.flat(2)] : [])])].filter(Boolean).join('\n');

export async function checkGuide(d) {
  const issues = [];
  if (render(d) !== d.html) issues.push('본문이 다시 그린 결과와 다릅니다(node posts/guide.mjs 로 다시 그리기).');
  if (!d.sources?.length || !d.checked) issues.push('출처·확인일 없음');
  const text = textOf(d).split('기관추천').join('기관'); // 공식 명칭 '기관추천 특별공급'은 권유 표현이 아님
  BANNED.forEach((b) => { if (text.includes(b)) issues.push(`금지 표현 "${b}"`); });
  // 숫자 대조: 근거 문서에 같은 숫자가 있어야 한다(쉼표 무시, 연도·날짜 조각 포함)
  const doc = (await readFile(join(ROOT, d.factsDoc), 'utf8')).replace(/,/g, '');
  const nums = new Set(doc.match(/\d+(\.\d+)?/g));
  for (const m of new Set(text.replace(/,/g, '').match(/\d+(\.\d+)?/g) || [])) if (!nums.has(m)) issues.push(`숫자 "${m}"가 근거 문서(${d.factsDoc})에 없습니다`);
  return issues;
}

// 관련 글: posts/related.json(slug → 관련 slug) 중 이미 발행된 글만 링크. 발행 주소는 RSS에서 제목으로 찾아 posts/published.json에 쌓는다(RSS는 최근 글만 보여 줘서)
const PUB = join(ROOT, 'posts/published.json');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&mdash;/g, '—').replace(/&middot;/g, '·').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
let rss;
export async function published() {
  const before = await readFile(PUB, 'utf8').catch(() => '{}');
  const known = JSON.parse(before);
  try {
    const xml = await (rss ??= fetch('https://aulee.tistory.com/rss').then((r) => r.text())); // 한 번 실행에 RSS는 한 번만
    for (const m of xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>/g)) known[decode(m[1]).trim()] = m[2].trim();
    const after = JSON.stringify(known, null, 2) + '\n';
    if (after !== before) await writeFile(PUB, after); // 바뀔 때만 써서 여러 작업이 동시에 돌 때 덜 겹치게
  } catch (e) { rss = Promise.resolve(''); console.log(`RSS 읽기 실패(${e.message}) — 저장된 발행 목록만 씁니다`); }
  return known;
}

// at('YYYY-MM-DD HH:MM'): 이 글이 공개될 시각. 예약 글(posts/scheduled.json) 중 그보다 늦게 공개되는 글은 링크하지 않는다
export async function relatedOf(slug, at) {
  const pub = await published();
  const sched = JSON.parse(await readFile(join(ROOT, 'posts/scheduled.json'), 'utf8').catch(() => '{}'));
  const rel = JSON.parse(await readFile(join(ROOT, 'posts/related.json'), 'utf8'))[slug] || [];
  const out = [];
  for (const s of rel) {
    const t = JSON.parse(await readFile(join(ROOT, 'drafts', `guide_${s}.json`), 'utf8').catch(() => '{}')).title;
    if (t && pub[t] && !(at && sched[t] && sched[t].when >= at)) out.push({ title: t, url: pub[t] });
  }
  return out;
}

// 썸네일: 검색용 공용 썸네일(card.mjs searchThumbHtml) — 제목 두 줄(thumbTitle) + 핵심 숫자(thumbStats 첫 칸)
export function thumbHtml(d) {
  const [label, value] = (d.thumbStats || [])[0] || [];
  return searchThumbHtml({ category: d.category, lines: d.thumbTitle, label, value, foot: `우리의 청약달력 · ${(d.checked || '').slice(0, 4)}` });
}

// 기준 시점 표기 정리: 확인한 달(checked)이 아닌 달에 공개되는 글은 「(2026년 10월 기준)」「(2026년 10월)」을 「(2026년)」으로,
// 「2026년 10월 금리」처럼 기준 시점을 적은 말은 「고시 금리」로(2026-10-24 사용자 지시: 11월 글이 10월로 나가지 않게).
// 법령 시행일(「2026년 10월 1일 시행」)·예시 공고의 달은 사실이라 그대로 둔다. 정확한 확인일은 글 끝 「출처(확인일 …)」에 남는다.
export function undate(d, at) {
  const [cy, cm] = (d.checked || '').split('-').map(Number);
  const [ay, am] = (at || '').split(/[- ]/).map(Number);
  if (!cy || !ay || (cy === ay && cm === am)) return d;
  const stamp = new RegExp(`\\(${cy}년 ${cm}월( 기준)?\\)`, 'g');
  const fix = (v) => (typeof v === 'string' ? v.replace(stamp, `(${cy}년)`).replace(new RegExp(`${cy}년 ${cm}월 기준`, 'g'), `${cy}년 기준`).replace(new RegExp(`${cy}년 ${cm}월 금리`, 'g'), '고시 금리') : Array.isArray(v) ? v.map(fix) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)])) : v);
  return { ...d, title: fix(d.title), subtitle: fix(d.subtitle), thumbTitle: fix(d.thumbTitle), thumbStats: fix(d.thumbStats), intro: fix(d.intro), sections: fix(d.sections) };
}

async function main() {
  const p = process.argv[2];
  if (!p) { console.log('사용: node posts/guide.mjs drafts/guide_<slug>.json'); process.exit(1); }
  const ai = process.argv.indexOf('--at'); // 예약 시각(schedule_guides.mjs가 넘김)
  const at = ai > 0 ? process.argv[ai + 1] : null;
  const d = undate(JSON.parse(await readFile(p, 'utf8')), at);
  const dir = p.replace(/\.json$/, '.img');
  await mkdir(dir, { recursive: true });
  const [file] = await renderPngs([{ name: 'thumb', html: thumbHtml(d) }], dir);
  d.images = [{ key: 'thumb', file: file.replace(/\\/g, '/'), alt: `${d.title} 대표 이미지` }];
  d.type = 'guide';
  d.related = await relatedOf(basename(p, '.json').replace(/^guide_/, ''), at);
  d.html = render(d);
  await writeFile(p, JSON.stringify(d, null, 2));
  const issues = await checkGuide(d);
  console.log(issues.length ? issues.map((i) => '✗ ' + i).join('\n') : `검수 통과 — ${d.title} (관련 글 ${d.related.length})`);
  process.exitCode = issues.length ? 4 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });

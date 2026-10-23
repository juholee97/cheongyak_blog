// 청약가이드·대출·정책 글(제도 설명): 사람이/Claude가 쓴 drafts/guide_{slug}.json → 본문 HTML + 썸네일
// node posts/guide.mjs drafts/guide_loans-2026.json   본문을 다시 그리고 썸네일(1200×630)을 만들고 검수
// 규칙: 숫자는 근거 문서(factsDoc, 공식 출처를 확인일과 함께 정리한 docs/policy/*.md)에 있는 것만 — 검수(checkGuide)가 막는다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { esc, C, TH, TD, IMG, DISCLAIMER } from './weekly.mjs';
import { BANNED } from './check.mjs';
import { renderPngs } from './card.mjs';
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
export async function published() {
  const before = await readFile(PUB, 'utf8').catch(() => '{}');
  const known = JSON.parse(before);
  try {
    const xml = await (await fetch('https://aulee.tistory.com/rss')).text();
    for (const m of xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>/g)) known[decode(m[1]).trim()] = m[2].trim();
    const after = JSON.stringify(known, null, 2) + '\n';
    if (after !== before) await writeFile(PUB, after); // 바뀔 때만 써서 여러 작업이 동시에 돌 때 덜 겹치게
  } catch (e) { console.log(`RSS 읽기 실패(${e.message}) — 저장된 발행 목록만 씁니다`); }
  return known;
}

async function relatedOf(slug) {
  const pub = await published();
  const rel = JSON.parse(await readFile(join(ROOT, 'posts/related.json'), 'utf8'))[slug] || [];
  const out = [];
  for (const s of rel) {
    const t = JSON.parse(await readFile(join(ROOT, 'drafts', `guide_${s}.json`), 'utf8').catch(() => '{}')).title;
    if (t && pub[t]) out.push({ title: t, url: pub[t] });
  }
  return out;
}

// 썸네일: 카테고리 칩 + 큰 제목 + 부제 + 브랜드(디자인 시스템 색)
export function thumbHtml(d) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap">
<style>*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;font-family:'Noto Sans KR',sans-serif;color:#1c1f24;-webkit-font-smoothing:antialiased}</style></head><body>
<div style="width:1200px;height:630px;padding:56px 64px;display:flex;flex-direction:column;gap:22px;background:#fff;position:relative">
  <div style="display:flex;align-items:center;gap:12px;font-size:21px;font-weight:700"><span style="width:36px;height:36px;border-radius:9px;background:#0b4fc4;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900">우</span>우리의 청약달력
    <span style="margin-left:14px;padding:4px 16px;border-radius:999px;background:#eaf1fd;border:1px solid #b9cff5;color:#0a3a91;font-size:18px">${esc(d.category)}</span></div>
  <div style="margin-top:28px;font-size:${d.thumbTitle.length > 14 ? 76 : 88}px;font-weight:900;line-height:1.08;letter-spacing:-0.05em;white-space:pre-line">${esc(d.thumbTitle)}</div>
  <div style="font-size:30px;font-weight:700;color:#0b4fc4">${esc(d.subtitle)}</div>
  <div style="position:absolute;left:64px;right:64px;bottom:48px;display:flex;gap:16px">${(d.thumbStats || []).map((s, i) => `<div style="flex:1;border-top:6px solid ${['#0a7a5c', '#b3261e', '#4a4fa0'][i % 3]};padding-top:10px"><div style="font-size:18px;font-weight:700;color:#4b5260">${esc(s[0])}</div><div style="font-size:40px;font-weight:900;letter-spacing:-0.03em">${esc(s[1])}</div></div>`).join('')}</div>
  <div style="position:absolute;right:64px;top:62px;font-size:16px;color:#4b5260">확인일 ${esc(d.checked)} · aulee.tistory.com</div>
</div></body></html>`;
}

async function main() {
  const p = process.argv[2];
  if (!p) { console.log('사용: node posts/guide.mjs drafts/guide_<slug>.json'); process.exit(1); }
  const d = JSON.parse(await readFile(p, 'utf8'));
  const dir = p.replace(/\.json$/, '.img');
  await mkdir(dir, { recursive: true });
  const [file] = await renderPngs([{ name: 'thumb', html: thumbHtml(d) }], dir);
  d.images = [{ key: 'thumb', file: file.replace(/\\/g, '/'), alt: `${d.title} 대표 이미지` }];
  d.type = 'guide';
  d.related = await relatedOf(basename(p, '.json').replace(/^guide_/, ''));
  d.html = render(d);
  await writeFile(p, JSON.stringify(d, null, 2));
  const issues = await checkGuide(d);
  console.log(issues.length ? issues.map((i) => '✗ ' + i).join('\n') : `검수 통과 — ${d.title} (관련 글 ${d.related.length})`);
  process.exitCode = issues.length ? 4 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });

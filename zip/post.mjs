// auleezip.com 단지 글: zip/deals.mjs 결과(data/deals.json) 한 줄 → 워드프레스 글 { slug, title, html, excerpt, tags, categories }
// node zip/post.mjs              비교된 공고마다 data/zip_posts/{공고번호}.json + 미리보기 data/zip_posts/preview.html
// 모든 공고는 「분양 시세비교」, 기준(2억원·20%)을 넘은 곳은 「꿀분양」 카테고리도 함께 + 글머리 강조 상자.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { esc, md, label, C, TH, TD, DISCLAIMER } from '../posts/weekly.mjs';
import { areaOf, shortName } from '../posts/analysis_post.mjs';
import { BANNED } from '../posts/check.mjs';
import { GAP, RATE, NEW } from './deals.mjs';

export const CAT_ALL = '분양 시세비교', CAT_DEAL = '꿀분양';
const GOLD = '#a15c00';
const eok = (n) => { const a = Math.abs(n), s = a >= 10000 ? `${Math.floor(a / 10000)}억${a % 10000 ? ' ' + (a % 10000).toLocaleString() + '만' : ''}원` : `${a.toLocaleString()}만원`; return s; };
const pct = (r) => `${Math.round(Math.abs(r) * 100)}%`;
const km = (m) => (m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`);
const table = (head, rows) => `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:480px"><thead><tr>${head.map((h) => `<th ${TH}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td ${TD}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

export function postOf(r) {
  r = { ...r, med: Math.round(r.med), own: Math.round(r.own) };
  const basis = r.old ? `준공 연도와 관계없이(${NEW}년 이내 단지가 2곳 미만)` : `준공 ${NEW}년 이내`, peer = r.old ? '주변' : '주변 신축';
  const name = shortName(r.name), area = areaOf(r), cheap = r.gap > 0, m = r.main;
  const diff = `${eok(r.gap)}(${pct(r.rate)}) ${cheap ? '낮아요' : '높아요'}`;
  const title = r.hit
    ? `[${area}] ${name} 분양가, 주변 신축보다 전용 ${m.area}㎡ 한 채 약 ${eok(r.gap)} 낮아요 — 실거래 비교`
    : `[${area}] ${name} 분양가 vs ${peer} 실거래 — 전용 ${m.area}㎡ 3.3㎡당 ${Math.abs(r.med - r.own).toLocaleString()}만원 ${cheap ? '낮음' : '높음'}`;
  const lead = `${name} 전용 ${m.area}㎡ 최고 분양가는 ${eok(m.max)}(3.3㎡당 ${r.own.toLocaleString()}만원)이에요. 반경 1.5km 안 ${basis} 단지 ${r.n}곳의 최근 12개월 실거래 중앙값(3.3㎡당 ${r.med.toLocaleString()}만원)으로 같은 면적을 환산하면 분양가가 ${diff}.${r.leasehold ? ' 다만 토지임대부라 땅값이 빠진(토지는 따로 임대료를 내는) 분양가여서 일반 아파트 거래가와 그대로 비교할 수는 없어요.' : ''}`;
  const box = r.hit
    ? `<div style="border:2px solid ${GOLD};border-radius:12px;padding:14px 18px;margin:16px 0;background:#fff8ec"><p style="margin:0 0 4px;font-size:13px;font-weight:800;color:${GOLD}">꿀분양 — 주변 신축보다 ${eok(GAP)} 또는 ${pct(RATE)} 이상 낮은 분양가</p><p style="margin:0;font-weight:700">${esc(lead)}</p></div>`
    : `<div style="border:1px solid ${C.line};border-left:4px solid ${C.brand};border-radius:12px;padding:14px 18px;margin:16px 0;background:#f5f8fe"><p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${C.brand}">한 줄 비교</p><p style="margin:0;font-weight:700">${esc(lead)}</p></div>`;
  const when = (r.phases || []).filter((p) => p.date).map((p) => [esc(label(r, p.k) || p.k), md(p.date)]);
  const html = [
    box,
    `<h2>분양가와 ${peer} 실거래</h2>`,
    table(['구분', '전용 3.3㎡당', `전용 ${m.area}㎡ 환산`], [
      [`<b>${esc(name)}</b> 최고 분양가`, `${r.own.toLocaleString()}만원`, eok(m.max)],
      [`${peer} ${r.n}곳 중앙값`, `${r.med.toLocaleString()}만원`, eok(Math.round((r.med * m.area) / 3.3058))],
      ['차이', `${Math.abs(r.med - r.own).toLocaleString()}만원 ${cheap ? '낮음' : '높음'}`, `${eok(r.gap)} ${cheap ? '낮음' : '높음'}`],
    ]),
    '<h3>비교한 단지</h3>',
    table(['단지', '준공', '거리', '전용 3.3㎡당 중앙값'], r.refs.map((g) => [esc(g.apt), `${g.built}년`, g.d != null ? km(g.d) : '-', `${g.perPy.toLocaleString()}만원`])),
    `<p style="font-size:13px;color:${C.muted}">기준: 국토교통부 아파트 매매 실거래가(${esc(r.months)}) · 반경 1.5km · ${basis} · 단지별 전용 3.3㎡당 중앙값의 중앙값. 분양가는 주력 주택형(세대수 최다)의 최고 분양가로, 발코니 확장·옵션 비용은 빠져 있어요.</p>`,
    ...(when.length ? ['<h2>청약 일정</h2>', table(['단계', '날짜'], when)] : []),
    '<h2>확인할 조건</h2>',
    `<p>분양가가 낮은 단지일수록 전매제한·실거주 의무·재당첨 제한이 붙는 경우가 많아요. 적용 여부와 기간은 <a href="${esc(r.applyhomeUrl)}">청약홈 입주자모집공고</a>에서 확인하세요.</p>`,
    `<p style="font-size:13px;color:${C.muted}">이 글은 공고와 공개 실거래 자료를 비교한 것이며 청약·투자 권유가 아닙니다. ${esc(DISCLAIMER)}</p>`,
  ].join('\n');
  const excerpt = lead;
  const tags = [area, r.district, r.kind === '무순위' ? '무순위 청약' : '아파트 분양', ...(r.hit ? ['꿀분양'] : [])].filter(Boolean);
  return { slug: `apt-${r.no}`, title, html, excerpt, tags, categories: r.hit ? [CAT_ALL, CAT_DEAL] : [CAT_ALL] };
}

export function checkPost(p) {
  const text = [p.title, p.html, p.excerpt].join('\n');
  return BANNED.filter((b) => text.includes(b)).map((b) => `금지 표현 "${b}"`);
}

if (process.argv[1]?.endsWith('post.mjs')) {
  const { items } = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8'));
  const dir = join(ROOT, 'data/zip_posts');
  await mkdir(dir, { recursive: true });
  const posts = [];
  for (const r of items.filter((x) => !x.skip)) {
    const p = postOf(r), issues = checkPost(p);
    if (issues.length) { console.log(`✗ ${r.name}: ${issues.join(', ')}`); continue; }
    await writeFile(join(dir, `${r.no}.json`), JSON.stringify(p, null, 2));
    posts.push(p);
    console.log(`${r.hit ? '★' : ' '} ${p.title}`);
  }
  await writeFile(join(dir, 'preview.html'), `<!doctype html><meta charset="utf-8"><body style="max-width:760px;margin:24px auto;padding:0 16px;font:16px/1.7 sans-serif;color:${C.ink}">${posts.map((p) => `<article style="border-bottom:3px solid #ccc;padding-bottom:32px;margin-bottom:32px"><p style="color:${C.muted};font-size:13px">${p.categories.join(' · ')}</p><h1 style="font-size:24px">${esc(p.title)}</h1>${p.html}</article>`).join('')}</body>`);
  console.log(`\n글 ${posts.length}편 → data/zip_posts/ (미리보기 preview.html)`);
}

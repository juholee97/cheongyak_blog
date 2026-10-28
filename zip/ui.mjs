// auleezip 화면 조각 — 2026-10-29 사용자 결정 디자인: A 실거래 리포트(주요 내용·이 글의 자료·점 그래프·출처 줄) + B 비교 결과 눈금 + C 고친 기록.
// 모양은 zip/site.css(전역 스타일의 추가 CSS)가 맡고, 여기서는 class와 숫자 위치만 단다. 글 HTML은 zip/post.mjs·zip/sh_write.mjs·zip/pages.mjs가 이것으로 만든다.
import { esc } from '../posts/weekly.mjs';

const strip = (s) => String(s).replace(/<[^>]+>/g, '');
export const num = (n) => Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 1 });

// 표: head는 '이름' 또는 { t, n }(n: 숫자 칸 — 오른쪽 정렬). rows는 칸 배열 또는 { cells, me }(me: 이 공고 줄을 짚어 줌).
// 휴대폰(640px 이하)에선 줄마다 카드로 접히고 data-label이 칸 이름이 된다(stack:false면 접지 않고 옆으로 밀어 본다)
export function table(head, rows, { stack = true, foot } = {}) {
  const H = head.map((h) => (typeof h === 'string' ? { t: h } : h));
  const cell = (c, i) => `<td${H[i]?.n ? ' class="n"' : ''} data-label="${esc(strip(H[i]?.t ?? ''))}">${c}</td>`;
  const tr = (r) => { const cells = Array.isArray(r) ? r : r.cells; return `<tr${r.me ? ' class="me"' : ''}>${cells.map(cell).join('')}</tr>`; };
  return `<div class="az-tw"><table class="az-t${stack ? ' az-stack' : ''}"><thead><tr>${H.map((h) => `<th${h.n ? ' class="n"' : ''}>${h.t}</th>`).join('')}</tr></thead><tbody>${rows.map(tr).join('')}</tbody>${foot ? `<tfoot>${tr(foot)}</tfoot>` : ''}</table></div>`;
}

// B 비교 결과 눈금: 분양가가 비교 시세보다 d% 높으면 +, 낮으면 −. 구간은 「비교 기준」 페이지에 적은 그대로(글에 쓰는 반올림 %로 판정)
export const BANDS = ['많이 낮음', '낮음', '비슷', '높음', '많이 높음'];
export function bandOf(d) {
  const a = Math.round(Math.abs(d));
  return a < 5 ? 2 : a < 20 ? (d > 0 ? 3 : 1) : d > 0 ? 4 : 0;
}
export function verdict(d, { title, rows = [], note = '' }) {
  const a = Math.round(Math.abs(d)), band = bandOf(d), tone = band === 2 ? 'eq' : d > 0 ? 'up' : 'dn';
  const pos = ((Math.max(-40, Math.min(40, d)) + 40) / 80) * 100; // −40% ~ +40%를 눈금 끝에서 끝으로(넘으면 끝에 붙인다)
  const W = [25, 18.75, 12.5, 18.75, 25];
  const sign = a === 0 ? '' : d > 0 ? '+' : '−';
  const edge = pos < 6 ? ' class="s"' : pos > 94 ? ' class="e"' : '';
  return `<section class="az-verdict ${tone}" aria-label="비교 결과"><p class="az-vl">비교 결과</p><p class="az-vt">${title}</p>`
    + `<div class="az-scale" role="img" aria-label="${esc(`다섯 구간 중 「${BANDS[band]}」, 분양가가 비교 시세보다 ${a}% ${d > 0 ? '높음' : d < 0 ? '낮음' : '같음'}`)}">`
    + `<div class="az-mark"><span${edge} style="left:${pos.toFixed(2)}%">${sign}${a}%</span></div>`
    + `<div class="az-segs">${W.map((w, i) => `<span class="${i === band ? `on ${tone}` : ''}" style="flex-basis:${w}%"></span>`).join('')}</div>`
    + `<div class="az-labs">${W.map((w, i) => `<span${i === band ? ' class="on"' : ''} style="flex-basis:${w}%">${BANDS[i]}</span>`).join('')}</div></div>`
    + (rows.length ? `<dl class="az-vs">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : '')
    + (note ? `<p class="az-vnote">${note}</p>` : '') + '</section>';
}

// A 주요 내용(글머리 세 줄)
export const keyBox = (items, title = '주요 내용') => `<section class="az-key"><h2>${title}</h2><ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul></section>`;

// A 이 글의 자료(데스크톱은 오른쪽에 붙고, 좁은 화면에선 주요 내용 바로 아래 두 칸으로 접힌다)
export const rail = (rows, more = '') => `<aside class="az-rail" aria-label="이 글의 자료"><p class="az-rail-h">이 글의 자료</p><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${more ? `<p class="az-more">${more}</p>` : ''}</aside>`;

// 눈금 간격: 1·2·2.5·5 × 10ⁿ 중 raw 이상인 가장 작은 값
export function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

// A 점 그래프: rows [{ label, sub?, v, me? }], med(점선), 같은 단위. 값이 위치 그대로 찍히게 눈금 범위를 정하고 끝 눈금까지 그린다
export function dotPlot(rows, { med, medLabel = '중앙값', caption = '' } = {}) {
  const vals = [...rows.map((r) => r.v), ...(med != null ? [med] : [])];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || hi * 0.05;
  const step = niceStep((hi - lo + 2 * pad) / 4);
  lo = Math.floor((lo - pad) / step) * step; hi = Math.ceil((hi + pad) / step) * step;
  const x = (v) => (((v - lo) / (hi - lo)) * 100).toFixed(2);
  const ticks = []; for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(t);
  const row = (r) => `<div class="az-pr${r.me ? ' me' : ''}"><span class="az-plab">${r.label}${r.sub ? `<small>${r.sub}</small>` : ''}</span><span class="az-ptr"><i style="left:${x(r.v)}%"></i><em${x(r.v) > 78 ? ' class="l"' : ''} style="left:${x(r.v)}%">${num(r.v)}</em></span></div>`;
  return `<figure class="az-plot"><div class="az-pl">${ticks.map((t) => `<span class="az-gl" style="--x:${x(t)}"></span>`).join('')}${rows.map(row).join('')}`
    + (med != null ? `<span class="az-pmed" style="--x:${x(med)}"><span>${medLabel} ${num(med)}</span></span>` : '')
    + `<div class="az-pax">${ticks.map((t, i) => `<span${i === 0 ? ' class="s"' : i === ticks.length - 1 ? ' class="e"' : ''} style="left:${x(t)}%">${num(t)}</span>`).join('')}</div></div>`
    + (caption ? `<figcaption class="az-src">${caption}</figcaption>` : '') + '</figure>';
}

// 「3.3㎡당」「84㎡」이 줄 끝에서 숫자와 단위로 갈라지지 않게(태그 밖 글자만 감싼다)
export const keepUnits = (html) => html.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : part.replace(/\d+(?:\.\d+)?㎡당?/g, (m) => `<span class="az-nw">${m}</span>`))).join('');
export const src = (t) => `<p class="az-src">${t}</p>`;
export const note = (t) => `<p class="az-note">${t}</p>`;
export const chip = (status) => ({ 확인: '<span class="az-chip ok">확인</span>', 다름: '<span class="az-chip no">공식 자료와 다름</span>', '공식 자료 없음': '<span class="az-chip na">공식 자료 없음</span>' })[status] || `<span class="az-chip na">${esc(status)}</span>`;
export const banner = (openUrl) => `<div class="az-banner"><p class="az-banner-t">접수 마감</p><p>이 글은 접수가 끝난 공고의 시세 비교입니다. 지금 접수 중이거나 앞으로 열리는 공고는 <a href="${openUrl}">현재 열린 공고</a>에서 확인하시기 바랍니다.</p></div>`;
export const links = (items) => `<ul class="az-links">${items.map((x) => `<li><a href="${esc(x.url)}">${esc(x.label)}</a></li>`).join('')}</ul>`;

// 첫 화면 「분양가와 주변 시세」 막대: d% (+ 높음, − 낮음), ±40%까지 그리고 넘으면 끝에 붙인다
export function cmpBar(d) {
  const a = Math.round(Math.abs(d)), w = (Math.min(a, 40) / 40) * 50, c = a < 5 ? 'eq' : d > 0 ? 'up' : 'dn';
  return `<span class="az-cmp"><span class="az-dv" aria-hidden="true"><i class="${d > 0 ? 'up' : 'dn'}" style="width:${w.toFixed(2)}%"></i></span><b class="${c}">${a === 0 ? '0%' : `${d > 0 ? '+' : '−'}${a}%`}</b></span>`;
}

// C 고친 기록 자리: 글 파일엔 표시만 두고, 올릴 때 zip/revlog.mjs가 날짜와 내용을 채운다(처음 올린 날은 워드프레스가 아는 값이라)
export const LOG_MARK = '<!--az-log-->';
export const logHtml = (entries) => (entries.length ? `<section class="az-log"><h2>고친 기록</h2><ol>${entries.map((e) => `<li><time datetime="${e.d}">${e.d.replaceAll('-', '.')}</time>${esc(e.t)}</li>`).join('')}</ol></section>` : '');

if (process.argv[1]?.endsWith('ui.mjs') && process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  assert.deepEqual([-25, -19.4, -5, -4.4, 0, 4.6, 19.1, 19.6, 30].map(bandOf), [0, 1, 1, 2, 2, 3, 3, 4, 4]); // 반올림한 %로 판정: 4.6%→5%는 「높음」, 19.6%→20%는 「많이 높음」
  assert.equal(niceStep(230), 250); assert.equal(niceStep(90), 100); assert.equal(niceStep(1.2), 2);
  const v = verdict(19.2, { title: 't' });
  assert.ok(v.includes('left:74.00%') && v.includes('+19%') && v.includes('class="on up"'));
  assert.ok(verdict(-60, { title: 't' }).includes('left:0.00%')); // 끝을 넘으면 끝에
  const t = table(['단지', { t: '3.3㎡당', n: true }], [{ cells: ['가', '3,000'], me: true }]);
  assert.ok(t.includes('<tr class="me">') && t.includes('class="n" data-label="3.3㎡당"'));
  assert.ok(dotPlot([{ label: 'a', v: 2859.5 }, { label: 'b', v: 3623, me: true }], { med: 3041 }).includes('3,623'));
  assert.ok(cmpBar(70).includes('width:50.00%') && cmpBar(-5).includes('−5%'));
  console.log('ui 점검 통과');
}

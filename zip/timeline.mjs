// 심층 분석 글의 타임라인 그림(2026-10-30 사용자 요청: 청약 일정·필요한 현금을 그림으로, 긴 공백도 보이게). 사이트 색(zip/site.css 토큰)과 글꼴로 그린 HTML 틀을 브라우저로 찍어 PNG로.
// 휴대폰에서 읽히게 폭 720 기준(글자 24px 이상), 2배 해상도로 찍는다. data/zip_deep/<키>.json의 {timeline:{kind, ...}} 블록이 쓴다(zip/deep.mjs).
// schedule: { title, sub, items: [{ date: 'YYYY-MM-DD' | 'YYYY-MM-DD~YYYY-MM-DD' | 'YYYY-MM', label, sub }] } — 45일 넘게 떨어진 일정 사이에 「약 N개월」 공백 표시
// money:    { title, sub, start: 'YYYY-MM', end: 'YYYY-MM', cash: [{ date, amount(만원), label }], loan: { dates: [...], amount, label }, interest: { from, to, label }, total, note }
import { esc } from '../posts/weekly.mjs';

const C = { ink: '#17212b', sub: '#4f5d6b', line: '#dde3e8', panel: '#f1f4f7', blue: '#1f4f8f', blueSoft: '#dbe5f2', up: '#9a5b13', upSoft: '#f3e3cc' };
const FONT = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;600&display=swap">';
const W = 720;
const DOW = '일월화수목금토';
const d0 = (s) => new Date(`${s.length === 7 ? s + '-01' : s}T00:00:00Z`);
const md = (s) => { const d = d0(s); return `${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, '0')}`; };
const dow = (s) => DOW[d0(s).getUTCDay()];
const months = (a, b) => (d0(b) - d0(a)) / (30.44 * 864e5);
export const won = (m) => { const e = Math.floor(m / 10000), r = Math.round(m % 10000); return `${e ? `${e}억${r ? ' ' : ''}` : ''}${r ? `${r.toLocaleString('ko-KR')}만` : ''}원`; };
const gapText = (n) => (n >= 12 ? `약 ${Math.floor(n / 12)}년${Math.round(n % 12) ? ` ${Math.round(n % 12)}개월` : ''}` : `약 ${Math.round(n)}개월`);

const page = (body, css) => `<!doctype html><html lang="ko"><meta charset="utf-8">${FONT}<style>*{box-sizing:border-box;margin:0}body{width:${W}px;background:#fff;color:${C.ink};font-family:"IBM Plex Sans KR","Malgun Gothic",sans-serif;word-break:keep-all;font-feature-settings:"tnum"}#c{padding:40px 36px 36px}.t{font-size:34px;font-weight:600;letter-spacing:-0.02em;line-height:1.3}.s{font-size:24px;color:${C.sub};margin-top:8px;line-height:1.45}${css}</style><body><div id="c">${body}</div></body></html>`;

export function scheduleHtml({ title, sub, items }) {
  const first = (x) => x.date.split('~')[0], last = (x) => x.date.split('~').at(-1);
  let year = '', rows = '';
  items.forEach((x, i) => {
    const a = first(x), b = last(x);
    if (i) { const gap = months(last(items[i - 1]), a); if (gap > 1.5) rows += `<div class="gap"><span>${gapText(gap)}</span></div>`; }
    const y = a.slice(0, 4);
    if (y !== year) { rows += `<div class="yr">${y}</div>`; year = y; }
    const when = a.length === 7 ? `${+a.slice(5, 7)}월` : a === b ? `${md(a)}<small>${dow(a)}</small>` : `${md(a)}<small>~${md(b)}</small>`;
    rows += `<div class="row${x.key ? ' key' : ''}"><div class="d">${when}</div><div class="dot"></div><div class="b"><p class="l">${esc(x.label)}</p>${x.sub ? `<p class="u">${esc(x.sub)}</p>` : ''}</div></div>`;
  });
  return page(`<p class="t">${esc(title)}</p>${sub ? `<p class="s">${esc(sub)}</p>` : ''}<div class="tl">${rows}</div>`, `
.tl{position:relative;margin-top:28px}
.tl::before{content:"";position:absolute;left:151px;top:8px;bottom:8px;width:3px;background:${C.line}}
.yr{position:relative;margin:18px 0 6px;font-size:22px;font-weight:600;color:${C.blue};width:128px;text-align:right}
.row{position:relative;display:grid;grid-template-columns:128px 46px 1fr;align-items:start;padding:10px 0}
.d{text-align:right;font-size:28px;font-weight:600;line-height:1.25}
.d small{display:block;font-size:19px;font-weight:400;color:${C.sub};margin-top:2px}
.dot{position:relative;justify-self:center;width:17px;height:17px;margin-top:9px;border-radius:50%;background:#fff;border:4px solid ${C.blue}}
.row.key .dot{background:${C.blue}}
.l{font-size:26px;font-weight:600;line-height:1.35}
.u{font-size:22px;color:${C.sub};line-height:1.45;margin-top:3px}
.row.key{background:${C.blueSoft};border-radius:10px;margin:4px 0}
.gap{position:relative;height:72px}
.gap::before{content:"";position:absolute;left:151px;top:0;bottom:0;width:3px;background:repeating-linear-gradient(${C.sub} 0 6px,#fff 6px 14px)}
.gap span{position:absolute;left:174px;top:50%;transform:translateY(-50%);font-size:21px;color:${C.sub};background:${C.panel};padding:4px 12px;border-radius:20px}
`);
}

export function moneyHtml({ title, sub, start, end, cash, loan, interest, total, note }) {
  const L = 56, R = W - 36 * 2 - 40, span = months(start, end), x = (s) => L + (months(start, s) / span) * (R - L);
  const base = 400, max = Math.max(...cash.map((c) => c.amount), loan?.amount || 0), h = (a) => Math.max(4, (a / max) * 250);
  const ticks = []; for (let y = +start.slice(0, 4) + 1; y <= +end.slice(0, 4); y++) ticks.push(`${y}-01`);
  const bars = cash.map((c, i) => `<div class="cb" style="left:${x(c.date) - 22}px;top:${base - h(c.amount)}px;height:${h(c.amount)}px"></div><div class="cl${i === cash.length - 1 ? ' end' : ''}" style="left:${x(c.date)}px;top:${base - h(c.amount) - 76}px"><b>${won(c.amount)}</b><span>${esc(c.label)}</span></div>`).join('');
  const lh = loan ? h(loan.amount) * 0.45 : 0, lt = base + 52; // 축 아래: 연도 → 대출 막대 → 대출 설명 → 이자 띠 → 이자 설명 순으로 겹치지 않게 쌓는다
  const loans = (loan?.dates || []).map((s) => `<div class="lb" style="left:${x(s) - 12}px;top:${lt}px;height:${lh}px"></div>`).join('');
  const band = interest ? `<div class="ib" style="left:${x(interest.from)}px;width:${x(interest.to) - x(interest.from)}px;top:${lt + lh + 48}px"></div><p class="il" style="top:${lt + lh + 66}px">${esc(interest.label)}</p>` : '';
  const gap = `<div class="gp" style="left:${x(cash[0].date)}px;width:${x(cash.at(-1).date) - x(cash[0].date)}px"><span>${gapText(span)}</span></div>`;
  const tk = ticks.map((t) => `<div class="tk" style="left:${x(t)}px;top:${base}px"></div><p class="ty" style="left:${x(t)}px;top:${base + 8}px">${t.slice(0, 4)}</p>`).join('');
  const chartH = lt + lh + 150;
  return page(`<p class="t">${esc(title)}</p>${sub ? `<p class="s">${esc(sub)}</p>` : ''}
<div class="ch" style="height:${chartH}px">${gap}${bars}<div class="ax" style="top:${base}px;left:${L - 20}px;width:${R - L + 40}px"></div>${tk}${loans}${loan ? `<p class="ll" style="left:${x(loan.dates[0]) - 12}px;top:${lt + lh + 8}px">${esc(loan.label)}</p>` : ''}${band}</div>
<div class="tot"><span>${esc(total.label)}</span><b>${esc(total.value)}</b></div>${note ? `<p class="nt">${esc(note)}</p>` : ''}`, `
.ch{position:relative;margin-top:26px}
.gp{position:absolute;top:0;height:22px;border:3px solid ${C.sub};border-bottom:0;border-radius:4px 4px 0 0}
.gp span{position:absolute;left:50%;top:-18px;transform:translateX(-50%);background:#fff;padding:0 12px;font-size:22px;font-weight:600;color:${C.sub};white-space:nowrap}
.cb{position:absolute;width:44px;background:${C.blue};border-radius:5px 5px 0 0}
.cl{position:absolute;transform:translateX(-22px);white-space:nowrap}
.cl.end{transform:translateX(calc(-100% + 22px));text-align:right}
.cl b{display:block;font-size:27px;line-height:1.2}
.cl span{display:block;font-size:23px;color:${C.sub};line-height:1.3}
.ax{position:absolute;height:3px;background:${C.ink}}
.tk{position:absolute;width:2px;height:14px;background:${C.ink}}
.ty{position:absolute;transform:translateX(-50%);font-size:22px;color:${C.sub};margin-top:12px}
.lb{position:absolute;width:24px;background:repeating-linear-gradient(45deg,${C.upSoft} 0 6px,#fff 6px 10px);border:2px solid ${C.up};border-top:0}
.ll{position:absolute;font-size:23px;color:${C.up};white-space:nowrap}
.ib{position:absolute;height:10px;background:${C.upSoft};border-radius:5px}
.il{position:absolute;left:0;right:0;font-size:23px;color:${C.sub};line-height:1.4}
.tot{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-top:8px;padding:18px 22px;background:${C.panel};border-radius:10px}
.tot span{font-size:24px;color:${C.sub}}
.tot b{font-size:32px;white-space:nowrap}
.nt{font-size:22px;color:${C.sub};margin-top:12px;line-height:1.5}
`);
}

// HTML → PNG(2배 해상도). out: 파일 경로
export async function shoot(html, out) {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: W, height: 400 }, deviceScaleFactor: 2 });
    await p.setContent(html, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.locator('#c').screenshot({ path: out });
  } finally { await b.close(); }
}

if (process.argv[1]?.endsWith('timeline.mjs') && process.argv.includes('--self-check')) {
  const assert = (await import('node:assert/strict')).default;
  assert.equal(won(24700), '2억 4,700만원'); assert.equal(won(8380), '8,380만원'); assert.equal(won(30000), '3억원');
  assert.equal(gapText(months('2026-11', '2030-07')), '약 3년 8개월');
  assert.ok(scheduleHtml({ title: 't', items: [{ date: '2026-11-02', label: 'a' }, { date: '2027-07-31', label: 'b' }] }).includes('약 9개월'));
  console.log('timeline 점검 통과');
}

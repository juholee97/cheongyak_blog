// schedule.json → "이번 주 청약 일정" 초안 (drafts/{월요일}_weekly.json + 본문 HTML)
// node posts/weekly.mjs [--week 2026-10-26] [--data <파일|URL>]   새 초안 (summary는 비워 둠)
// node posts/weekly.mjs --render drafts/2026-10-26_weekly.json      summary를 고친 뒤 본문만 다시 그림
// --auto: 요약 2~3줄을 집계로 채운다(매주 자동 실행용 — 숫자·단지명만, 평가 없음)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const SCHEDULE_URL = 'https://juholee97.github.io/cheongyak_blog/schedule.json';
export const BLOG_URL = 'https://aulee.tistory.com/';
export const DISCLAIMER = '청약 일정은 입주자모집공고 기준이며 사업주체 사정에 따라 변경될 수 있습니다. 신청 전 반드시 청약홈의 입주자모집공고를 확인하세요.';
const PH = { sp: '특별공급', p1: '1순위', p2: '2순위', win: '당첨자 발표', con: '계약' };
const RECEIPT = ['sp', 'p1', 'p2'];
const W = '일월화수목금토';
const KIND_TAG = { 무순위: '무순위청약', 오피스텔: '오피스텔청약', 도시형: '도시형생활주택', 임의공급: '임의공급', '공공지원 민간임대': '민간임대' };

const pad = (n) => String(n).padStart(2, '0');
const toDate = (s) => new Date(s + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const dow = (s) => W[toDate(s).getUTCDay()];
export const md = (s) => `${+s.slice(5, 7)}.${s.slice(8, 10)}(${dow(s)})`; // 10.26(월)
export const mdKo = (s) => `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일`; // 10월 26일
export const full = (s) => `${s.slice(0, 4)}.${s.slice(5, 7)}.${s.slice(8, 10)} (${dow(s)})`; // 2026.10.26 (월)
// 기간 표기. 시작·끝 연도가 다르면 연도까지 쓴다("9.12 ~ 9.12"처럼 보이지 않게)
export const span = (p, f = md) => (!p.end ? f(p.date) : p.end.slice(0, 4) !== p.date.slice(0, 4) ? `${full(p.date)} ~ ${full(p.end)}` : `${f(p.date)} ~ ${f(p.end)}`);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const label = (it, k) => (k === 'p1' && it.kind !== 'APT' ? '접수' : PH[k]);
export const where = (it) => [it.region, it.district].filter(Boolean).join(' ');
export const updatedLabel = (u) => (/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(u) || []).slice(1).reduce((s, v, i) => s + ['', '.', '.', ' ', ':'][i] + v, '');

// 오늘(KST) 다음 월요일
export function nextMonday(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600e3);
  const d = iso(kst), wd = kst.getUTCDay();
  return addDays(d, ((8 - wd) % 7) || 7);
}

// 주간 집계: 기간이 이번 주와 겹치는 단계만
export function build(data, start) {
  const end = addDays(start, 6);
  const hit = (p) => p.date <= end && (p.end || p.date) >= start;
  const receipt = [], win = [], con = [];
  for (const it of data.items) {
    const ph = it.phases.filter(hit);
    const r = ph.filter((p) => RECEIPT.includes(p.k));
    if (r.length) receipt.push({ it, first: r[0].date, firstP: r[0] }); // 이번 주에 걸친 첫 접수 단계(앞 주에 시작해 이어지는 것 포함)
    ph.filter((p) => p.k === 'win').forEach((p) => win.push({ it, date: p.date }));
    // 계약은 시작일이나 종료일이 이번 주일 때만(2026.09.12~2029.09.12처럼 몇 년짜리 기간이 매주 끼지 않게)
    const inWeek = (s) => s >= start && s <= end;
    ph.filter((p) => p.k === 'con' && (inWeek(p.date) || (p.end && inWeek(p.end)))).forEach((p) => con.push({ it, p, date: p.date < start ? start : p.date }));
  }
  const byDate = (a, b) => a.date.localeCompare(b.date) || a.it.name.localeCompare(b.it.name, 'ko');
  receipt.sort((a, b) => a.first.localeCompare(b.first) || a.it.name.localeCompare(b.it.name, 'ko'));
  win.sort(byDate); con.sort(byDate);
  const kinds = {}, regions = {};
  receipt.forEach(({ it }) => { kinds[it.kind] = (kinds[it.kind] || 0) + 1; regions[it.region] = (regions[it.region] || 0) + 1; });
  return {
    start, end, updatedAt: data.updatedAt, receipt, win, con,
    facts: { receipt: receipt.length, win: win.length, con: con.length, kinds, regions },
  };
}

export function titleOf(w) {
  return `이번 주 청약 일정 (${mdKo(w.start)}~${mdKo(w.end)}) | 접수 ${w.facts.receipt}곳·발표 ${w.facts.win}곳`;
}

export function tagsOf(w) {
  const t = ['청약일정', '이번주청약', '아파트청약'];
  Object.keys(w.facts.kinds).forEach((k) => KIND_TAG[k] && t.push(KIND_TAG[k]));
  w.receipt.forEach(({ it }) => t.push(it.region + '청약'));
  return [...new Set(t)].slice(0, 10);
}

// 자동 요약: 집계값과 단지명·지역만으로 2~3줄. 검수(check.mjs)가 허용하는 숫자만 쓴다.
export function autoSummary(w) {
  const day = (s) => `${mdKo(s)}(${dow(s)})`;
  const n = w.facts.receipt;
  const out = [`${day(w.start)}부터 ${day(w.end)}까지 접수가 있는 단지는 ${n ? n + '곳입니다' : '없습니다'}.`];
  const cnt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}곳`).join('·');
  if (n && n <= 4) out.push(`접수 단지는 ${w.receipt.map(({ it }) => `${where(it)} ${it.name}`).join(', ')}입니다.`);
  else if (n) out.push(`종류별로는 ${cnt(w.facts.kinds)}, 지역별로는 ${cnt(w.facts.regions)}입니다.`);
  const parts = [['당첨자 발표', w.facts.win], ['계약', w.facts.con]].filter(([, v]) => v).map(([k, v]) => `${k} ${v}곳`);
  out.push(parts.length ? `같은 기간 ${parts.join(', ')}이 예정돼 있습니다.` : '같은 기간 당첨자 발표와 계약은 없습니다.');
  return out;
}

// 색은 디자인 시스템 「우리의 청약달력」 토큰(단계 색 = 접수 / 당첨자 발표 / 계약)
export const C = { brand: '#0b4fc4', ink: '#1c1f24', muted: '#4b5260', panel: '#f3f4f7', line: '#e3e6ec', receipt: '#0a7a5c', announce: '#b3261e', contract: '#4a4fa0' };
export const TH = `style="background:${C.panel};text-align:left;padding:8px 10px;border-bottom:1px solid ${C.line};white-space:nowrap"`;
export const TD = `style="padding:8px 10px;border-bottom:1px solid ${C.line}"`;
export const CAL_URL = BLOG_URL + 'category/' + encodeURIComponent('청약일정');

// 이미지 자리표시: 본문에는 <p>[[IMG:키]]</p>로 두고, 미리보기는 파일로, draft.mjs는 티스토리 업로드 결과로 바꾼다
export const IMG = (key) => `<p>[[IMG:${key}]]</p>`;
export const IMG_RE = /<p>\[\[IMG:([\w:-]+)\]\]<\/p>/g;

// images: [{key:'weekly'|'card:{id}'|'map:{id}', file, alt}] — 있는 것만 자리를 만든다
export function render(w, summary = [], images = []) {
  const has = new Set(images.map((i) => i.key));
  const img = (k) => (has.has(k) ? IMG(k) + '\n' : '');
  const kindText = Object.entries(w.facts.kinds).map(([k, n]) => `${k} ${n}`).join(' · ');
  const out = [];
  if (has.has('weekly')) out.push(IMG('weekly')); // 첫 이미지 = 티스토리 대표 이미지
  summary.filter(Boolean).forEach((s) => out.push(`<p>${esc(s)}</p>`));
  // 티스토리 편집기는 <b>의 style을 지운다(2026-10-23 저장본 확인) → 꾸밀 글자는 <span>으로
  // 단계별 수: 위쪽 색 막대 + 큰 숫자(홈 첫 화면·썸네일과 같은 모양). 편집기가 지키는 표로 그린다
  const stat = (label, n, c) => `<td style="width:33.3%;border-top:6px solid ${c};border-bottom:0;padding:10px 0 4px;vertical-align:top"><span style="font-size:14px;font-weight:700;color:${C.muted}">${label}</span><br><span style="font-size:36px;font-weight:900;line-height:1.15;color:${c}">${n}</span><span style="font-size:15px;font-weight:700;margin-left:2px">곳</span></td>`;
  out.push(`<table style="border-collapse:separate;border-spacing:12px 0;width:100%;margin:20px 0 4px;table-layout:fixed;border:0"><tbody><tr>${stat('접수', w.facts.receipt, C.receipt)}${stat('당첨자 발표', w.facts.win, C.announce)}${stat('계약', w.facts.con, C.contract)}</tr></tbody></table>
<p style="font-size:14px;color:${C.muted};margin:0 0 20px"><span style="color:${C.ink};font-weight:700">기간</span> ${full(w.start)} ~ ${full(w.end)}${kindText ? ` · <span style="color:${C.ink};font-weight:700">접수 종류</span> ${esc(kindText)}` : ''}<br>기준: ${updatedLabel(w.updatedAt)} 수집 · 출처: 청약홈(한국부동산원) 분양정보, 공공데이터포털</p>`);

  out.push('<h2 style="font-weight:700">이번 주 접수 단지</h2>');
  if (!w.receipt.length) out.push('<p>이번 주에 접수가 있는 단지가 없습니다.</p>');
  else out.push(`<table style="border-collapse:collapse;width:100%"><thead><tr><th ${TH}>이번 주 접수</th><th ${TH}>단지명</th><th ${TH}>지역</th><th ${TH}>종류</th><th ${TH}>공급</th></tr></thead><tbody>
${w.receipt.map(({ it, firstP }) => `<tr><td ${TD}>${span(firstP)} ${label(it, firstP.k)}</td><td ${TD}>${esc(it.name)}</td><td ${TD}>${esc(where(it))}</td><td ${TD}>${esc(it.kind)}</td><td ${TD}>${it.units ? it.units.toLocaleString() + '세대' : '-'}</td></tr>`).join('\n')}
</tbody></table>`);

  if (w.receipt.length) {
    out.push('<h2 style="font-weight:700">단지별 일정</h2>');
    // 단지마다 테두리 상자 하나: 번호 + 하이라이트한 단지명 → 카드 → 지도 → 요약 → 일정표 → 공고 링크
    w.receipt.forEach(({ it }, n) => {
      const facts = [esc(where(it)), esc(it.kind), it.units ? it.units.toLocaleString() + '세대' : null, it.pricePerPyeong ? `분양가(3.3㎡) ${it.pricePerPyeong.toLocaleString()}만원*` : null].filter(Boolean).join(' · ');
      out.push(`<div style="border:1px solid ${C.line};border-radius:16px;padding:20px;margin:28px 0">
<h3 style="margin:0 0 16px;padding:12px 16px;border-radius:12px;background:#eaf1fd;color:${C.ink};font-size:21px;font-weight:900;line-height:1.4"><span style="display:inline-block;margin-right:10px;padding:2px 10px;border-radius:999px;background:${C.brand};color:#fff;font-size:14px;font-weight:700;vertical-align:3px">${String(n + 1).padStart(2, '0')}</span>${esc(it.name)}</h3>
${img('card:' + it.id)}${img('map:' + it.id)}<p style="font-weight:700">${facts}</p>
<table style="border-collapse:collapse;width:100%;table-layout:fixed"><tbody>
${it.phases.map((p) => `<tr><th ${TH}>${label(it, p.k)}</th><td ${TD}>${span(p, full)}</td></tr>`).join('\n')}
</tbody></table>${it.applyhomeUrl ? `\n<p style="margin:14px 0 0"><a href="${esc(it.applyhomeUrl)}" target="_blank" rel="noopener">청약홈 공고 보기 →</a></p>` : ''}
</div>`);
    });
  }

  const list = (rows, fmt) => (rows.length ? `<ul>\n${rows.map(fmt).join('\n')}\n</ul>` : '<p>이번 주에는 없습니다.</p>');
  out.push('<h2 style="font-weight:700">이번 주 당첨자 발표</h2>', list(w.win, ({ it, date }) => `<li>${md(date)} ${esc(it.name)} · ${esc(where(it))}</li>`));
  out.push('<h2 style="font-weight:700">이번 주 계약</h2>', list(w.con, ({ it, p }) => `<li>${span(p)} ${esc(it.name)} · ${esc(where(it))}</li>`));

  out.push(`<h2 style="font-weight:700">지역별로 보려면</h2>
<p>시·도와 서울 자치구별 일정은 청약일정 메뉴의 청약 달력에서 매일 아침 갱신됩니다. <a href="${CAL_URL}">청약 달력 바로가기</a></p>`);
  if (w.receipt.some(({ it }) => it.pricePerPyeong)) out.push('<p style="font-size:13px;color:#4b5260">* 분양가(3.3㎡): 주택형별 최고분양가를 공급면적 3.3㎡당으로 환산해 세대수로 가중 평균한 값입니다.</p>');
  out.push(`<p style="font-size:13px;color:#4b5260">※ ${DISCLAIMER}</p>`);
  return out.join('\n');
}

export async function loadData(src = SCHEDULE_URL) {
  if (/^https?:/.test(src)) {
    const r = await fetch(src, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${src} HTTP ${r.status}`);
    return r.json();
  }
  return JSON.parse(await readFile(src, 'utf8'));
}

export function draftOf(data, start, summary = [], images = []) {
  const w = build(data, start);
  return {
    week: { start: w.start, end: w.end }, dataUpdatedAt: data.updatedAt, dataSource: SCHEDULE_URL,
    title: titleOf(w), category: '청약일정', tags: tagsOf(w), summary, facts: w.facts, images,
    html: render(w, summary, images),
  };
}

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const renderPath = arg('--render');
  if (renderPath) {
    // 같은 수집본으로 다시 그려야 사실 대조가 맞는다: 초안에 기록된 데이터를 다시 받지 않고 저장된 사본을 쓴다
    const d = JSON.parse(await readFile(renderPath, 'utf8'));
    const data = JSON.parse(await readFile(renderPath.replace(/\.json$/, '.data.json'), 'utf8'));
    const next = draftOf(data, d.week.start, d.summary, d.images || []);
    await writeFile(renderPath, JSON.stringify(next, null, 2));
    console.log(`다시 그림: ${renderPath} (${next.title})`);
    return;
  }
  const start = arg('--week') || nextMonday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || toDate(start).getUTCDay() !== 1) throw new Error(`--week는 월요일 날짜(YYYY-MM-DD): ${start}`);
  const base = `drafts/${start}_weekly`;
  // 이미 있는 초안(요약·승인·저장 기록이 붙은)을 실수로 덮어쓰지 않는다
  if (!process.argv.includes('--force') && (await readFile(base + '.json').then(() => true, () => false))) {
    console.log(`${base}.json이 이미 있습니다 — 그대로 둡니다. 새로 만들려면 --force (요약이 지워짐).`);
    return;
  }
  const data = await loadData(arg('--data') || SCHEDULE_URL);
  const draft = draftOf(data, start, process.argv.includes('--auto') ? autoSummary(build(data, start)) : []);
  await mkdir('drafts', { recursive: true });
  await writeFile(base + '.data.json', JSON.stringify(data)); // 검수·다시 그리기용 수집본 사본
  await writeFile(base + '.json', JSON.stringify(draft, null, 2));
  console.log(`${base}.json — ${draft.title}`);
  console.log(`접수 ${draft.facts.receipt} · 발표 ${draft.facts.win} · 계약 ${draft.facts.con} · 기준 ${updatedLabel(data.updatedAt)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

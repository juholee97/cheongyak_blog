// 공고 분석 글(분양분석의 아파트 분양 외 모든 달력 공고: 청년안심주택·SH·LH 임대·무순위·임의공급·오피스텔 등) 초안: 달력 항목 1건 → drafts/analysis_{공고id}.json
// node posts/notice_post.mjs <공고id>  예) sh-311965 · youth-6707 · lh-2015122300020979 · 2026000373(청약홈 번호)
// 재료는 달력 수집 값(이름·종류·호수·주소·일정·공고 주소) + 주소가 있으면 주변 역·학교 + SH는 첨부 이미지에서 읽은 일정·시세 비교 결과뿐이다. 값을 지어내지 않는다.
// 분양분석 글(analysis_post.mjs)과 같은 초안 모양(type:'analysis', facts.notice)이라 tistory/draft.mjs가 그대로 저장·예약한다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadData, esc, span, label, where, full, md, C, TH, TD, IMG, DISCLAIMER, toc } from './weekly.mjs';
import { BANNED } from './check.mjs';
import { areaOf, shortName, dist } from './analysis_post.mjs';
import { stations } from './nearby.mjs';
import { schoolsAt } from './schools.mjs';
import { locate } from './trades.mjs';
import { keyOf, mapHtml } from './map.mjs';
import { itemHtml, renderPngs, searchThumbHtml } from './card.mjs';
import { ROOT } from '../tistory/common.mjs';

const json = (p) => readFile(join(ROOT, p), 'utf8').then(JSON.parse, () => null);
const box = (inner) => `<div style="border:1px solid ${C.line};border-radius:16px;padding:16px 20px;margin:16px 0">${inner}</div>`;
const table = (head, rows) => `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:480px"><thead><tr>${head.map((h) => `<th ${TH}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td ${TD}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const note = (lines) => (lines || []).filter(Boolean).map((s) => `<p>${esc(s)}</p>`).join('\n');
const won = (n) => { const a = Math.round(n); return a >= 10000 ? `${Math.floor(a / 10000)}억${a % 10000 ? ' ' + (a % 10000).toLocaleString() + '만' : ''}원` : `${a.toLocaleString()}만원`; };
const HEADS = [['glance', '한눈에'], ['schedule', '접수 일정'], ['place', '입지 — 교통·학교'], ['rent', '임대 조건과 주변 시세'], ['links', '공고문·문의']];

// 후보 판단: 글로 쓸 재료가 있는가. 정정·취소 공고와 재료 없는 공고(주소도 비교 결과도 없음)는 뺀다
export function usable(it, extra = {}) {
  if (/정정|취소|연기|당첨자|결과/.test(it.name)) return false;
  if (!(it.phases || []).some((p) => ['sp', 'p1'].includes(p.k) && p.date)) return false;
  return !!(it.address || extra.rent?.length);
}

export async function collect(id, dataSrc) {
  const data = await loadData(dataSrc);
  const it = data.items.find((x) => x.id === id || x.id.startsWith(id + '-'));
  if (!it) throw new Error(`수집본에 공고 ${id} 없음`);
  const vkey = await keyOf();
  const site = it.address && vkey ? await locate(it.address, vkey).catch(() => null) : null;
  const nearby = site ? { stations: await stations(site.lon, site.lat), schools: await schoolsAt(site.lon, site.lat) } : { skip: it.address ? '위치 못 찾음' : '주소 없음' };
  const rent = ((await json('data/sh_rent.json')) || []).filter((u) => u.id === it.id);
  const reg = (await json('data/zip_registry.json')) || {};
  return { notice: true, item: it, dataUpdatedAt: data.updatedAt, nearby, rent, zip: reg[it.id]?.slug || null };
}

export function renderFacts(f) {
  const { item: it, nearby: n, rent } = f;
  const out = {};
  const ph = it.phases.filter((p) => p.date).map((p) => `<span style="font-weight:700">${label(it, p.k)}</span> ${span(p, md)}`).join(' · ');
  out.glance = box(`<p style="margin:0 0 6px"><span style="font-weight:700">${esc(where(it))}</span> · ${esc(it.kind)}${it.units ? ` · ${it.units.toLocaleString()}세대` : ''}</p>${it.address ? `<p style="margin:0 0 6px">${esc(it.address)}</p>` : ''}<p style="margin:0 0 6px">공고일 ${it.noticeDate ? full(it.noticeDate) : '-'}</p><p style="margin:0">${ph}</p>`);
  out.schedule = table(['단계', '날짜'], it.phases.filter((p) => p.date).map((p) => [esc(label(it, p.k)), esc(span(p, md))]));
  const st = Array.isArray(n.stations) ? n.stations : [], sc = n.schools || {};
  const list = (xs, k = 3) => (xs || []).slice(0, k).map((s) => `${esc(s.name)} ${dist(s.d)}`).join(', ');
  const elem = (sc.elem || []).length ? sc.elem.map((z) => list(z.schools, 1)).join(', ') : '확인 못 함';
  out.place = n.skip ? `<p>주변 정보를 찾지 못했어요(${esc(n.skip)}).</p>` : table(['구분', '직선거리, 가까운 순'], [
    ['지하철·철도역', st.length ? st.map((s) => `${esc(s.name)} ${dist(s.d)}`).join('<br>') : '3km 안 없음'],
    ['초등학교(통학구역)', elem],
    ['중학교(학교군)', (sc.middle || []).map((z) => `${esc(z.name)} ${list(z.schools)}`).join('<br>') || '확인 못 함'],
  ]) + `<p style="font-size:13px;color:${C.muted}">학구도 2026.09 기준 · 배정은 교육지원청 확인 · 역 © OpenStreetMap</p>`;
  const ok = (rent || []).filter((u) => u.result);
  out.rent = ok.length ? table(['호', '임대보증금 · 월세', '주변 월세 중앙값', '월세 비율'], ok.map((u) => [esc(u.name), `${won(u.deposit)}<br>월 ${u.rent}만원`, u.result.insufficient ? '비교 거래 부족' : `월 ${Math.round(u.result.market)}만원`, u.result.insufficient ? '-' : `<b>${Math.round(u.result.ratio * 100)}%</b>`]))
    + `<p style="font-size:13px;color:${C.muted}">보증금이 비슷한 주변 월세 거래와 견준 값이에요. 조건·표본은 ${f.zip ? `<a href="https://auleezip.com/${esc(f.zip)}/" target="_blank" rel="noopener">aulee의 집 비교 글</a>` : 'aulee의 집 비교 글'}에서 볼 수 있어요.</p>` : '';
  out.links = `<p><a href="${esc(it.applyhomeUrl)}" target="_blank" rel="noopener">${it.source === 'sh' ? 'SH 입주자 모집공고 원문' : it.source === 'lh' ? 'LH 청약플러스 공고' : it.source === 'youth' || /^youth-/.test(it.id) ? '서울시 청년안심주택 공고' : '청약홈 입주자모집공고'} 보기</a>${it.homepageUrl ? ` · <a href="${esc(it.homepageUrl)}" target="_blank" rel="noopener">운영 기관 홈페이지</a>` : ''}</p>`;
  return out;
}

const summaryOf = (f) => {
  const it = f.item, rec = it.phases.filter((p) => ['sp', 'p1'].includes(p.k) && p.date).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  return `${where(it)} ${it.kind}${it.units ? ` ${it.units.toLocaleString()}세대` : ''} 모집${rec ? `, ${label(it, rec.k)}는 ${span(rec, md)}예요` : '이에요'}.`;
};
const summaryBox = (f) => `<div style="border:1px solid ${C.line};border-left:4px solid #4a3fa0;border-radius:12px;padding:14px 18px;margin:16px 0;background:#f6f5fc"><p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#4a3fa0">한 줄 요약</p><p style="margin:0;font-weight:700">${esc(summaryOf(f))}</p></div>`;

export function render(f, notes = {}, images = []) {
  const x = renderFacts(f), has = new Set(images.map((i) => i.key)), img = (k) => (has.has(k) ? IMG(k) : '');
  const heads = HEADS.filter(([id]) => id !== 'rent' || x.rent);
  const H2 = ([id, t]) => `<h2 id="${id}" style="font-weight:700">${t}</h2>`;
  return [
    img('thumb'), img('card'), (notes.intro || []).filter(Boolean).length ? `<p>${notes.intro.filter(Boolean).map(esc).join(' ')}</p>` : '',
    summaryBox(f), toc(heads.map(([id, t]) => ({ id, t }))),
    H2(HEADS[0]), x.glance, H2(HEADS[1]), note(notes.schedule), x.schedule,
    H2(HEADS[2]), img('map'), note(notes.place), x.place,
    ...(x.rent ? [H2(HEADS[3]), note(notes.rent), x.rent] : []),
    H2(HEADS[4]), `<p>신청 자격(소득·자산·거주 요건)과 임대 조건은 공고문에 적힌 내용이 기준이에요. 신청 전에 원문을 꼭 확인하세요.</p>`, x.links,
    `<p style="font-size:13px;color:${C.muted}">기준: 우리의 청약달력 수집 ${esc(f.dataUpdatedAt.slice(0, 10))} · 이 글은 공고와 공개 자료를 정리한 것이며 신청 권유가 아닙니다.</p>`,
    `<p style="font-size:13px;color:${C.muted}">※ ${DISCLAIMER}</p>`,
  ].filter(Boolean).join('\n');
}

// 자동 설명: facts 값만 쓴다(숫자는 renderFacts와 같은 형식이라 검수를 통과한다)
export function autoNotes(f) {
  const { item: it, nearby: n, rent } = f;
  const st = Array.isArray(n.stations) ? n.stations[0] : null, sc = n.schools || {}, elem = sc.elem?.[0]?.schools?.[0];
  const ok = (rent || []).filter((u) => u.result && !u.result.insufficient);
  return {
    intro: [`${where(it)}의 ${it.kind} 모집공고예요.${it.units ? ` 모집 규모는 ${it.units.toLocaleString()}세대예요.` : ''}`],
    schedule: [it.phases.some((p) => p.k === 'p1') ? '접수 기간과 발표일은 아래 표에서 확인하세요.' : null],
    place: n.skip ? [] : [st ? `가장 가까운 역은 ${st.name}으로 직선 ${dist(st.d)}예요.` : '3km 안에 지하철·철도역이 없어요.', elem ? `초등학교 통학구역은 ${elem.name}(${dist(elem.d)})예요.` : null],
    rent: ok.length ? [`호별 월세를 보증금이 비슷한 주변 월세 거래와 견줘 봤어요.`] : [],
  };
}

export const titleOf = (f) => `[${areaOf(f.item)}] ${shortName(f.item.name).replace(/\s*(입주자\s*)?모집\s*(공고|안내)(문)?\s*$/, '').replace(/^\[[^\]]*\]\s*/, '').trim()} — ${f.item.kind} 공고 분석(일정·입지·임대 조건)`.slice(0, 80);

export function draftOf(f, notes = {}, images = []) {
  return { type: 'analysis', no: f.item.id, title: titleOf(f), category: '분양분석', tags: [...new Set(['공고분석', '청약', f.item.kind, f.item.region + '청약', shortName(f.item.name).replace(/\s|\(.*?\)|\[.*?\]/g, '').slice(0, 20)].filter(Boolean))].slice(0, 10), facts: f, notes, images, html: render(f, notes, images) };
}

export function checkNotice(draft) {
  const issues = [];
  if (render(draft.facts, draft.notes, draft.images || []) !== draft.html) issues.push('본문이 facts·notes로 다시 그린 결과와 다릅니다(--render).');
  const nums = new Set(render(draft.facts, {}, []).replace(/<[^>]+>/g, ' ').replace(/,/g, '').match(/\d+(\.\d+)?/g));
  for (const [k, lines] of Object.entries(draft.notes || {})) for (const line of lines || []) {
    let rest = line.split(draft.facts.item.name).join(' ');
    for (const m of rest.replace(/,/g, '').match(/\d+(\.\d+)?/g) || []) if (!nums.has(m)) issues.push(`notes.${k}의 숫자 "${m}"가 수집·조회 값에 없습니다: ${line}`);
  }
  const text = [draft.title, ...Object.values(draft.notes || {}).flat()].join('\n').split(draft.facts.item.name).join(' ');
  BANNED.forEach((b) => { if (text.includes(b)) issues.push(`금지 표현 "${b}"`); });
  if (!draft.html.includes(DISCLAIMER)) issues.push('면책 문구 없음');
  if (!Object.values(draft.notes || {}).flat().length) issues.push('notes가 비어 있습니다.');
  return issues;
}

export async function images(f, out) {
  await mkdir(out, { recursive: true });
  const it = f.item, rec = it.phases.find((p) => ['sp', 'p1', 'p2'].includes(p.k)) || it.phases[0];
  const mon = new Date(rec.date + 'T00:00:00Z'); mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7));
  const start = mon.toISOString().slice(0, 10), end = new Date(mon.getTime() + 6 * 864e5).toISOString().slice(0, 10);
  const name = shortName(it.name).replace(/^\[[^\]]*\]\s*/, ''), w = name.split(' ');
  let cut = 1, best = Infinity;
  for (let i = 1; i < w.length; i++) { const d = Math.abs(w.slice(0, i).join(' ').length - w.slice(i).join(' ').length); if (d < best) { best = d; cut = i; } }
  const lines = w.length > 1 ? `${w.slice(0, cut).join(' ')}\n${w.slice(cut).join(' ')}` : name;
  const pages = [{ name: 'thumb', html: searchThumbHtml({ category: '분양분석', lines, label: label(it, rec.k), value: md(rec.date), foot: `${where(it)} · ${it.kind}` }) }, { name: 'card', html: itemHtml(it, { start, end, badge: '접수 주' }) }];
  const m = it.address ? await mapHtml(it, await keyOf()).catch(() => ({ skip: true })) : { skip: true };
  if (!m.skip) pages.push({ name: 'map', html: m.html });
  const files = await renderPngs(pages, out);
  return files.map((file, i) => ({ key: pages[i].name, file: file.replace(/\\/g, '/'), alt: { thumb: `${it.name} 공고 분석 대표 이미지`, card: `${it.name} 청약 일정 카드` }[pages[i].name] || `${it.name} 위치 지도(반경 500m·1km)` }));
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const it = { id: 'sh-1', name: '강북구 신혼부부 매입임대 모집 공고', region: '서울', district: '강북구', kind: '수요자맞춤형', units: 4, source: 'sh', address: null, noticeDate: '2026-10-26', applyhomeUrl: 'https://x', phases: [{ k: 'p1', date: '2026-11-02', end: '2026-11-12' }] };
  assert.equal(usable(it, {}), false); // 주소도 비교 결과도 없으면 쓰지 않는다
  assert.equal(usable(it, { rent: [{}] }), true);
  assert.equal(usable({ ...it, name: '[정정공고] x', address: 'a' }, {}), false);
  const f = { notice: true, item: it, dataUpdatedAt: '2026-10-28T00:00:00Z', nearby: { skip: '주소 없음' }, rent: [], zip: null };
  const d = draftOf(f, autoNotes(f), []);
  assert.deepEqual(checkNotice(d), []);
  console.log('notice_post 점검 통과');
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const rp = arg('--render');
  if (rp) {
    const d = JSON.parse(await readFile(rp, 'utf8'));
    await writeFile(rp, JSON.stringify(draftOf(d.facts, d.notes, d.images), null, 2));
    const issues = checkNotice(JSON.parse(await readFile(rp, 'utf8')));
    console.log(issues.length ? issues.map((i) => '✗ ' + i).join('\n') : `검수 통과 — ${d.title}`);
    process.exitCode = issues.length ? 4 : 0;
  } else {
    const id = process.argv[2];
    if (!id) { console.log('사용: node posts/notice_post.mjs <공고id> [--auto]'); process.exit(1); }
    const f = await collect(id, arg('--data') || undefined), base = `drafts/analysis_${f.item.id}`;
    if (f.nearby.skip && !f.rent.length && !process.argv.includes('--force')) { console.log(`재료 부족 — 주변 정보(${f.nearby.skip})도 임대 비교도 없어 글을 만들지 않아요: ${f.item.name}`); process.exit(8); } // 글이 얇아지는 공고는 건너뛴다(자동 실행은 실패로 세지 않는다)
    const imgs = await images(f, base + '.img');
    await writeFile(base + '.json', JSON.stringify(draftOf(f, process.argv.includes('--auto') ? autoNotes(f) : {}, imgs), null, 2));
    console.log(`${base}.json — ${titleOf(f)}\n그림 ${imgs.length}장${f.rent.length ? ` · 임대 비교 ${f.rent.length}호` : ''}`);
  }
}

// SH 임대 공고 글: data/sh_rent.json(zip/sh_rent.mjs 결과) → auleezip 글 { slug: sh-<번호>, title, html, excerpt, tags, categories }
// node zip/sh_write.mjs                 글 파일 data/zip_posts/sh-*.json + 대표 이미지 + 미리보기 data/zip_posts/preview_sh.html
// node zip/sh_write.mjs --draft         위 + 워드프레스에 임시글(draft)로 올림(공개 안 함)
// node zip/sh_write.mjs --publish       공개 규칙(zip/publish.mjs planOf)대로 올리고 장부(data/zip_registry.json)에 넣은 뒤 고정 페이지 갱신 — 사용자 승인 뒤에만
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { esc, md, DISCLAIMER } from '../posts/weekly.mjs';
import { BANNED } from '../posts/check.mjs';
import { closedOf, OPEN_URL, CAL_URL, METHOD_URL, wrap, receiptOf, span } from './post.mjs';
import { table, keyBox, rail, src, note, banner, links, keepUnits, LOG_MARK } from './ui.mjs';
import { planOf } from './publish.mjs';
import { fetchSH } from '../crawler/sh.mjs';
import { round100, floorBand } from './sh_rent.mjs';

export const CAT_RENT = '임대 시세비교';
// 만원 → 「1억 9,000만원」 / 「2,012만원」 (소수 월세는 그대로 만원 단위 한 자리까지)
const won = (n) => { const a = Math.round(n); return a >= 10000 ? `${Math.floor(a / 10000)}억${a % 10000 ? ' ' + (a % 10000).toLocaleString() + '만' : ''}원` : `${a.toLocaleString()}만원`; };
const monthly = (n) => `${(Math.round(n * 10) / 10).toLocaleString()}만원`;
const pct = (r) => `${Math.round(r * 100)}%`;

// 공고 한 건(호 여러 개) → 글. notice: fetchSH가 만든 공고 항목, units: data/sh_rent.json 중 그 공고의 호들
export function shPost(notice, units) {
  const seq = notice.id.replace('sh-', ''), gu = notice.district || units[0].gu;
  const ok = units.filter((u) => u.result && !u.result.insufficient), ratios = ok.map((u) => u.result.ratio);
  const nm = notice.name.replace(/\s*(입주자\s*)?모집\s*공고(문)?\s*$/, '').replace(/^\[[^\]]*\]\s*/, '').replace(new RegExp('^' + gu + '\\s*'), '').trim();
  let title = `[${gu}] ${nm}, 월세는 주변 시세와 어떨까?`;
  if (title.length > 44) title = `[${gu}] ${nm}, 주변 월세와 비교`;
  if (title.length > 44) title = `[${gu}] ${nm.slice(0, 24).trim()}… 주변 월세 비교`;
  const lo = Math.min(...ratios), hi = Math.max(...ratios);
  const one = ok.length ? `${units.length}호의 월세는 보증금이 비슷한 주변 월세 거래 중앙값의 ${lo === hi ? pct(lo) : `${pct(lo)}~${pct(hi)}`}예요` : units.some((u) => u.requireAge) ? '같은 신축 비교 거래가 없어 시세보다 높은지 낮은지 판단하지 않았어요' : '비교할 주변 거래가 모자라요';
  const lead = `${nm}의 호별 임대보증금·월세를, 같은 구에서 최근 6개월 안에 새로 계약한 비슷한 면적·층·보증금의 전월세 실거래와 견줬어요. ${one}.`;
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), closed = closedOf(notice.phases, today);
  const rows = units.map((u) => {
    const c = u.result, m = u.market;
    const cmp = c.insufficient ? (u.requireAge ? `${esc(m.cond)} 비교 거래가 ${c.n === 0 ? '없어' : c.n + '건뿐이라'} 판단하지 않았어요<small>구축 거래로 대신하지 않았어요</small>` : `비교 거래 ${c.n}건뿐이라 판단하지 않았어요`) : `${esc(m.scope)} · ${esc(m.cond)}<small>거래 ${c.n}건</small>`;
    return [esc(u.name.replace(notice.name, '').trim() || u.name), `${u.floor != null ? esc(floorBand(u.floor)) + ' · ' : ''}${u.area}㎡`, `${won(u.deposit)}<small>월 ${monthly(u.rent)}</small>`, cmp, c.insufficient ? '-' : `월 ${monthly(c.market)}`, c.insufficient ? '-' : `<b>${pct(c.ratio)}</b>`];
  });
  const traits = units.find((u) => u.traits)?.traits;
  const traitHtml = traits ? ['<h2>변인 점검: 무엇을 맞췄고 무엇을 못 맞췄나</h2>', table(['항목', '이 집', '비교에서'], traits.map((t) => t.map((x, i) => (i === 2 ? `<b>${esc(x.split(' — ')[0])}</b>${x.includes(' — ') ? '<small>' + esc(x.split(' — ')[1]) + '</small>' : ''}` : esc(x)))))] : [];
  const own = units.filter((u) => u.ownTrades?.length);
  const ownHtml = own.length ? ['<h3>같은 건물에서 신고된 실제 계약</h3>', `<p>국토교통부 전월세 신고에는 이 건물(${esc(own[0].own)})의 계약도 올라와 있어요. 전용 ${own[0].area}㎡ 신고 거래는 ${own[0].ownTrades.map((t) => `${t.ym} ${t.floor}층 보증금 ${won(t.deposit)}·월 ${monthly(t.rent)}`).join(', ')}이에요. 공고문의 임대조건(${units.map((u) => `${u.floor}층 보증금 ${won(u.deposit)}·월 ${monthly(u.rent)}`).join(', ')})과 비슷한 수준이에요. 공고 임대료가 이 건물의 실제 계약 수준과 크게 다르지 않다는 뜻이고, 시세보다 높은지 낮은지는 신축 비교 거래가 없어 말할 수 없어요.</p>`] : [];
  const rk = units.find((u) => u.requireAge && u.market?.rankN);
  const rankHtml = rk ? [`<p>참고로 연식을 가리지 않고 같은 구의 비슷한 면적(±15%)·보증금(±30%) 다세대 월세 신고 ${rk.market.rankN}건 중 이 집보다 월세가 낮은 거래는 ${rk.market.rankBelow}건이에요. 다만 대부분 1990년대 준공 빌라라 신축과 직접 견줄 수는 없어요.</p>`] : [];
  const conds = [...new Set(units.map((u) => u.cond).filter(Boolean))];
  const when = (notice.phases || []).filter((p) => p.date).map((p) => [esc(p.k === 'p1' ? '접수' : '당첨자 발표'), p.end ? `${md(p.date)} ~ ${md(p.end)}` : md(p.date)]);
  const rc = receiptOf(notice.phases);
  const kind = units.some((u) => /다가구|단독/.test(u.type || '')) ? '단독다가구' : units.some((u) => /다세대|연립/.test(u.type || '')) ? '연립다세대' : '아파트';
  const html = [
    closed ? banner(OPEN_URL) : '',
    keyBox([`${esc(one)}.`, `같은 구에서 최근 6개월 안에 새로 계약한, 면적·층·보증금이 비슷한 월세 거래와 견줬어요.`, ...conds.slice(0, 1).map(esc)]),
    rail([
      ['주변 거래', `국토교통부 ${kind} 전월세 실거래 · 최근 6개월 · 갱신 계약 제외`],
      ['비교 조건', '같은 구 · 비슷한 면적·보증금 · 같은 층대·연식대 먼저'],
      ['임대조건 출처', `<a href="${esc(notice.applyhomeUrl)}">SH 입주자 모집공고</a>`],
      ...(rc ? [['접수', span(rc.start, rc.end)]] : []),
    ], `<a href="${METHOD_URL}">비교 기준 보기 →</a>`),
    '<h2>호별 임대조건과 주변 거래 비교</h2>',
    table(['호', '층 · 전용', '임대보증금 · 월세', '비교한 주변 거래', { t: '그 거래 월세 중앙값', n: true }, { t: '월세 비율', n: true }], rows),
    ...(conds.length > 1 ? [`<ul>${conds.slice(1).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`] : []),
    ...traitHtml, ...ownHtml, ...rankHtml,
    src(`기준: 공고문에 적힌 호별 임대보증금·월세(공고문 쪽 이미지에서 옮겨 적고 OCR로 숫자를 다시 대조) · 국토교통부 ${kind} 전월세 실거래(공공데이터포털) 최근 6개월, 갱신계약 제외 · 전용면적이 비슷하고(±5㎡ 또는 ±15% 중 큰 쪽) 임대보증금이 ±30% 안인 월세 거래만 · 같은 층대(반지하·1층·저층·중층·고층)와 연식대끼리 먼저 보고, 거래가 3건 미만이면 조건을 풀어요(표의 「비교한 주변 거래」에 실제로 쓴 조건을 적었어요). 월세 비율은 이 집 월세 ÷ 그 거래들의 월세 중앙값이에요. 건물의 위치·관리·준공 연식 차이는 반영하지 못해요.`),
    ...(when.length ? ['<h2>접수 일정</h2>', table(['단계', { t: '날짜', n: true }], when, { stack: false })] : []),
    '<h2>확인할 조건</h2>',
    `<p>소득·자산 기준, 거주 요건, 계약기간, 임대보증금과 월세의 전환 조건은 <a href="${esc(notice.applyhomeUrl)}">SH 입주자 모집공고 원문</a>에서 확인하세요. 이 글의 월세는 공고문에 적힌 기준(소득 구간별로 다를 수 있음)을 그대로 옮긴 거예요.</p>`,
    '<h2>함께 보면 좋은 글</h2>',
    links([{ url: OPEN_URL, label: '현재 열린 공고 보기' }, { url: CAL_URL, label: '청약 일정 달력 (우리의 청약달력)' }]),
    LOG_MARK,
    note(`이 글은 공고와 공개 실거래 자료를 비교한 것이며 청약·임대 신청 권유가 아닙니다. ${esc(DISCLAIMER.replace('청약홈', '공고 게시처(SH 홈페이지)'))}`),
  ].filter(Boolean).join('\n');
  return { slug: `sh-${seq}`, title, html: wrap(keepUnits(html)), excerpt: lead, closed, tags: [gu, notice.kind, 'SH 임대'], categories: [CAT_RENT], snap: { ratios: ok.map((u) => Math.round(u.result.ratio * 100)) } };
}

export const checkPost = (p) => BANNED.filter((b) => [p.title, p.html, p.excerpt].join('\n').includes(b)).map((b) => `금지 표현 "${b}"`);

async function notices() {
  const f = join(ROOT, 'data/sh_notices.json'), have = JSON.parse(await readFile(f, 'utf8').catch(() => '{}'));
  const need = [...new Set(JSON.parse(await readFile(join(ROOT, 'data/sh_rent.json'), 'utf8').catch(() => '[]')).map((u) => u.id))].filter((id) => !have[id]);
  if (need.length) { for (const i of await fetchSH(new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10))) have[i.id] = i; await writeFile(f, JSON.stringify(have, null, 1)); } // 새 공고가 있을 때만 게시판을 다시 읽는다
  return have;
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const n = { id: 'sh-1', name: '강북구 신혼부부 매입임대 잔여세대 입주자 모집 공고', district: '강북구', kind: '수요자맞춤형', applyhomeUrl: 'https://x', phases: [{ k: 'p1', date: '2026-11-02', end: '2026-11-12' }] };
  const u = (ratio) => ({ id: 'sh-1', name: '강북 202호', gu: '강북구', type: '다세대', area: 42.2, floor: 2, deposit: 2012, rent: 26.2, market: { scope: '구 전체', cond: '저층(2~3층)' }, result: { type: '월세', ratio, market: 63, n: 71 } });
  const p = shPost(n, [u(0.42), u(0.46)]);
  assert.equal(p.slug, 'sh-1'); assert.ok(p.html.includes('42%~46%')); assert.ok(!p.title.includes('%')); // 제목은 결과를 드러내지 않는다
  assert.deepEqual(checkPost(p), []);
  assert.equal(won(19000), '1억 9,000만원');
  console.log('sh_write 점검 통과');
} else if (process.argv[1]?.endsWith('sh_write.mjs')) {
  const units = JSON.parse(await readFile(join(ROOT, 'data/sh_rent.json'), 'utf8').catch(() => '[]')), N = await notices();
  const by = {};
  for (const u of units) (by[u.id] ||= []).push(u);
  const dir = join(ROOT, 'data/zip_posts');
  await mkdir(join(dir, 'img'), { recursive: true });
  const posts = [], today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const { thumbHtml } = await import('./thumb.mjs'), { renderPngs } = await import('../posts/card.mjs');
  const oi = process.argv.indexOf('--only'), only = oi > 0 ? process.argv[oi + 1].split(',') : null; // --only sh-번호,sh-번호: 그 공고만
  for (const [id, us] of Object.entries(by)) {
    if (only && !only.includes(id)) continue;
    const n = N[id];
    if (!n) { console.log(`✗ ${id}: 공고 정보 없음`); continue; }
    const p = shPost(n, us), issues = checkPost(p);
    if (issues.length) { console.log(`✗ ${p.title}: ${issues.join(', ')}`); continue; }
    await writeFile(join(dir, `${p.slug}.json`), JSON.stringify(p, null, 2));
    await renderPngs([{ name: p.slug, html: thumbHtml({ ...n, source: 'sh', region: '서울' }) }], join(dir, 'img'));
    posts.push({ p, n, pl: planOf(n.phases, today) });
    console.log(`${p.closed ? '[마감]' : '      '} ${p.title} · ${planOf(n.phases, today).why}`);
  }
  await writeFile(join(dir, 'preview_sh.html'), await (await import('./post.mjs')).previewHtml(posts.map((x) => x.p)));
  // --live: 이미 공개한 공고(장부에 있는 것)만 고쳐 올린다 — 매일 자동 실행용(보류 중인 글은 건드리지 않는다)
  const draft = process.argv.includes('--draft'), pub = process.argv.includes('--publish'), live = process.argv.includes('--live');
  if (draft || pub) {
    const { upsert, uploadMedia } = await import('./wp.mjs');
    const { loadLog, saveLog, applyLog } = await import('./revlog.mjs');
    const reg = JSON.parse(await readFile(join(ROOT, 'data/zip_registry.json'), 'utf8').catch(() => '{}')), store = await loadLog();
    for (const { p, n, pl } of posts) {
      if (live && !reg[n.id]) continue;
      p.featured = await uploadMedia(join(dir, 'img', `${p.slug}.png`), `${p.slug}.png`, p.title).catch(() => undefined);
      p.html = pub ? applyLog(store, p, { today, first: pl.mode === 'at' ? pl.at.slice(0, 10) : today }) : p.html.replace(LOG_MARK, ''); // 임시글은 기록을 시작하지 않는다
      const o = await upsert(p, pub && pl.mode === 'at' ? pl.at : null, pub && pl.mode === 'now');
      console.log(`${o.ok ? '✓' : '✗'} ${o.status} ${o.link}`);
      if (o.ok && pub) await saveLog(store);
      if (pub && pl.mode === 'now') reg[n.id] = { no: n.id, slug: p.slug, name: n.name.replace(/\s*(입주자\s*)?모집\s*공고(문)?\s*$/, ''), region: '서울', district: n.district, kind: n.kind, source: 'sh', phases: n.phases };
    }
    if (pub) {
      await writeFile(join(ROOT, 'data/zip_registry.json'), JSON.stringify(reg, null, 1));
      console.log('고정 페이지 갱신: node zip/publish.mjs --go --only none');
    }
  }
}

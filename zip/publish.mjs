// auleezip.com 공개 규칙(2026-10-30 사용자 결정): 시세 비교·임대 글은 공고가 나오면 바로 발행(예전 「접수 7일 전 09:00 예약」은 폐기).
// 2026-11-15 사용자 「멈추기」: 새 공고의 시세 비교 글은 올리지 않는다(wp.mjs APT_NEW_HOLD — 「미룸 apt-…」 로그, 장부·목록·링크 목록에도 안 들어감). 계산은 심층 분석 가격 절에 그대로.
// 심층 분석 글만 첫 접수일 7일 전 06:00 예약(zip/deep.mjs, 규칙은 zip/post.mjs planOf) — 06:00이라 07:00 매일 실행이 그날 첫 화면·시세 비교 글에 연결한다.
// 접수가 끝난 공고도 글에 「접수 마감」 표시를 달아 계속 공개한다(현재 열린 공고 페이지로 보내 사이트 안을 돌게 한다).
// node zip/publish.mjs          계획만 출력(올리지 않음)
// node zip/publish.mjs --go     계획대로 올리고 다시 불러와 대조 + 고정 페이지(열린 공고·비교 기준·소개·개인정보) 갱신 + 캐시 비우기
// node zip/publish.mjs --go --pages   글은 그대로 두고 고정 페이지만(매일 아침 analysis_auto.bat — 접수 중/마감·D-day가 날짜 따라 바뀐다)
// 올릴 때 글 끝 「고친 기록」을 채운다(zip/revlog.mjs — 처음 올린 날, 숫자가 바뀐 날)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { upsert, upsertPage, uploadMedia, wp, heldNew } from './wp.mjs';
import { closedOf, planOf, liveDeep } from './post.mjs';
export { planOf }; // zip/sh_write.mjs가 여기서 불러 쓴다
import { openPage, methodPage, aboutPage, privacyPage, saleList, deepList, rentList, withSchedule, rentals, resultsPage } from './pages.mjs';
import { allDeep, folders as deepFolders, RESULTS_PAGE_LIVE, resultPosts, loadResults } from './deep.mjs';
// 「청약 결과 모음」 고정 페이지(/results/, 2026-11-17 주인 결정) 스위치는 deep.mjs에 있다(새 글의 모음 페이지 한 줄과 같이 켜고 끈다). 미리보기 승인 뒤 켠다
export { RESULTS_PAGE_LIVE };
import { loadViews } from './views.mjs';
import { loadLog, saveLog, applyLog } from './revlog.mjs';
import { purge } from './site.mjs';
import { loadStages, stageOf, stamped, stampLive, isEnded, deepFirst, unstampHeld } from './stage.mjs';
import { noOf } from './deep_targets.mjs';

// crawler/auleezip_links.json(티스토리 달력 버튼)의 심층 분석 주소. 2026-11-16 처음엔 티스토리 스킨 todo.js wpLink()가 auleezip.com/(deep|apt)-…/ 꼴만 받아 true였다.
// 2026-11-16 02:55 스킨이 한글 주소를 받게 됨(7fc7470) → false. 달력 링크는 글의 지금 주소(d.link)를 쓴다. 스킨이 다시 옛 꼴만 받게 되면 true
// 켜면 자료에 slug(워드프레스 주소)가 있는 글도 옛 꼴 deep-<키>로 적는다 — 공개된 글은 워드프레스가 옛 주소를 301로 넘기지만, 처음부터 한글 주소로 만든 글은 옛 주소가 없어 404
export const LINKS_OLD_FORM = false;
export const calLink = (d, old = LINKS_OLD_FORM) => (old && d.slug ? `https://auleezip.com/deep-${d.key}/` : d.link);
const kst = () => new Date(Date.now() + 9 * 3600e3);
const ymd = (d) => d.toISOString().slice(0, 10);

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const P = (d) => [{ k: 'p1', date: d }];
  const D = { lead: 7, time: '06:00' }; // 심층 분석 글
  assert.equal(planOf(P('2026-11-20'), '2026-10-28').mode, 'now'); // 시세 비교 글은 접수가 멀어도 바로
  assert.equal(planOf(P('2026-11-20'), '2026-10-28', D).at, '2026-11-13 06:00');
  assert.equal(planOf(P('2026-11-04'), '2026-10-28', D).mode, 'now'); // 정확히 7일 전이면 오늘이 그날이라 즉시
  assert.equal(planOf(P('2026-11-05'), '2026-10-28', D).mode, 'at'); // 8일 남음 → 내일 06:00 예약
  assert.equal(planOf(P('2026-10-27'), '2026-10-28', D).why, '접수 마감 표시로 공개'); // 끝난 공고도 공개
  assert.equal(liveDeep({ link: 'x', status: 'future', at: '2026-11-13 06:00' }, '2026-11-13 05:59'), false);
  assert.equal(liveDeep({ link: 'x', status: 'future', at: '2026-11-13 06:00' }, '2026-11-13 07:00'), true); // 예약 시각이 지나면 공개된 것으로
  const { eventsOf } = await import('./pages.mjs'); // 첫 화면 일정: 기간 접수는 주말을 빼고 날마다, 무순위 접수는 「접수」
  assert.deepEqual(Object.keys(eventsOf({ kind: 'APT', phases: [{ k: 'p1', date: '2026-11-06', end: '2026-11-09' }] })), ['2026-11-06', '2026-11-09']);
  assert.deepEqual(eventsOf({ kind: '무순위', phases: [{ k: 'p1', date: '2026-11-02' }, { k: 'win', date: '2026-11-02' }] })['2026-11-02'], ['접수', '발표']);
  const S = [{ k: 'p1', date: '2026-11-02', end: '2026-11-04' }, { k: 'win', date: '2026-11-10' }, { k: 'con', date: '2026-11-20', end: '2026-11-22' }];
  assert.deepEqual(['2026-11-04', '2026-11-05', '2026-11-22', '2026-11-23'].map((t) => stageOf(S, t)), ['', 'closed', 'closed', 'ended']); // 접수·계약 마지막 날은 아직 그 단계
  const { recLabel } = await import('./pages.mjs'), RC = { start: '2026-11-02', end: '2026-11-04' };
  assert.deepEqual(['2026-10-30', '2026-11-03', '2026-11-04'].map((t) => recLabel(RC, t)), ['3일 뒤 접수 시작 · D-5', '접수 중 · 11.4 마감 · D-1', '오늘 접수 마감 · D-Day']); // 상태 줄에 마감까지 남은 날
  assert.equal(stamped('[D-12] 제목', ''), '제목'); // 예전 제목의 D-표시를 지운다
  assert.equal(stamped('[D-12] 제목', 'closed'), '제목'); // [신청마감]은 제목에 안 붙인다(2026-11-13)
  assert.equal(stamped('[신청마감] X', 'closed'), 'X'); // 이미 붙은 표시는 뗀다
  assert.equal(stamped('X', 'closed'), 'X');
  assert.equal(stamped('[신청마감] X', 'ended'), '[종료] X');
  assert.equal(stamped('[종료] X', 'ended'), '[종료] X');
  assert.equal(stamped('[신청마감] X', ''), 'X');
  assert.deepEqual(['apt-1', 'deep-2', 'apt-3', 'deep-4'].map((slug) => ({ slug })).sort(deepFirst).map((e) => e.slug), ['deep-2', 'deep-4', 'apt-1', 'apt-3']); // [신청마감] 떼기는 심층 분석 글부터
  assert.equal(unstampHeld(ymd(kst())), true); // 2026-11-14 미루기: 단계 그대로인 closed 글의 옛 [신청마감]은 떼지 않는다(stampLive·upsert). 날짜를 넣으면 이 줄을 고친다
  assert.equal(stageOf([{ k: 'win', date: '2026-01-01' }], '2026-11-09'), ''); // 접수일 없는 자료는 표시하지 않는다
  assert.equal(stamped(stamped('[서울] 제목', 'closed'), 'ended'), '[종료] [서울] 제목'); // 앞 표시만 갈아 끼우고 지역 표시는 둔다
  assert.equal(stamped('[종료] 제목', ''), '제목');
  const { heldEdit } = await import('./wp.mjs'); // 시세 비교 글 수정 멈춤(2026-11-13)
  assert.equal(heldEdit('apt-2026000517', true), true);
  assert.equal(heldEdit('deep-2026000517', true), false);
  assert.equal(heldEdit('apt-2026000517', false), false);
  const { heldNew, APT_NEW_HOLD } = await import('./wp.mjs'); // 새 공고 시세 비교 글 멈춤(2026-11-15): 없거나 초안·예약인 apt 글만, 공개된 apt·deep 글은 무관
  assert.equal(APT_NEW_HOLD, true); // 풀면 이 줄을 고친다
  assert.deepEqual([undefined, 'draft', 'future'].map((s) => heldNew('apt-2026000600', s)), [true, true, true]);
  assert.deepEqual([heldNew('apt-2026000517', 'publish'), heldNew('deep-2026000600', undefined), heldNew('deep-2026000600', 'future'), heldNew('apt-2026000600', undefined, false)], [false, false, false, false]);
  { // 워드프레스 주소(2026-11-16): wpSlug 없는 글의 저장 표시 지문 재료는 예전과 같아야 한다(다르면 공개 글이 한꺼번에 다시 저장된다)
    const { sigOf, sendSlug } = await import('./wp.mjs'), p = { slug: 'deep-1', title: 't', html: '<p>h</p>', excerpt: 'e', tags: ['a'], categories: ['심층 분석'], featured: 7 }, q = { slug: 'apt-2', title: 't', html: 'h' };
    for (const [x, at, now] of [[p, '2026-11-20 06:00', false], [p, null, true], [q, null, false], [{ ...p, wpSlug: undefined }, null, true]]) assert.equal(JSON.stringify(sigOf(x, at, now)), JSON.stringify([x.title, x.html, x.excerpt, x.tags, x.categories, x.featured, at, now]));
    assert.notEqual(JSON.stringify(sigOf({ ...p, wpSlug: '더샵-트리센트-분양' }, null, true)), JSON.stringify(sigOf(p, null, true))); // 주소만 바뀌어도 다시 보낸다
    assert.deepEqual([sendSlug(p), sendSlug({ ...p, wpSlug: '더샵-트리센트-분양' })], ['deep-1', '더샵-트리센트-분양']);
    // 달력 링크 목록(LINKS_OLD_FORM): 꺼져 있으면 slug 있는 글도 자료의 link 그대로, 켜면 slug 있는 글만 옛 꼴 deep-<키>
    const cA = { key: '1', slug: '더샵-트리센트-분양', link: 'https://auleezip.com/%eb%8d%94/' }, cB = { key: '2', link: 'https://auleezip.com/deep-2/' };
    assert.deepEqual([calLink(cA, false), calLink(cB, false)], [cA.link, cB.link]);
    assert.deepEqual([calLink(cA, true), calLink(cB, true)], ['https://auleezip.com/deep-1/', cB.link]);
    assert.deepEqual([calLink(cA), calLink(cB)], [calLink(cA, LINKS_OLD_FORM), calLink(cB, LINKS_OLD_FORM)]); // 기본값은 스위치를 따른다
    assert.equal(LINKS_OLD_FORM, false); // 켜면 이 줄을 고친다
  }
  { // 목록 첫 그림만 바로 받기(2026-11-13 휴대폰 LCP): 그림 없는 칸은 건너뛰고 실제 첫 그림이 eager, 나머지는 lazy
    const R = (no) => ({ no, name: `단지${no}`, region: '서울', phases: [{ k: 'p1', date: `2026-12-0${no}` }] }), V = { url: 'v.jpg' };
    const html = saleList([R(1), R(2), R(3)], '2026-11-13', {}, { 1: { link: 'a' }, 2: { link: 'b' }, 3: { link: 'c' } }, { 2: V, 3: V });
    assert.deepEqual([...html.matchAll(/<img [^>]*?(loading="\w+"(?: fetchpriority="high")?)/g)].map((m) => m[1]), ['loading="eager" fetchpriority="high"', 'loading="lazy"']);
  }
  { // 「청약 결과 모음」(2026-11-17): 공개는 미리보기 승인 뒤. 요약 표는 최신 결과 순, 공개 글만 링크, 상세 절 id="r-<키>", 금지 표현·가격 판정 없음
    assert.equal(RESULTS_PAGE_LIVE, false); // 켜면 이 줄을 고친다
    const r = (ty, req, sup, rank = 1) => ({ HOUSE_TY: ty, RESIDE_SENM: '해당지역', REQ_CNT: String(req), SUPLY_HSHLDCO: sup, SUBSCRPT_RANK_CODE: rank });
    const res = { 1: { at: '2026-11-12', apt: [r('084.7637A', 610, 10), r('059.9000B', 3, 5)], score: [] }, 2: { at: '2026-11-17', remndr: [r('084.9452A', 69, 2)] }, 3: { at: '2026-11-11', remndr: [r('074.1000', 5, 1)] } };
    const ps = [{ key: '1', nos: ['1'], name: '가 단지', url: 'https://auleezip.com/%ea%b0%80-%eb%b6%84%ec%96%91/' }, { key: '2', nos: ['2'], name: '나 단지', url: 'https://auleezip.com/deep-2/' }, { key: '3', nos: ['3'], name: '다 단지', url: null }, { key: '4', nos: ['4'], name: '결과 없음', url: 'https://auleezip.com/deep-4/' }];
    const h = resultsPage(res, ps), ids = [...h.matchAll(/<h2 id="r-(\w+)">/g)].map((m) => m[1]);
    assert.deepEqual(ids, ['2', '1', '3']); // 결과 기준일 최신순, 결과 없는 글은 빠짐
    assert.ok(h.includes('2026.11.17 기준입니다') && h.includes('<a href="https://auleezip.com/%ea%b0%80-%eb%b6%84%ec%96%91/">가 단지</a>') && h.includes('<a href="#r-1">주택형별</a>'));
    assert.ok(!h.includes('>다 단지</a>') && h.includes('다 단지<small>무순위 · 11.11 기준')); // 공개 글이 없으면 이름만, 구분·기준일은 이름 밑 작은 줄
    assert.ok(h.includes('가 단지</a><small>1순위 · 11.12 기준') && h.includes('data-label="평균 경쟁률"'));
    assert.ok(h.includes('<td class="n" data-label="평균 경쟁률">34.5대 1</td>') && h.includes('<td class="n" data-label="공급 (세대)">15</td>') && h.includes('<td class="n" data-label="접수 (건)">613</td>'));
    assert.ok(!/우리 가족|우리 아기|우리 아이|아기와|우리집|두 분|우리 부부|두 사람|\/apt-|낮다|높다|% (낮|높)|추천합니다|청약하세요/.test(h), '금지 표현');
    assert.ok(resultsPage({}, ps).includes('아직 모은 청약 결과가 없습니다'));
  }
  console.log('publish 점검 통과');
} else if (process.argv[1]?.endsWith('publish.mjs')) {
  const go = process.argv.includes('--go');
  const { items } = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8')), today = ymd(kst());
  // 공개한 공고 장부: 자료가 일시적으로 비어도(예: 지도 사용량 한도) 「현재 열린 공고」 페이지에서 글이 빠지지 않게 쌓아 둔다
  const regFile = join(ROOT, 'data/zip_registry.json'), reg = JSON.parse(await readFile(regFile, 'utf8').catch(() => '{}'));
  const oi = process.argv.indexOf('--only'), only = oi > 0 ? process.argv[oi + 1].split(',') : null; // --only 공고번호: 그 글만 올린다(고정 페이지는 장부로 늘 갱신)
  const seen = new Set(), live = [], pagesOnly = process.argv.includes('--pages'), store = await loadLog(), stages = await loadStages();
  for (const r of pagesOnly ? [] : items.filter((x) => !x.skip)) {
    const post = JSON.parse(await readFile(join(ROOT, 'data/zip_posts', `${r.no}.json`), 'utf8').catch(() => 'null'));
    if (!post || seen.has(post.slug) || (only && !only.includes(r.no))) continue; // 합쳐진 공고는 글이 하나
    if (isEnded(stages, post.slug) && !process.argv.includes('--include-ended')) continue; // [종료]는 더 고치지 않는다(zip/stage.mjs). 글 틀을 바꿨을 때만 --include-ended
    seen.add(post.slug);
    const phases = items.filter((x) => x.name === r.name).flatMap((x) => x.phases || []);
    const pl = planOf(phases, today);
    let res = '', held = false;
    const fresh = heldNew(post.slug, reg[r.no] ? 'publish' : ''); // 장부에 없는 apt 글 = 아직 공개 안 된 새 글. 2026-11-15 멈춤 — 막는 곳은 wp.mjs upsert, 여기선 대표 이미지도 올리지 않는다
    if (!go && fresh) res = ' → 멈춤(새 시세 비교 글)';
    if (go) {
      post.featured = fresh ? undefined : await uploadMedia(join(ROOT, 'data/zip_posts/img', `${r.no}.png`), `apt-${r.no}.png`, post.title).catch(() => undefined); // 대표 이미지(없으면 글만)
      post.title = stamped(post.title, stageOf(phases, today));
      post.html = applyLog(store, post, { today, first: pl.mode === 'at' ? pl.at.slice(0, 10) : today });
      const o = await upsert(post, pl.mode === 'at' ? pl.at : null, pl.mode === 'now');
      if (o.ok) await saveLog(store);
      held = o.status === 'held' || o.status === 'stopped'; // 공개 안 된 글은 장부·목록·링크 목록에 넣지 않는다
      res = ` → ${o.ok ? '✓' : '✗'} ${o.status} ${o.link}`;
    }
    if (pl.mode === 'now') live.push({ ...r, phases });
    if (go && pl.mode === 'now' && !held) reg[r.no] = { no: r.no, name: r.name, region: r.region, district: r.district, kind: r.kind, address: r.address, phases };
    console.log(`${pl.mode.padEnd(4)} ${pl.at || ''} ${post.title.slice(0, 44)} · ${pl.why}${res}`);
  }
  if (go) {
    await (await import('node:fs/promises')).writeFile(regFile, JSON.stringify(reg, null, 1));
    // 첫 화면 막대: 분양은 deals.json의 차이(%), 임대(SH)는 월세 비율 범위
    const res = {};
    for (const r of items.filter((x) => !x.skip)) res[r.no] = { d: -r.rate * 100, leasehold: !!r.leasehold, p: r.main?.max, m: r.main?.area };
    const sh = JSON.parse(await readFile(join(ROOT, 'data/sh_rent.json'), 'utf8').catch(() => '[]')), by = {};
    for (const u of sh) if (u.result && !u.result.insufficient) (by[u.id] ||= []).push(Math.round(u.result.ratio * 100));
    for (const [id, rs] of Object.entries(by)) { const lo = Math.min(...rs), hi = Math.max(...rs); res[id] = { text: `월세가 주변 거래의 ${lo === hi ? lo : `${lo}~${hi}`}%` }; }
    // 첫 화면 오른쪽 「심층 분석」(zip/deep.mjs로 공개한 글 — 다루는 공고번호는 data/deep_folders.json)
    const fo = Object.values(await deepFolders()), deeps = (await allDeep()).filter((d) => liveDeep(d)).map((d) => ({ ...d, nos: fo.find((n) => n[0] === d.key) || [d.key] }));
    // 첫 화면 공고 표·일정은 티스토리 청약달력과 같은 수집본(schedule.json)에서 열린 공고를 거의 다 받는다(2026-10-31 사용자) — 글이 없는 공고는 청약홈·LH·SH 공고로 잇는다
    const { items: sched } = await (await import('../posts/weekly.mjs')).loadData().catch(() => ({ items: [] }));
    for (const d of deeps) d.r = sched.find((it) => d.nos.includes(noOf(it))); // 표에 없는 공고(임대·지난 공고)의 지역·구분·일정 — 첫 화면 고르는 칸이 쓴다
    // 제목 앞 [종료](옛 [신청마감]은 뗀다): 공개된 글 제목을 고치고, 아래 목록·첫 화면에도 같은 제목을 쓴다
    const posts = {};
    for (const r of Object.values(reg)) { const j = JSON.parse(await readFile(join(ROOT, 'data/zip_posts', `${r.slug || r.no}.json`), 'utf8').catch(() => 'null')); if (j) posts[r.no] = { title: j.title, excerpt: j.excerpt, link: `https://auleezip.com/${j.slug}/`, slug: j.slug, phases: r.phases }; }
    const deepPhases = (d) => d.nos.flatMap((n) => reg[n]?.phases || sched.filter((it) => noOf(it) === n).flatMap((it) => it.phases || []));
    await stampLive([...Object.values(posts).filter((p) => p.slug?.startsWith('apt-')).map(({ slug, title, phases }) => ({ slug, title, phases: phases || [] })), ...deeps.map((d) => ({ slug: `deep-${d.key}`, title: d.title, phases: deepPhases(d), id: d.id }))], stages, today);
    for (const p of Object.values(posts)) p.title = stamped(p.title, stages[p.slug]?.stage);
    for (const d of deeps) d.title = stamped(d.title, stages[`deep-${d.key}`]?.stage);
    // 달력이 공고에서 우리의 집 글로 잇는 목록(2026-11-10 티스토리 개편): 공고번호 → 심층 분석, 없으면 시세 비교. 크롤러는 data/를 못 보니 crawler/에 둔다
    const idx = JSON.parse(await readFile(join(ROOT, 'data/zip_posts/index.json'), 'utf8').catch(() => '{}')), liveSlugs = new Set(Object.values(posts).map((p) => p.slug)), zipLinks = {};
    for (const [no, slug] of Object.entries(idx)) if (liveSlugs.has(slug)) zipLinks[no] = `https://auleezip.com/${slug}/`;
    for (const d of deeps) for (const n of d.nos) zipLinks[n] = calLink(d);
    await (await import('node:fs/promises')).writeFile(join(ROOT, 'crawler/auleezip_links.json'), JSON.stringify(Object.fromEntries(Object.entries(zipLinks).sort()), null, 1) + '\n');
    // 조감도(data/zip_views.json, zip/views.mjs)를 미디어로 먼저 올린다 — 첫 화면 격자도 같은 그림을 쓰니 페이지보다 먼저(2026-11-05: 나중에 올려 새 그림이 첫 화면에 하루 늦게 붙던 것)
    const views = await loadViews();
    for (const [no, v] of Object.entries(views)) if (v.file && !v.url) {
      const id = await uploadMedia(join(ROOT, v.file), `view-${no}.jpg`, `${reg[no]?.name || no} ${v.label || '조감도'}`).catch(() => null);
      if (id) Object.assign(v, { mid: id, url: (await wp(`media/${id}`)).source_url });
    }
    await (await import('node:fs/promises')).writeFile(join(ROOT, 'data/zip_views.json'), JSON.stringify(views, null, 1));
    const pages = [['open-notices', '심층 분석', openPage(withSchedule(Object.values(reg), sched, today), today, res, deeps, views)], ['method', '비교 기준', methodPage()], ['about', '소개', aboutPage()], ['privacy', '개인정보처리방침', privacyPage()]];
    let openId;
    for (const [slug, title, html] of pages) { if (slug === 'open-notices') { const kb = (s) => Math.round(Buffer.byteLength(s || '') / 1024); console.log(`첫 화면 ${kb(html)}KB`, [...html.matchAll(/<tbody class="(s\d)">[\s\S]*?<\/tbody>/g)].map((m) => `${m[1]} ${kb(m[0])}KB`).join(' '), `격자 ${kb(html.match(/<section class="az-dgrid"[\s\S]*?<\/section>/)?.[0])}KB`); } // 워드프레스가 큰 글을 502로 거절한다(2026-10-31 122KB) — 크기를 늘 찍어 둔다
const o = await upsertPage({ slug, title, html }); if (slug === 'open-notices') openId = o.id; console.log(`${o.ok ? '✓' : '✗'} 페이지 ${slug} ${o.link}`); }
    // 첫 화면을 「심층 분석」(고정 페이지 open-notices, 2026-11-10 이름 바꿈)으로: 방문자가 사이트 안을 돌게 한다
    await wp('settings', { method: 'POST', body: { show_on_front: 'page', page_on_front: openId } }).then((s) => console.log('첫 화면:', s.show_on_front, s.page_on_front)).catch((e) => console.log('첫 화면 설정 못 바꿈:', e.message));
    // 「분양 시세비교」 목록 = 카테고리 템플릿 category-<id>(글 왼쪽, 조감도 오른쪽). 조감도는 위에서 미디어로 올린 views를 쓴다
    // 「심층 분석」·「임대 시세비교」 목록도 같은 방식(오른쪽 카드 — pages.mjs deepList·rentList). 임대는 사이트에서 뺐다(2026-11-03 사용자) — 메뉴에 없고 목록은 비워 둔다
    const lists = [['분양-시세비교', saleList(Object.values(reg), today, res, posts, views)], ['심층-분석', deepList(deeps, Object.values(reg), today, views)], ['임대-시세비교', rentList(Object.values(reg), today, {}, sh)]];
    for (const [catSlug, html] of lists) {
      const [cat] = await wp(`categories?slug=${encodeURIComponent(catSlug)}`);
      if (!cat) continue;
      const slug = `category-${cat.id}`, content = `<!-- wp:template-part {"slug":"header","theme":"twentytwentyfive"} /-->
<!-- wp:html -->
<main class="az-main"><div class="az-head"><h1 class="az-title">${cat.name}</h1></div><div class="az-content"><div class="az az-page">
${html}
</div></div></main>
<!-- /wp:html -->
<!-- wp:template-part {"slug":"footer","theme":"twentytwentyfive"} /-->`;
      const old = await wp(`templates/twentytwentyfive//${slug}?context=edit`).catch(() => null);
      const t = old ? await wp(`templates/twentytwentyfive//${slug}`, { method: 'POST', body: { content } }) : await wp('templates', { method: 'POST', body: { slug, title: `${cat.name} 목록`, content } });
      console.log(`${t?.content?.raw === content ? '✓' : '✗'} 목록 템플릿 ${slug} ${cat.name}`);
    }
    // 청약 결과(경쟁률·당첨 가점, 2026-11-11 사용자 결정): 바뀐 심층 분석 글을 다시 올린다. 실패해도 매일 작업은 계속
    // 2026-11-17 주인 결정: 결과로 글을 다시 저장하지 않는다(deep.mjs RESULT_REPUBLISH_HOLD) — 결과 자료만 받아 「청약 결과 모음」 페이지에 모은다
    try { await (await import('./deep.mjs')).updateResults(); } catch (e) { console.log('청약 결과 갱신 실패', e.message); }
    // 「청약 결과 모음」: 위에서 받은 그날 결과까지 넣으려고 고정 페이지 목록(위 pages)과 따로 결과를 받은 뒤에 올린다. RESULTS_PAGE_LIVE(미리보기 승인 뒤)가 켜져 있을 때만
    for (const [slug, title, html] of RESULTS_PAGE_LIVE ? [['results', '청약 결과 모음', resultsPage(await loadResults(), await resultPosts(sched))]] : []) { const o = await upsertPage({ slug, title, html }); console.log(`${o.ok ? '✓' : '✗'} 페이지 ${slug} ${o.link}`); }
    console.log('캐시 비우기', (await purge()) ? '✓' : '✗'); // 이 사이트는 글을 고쳐도 캐시를 자동으로 안 비운다
  }
}

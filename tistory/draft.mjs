// 승인된 주간 초안을 티스토리에 "임시저장"한다. 발행하지 않는다.
// node tistory/draft.mjs drafts/2026-10-26_weekly.json --approved      그림 업로드 → 입력 → 임시저장 → 저장본을 다시 불러와 전문 대조
// node tistory/draft.mjs drafts/2026-10-26_weekly.json --dry-run       저장 없이 업로드·조립·입력·대조까지 (업로드 외 POST를 막아 자동 임시저장도 안 생김)
// node tistory/draft.mjs drafts/2026-10-26_weekly.json --verify-only   저장 없이, 임시저장 목록의 같은 제목 글을 불러와 대조만
// 종료 코드: 0 통과, 1 오류, 2 저장본 불일치·목록에 없음, 3 로그인 필요, 4 검수 실패·승인 없음, 5 티스토리 하루 글 작성 한도(10-23 50개 → 10-27 5개), 6 티스토리 보안 확인(reCAPTCHA)
// 주의(2026-10-22 실측): 편집기가 입력 도중 자동 임시저장을 하므로 "개수 +1"로 저장을 판정하지 않는다 → 저장본을 다시 열어 확인한다.
import { readFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { launch, ensureLogin, NEWPOST, ROOT, BLOG, GUARD } from './common.mjs';
import { checkDraft } from '../posts/check.mjs';
import { checkAnalysis, areaOf } from '../posts/analysis_post.mjs';
import { checkNotice } from '../posts/notice_post.mjs';
import { checkGuide } from '../posts/guide.mjs';
import { IMG_RE } from '../posts/weekly.mjs';

const SEL = JSON.parse(await readFile(join(ROOT, 'tistory', 'selectors.json'), 'utf8'));
// 티스토리 쪽 부담 줄이기(2026-10-30 사용자 결정: 하루에 저장·대조가 몰린 뒤 보안 확인이 잦아짐).
// 저장(예약·임시저장·고치기)은 모든 스크립트를 합쳐 하루 DAY_MAX번, 저장 사이는 GAP_MIN분 — 기다릴 땐 브라우저를 띄우기 전에 기다린다.
// 한도에 걸리면 코드 5(부르는 쪽은 「내일 다시」). REST_UNTIL 전까지는 저장을 모두 쉰다(2026-10-31 사용자 결정: 5일 포스팅 정지 — 이미 예약된 글은 제시간에 공개). 기록 data/tistory_usage.json
const DAY_MAX = 3, GAP_MIN = 30, REST_UNTIL = '2026-11-05';
const USAGE = join(ROOT, 'data', 'tistory_usage.json');
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const usage = async () => { const u = JSON.parse(await readFile(USAGE, 'utf8').catch(() => '{}')); return u.day === kstDay() ? u : { day: kstDay(), saves: 0, last: u.last }; };
const markSave = async () => { const u = await usage(); await writeFile(USAGE, JSON.stringify({ day: u.day, saves: u.saves + 1, last: new Date().toISOString() }) + '\n'); };
const TOKEN_RE = new RegExp(SEL.attach.token, 'g');

const log = (...a) => console.log(...a);
// 태그: 발행·예약된 글은 티스토리가 소문자·가나다순으로 바꿔 보여 준다(2026-10-23 실측) → 대소문자·순서 무시
const sameTags = (a, b) => JSON.stringify(a.map((t) => t.toLowerCase()).sort()) === JSON.stringify(b.map((t) => t.toLowerCase()).sort());
// 예약한 글: posts/scheduled.json(제목 → 주소·시각)과 posts/published.json(관련 글 링크용 제목 → 주소)에 적는다.
// 관련 글은 이 목록에 먼저 오른 글(= 먼저 예약된, 더 이른 시각의 글)만 가리키게 되므로 예약은 시각 순서대로 한다.
async function recordScheduled(title, url, when) {
  for (const [f, v] of [['scheduled.json', { url, when }], ['published.json', url]]) {
    const p = join(ROOT, 'posts', f);
    const m = JSON.parse(await readFile(p, 'utf8').catch(() => '{}'));
    m[title] = v;
    await writeFile(p, JSON.stringify(m, null, 2) + '\n');
  }
}
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const fileNames = (html) => [...html.matchAll(TOKEN_RE)].map((m) => (m[0].match(/"filename":"([^"]+)"/) || [])[1]);

// 편집기 안 현재 상태를 읽어 초안과 비교. 본문은 그림(자리표시·치환자)과 공백을 빼고 글자만 비교하고, 그림은 파일 이름 목록으로 비교한다.
async function compare(page, draft) {
  const r = await page.evaluate(({ sel, html, tok }) => {
    const re = new RegExp(tok, 'g');
    const txt = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\[\[IMG:[^\]]+\]\]/g, '').replace(re, '').replace(/\s+/g, ''); };
    const content = window.tinymce.get(sel.editor.tinymceId).getContent();
    return {
      title: document.querySelector(sel.title).value,
      category: document.querySelector(sel.category.open).innerText.replace(/\s+/g, ' ').trim(),
      tags: [...document.querySelectorAll(sel.tagItems + ' a:first-child')].map((a) => a.innerText.replace(/^#/, '').trim()),
      bodySame: txt(content) === txt(html), bodyLen: txt(content).length, content,
    };
  }, { sel: SEL, html: draft.html, tok: SEL.attach.token });
  // 그림 순서는 본문에 놓인 자리 순서(그림 목록 순서와 다를 수 있다 — 분석 글의 조감도·평면도)
  const fileOf = Object.fromEntries((draft.images || []).map((i) => [i.key, basename(i.file)]));
  const want = [...draft.html.matchAll(IMG_RE)].map((m) => fileOf[m[1]]).filter(Boolean);
  r.images = fileNames(r.content);
  r.imagesSame = JSON.stringify(r.images) === JSON.stringify(want);
  if (process.env.TISTORY_DUMP) await writeFile(process.env.TISTORY_DUMP, r.content); // 편집기가 태그를 어떻게 바꾸는지 실측용(2026-10-29 <details>)
  delete r.content;
  r.ok = r.title === draft.title && r.category.includes(draft.category) && sameTags(r.tags, draft.tags) && r.bodySame && r.imagesSame;
  return r;
}

async function main() {
  const path = process.argv[2];
  const verifyOnly = process.argv.includes('--verify-only');
  const dryRun = process.argv.includes('--dry-run');
  const si = process.argv.indexOf('--schedule');
  const when = si > 0 ? process.argv[si + 1] : null; // 'YYYY-MM-DD HH:MM' (한국 시각)
  const verifySched = process.argv.includes('--verify-scheduled'); // 예약한 글을 다시 대조만(저장·발행 없음)
  const updateSched = process.argv.includes('--update-scheduled'); // 이미 예약된 같은 제목 글의 본문·그림을 바꿔 같은 시각으로 다시 예약
  // 이미 공개된 글 고치기(2026-10-23 사용자 결정: 썸네일·대표이미지 같은 고침은 늘 허용). --schedule 에 원래 공개 시각. 공개 시각은 바꾸지 않는다
  const updatePub = process.argv.includes('--update-published');
  const pi = process.argv.indexOf('--post'); // 고치기: 제목이 바뀌는 글은 글 번호로 찾는다(예: --post 4)
  const postId = pi > 0 ? process.argv[pi + 1] : null;
  const updating = updateSched || updatePub;
  if (updating && !when) { log('--update-scheduled·--update-published 는 --schedule "시각"과 함께'); return 4; }
  if (updatePub && (!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(when) || new Date(when.replace(' ', 'T') + ':00') > Date.now())) { log('--update-published 의 시각은 원래 공개 시각(지난 시각)'); return 4; }
  if (when && !verifySched && !updatePub && (!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(when) || new Date(when.replace(' ', 'T') + ':00') - Date.now() < (updateSched ? 12 : 15) * 60 * 1000)) { log('예약 시각은 "YYYY-MM-DD HH:MM", 지금부터 15분 넘게 뒤여야 합니다.'); return 4; }
  if (when && !verifySched && !process.argv.includes('--approved')) { log('예약발행은 채팅 승인을 받은 글만 — --approved 필요'); return 4; }
  if (!path || (!verifyOnly && !verifySched && !dryRun && !process.argv.includes('--approved'))) {
    log('사용: node tistory/draft.mjs drafts/<월요일>_weekly.json --approved  (채팅에서 사용자 승인을 받은 초안만)');
    log('      --dry-run (저장 없이 업로드·조립까지) · --verify-only (저장 없이 대조만)');
    return 4;
  }
  const draft = JSON.parse(await readFile(path, 'utf8'));
  // 분양분석 글(type: analysis)은 facts·notes로 검수, 주간 글은 수집본 사본으로 검수
  const issues = draft.type === 'guide' ? await checkGuide(draft) : draft.type === 'analysis' ? (draft.facts?.notice ? checkNotice(draft) : checkAnalysis(draft)) : checkDraft(draft, JSON.parse(await readFile(path.replace(/\.json$/, '.data.json'), 'utf8')));
  // 말머리 금지. 단 분양분석 글의 지역 꼬리표([판교]·[인천 청라] — 주소에서 뽑은 검색어, 2026-10-26 사용자 지시)는 허용
  const areaTag = draft.type === 'analysis' && draft.facts?.item ? `[${areaOf(draft.facts.item)}] ` : null;
  if (draft.title.startsWith('[') && !(areaTag && draft.title.startsWith(areaTag))) issues.push('제목 앞 [말머리] 금지 — 검색어를 제목 맨 앞에');
  if (issues.length) { issues.forEach((i) => log('✗ ' + i)); log('검수 실패 — 저장하지 않습니다.'); return 4; }
  for (const im of draft.images || []) await readFile(join(ROOT, im.file)).catch(() => { throw new Error(`그림 파일 없음: ${im.file} (posts/images.mjs 먼저)`); });
  if (!verifyOnly && !verifySched && !dryRun) {
    if (kstDay() < REST_UNTIL) { log(`티스토리 저장은 ${REST_UNTIL}부터(쉬는 중) — 다음에 다시`); return 5; }
    const u = await usage();
    if (u.saves >= DAY_MAX) { log(`오늘 티스토리 저장 ${u.saves}번 — 하루 ${DAY_MAX}번까지라 내일 다시`); return 5; }
    const wait = u.last ? Date.parse(u.last) + GAP_MIN * 60e3 - Date.now() : 0;
    if (wait > 0) { log(`저장 사이 ${GAP_MIN}분 — ${Math.ceil(wait / 60e3)}분 기다림`); await new Promise((r) => setTimeout(r, wait)); }
    if (when && !updatePub && new Date(when.replace(' ', 'T') + ':00') - Date.now() < (updateSched ? 12 : 15) * 60e3) { log(`기다리는 사이 예약 시각(${when})이 15분 안으로 다가옴 — 시각을 다시 골라 주세요`); return 4; }
  }

  // TISTORY_HEADED=1: 브라우저를 화면에 띄워 실행 — 보안 확인(reCAPTCHA)이 뜨면 사람이 그 창에서 직접 풀 수 있게 기다린다
  const headed = process.env.TISTORY_HEADED === '1';
  const { context, page } = await launch({ headless: !headed });
  const report = { draft: path, title: draft.title, mode: updatePub ? 'update-published' : updateSched ? 'update-scheduled' : verifySched ? 'verify-scheduled' : verifyOnly ? 'verify-only' : dryRun ? 'dry-run' : when ? 'schedule' : 'save', when, at: new Date().toISOString(), steps: [] };
  const guard = { ...SEL.publishGuard, schedule: !!when && !verifySched && !updatePub, republish: updatePub }; // 시험 실행은 POST를 막으므로 레이어를 열어 예약 칸까지 채워 봐도 저장·발행이 안 된다
  const step = (s, ok = true, extra) => { report.steps.push({ s, ok, ...extra }); log((ok ? '✓ ' : '✗ ') + s + (extra ? ' ' + JSON.stringify(extra) : '')); };
  const shot = async (name) => { const p = path.replace(/\.json$/, `.${name}.png`); await page.screenshot({ path: p, fullPage: true }); return p; };
  const countOf = async () => { const a = await page.getAttribute(SEL.draft.count, 'aria-label').catch(() => null); return a ? +(a.match(/\d+/) || [NaN])[0] : NaN; };
  const dialogs = [];
  let acceptDialogs = false, leaving = false;
  const go = async (url, opts) => { leaving = true; try { return await page.goto(url, opts); } finally { leaving = false; } }; // 평소엔 확인창을 수락하지 않음("이어서 작성?" 등). 저장본 불러오기 단계에서만 수락
  const openEditor = async () => {
    await page.goto(NEWPOST, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(GUARD, guard);
    await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, SEL.editor.tinymceId, { timeout: 30000 });
    await page.waitForSelector(SEL.draft.count, { timeout: 10000 }).catch(() => {});
  };
  const editorHtml = () => page.evaluate((id) => window.tinymce.get(id).getContent(), SEL.editor.tinymceId);
  try {
    const login = await ensureLogin(page, context); // 세션이 끊겼으면 카카오 로그인으로 다시(비밀번호가 필요하면 멈춤)
    if (!login.ok) { log('로그인 필요 — ' + login.reason); return 3; }
    report.login = login.how;
    // 페이지 떠나기 확인(beforeunload)은 이 스크립트가 직접 다른 쪽으로 옮길 때(leaving)만 수락 — 새 글 화면에 남은 작성 중 내용 때문에
    // 목록 이동이 막힌 일이 있었다(2026-10-24). 저장 버튼 뒤에는 수락하면 저장이 끝나기 전에 넘어가 버리므로 예전처럼 취소. 서버의 임시저장 글은 지워지지 않는다
    page.on('dialog', async (d) => { dialogs.push(d.message()); await (acceptDialogs || (leaving && d.type() === 'beforeunload') ? d.accept() : d.dismiss()).catch(() => {}); });
    if (dryRun) {
      // 시험 실행: 그림 업로드만 통과시키고 다른 POST(자동 임시저장 등)는 막는다
      await page.route('**/*', (route) => (route.request().method() === 'POST' && !route.request().url().includes(SEL.attach.upload) ? route.abort() : route.continue()));
    }
    await page.addInitScript(GUARD, guard);
    // 대조·고치기는 새 글 화면을 거치지 않는다(편집 화면 들어가는 횟수 줄이기, 2026-10-30) — 가드는 addInitScript로 모든 화면에 걸린다
    if (!verifySched && !updating) {
      await openEditor();
      report.countAtStart = await countOf();
      step('글쓰기 화면·발행 가드', true, { 임시저장_개수: report.countAtStart, ...(dryRun ? { 시험: '저장 요청 차단' } : {}) });
    }

    // 예약 검증: 관리 > 글 목록(여러 쪽, 발행 시각 순)에서 같은 제목 맨 위 글의 주소·시각 → 그 글 수정 화면을 열어 전문 대조
    const findRow = async () => {
      for (let n = 1; n <= 15; n++) {
        await go(`${BLOG}/manage/posts/?page=${n}`, { waitUntil: 'networkidle' });
        const r = page.locator('li', { has: page.locator(postId ? `a.link_cont[href$="/${postId}"]` : `a.link_cont[title="${draft.title.replace(/"/g, '\\"')}"]`) }).first();
        if (await r.count()) return r.evaluate((li) => ({ url: li.querySelector('a.link_cont').href, edit: li.querySelector('a.btn_post').getAttribute('href'), text: li.innerText.replace(/\s+/g, ' ') }));
        if (!(await page.locator('a.link_cont').count())) break; // 빈 쪽 = 끝
      }
      return null;
    };
    const verifyScheduled = async () => {
      const info = await findRow();
      if (!info) { step('글 목록에 제목', false); report.shot = await shot('posts'); return 2; }
      const timeOk = info.text.includes(when);
      step('예약 목록', timeOk, { 주소: info.url, 시각: when });
      report.url = info.url;
      let saved;
      if (new Date(when.replace(' ', 'T') + ':00') < Date.now()) {
        // 공개된 글은 편집 화면 대신 공개 페이지로 대조(2026-10-30 — 편집 화면 진입 줄이기). 본문 글자와 그림 수·제목. 티스토리가 덧붙이는 광고·공유 버튼·같은 카테고리 글 칸은 뺀다(10-30 실측 5편 일치)
        await go(info.url, { waitUntil: 'domcontentloaded' });
        saved = await page.evaluate(({ html, tok }) => {
          const re = new RegExp(tok, 'g');
          const txt = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\[\[IMG:[^\]]+\]\]/g, '').replace(re, '').replace(/\s+/g, ''); };
          const body = document.querySelector('.tt_article_useless_p_margin');
          if (!body) return { ok: false, 없음: '본문 칸(.tt_article_useless_p_margin)' };
          body.querySelectorAll('script,style,ins,noscript,.another_category,.container_postbtn,[data-tistory-react-app]').forEach((e) => e.remove());
          return { title: document.querySelector('meta[property="og:title"]')?.content, bodySame: txt(body.innerHTML) === txt(html), bodyLen: txt(body.innerHTML).length, images: { length: body.querySelectorAll('img').length } };
        }, { html: draft.html, tok: SEL.attach.token });
        saved.ok = saved.ok !== false && saved.title === draft.title && saved.bodySame && saved.images.length === (draft.images || []).length;
      } else {
        await go(BLOG + info.edit.split('?')[0], { waitUntil: 'domcontentloaded' });
        await page.waitForFunction((id) => window.tinymce?.get(id)?.initialized, SEL.editor.tinymceId, { timeout: 30000 });
        await page.waitForTimeout(1500);
        saved = await compare(page, draft);
      }
      report.loadedShot = await shot('loaded');
      step('예약 글 불러와 전문 대조', saved.ok, saved.ok ? { 본문_글자수: saved.bodyLen, 그림: saved.images.length } : saved);
      report.ok = timeOk && saved.ok;
      if (report.ok && updating) {
        // 고치기 뒤 블로그 목록 썸네일이 빈칸으로 남는 경우가 가끔 있었다(2026-10-23) → 카테고리 목록에서 확인, 비면 다시 돌린다
        const id = info.url.split('/').pop();
        let src = null;
        const lp = await context.newPage(); // 편집 화면은 떠날 때 막히므로 새 탭에서
        for (let n = 1; n <= 6 && src === null; n++) {
          await lp.goto(`${BLOG}/category/${encodeURIComponent(draft.category)}?page=${n}`, { waitUntil: 'networkidle' });
          const r = await lp.evaluate((id) => { const a = document.querySelector(`a.card[href="/${id}"]`); return a ? (a.querySelector('img')?.getAttribute('src') || '') : null; }, id);
          if (r !== null) src = r;
          else if (!(await lp.locator('a.card').count())) break;
        }
        await lp.close();
        step('목록 썸네일', !!src, { 상태: src ? '있음' : src === '' ? '빈칸 — 같은 명령을 다시 돌리세요' : '목록에서 못 찾음' });
        report.ok = !!src;
      }
      if (report.ok) await recordScheduled(draft.title, info.url, when);
      return report.ok ? 0 : 2;
    };
    if (verifySched) return await verifyScheduled();
    if (updating) {
      // 고치기: 글 목록에서 같은 제목·같은 시각 글을 찾아 그 수정 화면을 연다(예약 글 고치기는 [예약]인 글만, 공개 글 고치기는 공개된 글만)
      const info = await findRow();
      const ok = !!info && info.text.includes(when) && (updatePub ? !info.text.includes('[예약]') : info.text.includes('[예약]'));
      step(updatePub ? '고칠 공개 글' : '고칠 예약 글', ok, info ? { 주소: info.url, 시각: when } : { 없음: draft.title });
      if (!ok) { report.shot = await shot('posts'); return 2; }
      await go(BLOG + info.edit.split('?')[0], { waitUntil: 'domcontentloaded' });
      await page.evaluate(GUARD, guard);
      await page.waitForFunction((id) => window.tinymce?.get(id)?.initialized, SEL.editor.tinymceId, { timeout: 30000 });
      await page.waitForTimeout(1500);
      // 대표이미지는 처음 예약 때 그림이 따로 남는다(2026-10-23 실측). 발행 레이어에서 먼저 지워 두면, 본문에 처음 올리는 그림이 새 대표가 된다
      await page.click(SEL.publish.open);
      await page.waitForSelector('.box_thumb', { timeout: 10000 });
      await page.click('.box_thumb .ico_delete').catch(() => {});
      await page.waitForTimeout(500);
      await page.click('#unpublish-btn');
      await page.waitForTimeout(500);
      await page.evaluate((id) => window.tinymce.get(id).setContent(''), SEL.editor.tinymceId); // 예전 그림·본문 비우고 새로 넣는다
    }

    if (!verifyOnly) {
      await page.fill(SEL.title, draft.title);
      step('제목', (await page.inputValue(SEL.title)) === draft.title);

      await page.click(SEL.category.open);
      await page.click('#' + SEL.category.ids[draft.category]);
      await page.waitForTimeout(300);
      const cat = norm(await page.innerText(SEL.category.open));
      step('카테고리', cat.includes(draft.category), { 표시: cat });

      // 그림: 한 장씩 첨부 → 본문에 들어온 치환자를 파일 이름으로 모은다
      let html = draft.html;
      if (draft.images?.length) {
        for (const im of draft.images) {
          const before = fileNames(await editorHtml()).length;
          await page.click(SEL.attach.open);
          const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), page.click(SEL.attach.image)]);
          await chooser.setFiles(join(ROOT, im.file));
          // 업로드 중에는 편집기가 getContent를 막고 "이미지 업로드가 완료된 후 시도해 주세요"를 던진다 → 그동안은 '아직'으로 본다
          await page.waitForFunction(({ id, tok, n }) => {
            try { return (window.tinymce.get(id).getContent().match(new RegExp(tok, 'g')) || []).length > n; } catch { return false; }
          }, { id: SEL.editor.tinymceId, tok: SEL.attach.token, n: before }, { timeout: 60000, polling: 500 });
          await page.waitForTimeout(500);
        }
        const tokens = Object.fromEntries([...(await editorHtml()).matchAll(TOKEN_RE)].map((m) => [(m[0].match(/"filename":"([^"]+)"/) || [])[1], m[0]]));
        const byKey = Object.fromEntries(draft.images.map((i) => [i.key, tokens[basename(i.file)]]));
        const missing = draft.images.filter((i) => !byKey[i.key]).map((i) => i.key);
        step('그림 업로드', !missing.length, missing.length ? { 빠짐: missing } : { 장수: draft.images.length });
        if (missing.length) { report.shot = await shot('error'); return 1; }
        html = draft.html.replace(IMG_RE, (m, k) => `<p>${byKey[k]}</p>`);
        if (updating) await page.waitForTimeout(8000); // 고치기: 대표이미지 처리가 끝나기 전에 저장하면 목록 썸네일이 비는 경우가 있었다(2026-10-23)
      }

      await page.evaluate(({ id, html }) => { const ed = window.tinymce.get(id); ed.setContent(html); ed.fire('change'); ed.save && ed.save(); }, { id: SEL.editor.tinymceId, html });
      for (const t of updating ? [] : draft.tags) { // 고치기: 태그는 이미 있다
        if (!(await page.$(SEL.tags))) break; // 10개를 채우면 입력칸이 사라진다
        await page.click(SEL.tags);
        await page.type(SEL.tags, t);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
      }
      const typed = await compare(page, draft);
      step('입력값 대조(저장 전)', typed.ok, typed.ok ? { 본문_글자수: typed.bodyLen, 그림: typed.images.length } : typed);
      if (!typed.ok) { report.shot = await shot('error'); return 1; }

      if (updatePub) {
        // 공개 글 고치기: 발행일은 원래 시각 그대로(가드도 이때만 통과), 공개 상태·새 대표이미지 확인
        await page.click(SEL.publish.open);
        await page.waitForSelector(SEL.publish.publicRadio, { state: 'attached', timeout: 10000 });
        await page.waitForTimeout(500);
        const set = await page.evaluate((P) => ({ public: document.querySelector(P.publicRadio).checked, date: document.querySelector(P.dateBtn + '.on')?.innerText.trim() }), SEL.publish);
        set.rep = await page.evaluate(() => (document.querySelector('.box_thumb .thumb_g')?.getAttribute('style') || '').match(/fname=([^&"]+)/)?.[1]?.slice(-40) || '없음');
        const setOk = set.public && set.date === when && set.rep !== '없음';
        step('공개 글 수정 설정', setOk, set);
        if (!setOk) { report.shot = await shot('error'); return 1; }
      } else if (when) {
        // 예약발행: 발행 레이어 → 공개 → 발행일 '예약' → 달력에서 날짜 → 시·분 → 화면 값 확인
        const P = SEL.publish;
        const [d, hm] = when.split(' ');
        const [y, mo, day] = d.split('-').map(Number);
        const [h, mi] = hm.split(':');
        await page.click(P.open);
        await page.waitForSelector(P.publicRadio, { state: 'attached', timeout: 10000 });
        await page.click(P.public);
        await page.locator(P.dateBtn, { hasText: '예약' }).click();
        await page.click(P.reserveDate);
        for (let i = 0; i < 13 && norm(await page.innerText(P.month)) !== `${y}년 ${mo}월`; i++) { await page.click(P.next); await page.waitForTimeout(200); }
        await page.locator(`${P.day}:not([disabled])`, { hasText: new RegExp(`^${day}$`) }).click();
        await page.fill(P.hour, String(+h));
        await page.fill(P.minute, String(+mi));
        await page.waitForTimeout(300);
        const set = await page.evaluate((P) => ({
          public: document.querySelector(P.publicRadio).checked,
          mode: document.querySelector(P.dateBtn + '.on')?.innerText.trim(),
          date: document.querySelector(P.reserveDate)?.innerText.trim(),
          hm: [P.hour, P.minute].map((s) => String(document.querySelector(s).value).padStart(2, '0')).join(':'),
          url: document.querySelector(P.url)?.value,
        }), P);
        set.rep = await page.evaluate(() => (document.querySelector('.box_thumb .thumb_g')?.getAttribute('style') || '').match(/fname=([^&"]+)/)?.[1]?.slice(-40) || '없음');
        const setOk = set.public && set.mode === '예약' && set.date === d && set.hm === hm && set.rep !== '없음';
        step('예약 설정', setOk, set);
        if (!setOk) { report.shot = await shot('error'); return 1; }
        report.urlSlug = set.url;
      }
      if (dryRun) {
        report.shot = await shot('dryrun');
        step('시험 실행 끝 — 저장하지 않음', true);
        report.ok = true;
        return 0;
      }
      if (when) {
        await markSave();
        await page.click(SEL.publish.submit);
        // 저장이 끝나 편집 화면을 벗어날 때까지 기다린다(그림이 크면 「저장중」이 길다), 최대 90초.
        // 그 사이 Google reCAPTCHA(보안 확인)가 뜨면 멈춘다 — 대신 풀거나 넘기지 않는다(2026-10-24 실측: 짧은 시간에 수정·예약이 많으면 뜬다)
        // 화면 없이 돌 때는 20초가 지나도 「저장중」이면 보안 확인으로 본다(팝업이 빈 창이라 따로 알아보기 어렵다 — 2026-10-24 실측)
        let captcha = false;
        const limit = headed ? 300 : 90; // 화면에 띄웠으면 사람이 풀 시간 5분
        for (let i = 0; i < limit / 2; i++) {
          if (!/\/manage\/(newpost|post)\//.test(page.url())) { captcha = false; break; }
          const saving = await page.evaluate(() => (document.querySelector('#publish-btn')?.innerText || '').includes('저장중')).catch(() => false);
          captcha = saving && i * 2 >= 20;
          if (captcha && !headed) break;
          if (captcha && headed && i * 2 === 20) log('※ 보안 확인이 뜬 것 같아요 — 화면의 티스토리 창에서 직접 풀어 주세요(5분 기다림)');
          await page.waitForTimeout(2000);
        }
        if (captcha) { report.shot = await shot('captcha'); step('티스토리 보안 확인(reCAPTCHA) — 자동으로 풀지 않음. TISTORY_HEADED=1로 화면에 띄워 사람이 풀거나 시간이 지난 뒤 다시', false); return 6; }
        await page.waitForTimeout(1500);
        const msg = await page.evaluate(() => [...document.querySelectorAll('.toast, [class*="toast"], [class*="alert"], [role="alert"], .layer_msg, .txt_error')].map((e) => e.innerText.trim()).filter(Boolean).join(' / '));
        if (dialogs.length || msg) step('발행 버튼 뒤 안내', true, { 확인창: dialogs, 화면: msg });
        // 2026-10-23엔 「최대 50개」, 2026-10-27엔 「최대 5개」 — 숫자는 바뀌니 문구로
        const cap = dialogs.find((m) => /하루에 작성할 수 있는 글은 최대\s*\d+\s*개/.test(m));
        if (cap) { step(`티스토리 하루 글 한도(${cap.match(/최대\s*(\d+)/)[1]}개) — 내일 다시`, false); return 5; }
        report.shot = await shot('scheduled');
        // --no-verify: 저장 뒤 대조를 건너뛴다 — 여러 편을 고칠 때 다 고친 뒤 --verify-scheduled로 한꺼번에(2026-10-29 사용자 지시)
        if (process.argv.includes('--no-verify')) { step('저장 뒤 대조는 나중에 한꺼번에(--no-verify)', true); report.ok = true; return 0; }
        return await verifyScheduled();
      }
      await markSave();
      await page.click(SEL.draft.save);
      await page.waitForTimeout(3000);
      report.shot = await shot('saved');
      step('임시저장 누름', true, { 개수: `${report.countAtStart} → ${await countOf()}`, 확인창: dialogs });
      await openEditor(); // 빈 편집기에서 저장본을 다시 불러와 확인한다
    }

    // 검증: 임시저장 목록에서 같은 제목의 가장 위 글을 불러와 제목·카테고리·태그·본문·그림 대조
    await page.click(SEL.draft.count);
    await page.waitForTimeout(1200);
    const item = page.getByText(draft.title, { exact: true }).first();
    if (!(await item.count())) { report.shot = await shot('draftlist'); step('임시저장 목록에 제목', false); return 2; }
    const n = await page.getByText(draft.title, { exact: true }).count();
    acceptDialogs = true;
    await item.click();
    await page.waitForTimeout(3000);
    acceptDialogs = false;
    const saved = await compare(page, draft);
    report.loadedShot = await shot('loaded');
    step('저장본 불러와 전문 대조', saved.ok, saved.ok ? { 본문_글자수: saved.bodyLen, 그림: saved.images.length, 같은_제목_저장본: n } : saved);
    if (n > 1) log(`※ 임시저장 목록에 같은 제목이 ${n}건 있습니다. 오래된 것은 티스토리에서 직접 지워 주세요(자동 삭제 안 함).`);
    report.ok = saved.ok;
    return saved.ok ? 0 : 2;
  } catch (e) {
    step('오류', false, { message: e.message.split('\n')[0] });
    try { report.shot = await shot('error'); } catch { /* 무시 */ }
    return 1;
  } finally {
    await writeFile(path.replace(/\.json$/, '.save.json'), JSON.stringify(report, null, 2));
    await context.close();
  }
}

process.exitCode = await main();

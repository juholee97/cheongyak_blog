// 승인된 주간 초안을 티스토리에 "임시저장"한다. 발행하지 않는다.
// node tistory/draft.mjs drafts/2026-10-26_weekly.json --approved      그림 업로드 → 입력 → 임시저장 → 저장본을 다시 불러와 전문 대조
// node tistory/draft.mjs drafts/2026-10-26_weekly.json --dry-run       저장 없이 업로드·조립·입력·대조까지 (업로드 외 POST를 막아 자동 임시저장도 안 생김)
// node tistory/draft.mjs drafts/2026-10-26_weekly.json --verify-only   저장 없이, 임시저장 목록의 같은 제목 글을 불러와 대조만
// 종료 코드: 0 통과, 1 오류, 2 저장본 불일치·목록에 없음, 3 로그인 필요, 4 검수 실패·승인 없음
// 주의(2026-10-22 실측): 편집기가 입력 도중 자동 임시저장을 하므로 "개수 +1"로 저장을 판정하지 않는다 → 저장본을 다시 열어 확인한다.
import { readFile, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { launch, ensureLogin, NEWPOST, ROOT, BLOG, GUARD } from './common.mjs';
import { checkDraft } from '../posts/check.mjs';
import { checkAnalysis } from '../posts/analysis_post.mjs';
import { checkGuide } from '../posts/guide.mjs';
import { IMG_RE } from '../posts/weekly.mjs';

const SEL = JSON.parse(await readFile(join(ROOT, 'tistory', 'selectors.json'), 'utf8'));
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
  const want = (draft.images || []).map((i) => basename(i.file));
  r.images = fileNames(r.content);
  r.imagesSame = JSON.stringify(r.images) === JSON.stringify(want);
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
  if (updateSched && !when) { log('--update-scheduled 는 --schedule "예약 시각"과 함께'); return 4; }
  if (when && !verifySched && (!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(when) || new Date(when.replace(' ', 'T') + ':00') - Date.now() < (updateSched ? 12 : 15) * 60 * 1000)) { log('예약 시각은 "YYYY-MM-DD HH:MM", 지금부터 15분 넘게 뒤여야 합니다.'); return 4; }
  if (when && !verifySched && !process.argv.includes('--approved')) { log('예약발행은 채팅 승인을 받은 글만 — --approved 필요'); return 4; }
  if (!path || (!verifyOnly && !verifySched && !dryRun && !process.argv.includes('--approved'))) {
    log('사용: node tistory/draft.mjs drafts/<월요일>_weekly.json --approved  (채팅에서 사용자 승인을 받은 초안만)');
    log('      --dry-run (저장 없이 업로드·조립까지) · --verify-only (저장 없이 대조만)');
    return 4;
  }
  const draft = JSON.parse(await readFile(path, 'utf8'));
  // 분양분석 글(type: analysis)은 facts·notes로 검수, 주간 글은 수집본 사본으로 검수
  const issues = draft.type === 'guide' ? await checkGuide(draft) : draft.type === 'analysis' ? checkAnalysis(draft) : checkDraft(draft, JSON.parse(await readFile(path.replace(/\.json$/, '.data.json'), 'utf8')));
  if (draft.title.startsWith('[')) issues.push('제목 앞 [말머리] 금지 — 검색어를 제목 맨 앞에');
  if (issues.length) { issues.forEach((i) => log('✗ ' + i)); log('검수 실패 — 저장하지 않습니다.'); return 4; }
  for (const im of draft.images || []) await readFile(join(ROOT, im.file)).catch(() => { throw new Error(`그림 파일 없음: ${im.file} (posts/images.mjs 먼저)`); });

  const { context, page } = await launch({ headless: true });
  const report = { draft: path, title: draft.title, mode: updateSched ? 'update-scheduled' : verifySched ? 'verify-scheduled' : verifyOnly ? 'verify-only' : dryRun ? 'dry-run' : when ? 'schedule' : 'save', when, at: new Date().toISOString(), steps: [] };
  const guard = { ...SEL.publishGuard, schedule: !!when && !verifySched }; // 시험 실행은 POST를 막으므로 레이어를 열어 예약 칸까지 채워 봐도 저장·발행이 안 된다
  const step = (s, ok = true, extra) => { report.steps.push({ s, ok, ...extra }); log((ok ? '✓ ' : '✗ ') + s + (extra ? ' ' + JSON.stringify(extra) : '')); };
  const shot = async (name) => { const p = path.replace(/\.json$/, `.${name}.png`); await page.screenshot({ path: p, fullPage: true }); return p; };
  const countOf = async () => { const a = await page.getAttribute(SEL.draft.count, 'aria-label').catch(() => null); return a ? +(a.match(/\d+/) || [NaN])[0] : NaN; };
  const dialogs = [];
  let acceptDialogs = false; // 평소엔 확인창을 수락하지 않음("이어서 작성?" 등). 저장본 불러오기 단계에서만 수락
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
    page.on('dialog', async (d) => { dialogs.push(d.message()); await (acceptDialogs ? d.accept() : d.dismiss()).catch(() => {}); });
    if (dryRun) {
      // 시험 실행: 그림 업로드만 통과시키고 다른 POST(자동 임시저장 등)는 막는다
      await page.route('**/*', (route) => (route.request().method() === 'POST' && !route.request().url().includes(SEL.attach.upload) ? route.abort() : route.continue()));
    }
    await page.addInitScript(GUARD, guard);
    await openEditor();
    report.countAtStart = await countOf();
    step('글쓰기 화면·발행 가드', true, { 임시저장_개수: report.countAtStart, ...(dryRun ? { 시험: '저장 요청 차단' } : {}) });

    // 예약 검증: 관리 > 글 목록(여러 쪽, 발행 시각 순)에서 같은 제목 맨 위 글의 주소·시각 → 그 글 수정 화면을 열어 전문 대조
    const findRow = async () => {
      for (let n = 1; n <= 15; n++) {
        await page.goto(`${BLOG}/manage/posts/?page=${n}`, { waitUntil: 'networkidle' });
        const r = page.locator('li', { has: page.locator(`a.link_cont[title="${draft.title.replace(/"/g, '\\"')}"]`) }).first();
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
      await page.goto(BLOG + info.edit.split('?')[0], { waitUntil: 'domcontentloaded' });
      await page.waitForFunction((id) => window.tinymce?.get(id)?.initialized, SEL.editor.tinymceId, { timeout: 30000 });
      await page.waitForTimeout(1500);
      const saved = await compare(page, draft);
      report.loadedShot = await shot('loaded');
      step('예약 글 불러와 전문 대조', saved.ok, saved.ok ? { 본문_글자수: saved.bodyLen, 그림: saved.images.length } : saved);
      report.ok = timeOk && saved.ok;
      if (report.ok) await recordScheduled(draft.title, info.url, when);
      return report.ok ? 0 : 2;
    };
    if (verifySched) return await verifyScheduled();
    if (updateSched) {
      // 고치기: 예약 목록에서 같은 제목·같은 시각 글을 찾아 그 수정 화면을 연다(공개된 글은 고치지 않는다)
      const info = await findRow();
      const ok = !!info && info.text.includes(when) && info.text.includes('[예약]');
      step('고칠 예약 글', ok, info ? { 주소: info.url, 시각: when } : { 없음: draft.title });
      if (!ok) { report.shot = await shot('posts'); return 2; }
      await page.goto(BLOG + info.edit.split('?')[0], { waitUntil: 'domcontentloaded' });
      await page.evaluate(GUARD, guard);
      await page.waitForFunction((id) => window.tinymce?.get(id)?.initialized, SEL.editor.tinymceId, { timeout: 30000 });
      await page.waitForTimeout(1500);
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
      }

      await page.evaluate(({ id, html }) => { const ed = window.tinymce.get(id); ed.setContent(html); ed.fire('change'); ed.save && ed.save(); }, { id: SEL.editor.tinymceId, html });
      for (const t of updateSched ? [] : draft.tags) { // 고치기: 태그는 이미 있다
        if (!(await page.$(SEL.tags))) break; // 10개를 채우면 입력칸이 사라진다
        await page.click(SEL.tags);
        await page.type(SEL.tags, t);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
      }
      const typed = await compare(page, draft);
      step('입력값 대조(저장 전)', typed.ok, typed.ok ? { 본문_글자수: typed.bodyLen, 그림: typed.images.length } : typed);
      if (!typed.ok) { report.shot = await shot('error'); return 1; }

      if (when) {
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
        const setOk = set.public && set.mode === '예약' && set.date === d && set.hm === hm;
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
        await page.click(SEL.publish.submit);
        await page.waitForTimeout(5000);
        report.shot = await shot('scheduled');
        return await verifyScheduled();
      }
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

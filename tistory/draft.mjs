// 승인된 주간 초안을 티스토리에 "임시저장"한다. 발행하지 않는다.
// node tistory/draft.mjs drafts/2026-10-26_weekly.json --approved      입력 → 임시저장 → 저장본을 다시 불러와 전문 대조
// node tistory/draft.mjs drafts/2026-10-26_weekly.json --verify-only   저장 없이, 임시저장 목록의 같은 제목 글을 불러와 대조만
// 종료 코드: 0 통과, 1 오류, 2 저장본 불일치·목록에 없음, 3 로그인 필요, 4 검수 실패·승인 없음
// 주의(2026-10-22 실측): 편집기가 입력 도중 자동 임시저장을 하므로 "개수 +1"로 저장을 판정하지 않는다 → 저장본을 다시 열어 확인한다.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, isLoggedIn, NEWPOST, ROOT } from './common.mjs';
import { checkDraft } from '../posts/check.mjs';

const SEL = JSON.parse(await readFile(join(ROOT, 'tistory', 'selectors.json'), 'utf8'));

// 발행 가드: 임시저장 흐름은 '완료'를 누를 일이 없다. 완료 버튼과 '발행' 글자가 든 버튼 클릭을 캡처 단계에서 막는다. 절대 제거하지 않는다.
function GUARD({ block, blockText }) {
  if (window.__cheongyakGuard) return;
  window.__cheongyakGuard = true;
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest && e.target.closest('button, a, [role="button"]');
    if (!t) return;
    if (block.some((s) => t.matches(s)) || (t.innerText || '').includes(blockText)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      console.warn('[PUBLISH GUARD] 발행 차단');
    }
  }, true);
}

const log = (...a) => console.log(...a);
const norm = (s) => s.replace(/\s+/g, ' ').trim();

// 편집기 안 현재 상태(제목·카테고리·태그·본문)를 읽어 초안과 비교. 편집기가 표 칸 사이에 줄바꿈을 넣으므로 본문은 공백을 빼고 글자만 비교한다.
async function compare(page, draft) {
  const r = await page.evaluate(({ sel, html }) => {
    const txt = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ''); };
    const body = txt(window.tinymce.get(sel.editor.tinymceId).getContent());
    return {
      title: document.querySelector(sel.title).value,
      category: document.querySelector(sel.category.open).innerText.replace(/\s+/g, ' ').trim(),
      tags: [...document.querySelectorAll(sel.tagItems + ' a:first-child')].map((a) => a.innerText.replace(/^#/, '').trim()),
      bodySame: body === txt(html), bodyLen: body.length,
    };
  }, { sel: SEL, html: draft.html });
  r.ok = r.title === draft.title && r.category.includes(draft.category) && JSON.stringify(r.tags) === JSON.stringify(draft.tags) && r.bodySame;
  return r;
}

async function main() {
  const path = process.argv[2];
  const verifyOnly = process.argv.includes('--verify-only');
  if (!path || (!verifyOnly && !process.argv.includes('--approved'))) {
    log('사용: node tistory/draft.mjs drafts/<월요일>_weekly.json --approved  (채팅에서 사용자 승인을 받은 초안만)');
    log('      node tistory/draft.mjs drafts/<월요일>_weekly.json --verify-only (저장 없이 대조만)');
    return 4;
  }
  const draft = JSON.parse(await readFile(path, 'utf8'));
  const data = JSON.parse(await readFile(path.replace(/\.json$/, '.data.json'), 'utf8'));
  const issues = checkDraft(draft, data);
  if (issues.length) { issues.forEach((i) => log('✗ ' + i)); log('검수 실패 — 저장하지 않습니다.'); return 4; }

  const { context, page } = await launch({ headless: true });
  const report = { draft: path, title: draft.title, mode: verifyOnly ? 'verify-only' : 'save', at: new Date().toISOString(), steps: [] };
  const step = (s, ok = true, extra) => { report.steps.push({ s, ok, ...extra }); log((ok ? '✓ ' : '✗ ') + s + (extra ? ' ' + JSON.stringify(extra) : '')); };
  const shot = async (name) => { const p = path.replace(/\.json$/, `.${name}.png`); await page.screenshot({ path: p, fullPage: true }); return p; };
  const countOf = async () => { const a = await page.getAttribute(SEL.draft.count, 'aria-label').catch(() => null); return a ? +(a.match(/\d+/) || [NaN])[0] : NaN; };
  const dialogs = [];
  let acceptDialogs = false; // 평소엔 확인창을 수락하지 않음("이어서 작성?" 등). 저장본 불러오기 단계에서만 수락
  const openEditor = async () => {
    await page.goto(NEWPOST, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(GUARD, SEL.publishGuard);
    await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, SEL.editor.tinymceId, { timeout: 30000 });
    await page.waitForSelector(SEL.draft.count, { timeout: 10000 }).catch(() => {});
  };
  try {
    if (!(await isLoggedIn(page))) { log('로그인 필요 — tistory_login.bat을 실행해 직접 로그인하세요.'); return 3; }
    page.on('dialog', async (d) => { dialogs.push(d.message()); await (acceptDialogs ? d.accept() : d.dismiss()).catch(() => {}); });
    await page.addInitScript(GUARD, SEL.publishGuard);
    await openEditor();
    report.countAtStart = await countOf();
    step('글쓰기 화면·발행 가드', true, { 임시저장_개수: report.countAtStart });

    if (!verifyOnly) {
      await page.fill(SEL.title, draft.title);
      step('제목', (await page.inputValue(SEL.title)) === draft.title);

      await page.click(SEL.category.open);
      await page.click('#' + SEL.category.ids[draft.category]);
      await page.waitForTimeout(300);
      const cat = norm(await page.innerText(SEL.category.open));
      step('카테고리', cat.includes(draft.category), { 표시: cat });

      await page.evaluate(({ id, html }) => { const ed = window.tinymce.get(id); ed.setContent(html); ed.fire('change'); ed.save && ed.save(); }, { id: SEL.editor.tinymceId, html: draft.html });
      for (const t of draft.tags) {
        if (!(await page.$(SEL.tags))) break; // 10개를 채우면 입력칸이 사라진다
        await page.click(SEL.tags);
        await page.type(SEL.tags, t);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
      }
      const typed = await compare(page, draft);
      step('입력값 대조(저장 전)', typed.ok, typed.ok ? { 본문_글자수: typed.bodyLen } : typed);
      if (!typed.ok) { report.shot = await shot('error'); return 1; }

      await page.click(SEL.draft.save);
      await page.waitForTimeout(3000);
      report.shot = await shot('saved');
      step('임시저장 누름', true, { 개수: `${report.countAtStart} → ${await countOf()}`, 확인창: dialogs });
      await openEditor(); // 빈 편집기에서 저장본을 다시 불러와 확인한다
    }

    // 검증: 임시저장 목록에서 같은 제목의 가장 위 글을 불러와 제목·카테고리·태그·본문 전문 대조
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
    step('저장본 불러와 전문 대조', saved.ok, saved.ok ? { 본문_글자수: saved.bodyLen, 같은_제목_저장본: n } : saved);
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

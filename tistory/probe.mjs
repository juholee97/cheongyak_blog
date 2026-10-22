// 티스토리 글쓰기 화면 실측 (읽기 전용: 아무것도 누르거나 입력하지 않는다)
// node tistory/probe.mjs  → tistory/probe-out/newpost-<시각>.json + .png
// 버튼·입력칸·iframe·편집 영역과, 모드 전환·임시저장·완료·발행·카테고리·태그 후보를 기록해 draft.mjs 셀렉터의 근거로 쓴다.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, ensureLogin, NEWPOST, ROOT } from './common.mjs';

const KEYWORDS = /기본모드|마크다운|HTML|임시저장|저장|완료|발행|공개|카테고리|태그|제목/;

// 페이지(또는 프레임) 안에서 실행: 보이는 조작 요소를 모은다
function collect(re) {
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const attrs = (el) => {
    const o = {};
    for (const a of el.attributes) if (/^(id|name|class|type|role|placeholder|title|aria-label|data-[\w-]+|contenteditable|href)$/.test(a.name)) o[a.name] = a.value.slice(0, 120);
    return o;
  };
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && parts.length < 5; e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) { s += '#' + e.id; parts.unshift(s); break; }
      const cls = [...e.classList].slice(0, 2).join('.');
      if (cls) s += '.' + cls;
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const pick = (sel) => [...document.querySelectorAll(sel)].filter(visible).map((el) => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 60), attrs: attrs(el), path: path(el), box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
  });
  const keywordHits = [...document.querySelectorAll('button, a, span, div, li, label')].filter((el) => visible(el) && el.children.length <= 2 && new RegExp(re).test((el.innerText || '').trim()) && (el.innerText || '').trim().length <= 20)
    .map((el) => ({ tag: el.tagName.toLowerCase(), text: el.innerText.trim(), attrs: attrs(el), path: path(el) }));
  return {
    url: location.href, title: document.title,
    buttons: pick('button, [role="button"], input[type="button"], input[type="submit"]'),
    inputs: pick('input:not([type="hidden"]), textarea, select'),
    editables: pick('[contenteditable="true"], .CodeMirror, .mce-content-body'),
    iframes: [...document.querySelectorAll('iframe')].map((f) => ({ id: f.id, name: f.name, src: (f.src || '').slice(0, 150), title: f.title })),
    keywordHits,
  };
}

const { context, page } = await launch({ headless: true });
try {
  if (!(await ensureLogin(page, context)).ok) {
    console.log('로그인 필요 — tistory_login.bat을 실행해 직접 로그인한 뒤 다시 실행하세요.');
    process.exitCode = 3;
  } else {
  const dialogs = [];
  // "이어서 작성하시겠습니까?" 같은 확인창은 기록만 하고 닫는다(수락하지 않음)
  page.on('dialog', async (d) => { dialogs.push({ type: d.type(), message: d.message() }); await d.dismiss().catch(() => {}); });
  await page.goto(NEWPOST, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // --menus: 발행 가드를 건 뒤 카테고리·편집 모드 드롭다운만 열어 항목을 읽고 Esc로 닫는다(입력·저장 없음)
  let menus = null;
  if (process.argv.includes('--menus')) {
    await page.evaluate(() => document.addEventListener('click', (e) => {
      const t = e.target.closest && e.target.closest('#publish-layer-btn, button, a');
      if (t && (t.id === 'publish-layer-btn' || /발행/.test(t.innerText || ''))) { e.preventDefault(); e.stopImmediatePropagation(); console.warn('[PUBLISH GUARD] 차단'); }
    }, true));
    const readOpen = () => page.evaluate(() => [...document.querySelectorAll('[role="option"], [role="menuitem"], .mce-menu-item, li')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((el) => ({ text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), id: el.id, cls: el.className.toString().slice(0, 80), role: el.getAttribute('role') }))
      .filter((o) => o.text));
    menus = { tinymce: await page.evaluate(() => typeof window.tinymce === 'object' ? { editors: (window.tinymce.editors || []).map((e) => e.id), active: window.tinymce.activeEditor && window.tinymce.activeEditor.id } : null) };
    const before = new Set((await readOpen()).map((o) => o.text + o.id));
    await page.click('#category-btn');
    await page.waitForTimeout(800);
    menus.category = (await readOpen()).filter((o) => !before.has(o.text + o.id));
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 500);
    await page.waitForTimeout(400);
    await page.click('#editor-mode-layer-btn-open');
    await page.waitForTimeout(800);
    menus.mode = (await readOpen()).filter((o) => !before.has(o.text + o.id));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  const frames = [];
  for (const f of page.frames()) {
    try { frames.push({ frameUrl: f.url(), ...(await f.evaluate(collect, KEYWORDS.source)) }); } catch (e) { frames.push({ frameUrl: f.url(), error: e.message }); }
  }
  const out = join(ROOT, 'tistory', 'probe-out');
  await mkdir(out, { recursive: true });
  const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const base = join(out, `newpost-${stamp}`);
  await writeFile(base + '.json', JSON.stringify({ at: stamp, url: page.url(), dialogs, menus, frames }, null, 2));
  if (menus) console.log('메뉴 실측: ' + JSON.stringify(menus));
  await page.screenshot({ path: base + '.png', fullPage: true });
  const main = frames[0];
  console.log(`실측 저장: ${base}.json / .png`);
  console.log(`주소 ${page.url()} · 프레임 ${frames.length}개 · 버튼 ${main.buttons?.length ?? 0} · 입력 ${main.inputs?.length ?? 0} · 편집영역 ${frames.reduce((n, f) => n + (f.editables?.length || 0), 0)} · 확인창 ${dialogs.length}`);
  console.log('키워드 요소: ' + frames.flatMap((f) => (f.keywordHits || []).map((k) => k.text)).filter((t, i, a) => a.indexOf(t) === i).join(' | '));
  }
} finally {
  await context.close();
}

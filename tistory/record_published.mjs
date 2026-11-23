// 무인 실행이 임시저장한 가이드가 발행됐는지 확인해 장부에 적는다(2026-11-23 사용자 결정: 무인 실행은 임시저장까지만, 발행은 사람이).
// 대기 목록 data/drafted_pending.json = [{slug, title, savedAt}] — schedule_guides.mjs --draft가 임시저장에 성공한 글을 더한다.
// node tistory/record_published.mjs                                   RSS로 발행된 글을 찾아 기록한 뒤 남은 대기 글을 보여 준다(실행기 tistory_pending.bat)
// node tistory/record_published.mjs --set <slug> <주소> ["YYYY-MM-DD HH:MM"]   제목을 바꿔 발행해 자동으로 못 찾은 글을 손으로 기록(시각 생략 = 지금)
// node tistory/record_published.mjs --drop <slug>                     기록 없이 대기 목록에서만 뺀다(임시저장본을 안 올리기로 했을 때)
// 기록: posts/published.json(제목 → 주소), posts/scheduled.json(제목 → {url, when}) — 읽어서 그 항목만 더하고 나머지는 그대로 둔다(다른 세션의 미커밋 내용).
// 티스토리 임시저장본 자체는 지우지 않는다. 점검 node tistory/pending.check.mjs(네트워크·파일 쓰기 없음)
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './common.mjs';
import { decode } from '../posts/guide.mjs';

export const RSS_URL = 'https://aulee.tistory.com/rss';
export const PATHS = {
  pending: join(ROOT, 'data', 'drafted_pending.json'),
  published: join(ROOT, 'posts', 'published.json'),
  scheduled: join(ROOT, 'posts', 'scheduled.json'),
};
const p2 = (n) => String(n).padStart(2, '0');
export const localNow = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
// RSS pubDate(「Mon, 23 Nov 2026 11:16:28 +0900」) → 한국 시각 'YYYY-MM-DD HH:MM'. 못 읽으면 null
export const kstOf = (pub) => { const t = Date.parse(pub); return isNaN(t) ? null : new Date(t + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' '); };

// RSS 문자열 → [{title, url, when}] (제목 해석은 posts/guide.mjs published()와 같은 decode)
export function parseRss(xml) {
  const out = [];
  for (const [, item] of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (k) => (item.match(new RegExp(`<${k}>([\\s\\S]*?)</${k}>`)) || [])[1];
    const title = tag('title'), url = tag('link');
    if (!title || !url) continue;
    out.push({ title: decode(title).trim(), url: url.trim(), when: kstOf((tag('pubDate') || '').trim()) });
  }
  return out;
}

// (대기 목록, RSS 항목) → { recorded: [{slug,title,url,when}], left: [대기 글] } — 제목이 정확히 같은 것만
export function matchPending(pending, items) {
  const byTitle = new Map(items.map((i) => [i.title, i]));
  const recorded = [], left = [];
  for (const p of pending) {
    const hit = byTitle.get(p.title);
    if (hit) recorded.push({ slug: p.slug, title: p.title, url: hit.url, when: hit.when }); else left.push(p);
  }
  return { recorded, left };
}

// 쌓임 방지: 발행 안 된 대기 글이 hold편 이상이면 새로 저장하지 않는다
export const shouldHold = (left, hold = 2) => left.length >= hold;
export const holdLine = (left) => `발행 안 된 임시저장 ${left.length}편: ${left.map((p) => p.title).join(' / ')} — 새로 저장하지 않음. 발행했는데 남아 있으면 tistory_pending.bat`;

// JSON 장부 글에 항목만 더하기/바꾸기. 바뀐 게 없으면 원래 글 그대로 돌려준다.
// 파일이 2칸 들여쓰기·끝 줄바꿈 형식이면 그 형식 그대로(순서 유지, 새 항목은 끝에). 형식이 다르면 새 항목만 마지막 } 앞에 글로 끼우고, 이미 있는 항목을 바꿔야 하면 건너뛰고 skipped에 적는다.
export function withEntries(text, add) {
  const src = text && text.trim() ? text : '{}\n';
  const obj = JSON.parse(src);
  const changes = Object.entries(add).filter(([k, v]) => JSON.stringify(obj[k]) !== JSON.stringify(v));
  if (!changes.length) return { text, skipped: [] };
  if (JSON.stringify(obj, null, 2) + '\n' === src) {
    for (const [k, v] of changes) obj[k] = v;
    return { text: JSON.stringify(obj, null, 2) + '\n', skipped: [] };
  }
  const fresh = changes.filter(([k]) => !(k in obj)), skipped = changes.filter(([k]) => k in obj).map(([k]) => k);
  if (!fresh.length) return { text, skipped };
  const end = src.lastIndexOf('}');
  const head = src.slice(0, end).replace(/\s+$/, '');
  const lines = fresh.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')}`).join(',\n');
  return { text: `${head}${head.endsWith('{') ? '' : ','}\n${lines}\n${src.slice(end)}`, skipped };
}

const readText = (f) => readFile(f, 'utf8').catch(() => null);
export async function readPending(paths = PATHS) { const t = await readText(paths.pending); return t ? JSON.parse(t) : []; }
const writePending = (list, paths = PATHS) => writeFile(paths.pending, JSON.stringify(list, null, 2) + '\n');

// 발행된 글 한 편을 두 장부에 적는다(그 항목만)
async function recordOne({ title, url, when }, paths = PATHS) {
  for (const [f, v] of [[paths.published, url], [paths.scheduled, { url, when }]]) {
    const before = await readText(f);
    const { text, skipped } = withEntries(before, { [title]: v });
    if (skipped.length) console.log(`${f}: 형식이 달라 이미 있는 항목은 고치지 않음 — ${skipped.join(', ')}`);
    if (text !== before) await writeFile(f, text);
  }
}

// RSS를 한 번 읽어 대기 글 중 발행된 것을 기록하고 대기 목록에서 뺀다. RSS 실패면 대기 목록 그대로(던지지 않음).
// { rssXml }: 시험용으로 RSS 글을 직접 넘김. { dryRun }: 파일을 쓰지 않고 결과만. 돌려주는 값 { recorded, left, rssOk }
export async function syncPending({ rssXml, dryRun = false, paths = PATHS } = {}) {
  const pending = await readPending(paths);
  if (!pending.length) return { recorded: [], left: [], rssOk: true };
  let xml = rssXml;
  if (xml == null) {
    try { xml = await fetch(RSS_URL, { signal: AbortSignal.timeout(20000) }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }); }
    catch (e) { console.log(`RSS 읽기 실패(${e.message}) — 발행 확인 못 함, 대기 목록 ${pending.length}편 그대로`); return { recorded: [], left: pending, rssOk: false }; }
  }
  const { recorded, left } = matchPending(pending, parseRss(xml));
  for (const r of recorded) {
    if (!r.when) r.when = localNow();
    if (!dryRun) await recordOne(r, paths);
    console.log(`${dryRun ? '(시험) ' : ''}발행 확인 — ${r.title} → ${r.url} (${r.when})`);
  }
  if (recorded.length && !dryRun) await writePending(left, paths);
  return { recorded, left, rssOk: true };
}

// schedule_guides.mjs --draft가 임시저장에 성공한 글을 더한다(같은 slug가 있으면 바꿈)
export async function addPending({ slug, title, savedAt }, paths = PATHS) {
  const list = (await readPending(paths)).filter((p) => p.slug !== slug);
  list.push({ slug, title, savedAt });
  await writePending(list, paths);
}

async function main() {
  const argv = process.argv.slice(2);
  const si = argv.indexOf('--set'), di = argv.indexOf('--drop');
  if (si >= 0) {
    const [slug, url, when = localNow()] = argv.slice(si + 1);
    if (!slug || !/^https:\/\/aulee\.tistory\.com\/\S+$/.test(url || '') || !/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(when)) {
      console.log('사용: node tistory/record_published.mjs --set <slug> https://aulee.tistory.com/<번호> ["YYYY-MM-DD HH:MM"]'); return 4;
    }
    const pending = await readPending();
    const p = pending.find((x) => x.slug === slug);
    // 대기 목록에 없으면 초안 제목으로(관련 글 링크는 초안 제목으로 장부를 찾는다 — posts/guide.mjs relatedOf)
    const title = p?.title || JSON.parse(await readFile(join(ROOT, 'drafts', `guide_${slug}.json`), 'utf8').catch(() => '{}')).title;
    if (!title) { console.log(`대기 목록에도 drafts/guide_${slug}.json에도 제목이 없음 — 기록하지 않음`); return 1; }
    await recordOne({ title, url, when });
    if (p) await writePending(pending.filter((x) => x !== p));
    console.log(`기록 — ${title} → ${url} (${when})${p ? ', 대기 목록에서 뺌' : ''}`);
    return 0;
  }
  if (di >= 0) {
    const slug = argv[di + 1];
    const pending = await readPending();
    const p = pending.find((x) => x.slug === slug);
    if (!p) { console.log(`대기 목록에 ${slug || '(slug 없음)'} 없음`); return 1; }
    await writePending(pending.filter((x) => x !== p));
    console.log(`대기 목록에서 뺌(기록 없음) — ${p.title}. 티스토리 임시저장본은 그대로이니 필요하면 직접 지우세요.`);
    return 0;
  }
  const { left } = await syncPending();
  if (!left.length) { console.log('발행 기다리는 임시저장 없음'); return 0; }
  console.log(`\n발행 기다리는 임시저장 ${left.length}편 (티스토리 관리 > 글 > 임시저장에서 발행)`);
  for (const p of left) console.log(`- ${p.savedAt}  ${p.slug}\n    ${p.title}`);
  console.log('\n제목을 바꿔 발행했으면: node tistory\\record_published.mjs --set <slug> <주소> ["YYYY-MM-DD HH:MM"]');
  console.log('안 올리기로 했으면:     node tistory\\record_published.mjs --drop <slug>');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().then((c) => { process.exitCode = c; }).catch((e) => { console.error(e.message); process.exit(1); });

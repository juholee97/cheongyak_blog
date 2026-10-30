// auleezip.com(워드프레스) 글 올리기 — REST API + 애플리케이션 비밀번호
// .env: WP_URL=https://auleezip.com  WP_USER=관리자아이디  WP_APP_PASSWORD=xxxx xxxx ...  (값은 로그·파일에 남기지 않는다)
// node zip/wp.mjs --ping                     연결·권한만 확인
// node zip/wp.mjs post.json                  임시글(draft)로 올림 — 같은 slug가 있으면 그 글을 고친다
// node zip/wp.mjs post.json --at "YYYY-MM-DD HH:MM"   그 시각 예약(future)
// 즉시 공개(--now)는 zip/publish.mjs가 사용자 승인 뒤에만 쓴다(2026-10-30: 시세 비교·임대 글은 바로, 심층 분석 글만 접수 7일 전 06:00 예약)
// post.json: { slug, title, html, excerpt?, tags?[], categories?[] }  (zip/post.mjs가 만든다)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';

const env = async (k) => process.env[k] || (await readFile(join(ROOT, '.env'), 'utf8').catch(() => '')).match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();

export async function wp(path, { method = 'GET', body } = {}) {
  const [url, user, pass] = [await env('WP_URL'), await env('WP_USER'), await env('WP_APP_PASSWORD')];
  if (!url || !user || !pass) throw new Error('.env에 WP_URL·WP_USER·WP_APP_PASSWORD 필요');
  if (!url.startsWith('https://')) throw new Error('WP_URL은 https:// 로 — http로는 비밀번호가 암호화 없이 오간다');
  const r = await fetch(`${url.replace(/\/$/, '')}/wp-json/wp/v2/${path}`, {
    method, headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'), 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`워드프레스 ${method} ${path} HTTP ${r.status} ${j?.code || ''}`);
  return j;
}

// 이미지 올리기(미디어 라이브러리) → id. 같은 파일 이름·내용이면 다시 올리지 않는다(data/zip_media.json)
export async function uploadMedia(file, name, alt = '') {
  const { createHash } = await import('node:crypto');
  const { writeFile } = await import('node:fs/promises');
  const buf = await readFile(file), hash = createHash('sha1').update(buf).digest('hex');
  const cacheFile = join(ROOT, 'data/zip_media.json'), cache = JSON.parse(await readFile(cacheFile, 'utf8').catch(() => '{}'));
  if (cache[name]?.hash === hash) return cache[name].id;
  const [url, user, pass] = [await env('WP_URL'), await env('WP_USER'), await env('WP_APP_PASSWORD')];
  const type = /\.svg$/.test(name) ? 'image/svg+xml' : /\.png$/.test(name) ? 'image/png' : 'image/jpeg';
  const r = await fetch(`${url.replace(/\/$/, '')}/wp-json/wp/v2/media`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'), 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"` }, body: buf });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`이미지 올리기 HTTP ${r.status} ${j?.code || ''}`);
  if (alt) await wp(`media/${j.id}`, { method: 'POST', body: { alt_text: alt, title: alt } });
  cache[name] = { id: j.id, hash };
  await writeFile(cacheFile, JSON.stringify(cache, null, 1));
  return j.id;
}

// 태그·카테고리 이름 → id(없으면 만든다). kind: 'tags' | 'categories'
async function termIds(kind, names = []) {
  const ids = [];
  for (const name of names) {
    const hit = (await wp(`${kind}?search=${encodeURIComponent(name)}&per_page=20`)).find((t) => t.name === name);
    ids.push(hit ? hit.id : (await wp(kind, { method: 'POST', body: { name } })).id);
  }
  return ids;
}

// 마지막으로 보낸 내용의 지문을 저장해, 같으면 다시 보내지 않는다(불필요한 호출·「수정됨」 날짜 갱신 방지). ZIP_FORCE=1이면 무조건 보낸다
async function unchanged(key, sig) {
  const { createHash } = await import('node:crypto');
  const file = join(ROOT, 'data/zip_wp_state.json'), st = JSON.parse(await readFile(file, 'utf8').catch(() => '{}'));
  const hash = createHash('sha1').update(JSON.stringify(sig)).digest('hex');
  return { hit: !process.env.ZIP_FORCE && st[key]?.hash === hash ? st[key] : null, save: async (v) => { st[key] = { hash, ...v }; await (await import('node:fs/promises')).writeFile(file, JSON.stringify(st, null, 1)); } };
}

export async function upsert(post, at, now = false) {
  const u = await unchanged(`post:${post.slug}`, [post.title, post.html, post.excerpt, post.tags, post.categories, post.featured, at, now]);
  if (u.hit) return { id: u.hit.id, link: u.hit.link, status: u.hit.status, ok: true, skipped: true };
  const [old] = await wp(`posts?slug=${encodeURIComponent(post.slug)}&status=draft,future,publish&context=edit`);
  if (old?.status === 'publish' && !at && !now) throw new Error(`이미 공개된 글(${old.link}) — 고치려면 --at 없이 따로 결정`);
  const body = { slug: post.slug, title: post.title, content: post.html, excerpt: post.excerpt || '', tags: await termIds('tags', post.tags), categories: await termIds('categories', post.categories), ...(post.featured ? { featured_media: post.featured } : {}), status: at ? 'future' : now ? 'publish' : 'draft', ...(at ? { date: at.replace(' ', 'T') + ':00' } : now && old?.status === 'future' ? { date: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) } : {}) }; // 예약 글을 바로 공개할 때는 날짜도 지금으로(미래 날짜가 남으면 워드프레스가 예약 상태로 둔다)
  const res = await wp(old ? `posts/${old.id}` : 'posts', { method: 'POST', body });
  // 확인: 다시 불러와 제목·본문 길이·상태 대조
  const back = await wp(`posts/${res.id}?context=edit`);
  const ok = back.title.raw === post.title && back.content.raw === post.html && back.status === body.status;
  if (ok) await u.save({ id: res.id, link: back.link, status: back.status });
  return { id: res.id, link: back.link, status: back.status, ok };
}

// 고정 페이지(소개·열린 공고 등): slug로 찾아 고치거나 만든다. 공개 상태로 둔다
export async function upsertPage({ slug, title, html }) {
  const u = await unchanged(`page:${slug}`, [title, html]);
  if (u.hit) return { id: u.hit.id, link: u.hit.link, ok: true, skipped: true };
  const [old] = await wp(`pages?slug=${encodeURIComponent(slug)}&status=draft,publish,future&context=edit`);
  const res = await wp(old ? `pages/${old.id}` : 'pages', { method: 'POST', body: { slug, title, content: html, status: 'publish' } });
  const back = await wp(`pages/${res.id}?context=edit`);
  const ok = back.content.raw === html && back.status === 'publish';
  if (ok) await u.save({ id: res.id, link: back.link });
  return { id: res.id, link: back.link, ok };
}

if (process.argv[1]?.endsWith('wp.mjs')) {
  if (process.argv.includes('--ping')) {
    const me = await wp('users/me?context=edit');
    console.log(`연결됨: ${me.name} (${(me.roles || []).join(',')})`);
  } else {
    const file = process.argv[2], ai = process.argv.indexOf('--at'), nowFlag = process.argv.includes('--now');
    if (!file) { console.log('사용: node zip/wp.mjs post.json [--at "YYYY-MM-DD HH:MM"] | --ping'); process.exit(4); }
    const r = await upsert(JSON.parse(await readFile(file, 'utf8')), ai > 0 ? process.argv[ai + 1] : null, nowFlag);
    console.log(`${r.ok ? '✓' : '✗'} ${r.status} ${r.link}`);
    process.exitCode = r.ok ? 0 : 2;
  }
}

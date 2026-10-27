// auleezip.com(워드프레스) 글 올리기 — REST API + 애플리케이션 비밀번호
// .env: WP_URL=https://auleezip.com  WP_USER=관리자아이디  WP_APP_PASSWORD=xxxx xxxx ...  (값은 로그·파일에 남기지 않는다)
// node zip/wp.mjs --ping                     연결·권한만 확인
// node zip/wp.mjs post.json                  임시글(draft)로 올림 — 같은 slug가 있으면 그 글을 고친다
// node zip/wp.mjs post.json --at "YYYY-MM-DD HH:MM"   그 시각 예약(future). 즉시 공개(--publish)는 사용자 결정 전까지 없음
// post.json: { slug, title, html, excerpt?, tags?[] }
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';

const env = async (k) => process.env[k] || (await readFile(join(ROOT, '.env'), 'utf8').catch(() => '')).match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim();

export async function wp(path, { method = 'GET', body } = {}) {
  const [url, user, pass] = [await env('WP_URL'), await env('WP_USER'), await env('WP_APP_PASSWORD')];
  if (!url || !user || !pass) throw new Error('.env에 WP_URL·WP_USER·WP_APP_PASSWORD 필요');
  const r = await fetch(`${url.replace(/\/$/, '')}/wp-json/wp/v2/${path}`, {
    method, headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'), 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`워드프레스 ${method} ${path} HTTP ${r.status} ${j?.code || ''}`);
  return j;
}

// 태그 이름 → id(없으면 만든다)
async function tagIds(names = []) {
  const ids = [];
  for (const name of names) {
    const [hit] = await wp(`tags?search=${encodeURIComponent(name)}&per_page=1`);
    ids.push(hit?.name === name ? hit.id : (await wp('tags', { method: 'POST', body: { name } })).id);
  }
  return ids;
}

export async function upsert(post, at) {
  const [old] = await wp(`posts?slug=${encodeURIComponent(post.slug)}&status=draft,future,publish&context=edit`);
  if (old?.status === 'publish' && !at) throw new Error(`이미 공개된 글(${old.link}) — 고치려면 --at 없이 따로 결정`);
  const body = { slug: post.slug, title: post.title, content: post.html, excerpt: post.excerpt || '', tags: await tagIds(post.tags), status: at ? 'future' : 'draft', ...(at ? { date: at.replace(' ', 'T') + ':00' } : {}) };
  const res = await wp(old ? `posts/${old.id}` : 'posts', { method: 'POST', body });
  // 확인: 다시 불러와 제목·본문 길이·상태 대조
  const back = await wp(`posts/${res.id}?context=edit`);
  const ok = back.title.raw === post.title && back.content.raw === post.html && back.status === body.status;
  return { id: res.id, link: back.link, status: back.status, ok };
}

if (process.argv[1]?.endsWith('wp.mjs')) {
  if (process.argv.includes('--ping')) {
    const me = await wp('users/me?context=edit');
    console.log(`연결됨: ${me.name} (${(me.roles || []).join(',')})`);
  } else {
    const file = process.argv[2], ai = process.argv.indexOf('--at');
    if (!file) { console.log('사용: node zip/wp.mjs post.json [--at "YYYY-MM-DD HH:MM"] | --ping'); process.exit(4); }
    const r = await upsert(JSON.parse(await readFile(file, 'utf8')), ai > 0 ? process.argv[ai + 1] : null);
    console.log(`${r.ok ? '✓' : '✗'} ${r.status} ${r.link}`);
    process.exitCode = r.ok ? 0 : 2;
  }
}

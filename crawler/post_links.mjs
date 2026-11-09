// 공고번호 → 그 단지 분석 글 주소(site/post_links.json). 「내 청약 할 일」(skin/images/todo.js)이 함께 볼 글로 쓴다.
// 블로그 RSS(공개된 글만, 최근 50개)에서 분양분석 글 본문의 청약홈 공고번호를 읽고, 지금 배포본에 이어 쌓는다. 공공데이터 API는 부르지 않는다.
// node crawler/post_links.mjs --out site/post_links.json
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const RSS = 'https://aulee.tistory.com/rss';
const DEPLOYED = 'https://juholee97.github.io/cheongyak_blog/post_links.json';

export function parseRss(xml) {
  const out = {};
  for (const block of String(xml).split('<item>').slice(1).reverse()) { // 오래된 글부터 → 같은 공고면 새 글이 남는다
    if (!/<category>(?:<!\[CDATA\[)?분양분석/.test(block)) continue;
    const path = /<link>https:\/\/aulee\.tistory\.com(\/\d+)<\/link>/.exec(block)?.[1];
    const no = /houseManageNo=(\d+)/.exec(block)?.[1];
    if (path && no) out[no] = path;
  }
  return out;
}

// 지금 배포본. 처음(404)만 빈 값이고, 그 밖의 실패는 한 번 더 읽은 뒤 멈춘다 — 일시 오류로 쌓아 둔 주소가 줄어든 채 배포되지 않게(daily.yml이 지금 배포본을 그대로 쓴다)
async function deployed() {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(DEPLOYED, { cache: 'no-store' });
      if (r.status === 404) return {};
      if (r.ok) return (await r.json()).n || {};
      throw new Error(String(r.status));
    } catch (e) {
      if (i >= 1) throw e;
      await new Promise((res) => setTimeout(res, 3000));
    }
  }
}
// RSS에서 벗어난 주소가 아직 공개인지. 지워졌거나(404) 비공개(403)일 때만 뺀다. 네트워크 오류·5xx는 그대로 둔다
async function stillPublic(path) {
  const r = await fetch('https://aulee.tistory.com' + path, { redirect: 'manual' }).catch(() => null);
  return !(r && (r.status === 404 || r.status === 403));
}

if (process.argv.includes('--out')) {
  const file = process.argv[process.argv.indexOf('--out') + 1];
  const seed = JSON.parse(await readFile(new URL('./post_links_seed.json', import.meta.url), 'utf8')); // RSS 50개 창 밖의 예전 분석 글
  const prev = await deployed();
  const fresh = await fetch(RSS, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(parseRss, (e) => { console.log(`RSS 읽기 실패(${e.message}) — 쌓아 둔 주소만 씁니다`); return {}; });
  const n = { ...seed, ...prev, ...fresh };
  let dropped = 0;
  for (const [no, path] of Object.entries(n)) if (!Object.values(fresh).includes(path) && !(await stillPublic(path))) { delete n[no]; dropped++; }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ schema: 1, n }) + '\n');
  console.log(`분석 글 주소 ${Object.keys(n).length}건 (이번 RSS ${Object.keys(fresh).length}건, 뺀 글 ${dropped}건)`);
}

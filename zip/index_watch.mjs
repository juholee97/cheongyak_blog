// 서치 콘솔 색인 장부(2026-11-10 운영 원칙 3): 「크롤링됨 - 현재 색인이 생성되지 않음」 글 비율이 오르면 새 글을 멈추고 품질을 고친다.
// 한번 걸린 멈춤은 --release 전까지 유지(장부 전체를 훑는다).
// 비율 = 그 상태인 공개 글 ÷ 공개 글 수. 피드(/feed/)·스크립트 주소는 품질 신호가 아니라 세지 않는다. 기존 글 고치기는 막지 않는다(wp.mjs upsert).
// 서치 콘솔 API 권한이 없어 사람이나 세션이 https://auleezip.com/ 속성의 「페이지」 보고서를 보고 적는다.
// node zip/index_watch.mjs                    지금 상태
// node zip/index_watch.mjs --add --date 2026-11-10 --indexed 70 --posts 80 --crawled deep-1,apt-2 [--note 메모]
// node zip/index_watch.mjs --release 이유      품질을 고친 뒤 사용자 판단으로 보류를 푼다(다음 기록과 비교는 계속한다)
// node zip/index_watch.mjs --check             계산 점검
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';

const FILE = join(ROOT, 'data/zip_index_watch.json');
const rate = (r) => (r.posts ? r.crawled.length / r.posts : 0);
const pct = (r) => `${(rate(r) * 100).toFixed(1)}%`;

export function holdFrom(rows) {
  let hold = '';
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1], cur = rows[i];
    if (cur.released) hold = '';
    else if (rate(cur) > rate(prev)) hold = `색인 안 된 글 비율이 올랐습니다(${prev.date} ${pct(prev)} → ${cur.date} ${pct(cur)}). 품질을 고친 뒤 node zip/index_watch.mjs --release 이유`;
  }
  return hold;
}
const load = async () => JSON.parse(await readFile(FILE, 'utf8').catch(() => '[]'));
export const holdReason = async () => holdFrom(await load());

if (process.argv[1]?.endsWith('index_watch.mjs')) {
  const a = process.argv, arg = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
  if (a.includes('--check')) {
    const assert = (await import('node:assert/strict')).default;
    const R = (date, n, posts = 100, extra = {}) => ({ date, posts, crawled: Array(n).fill('x'), ...extra });
    assert.equal(holdFrom([]), '');
    assert.equal(holdFrom([R('a', 5)]), ''); // 기준선 하나로는 판단하지 않는다
    assert.equal(holdFrom([R('a', 5), R('b', 5)]), '');
    assert.equal(holdFrom([R('a', 5), R('b', 4)]), '');
    assert.ok(holdFrom([R('a', 5), R('b', 6)]).includes('5.0% → b 6.0%'));
    assert.equal(holdFrom([R('a', 5), R('b', 6, 100, { released: '고침' })]), '');
    assert.equal(holdFrom([R('a', 5), R('b', 6, 120)]), ''); // 글이 늘어 비율이 그대로면 멈추지 않는다
    assert.ok(holdFrom([R('a', 5), R('b', 6), R('c', 6)]).includes('a 5.0% → b 6.0%')); // 같은 비율 줄이 더 적혀도 유지
    assert.ok(holdFrom([R('a', 5), R('b', 6), R('c', 4)])); // 내려가도 유지
    assert.equal(holdFrom([R('a', 5), R('b', 6, 100, { released: '고침' }), R('c', 6)]), '');
    assert.ok(holdFrom([R('a', 5), R('b', 6, 100, { released: '고침' }), R('c', 7)]).includes('b 6.0% → c 7.0%'));
    assert.equal(holdFrom([R('a', 5), R('b', 6), R('c', 6, 100, { released: '고침' })]), ''); // 맨 뒤 줄 --release로 풀림
    console.log('index_watch 점검 통과');
  } else {
    const rows = await load();
    if (a.includes('--add')) {
      rows.push({ date: arg('--date'), indexed: +arg('--indexed'), posts: +arg('--posts'), crawled: (arg('--crawled') || '').split(',').filter(Boolean), ...(arg('--note') && { note: arg('--note') }) });
      await writeFile(FILE, JSON.stringify(rows, null, 1));
    } else if (arg('--release')) {
      rows.at(-1).released = arg('--release');
      await writeFile(FILE, JSON.stringify(rows, null, 1));
    }
    for (const r of rows.slice(-4)) console.log(`${r.date} 색인 ${r.indexed} · 공개 글 ${r.posts} · 크롤링됨-색인 안 됨 글 ${r.crawled.length}(${pct(r)})${r.released ? ` · 보류 해제: ${r.released}` : ''}`);
    console.log(holdFrom(rows) || '새 글 발행 가능');
  }
}

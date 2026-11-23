// 발행 뒤 기록(tistory/record_published.mjs) 자체 점검 — 네트워크·파일 쓰기 없음: node tistory/pending.check.mjs
import assert from 'node:assert/strict';
import { parseRss, kstOf, matchPending, shouldHold, holdLine, withEntries } from './record_published.mjs';

// RSS 해석: 엔티티가 두 번 든 제목(티스토리 RSS 실제 모양), pubDate → 한국 시각, 채널 제목·주소는 항목이 아님
const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<title>우리의 청약달력</title><link>https://aulee.tistory.com/</link><pubDate>Mon, 23 Nov 2026 11:16:28 +0900</pubDate>
<item>
<title>지분적립형 분양주택 매달 얼마 내나(2026년) &amp;mdash; 남은 지분 임대료&amp;middot;지분 대금</title>
<link>https://aulee.tistory.com/80</link>
<description>&lt;p&gt;본문&lt;/p&gt;</description>
<pubDate>Thu, 19 Nov 2026 15:44:22 +0900</pubDate>
</item>
<item>
<title>청년 &quot;전세임대&quot; A&amp;B &lt;신청&gt;</title>
<link>https://aulee.tistory.com/81</link>
<pubDate>Sun, 22 Nov 2026 23:30:00 +0000</pubDate>
</item>
<item><title>시각 없는 글</title><link>https://aulee.tistory.com/82</link></item>
</channel></rss>`;
const items = parseRss(xml);
assert.equal(items.length, 3);
assert.deepEqual(items[0], { title: '지분적립형 분양주택 매달 얼마 내나(2026년) — 남은 지분 임대료·지분 대금', url: 'https://aulee.tistory.com/80', when: '2026-11-19 15:44' });
assert.equal(items[1].title, '청년 "전세임대" A&B <신청>');
assert.equal(items[1].when, '2026-11-23 08:30'); // UTC 23:30 → 한국 다음 날 08:30
assert.equal(items[2].when, null);
assert.equal(kstOf('Mon, 23 Nov 2026 11:16:28 +0900'), '2026-11-23 11:16');
assert.equal(kstOf('x'), null);
assert.deepEqual(parseRss(''), []);

// 일치: 제목이 정확히 같을 때만. 한 글자라도 다르면 남김
const pending = [
  { slug: 'equity-monthly', title: '지분적립형 분양주택 매달 얼마 내나(2026년) — 남은 지분 임대료·지분 대금', savedAt: '2026-11-19 11:31' },
  { slug: 'youth-jeonse', title: '청년 "전세임대" A&B <신청> ', savedAt: '2026-11-20 11:31' }, // 끝 공백 — 다른 제목
  { slug: 'other', title: '아직 안 올린 글', savedAt: '2026-11-21 11:31' },
];
const { recorded, left } = matchPending(pending, items);
assert.deepEqual(recorded, [{ slug: 'equity-monthly', title: pending[0].title, url: 'https://aulee.tistory.com/80', when: '2026-11-19 15:44' }]);
assert.deepEqual(left.map((p) => p.slug), ['youth-jeonse', 'other']);
assert.deepEqual(matchPending([], items), { recorded: [], left: [] });
assert.deepEqual(matchPending(pending, []).left, pending);

// 쌓임 방지: 대기 글이 hold편 이상이면 새로 저장하지 않음
assert.equal(shouldHold([], 2), false);
assert.equal(shouldHold([pending[0]], 2), false);
assert.equal(shouldHold(pending.slice(0, 2), 2), true);
assert.equal(shouldHold(pending, 2), true);
assert.equal(shouldHold([pending[0]]), false); // 기본 2
assert.equal(shouldHold([], 0), true);
assert.match(holdLine(left), /^발행 안 된 임시저장 2편: .+ — 새로 저장하지 않음\. 발행했는데 남아 있으면 tistory_pending\.bat$/);

// 장부 쓰기: 그 항목만 더하고 나머지 내용·순서·형식은 그대로, 바뀐 게 없으면 원래 글 그대로
const ledger = JSON.stringify({ b: 'https://aulee.tistory.com/2', a: 'https://aulee.tistory.com/1' }, null, 2) + '\n';
const same = withEntries(ledger, { a: 'https://aulee.tistory.com/1' });
assert.equal(same.text, ledger);
const added = withEntries(ledger, { c: 'https://aulee.tistory.com/3' });
assert.equal(added.text, ledger.replace('/1"\n}', '/1",\n  "c": "https://aulee.tistory.com/3"\n}'));
assert.deepEqual(Object.keys(JSON.parse(added.text)), ['b', 'a', 'c']);
const sched = withEntries('{}\n', { t: { url: 'u', when: '2026-11-23 12:07' } });
assert.equal(sched.text, '{\n  "t": {\n    "url": "u",\n    "when": "2026-11-23 12:07"\n  }\n}\n');
assert.equal(withEntries(null, { t: 'u' }).text, '{\n  "t": "u"\n}\n'); // 파일 없음 → 새로
// 형식이 다른 파일: 새 항목만 끝에 글로 끼우고 앞부분은 글자 그대로, 이미 있는 항목 바꾸기는 건너뜀
const odd = '{"a": "1",\n "b": "2"}';
const oddAdd = withEntries(odd, { c: { url: 'u', when: 'w' }, a: 'X' });
assert.ok(oddAdd.text.startsWith('{"a": "1",\n "b": "2",\n'));
assert.deepEqual(JSON.parse(oddAdd.text), { a: '1', b: '2', c: { url: 'u', when: 'w' } });
assert.deepEqual(oddAdd.skipped, ['a']);
assert.equal(withEntries(odd, { a: 'X' }).text, odd);

console.log('pending.check 통과');

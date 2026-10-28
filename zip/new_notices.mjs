// auleezip 새 공고 알림: 접수가 아직 안 끝난 아파트·무순위 공고 중 시세 비교 글이 없는 곳을 찾아 알린다(글은 사용자와 같이 만든다).
// node zip/new_notices.mjs           찾고, 처음 보는 공고가 있으면 화면 알림창 + data/zip_new.json(아직 글 없는 공고 전체)
// node zip/new_notices.mjs --check   계산 점검(네트워크 없음)
// ZIP_NO_POPUP=1 이면 알림창을 띄우지 않고 본 공고로도 기록하지 않는다(시험용)
// 로그: data\logs\zip_new.log (analysis_auto.bat이 매일 07:00 부른다)
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../tistory/common.mjs';
import { loadData, md } from '../posts/weekly.mjs';
import { shortName, areaOf } from '../posts/analysis_post.mjs';

const KINDS = ['APT', '무순위']; // 분양가 모델 API가 있는 종류만(임의공급·청년안심·LH 임대는 아직 비교하지 않는다)
// 접수 날짜(특별공급·1·2순위·무순위 접수)만 본다 — 당첨 발표·계약 날짜는 접수 마감과 상관없다
const lastDate = (it) => (it.phases || []).filter((p) => ['sp', 'p1', 'p2'].includes(p.k) && p.date).map((p) => p.date).sort().at(-1) || '';
const firstDate = (it) => (it.phases || []).filter((p) => ['sp', 'p1'].includes(p.k) && p.date).map((p) => p.date).sort()[0] || '';

// items → 아직 글이 없는 열린 공고(같은 단지 이름은 하나로 묶는다). done: 글이 있는 공고번호 집합
export function pending(items, done, today) {
  const by = new Map();
  for (const it of items) {
    if (!KINDS.includes(it.kind) || lastDate(it) < today) continue;
    const no = it.id.split('-')[0];
    if (done.has(no)) continue;
    const k = shortName(it.name);
    if (!by.has(k)) by.set(k, { no, nos: [], name: it.name, area: areaOf(it), kind: it.kind, first: firstDate(it), last: lastDate(it) });
    by.get(k).nos.push(no);
  }
  return [...by.values()].sort((a, b) => (a.first < b.first ? -1 : 1));
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const it = (id, name, d, kind = 'APT') => ({ id: `${id}-${id}`, name, kind, region: '경기', phases: [{ k: 'p1', date: d }] });
  const items = [it('1', '가 단지', '2026-11-02'), it('2', '나 단지', '2026-10-01'), it('3', '다 단지(1차)', '2026-11-03'), it('4', '다 단지(2차)', '2026-11-03', '무순위'), it('5', '라 단지', '2026-11-05', '오피스텔')];
  const r = pending(items, new Set(['3']), '2026-10-28');
  assert.deepEqual(r.map((x) => x.name), ['가 단지', '다 단지(2차)']); // 끝난 공고·글 있는 공고·종류 밖은 빠진다
  console.log('new_notices 점검 통과');
} else if (process.argv[1]?.endsWith('new_notices.mjs')) {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const data = await loadData();
  const idx = JSON.parse(await readFile(join(ROOT, 'data/zip_posts/index.json'), 'utf8').catch(() => '{}'));
  const deals = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8').catch(() => '{"items":[]}')).items.map((r) => r.no);
  const done = new Set([...Object.keys(idx), ...deals]);
  const list = pending(data.items, done, today);
  const seenFile = join(ROOT, 'data/zip_new_seen.json');
  const seen = new Set(JSON.parse(await readFile(seenFile, 'utf8').catch(() => '[]')));
  const fresh = list.filter((x) => !x.nos.some((n) => seen.has(n)));
  await writeFile(join(ROOT, 'data/zip_new.json'), JSON.stringify({ at: new Date().toISOString(), today, pending: list }, null, 2));
  console.log(`[${today}] 글 없는 열린 공고 ${list.length}곳 · 새로 본 것 ${fresh.length}곳`);
  for (const x of list) console.log(`${fresh.includes(x) ? '★' : ' '} ${x.area} ${shortName(x.name)} (${x.kind}) 접수 ${md(x.first || x.last)}`);
  if (fresh.length && process.env.ZIP_NO_POPUP) console.log('(ZIP_NO_POPUP: 알림창·확인 기록 건너뜀)');
  else if (fresh.length) {
    await writeFile(seenFile, JSON.stringify([...seen, ...fresh.flatMap((x) => x.nos)]));
    const msg = `auleezip 새 공고 ${fresh.length}곳 — 글이 아직 없어요\n${fresh.slice(0, 6).map((x) => `· ${x.area} ${shortName(x.name)} (접수 ${md(x.first || x.last)})`).join('\n')}\n\nClaude에게 「새 공고 글 만들자」라고 말해 주세요.`;
    spawnSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${msg.replace(/'/g, "''")}', 'auleezip 새 공고') | Out-Null`], { stdio: 'ignore' });
  }
}

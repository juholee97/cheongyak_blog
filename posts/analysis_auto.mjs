// 분양분석 글 자동 예약(작업 스케줄러, 매일 07:00). 2026-10-23 사용자 결정: 검수를 통과하면 채팅 승인 없이 예약발행.
// 대상: 아파트 분양(무순위·임의공급·임대 제외) 중 300세대 이상이거나 관심 점수(analysis.mjs score) > 0.
// 공개 시각: 첫 접수일(특별공급·1순위 중 이른 날) 7일 전 10:00. 그 시각이 앞으로 24시간 안이거나 이미 지났으면(접수 전일 때만) 이번 실행에서 예약.
// node posts/analysis_auto.mjs [--dry-run] [--quiet]     기록: data/logs/analysis_auto.log
import { spawnSync } from 'node:child_process';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { loadData } from './weekly.mjs';
import { titleOf } from './analysis_post.mjs';
import { score } from './analysis.mjs';

const dryRun = process.argv.includes('--dry-run');
const MAX = 8; // 한 번에 최대(공고가 몰려도 하루에 이만큼만)
const LOG = join(ROOT, 'data', 'logs', 'analysis_auto.log');
await mkdir(join(ROOT, 'data', 'logs'), { recursive: true });
const log = async (s) => { console.log(s); await appendFile(LOG, s + '\n'); };
const pad = (n) => String(n).padStart(2, '0');
const fmt = (t) => `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`;
const json = (p) => readFile(join(ROOT, p), 'utf8').then(JSON.parse, () => null);

function notify(msg) {
  if (process.argv.includes('--quiet')) return;
  const ps = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${msg.replace(/'/g, "''")}', '청약 분석 글 자동 예약') | Out-Null`;
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
}
const run = async (name, args) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  await log(`[${name}] 종료 ${r.status}\n${(r.stdout || '') + (r.stderr || '')}`.trimEnd());
  return r.status;
};

// 공개 시각 고르기: 접수 7일 전 10:00, 이미 지났으면 지금부터 30분 뒤(10분 단위 올림). 다른 예약과 같은 시각이면 10분씩 미룬다.
export function publishAt(receipt, now, taken) {
  const today = fmt(now).slice(0, 10);
  if (receipt <= today) return null; // 접수가 이미 시작됨
  let t = new Date(receipt + 'T10:00:00'); t.setDate(t.getDate() - 7);
  const soon = new Date(now.getTime() + 30 * 60e3); soon.setMinutes(Math.ceil(soon.getMinutes() / 10) * 10, 0, 0);
  if (t < soon) t = soon;
  if (t - now > 24 * 3600e3) return null; // 다음 실행 때
  while (taken.has(fmt(t))) t = new Date(t.getTime() + 10 * 60e3);
  return fmt(t);
}

async function main() {
  const now = new Date();
  await log(`\n===== ${fmt(now)} KST 분석 글 자동 예약${dryRun ? ' · 시험' : ''} =====`);
  const data = await loadData();
  const sched = (await json('posts/scheduled.json')) || {}, pub = (await json('posts/published.json')) || {};
  const taken = new Set(Object.values(sched).map((v) => v.when));
  const plan = [];
  for (const it of data.items) {
    if (it.kind !== 'APT' || /임대/.test(it.name)) continue;
    if (!(it.units >= 300 || score(it).s > 0)) continue;
    const no = it.id.split('-')[0];
    // 이미 예약·발행된 글(제목으로) 또는 임시저장·예약 기록이 있으면 건너뛴다 — 다시 수집하면 손으로 고친 초안을 덮어쓰므로
    const title = titleOf({ item: it });
    if (sched[title] || pub[title] || pub[`[분양분석] ${it.name.replace(/\(.*?\)/g, '').trim()} — 분양가·주변 실거래·교통·학군·대출 정리`]) continue;
    const prev = await json(`drafts/analysis_${no}.save.json`);
    if (prev?.ok && ['save', 'schedule'].includes(prev.mode)) continue;
    const receipt = it.phases.filter((p) => ['sp', 'p1'].includes(p.k)).map((p) => p.date).sort()[0];
    if (!receipt) continue;
    const when = publishAt(receipt, now, taken);
    if (!when) continue;
    taken.add(when);
    plan.push({ no, name: it.name, receipt, when });
  }
  await log(plan.length ? plan.map((p) => `- ${p.when} ${p.name} (${p.no}, 접수 ${p.receipt})`).join('\n') : '이번에 예약할 단지 없음');
  const done = [], failed = [];
  for (const p of plan.slice(0, MAX)) {
    const base = `drafts/analysis_${p.no}.json`;
    if (await run(`수집 ${p.no}`, ['posts/analysis_post.mjs', p.no, '--auto'])) { failed.push(`${p.name}: 수집 실패`); continue; }
    const code = await run(`예약 ${p.no}`, ['tistory/draft.mjs', base, ...(dryRun ? ['--dry-run'] : []), '--approved', '--schedule', p.when]);
    if (code) failed.push(`${p.name}: ${{ 1: '입력 오류', 2: '예약 대조 불일치', 3: '로그인 필요(tistory_login.bat)', 4: '검수 실패' }[code] || `코드 ${code}`}`);
    else done.push(`${p.when} ${p.name}`);
  }
  if (plan.length > MAX) await log(`※ ${plan.length - MAX}곳은 다음 실행으로 미룸`);
  return { done, failed };
}

if (process.argv[1]?.endsWith('analysis_auto.mjs')) {
  const r = await main().catch((e) => ({ done: [], failed: [e.message] }));
  for (const f of r.failed) await log('✗ ' + f);
  if (r.done.length) await log('✓ ' + r.done.join('\n✓ '));
  if (r.failed.length) notify(`분석 글 자동 예약 실패 ${r.failed.length}건\n${r.failed.join('\n')}\n\n기록: data\\logs\\analysis_auto.log`);
  else if (r.done.length) notify(`${dryRun ? '시험 통과(예약 안 함)' : '분석 글 예약'} ${r.done.length}건\n${r.done.join('\n')}`);
  process.exitCode = r.failed.length ? 1 : 0;
}

// 매주 자동 실행(작업 스케줄러, 일요일): 다음 주 초안 → 그림 → 자동 요약 → 검수 → 티스토리 임시저장 → 저장본 대조. 발행은 사람이.
// node posts/auto.mjs [--week YYYY-MM-DD] [--dry-run] [--quiet]
//   --dry-run  티스토리 단계를 저장 없이 시험(draft.mjs --dry-run)   --quiet  끝 알림 창 없음
// 이미 임시저장이 확인된 주(save.json ok)는 건너뛴다. 아니면 최신 수집본으로 다시 만든다(--force).
import { spawnSync } from 'node:child_process';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { nextMonday } from './weekly.mjs';

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const dryRun = process.argv.includes('--dry-run');
const week = arg('--week') || nextMonday();
const base = `drafts/${week}_weekly`;
const LOG = join(ROOT, 'data', 'logs', 'weekly_auto.log');
await mkdir(join(ROOT, 'data', 'logs'), { recursive: true });
const log = async (s) => { console.log(s); await appendFile(LOG, s + '\n'); };

// 끝 알림: 로그인한 사용자 화면에 창 하나
function notify(msg) {
  if (process.argv.includes('--quiet')) return;
  const ps = `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${msg.replace(/'/g, "''")}', '청약 주간 글 자동 실행') | Out-Null`;
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
}

const run = async (name, args) => {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  await log(`[${name}] 종료 ${r.status}\n${(r.stdout || '') + (r.stderr || '')}`.trimEnd());
  return r.status;
};

const DRAFT_EXIT = { 1: '티스토리 입력 중 오류', 2: '저장본 대조 불일치(티스토리 임시저장 목록 확인 필요)', 3: '티스토리 로그인 필요 — tistory_login.bat으로 직접 로그인', 4: '검수 실패', 5: '티스토리 하루 글 한도(50개)', 6: '티스토리 보안 확인(reCAPTCHA) — 사람이 직접 확인 필요' };

async function main() {
  await log(`\n===== ${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')} KST · ${week} 주${dryRun ? ' · 시험' : ''} =====`);
  const prev = await readFile(join(ROOT, base + '.save.json'), 'utf8').then(JSON.parse, () => null);
  if (!dryRun && prev?.ok && prev.mode !== 'dry-run') { await log('이미 임시저장 확인된 주 — 건너뜀'); return null; }
  if (await run('초안', ['posts/weekly.mjs', '--week', week, '--force', '--auto'])) return '초안 만들기 실패(수집본을 못 받았을 수 있음)';
  if (await run('그림', ['posts/images.mjs', base + '.json'])) return '그림 만들기 실패';
  if (await run('검수', ['posts/check.mjs', base + '.json'])) return '검수 실패 — 저장하지 않음';
  const code = await run('티스토리', ['tistory/draft.mjs', base + '.json', dryRun ? '--dry-run' : '--approved']);
  return code ? DRAFT_EXIT[code] || `티스토리 단계 종료 코드 ${code}` : '';
}

const fail = await main().catch((e) => e.message);
const title = await readFile(join(ROOT, base + '.json'), 'utf8').then((s) => JSON.parse(s).title, () => week);
if (fail === null) process.exitCode = 0;
else if (fail) { await log('✗ ' + fail); notify(`${week} 주 글 자동 실행 실패\n${fail}\n\n기록: data\logs\weekly_auto.log`); process.exitCode = 1; }
else {
  const msg = dryRun ? `시험 실행 통과(저장 안 함)\n${title}` : `티스토리 임시저장 완료\n${title}\n\n티스토리에서 확인하고 발행해 주세요.`;
  await log('✓ ' + msg.split('\n')[0]); notify(msg);
}

// 외부 API 호출 가드(2026-10-28 사용자 지시): 공공 API가 아닌 기업 API는 많이 부르면 유료 결제가 된다 — 부르기 전에 항상 한도를 확인한다.
// 사용: await useApi('naver_hub')            // 호출 1번을 쓰고 한도를 넘으면 오류(API_BUDGET:…)를 던진다
//       await useApi('youtube', 100)         // 단위가 있는 API는 단위만큼
// 호출 횟수는 data/api_usage.json에 날짜별로 쌓인다. 한도는 아래 기본값이고 data/api_limits.json({ "naver_hub": { "day": 80 } })으로 바꾼다.
// paid:true = 한도를 넘기면 돈이 나갈 수 있는 서비스 — 기본 한도를 일부러 낮게 잡았다. 올리려면 사용자가 요금 안내를 확인한 뒤 api_limits.json을 직접 고친다.
// node zip/guard.mjs        오늘·이번 달 사용량 표
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';

export const DEFAULTS = {
  // 네이버 API HUB 요금표(2026-10-28 사용자가 알려 줌): 검색어 트렌드 0~30,000건 무료(30,001~50,000건 한시적 무료), 검색 API 0~775,000건 무료·하루 최대 25,000건. 기간(월/일)이 표에 없어 월 기준으로 보고 무료 구간보다 한참 낮게 잡는다
  naver_trend: { day: 300, month: 5000, paid: true, note: '네이버 API HUB 검색어 트렌드 — 무료 월 30,000건까지(표 기준, 기간 단위는 확인 못 함)' },
  naver_search: { day: 1000, month: 20000, paid: true, note: '네이버 API HUB 검색 API(뉴스) — 무료 775,000건까지, 하루 25,000건 제한' },
  youtube: { day: 3000, month: 60000, paid: false, note: 'YouTube Data API 단위(검색 100·목록 1). 기본 무료 할당 하루 10,000 — 결제 계정은 연결하지 않았다' },
  vworld: { day: 20000, month: 400000, paid: false, note: '브이월드 지오코더(무료, 일일 한도 있음 — 2026-10-28 초과)' },
  datago: { day: 8000, month: 160000, paid: false, note: '공공데이터포털(개발계정 API당 일 10,000)' },
};
const FILE = () => process.env.ZIP_USAGE_FILE || join(ROOT, 'data/api_usage.json');
const read = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString();

export function limitsOf(api) {
  const custom = read(join(ROOT, 'data/api_limits.json'), {});
  return { ...(DEFAULTS[api] || { day: 0, month: 0, paid: true, note: '등록되지 않은 API — 한도를 정해야 쓸 수 있다' }), ...(custom[api] || {}) };
}

// 호출을 쓴다(동기 읽고-쓰기라 병렬 호출에서도 세는 값이 어긋나지 않는다)
export function useApi(api, n = 1) {
  const lim = limitsOf(api), day = kst().slice(0, 10), month = day.slice(0, 7), st = read(FILE(), {});
  const u = st[api] = st[api] || {};
  if (u.day !== day) { u.day = day; u.dayCount = 0; }
  if (u.month !== month) { u.month = month; u.monthCount = 0; }
  if (u.dayCount + n > lim.day || u.monthCount + n > lim.month) {
    const which = u.dayCount + n > lim.day ? `하루 ${lim.day}` : `한 달 ${lim.month}`;
    throw new Error(`API_BUDGET:${api} — ${which} 한도에 도달(${lim.paid ? '유료 전환 위험 서비스' : '무료 한도 보호'}). ${lim.note}. 한도는 data/api_limits.json에서 바꾼다`);
  }
  u.dayCount += n; u.monthCount += n;
  writeFileSync(FILE(), JSON.stringify(st, null, 1));
  return { dayCount: u.dayCount, monthCount: u.monthCount };
}

export const isBudgetError = (e) => /API_BUDGET:|VWORLD_QUOTA/.test(e?.message || '');

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  process.env.ZIP_USAGE_FILE = join(mkdtempSync(join(tmpdir(), 'guard-')), 'u.json');
  for (let i = 0; i < 300; i++) useApi('naver_trend');
  assert.throws(() => useApi('naver_trend'), /API_BUDGET:naver_trend/); // 하루 300번 넘으면 막힌다
  useApi('youtube', 100); assert.equal(read(FILE(), {}).youtube.dayCount, 100); // 단위 호출
  assert.throws(() => useApi('youtube', 3000), /API_BUDGET:youtube/); // 한 번에 한도를 넘는 단위도 막힌다
  assert.throws(() => useApi('없는API'), /API_BUDGET/); // 등록 안 된 API는 한도 0
  assert.equal(isBudgetError(new Error('API_BUDGET:x')), true);
  console.log('guard 점검 통과');
} else if (process.argv[1]?.endsWith('guard.mjs')) {
  const st = read(FILE(), {}), today = kst().slice(0, 10);
  for (const [api, d] of Object.entries(DEFAULTS)) { const l = limitsOf(api), u = st[api] || {}; console.log(`${api.padEnd(10)} 오늘 ${u.day === today ? u.dayCount : 0}/${l.day} · 이번 달 ${u.month === today.slice(0, 7) ? u.monthCount : 0}/${l.month}${l.paid ? '  [유료 위험]' : ''}`); }
}

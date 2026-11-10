// 심층 분석 대상 고르기(2026-10-31 사용자 결정): 매매 청약(아파트 분양·무순위·임의공급) 중 수도권이거나 지방 핵심지인 곳만.
// 2026-11-05 사용자 「임대 리포트도 하되, 청년전세와 행복주택 중 아파트·오피스텔만」: 수도권 청년안심주택과 행복주택(LH 건설형 단지)만 고른다.
// 매입·전세임대(다가구·다세대)와 예비입주자·자격완화 상시모집, 기관공급(회사·기관을 통해 소속 직원만 신청, 2026-11-10)은 뺀다. 공공지원 민간임대·국민·영구·공공임대·SH 사회주택은 넣지 않는다.
// 고른 단지는 유튜브 분석기(D:\dev\apt_youtube_analyzer) 감시 폴더 D:\부동산_청약분석\<단지 이름>을 만들어 리포트를 받고,
// data/deep_folders.json에 폴더 → 공고번호를 적는다(zip/deep.mjs가 이 표로 리포트를 찾는다). 글은 리포트가 나오면 세션에서 쓴다.
// node zip/deep_targets.mjs           고를 단지 목록만
// node zip/deep_targets.mjs --make    폴더를 만들고 표에 적는다(analysis_auto.bat이 매일 07:00)
// node zip/deep_targets.mjs --check   규칙 점검(네트워크 없음)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { loadData } from '../posts/weekly.mjs';
import { shortName } from './post.mjs';

const BASE = 'D:/부동산_청약분석', MAP = join(ROOT, 'data/deep_folders.json');
const KINDS = ['APT', '무순위', '임의공급'];
export const isRent = (it) => it.kind === '청년안심주택' || (it.kind === '행복주택' && !/매입|전세임대|다가구|다세대|예비입주자|자격완화|기관공급/.test(it.name || ''));
const CAPITAL = ['서울', '경기', '인천'];
// 지방 핵심지: 시·도 → 주소에 들어 있으면 고르는 구·시 이름(빈 배열은 시·도 전체). 바꾸려면 여기만 고친다
export const CORE = {
  세종: [],
  부산: ['해운대구', '수영구', '동래구', '남구', '연제구'],
  대구: ['수성구'],
  대전: ['유성구', '서구'],
  광주: ['남구', '서구'],
  울산: ['남구'],
  경남: ['창원시 성산구', '창원시 의창구'],
  충남: ['천안시 서북구'],
};
const receipt = (it) => (it.phases || []).filter((p) => ['sp', 'p1', 'p2'].includes(p.k) && p.date);
const firstOf = (it) => receipt(it).map((p) => p.date).sort()[0] || '';
const lastOf = (it) => receipt(it).map((p) => p.end || p.date).sort().at(-1) || '';
export const coreArea = (it) => CAPITAL.includes(it.region) || (it.region in CORE && (!CORE[it.region].length || CORE[it.region].some((g) => (it.address || '').includes(g) || `${it.district || ''}`.includes(g))));
// 접수가 아직 시작되지 않은 매매 청약 + 핵심지(리포트가 나와 첫 접수 7일 전에 글을 올릴 시간이 있어야 한다)
const plus = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const isTarget = (it, today) => (KINDS.includes(it.kind) ? coreArea(it) : isRent(it) && CAPITAL.includes(it.region)) && firstOf(it) >= plus(today, 3); // 분석에 반나절~하루, 글 쓰기까지 사흘은 남아야 한다
export const folderOf = (it) => `${shortName(it.name).replace(/\s*(본청약|후속사업|추가입주자모집공고|입주자모집공고)$/, '')}${it.kind === 'APT' ? '' : isRent(it) ? ' (임대)' : ' (무순위)'}`;
// 공고번호: 청약홈은 「번호-번호」의 앞, 청년안심주택(youth-6718)·LH(lh-…)는 id 그대로
export const noOf = (it) => (/^\d+-\d+$/.test(it.id) ? it.id.split('-')[0] : it.id);

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert')).default, ph = [{ k: 'sp', date: '2026-11-09' }];
  assert.ok(isTarget({ kind: 'APT', region: '경기', phases: ph }, '2026-10-31'));
  assert.ok(!isTarget({ kind: 'APT', region: '경기', phases: [{ k: 'sp', date: '2026-11-02' }] }, '2026-10-31'), '이틀 뒤 접수는 늦다');
  assert.ok(!isTarget({ kind: '국민임대', region: '서울', phases: ph }, '2026-10-31'), 'LH 임대 제외');
  assert.ok(isTarget({ kind: '청년안심주택', region: '서울', phases: ph }, '2026-10-31'), '수도권 청년안심주택');
  assert.ok(!isTarget({ kind: '청년안심주택', region: '부산', phases: ph }, '2026-10-31'), '지방 임대 제외');
  assert.ok(!isTarget({ kind: '공공지원 민간임대', region: '서울', phases: ph }, '2026-10-31'), '공공지원 민간임대 제외(2026-11-05)');
  assert.ok(isTarget({ kind: '행복주택', region: '경기', name: '과천지식정보타운 S12블록 행복주택 입주자 모집공고', phases: ph }, '2026-10-31'), '수도권 행복주택');
  assert.ok(!isTarget({ kind: '행복주택', region: '경기', name: '화성시 동탄지역 행복주택 입주자 모집 공고[입주자격완화/선계약후검증]', phases: ph }, '2026-10-31'), '자격완화 상시모집 제외');
  assert.ok(!isTarget({ kind: '행복주택', region: '경기', name: '파주시 중소기업체 기관공급(행복주택)', phases: ph }, '2026-10-31'), '기관공급 제외(2026-11-10: 회사·기관을 통해 소속 직원만 신청)');
  assert.equal(noOf({ id: 'lh-2015122300020960' }), 'lh-2015122300020960');
  assert.equal(folderOf({ kind: '청년안심주택', name: '효창공원앞역 해링턴 플레이스 용산 리버뷰 (최초모집)' }), '효창공원앞역 해링턴 플레이스 용산 리버뷰 (임대)');
  assert.equal(noOf({ id: 'youth-6718' }), 'youth-6718');
  assert.equal(noOf({ id: '2026000517-2026000517' }), '2026000517');
  assert.ok(!isTarget({ kind: 'APT', region: '제주', phases: ph }, '2026-10-31'), '핵심지 아님');
  assert.ok(isTarget({ kind: 'APT', region: '부산', address: '부산광역시 해운대구 우동', phases: ph }, '2026-10-31'));
  assert.ok(!isTarget({ kind: 'APT', region: '부산', address: '부산광역시 사하구', phases: ph }, '2026-10-31'));
  assert.ok(!isTarget({ kind: 'APT', region: '경기', phases: [{ k: 'sp', date: '2026-10-31' }] }, '2026-10-31'), '접수 시작한 곳은 늦다');
  assert.equal(folderOf({ kind: '무순위', name: '과천 디에트르 퍼스티지(S2BL)' }), '과천 디에트르 퍼스티지 S2BL (무순위)');
  console.log('deep_targets 점검 통과');
} else if (process.argv[1]?.endsWith('deep_targets.mjs')) {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const { items } = await loadData(), map = JSON.parse(await readFile(MAP, 'utf8').catch(() => '{}'));
  const done = new Set(Object.values(map).flat());
  const by = new Map();
  for (const it of items.filter((x) => isTarget(x, today) && lastOf(x) >= today)) {
    const no = noOf(it);
    if (done.has(no)) continue;
    const f = folderOf(it), g = by.get(f) || { it, nos: [] };
    if (!g.nos.includes(no)) g.nos.push(no);
    by.set(f, g);
  }
  if (!by.size) console.log('새로 고를 단지 없음');
  for (const [f, { it, nos }] of by) console.log(`${firstOf(it)} ${it.kind} ${it.region} ${it.district || ''} · ${f} · ${nos.join(',')}`);
  if (process.argv.includes('--make') && by.size) {
    for (const [f, { nos }] of by) {
      if (!existsSync(join(BASE, f))) await mkdir(join(BASE, f), { recursive: true });
      map[f] = nos;
    }
    await writeFile(MAP, JSON.stringify(map, null, 1));
    console.log(`폴더 ${by.size}곳 만듦 → 분석기가 1분 안에 시작`);
  }
}

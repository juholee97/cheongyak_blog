// LH·SH 공고 중복 정리(2026-10-28 사용자 지시): 같은 공고를 다시 올린 글(「[정정공고]」·이름 뒤 공고일 표기만 다른 글)은 하나로 합친다.
// 규칙: 이름에서 정정 표시·날짜 괄호를 뺀 것이 같고 같은 출처(lh-·sh-)이면 같은 공고 후보.
//  1) 정정공고가 있으면 그보다 먼저 올라온 같은 이름 글은 낡은 것이라 뺀다(정정이 일정을 바꿨을 수 있다)
//  2) 남은 글 중 첫 접수일이 같은 것끼리는 가장 최근에 올라온 글 하나만 둔다. 접수일이 다른 글은 다른 회차라 그대로 둔다(예: 사회주택 1·2·3차 모집)
// 표시 이름에서는 「[정정공고]」를 뺀다. 청약홈·서울시 청년안심주택 글은 건드리지 않는다.
const SRC = /^(lh|sh)-/;
const CORR = /\[?\s*정정\s*공고\s*\]?|\(\s*정정\s*\)/g;
const DATE_PAREN = /\([^)]*\d{4}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}[^)]*\)/g;
export const clean = (name) => name.replace(CORR, ' ').replace(/\s+/g, ' ').trim();
const keyOf = (it) => `${it.id.split('-')[0]}|${it.region}|${clean(it.name).replace(DATE_PAREN, '').replace(/\s+/g, '')}`;
const first = (it) => (it.phases || []).filter((p) => ['sp', 'p1', 'p2'].includes(p.k) && p.date).map((p) => p.date).sort()[0] || '';

export function mergeNotices(items) {
  const groups = new Map(), out = [];
  for (const it of items) {
    if (!SRC.test(it.id)) { out.push(it); continue; }
    const k = keyOf(it);
    groups.set(k, [...(groups.get(k) || []), it]);
  }
  for (const xs of groups.values()) {
    const corr = xs.filter((x) => new RegExp(CORR.source).test(x.name)).map((x) => x.noticeDate || '').sort().at(-1);
    const live = corr ? xs.filter((x) => (x.noticeDate || '') >= corr) : xs;
    const by = new Map();
    for (const x of live) by.set(first(x), [...(by.get(first(x)) || []), x]);
    for (const ys of by.values()) {
      ys.sort((a, b) => (b.noticeDate || '').localeCompare(a.noticeDate || '') || b.id.localeCompare(a.id));
      out.push({ ...ys[0], name: clean(ys[0].name) });
    }
  }
  return out;
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  const P = (d) => [{ k: 'p1', date: d }];
  const it = (id, name, nd, d) => ({ id, name, region: '경남', noticeDate: nd, phases: P(d) });
  const m = mergeNotices([
    it('lh-1', '의령 행복주택 예비입주자 정례모집', '2026-10-15', '2026-10-28'),
    it('lh-2', '[정정공고]의령 행복주택 예비입주자 정례모집', '2026-10-20', '2026-10-30'),
    it('lh-3', '광주 영구임대 예비입주자 모집공고(모집공고일:2026.10.27)', '2026-10-27', '2026-11-13'),
    it('lh-4', '광주 영구임대 예비입주자 모집공고(모집공고일 : 2026.10.28)', '2026-10-28', '2026-11-13'),
    it('sh-5', '[사회주택] 옥류서원 입주자 모집 공고문', '2026-10-07', '2026-10-02'),
    it('sh-6', '[사회주택] 옥류서원 입주자 모집 공고문', '2026-10-28', '2026-10-28'),
    it('youth-7', '청량리 퀸즈W (추가모집)', '2026-10-22', '2026-10-26'),
    it('1234-1234', '무순위 A', '2026-10-22', '2026-10-26'), it('1234-9', '무순위 A', '2026-10-22', '2026-10-26'),
  ]);
  const ids = m.map((x) => x.id).sort();
  assert.deepEqual(ids, ['1234-1234', '1234-9', 'lh-2', 'lh-4', 'sh-5', 'sh-6', 'youth-7'].sort()); // 정정이 원본을 대체, 같은 접수일은 최신 하나, 접수일 다른 회차·청약홈은 그대로
  assert.equal(m.find((x) => x.id === 'lh-2').name, '의령 행복주택 예비입주자 정례모집');
  console.log('merge 점검 통과');
}

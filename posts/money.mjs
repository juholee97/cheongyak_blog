// 분양분석 글 「가정 계산」(2026-10-29 사용자 지시: 첫 분석 글처럼 월 지출·가구별로): 필요 현금·월 상환·소득별 대출 한도(DSR)·취득세·토지임대료.
// 입력은 청약홈 분양가, 공고문 조건(posts/notice_terms.mjs), docs/policy 기준표(아래 상수, 확인일 MONEY_CHECKED), 한국은행 주택담보대출 금리(data/rates.json).
// 결과는 모두 가정 계산이라 글에 가정·기준일·출처를 같이 쓴다. checkMoney는 월 상환을 다른 방법(달마다 갚아 나가는 표)으로 다시 계산해 본문과 대조한다.
// node posts/money.mjs --rates    한국은행 ECOS 금리 갱신(.env ECOS_KEY 필요 — 없으면 data/rates.json 그대로)
// node posts/money.mjs --check    자체 점검(기준 글·공고문 예시 재현)
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { useApi } from '../zip/guard.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MONEY_CHECKED = '2026-10-23'; // docs/policy loans.md·tax.md·public.md·special.md 확인일 — 문서를 고치면 아래 값과 함께 고친다

// 정책대출(loans.md 1~3절). price·limit 만원, ltv [수도권·규제지역, 그 밖], 기간은 30년으로 가정
export const POLICY = [
  { name: '디딤돌대출(일반)', who: '부부합산 소득 6천만원 이하', price: 50000, area: 85, limit: 20000, ltv: [70, 70], rate: [2.85, 4.15] },
  { name: '디딤돌대출(생애최초)', who: '생애최초 구입, 소득 7천만원 이하', price: 50000, area: 85, limit: 24000, ltv: [70, 80], rate: [2.85, 4.15] },
  { name: '디딤돌대출(신혼·2자녀 이상)', who: '신혼 소득 8.5천만원·2자녀 이상 7천만원 이하', price: 60000, area: 85, limit: 32000, ltv: [70, 70], rate: [2.85, 4.15] },
  { name: '신생아 특례 디딤돌대출', who: '2년 안에 출산한 가구, 소득 1.3억원(맞벌이 2억원) 이하', price: 90000, area: 85, limit: 40000, ltv: [70, 70], rate: [1.8, 4.5] },
  { name: '보금자리론', who: '부부합산 소득 7천만원 이하(신혼 8.5천만원 등)', price: 60000, area: null, limit: 36000, ltv: [70, 70], rate: [4.9, 5.2] },
  { name: '보금자리론(생애최초)', who: '생애최초 구입', price: 60000, area: null, limit: 42000, ltv: [70, 80], rate: [4.9, 5.2] },
];
export const POLICY_YEARS = 30;
// 은행 주택담보대출(loans.md 5절): LTV 무주택 규제지역 40%·그 밖 70%, 수도권·규제지역 한도(시가 15억 이하 6억·25억 이하 4억·그 위 2억),
// DSR 40%, 스트레스 금리 규제지역 3.0%·수도권 1.5%(하한)·지방 0.75%, 수도권·규제지역 만기 30년
export const BANK = { dsr: 40, years: 30, ltv: { reg: 40, free: 70 }, stress: { reg: 3.0, capital: 1.5, local: 0.75 } };
export const capOf = (price, capital, reg) => (!capital && !reg ? null : price <= 15e8 ? 6e8 : price <= 25e8 ? 4e8 : 2e8);
// 2025년도 도시근로자 가구원수별 월평균소득 100%(LH 「2026년도 적용」, public.md 6-1·special.md 0절, 원)
export const INCOME = { 3: 7533763, 4: 8802202, 5: 9326985, 6: 9906263 };
export const incomeAt = (n, pct) => Math.round((INCOME[n] * pct) / 100);
// 민영주택 특별공급 소득 기준(special.md 3~5절, 주택공급에 관한 규칙 제35조의3·제41조·제43조) — 우선공급 / 그 밖(초과하면 부동산 3억 3,100만원 이하 추첨)
export const PRIVATE_RULES = [
  { k: 'NWBB_HSHLDCO', name: '신생아', pri: 130, all: 160 },
  { k: 'NWWDS_HSHLDCO', name: '신혼부부', pri: 100, priDual: 120, all: 140, allDual: 160 },
  { k: 'LFE_FRST_HSHLDCO', name: '생애최초', pri: 130, all: 160 },
];
export const PRIVATE_ASSET = 331000000; // 소득 상한을 넘는 신청자의 추첨공급 부동산가액 기준(special.md 0절)
const MOLIT = ['서울', '경기', '인천'];

// ── 계산 ─────────────────────────────────────────
// 원리금균등 월 상환(원)
export const pmt = (loan, ratePct, years) => { const r = ratePct / 100 / 12, n = years * 12; return r ? (loan * r * (1 + r) ** n) / ((1 + r) ** n - 1) : loan / n; };
// 같은 월 상환으로 갚을 수 있는 최대 대출(원)
export const principalOf = (monthly, ratePct, years) => monthly / pmt(1, ratePct, years);
const floorTo = (v, unit) => Math.floor(v / unit) * unit;

// 취득세 등(tax.md 1절, 1주택 유상취득): 6억 이하 1%, 6~9억 (가액×2/3억 − 3)%(소수점 넷째 자리), 9억 초과 3% + 지방교육세(세율의 10%) + 85㎡ 초과 농어촌특별세 0.2%
export function acqTax(price, area) {
  const base = price <= 6e8 ? 1 : price <= 9e8 ? Math.round(((price / 1e8) * (2 / 3) - 3) * 100) / 100 : 3;
  const rate = Math.round((base + base / 10 + (area > 85 ? 0.2 : 0)) * 1000) / 1000;
  return { base, rate, won: Math.round((price * rate) / 100) };
}

// 한국은행 ECOS 121Y006(예금은행 대출금리, 신규취급액) BECBLA0302 주택담보대출 — 최근 달 값. 키가 없으면 저장본
const RATES = join(ROOT, 'data', 'rates.json');
export async function bankRate({ refresh = false } = {}) {
  const saved = await readFile(RATES, 'utf8').then(JSON.parse, () => null);
  if (!refresh) return saved?.mortgage || null;
  const key = process.env.ECOS_KEY || (await readFile(join(ROOT, '.env'), 'utf8').catch(() => '')).match(/^ECOS_KEY=(.+)$/m)?.[1]?.trim();
  if (!key) return saved?.mortgage || null;
  const now = new Date(), ym = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  useApi('ecos');
  const r = await fetch(`https://ecos.bok.or.kr/api/StatisticSearch/${encodeURIComponent(key)}/json/kr/1/12/121Y006/M/${ym(from)}/${ym(now)}/BECBLA0302`);
  const rows = (await r.json()).StatisticSearch?.row || [];
  const last = rows.filter((x) => x.DATA_VALUE).pop();
  if (!last) return saved?.mortgage || null;
  const mortgage = { rate: +last.DATA_VALUE, month: `${last.TIME.slice(0, 4)}-${last.TIME.slice(4)}`, src: '한국은행 ECOS 121Y006 예금은행 대출금리(신규취급액 기준) — 주택담보대출', fetched: now.toISOString().slice(0, 10) };
  await writeFile(RATES, JSON.stringify({ ...(saved || {}), mortgage }, null, 1));
  return mortgage;
}

// 분석 글 한 편의 가정 계산. f = analysis_post.mjs facts(types·detail·item·leasehold·terms·bank)
export function moneyOf(f) {
  const { types, detail: d, item: it, terms: t = {} } = f;
  const capital = MOLIT.includes(it.region), reg = d.flags.includes('투기과열지구') || d.flags.includes('조정대상지역');
  const main = types.find((g) => g.area === f.mainArea) || types[0];
  const won = (man) => man * 10000;
  const rentOf = (area) => t?.landRent?.rows?.find((r) => r.area === area)?.won ?? null;
  const caseFor = (g) => {
    const price = won(g.max), out = [];
    if (t?.balLoan) { // 공고문 잔금 대출 안내(예: 토지임대부 기금 전용 모기지)
      const b = t.balLoan, loan = Math.min(won(b.limit), floorTo((price * b.ltv) / 100, 1));
      out.push({ key: 'notice', name: b.kind, who: '공고문 잔금 대출 안내', rate: b.rate, years: b.years, ltv: b.ltv, limit: won(b.limit), loan });
    }
    for (const p of POLICY) {
      if (price > won(p.price) || (p.area && g.area > p.area)) continue;
      const ltv = p.ltv[capital || reg ? 0 : 1], loan = Math.min(won(p.limit), floorTo((price * ltv) / 100, 1));
      out.push({ key: 'policy', name: p.name, who: p.who, rate: p.rate, years: POLICY_YEARS, ltv, limit: won(p.limit), loan });
    }
    if (f.bank?.rate) {
      const ltv = reg ? BANK.ltv.reg : BANK.ltv.free, cap = capOf(price, capital, reg);
      const loan = Math.min(cap ?? Infinity, floorTo((price * ltv) / 100, 1));
      out.push({ key: 'bank', name: '은행 주택담보대출', who: '무주택 세대', rate: [f.bank.rate, f.bank.rate], years: BANK.years, ltv, limit: cap, loan });
    }
    // 대출액·금리가 같은 정책대출(예: 보금자리론과 생애최초 보금자리론이 LTV에 걸려 같아짐)은 한 줄로
    const merged = [];
    for (const c of out) {
      const same = merged.find((x) => x.key === c.key && x.loan === c.loan && x.rate.join() === c.rate.join() && x.years === c.years);
      if (same) { same.name += ` · ${c.name}`; same.who += ` / ${c.who}`; } else merged.push({ ...c });
    }
    return merged.map((c) => {
      const pay = c.rate.map((r) => pmt(c.loan, r, c.years));
      return { ...c, pay, cash: price - c.loan };
    });
  };
  const cases = caseFor(main);
  // 주택형별 비교의 기준 대출: 공고문 안내 → 은행 → 정책대출 첫 줄
  const pick = (cs) => cs.find((c) => c.key === 'notice') || cs.find((c) => c.key === 'bank') || cs[0] || null;
  const byType = types.map((g) => {
    const c = pick(caseFor(g)), rent = rentOf(g.area);
    return { area: g.area, price: won(g.max), base: c, rent, total: c ? c.pay.map((v) => v + (rent || 0)) : null };
  });
  const price = won(main.max);
  const pay = t?.pay ? { ...t.pay, downWon: Math.round((price * t.pay.down) / 100), midWon: Math.round((price * t.pay.mid) / 100), balWon: Math.round((price * t.pay.bal) / 100) } : null;
  // 소득별 대출 한도(DSR): 3인 이하 가구 도시근로자 월평균소득 70·100·130% 가구가 은행 주담대만 받는다고 가정
  let dsr = null;
  if (f.bank?.rate) {
    const stress = reg ? BANK.stress.reg : capital ? BANK.stress.capital : BANK.stress.local, ltv = reg ? BANK.ltv.reg : BANK.ltv.free, cap = capOf(price, capital, reg);
    dsr = { rate: f.bank.rate, stress, years: BANK.years, ltv, cap, rows: [70, 100, 130].map((pct) => {
      const income = incomeAt(3, pct) * 12, max = floorTo(principalOf((income * BANK.dsr) / 100 / 12, f.bank.rate + stress, BANK.years), 1);
      const loan = Math.min(max, cap ?? Infinity, floorTo((price * ltv) / 100, 1));
      return { pct, income, max, loan, pay: pmt(loan, f.bank.rate, BANK.years), cash: price - loan };
    }) };
  }
  const rent = rentOf(main.area);
  return {
    main: { area: main.area, price }, capital, reg, cases, byType, pay, dsr,
    tax: acqTax(price, main.area),
    rent: rent ? { won: rent, y1: rent * 12, y10: rent * 120, y20: rent * 240 } : null,
    conv: t?.conversion ? t.conversion.rows.map((r) => { const b = byType.find((x) => x.area === r.area)?.base; return { ...r, total: b ? b.pay.map((v) => v + r.after) : null }; }) : null,
  };
}

// ── 대조 ─────────────────────────────────────────
// 월 상환을 공식과 다른 방법으로 다시 구한다: 달마다 이자를 붙이고 갚아 나가 끝에 잔액이 0이 되는 상환액(이분법)
export function payBySchedule(loan, ratePct, years) {
  const r = ratePct / 100 / 12, n = years * 12;
  let lo = loan / n, hi = loan; // 무이자 상환액 ~ 원금 전부
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    let bal = loan;
    for (let i = 0; i < n; i++) bal = bal * (1 + r) - m;
    if (bal > 0) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}
// html: 글 본문, fmt: 본문 금액 표기 함수({ pay: 월 금액, amt: 금액 } 원 → 글자) — 본문에 그 숫자가 실제로 있는지도 본다
export function checkMoney(f, html, fmt) {
  const issues = [], m = moneyOf(f), text = html.replace(/<[^>]+>/g, ' ');
  const near = (a, b) => Math.abs(a - b) < 1; // 원 단위
  for (const c of m.cases) {
    c.rate.forEach((r, i) => {
      if (!near(payBySchedule(c.loan, r, c.years), c.pay[i])) issues.push(`가정 계산: ${c.name} 월 상환 ${Math.round(c.pay[i])}원이 상환 표 검산과 다릅니다`);
      if (!text.includes(fmt.pay(c.pay[i]))) issues.push(`가정 계산: ${c.name} 월 상환 "${fmt.pay(c.pay[i])}"이 본문에 없습니다`);
    });
    if (c.loan > m.main.price || c.loan > (c.limit ?? Infinity) || c.loan > (m.main.price * c.ltv) / 100 + 1) issues.push(`가정 계산: ${c.name} 대출액이 한도·LTV를 넘습니다`);
    if (c.cash !== m.main.price - c.loan) issues.push(`가정 계산: ${c.name} 자기 돈 계산이 맞지 않습니다`);
    if (!text.includes(fmt.amt(c.loan)) || !text.includes(fmt.amt(c.cash))) issues.push(`가정 계산: ${c.name} 대출액·자기 돈이 본문에 없습니다`);
  }
  for (const r of m.dsr?.rows || []) {
    const monthly = payBySchedule(r.max, m.dsr.rate + m.dsr.stress, m.dsr.years) * 12;
    if (Math.abs(monthly - (r.income * BANK.dsr) / 100) > 12) issues.push(`가정 계산: 연 소득 ${r.income}원의 DSR 한도 검산이 맞지 않습니다`);
    if (!text.includes(fmt.amt(r.loan))) issues.push(`가정 계산: DSR 대출액 "${fmt.amt(r.loan)}"이 본문에 없습니다`);
  }
  if (m.pay && m.pay.down + m.pay.mid + m.pay.bal !== 100) issues.push('납부 비율 합이 100%가 아닙니다');
  for (const r of f.terms?.conversion?.rows || []) if (Math.floor((r.before - (r.deposit * r.rate) / 100 / 12) / 10) * 10 !== r.after) issues.push(`보증금 전환 예시(${r.area}㎡) 검산이 맞지 않습니다`);
  for (const [a, v] of Object.entries(f.terms?.prices?.byArea || {})) { const g = f.types.find((x) => x.area === +a); if (g && Math.abs(v.max - g.max * 10000) >= 10000) issues.push(`전용 ${a}㎡ 공고문 최고가가 청약홈 최고가와 다릅니다`); }
  if (m.cases.length && !/가정 계산/.test(text)) issues.push('「가정 계산」 표시가 없습니다');
  return issues;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href; // 다른 스크립트의 --check에서 불릴 때는 돌지 않게
if (isMain && process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  // 기준 글(네이버 카페 고덕강일 글)의 예: 3억원·연 2.5%·40년 → 월 약 99만원
  assert.equal(Math.round(pmt(3e8, 2.5, 40)), 989335);
  assert.ok(Math.abs(payBySchedule(3e8, 2.5, 40) - pmt(3e8, 2.5, 40)) < 1);
  assert.ok(Math.abs(principalOf(pmt(3e8, 2.5, 40), 2.5, 40) - 3e8) < 1);
  // 취득세: 6억 이하 1.1%, 85㎡ 초과 1.3%, 7억 (7×2/3−3)=1.67% → 1.837%, 9억 초과 3.3%
  assert.deepEqual([acqTax(5e8, 84).rate, acqTax(5e8, 101).rate, acqTax(7e8, 84).rate, acqTax(10e8, 84).rate], [1.1, 1.3, 1.837, 3.3]);
  assert.equal(incomeAt(3, 130), 9793892); assert.equal(incomeAt(4, 140), 12323083); // public.md 6-1 표와 같은 값
  // 고덕강일 3단지(공고문 44·81·82쪽): 기금 전용 모기지 5억·LTV 80%·40년·1.9~3.0%, 59㎡ 최고 3억 9,050만원
  const f = { mainArea: 59, leasehold: true, types: [{ area: 49, max: 31724 }, { area: 59, max: 39050 }], detail: { flags: ['투기과열지구', '조정대상지역'] }, item: { region: '서울' }, bank: { rate: 4.66 },
    terms: { balLoan: { kind: '주택도시기금 전용 모기지', limit: 50000, ltv: 80, years: 40, rate: [1.9, 3.0] }, landRent: { rows: [{ area: 49, won: 426000 }, { area: 59, won: 511500 }] }, pay: { down: 10, mid: 0, bal: 90 },
      conversion: { rows: [{ area: 49, before: 426000, ratio: 60, rate: 2.5, deposit: 122000000, after: 171830 }, { area: 59, before: 511500, ratio: 60, rate: 2.5, deposit: 147000000, after: 205250 }] } } };
  const m = moneyOf(f);
  assert.equal(m.cases[0].loan, 312400000); assert.equal(m.cases[0].cash, 78100000);
  assert.deepEqual(m.cases[0].pay.map(Math.round), [929670, 1118343]);
  assert.deepEqual(m.rent, { won: 511500, y1: 6138000, y10: 61380000, y20: 122760000 }); // 기준 글 614만·6,138만·1억 2,276만
  assert.equal(m.pay.downWon, 39050000);
  assert.equal(m.cases.find((c) => c.key === 'bank').loan, 156200000); // 규제지역 LTV 40%
  assert.ok(m.dsr.rows.every((r) => r.loan <= 156200000));
  console.log('money 점검 통과');
} else if (isMain && process.argv.includes('--rates')) {
  console.log(await bankRate({ refresh: true }));
}

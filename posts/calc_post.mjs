// 정책대출 확인기 계산기 페이지(티스토리 일반 글 1편) 본문: rules/에서 만든다 — 숫자 사본을 따로 두지 않는다(설계 15-2, 4-2).
// node posts/calc_post.mjs   → drafts/guide_loan-calculator.json(가이드 글 모양) 쓰고 posts/guide.mjs로 그림·검수까지
// 계산기 화면은 본문에 넣지 않는다. 블로그에서 이 글을 열면 skin/images/calc.js가 주소로 알아보고 본문 앞에 그린다.
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { buildRules } from '../rules/build.mjs';
import { ROOT } from '../tistory/common.mjs';

// 만원 → 문서와 같은 꼴(6천만원, 8.5천만원, 1.3억원, 3억원)
export const man = (n) => (n >= 10000 ? `${+(n / 10000).toFixed(2)}억원` : n % 1000 === 0 ? `${n / 1000}천만원` : n >= 1000 ? `${+(n / 1000).toFixed(1)}천만원` : `${n}만원`);
const vals = (v, labels) => (typeof v === 'number' ? man(v) : Object.entries(v).filter(([k]) => labels[k]).map(([k, x]) => `${labels[k]} ${typeof x === 'number' ? man(x) : `수도권 ${man(x.capital)}·지방 ${man(x.other)}`}`).join(', '));
const region = (v) => (typeof v === 'number' ? man(v) : `수도권 ${man(v.capital)}·지방 ${man(v.other)}`);

// 특공 소득 칸: 규칙의 구간(tiers)에서 만든다. 추첨공급은 표 아래 한 줄로
const pctOf = (w) => w?.pct ?? (w?.all || w?.any || []).map(pctOf).find((x) => x != null);
const pctText = (w) => {
  const dual = (w.any || []).map((x) => ({ on: x.all?.find((l) => l.f === 'dual')?.is, all: x.all })).filter((x) => x.on !== undefined);
  if (!dual.length) return `${pctOf(w)}%`;
  const one = dual.find((x) => !x.on), two = dual.find((x) => x.on);
  return `외벌이 ${pctOf({ all: one.all })}%, 맞벌이 ${pctOf({ all: two.all })}%(부부 각자 ${two.all.find((l) => l.f === 'incSelfMonth').pct}% 이하)`;
};
const incomeCell = (v) => {
  const t = v.tiers.filter((x) => pctOf(x.when) != null && !x.name.startsWith('추첨'));
  if (v.tiers[0].name === '소득 기준 없음') return '소득 기준 없음';
  if (v.tiers.some((x) => x.note)) return `공공 사업주체(LH·지방공사 등)\n85㎡ 이하: ${pctOf(t[0].when)}% 이하\n민간 사업주체: 소득 기준 없음`;
  return t.map((x) => `${x.name.replace('공급', '')} ${pctText(x.when)}`).join('\n');
};
// 숫자는 facts에 있는 것만 쓴다(4-2): 없으면 글을 만들지 않는다
const fact = (p, text) => { if (!p.facts.some((f) => [].concat(f.text).includes(text))) throw new Error(`${p.name} facts에 "${text}" 없음`); return text; };

export function specialSections(rules) {
  const P = Object.fromEntries(rules.special.programs.map((p) => [p.code, p]));
  const bankbook6 = (p) => `청약통장 가입 ${fact(p, '6개월')}(국민 6회 납입, 민영 지역별 예치금)`;
  const who = {
    A1: `공고일 현재 혼인신고 ${fact(P.A1, '7년')} 이내(결혼 예정자는 ${fact(P.A1, '불가')})\n${bankbook6(P.A1)}`,
    A2: `세대 전원이 집을 가진 적 없음(배우자의 혼인신고 전 소유는 예외)\n청약통장 1순위\n근로·사업소득세 통산 ${fact(P.A2, '5년')} 이상 납부, 지금 재직·사업 중이거나 최근 ${fact(P.A2, '1년')} 안에 납부\n국민주택은 저축액 ${fact(P.A2, '600만원')} 이상\n혼인 중이 아니고 미혼 자녀도 없으면 ${fact(P.A2, '추첨공급만')}`,
    A3: `공고일 현재 ${fact(P.A3, '2세 미만')} 자녀(태아·입양 포함)\n청약통장 1순위`,
    A4: `미성년 자녀(태아·입양 포함) ${P.A4.when.all.find((l) => l.f === 'kidsSpecial').v}명 이상\n${bankbook6(P.A4)}`,
    A5: `만 ${fact(P.A5, '65세')} 이상 직계존속(배우자 부모 포함)을 ${fact(P.A5, '3년')} 이상 같은 등본으로 부양\n모시는 부모와 그 배우자도 무주택(60세 이상 예외 없음)\n무주택 ${fact(P.A5, '세대주')}, 청약통장 ${fact(P.A5, '1순위')}`,
  };
  const income = (p, kind) => incomeCell(p.variants.find((v) => v.kinds.includes(kind)));
  const T = rules.incomeTable, won = (n) => `${n.toLocaleString('ko-KR')}원`, I = rules.special.info[0];
  return [
    { h: '특별공급 5종 — 자격과 소득 기준',
      notes: ['민영·국민주택 입주자모집공고 기준이에요. LH 공공분양은 공공주택 특별법 적용 공고가 많고 기준이 달라요. 이런 공고는 계산기 범위 밖이니 공고문에서 확인하세요.', '순서는 상품 번호 순이에요. 소득 %는 아래 금액표의 가구원수별 월평균소득에 대한 비율이에요.'],
      table: { head: [['유형'], ['핵심 조건'], ['민영 소득 기준'], ['국민 소득 기준']], rows: rules.special.programs.slice().sort((a, b) => a.order - b.order).map((p) => [p.name, who[p.code], income(p, 'private'), income(p, 'national')]) } },
    { h: '특별공급 소득 기준 금액', notes: [`${T.label} 기준이에요.`],
      table: { head: [['비율'], ['3인 이하'], ['4인'], ['5인']], rows: Object.keys(T.byPct).map((k) => [`${k}%`, won(T.byPct[k][3]), won(T.byPct[k][4]), won(T.byPct[k][5])]) },
      foot: '6인 이상 금액은 공고문에서 확인하세요. 공고 시점에 따라 적용 연도가 다를 수 있어요.' },
    { h: '특별공급에서 함께 볼 것', notes: [
      '무주택·1회: 세대 전원 무주택이 원칙이고, 특별공급 당첨은 세대당 평생 1회가 원칙이에요.',
      '출생 자녀 예외: 2024년 6월 19일 이후 출생 자녀(태아, 그날 이후 출생자 입양 포함)가 있으면 본인·배우자 이력에 한해 신혼부부·신생아·다자녀·노부모부양을 한 차례 더 신청할 수 있어요. 생애최초는 빠져요. 이 예외로 신청하는 사람(본인·배우자 특별공급 이력 있음)이 집을 가졌다면 소유권이전등기 전까지 기존 집을 처분하는 조건이에요. 특별공급 이력이 없으면 집에 대한 이 예외는 해당하지 않아요.',
      '혼인 전 이력: 배우자의 혼인 전 당첨 이력은 신혼부부·신생아·생애최초에서 보지 않아요. 본인의 혼인 전 당첨 이력이 있어도 신혼부부는 한 차례 신청할 수 있어요.',
      '재당첨 제한: 평생 1회와 별개예요. 예전 당첨 주택에 따라 제한이 1~10년 남아 있을 수 있어 청약홈 청약제한사항 확인에서 보세요.',
      '1순위: 생애최초·신생아·노부모부양은 1순위가 필요해요. 투기과열지구·청약과열지역 공고의 1순위는 세대주여야 하고 가입 2년, 과거 5년 내 당첨 없음도 필요해요.',
      `추첨공급: 신혼부부·생애최초·신생아는 소득 기준을 넘어도 세대 부동산이 ${fact(P.A1, '3억 3,100만원')} 이하면 추첨공급을 볼 수 있어요. 맞벌이 신혼부부는 부부 각자 100% 한도가 추첨에도 걸리는지 운용지침과 청약홈 표현이 달라 공고문을 확인하세요.`,
      `생애최초 1인가구: 혼인 중이 아니고 같은 등본에 미혼 자녀도 없으면 부모와 같은 등본이어도 1인가구로 봐요. 단독세대는 전용 ${fact(P.A2, '60㎡')} 이하만이에요. 직계존속과 같은 등본이면 규칙과 청약홈 표현이 달라 공고문을 확인하세요.`,
      `${I.name}: ${I.text}`,
    ] },
  ];
}

export function draftOf(rules, today) {
  const active = rules.loans.filter((p) => p.offer === 'active').sort((a, b) => a.order - b.order);
  // 공시일별 금리는 가장 늦은 공시(글은 공개 뒤 읽히므로). 공시일을 함께 적는다
  const rate = (p) => (p.rate.byDate ? `${p.rate.byDate.at(-1).text} — ${p.rate.byDate.at(-1).from} 공시` : p.rate.text);
  const labels = (p) => Object.fromEntries(p.variants.filter((v) => v.list !== false).flatMap((v) => [[v.key, v.label], ...(v.keyIf ? [[v.keyIf.then, `${v.label}(생애최초)`]] : [])]));
  const row = (p) => {
    const L = labels(p), f = p.facts;
    const who = f.inc ? `${vals(f.inc.v, L)}${f.inc.onePerson ? ` (신혼은 부부 중 1인 ${man(Object.values(f.inc.onePerson)[0])} 이하도 가능)` : ''}` : '소득 요건 없음';
    const lim = [f.price && `집값 ${vals(f.price.v, L)} 이하`, f.depositMax && `보증금 ${typeof f.depositMax.v === 'number' || 'capital' in f.depositMax.v ? region(f.depositMax.v) : vals(f.depositMax.v, L)} 이하`].filter(Boolean).join(' · ');
    const cap = [typeof f.cap.v === 'number' || 'capital' in f.cap.v ? region(f.cap.v) : vals(f.cap.v, L), ...(f.cap.pick || []).map((x) => x.text)].join(', ');
    return [[p.name, p.org], who, lim || '—', cap, rate(p)];
  };
  const head = [['상품'], ['소득 기준(부부합산)'], ['집값·보증금 상한'], ['한도(최대)'], ['정책 금리']];
  const group = (g) => ({ head, rows: active.filter((p) => p.group === g).map(row) });
  const other = rules.loans.filter((p) => p.offer !== 'active').sort((a, b) => a.order - b.order);
  const byId = Object.fromEntries(rules.loans.map((p) => [p.id, p.name]));
  const status = { ended: '신규 취급 종료', unverified: '취급 여부 확인 필요', planned: '출시 예정' };
  const docs = [...new Set(rules.loans.flatMap((p) => [p.facts && Object.values(p.facts).map((f) => f.doc), p.rate?.doc, ...(p.rate?.byDate || []).map((r) => r.doc), p.doc]).flat().filter(Boolean).map((d) => `docs/policy/${d.split('#')[0]}`)), 'docs/policy/special.md'];
  const sources = [...active.map((p) => ({ name: `${p.org} ${p.name}`, url: p.links.official })), { name: '청약홈 특별공급 안내', url: rules.special.diagUrl }];
  return {
    type: 'guide', category: '대출·정책', slug: 'loan-calculator',
    title: '정책대출 조건 한눈에 보기(2026년) — 디딤돌·보금자리론·버팀목 12종, 내 조건으로 예비 확인',
    thumbTitle: '정책대출 12종\n조건 한눈에',
    subtitle: '구입 8종 · 전세 4종 · 소득 기준 · 한도 · 정책 금리 범위',
    thumbStats: [['구입·전세', `${active.length}종`]],
    tags: ['정책대출', '디딤돌대출', '보금자리론', '버팀목전세자금대출', '신생아특례대출', '청년전세대출', '신혼부부대출', '주택도시기금', '대출조건', '대출·정책'],
    checked: active.reduce((m, p) => (!m || p.checked < m ? p.checked : m), '') || today, // 가장 오래된 확인일(2-4)
    factsDoc: docs,
    answer: '국가 정책대출은 집 살 때 8종, 전세 4종이 지금 신규로 취급돼요. 상품마다 소득·집값(보증금)·한도가 달라, 아래 표로 먼저 맞는 상품을 고르고 신청 방법은 상품별 글에서 확인하세요.',
    intro: [
      '이 페이지는 주택도시기금·한국주택금융공사가 지금 신규로 취급하는 정책대출의 기본 조건을 한 표로 모았어요. 은행 자체 상품과 시중 금리는 다루지 않아요. 아래쪽에는 민영·국민주택 특별공급 5종의 자격과 소득 기준도 함께 실었어요.',
      '블로그에서 이 글을 열면 제목 아래에 내 조건(혼인·자녀·소득·집값 등)을 넣어 정책대출과 특별공급 자격을 예비 확인하는 계산기가 나와요. 입력값은 저장하거나 보내지 않아요.',
      '금리는 상품마다 공식 정책 금리 범위만 적었어요. 실제 금리는 소득·만기·우대에 따라, 실제 한도는 은행·기금 심사(담보평가·신용·보증)로 정해져요.',
    ],
    sections: [
      { h: '집 살 때 — 정책대출 8종', notes: ['순서는 상품 번호 순이에요(금리·한도 순 아님). 생애최초·신혼·자녀 수에 따라 같은 상품 안에서도 한도가 달라요.'], table: group('buy'),
        foot: '공통: 무주택 세대주(보금자리론은 1주택 처분 조건 가능), 순자산 5.11억원 이하(디딤돌 계열, 2026년도 기준). 수도권 아파트 디딤돌은 한도에서 소액임차보증금을 빼요.' },
      { h: '전세 — 정책대출 4종', notes: ['한도는 상품 한도와 보증금 비율 가운데 작은 금액이에요. 보증기관(HUG·HF·SGI) 한도와 은행 심사는 따로예요.'], table: group('jeonse'),
        foot: '공통: 무주택 세대주, 순자산 3.45억원 이하(2026년도 기준), 보증금 5% 이상 낸 계약, 지금 쓰는 기금·은행 전세대출·주택담보대출이 없어야 해요.' },
      ...specialSections(rules),
      { h: '신규 취급이 끝났거나 확인이 필요한 상품', notes: ['아래 상품은 계산기에서 판정하지 않고 대신 볼 상품을 안내해요.'],
        table: { head: [['상품'], ['상태'], ['안내'], ['대신 볼 상품']], rows: other.map((p) => [p.name, status[p.offer], p.offerNote, (p.instead || []).map((x) => byId[x]).join(', ')]) } },
      { h: '계산기가 보는 것과 보지 않는 것', notes: [
        '보는 것: 집 보유·혼인·자녀·나이·세대주 여부·가구원 수·작년 총급여(부부)·집값 또는 보증금·지역·면적·순자산 구간·지금 쓰는 대출.',
        '보지 않는 것: 신용점수, DSR 등 은행 심사, 보증기관 한도, 선순위 채권, 우대금리별 개인 금리. 그래서 결과는 「예비 확인」이고 최대 예상 금액은 상품 한도·LTV·DTI·보증금 비율로만 계산해요.',
        '특별공급 탭은 무주택·혼인·자녀·청약통장·세대주·소득·당첨 이력을 봐요. 공고별 지역 우선, 배점, 경쟁 결과는 보지 않아요.',
        '기준값 근처(±3% 안)이거나 답하지 않은 칸이 있으면 「확인 필요」로 보여요. 틀리게 「해당」으로 보이느니 확인을 권하는 쪽으로 정했어요.'] },
    ],
    faq: [
      { q: '정책대출과 은행 주택담보대출은 뭐가 다른가요?', a: '정책대출은 주택도시기금·한국주택금융공사 재원으로 소득·집값 기준을 두고 정해진 정책 금리를 적용해요. 은행 대출은 은행이 금리와 한도를 정해요.' },
      { q: '디딤돌과 보금자리론을 같이 볼 수 있나요?', a: '조건이 맞으면 둘 다 계산 결과에 나와요. 실제로는 한 집에 한 상품을 고르게 되니 한도·금리·의무(전입·실거주)를 비교해 정하세요.' },
      { q: '특별공급 결과가 「공통 요건 충족」이면 신청해도 되나요?', a: '입력하신 값으로만 본 예비 확인이에요. 실제 자격은 입주자모집공고와 기관 심사에서 정해지니, 신청 전 공고문과 청약홈에서 확인하세요.' },
      { q: '계산기 결과가 「해당」이면 대출이 되나요?', a: '아니에요. 입력하신 값으로만 본 예비 확인이에요. 실제 대상·한도는 취급은행·기금 심사에서 정해져요.' },
    ],
    sources,
  };
}

async function main() {
  const rules = await buildRules();
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const d = draftOf(rules, today);
  const p = join(ROOT, 'drafts', 'guide_loan-calculator.json');
  await writeFile(p, JSON.stringify(d, null, 2));
  console.log(`${p} 씀 — posts/guide.mjs로 그림·검수`);
  execFileSync(process.execPath, [join(ROOT, 'posts', 'guide.mjs'), 'drafts/guide_loan-calculator.json'], { stdio: 'inherit', cwd: ROOT }); // 그림 경로는 저장소 기준 상대 경로(draft.mjs)
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) main().catch((e) => { console.error(e.message); process.exit(1); });

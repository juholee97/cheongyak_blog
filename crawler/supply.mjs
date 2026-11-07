// 청약홈 주택형 자료(getAPTLttotPblancMdl 행)에서 공급 세대를 읽는 공용 함수.
// posts/analysis_post.mjs(분석 글)와 crawler/fetch.mjs(notices.json)가 함께 쓴다. fetch.mjs가 분석 글의 무거운 의존성을 끌어오지 않게 여기 둔다.

// 특별공급 유형별 세대 칸(키 + 이름)
export const SP = [['NWBB_HSHLDCO', '신생아'], ['NWWDS_HSHLDCO', '신혼부부'], ['LFE_FRST_HSHLDCO', '생애최초'], ['YGMN_HSHLDCO', '청년'], ['MNYCH_HSHLDCO', '다자녀'], ['OLD_PARNTS_SUPORT_HSHLDCO', '노부모부양'], ['INSTT_RECOMEND_HSHLDCO', '기관추천'], ['TRANSR_INSTT_ENFSN_HSHLDCO', '이전기관'], ['ETC_HSHLDCO', '그 밖']];

const num = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0;
const ar = (ty) => +String(ty).slice(0, 3); // "049.0000A" → 49(전용)

// 주택형(전용 정수)별로 묶고, 유형 합이 특별공급 수와 맞는지 검산
export function supplyOf(models) {
  const by = new Map();
  for (const m of models) {
    const a = ar(m.HOUSE_TY), g = by.get(a) || { area: a, general: 0, special: 0, sp: Object.fromEntries(SP.map(([k]) => [k, 0])) };
    g.general += +m.SUPLY_HSHLDCO || 0; g.special += +m.SPSPLY_HSHLDCO || 0;
    for (const [k] of SP) g.sp[k] += +m[k] || 0;
    by.set(a, g);
  }
  const rows = [...by.values()].sort((x, y) => x.area - y.area);
  return { rows, ok: rows.every((g) => Object.values(g.sp).reduce((s, v) => s + v, 0) === g.special) };
}

// 주택형 한 줄(notices.json types[]): 응답 순서 그대로, 전용면적 소수 유지. 금액은 만원.
// spOk: 유형 합 = 특별공급 수. 신혼희망타운처럼 유형 칸이 모두 0인데 특별공급이 있으면 false
export function typeOf(m) {
  const spBy = Object.fromEntries(SP.map(([k]) => [k.replace(/_HSHLDCO$/, ''), num(m[k])]));
  const sp = num(m.SPSPLY_HSHLDCO);
  return {
    ty: String(m.HOUSE_TY || '').trim(),
    ex: parseFloat(m.HOUSE_TY) || null,
    sa: num(m.SUPLY_AR) || null,
    top: num(m.LTTOT_TOP_AMOUNT) || null,
    gen: num(m.SUPLY_HSHLDCO), sp, spBy,
    spOk: Object.values(spBy).reduce((s, v) => s + v, 0) === sp,
  };
}

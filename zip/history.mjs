// 같은 단지의 지난 청약홈 공고(최초 분양·이전 무순위)와 분양가: node zip/history.mjs "힐스테이트 레이크 송도"
// 키는 코드 안에서만 쓰고 찍지 않는다.
import { dataKey } from '../posts/trades.mjs';
import { useApi } from './guard.mjs';
const q = process.argv[2];
if (!q) { console.log('사용: node zip/history.mjs "단지명 일부"'); process.exit(4); }
const key = await dataKey(), B = 'https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/';
const get = async (op, cond) => {
  useApi('datago'); // 호출 한도 가드
  const u = new URL(B + op); u.searchParams.set('serviceKey', key); u.searchParams.set('returnType', 'JSON'); u.searchParams.set('perPage', 50);
  for (const [k, v] of Object.entries(cond)) u.searchParams.set(k, v);
  const r = await fetch(u); return r.ok ? (await r.json()).data || [] : [];
};
let found = 0;
for (const [det, mdl, label] of [['getAPTLttotPblancDetail', 'getAPTLttotPblancMdl', 'APT 분양'], ['getRemndrLttotPblancDetail', 'getRemndrLttotPblancMdl', '무순위']]) {
  const rows = await get(det, { 'cond[HOUSE_NM::LIKE]': q });
  for (const d of rows.sort((a, b) => (a.RCRIT_PBLANC_DE < b.RCRIT_PBLANC_DE ? -1 : 1))) {
    found++;
    const m = await get(mdl, { 'cond[HOUSE_MANAGE_NO::EQ]': d.HOUSE_MANAGE_NO });
    const top = m.map((x) => `${String(x.HOUSE_TY).slice(0, 7)} ${x.LTTOT_TOP_AMOUNT}만`).join(' / ');
    console.log(`${label} ${d.HOUSE_MANAGE_NO} ${d.HOUSE_NM} | 공고 ${d.RCRIT_PBLANC_DE} | 접수 ${d.SUBSCRPT_RCEPT_BGNDE || d.GNRL_RNK1_CRSPAREA_RCEPT_BGNDE || ''} | ${d.TOT_SUPLY_HSHLDCO}세대 | ${d.HOUSE_SECD_NM || ''} | ${top}`);
  }
}
if (!found) console.log('이전 공고 없음');

// 청약홈 공식 공고 요약 출력(키는 코드 안에서만 쓰고 찍지 않는다): node zip/official.mjs 2026000532
import { odcloud } from '../posts/analysis_post.mjs';
import { dataKey } from '../posts/trades.mjs';
const no = process.argv[2];
if (!/^\d{10}$/.test(no || '')) { console.log('사용: node zip/official.mjs 공고번호(10자리)'); process.exit(4); }
const key = await dataKey();
const KEEP = ['HOUSE_NM', 'HOUSE_SECD_NM', 'HOUSE_DTL_SECD_NM', 'RENT_SECD_NM', 'BSNS_MBY_NM', 'CNSTRCT_ENTRPS_NM', 'HSSPLY_ADRES', 'TOT_SUPLY_HSHLDCO', 'RCRIT_PBLANC_DE', 'SPSPLY_RCEPT_BGNDE', 'GNRL_RNK1_CRSPAREA_RCEPT_BGNDE', 'GNRL_RNK1_ETC_AREA_RCEPT_BGNDE', 'GNRL_RNK2_CRSPAREA_RCEPT_BGNDE', 'SUBSCRPT_RCEPT_BGNDE', 'SUBSCRPT_RCEPT_ENDDE', 'PRZWNER_PRESNATN_DE', 'CNTRCT_CNCLS_BGNDE', 'CNTRCT_CNCLS_ENDDE', 'MVN_PREARNGE_YM', 'SPECLT_RDN_EARTH_AT', 'MDAT_TRGET_AREA_SECD', 'PARCPRC_ULS_AT', 'PUBLIC_HOUSE_EARTH_AT', 'LRSCL_BLDLND_AT', 'NPLN_PRVOPR_PUBLIC_HOUSE_AT', 'PBLANC_URL', 'HMPG_ADRES', 'MDHS_TELNO'];
let found = false;
for (const [det, mdl] of [['getAPTLttotPblancDetail', 'getAPTLttotPblancMdl'], ['getRemndrLttotPblancDetail', 'getRemndrLttotPblancMdl']]) {
  const d = (await odcloud(det, no, key))[0];
  if (!d) continue;
  console.log(`# ${det}`);
  for (const k of KEEP) if (d[k] != null && d[k] !== '') console.log(`${k} = ${d[k]}`);
  const m = await odcloud(mdl, no, key);
  for (const x of m) console.log(`MODEL ${x.HOUSE_TY} 공급 ${x.SUPLY_AR}㎡ 일반 ${x.SUPLY_HSHLDCO ?? ''} 특별 ${x.SPSPLY_HSHLDCO ?? ''} 최고분양가 ${x.LTTOT_TOP_AMOUNT}만원`);
  found = true; break;
}
if (!found) console.log('청약홈 API에 공고 없음');

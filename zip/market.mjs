// 심층 분석 글 「지금 시장」 칸 자료(2026-11-02 사용자 지시: 정책·거시·지금 시장과 이 청약의 관계를 함께 보라): 단지가 속한 시·군·구의 아파트 매매 흐름을
// 국토교통부 실거래가 API로 직접 계산한다 — 분기별 거래량·전용 3.3㎡당 중앙값, 2021년 이후 고점 대비 지금, 최근 12개월 거래량 변화, 분양권 거래, 신축(준공 5년 이내) 가격.
// node zip/market.mjs <시군구코드 5자리 | 주소>   → data/market/<코드>.json + 글자 요약(세션이 글에 옮긴다). 금리는 data/rates.json(한국은행 ECOS)을 함께 찍는다
// 실거래 캐시(data/rtms_cache/<종류>_<코드>_<연월>.json)는 posts/trades.mjs와 같은 파일을 쓴다 — 지난 달은 다시 받지 않는다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { dataKey, parseItems, perPy, locate } from '../posts/trades.mjs';
import { keyOf } from '../posts/map.mjs';
import { useApi } from './guard.mjs';

const URL_OF = { apt: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev', silv: 'https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade', rent: 'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent' };
// 전월세: 보증금·월세(만원). 월세 0 = 전세
const tag = (x, t) => (x.match(new RegExp(`<${t}>([^<]*)</${t}>`)) || [])[1]?.trim() ?? '';
const parseRent = (xml) => [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, x]) => ({ ar: +tag(x, 'excluUseAr'), deposit: +tag(x, 'deposit').replace(/,/g, ''), rent: +tag(x, 'monthlyRent').replace(/,/g, '') || 0, built: +tag(x, 'buildYear') || null }));
const FROM = '2021-01'; // 전고점(2021~2022)을 담는 시작 달

async function monthItems(lawd, ym, key, kind) {
  const f = join(ROOT, 'data/rtms_cache', `${kind}_${lawd}_${ym.replace('-', '')}.json`), today = new Date().toISOString().slice(0, 10);
  const hit = JSON.parse(await readFile(f, 'utf8').catch(() => 'null'));
  if (hit && (ym < today.slice(0, 7) || hit.at === today)) return hit.items;
  const out = [];
  for (let page = 1; page <= 10; page++) {
    useApi('datago');
    const r = await fetch(`${URL_OF[kind]}?serviceKey=${encodeURIComponent(key)}&LAWD_CD=${lawd}&DEAL_YMD=${ym.replace('-', '')}&pageNo=${page}&numOfRows=1000`);
    const xml = await r.text();
    if (!r.ok || !/<resultCode>0*0<\/resultCode>/.test(xml)) throw new Error(`실거래 API ${ym} 응답 이상(HTTP ${r.status})`); // URL에 키가 있어 찍지 않는다
    const items = kind === 'rent' ? parseRent(xml) : parseItems(xml);
    out.push(...items);
    if (items.length < 1000) break;
  }
  await mkdir(join(ROOT, 'data/rtms_cache'), { recursive: true });
  await writeFile(f, JSON.stringify({ at: today, items: out }));
  return out;
}

const months = (from, to) => { const out = []; for (let [y, m] = from.split('-').map(Number); `${y}-${String(m).padStart(2, '0')}` <= to; m === 12 ? (y++, m = 1) : m++) out.push(`${y}-${String(m).padStart(2, '0')}`); return out; };
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const qOf = (ym) => `${ym.slice(0, 4)}Q${Math.ceil(+ym.slice(5) / 3)}`;
const valid = (t) => !t.cancelled && !t.direct && t.amount && t.ar;
const pct = (a, b) => (a && b ? Math.round((a / b - 1) * 1000) / 10 : null);

// 순수 계산(검사 가능): 달별 거래 목록 → 요약
export function summarizeMarket(byMonth, silvByMonth, now, rentByMonth = {}) {
  const all = Object.entries(byMonth).flatMap(([ym, xs]) => xs.filter(valid).map((t) => ({ ...t, ym })));
  const quarters = {};
  for (const t of all) (quarters[qOf(t.ym)] ||= []).push(t);
  const thisQ = qOf(now.slice(0, 7));
  const q = Object.entries(quarters).sort(([a], [b]) => a.localeCompare(b)).map(([k, xs]) => ({ q: k, count: xs.length, perPy: median(xs.map((t) => perPy(t.amount, t.ar))), partial: k === thisQ }));
  const full = q.filter((x) => !x.partial && x.count >= 30); // 거래가 너무 적은 분기는 중앙값이 흔들린다
  const peak = full.reduce((a, b) => (b.perPy > (a?.perPy || 0) ? b : a), null), last = full.at(-1);
  const cur = now.slice(0, 7), back = (n) => { const [y, m] = cur.split('-').map(Number), t = y * 12 + m - 1 - n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const last12 = months(back(12), back(1)), prev12 = months(back(24), back(13)); // 이번 달(진행 중)은 뺀다
  const cnt = (list) => list.reduce((s, m) => s + (byMonth[m] || []).filter(valid).length, 0);
  const y = +now.slice(0, 4), recent = all.filter((t) => last12.includes(t.ym));
  const silv = Object.values(silvByMonth).flat().filter(valid);
  const jeonse = (list) => median(list.flatMap((m) => (rentByMonth[m] || []).filter((r) => !r.rent && r.deposit && r.ar).map((r) => perPy(r.deposit, r.ar))));
  const j12 = jeonse(last12), jPrev = jeonse(prev12), all12 = median(recent.map((t) => perPy(t.amount, t.ar)));
  return {
    quarters: q,
    peak: peak && { q: peak.q, perPy: peak.perPy }, last: last && { q: last.q, perPy: last.perPy, count: last.count }, fromPeak: pct(last?.perPy, peak?.perPy),
    trades12: cnt(last12), trades12prev: cnt(prev12), tradesChange: pct(cnt(last12), cnt(prev12)), window: `${last12[0]}~${last12.at(-1)}`,
    new5: (() => { const xs = recent.filter((t) => t.built && t.built >= y - 5); return { count: xs.length, perPy: median(xs.map((t) => perPy(t.amount, t.ar))) }; })(),
    all12,
    jeonse12: j12, jeonsePrev: jPrev, jeonseChange: pct(j12, jPrev), jeonseRatio: j12 && all12 ? Math.round((j12 / all12) * 1000) / 10 : null, // 전세가율 = 전세 중앙값 ÷ 매매 중앙값(같은 12개월)
    silv12: { count: silv.length, perPy: median(silv.map((t) => perPy(t.amount, t.ar))) },
  };
}

export async function market(lawd, { now = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) } = {}) { // 한국 날짜
  const key = await dataKey();
  if (!key) throw new Error('.env DATA_GO_KR_KEY 없음');
  const ms = months(FROM, now.slice(0, 7)), byMonth = {}, silvByMonth = {};
  for (const m of ms) byMonth[m] = await monthItems(lawd, m, key, 'apt');
  for (const m of ms.slice(-13, -1)) silvByMonth[m] = await monthItems(lawd, m, key, 'silv');
  const rentByMonth = {};
  for (const m of ms.slice(-25, -1)) rentByMonth[m] = await monthItems(lawd, m, key, 'rent');
  const rate = JSON.parse(await readFile(join(ROOT, 'data/rates.json'), 'utf8').catch(() => '{}')).mortgage || null;
  const out = { lawd, at: now, src: '국토교통부 아파트 매매·분양권 전매·전월세 실거래가(해제·직거래 제외, 전용 3.3㎡당 중앙값)', ...summarizeMarket(byMonth, silvByMonth, now, rentByMonth), rate };
  await mkdir(join(ROOT, 'data/market'), { recursive: true });
  await writeFile(join(ROOT, 'data/market', `${lawd}.json`), JSON.stringify(out, null, 1));
  return out;
}

export const marketText = (m) => [
  `시군구 ${m.lawd} (${m.at} 기준, ${m.src})`,
  `분기별 거래량·3.3㎡당 중앙값(만원): ${m.quarters.map((x) => `${x.q}${x.partial ? '(진행 중)' : ''} ${x.count}건 ${x.perPy}`).join(' / ')}`,
  `2021년 이후 고점: ${m.peak?.q} ${m.peak?.perPy}만원 → 최근 완결 분기 ${m.last?.q} ${m.last?.perPy}만원 (고점 대비 ${m.fromPeak}%)`,
  `최근 12개월(${m.window}) 거래 ${m.trades12}건, 그 전 12개월 ${m.trades12prev}건 (${m.tradesChange}%)`,
  `최근 12개월 3.3㎡당 중앙값: 전체 ${m.all12}만원, 준공 5년 이내 ${m.new5.perPy}만원(${m.new5.count}건), 분양권 ${m.silv12.perPy}만원(${m.silv12.count}건)`,
  `전세 3.3㎡당 보증금 중앙값: 최근 12개월 ${m.jeonse12}만원, 그 전 12개월 ${m.jeonsePrev}만원 (${m.jeonseChange}%), 전세가율 약 ${m.jeonseRatio}%`,
  m.rate && `주택담보대출 금리 ${m.rate.rate}% (${m.rate.month}, ${m.rate.src})`,
].filter(Boolean).join('\n');

if (process.argv[1]?.endsWith('market.mjs')) {
  const a = process.argv[2];
  if (a === '--self-check') {
    const t = (ym, amount, built = 2010) => ({ ym, amount, ar: 84, built, cancelled: false, direct: false });
    const by = { '2021-10': Array(40).fill(t('2021-10', 100000)), '2024-01': Array(40).fill(t('2024-01', 80000)), '2025-11': Array(10).fill(t('2025-11', 85000, 2024)), '2026-10': Array(20).fill(t('2026-10', 90000)), '2026-11': [t('2026-11', 99999)] };
    const s = summarizeMarket(by, {}, '2026-11-02');
    const { strict: assert } = await import('node:assert');
    assert.equal(s.peak.q, '2021Q4'); assert.equal(s.last.q, '2024Q1'); assert.equal(s.fromPeak, -20); // 30건 미만 분기는 고점·최근 계산에서 빠진다
    assert.equal(s.quarters.at(-1).partial, true); assert.equal(s.trades12, 30); assert.equal(s.new5.count, 10);
    console.log('market self-check ok');
  } else if (!a) console.log('node zip/market.mjs <시군구코드 5자리 | 주소> | --self-check');
  else {
    const lawd = /^\d{5}$/.test(a) ? a : (await locate(a, await keyOf()))?.lawd;
    if (!lawd) { console.log('시군구코드를 못 찾음'); process.exit(1); }
    console.log(marketText(await market(lawd)));
  }
}

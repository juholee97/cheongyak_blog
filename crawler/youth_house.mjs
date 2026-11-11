// 청년안심주택 단지의 건물 유형 → crawler/youth_house.json(주소 → 건축물대장 표제부 요약). 달력 「주택 종류」 칸에 쓴다(2026-11-11 사용자).
// 공고 본문·서울시 단지 목록에는 건물 유형이 없다. 건축HUB 건축물대장(15134735)을 주소로 찾는다.
// 지번 코드를 얻는 브이월드 키가 .env에만 있어 로컬에서 돌리고 결과를 저장소에 올린다(sh_attach.json과 같은 방식). 대장에 없는 단지는 달력에서 기본값 「아파트」.
// 실행: crawler\push_house.bat (node --env-file=.env crawler/youth_house.mjs). 이미 찾은 주소는 다시 부르지 않는다.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { useApi, isBudgetError } from '../zip/guard.mjs';

const FILE = new URL('./youth_house.json', import.meta.url);
const SCHEDULE = 'https://juholee97.github.io/cheongyak_blog/schedule.json';
const sleep = (n) => new Promise((f) => setTimeout(f, n));

// 대장의 기타용도 → 달력 칸. 아파트가 있으면(혼합 포함) 아파트, 도시형생활주택만 있으면 도시형, 「공동주택 외 1」처럼 세부가 없으면 null(달력 기본값)
export const houseOf = (etc) => (/아파트/.test(etc || '') ? '아파트' : /도시형/.test(etc || '') ? '도시형' : null);
// 「… 503번지」「… 166외 7필지」「… 83-3 일원」「… (6호선 …)」 → 주소 본체. 숫자 뒤의 「외」만 자른다(외발산동 같은 동 이름 보호)
export const cleanAddr = (a) => String(a || '').replace(/\s*\(.*$/, '').replace(/번지/g, '').replace(/(\d)\s*외.*$/, '$1').replace(/\s*일원.*$/, '').trim();
// 지번 주소면 본번·부번(「개봉동 503」「광희동1가 166」 「상봉동 116-49」). 도로명이면 null
export const jibunOf = (a) => { const m = /[가-힣]+동\d?가?\s+(\d+)(?:-(\d+))?$/.exec(a); return m ? { bun: m[1], ji: m[2] || '0' } : null; };
const compact = (s) => String(s || '').replace(/\s*\(.*$/, '').replace(/\s/g, '').replace(/^서울시/, '서울특별시');
// 도로명 주소가 대장의 도로명과 같은가. 좌표로 얻은 지번은 옆 필지로 빗나갈 수 있어(봉천동 854-7 → 실제 854-3) 도로명으로 확인한다
export const sameRoad = (plat, addr) => !!compact(plat) && compact(plat) === compact(addr);

async function vworld(key, q) {
  useApi('vworld');
  const u = new URL('https://api.vworld.kr/req/address');
  for (const [k, v] of Object.entries({ service: 'address', version: '2.0', crs: 'epsg:4326', format: 'json', key, ...q })) u.searchParams.set(k, v);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`브이월드 HTTP ${r.status}`); // 주소를 넣지 않는다(key)
  return (await r.json()).response;
}

async function titles(key, code, q) {
  for (let i = 0; i < 4; i++) { // 대장 API는 503을 자주 돌려준다(2026-11-11 표본 42건 중 6건)
    useApi('datago');
    const u = new URL('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo');
    for (const [k, v] of Object.entries({ serviceKey: key, sigunguCd: code.slice(0, 5), bjdongCd: code.slice(5, 10), platGbCd: '0', numOfRows: '300', pageNo: '1', _type: 'json', ...q })) u.searchParams.set(k, v);
    const r = await fetch(u), t = await r.text();
    if (r.ok && /^\s*[[{]/.test(t)) { const it = JSON.parse(t).response?.body?.items?.item; return it ? [it].flat() : []; }
    await sleep(1500);
  }
  throw new Error('건축물대장 응답 실패');
}

const mainOf = (rows) => rows.filter((x) => x.mainAtchGbCd === '0').sort((a, b) => (+b.totArea || 0) - (+a.totArea || 0))[0];

async function lookup(address, dataKey, vKey) {
  const addr = cleanAddr(address), jb = jibunOf(addr);
  const c = await vworld(vKey, { request: 'getcoord', address: addr, type: jb ? 'parcel' : 'road', refine: 'true', simple: 'false' });
  if (c.status !== 'OK') return null;
  const p = await vworld(vKey, { request: 'getAddress', point: `${c.result.point.x},${c.result.point.y}`, type: 'parcel', zipcode: 'false', simple: 'false' });
  const st = p.result?.[0]?.structure;
  if (!st?.level4LC) return null;
  if (jb) return mainOf(await titles(dataKey, st.level4LC, { bun: jb.bun.padStart(4, '0'), ji: jb.ji.padStart(4, '0') }));
  const bun = /^\d+/.exec(st.level5 || '')?.[0];
  if (!bun) return null;
  return mainOf((await titles(dataKey, st.level4LC, { bun: bun.padStart(4, '0') })).filter((x) => sameRoad(x.newPlatPlc, addr)));
}

async function main() {
  let dataKey = process.env.DATA_GO_KR_KEY || '';
  const vKey = process.env.VWORLD_KEY || '';
  if (!dataKey || !vKey) throw new Error('.env에 DATA_GO_KR_KEY·VWORLD_KEY가 필요합니다.');
  if (/%[0-9a-f]{2}/i.test(dataKey)) dataKey = decodeURIComponent(dataKey);
  const store = JSON.parse(await readFile(FILE, 'utf8').catch(() => '{}'));
  const sched = await (await fetch(SCHEDULE)).json();
  const addrs = [...new Set(sched.items.filter((it) => /^youth-/.test(it.id) && it.address).map((it) => it.address))].filter((a) => !store[a]?.etc);
  let found = 0;
  for (const a of addrs) {
    try {
      const b = await lookup(a, dataKey, vKey);
      if (b) { found++; store[a] = { house: houseOf(b.etcPurps), etc: String(b.etcPurps || '').trim(), bld: String(b.bldNm || '').trim(), plat: String(b.newPlatPlc || b.platPlc || '').trim(), hhld: +b.hhldCnt || 0 }; }
      else store[a] = { house: null };
      console.log(`${b ? '찾음' : '없음'} ${a} ${b ? `${store[a].house || '세부 없음'} (${store[a].etc})` : ''}`);
    } catch (e) {
      console.warn(`실패 ${a}: ${e.message}`);
      if (isBudgetError(e)) break;
    }
    await sleep(250);
  }
  await writeFile(FILE, JSON.stringify(store, null, 1) + '\n');
  const vals = Object.values(store);
  console.log(`조회 ${addrs.length}건 중 ${found}건 찾음 · 저장 ${vals.length}곳(아파트 ${vals.filter((v) => v.house === '아파트').length}, 도시형 ${vals.filter((v) => v.house === '도시형').length}, 세부 없음·미확인 ${vals.filter((v) => !v.house).length})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });

// 우리의 집 「분양 시세비교」 목록 옆 칸의 단지 조감도(2026-10-29 사용자 요청: 정보 제공 목적 — 출처는 사업주체 분양 홈페이지로 밝힌다)
// node zip/views.mjs [--only 공고번호,…] [--force]  → data/zip_views/<번호>.jpg(800×500, 가운데 맞춰 자름) + data/zip_views.json { 번호: { file, homepage, page, from, at } }
// 찾는 법: 청약홈 공고의 사업주체 홈페이지(HMPG_ADRES)에서 posts/floorplan.mjs findPlans(조감도·투시도 메뉴의 큰 그림). 사칭 분양 사이트를 피하려고 홈페이지 주소는 청약홈 값만 쓴다.
// 못 찾으면 사람이 그 홈페이지의 사업개요·메인 그림을 캡처해 --add로 넣는다. 새 글을 올릴 때 한 번 돌리고 그림을 눈으로 확인한다(매일 자동 실행엔 넣지 않음).
// 받은 그림은 사람이 한 번 눈으로 확인한다(로고·배너가 잡힐 수 있다) — 틀린 것은 data/zip_views.json에서 지우고 { skip: '이유' }로 둔다.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';

const DIR = join(ROOT, 'data/zip_views'), INDEX = join(ROOT, 'data/zip_views.json');
const DETAIL = { APT: 'getAPTLttotPblancDetail', 무순위: 'getRemndrLttotPblancDetail' };
export const loadViews = async () => JSON.parse(await readFile(INDEX, 'utf8').catch(() => '{}'));

async function homepageOf(r) {
  const d = JSON.parse(await readFile(join(ROOT, 'drafts', `analysis_${r.no}.json`), 'utf8').catch(() => 'null'));
  if (d?.facts?.detail?.homepage) return d.facts.detail.homepage;
  const { odcloud } = await import('../posts/analysis_post.mjs'), { dataKey } = await import('../posts/trades.mjs');
  const [x] = await odcloud(DETAIL[r.kind] || DETAIL.APT, r.no, await dataKey()).catch(() => []);
  return x?.HMPG_ADRES || null;
}

// 원본(크기 제각각) → 800×500 JPEG. 브라우저로 그려 찍는다(새 의존성 없이)
export async function frame(src, out, focus = 'center') {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 800, height: 500 } });
    const type = /\.png$/i.test(src) ? 'image/png' : 'image/jpeg';
    await p.setContent(`<body style="margin:0"><img src="data:${type};base64,${(await readFile(src)).toString('base64')}" style="width:800px;height:500px;object-fit:cover;object-position:${focus};display:block"></body>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: out, type: 'jpeg', quality: 78 });
  } finally { await b.close(); }
}

// 자동으로 못 찾은 곳은 사람이 공식 홈페이지(청약홈 HMPG_ADRES)의 사업개요·메인 그림을 캡처해 등록한다(2026-10-29: 13곳 중 6곳)
// node zip/views.mjs --add 공고번호 그림파일 그림이 있던페이지 [초점(object-position, 예 'center 20%')]
if (process.argv[1]?.endsWith('views.mjs') && process.argv.includes('--add')) {
  const [no, file, page, focus = 'center'] = process.argv.slice(process.argv.indexOf('--add') + 1);
  const reg = JSON.parse(await readFile(join(ROOT, 'data/zip_registry.json'), 'utf8')), index = await loadViews();
  await mkdir(DIR, { recursive: true });
  await frame(file, join(DIR, `${no}.jpg`), focus);
  index[no] = { file: `data/zip_views/${no}.jpg`, homepage: reg[no] ? await homepageOf(reg[no]) : null, page, from: '분양 홈페이지 캡처', at: new Date().toISOString().slice(0, 10) };
  await writeFile(INDEX, JSON.stringify(index, null, 1));
  console.log('✓', no, index[no].homepage);
} else if (process.argv[1]?.endsWith('views.mjs')) {
  const reg = JSON.parse(await readFile(join(ROOT, 'data/zip_registry.json'), 'utf8'));
  const oi = process.argv.indexOf('--only'), only = oi > 0 ? process.argv[oi + 1].split(',') : null, force = process.argv.includes('--force');
  const index = await loadViews();
  await mkdir(DIR, { recursive: true });
  for (const r of Object.values(reg).filter((x) => x.source !== 'sh')) {
    if (only && !only.includes(r.no)) continue;
    if (!force && index[r.no]) continue; // 한 번 본 공고(그림 있음·못 찾음·틀려서 뺌)는 다시 안 본다
    const out = join(DIR, `${r.no}.jpg`), tmp = join(DIR, `_${r.no}`);
    let raw = null, page = null, from = null;
    const homepage = await homepageOf(r);
    // 자동은 홈페이지의 조감도·투시도 메뉴에서만 — 공고문 PDF·분석 글 그림은 글자 쪽이 잡힌 적이 있어(2026-10-29 확인) 쓰지 않는다. 못 찾으면 --add로 사람이 캡처
    if (homepage) {
      const { findPlans } = await import('../posts/floorplan.mjs');
      const res = await findPlans(homepage, [], tmp, { name: r.name });
      const a = res.images?.find((x) => x.key === 'aerial');
      if (a) { raw = join(ROOT, a.file); page = a.source; from = '분양 홈페이지'; }
    }
    if (raw) {
      await frame(raw, out);
      index[r.no] = { file: `data/zip_views/${r.no}.jpg`, homepage, page, from, at: new Date().toISOString().slice(0, 10) };
      console.log(`✓ ${r.no} ${r.name} · ${from}`);
      console.log('  → 그림을 열어 조감도가 맞는지 확인하세요(틀리면 { skip } 으로)');
    } else { index[r.no] = { tried: new Date().toISOString().slice(0, 10), homepage }; console.log(`✗ ${r.no} ${r.name} · 조감도 못 찾음 (${homepage || '홈페이지 없음'}) — 공식 홈페이지에서 캡처해 --add로`); }
    await rm(tmp, { recursive: true, force: true });
  }
  await writeFile(INDEX, JSON.stringify(index, null, 1));
}

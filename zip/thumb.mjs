// auleezip 글 대표 이미지(1200×630) — 일부러 최소한의 디자인: 단색 바탕, 글자만, 얇은 선 하나
// node zip/thumb.mjs  → data/zip_posts/img/{공고번호}.png
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { renderPngs } from '../posts/card.mjs';
import { shortName, areaOf } from '../posts/analysis_post.mjs';
import { esc } from '../posts/weekly.mjs';

export const thumbHtml = (r) => `<!doctype html><meta charset="utf-8"><body style="margin:0;width:1200px;height:630px;background:#f4f3ee;color:#1d1d1b;font-family:'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR',sans-serif;position:relative">
<div style="position:absolute;left:80px;top:70px;font-size:26px;color:#6b6a63;letter-spacing:-0.01em">aulee의 집 · ${r.source === 'sh' ? '임대' : '분양'} 시세 비교</div>
<div style="position:absolute;left:80px;top:215px;width:1040px;font-size:${shortName(r.name).length > 16 ? 70 : 84}px;font-weight:800;line-height:1.2;letter-spacing:-0.04em">${esc(shortName(r.name))}</div>
<div style="position:absolute;left:80px;top:445px;width:70px;height:4px;background:#1d1d1b"></div>
<div style="position:absolute;left:80px;top:475px;font-size:30px;color:#3b3a36">${esc(areaOf(r))} · ${r.source === 'sh' ? esc(r.kind) : r.kind === '무순위' ? '무순위 청약' : '아파트 분양'}</div>
<div style="position:absolute;left:80px;top:530px;font-size:26px;color:#6b6a63">${r.source === 'sh' ? '월세와 주변 전월세 실거래 비교' : '분양가와 주변 단지 실거래 비교'}</div>
</body>`;

if (process.argv[1]?.endsWith('thumb.mjs')) {
  const { items } = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8'));
  const out = join(ROOT, 'data/zip_posts/img');
  await mkdir(out, { recursive: true });
  const seen = new Set(), pages = [];
  const { access } = await import('node:fs/promises');
  for (const r of items.filter((x) => !x.skip)) { const k = shortName(r.name); if (seen.has(k)) continue; seen.add(k); if (!process.argv.includes('--force') && await access(join(out, `${r.no}.png`)).then(() => true, () => false)) continue; pages.push({ name: r.no, html: thumbHtml(r) }); } // 이미 있는 그림은 다시 그리지 않는다(디자인을 바꿀 때만 --force)
  if (!pages.length) { console.log('새로 그릴 그림 없음'); process.exit(0); }
  const files = await renderPngs(pages, out);
  console.log(`${files.length}장 → data/zip_posts/img`);
}

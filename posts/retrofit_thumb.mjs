// 이미 만든 초안에 검색용 썸네일(첫 그림)을 붙여 본문을 다시 그린다(내용·설명은 그대로). 예약된 글 고치기(draft.mjs --update-scheduled) 전에 쓴다.
// node posts/retrofit_thumb.mjs drafts/analysis_<no>.json | drafts/guide_<slug>.json ...
import { readFile, writeFile } from 'node:fs/promises';
import { renderPngs } from './card.mjs';
import { draftOf, images as analysisImages } from './analysis_post.mjs';
import { thumbHtml, render as renderGuide } from './guide.mjs';

for (const p of process.argv.slice(2)) {
  const d = JSON.parse(await readFile(p, 'utf8'));
  const dir = p.replace(/\.json$/, '.img');
  if (d.type === 'analysis') { // 분석 글은 그림을 모두 다시(썸네일·일정 카드·지도 — 카드 속 로고도 새로)
    const next = draftOf(d.facts, d.notes, await analysisImages(d.facts, dir));
    await writeFile(p, JSON.stringify(next, null, 2));
    console.log(`그림 다시 — ${next.title} (그림 ${next.images.length}장)`);
    continue;
  }
  const [file] = await renderPngs([{ name: 'thumb', html: thumbHtml(d) }], dir);
  const thumb = { key: 'thumb', file: file.replace(/\\/g, '/'), alt: d.type === 'analysis' ? `${d.facts.item.name} 분양가·청약 분석 대표 이미지` : `${d.title} 대표 이미지` };
  const images = [thumb, ...(d.images || []).filter((i) => i.key !== 'thumb')];
  const next = d.type === 'analysis' ? { ...draftOf(d.facts, d.notes, images) } : { ...d, images, html: renderGuide({ ...d, images }) };
  await writeFile(p, JSON.stringify(next, null, 2));
  console.log(`썸네일 붙임 — ${next.title} (그림 ${images.length}장)`);
}

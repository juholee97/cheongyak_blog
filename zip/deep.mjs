// 우리의 집 「심층 분석」 글(2026-10-30 사용자 지시): 글을 처음부터 직접 쓰지 않는다. D:\부동산_청약분석\<단지 폴더>에 유튜브 분석기(D:\dev\apt_youtube_analyzer)가
// 영상 여러 편·공고문·웹 공식 자료를 여러 시선으로 정리한 종합리포트.html을 만들면, 세션에서 그 리포트를 읽고 data/zip_deep/<키>.json(글 자료)을 쓴 뒤 이 스크립트로 올린다.
// 키 = 첫 공고번호. 폴더 → 공고번호는 data/deep_folders.json. 글은 메인(현재 열린 공고) 맨 위 「심층 분석」 칸에 보인다(zip/pages.mjs deepCards).
// node zip/deep.mjs                  폴더별 리포트 상태
// node zip/deep.mjs --read <키>       리포트 글자 → data/deep/<키>.txt(세션이 읽는다). 가족 맞춤 절(우리집_정보 기반)은 빼고 옮긴다 — 글에 쓰지 않는다
// node zip/deep.mjs --lint <키>       글 자료 점검: 숫자가 리포트·공고 자료에 있는지, 금지 표현, 가족 정보, 해요체
// node zip/deep.mjs --draft <키>      임시글로 올림(미리보기 링크)    --publish <키>  사용자 승인 뒤 공개(그 뒤 node zip/publish.mjs --go --pages로 메인 갱신)
// 글 자료: { title, excerpt, card: [메인 카드 숫자 줄], blocks: [{h}|{p}|{ul}|{key}|{table:{head,rows}}|{note}|{claims:true}|{links:[[이름,주소]]}], sources: [[이름,주소]] }
// 리포트 속 영상 주장은 공고문과 맞춰 본 결과만 싣는다(채널 평가·전망 숫자는 옮기지 않는다). 영상은 링크·채널 이름만, 금지 표현이 든 제목은 싣지 않는다.
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from '../tistory/common.mjs';
import { esc } from '../posts/weekly.mjs';
import { BANNED } from '../posts/check.mjs';
import { wrap } from './post.mjs';
import { table, keyBox, note, src, chip, keepUnits } from './ui.mjs';

export const BASE = 'D:/부동산_청약분석', CAT_DEEP = '심층 분석';
const FOLDERS = join(ROOT, 'data/deep_folders.json'), DIR = join(ROOT, 'data/zip_deep');
export const folders = async () => JSON.parse(await readFile(FOLDERS, 'utf8').catch(() => '{}'));
const folderOf = async (key) => Object.entries(await folders()).find(([, nos]) => nos[0] === key)?.[0];
export const loadDeep = async (key) => JSON.parse(await readFile(join(DIR, `${key}.json`), 'utf8').catch(() => 'null'));
export async function allDeep() {
  const out = [];
  for (const f of await readdir(DIR).catch(() => [])) if (/^\d+\.json$/.test(f)) out.push({ key: f.slice(0, -5), ...JSON.parse(await readFile(join(DIR, f), 'utf8')) });
  return out;
}

// 리포트 HTML → 글자. 그림(data:)·스크립트는 버리고, 가족 맞춤 절은 뺀다
const FAMILY = /우리 가족|우리 아기|우리집_정보|예비 신혼부부인|우리 기준/;
export function reportText(html) {
  let s = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, '').replace(/src="data:[^"]+"/g, '');
  s = s.replace(/<br\s*\/?>|<\/(p|div|h\d|li|tr|section|table)>/g, '\n').replace(/<[^>]+>/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  // 가족 절: 「우리 가족 청약 자격」~「영상별 의견 비교」 앞까지(우리 아기 관점 포함)
  s = s.replace(/\n\s*우리 가족 청약 자격\s*\n[\s\S]*?(?=\n\s*영상별 의견 비교\s*\n)/, '\n');
  return s.split('\n').map((l) => l.trim()).filter((l) => l && !FAMILY.test(l)).join('\n');
}

// 표 칸 글자를 한 덩어리로: 휴대폰 표(az-stack)는 칸이 flex라, keepUnits가 「60㎡」에 씌우는 span마다 따로 줄이 갈라진다
const cv = (t) => `<span>${esc(t)}</span>`;
const VERDICT = { 맞음: '확인', 다름: '다름', 과장: '다름', '확인 필요': '공식 자료 없음', '전망·검증불가': '공식 자료 없음' };
const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
async function analyzerData(folder) {
  const d = join(BASE, folder, '_data');
  const [summary, state] = await Promise.all(['summary.json', 'state.json'].map((f) => readFile(join(d, f), 'utf8').then(JSON.parse).catch(() => null)));
  const videos = Object.entries(state?.videos || {}).filter(([, v]) => v.status === 'done').sort((a, b) => a[1].no - b[1].no)
    .map(([id, v]) => ({ id, title: v.title, channel: (v.html || '').split('_')[1] || '', url: `https://www.youtube.com/watch?v=${id}` }));
  return { summary, videos };
}

// 실을 주장: 가족 맞춤 문장과 가격 전망(전망·검증불가)은 뺀다
const claimRows = (checks) => (checks || []).filter((c) => c.verdict !== '전망·검증불가' && !FAMILY.test(c.claim + c.note + c.official));
// 영상 주장 대조표: 다른 것·공식 자료로 확인 못 한 것을 먼저, 맞는 것은 접어 둔다
function claimsHtml(checks, videos) {
  const ch = claimRows(checks);
  const row = (c) => { const v = videos.find((x) => x.id === c.video_id); return [esc(c.claim), `${chip(VERDICT[c.verdict] || '공식 자료 없음')}${c.note ? `<small>${esc(c.note)}</small>` : ''}`, cv(c.official), v ? `<a href="${esc(v.url)}&t=${c.t}s" rel="nofollow noopener">${esc(v.channel)} ${mmss(c.t)}</a>` : '-']; };
  const head = ['영상에서 나온 말', '확인 결과', '공고문·공식 자료', '영상'];
  const off = ch.filter((c) => c.verdict !== '맞음'), ok = ch.filter((c) => c.verdict === '맞음');
  return [
    '<h2>영상에서 나온 말, 공고문과 맞춰 보기</h2>',
    `<p>영상 ${videos.length}편에서 나온 사실 주장 ${ch.length}개를 입주자모집공고문과 공식 자료에 맞춰 봤습니다. 공고문과 다르거나 공식 자료로 확인되지 않은 것 ${off.length}개를 먼저 보여 드립니다.</p>`,
    off.length ? table(head, off.map(row)) : '',
    ok.length ? `<details class="az-more"><summary>공고문과 맞는 주장 ${ok.length}개 보기</summary>${table(head, ok.map(row))}</details>` : '',
    src('「공식 자료 없음」은 틀렸다는 뜻이 아니라 공고문·공식 자료로 확인되지 않았다는 뜻입니다. 영상의 가격 전망은 확인할 수 있는 사실이 아니어서 이 표에 싣지 않았습니다.'),
  ];
}

export async function render(key) {
  const d = await loadDeep(key), folder = await folderOf(key);
  if (!d) throw new Error(`data/zip_deep/${key}.json 없음`);
  const { summary, videos } = await analyzerData(folder);
  const block = (b) => {
    if (b.h) return `<h2>${esc(b.h)}</h2>`;
    if (b.h3) return `<h3>${esc(b.h3)}</h3>`;
    if (b.p) return `<p>${esc(b.p)}</p>`;
    if (b.ul) return `<ul>${b.ul.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
    if (b.key) return keyBox(b.key.map(esc), b.title || '한눈에 보기');
    if (b.table) return table(b.table.head, b.table.rows.map((r) => r.map(cv)));
    if (b.note) return note(esc(b.note));
    if (b.src) return src(esc(b.src));
    if (b.links) return `<ul class="az-links">${b.links.map(([t, u]) => `<li><a href="${esc(u)}">${esc(t)}</a></li>`).join('')}</ul>`;
    if (b.claims) return claimsHtml(summary?.claim_checks, videos).join('\n');
    throw new Error(`모르는 블록 ${JSON.stringify(b).slice(0, 60)}`);
  };
  const ok = (t) => !BANNED.some((w) => t.includes(w));
  const vids = videos.map((v) => `<li><a href="${esc(v.url)}" rel="nofollow noopener">${esc(v.channel)}</a>${ok(v.title) ? ` <span class="az-s">${esc(v.title)}</span>` : ''}</li>`);
  const html = [
    ...d.blocks.map(block),
    '<h2>이 글의 자료</h2>',
    `<p>이 글은 입주자모집공고문, 청약홈·LH·교육청 같은 공식 자료, 그리고 이 단지를 다룬 유튜브 영상 ${videos.length}편을 함께 정리한 리포트를 바탕으로 썼습니다. 영상은 여러 시선을 보려고 참고했고, 숫자와 조건은 공고문을 기준으로 적었습니다.</p>`,
    `<ul class="az-links">${(d.sources || []).map(([t, u]) => `<li><a href="${esc(u)}" rel="nofollow noopener">${esc(t)}</a></li>`).join('')}</ul>`,
    vids.length ? `<h3>참고한 영상</h3><ul>${vids.join('')}</ul>` : '',
    src('영상 내용은 aulee가 확인한 사실이 아니며, 공고문과 맞춰 본 결과만 옮겼습니다. 이 글은 청약 판단을 돕는 정보이고 청약이나 투자를 권하지 않습니다. 자격·분양가·일정은 청약 전에 청약홈 입주자모집공고 원문으로 다시 확인하시기 바랍니다.'),
  ].filter(Boolean).join('\n');
  return { slug: `deep-${key}`, title: d.title, html: wrap(keepUnits(html)), excerpt: d.excerpt, categories: [CAT_DEEP], tags: d.tags || [] };
}

// 점검: 글 숫자가 리포트·공고 자료에 있는지(지어낸 숫자 막기), 금지 표현, 가족 정보, 해요체(워드프레스는 합쇼체)
export async function check(key) {
  const d = await loadDeep(key), folder = await folderOf(key), issues = [];
  const { summary } = await analyzerData(folder);
  const texts = d.blocks.flatMap((b) => [b.h, b.h3, b.p, b.note, b.src, ...(b.ul || []), ...(b.key || []), ...(b.table ? [...b.table.head, ...b.table.rows.flat()] : [])]).filter(Boolean).concat([d.title, d.excerpt, ...(d.card || [])]);
  const auto = d.blocks.some((b) => b.claims) ? claimRows(summary?.claim_checks).flatMap((c) => [c.claim, c.note, c.official]).filter(Boolean) : []; // 대조표는 리포트 문장 그대로라 숫자 대조는 건너뛰고 표현만 본다
  const corpus = [await readFile(join(BASE, folder, '종합리포트.html'), 'utf8'), await readFile(join(BASE, folder, '_data/notice.json'), 'utf8').catch(() => ''),
    ...await Promise.all((await folders())[folder].map((n) => readFile(join(ROOT, 'data/zip_posts', `${n}.json`), 'utf8').catch(() => '')))].join('\n').replace(/(\d),(?=\d{3})/g, '$1');
  for (const t of [...texts, ...auto]) {
    if (!auto.includes(t)) for (const m of t.replace(/(\d),(?=\d{3})/g, '$1').match(/\d{2,}(?:\.\d+)?/g) || []) if (!corpus.includes(m)) issues.push(`숫자 ${m} — 리포트·공고 자료에 없음: 「${t.slice(0, 50)}」`);
    for (const w of BANNED) if (t.replace(/기관추천/g, '').includes(w)) issues.push(`금지 표현 「${w}」: 「${t.slice(0, 50)}」`);
    if (FAMILY.test(t)) issues.push(`가족 정보: 「${t.slice(0, 50)}」`);
    if (/(해요|에요|예요|세요|어요|아요|네요|죠)[.!?]/.test(t)) issues.push(`해요체: 「${t.slice(0, 50)}」`);
  }
  return issues;
}

if (process.argv[1]?.endsWith('deep.mjs')) {
  const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
  if (process.argv.includes('--self-check')) {
    const assert = (await import('node:assert/strict')).default;
    const t = reportText('<h2>종합 판단</h2><p>좋은 점</p><h2>우리 가족 청약 자격</h2><p>혼인 정보</p><h2>영상별 의견 비교</h2><p>우리 가족 기준 한 줄</p><p>영상 A</p><img src="data:image/png;base64,AAAA">');
    assert.ok(t.includes('좋은 점') && t.includes('영상 A') && !t.includes('혼인 정보') && !t.includes('우리 가족') && !t.includes('base64'));
    console.log('deep 점검 통과');
  } else if (arg('--read')) {
    const key = arg('--read'), folder = await folderOf(key);
    await mkdir(join(ROOT, 'data/deep'), { recursive: true });
    const out = join(ROOT, 'data/deep', `${key}.txt`);
    await writeFile(out, reportText(await readFile(join(BASE, folder, '종합리포트.html'), 'utf8')));
    console.log('→', out);
  } else if (arg('--lint')) {
    const issues = await check(arg('--lint'));
    console.log(issues.length ? issues.join('\n') : '✓ 점검 통과');
    process.exitCode = issues.length ? 1 : 0;
  } else if (arg('--preview')) {
    // 올리기 전 화면 확인용: 사이트 CSS를 입힌 글 한 편 → data/deep/<키>.html
    const { previewHtml } = await import('./post.mjs'), key = arg('--preview'), out = join(ROOT, 'data/deep', `${key}.html`);
    await mkdir(join(ROOT, 'data/deep'), { recursive: true });
    await writeFile(out, await previewHtml([await render(key)]));
    console.log('→', out);
  } else if (arg('--draft') || arg('--publish')) {
    const key = arg('--draft') || arg('--publish'), now = !!arg('--publish');
    const issues = await check(key);
    if (issues.length) { console.log(issues.join('\n')); process.exit(1); }
    const { upsert, uploadMedia } = await import('./wp.mjs');
    const post = await render(key);
    const img = join(ROOT, 'data/zip_views', `${key}.jpg`);
    post.featured = await uploadMedia(img, `deep-${key}.jpg`, `${post.title}`).catch(() => undefined);
    const o = await upsert(post, null, now);
    const d = await loadDeep(key);
    if (o.ok) await writeFile(join(DIR, `${key}.json`), JSON.stringify({ ...d, link: o.link, status: o.status, id: o.id }, null, 1));
    console.log(`${o.ok ? '✓' : '✗'} ${o.status} ${o.link}${o.status === 'draft' ? ` (미리보기 https://auleezip.com/?p=${o.id}&preview=true)` : ''}`);
  } else {
    for (const [folder, nos] of Object.entries(await folders())) {
      const prog = await readFile(join(BASE, folder, '진행상황.txt'), 'utf8').catch(() => '');
      const rep = await stat(join(BASE, folder, '종합리포트.html')).catch(() => null), d = await loadDeep(nos[0]);
      console.log(`${nos[0]} ${folder} · ${rep ? `리포트 ${new Date(rep.mtimeMs + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')}` : (prog.match(/단계: (.+)/)?.[1] || '아직 시작 전')} · 글 ${d?.status || (d ? '자료만' : '없음')}`);
    }
  }
}

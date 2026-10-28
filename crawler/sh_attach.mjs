// SH 공고 중 본문에 접수 일정이 없고 첨부파일(PDF·HWP)에만 있는 글: 첨부를 SH 문서 뷰어가 쪽별 이미지로 보여 주는 것을 받아 한국어 OCR로 읽어 일정을 채운다(2026-10-28).
// node crawler/sh_attach.mjs [--force] [--check]   → crawler/sh_attach.json { "sh-번호": { phases, file, at } }  (fetch.mjs가 CI에서 이 파일로 일정을 채운다 — 로컬에서 돌리고 커밋한다)
// OCR은 tools/ocr_ko.py(전용 venv tools/ocr_venv: rapidocr onnxruntime pillow). 환경변수 SH_OCR_PY로 파이썬 경로를 바꿀 수 있다.
// 첨부 원본은 내려받지 않는다 — 뷰어가 공개로 보여 주는 쪽 이미지(PNG)만 임시 폴더에 받고 읽은 뒤 지운다. 호출은 zip/guard.mjs의 sh로 센다.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSH, phasesOf } from './sh.mjs';
import { useApi } from '../zip/guard.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), FILE = fileURLToPath(new URL('./sh_attach.json', import.meta.url));
const BASE = 'https://www.i-sh.co.kr/main/lay2/program/S1T294C297/www/brd/m_241', UA = { 'user-agent': 'Mozilla/5.0 (compatible; cheongyak-calendar; +https://aulee.tistory.com)' };
const MAX_PAGES = 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PY = process.env.SH_OCR_PY || join(ROOT, 'tools/ocr_venv/Scripts/python.exe');

// 글의 첨부 목록 → 읽을 파일(모집공고 본문 쪽, 신청서·동의서 양식은 뺀다) 최대 2개
export function pickFiles(list) {
  const ok = list.filter((f) => /\.(pdf|hwp|hwpx|docx?)$/i.test(f.oriFileNm) && !/신청서|동의서|양식|별지|경쟁률|명단|발표/.test(f.oriFileNm));
  ok.sort((a, b) => (/모집\s*공고|공고문/.test(b.oriFileNm) ? 1 : 0) - (/모집\s*공고|공고문/.test(a.oriFileNm) ? 1 : 0));
  return ok.slice(0, 2);
}

// 뷰어 주소 → 쪽 이미지 주소 만드는 법과 총 쪽수
async function viewerOf(seq, fileSeq) {
  useApi('sh');
  const r = await fetch(`https://www.i-sh.co.kr/main/com/util/htmlConverter.do?brd_id=GS0401&seq=${seq}&data_tp=A&file_seq=${fileSeq}`, { headers: UA });
  const u = new URL(r.url), fn = u.searchParams.get('fn'), rs = u.searchParams.get('rs');
  if (!fn || !rs) return null;
  useApi('sh');
  const xml = await (await fetch(`${u.origin}${rs}${fn}.xml`, { headers: UA })).text();
  return { base: `${u.origin}${rs}${fn}.files/`, n: +(/<pdf_cnt>(\d+)/.exec(xml)?.[1]) || 0 };
}
async function getPages(v, seq, fileSeq, from, to, dir) {
  const files = [];
  for (let i = from; i <= Math.min(to, v.n); i++) {
    useApi('sh');
    const img = await fetch(`${v.base}${i}.png`, { headers: UA });
    if (!img.ok) break;
    const f = join(dir, `${seq}_${fileSeq}_${i}.png`);
    await writeFile(f, Buffer.from(await img.arrayBuffer()));
    files.push(f);
    await sleep(300);
  }
  return files;
}

function ocr(files) {
  const r = spawnSync(PY, [join(ROOT, 'tools/ocr_ko.py'), ...files], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`OCR 실패: ${(r.stderr || '').split('\n').filter(Boolean).pop() || r.status}`);
  return JSON.parse(r.stdout);
}

// 읽은 글자는 로컬에 남겨 둔다(분석 글 재료 — 건축 개요·임대 조건). 커밋하지 않는 data/ 아래
async function keepText(id, text) {
  const dir = join(ROOT, 'data/sh_attach_text');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.txt`), text.trim());
}

export async function readAttach(item) {
  const seq = item.id.replace('sh-', ''), dir = join(tmpdir(), `sh_attach_${seq}`);
  await mkdir(dir, { recursive: true });
  try {
    useApi('sh');
    const html = await (await fetch(`${BASE}/view.do?seq=${seq}`, { headers: UA })).text();
    const list = JSON.parse(/initParam\.downList = (\[.*?\]);/s.exec(html)?.[1] || '[]');
    const year = +String(item.noticeDate).slice(0, 4) || new Date().getFullYear();
    for (const f of pickFiles(list)) {
      const v = await viewerOf(seq, f.fileSeq);
      if (!v?.n) continue;
      let text = '';
      for (let from = 1; from <= Math.min(v.n, MAX_PAGES); from += 3) { // 3쪽씩 읽고 일정이 나오면 멈춘다(민간 사업자 공고는 일정이 뒤쪽에 있다)
        const pages = await getPages(v, seq, f.fileSeq, from, from + 2, dir);
        if (!pages.length) break;
        text += ' ' + Object.values(ocr(pages)).flat().join(' ');
        const phases = phasesOf(text, year);
        if (phases.length) { await keepText(item.id, text); return { phases, file: f.oriFileNm }; }
      }
      await keepText(item.id, text);
    }
    return { phases: [], file: null };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

if (process.argv.includes('--check')) {
  const assert = (await import('node:assert/strict')).default;
  assert.deepEqual(pickFiles([{ oriFileNm: '[별지1] 입주신청서.docx' }, { oriFileNm: '2026 모집공고문.pdf', fileSeq: 1 }, { oriFileNm: '사진.png' }]).map((f) => f.fileSeq), [1]);
  assert.equal(phasesOf('접수기간:2026. 11. 2.(월) ~11. 12.(목)18시까지 [11일간] 당첨자발표: 2027. 1. 22.(금) 예정', 2026)[0].end, '2026-11-12'); // OCR이 띄어쓰기를 잃어도 읽는다
  console.log('sh_attach 점검 통과');
} else if (process.argv[1]?.endsWith('sh_attach.mjs')) {
  const prev = JSON.parse(await readFile(FILE, 'utf8').catch(() => '{}')), today = new Date().toISOString().slice(0, 10);
  const items = (await fetchSH(new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10))).filter((i) => !i.phases.length);
  console.log(`본문에 일정이 없는 공고 ${items.length}건`);
  let n = 0;
  for (const it of items) {
    const old = prev[it.id];
    if (!process.argv.includes('--force') && old && (old.phases.length || old.at >= new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10))) continue; // 읽은 것은 다시 안 읽고, 못 읽은 것은 3일 뒤에 다시
    try {
      const r = await readAttach(it);
      prev[it.id] = { ...r, at: today };
      console.log(`${r.phases.length ? '✓' : '✗'} ${it.name.slice(0, 40)} ${r.phases.map((p) => `${p.k}:${p.date}${p.end ? '~' + p.end.slice(5) : ''}`).join(' ') || '(일정 못 읽음)'}`);
      n++;
    } catch (e) { console.log(`✗ ${it.name.slice(0, 40)}: ${e.message}`); }
  }
  await writeFile(FILE, JSON.stringify(prev, null, 1));
  console.log(`읽은 글 ${n}건 → crawler/sh_attach.json`);
}

// 분석 문단 검증: node zip/check_analysis.mjs data/zip_analysis_a.json [...]
// 규칙: 금지 표현 없음 · 「한 채/두 채」 없음 · 합쇼체(…요로 끝나는 문장 없음) · 문단 길이 · 글에 쓴 숫자는 그 공고의 자료(deals.json 한 줄, 공식 공고·이전 공고 출력 data/zip_history/{번호}.txt, 확인표)에 있어야 한다
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BANNED } from '../posts/check.mjs';
const ROOT = 'D:/dev/cheongyak_blog';
const nums = (t) => new Set(String(t).replace(/,/g, '').match(/\d+(\.\d+)?/g) || []);
const deals = JSON.parse(await readFile(join(ROOT, 'data/deals.json'), 'utf8')).items;
const claims = JSON.parse(await readFile(join(ROOT, 'data/zip_claims.json'), 'utf8').catch(() => '{}'));
let bad = 0;
for (const f of process.argv.slice(2)) {
  const all = JSON.parse(await readFile(f, 'utf8'));
  for (const [no, secs] of Object.entries(all)) {
    const r = deals.find((x) => x.no === no);
    if (!r) { console.log('✗', no, '공고 없음'); bad++; continue; }
    const same = deals.filter((x) => x.name === r.name); // 합쳐진 공고
    const hist = await readFile(join(ROOT, 'data/zip_history', `${no}.txt`), 'utf8').catch(() => '');
    // 이 공고의 자료만: 한 줄에서 풀(pool)은 비교 단지 이름·값이라 refs만 쓴다
    const src = JSON.stringify({ ...r, pool: undefined, ...same.map((x) => ({ ...x, pool: undefined })) }) + JSON.stringify(r.refs) + hist + JSON.stringify(claims[no] || []);
    const ok = nums(src);
    const issues = [];
    if (secs.length < 3 || secs.length > 5) issues.push(`절 ${secs.length}개`);
    for (const s of secs) {
      const t = [s.h, ...s.p].join('\n');
      BANNED.forEach((b) => { if (t.includes(b)) issues.push(`금지 "${b}"`); });
      if (/한 채|두 채|세 채/.test(t)) issues.push('「한 채」류 표현');
      for (const n of nums(t)) if (!ok.has(n) && !(n.length <= 1) && !/^20\d\d$/.test(n)) issues.push(`숫자 ${n} 자료에 없음(${s.h})`);
      if (s.p.some((p) => p.length > 260)) issues.push(`문단 260자 넘음(${s.h})`);
      if (s.h.length > 40) issues.push('소제목 40자 넘음');
      // 우리의 집은 합쇼체(…합니다/…입니다, 2026-10-29 사용자 결정) — 문장 끝 「…요」가 남으면 안 된다(주요·필요·중요는 낱말)
      if ([s.h, ...s.p].some((t) => /(?<![주필중])요([.?!]|$)/m.test(t))) issues.push(`해요체 문장(${s.h})`);
    }
    if (issues.length) { bad++; console.log('✗', no, [...new Set(issues)].join(', ')); } else console.log('✓', no, `${secs.length}절`);
  }
}
process.exitCode = bad ? 1 : 0;

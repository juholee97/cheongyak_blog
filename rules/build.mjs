// rules/*.json → 계산기가 한 번에 받는 rules.json(설계 4-1, 6-3)
// node rules/build.mjs [--out site/rules.json]   Actions가 부른다. 실패하면 daily.yml이 지금 배포본을 받아 쓴다
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// 예약만 하고 아직 공개되지 않은 글로는 잇지 않는다(4-5 4): 공개 시각 전까지 글 링크를 비운다. 매일 다시 만들므로 공개 다음 빌드에 돌아온다
export function hideUnpublished(products, scheduled, now) {
  const later = new Set(Object.values(scheduled).filter((s) => s.when > now).map((s) => s.url));
  return products.map((p) => {
    const hide = ['guide', 'related'].filter((k) => later.has(p.links?.[k]));
    return hide.length ? { ...p, links: { ...p.links, ...Object.fromEntries(hide.map((k) => [k, null])) } } : p;
  });
}

export async function buildRules() {
  const read = async (f) => JSON.parse(await readFile(new URL(f, import.meta.url), 'utf8'));
  const tables = await read('./tables.json'), loans = await read('./loans.json');
  const scheduled = await read('../posts/scheduled.json');
  const special = await read('./special.json');
  if (tables.schema !== 1 || loans.schema !== 1) throw new Error('rules schema가 1이 아님');
  if (!tables.defs || !tables.fields || !loans.products?.some((p) => p.offer === 'active' && p.when && p.variants)) throw new Error('rules 필수 칸이 없음');
  const { schema, ...rest } = tables;
  const now = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  if (special.schema !== 1 || !special.programs?.length) throw new Error('special.json 모양이 다름');
  return { schema: 1, built: new Date().toISOString(), ...rest, loans: hideUnpublished(loans.products, scheduled, now), special: { ...special, programs: hideUnpublished(special.programs, scheduled, now) } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : 'site/rules.json';
  const r = await buildRules();
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(r));
  console.log(`${out}: 상품 ${r.loans.length}개`);
}

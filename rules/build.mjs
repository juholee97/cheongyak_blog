// rules/*.json → 계산기가 한 번에 받는 rules.json(설계 4-1, 6-3)
// node rules/build.mjs [--out site/rules.json]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function buildRules() {
  const read = async (f) => JSON.parse(await readFile(new URL(f, import.meta.url), 'utf8'));
  const tables = await read('./tables.json'), loans = await read('./loans.json');
  if (tables.schema !== 1 || loans.schema !== 1) throw new Error('rules schema가 1이 아님');
  const { schema, ...rest } = tables;
  return { schema: 1, built: new Date().toISOString(), ...rest, loans: loans.products };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : 'site/rules.json';
  const r = await buildRules();
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(r));
  console.log(`${out}: 상품 ${r.loans.length}개`);
}

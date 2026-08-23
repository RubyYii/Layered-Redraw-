import { writeFile } from 'node:fs/promises';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

import {
  auditGemini37Catalog,
  inspectInstalledGemini37Catalog,
} from '../src/model-catalog-audit.js';

const parseOutput = (args: readonly string[]): string | undefined => {
  if (args.length === 0) return undefined;
  if (args.length === 2 && args[0] === '--output' && args[1]!.length > 0) {
    return args[1];
  }
  throw new Error('INVALID_ARGUMENTS');
};

const main = async (): Promise<void> => {
  const output = parseOutput(process.argv.slice(2));
  const source = await inspectInstalledGemini37Catalog();
  const audit = auditGemini37Catalog(source);
  const bytes = `${canonicalJson(audit)}\n`;

  process.stdout.write(bytes);
  if (output !== undefined) await writeFile(output, bytes, 'utf8');
  if (audit.status !== 'PASS') process.exitCode = 1;
};

main().catch(() => {
  process.stderr.write('Gemini 3.7 catalog audit could not complete safely.\n');
  process.exitCode = 1;
});

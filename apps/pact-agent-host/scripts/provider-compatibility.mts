import { resolve } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local';

import { COMPATIBILITY_LIMITS } from '../src/compatibility-config.js';
import { buildProviderPreflightReport } from '../src/preflight-report.js';

const modeArgument = process.argv.find((argument) => argument.startsWith('--mode='));
const splitMode = process.argv.indexOf('--mode');
const mode = modeArgument?.slice('--mode='.length) ??
  (splitMode >= 0 ? process.argv[splitMode + 1] : undefined) ??
  'preflight';

if (mode === 'real') {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'cp03-provider-preflight/0.1',
    status: 'REFUSED_BEFORE_TRANSPORT',
    code: 'REAL_PROVIDER_DISPATCH_REQUIRES_FRESH_EXPLICIT_APPROVAL',
    providerRequestsMade: 0,
  }, null, 2)}\n`);
  process.exitCode = 2;
} else if (mode !== 'preflight') {
  process.stdout.write(`${JSON.stringify({
    status: 'INVALID_MODE',
    supportedModes: ['preflight'],
    providerRequestsMade: 0,
  }, null, 2)}\n`);
  process.exitCode = 2;
} else {
  const ctx = new Context();
  try {
    await ctx.plugin(LocalAttachmentStore, {
      dshHome: resolve(process.cwd(), '.dsh-cp03-gate/provider-compatibility'),
      maxImageBytes: COMPATIBILITY_LIMITS.maxImageBytes,
      maxImagesPerMessage: 1,
      maxMessageImageBytes: COMPATIBILITY_LIMITS.maxImageBytes,
      maxImagePixels: 64 * 64,
    });
    const report = await buildProviderPreflightReport(process.env, ctx.attachments);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await ctx.fiber.dispose();
  }
}

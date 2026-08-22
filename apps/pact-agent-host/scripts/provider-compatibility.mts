import { resolve } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local';

import { COMPATIBILITY_LIMITS } from '../src/compatibility-config.js';
import { buildProviderPreflightReport } from '../src/preflight-report.js';
import { executeProviderRealCommand } from '../src/provider-real-command.js';
import {
  type ProviderRealRunApproval,
} from '../src/provider-real-run-gate.js';
import { COMPATIBILITY_PROBES } from '../src/probe-plan.js';

const argumentValue = (name: string): string | undefined => {
  const equals = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`)
  );
  if (equals !== undefined) return equals.slice(name.length + 3);
  const split = process.argv.indexOf(`--${name}`);
  return split >= 0 ? process.argv[split + 1] : undefined;
};

const mode = argumentValue('mode') ?? 'preflight';

if (mode !== 'preflight' && mode !== 'real') {
  process.stdout.write(`${JSON.stringify({
    status: 'INVALID_MODE',
    supportedModes: ['preflight', 'real'],
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
    if (mode === 'preflight') {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      const approvedMaxUsd = Number(argumentValue('approved-max-usd'));
      const approval: ProviderRealRunApproval = {
        schemaVersion: 'cp03-provider-real-approval/0.1',
        approvalId: argumentValue('approval-id') ?? '',
        approvedAt: argumentValue('approved-at') ?? '',
        runId: argumentValue('run-id') ?? '',
        probeIds: COMPATIBILITY_PROBES.map((probe) => probe.id),
        plannedDispatches: report.counts.plannedDispatches,
        maximumDispatches: report.counts.maximumDispatches,
        maxUsd: approvedMaxUsd,
        selection: {
          deepseek: {
            route: report.selection.deepseek.route,
            model: report.selection.deepseek.model ?? '',
          },
          gemini: {
            route: report.selection.gemini.route ?? '',
            model: report.selection.gemini.model ?? '',
          },
        },
        inputClasses: ['fictional_text', 'synthetic_checkerboard'],
      };
      const result = await executeProviderRealCommand({
        cwd: process.cwd(),
        env: process.env,
        preflight: report,
        approval,
      });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if ('status' in result && result.status === 'REFUSED') {
        process.exitCode = 2;
      }
    }
  } finally {
    await ctx.fiber.dispose();
  }
}

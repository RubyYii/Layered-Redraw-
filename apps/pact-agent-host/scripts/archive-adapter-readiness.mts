import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';

import { canonicalJson } from '@layered-redraw/pact-cp03-contracts';

import {
  ADAPTER_READINESS_CLAIM_CEILING,
  ADAPTER_READINESS_VERIFICATION_IDS,
  createAdapterReadinessManifest,
  type AdapterReadinessManifest,
  verifyAdapterReadinessManifest,
} from '../src/adapter-readiness-evidence.js';
import {
  type Gemini37CatalogAudit,
  verifyGemini37CatalogAudit,
} from '../src/model-catalog-audit.js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hostRoot = resolve(scriptDir, '..');
const repositoryRoot = resolve(hostRoot, '../..');
const contractsRoot = join(repositoryRoot, 'packages', 'pact-cp03-contracts');
const sceneRoot = join(repositoryRoot, 'apps', 'scene-builder');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const RUN_ID = /^cp03-adapter-readiness-\d{8}T\d{6}Z$/;
const COMMIT = /^[a-f0-9]{40}$/;

type VerificationId = typeof ADAPTER_READINESS_VERIFICATION_IDS[number];

interface ChildResult {
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
}

const parseRunId = (args: readonly string[]): string => {
  if (args.length !== 2 || args[0] !== '--run-id' || !RUN_ID.test(args[1]!)) {
    throw new Error('INVALID_RUN_ID_ARGUMENT');
  }
  return args[1]!;
};

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

const canonicalBytes = (value: unknown): string => `${canonicalJson(value)}\n`;

const runChild = (
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
): Promise<ChildResult> => new Promise((resolveChild, rejectChild) => {
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on('data', (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
  child.once('error', rejectChild);
  child.once('close', (exitCode, signal) => {
    resolveChild({
      stdout: Buffer.concat(stdout),
      stderr: Buffer.concat(stderr),
      exitCode,
      signal,
    });
  });
});

const requireSuccess = (result: ChildResult, code: string): void => {
  if (result.exitCode !== 0 || result.signal !== null) throw new Error(code);
};

const createIsolatedEnvironment = async (temporaryRoot: string): Promise<NodeJS.ProcessEnv> => {
  const temporaryHome = join(temporaryRoot, 'home');
  const npmCache = join(temporaryRoot, 'npm-cache');
  const npmUserConfig = join(temporaryRoot, 'empty.npmrc');
  await mkdir(temporaryHome, { recursive: true });
  await mkdir(npmCache, { recursive: true });
  await writeFile(npmUserConfig, '', 'utf8');

  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? '',
    HOME: temporaryHome,
    TMPDIR: temporaryRoot,
    TMP: temporaryRoot,
    TEMP: temporaryRoot,
    XDG_CACHE_HOME: join(temporaryRoot, 'xdg-cache'),
    XDG_CONFIG_HOME: join(temporaryRoot, 'xdg-config'),
    NPM_CONFIG_CACHE: npmCache,
    NPM_CONFIG_USERCONFIG: npmUserConfig,
    NPM_CONFIG_OFFLINE: 'true',
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_FUND: 'false',
    CI: '1',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    TERM: 'dumb',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
  };
  if (process.env.BLOCKOUT_CHROME_PATH) {
    env.BLOCKOUT_CHROME_PATH = process.env.BLOCKOUT_CHROME_PATH;
  }
  return env;
};

const sanitizeLog = (bytes: Buffer, temporaryRoot: string): string => {
  const replacements = [
    [repositoryRoot, '<REPOSITORY_ROOT>'],
    [temporaryRoot, '<TEMPORARY_ROOT>'],
    [homedir(), '<USER_HOME>'],
  ] as const;
  let text = bytes.toString('utf8');
  for (const [value, replacement] of replacements) {
    if (value) text = text.replaceAll(value, replacement);
  }
  return text;
};

const writeCommandLog = async (input: {
  readonly commandId: VerificationId;
  readonly cwdLabel: string;
  readonly commandLabel: string;
  readonly result: ChildResult;
  readonly logPath: string;
  readonly temporaryRoot: string;
}): Promise<{ readonly logSha256: string; readonly bytes: Buffer }> => {
  const log = [
    `commandId: ${input.commandId}`,
    `cwd: ${input.cwdLabel}`,
    `command: ${input.commandLabel}`,
    `exitCode: ${input.result.exitCode ?? 'null'}`,
    `signal: ${input.result.signal ?? 'none'}`,
    '--- stdout ---',
    sanitizeLog(input.result.stdout, input.temporaryRoot),
    '--- stderr ---',
    sanitizeLog(input.result.stderr, input.temporaryRoot),
  ].join('\n');
  const bytes = Buffer.from(log.endsWith('\n') ? log : `${log}\n`, 'utf8');
  await writeFile(input.logPath, bytes);
  return { logSha256: sha256(bytes), bytes };
};

const readJson = async <T,>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;

const main = async (): Promise<void> => {
  const runId = parseRunId(process.argv.slice(2));
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'pact-cp03-adapter-archive-'));
  try {
    const env = await createIsolatedEnvironment(temporaryRoot);
    const statusResult = await runChild(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      { cwd: repositoryRoot, env },
    );
    requireSuccess(statusResult, 'GIT_STATUS_FAILED');
    if (statusResult.stdout.length !== 0) throw new Error('DIRTY_GIT_TREE');

    const headResult = await runChild('git', ['rev-parse', 'HEAD'], {
      cwd: repositoryRoot,
      env,
    });
    requireSuccess(headResult, 'GIT_HEAD_FAILED');
    const runtimeCommit = headResult.stdout.toString('utf8').trim();
    if (!COMMIT.test(runtimeCommit)) throw new Error('RUNTIME_COMMIT_INVALID');

    const runRelativeRoot = posix.join('checkpoints', 'cp03', 'adapter-readiness', runId);
    const runRoot = join(repositoryRoot, ...runRelativeRoot.split('/'));
    try {
      await stat(runRoot);
      throw new Error('RUN_ROOT_ALREADY_EXISTS');
    } catch (error) {
      if (error instanceof Error && error.message === 'RUN_ROOT_ALREADY_EXISTS') throw error;
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
    const logsRoot = join(runRoot, 'logs');
    await mkdir(logsRoot, { recursive: true });

    const commands: readonly {
      readonly id: VerificationId;
      readonly cwd: string;
      readonly cwdLabel: string;
      readonly args: readonly string[];
    }[] = [
      { id: 'contracts-test', cwd: contractsRoot, cwdLabel: 'packages/pact-cp03-contracts', args: ['test'] },
      { id: 'host-test', cwd: hostRoot, cwdLabel: 'apps/pact-agent-host', args: ['test'] },
      { id: 'host-typecheck', cwd: hostRoot, cwdLabel: 'apps/pact-agent-host', args: ['run', 'typecheck'] },
      { id: 'host-build', cwd: hostRoot, cwdLabel: 'apps/pact-agent-host', args: ['run', 'build'] },
      { id: 'scene-test', cwd: sceneRoot, cwdLabel: 'apps/scene-builder', args: ['test'] },
      { id: 'scene-build', cwd: sceneRoot, cwdLabel: 'apps/scene-builder', args: ['run', 'build'] },
    ];
    if (!commands.every((command, index) => command.id === ADAPTER_READINESS_VERIFICATION_IDS[index])) {
      throw new Error('VERIFICATION_COMMAND_ORDER_INVALID');
    }

    const commandRecords: {
      id: VerificationId;
      status: 'PASS' | 'FAIL';
      logPath: string;
      logSha256: string;
    }[] = [];
    for (const command of commands) {
      const result = await runChild(npmCommand, command.args, { cwd: command.cwd, env });
      const relativeLogPath = posix.join('logs', `${command.id}.log`);
      const record = await writeCommandLog({
        commandId: command.id,
        cwdLabel: command.cwdLabel,
        commandLabel: `npm ${command.args.join(' ')}`,
        result,
        logPath: join(runRoot, ...relativeLogPath.split('/')),
        temporaryRoot,
      });
      commandRecords.push({
        id: command.id,
        status: result.exitCode === 0 && result.signal === null ? 'PASS' : 'FAIL',
        logPath: relativeLogPath,
        logSha256: record.logSha256,
      });
    }

    const verificationStatus = commandRecords.every((record) => record.status === 'PASS')
      ? 'PASS'
      : 'FAIL';
    const preliminaryVerification = {
      schemaVersion: 'pact-cp03-adapter-readiness-verification/0.1',
      status: verificationStatus,
      commands: commandRecords,
    };
    const verificationPath = join(runRoot, 'verification-results.json');
    await writeFile(verificationPath, canonicalBytes(preliminaryVerification), 'utf8');
    if (verificationStatus !== 'PASS') throw new Error('VERIFICATION_COMMAND_FAILED');

    const verification = commandRecords.map((record) => ({
      ...record,
      status: 'PASS' as const,
    })) as AdapterReadinessManifest['verification'];

    const auditPath = join(runRoot, 'catalog-audit.json');
    const auditResult = await runChild(
      process.execPath,
      ['--import', 'tsx/esm', 'scripts/audit-gemini-37.mts', '--output', auditPath],
      { cwd: hostRoot, env },
    );
    requireSuccess(auditResult, 'CATALOG_AUDIT_COMMAND_FAILED');
    const auditBytes = await readFile(auditPath);
    if (!auditResult.stdout.equals(auditBytes)) throw new Error('CATALOG_AUDIT_STDOUT_MISMATCH');
    const catalogAudit = await readJson<Gemini37CatalogAudit>(auditPath);
    if (verifyGemini37CatalogAudit(catalogAudit).status !== 'PASS') {
      throw new Error('CATALOG_AUDIT_INVALID');
    }

    const captureResult = await runChild(
      process.execPath,
      [
        'scripts/capture-cp03-adapter-readiness.mjs',
        '--audit',
        auditPath,
        '--output-dir',
        runRoot,
      ],
      { cwd: sceneRoot, env },
    );
    requireSuccess(captureResult, 'MEDIA_CAPTURE_FAILED');
    let capture: {
      readonly screenshot: string;
      readonly video: string;
      readonly nonLocalBrowserRequests: number;
      readonly consoleErrors: readonly unknown[];
    };
    try {
      capture = JSON.parse(captureResult.stdout.toString('utf8')) as typeof capture;
    } catch {
      throw new Error('MEDIA_CAPTURE_OUTPUT_INVALID');
    }
    if (
      capture.screenshot !== 'media/catalog-capability.png'
      || capture.video !== 'media/adapter-readiness.webm'
      || capture.nonLocalBrowserRequests !== 0
      || !Array.isArray(capture.consoleErrors)
      || capture.consoleErrors.length !== 0
    ) {
      throw new Error('MEDIA_CAPTURE_RESULT_INVALID');
    }

    const screenshotBytes = await readFile(join(runRoot, 'media', 'catalog-capability.png'));
    const videoBytes = await readFile(join(runRoot, 'media', 'adapter-readiness.webm'));
    if (screenshotBytes.length === 0 || videoBytes.length === 0) {
      throw new Error('MEDIA_CAPTURE_EMPTY');
    }

    const copyPath = 'README.md';
    await writeFile(
      join(runRoot, copyPath),
      `${ADAPTER_READINESS_CLAIM_CEILING}\n`,
      'utf8',
    );
    const manifest = createAdapterReadinessManifest({
      runId,
      runtimeCommit,
      generatedAt: new Date().toISOString(),
      catalogAudit,
      verification,
      media: {
        screenshot: { path: capture.screenshot, sha256: sha256(screenshotBytes) },
        video: { path: capture.video, sha256: sha256(videoBytes) },
      },
      copyPath,
      nonLocalBrowserRequests: capture.nonLocalBrowserRequests,
    });

    const finalVerification = {
      schemaVersion: 'pact-cp03-adapter-readiness-verification/0.1',
      status: 'PASS',
      commands: manifest.verification,
    };
    await writeFile(verificationPath, canonicalBytes(finalVerification), 'utf8');
    const manifestPath = join(runRoot, 'evidence-manifest.json');
    await writeFile(manifestPath, canonicalBytes(manifest), 'utf8');

    const requiredPaths = [
      ...manifest.verification.map((entry) => entry.logPath),
      manifest.media.screenshot.path,
      manifest.media.video.path,
      manifest.copyPath,
      'catalog-audit.json',
      'verification-results.json',
      'evidence-manifest.json',
    ];
    const files = new Map<string, Uint8Array>();
    for (const relativePath of requiredPaths) {
      files.set(relativePath, await readFile(join(runRoot, ...relativePath.split('/'))));
    }
    const verificationReport = verifyAdapterReadinessManifest(manifest, files);
    if (verificationReport.status !== 'PASS') throw new Error('ARCHIVE_SELF_VERIFICATION_FAILED');

    process.stdout.write(`${canonicalBytes({
      status: manifest.status,
      evidenceLevel: manifest.evidenceLevel,
      claimCeiling: manifest.claimCeiling,
      runId,
      runRoot: runRelativeRoot,
      runtimeCommit,
      providerRequestsMade: manifest.providerRequestsMade,
      nonLocalBrowserRequests: manifest.nonLocalBrowserRequests,
      auditSha256: manifest.auditSha256,
      manifestSha256: manifest.manifestSha256,
    })}`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};

main().catch((error: unknown) => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : 'ADAPTER_READINESS_ARCHIVE_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});

import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { materializePlaywrightFfmpeg } from '../src/archive-runtime-isolation.js';

const temporaryRoots: string[] = [];

const makeTemporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), 'pact-archive-isolation-test-'));
  temporaryRoots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe('archive runtime isolation', () => {
  it('copies the installed Playwright ffmpeg bundle into the isolated registry', async () => {
    const root = await makeTemporaryRoot();
    const sourceRegistry = join(root, 'source-registry');
    const targetRegistry = join(root, 'isolated-registry');
    const sourceBundle = join(sourceRegistry, 'ffmpeg-1011');
    await mkdir(sourceBundle, { recursive: true });
    await writeFile(join(sourceBundle, 'ffmpeg-mac'), 'fake-ffmpeg-binary', 'utf8');
    await chmod(join(sourceBundle, 'ffmpeg-mac'), 0o755);
    await writeFile(join(sourceBundle, 'INSTALLATION_COMPLETE'), '', 'utf8');
    await mkdir(join(sourceRegistry, 'chromium-1234'), { recursive: true });
    await writeFile(join(sourceRegistry, 'chromium-1234', 'chrome'), 'not-required', 'utf8');

    const copied = await materializePlaywrightFfmpeg({
      sourceRegistry,
      targetRegistry,
    });

    expect(copied).toEqual(['ffmpeg-1011']);
    expect(await readFile(join(targetRegistry, 'ffmpeg-1011', 'ffmpeg-mac'), 'utf8'))
      .toBe('fake-ffmpeg-binary');
    expect((await stat(join(targetRegistry, 'ffmpeg-1011', 'ffmpeg-mac'))).mode & 0o111)
      .not.toBe(0);
    await expect(access(join(targetRegistry, 'chromium-1234'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('fails closed when no installed Playwright ffmpeg bundle exists', async () => {
    const root = await makeTemporaryRoot();
    const sourceRegistry = join(root, 'empty-registry');
    await mkdir(sourceRegistry, { recursive: true });

    await expect(materializePlaywrightFfmpeg({
      sourceRegistry,
      targetRegistry: join(root, 'isolated-registry'),
    })).rejects.toThrow('PLAYWRIGHT_FFMPEG_NOT_INSTALLED');
  });
});

import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const FFMPEG_BUNDLE = /^ffmpeg-\d+$/;
const FFMPEG_EXECUTABLES = new Set([
  'ffmpeg-linux',
  'ffmpeg-mac',
  'ffmpeg-win64.exe',
]);

export async function materializePlaywrightFfmpeg(input: {
  readonly sourceRegistry: string;
  readonly targetRegistry: string;
}): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(input.sourceRegistry, { withFileTypes: true });
  } catch {
    throw new Error('PLAYWRIGHT_FFMPEG_NOT_INSTALLED');
  }

  const bundles = entries
    .filter((entry) => entry.isDirectory() && FFMPEG_BUNDLE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (bundles.length === 0) throw new Error('PLAYWRIGHT_FFMPEG_NOT_INSTALLED');

  for (const bundle of bundles) {
    const sourceBundle = join(input.sourceRegistry, bundle);
    const children = await readdir(sourceBundle, { withFileTypes: true });
    const executable = children.find(
      (entry) => entry.isFile() && FFMPEG_EXECUTABLES.has(entry.name),
    );
    if (executable === undefined) throw new Error('PLAYWRIGHT_FFMPEG_NOT_INSTALLED');
    const executableStat = await stat(join(sourceBundle, executable.name));
    if (executableStat.size <= 0) throw new Error('PLAYWRIGHT_FFMPEG_NOT_INSTALLED');
  }

  await mkdir(input.targetRegistry, { recursive: true });
  for (const bundle of bundles) {
    await cp(
      join(input.sourceRegistry, bundle),
      join(input.targetRegistry, bundle),
      { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true },
    );
  }
  return bundles;
}

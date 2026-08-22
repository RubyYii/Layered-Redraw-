import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { CallId, LlmAdapter } from '@deepseek-ai/dsh-llm';

type ChunkFactory = (
  options: GenerateOptions,
) => readonly StreamChunk[];

export type ScriptChunks = readonly StreamChunk[] | ChunkFactory;

export type ScriptEntry =
  | ScriptChunks
  | 'hang'
  | {
      readonly gate: Promise<void>;
      readonly chunks: ScriptChunks;
    };

const aborted = (signal: AbortSignal | undefined): Error => {
  if (signal?.reason instanceof Error) return signal.reason;
  return new Error('ScriptedAdapter: aborted', { cause: signal?.reason });
};

const waitForAbort = async (signal: AbortSignal | undefined): Promise<never> =>
  new Promise<never>((_resolve, reject) => {
    if (signal?.aborted) {
      reject(aborted(signal));
      return;
    }
    if (signal === undefined) {
      reject(new Error('ScriptedAdapter: hanging entry requires a signal'));
      return;
    }
    signal.addEventListener('abort', () => reject(aborted(signal)), {
      once: true,
    });
  });

const waitForGate = async (
  gate: Promise<void>,
  signal: AbortSignal | undefined,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(aborted(signal));
      return;
    }
    const onAbort = (): void => {
      reject(aborted(signal));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    gate.then(
      () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      },
      (error: unknown) => {
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });

const materialize = (
  chunks: ScriptChunks,
  options: GenerateOptions,
): readonly StreamChunk[] =>
  typeof chunks === 'function' ? chunks(options) : chunks;

export class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];

  constructor(private readonly script: ScriptEntry[]) {
    super();
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options);
    const entry = this.script.shift();
    if (entry === undefined) {
      throw new Error('ScriptedAdapter: script exhausted');
    }
    if (entry === 'hang') {
      yield { type: 'block-start', index: 0, blockType: 'text' };
      await waitForAbort(options.signal);
      return;
    }

    const gated =
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      'gate' in entry;
    if (gated) await waitForGate(entry.gate, options.signal);

    const chunks = materialize(gated ? entry.chunks : entry, options);
    for (const chunk of chunks) {
      if (options.signal?.aborted) throw aborted(options.signal);
      yield chunk;
    }
  }

  remaining(): number {
    return this.script.length;
  }
}

export const textResponse = (text: string): readonly StreamChunk[] => [
  { type: 'block-start', index: 0, blockType: 'text' },
  { type: 'text-delta', index: 0, text },
  { type: 'block-end', index: 0, block: { type: 'text', text } },
  { type: 'finish', reason: { kind: 'stop' } },
];

export const toolCallResponse = (
  callId: string,
  name: string,
  args: unknown,
): readonly StreamChunk[] => {
  const id = CallId(callId);
  const rawArguments = JSON.stringify(args);
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'tool-call-delta',
      index: 0,
      id,
      name,
      argumentsDelta: rawArguments,
    },
    {
      type: 'block-end',
      index: 0,
      block: {
        type: 'tool-call',
        id,
        name,
        arguments: rawArguments,
      },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ];
};

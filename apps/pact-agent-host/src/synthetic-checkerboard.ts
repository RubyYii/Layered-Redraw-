import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

import type {
  AttachmentStore,
  ImageAttachmentRef,
} from '@deepseek-ai/dsh-attachment';

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const uint32 = (value: number): Uint8Array => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
};

const pngChunk = (type: string, data: Uint8Array): Uint8Array => {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes);
  body.set(data, typeBytes.length);
  const chunk = new Uint8Array(4 + body.length + 4);
  chunk.set(uint32(data.length), 0);
  chunk.set(body, 4);
  chunk.set(uint32(crc32(body)), 4 + body.length);
  return chunk;
};

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

/** Generate the compatibility gate's only image input entirely in memory. */
export const createSyntheticCheckerboardPng = (): Uint8Array => {
  const width = 64;
  const height = 64;
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  ihdr.set([8, 6, 0, 0, 0], 8); // RGBA8, deflate, adaptive filter, no interlace.

  const rows = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (1 + width * 4);
    rows[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const white = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      const value = white ? 255 : 0;
      const pixel = rowOffset + 1 + x * 4;
      rows.set([value, value, value, 255], pixel);
    }
  }
  return concat(
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', new Uint8Array()),
  );
};

export interface SyntheticCheckerboardInput {
  readonly envelope: {
    readonly mediaType: 'image/png';
    readonly encodedByteLength: number;
    readonly sha256: string;
    readonly width: 64;
    readonly height: 64;
    readonly sourceClass: 'synthetic_checkerboard';
  };
  readonly messageBlock: {
    readonly type: 'image';
    readonly attachment: ImageAttachmentRef;
  };
}

export const saveSyntheticCheckerboard = async (
  store: AttachmentStore,
): Promise<SyntheticCheckerboardInput> => {
  const data = createSyntheticCheckerboardPng();
  if (data.byteLength > 2 * 1024 * 1024) {
    throw new Error('SYNTHETIC_CHECKERBOARD_TOO_LARGE');
  }
  const attachment = await store.saveImage({
    data,
    mediaType: 'image/png',
    name: 'synthetic-checkerboard.png',
  });
  return {
    envelope: {
      mediaType: 'image/png',
      encodedByteLength: data.byteLength,
      sha256: createHash('sha256').update(data).digest('hex'),
      width: 64,
      height: 64,
      sourceClass: 'synthetic_checkerboard',
    },
    messageBlock: { type: 'image', attachment },
  };
};

import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { createSyntheticSpatialImage } from '../src/synthetic-spatial-image.js';

const PNG_SIGNATURE = '89504e470d0a1a0a';
const WIDTH = 384;
const HEIGHT = 256;

interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly chunkTypes: readonly string[];
  readonly pixels: Uint8Array;
}

const sha256 = (bytes: Uint8Array): string => createHash('sha256')
  .update(bytes)
  .digest('hex');

const decodeCanonicalRgbaPng = (bytes: Uint8Array): DecodedPng => {
  const buffer = Buffer.from(bytes);
  expect(buffer.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE);

  let offset = 8;
  let width = 0;
  let height = 0;
  const chunkTypes: string[] = [];
  const idat: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunkTypes.push(type);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([...data.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }

  const scanlines = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const scanlineOffset = y * (stride + 1);
    expect(scanlines[scanlineOffset]).toBe(0);
    pixels.set(
      scanlines.subarray(scanlineOffset + 1, scanlineOffset + 1 + stride),
      y * stride,
    );
  }

  return { width, height, chunkTypes, pixels };
};

const rgbaAt = (
  pixels: Uint8Array,
  x: number,
  y: number,
): readonly number[] => [...pixels.subarray((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)];

describe('synthetic spatial image', () => {
  it('emits one metadata-free canonical RGBA PNG with the frozen dimensions', () => {
    const png = createSyntheticSpatialImage();
    const decoded = decodeCanonicalRgbaPng(png);

    expect(decoded).toMatchObject({
      width: WIDTH,
      height: HEIGHT,
      chunkTypes: ['IHDR', 'IDAT', 'IEND'],
    });
    expect(png).toHaveLength(2_287);
    expect(Buffer.from(png).toString('utf8')).not.toMatch(
      /https?:|file:|\/Users\/|[A-Za-z]:\\|source[_ -]?path|filename/i,
    );
  });

  it('preserves the independently derived raster and PNG byte hashes', () => {
    const png = createSyntheticSpatialImage();
    const { pixels } = decodeCanonicalRgbaPng(png);

    expect(sha256(png)).toBe(
      '138a8df995ff3d991c2b62b44673148d5286b8c2973ca08095225a9fcd3a6f27',
    );
    expect(sha256(pixels)).toBe(
      '878d8a821422a949ea95362a4a8dc064146f743f022863a8590c8f4ae9d12ac5',
    );
  });

  it('contains the frozen room relations and two visible ambiguous overlaps', () => {
    const { pixels } = decodeCanonicalRgbaPng(createSyntheticSpatialImage());

    expect(rgbaAt(pixels, 10, 10)).toEqual([20, 22, 21, 255]);
    expect(rgbaAt(pixels, 260, 24)).toEqual([190, 139, 70, 255]);
    expect(rgbaAt(pixels, 222, 134)).toEqual([177, 151, 105, 255]);
    expect(rgbaAt(pixels, 90, 140)).toEqual([129, 104, 79, 255]);
    expect(rgbaAt(pixels, 280, 100)).toEqual([145, 159, 148, 255]);
  });
});

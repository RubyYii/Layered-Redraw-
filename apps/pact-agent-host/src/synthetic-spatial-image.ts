import { deflateSync } from 'node:zlib';

const WIDTH = 384;
const HEIGHT = 256;
const CHANNELS = 4;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

type Rgba = readonly [number, number, number, number];

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1
      ? 0xedb88320 ^ (crc >>> 1)
      : crc >>> 1;
  }
  return crc >>> 0;
});

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: 'IHDR' | 'IDAT' | 'IEND', data: Uint8Array): Buffer => {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.byteLength);
  chunk.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(chunk, 4);
  Buffer.from(data).copy(chunk, 8);
  chunk.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, Buffer.from(data)])),
    8 + data.byteLength,
  );
  return chunk;
};

const createRaster = (): Uint8Array => {
  const pixels = new Uint8Array(WIDTH * HEIGHT * CHANNELS);
  const setPixel = (x: number, y: number, color: Rgba): void => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const offset = (y * WIDTH + x) * CHANNELS;
    pixels.set(color, offset);
  };
  const rectangle = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: Rgba,
  ): void => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) setPixel(x, y, color);
    }
  };
  const circle = (cx: number, cy: number, radius: number, color: Rgba): void => {
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
          setPixel(x, y, color);
        }
      }
    }
  };

  rectangle(0, 0, WIDTH, HEIGHT, [20, 22, 21, 255]);
  rectangle(0, 128, WIDTH, HEIGHT, [46, 43, 38, 255]);
  for (let y = 136; y < HEIGHT; y += 16) {
    rectangle(0, y, WIDTH, y + 1, [72, 66, 56, 255]);
  }
  for (let x = 0; x < WIDTH; x += 24) {
    rectangle(x, 128, x + 1, HEIGHT, [67, 62, 54, 255]);
  }

  rectangle(66, 68, 148, 164, [91, 82, 68, 255]);
  rectangle(60, 62, 154, 70, [205, 162, 82, 255]);
  rectangle(60, 62, 68, 164, [205, 162, 82, 255]);
  rectangle(146, 62, 154, 164, [205, 162, 82, 255]);
  rectangle(60, 156, 154, 164, [205, 162, 82, 255]);

  rectangle(260, 24, 356, 112, [190, 139, 70, 255]);
  rectangle(268, 32, 348, 104, [30, 38, 40, 255]);
  rectangle(306, 32, 310, 104, [190, 139, 70, 255]);
  rectangle(268, 66, 348, 70, [190, 139, 70, 255]);

  rectangle(24, 132, 170, 218, [104, 78, 58, 255]);
  rectangle(30, 122, 164, 182, [164, 145, 116, 255]);
  rectangle(38, 128, 92, 150, [194, 182, 151, 255]);
  rectangle(30, 174, 164, 182, [127, 102, 76, 255]);

  rectangle(178, 142, 302, 156, [126, 96, 66, 255]);
  rectangle(188, 156, 198, 222, [105, 80, 58, 255]);
  rectangle(282, 156, 292, 222, [105, 80, 58, 255]);

  rectangle(306, 156, 360, 168, [112, 86, 62, 255]);
  rectangle(312, 168, 320, 224, [98, 75, 55, 255]);
  rectangle(348, 168, 356, 224, [98, 75, 55, 255]);
  rectangle(312, 116, 320, 156, [112, 86, 62, 255]);
  rectangle(312, 116, 356, 124, [112, 86, 62, 255]);

  circle(222, 134, 12, [177, 151, 105, 255]);
  circle(218, 130, 4, [202, 181, 139, 255]);

  rectangle(270, 84, 290, 146, [105, 127, 123, 255]);
  rectangle(267, 80, 293, 90, [72, 91, 90, 255]);
  rectangle(274, 92, 286, 136, [145, 159, 148, 255]);

  rectangle(82, 110, 122, 150, [129, 104, 79, 255]);
  for (let offset = 0; offset < 36; offset += 1) {
    setPixel(94 + offset, 112 + offset % 2, [220, 170, 82, 255]);
    setPixel(94 + offset, 113 + offset % 2, [78, 62, 49, 255]);
  }

  return pixels;
};

export function createSyntheticSpatialImage(): Uint8Array {
  const pixels = createRaster();
  const pixelBuffer = Buffer.from(
    pixels.buffer,
    pixels.byteOffset,
    pixels.byteLength,
  );
  const scanlineStride = 1 + WIDTH * CHANNELS;
  const scanlines = Buffer.alloc(HEIGHT * scanlineStride);
  for (let y = 0; y < HEIGHT; y += 1) {
    const scanlineOffset = y * scanlineStride;
    scanlines[scanlineOffset] = 0;
    pixelBuffer.copy(
      scanlines,
      scanlineOffset + 1,
      y * WIDTH * CHANNELS,
      (y + 1) * WIDTH * CHANNELS,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', new Uint8Array()),
  ]);
}

import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_BYTES = 8 * 1024 * 1024;
const MIN_EDGE = 32;
const MAX_EDGE = 8000;

export class ImageError extends Error {
  constructor(message) {
    super(message);
    this.code = 'invalid_image';
    this.status = 400;
  }
}

function crc32(buffer) {
  let c = ~0;
  for (const byte of buffer) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Small valid PNG used by tests and local fixtures. */
export function samplePng(width = 64, height = 64) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    for (let x = 0; x < width; x += 1) {
      const index = row + 1 + x * 3;
      raw[index] = 40;
      raw[index + 1] = 90;
      raw[index + 2] = 60;
    }
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngSize(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) return null;
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') throw new ImageError('This PNG is missing its image header.');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), type: 'image/png' };
}

function jpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const size = buffer.readUInt16BE(offset + 2);
    if (size < 2 || offset + 2 + size > buffer.length) throw new ImageError('This JPEG is incomplete.');
    const startOfFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (startOfFrame) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), type: 'image/jpeg' };
    }
    offset += 2 + size;
  }
  throw new ImageError('This JPEG does not include a readable image size.');
}

/** Drop EXIF/XMP/IPTC segments so pickup photos do not keep GPS metadata. */
export function stripJpegMetadata(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer;
  const parts = [buffer.subarray(0, 2)];
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      parts.push(buffer.subarray(offset));
      break;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xda) {
      parts.push(buffer.subarray(offset));
      break;
    }
    if (marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const size = buffer.readUInt16BE(offset + 2);
    const next = offset + 2 + size;
    const metadata = marker === 0xe1 || marker === 0xe2 || marker === 0xed;
    if (!metadata) parts.push(buffer.subarray(offset, next));
    offset = next;
  }
  return Buffer.concat(parts);
}

function sips(args, input) {
  const directory = mkdtempSync(join(tmpdir(), 'relay-image-'));
  const source = join(directory, 'in.bin');
  const output = join(directory, 'out.jpg');
  try {
    writeFileSync(source, input);
    execFileSync('sips', [...args, source, '--out', output], { stdio: 'ignore' });
    return readFileSync(output);
  } catch {
    return null;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function processImage(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length === 0) throw new ImageError('Choose a photo to upload.');
  if (buffer.length > MAX_BYTES) throw new ImageError('Photos need to be 8 MB or smaller.');
  const info = pngSize(buffer) || jpegSize(buffer);
  if (!info) throw new ImageError('Use a JPEG or PNG photo.');
  if (info.width < MIN_EDGE || info.height < MIN_EDGE || info.width > MAX_EDGE || info.height > MAX_EDGE) {
    throw new ImageError('Photos need to be between 32 and 8000 pixels on each side.');
  }
  const stripped = info.type === 'image/jpeg' ? stripJpegMetadata(buffer) : buffer;
  const reencoded = sips(['-s', 'format', 'jpeg'], stripped) || stripped;
  const thumb = sips(['-s', 'format', 'jpeg', '-Z', '480'], reencoded) || reencoded;
  if (thumb.length > 1_500_000 && thumb === reencoded) throw new ImageError('Relay could not make a thumbnail for this photo. Try a smaller image.');
  const sized = jpegSize(reencoded) || info;
  return {
    buffer: reencoded,
    thumb,
    width: sized.width,
    height: sized.height,
    contentType: reencoded[0] === 0xff ? 'image/jpeg' : info.type,
  };
}

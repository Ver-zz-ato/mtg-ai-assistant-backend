const MAGIC_A = "MTSA";
const MAGIC_B = "MTSB";

export function encodeAIndex(names: string[], hashes: bigint[]): Buffer {
  const encoder = new TextEncoder();
  const nameBytes = names.map((n) => encoder.encode(n + "\0"));
  const namesBlobLen = nameBytes.reduce((s, b) => s + b.length, 0);
  const count = names.length;
  const headerSize = 12;
  const hashesSize = count * 8;
  const offsetsSize = count * 4;
  const buf = Buffer.alloc(headerSize + hashesSize + offsetsSize + namesBlobLen);
  buf.write(MAGIC_A, 0, 4, "ascii");
  buf.writeUInt32LE(1, 4);
  buf.writeUInt32LE(count, 8);
  let namesOffset = 0;
  for (let i = 0; i < count; i += 1) {
    const h = hashes[i] ?? 0n;
    buf.writeUInt32LE(Number(h & 0xffffffffn), headerSize + i * 8);
    buf.writeUInt32LE(Number((h >> 32n) & 0xffffffffn), headerSize + i * 8 + 4);
    buf.writeUInt32LE(namesOffset, headerSize + hashesSize + i * 4);
    nameBytes[i].forEach((byte, j) => {
      buf[headerSize + hashesSize + offsetsSize + namesOffset + j] = byte;
    });
    namesOffset += nameBytes[i].length;
  }
  return buf;
}

export function encodeBIndex(names: string[], vectors: Int8Array[], dim: number): Buffer {
  const encoder = new TextEncoder();
  const nameBytes = names.map((n) => encoder.encode(n + "\0"));
  const namesBlobLen = nameBytes.reduce((s, b) => s + b.length, 0);
  const count = names.length;
  const headerSize = 16;
  const vectorsSize = count * dim;
  const offsetsSize = count * 4;
  const buf = Buffer.alloc(headerSize + vectorsSize + offsetsSize + namesBlobLen);
  buf.write(MAGIC_B, 0, 4, "ascii");
  buf.writeUInt32LE(1, 4);
  buf.writeUInt32LE(count, 8);
  buf.writeUInt32LE(dim, 12);
  let vecAt = headerSize;
  for (let i = 0; i < count; i += 1) {
    const row = vectors[i];
    for (let j = 0; j < dim; j += 1) {
      buf[vecAt++] = row[j] ?? 0;
    }
  }
  let namesOffset = 0;
  const namesStart = headerSize + vectorsSize + offsetsSize;
  for (let i = 0; i < count; i += 1) {
    buf.writeUInt32LE(namesOffset, headerSize + vectorsSize + i * 4);
    nameBytes[i].forEach((byte, j) => {
      buf[namesStart + namesOffset + j] = byte;
    });
    namesOffset += nameBytes[i].length;
  }
  return buf;
}

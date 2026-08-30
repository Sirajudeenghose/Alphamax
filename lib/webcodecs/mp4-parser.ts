/**
 * Minimal ISO BMFF (MP4) parser for extracting video frame data.
 *
 * Parses only the boxes needed for WebCodecs decode:
 * ftyp, moov/trak/mdia/minf/stbl (stsd/avcC, stts, stsz, stsc, stco/co64), mdat.
 *
 * Designed for simple all-intra H.264 MP4s (single video track, no B-frames).
 */

export interface AvcConfig {
  codec: string;
  sps: Uint8Array;
  pps: Uint8Array;
  lengthSize: number;
}

export interface FrameInfo {
  index: number;
  offset: number;
  size: number;
  timestamp: number; // in timescale units
  duration: number; // in timescale units
  /** Raw frame bytes. Extracted during parse so the full MP4 buffer can be released. */
  data: Uint8Array;
}

export interface ParsedMp4 {
  codec: string;
  width: number;
  height: number;
  timescale: number;
  frameRate: number;
  frameIndex: FrameInfo[];
  avcConfig: AvcConfig;
}

// ─── Box reading ─────────────────────────────────────────────────────────────

function readBox(view: DataView, offset: number) {
  if (offset + 8 > view.byteLength) return null;
  const size = view.getUint32(offset);
  const type = String.fromCharCode(
    view.getUint8(offset + 4),
    view.getUint8(offset + 5),
    view.getUint8(offset + 6),
    view.getUint8(offset + 7)
  );
  if (size === 0) return null;
  if (size === 1) {
    if (offset + 16 > view.byteLength) return null;
    const largeSize = Number(view.getBigUint64(offset + 8));
    return { type, size: largeSize, headerSize: 16, dataOffset: offset + 16 };
  }
  return { type, size, headerSize: 8, dataOffset: offset + 8 };
}

function findBox(
  view: DataView,
  parentOffset: number,
  parentSize: number,
  targetType: string
) {
  let offset = parentOffset;
  const end = parentOffset + parentSize;
  while (offset < end) {
    const box = readBox(view, offset);
    if (!box) break;
    if (box.type === targetType) return box;
    offset += box.size;
  }
  return null;
}

// ─── avcC parser ─────────────────────────────────────────────────────────────

function parseAvcC(view: DataView, offset: number): AvcConfig {
  const profileIndication = view.getUint8(offset + 1);
  const profileCompatibility = view.getUint8(offset + 2);
  const levelIndication = view.getUint8(offset + 3);
  const lengthSizeMinusOne = view.getUint8(offset + 4) & 0x3;
  const numSPS = view.getUint8(offset + 5) & 0x1f;

  let pos = offset + 6;
  const spsList: Uint8Array[] = [];
  for (let i = 0; i < numSPS; i++) {
    const spsLen = view.getUint16(pos);
    pos += 2;
    spsList.push(new Uint8Array(view.buffer, pos, spsLen));
    pos += spsLen;
  }

  const numPPS = view.getUint8(pos);
  pos += 1;
  const ppsList: Uint8Array[] = [];
  for (let i = 0; i < numPPS; i++) {
    const ppsLen = view.getUint16(pos);
    pos += 2;
    ppsList.push(new Uint8Array(view.buffer, pos, ppsLen));
    pos += ppsLen;
  }

  const hex = (b: number) => b.toString(16).padStart(2, "0").toUpperCase();
  const codec = `avc1.${hex(profileIndication)}${hex(profileCompatibility)}${hex(levelIndication)}`;

  return {
    codec,
    sps: spsList[0],
    pps: ppsList[0],
    lengthSize: lengthSizeMinusOne + 1,
  };
}

// ─── Sample table parsers ────────────────────────────────────────────────────

function parseStts(view: DataView, offset: number) {
  const entryCount = view.getUint32(offset + 4);
  const entries: { count: number; delta: number }[] = [];
  let pos = offset + 8;
  for (let i = 0; i < entryCount; i++) {
    entries.push({ count: view.getUint32(pos), delta: view.getUint32(pos + 4) });
    pos += 8;
  }
  return entries;
}

function parseStsc(view: DataView, offset: number) {
  const entryCount = view.getUint32(offset + 4);
  const entries: {
    firstChunk: number;
    samplesPerChunk: number;
    sampleDescIndex: number;
  }[] = [];
  let pos = offset + 8;
  for (let i = 0; i < entryCount; i++) {
    entries.push({
      firstChunk: view.getUint32(pos),
      samplesPerChunk: view.getUint32(pos + 4),
      sampleDescIndex: view.getUint32(pos + 8),
    });
    pos += 12;
  }
  return entries;
}

function parseStsz(view: DataView, offset: number) {
  const sampleSize = view.getUint32(offset + 4);
  const sampleCount = view.getUint32(offset + 8);
  const sizes: number[] = [];
  if (sampleSize === 0) {
    let pos = offset + 12;
    for (let i = 0; i < sampleCount; i++) {
      sizes.push(view.getUint32(pos));
      pos += 4;
    }
  } else {
    for (let i = 0; i < sampleCount; i++) sizes.push(sampleSize);
  }
  return sizes;
}

function parseStco(view: DataView, offset: number) {
  const entryCount = view.getUint32(offset + 4);
  const offsets: number[] = [];
  let pos = offset + 8;
  for (let i = 0; i < entryCount; i++) {
    offsets.push(view.getUint32(pos));
    pos += 4;
  }
  return offsets;
}

function parseCo64(view: DataView, offset: number) {
  const entryCount = view.getUint32(offset + 4);
  const offsets: number[] = [];
  let pos = offset + 8;
  for (let i = 0; i < entryCount; i++) {
    offsets.push(Number(view.getBigUint64(pos)));
    pos += 8;
  }
  return offsets;
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseMp4(arrayBuffer: ArrayBuffer): ParsedMp4 {
  const data = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  // Find moov
  const moov = findBox(view, 0, data.byteLength, "moov");
  if (!moov) throw new Error("No moov box found in MP4");

  // Find trak
  const trak = findBox(
    view,
    moov.dataOffset,
    moov.size - moov.headerSize,
    "trak"
  );
  if (!trak) throw new Error("No trak box found");

  // Find mdia > minf > stbl
  const mdia = findBox(
    view,
    trak.dataOffset,
    trak.size - trak.headerSize,
    "mdia"
  );
  if (!mdia) throw new Error("No mdia box found");

  const minf = findBox(
    view,
    mdia.dataOffset,
    mdia.size - mdia.headerSize,
    "minf"
  );
  if (!minf) throw new Error("No minf box found");

  const stbl = findBox(
    view,
    minf.dataOffset,
    minf.size - minf.headerSize,
    "stbl"
  );
  if (!stbl) throw new Error("No stbl box found");

  // Parse stsd for codec config
  const stsd = findBox(
    view,
    stbl.dataOffset,
    stbl.size - stbl.headerSize,
    "stsd"
  );
  if (!stsd) throw new Error("No stsd box found");

  const stsdDataOffset = stsd.dataOffset;
  // stsd: version(1) + flags(3) + entryCount(4) + first entry...
  const entryCount = view.getUint32(stsdDataOffset + 4);
  if (entryCount < 1) throw new Error("No sample descriptions in stsd");

  // First entry starts at stsdDataOffset + 8
  const entryOffset = stsdDataOffset + 8;
  const entrySize = view.getUint32(entryOffset);
  const entryType = String.fromCharCode(
    view.getUint8(entryOffset + 4),
    view.getUint8(entryOffset + 5),
    view.getUint8(entryOffset + 6),
    view.getUint8(entryOffset + 7)
  );

  if (entryType !== "avc1")
    throw new Error(`Unsupported sample entry type: ${entryType}`);

  // avc1 box: skip header(8) + reserved(6) + data_ref_index(2) +
  //           pre_defined(2) + reserved(2) + pre_defined(12) = 32 bytes
  // Then: width(2) + height(2)
  const avc1DataStart = entryOffset + 8;
  const width = view.getUint16(avc1DataStart + 24);
  const height = view.getUint16(avc1DataStart + 26);

  // Child boxes (avcC, btrt, pasp, ...) do NOT start at avc1DataStart.
  // Between the width/height (read at +24/+26, confirmed against the scrub
  // files) and the first child box lie the remaining fixed VisualSampleEntry
  // fields: horizresolution(4) + vertresolution(4) + reserved(4) +
  // frame_count(2) + compressorname(32) + depth(2) + pre_defined(2) = 50
  // bytes. So child boxes begin at avc1DataStart + 78 (= 28 + 50). Scanning
  // from avc1DataStart instead hits the fixed fields as garbage box headers
  // and fails to find avcC ("No avcC box found").
  const sampleEntryChildStart = avc1DataStart + 78;
  const avcC = findBox(
    view,
    sampleEntryChildStart,
    entrySize - 8 - 78,
    "avcC"
  );
  if (!avcC) throw new Error("No avcC box found");

  const avcConfig = parseAvcC(view, avcC.dataOffset);

  // Parse sample table
  const stts = findBox(
    view,
    stbl.dataOffset,
    stbl.size - stbl.headerSize,
    "stts"
  );
  if (!stts) throw new Error("No stts box found");
  const sttsEntries = parseStts(view, stts.dataOffset);

  const stsz = findBox(
    view,
    stbl.dataOffset,
    stbl.size - stbl.headerSize,
    "stsz"
  );
  if (!stsz) throw new Error("No stsz box found");
  const sampleSizes = parseStsz(view, stsz.dataOffset);

  const stsc = findBox(
    view,
    stbl.dataOffset,
    stbl.size - stbl.headerSize,
    "stsc"
  );
  if (!stsc) throw new Error("No stsc box found");
  const stscEntries = parseStsc(view, stsc.dataOffset);

  // Try stco first, fall back to co64
  let chunkOffsets: number[];
  const stco = findBox(
    view,
    stbl.dataOffset,
    stbl.size - stbl.headerSize,
    "stco"
  );
  if (stco) {
    chunkOffsets = parseStco(view, stco.dataOffset);
  } else {
    const co64 = findBox(
      view,
      stbl.dataOffset,
      stbl.size - stbl.headerSize,
      "co64"
    );
    if (!co64) throw new Error("No stco or co64 box found");
    chunkOffsets = parseCo64(view, co64.dataOffset);
  }

  // Get timescale from mdia > mdhd
  const mdhd = findBox(
    view,
    mdia.dataOffset,
    mdia.size - mdia.headerSize,
    "mdhd"
  );
  const timescale = mdhd ? view.getUint32(mdhd.dataOffset + 4) : 24;

  // Build frame index
  const sampleCount = sampleSizes.length;
  const frameIndex: FrameInfo[] = [];
  let sampleIndex = 0;

  for (
    let chunkIdx = 0;
    chunkIdx < chunkOffsets.length;
    chunkIdx++
  ) {
    // Find samples per chunk from stsc
    let samplesInChunk = 1;
    for (let s = stscEntries.length - 1; s >= 0; s--) {
      if (chunkIdx + 1 >= stscEntries[s].firstChunk) {
        samplesInChunk = stscEntries[s].samplesPerChunk;
        break;
      }
    }

    let chunkOffset = chunkOffsets[chunkIdx];
    for (
      let s = 0;
      s < samplesInChunk && sampleIndex < sampleCount;
      s++
    ) {
      const size = sampleSizes[sampleIndex];

      // Compute timestamp from stts
      let timestamp = 0;
      let remaining = sampleIndex;
      for (const entry of sttsEntries) {
        if (remaining < entry.count) {
          timestamp += remaining * entry.delta;
          break;
        }
        timestamp += entry.count * entry.delta;
        remaining -= entry.count;
      }

      const duration =
        sttsEntries.length > 0 ? sttsEntries[0].delta : 0;

      frameIndex.push({
        index: sampleIndex,
        offset: chunkOffset,
        size,
        timestamp,
        duration,
        data: data.slice(chunkOffset, chunkOffset + size),
      });

      chunkOffset += size;
      sampleIndex++;
    }
  }

  // Derive frame rate from first frame duration
  const firstDuration = frameIndex.length > 0 ? frameIndex[0].duration : 0;
  const frameRate = firstDuration > 0 ? timescale / firstDuration : 24;

  return {
    codec: avcConfig.codec,
    width,
    height,
    timescale,
    frameRate,
    frameIndex,
    avcConfig,
  };
}

/**
 * Convert a timestamp in timescale units to seconds.
 */
export function timescaleToSeconds(
  timestamp: number,
  timescale: number
): number {
  return timestamp / timescale;
}

/**
 * Convert seconds to a frame index using the frame table.
 * Uses binary search for O(log n) lookup.
 */
export function secondsToFrameIndex(
  seconds: number,
  timescale: number,
  frameIndex: FrameInfo[]
): number {
  const targetTs = seconds * timescale;
  let lo = 0;
  let hi = frameIndex.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frameIndex[mid].timestamp <= targetTs) lo = mid + 1;
    else hi = mid - 1;
  }
  return Math.max(0, Math.min(lo, frameIndex.length - 1));
}

/**
 * Build VideoDecoderConfig from parsed MP4 avcC data.
 */
export function buildDecoderConfig(parsed: ParsedMp4): VideoDecoderConfig {
  const { avcConfig, width, height } = parsed;
  const sps = avcConfig.sps;
  const pps = avcConfig.pps;

  // Build avcC description box
  const descLength = 5 + 1 + 2 + sps.length + 1 + 2 + pps.length;
  const desc = new Uint8Array(descLength);
  const descView = new DataView(desc.buffer);
  desc[0] = 0x01; // configVersion
  desc[1] = sps[1]; // profile
  desc[2] = sps[2]; // compatibility
  desc[3] = sps[3]; // level
  desc[4] = 0xff; // lengthSizeMinusOne = 3 (4 bytes)
  desc[5] = 0xe1; // numSPS = 1
  descView.setUint16(6, sps.length);
  desc.set(sps, 8);
  let pos = 8 + sps.length;
  desc[pos] = 0x01; // numPPS = 1
  pos += 1;
  descView.setUint16(pos, pps.length);
  pos += 2;
  desc.set(pps, pos);

  return {
    codec: avcConfig.codec,
    codedWidth: width,
    codedHeight: height,
    description: desc,
  };
}

// When was a photo taken? Reads EXIF DateTimeOriginal from a JPEG (the first
// 256 KB is enough), falling back to the file's modified time. EXIF stores local
// wall-clock time with no zone, so it is read as the viewer's local time.

export async function photoTakenAt(file: File): Promise<Date> {
  try {
    const d = await exifDate(file);
    if (d && !Number.isNaN(d.getTime())) return d;
  } catch {
    // fall through
  }
  return new Date(file.lastModified || Date.now());
}

/** "YYYY-MM-DD" in the viewer's local time. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function exifDate(file: File): Promise<Date | null> {
  const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 <= v.byteLength) {
    const marker = v.getUint16(off);
    if ((marker & 0xff00) !== 0xff00) return null;
    const size = v.getUint16(off + 2);
    // APP1 starting with "Exif"
    if (marker === 0xffe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966) {
      return parseTiff(v, off + 10, Math.min(v.byteLength, off + 2 + size));
    }
    if (marker === 0xffda || size < 2) return null;
    off += 2 + size;
  }
  return null;
}

interface Entry {
  count: number;
  value: number;
}

function parseTiff(v: DataView, start: number, end: number): Date | null {
  if (start + 8 > end) return null;
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  const readIfd = (rel: number): Map<number, Entry> => {
    const out = new Map<number, Entry>();
    const p = start + rel;
    if (p + 2 > end) return out;
    const n = u16(p);
    for (let i = 0; i < n; i++) {
      const e = p + 2 + i * 12;
      if (e + 12 > end) break;
      out.set(u16(e), { count: u32(e + 4), value: e + 8 });
    }
    return out;
  };
  const str = (e: Entry): string | null => {
    const o = e.count > 4 ? start + u32(e.value) : e.value;
    if (o + e.count > end || e.count > 64) return null;
    let s = "";
    for (let i = 0; i < e.count; i++) {
      const c = v.getUint8(o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };

  const ifd0 = readIfd(u32(start + 4));
  let raw: string | null = null;
  const sub = ifd0.get(0x8769);
  if (sub) {
    const exif = readIfd(u32(sub.value));
    const e = exif.get(0x9003) ?? exif.get(0x9004);
    if (e) raw = str(e);
  }
  if (!raw) {
    const e = ifd0.get(0x0132);
    if (e) raw = str(e);
  }
  const m = raw?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  // Cameras with an unset clock report years like 1970 or 2000.
  return d.getFullYear() < 2005 ? null : d;
}

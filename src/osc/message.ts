/**
 * Minimal OSC 1.0 codec.
 *
 * TotalMix FX only accepts Float32 (",f") arguments — integers are silently
 * ignored — so the encoder is deliberately explicit about argument types.
 * Feedback from TotalMix arrives wrapped in "#bundle" packets, so the decoder
 * unwraps bundles recursively.
 */

export type OscArgType = "f" | "i" | "s";

export interface OscArg {
  type: OscArgType;
  value: number | string;
}

export interface OscMessage {
  address: string;
  args: OscArg[];
}

/** OSC 文字列(NUL 終端+4バイト境界パディング)を書き出す */
function oscString(str: string): Buffer {
  const len = Buffer.byteLength(str, "ascii") + 1;
  const padded = Math.ceil(len / 4) * 4;
  const buf = Buffer.alloc(padded);
  buf.write(str, 0, "ascii");
  return buf;
}

export function encodeMessage(address: string, args: OscArg[] = []): Buffer {
  const parts: Buffer[] = [oscString(address), oscString("," + args.map((a) => a.type).join(""))];
  for (const a of args) {
    switch (a.type) {
      case "f": {
        const b = Buffer.alloc(4);
        b.writeFloatBE(a.value as number);
        parts.push(b);
        break;
      }
      case "i": {
        const b = Buffer.alloc(4);
        b.writeInt32BE(a.value as number);
        parts.push(b);
        break;
      }
      case "s":
        parts.push(oscString(a.value as string));
        break;
    }
  }
  return Buffer.concat(parts);
}

function decodeMessage(buf: Buffer): OscMessage | null {
  let off = 0;
  const readString = (): string => {
    const end = buf.indexOf(0, off);
    const s = buf.toString("ascii", off, end < 0 ? buf.length : end);
    off = Math.ceil(((end < 0 ? buf.length : end) + 1) / 4) * 4;
    return s;
  };
  const address = readString();
  if (!address.startsWith("/")) return null;
  const tags = readString();
  const args: OscArg[] = [];
  if (!tags.startsWith(",")) return { address, args };
  for (const t of tags.slice(1)) {
    if (off > buf.length) break;
    if (t === "f") {
      args.push({ type: "f", value: buf.readFloatBE(off) });
      off += 4;
    } else if (t === "i") {
      args.push({ type: "i", value: buf.readInt32BE(off) });
      off += 4;
    } else if (t === "s") {
      args.push({ type: "s", value: readString() });
    } else {
      // 未対応型が来たら以降は読めないため打ち切る
      break;
    }
  }
  return { address, args };
}

/** パケット(単一メッセージまたは #bundle)をメッセージ配列へ展開する */
export function decodePacket(buf: Buffer): OscMessage[] {
  if (buf.length >= 16 && buf.toString("ascii", 0, 7) === "#bundle") {
    const messages: OscMessage[] = [];
    let off = 16; // "#bundle\0" (8) + timetag (8)
    while (off + 4 <= buf.length) {
      const size = buf.readInt32BE(off);
      off += 4;
      if (size <= 0 || off + size > buf.length) break;
      messages.push(...decodePacket(buf.subarray(off, off + size)));
      off += size;
    }
    return messages;
  }
  const m = decodeMessage(buf);
  return m ? [m] : [];
}

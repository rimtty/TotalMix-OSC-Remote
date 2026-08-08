// Minimal OSC 1.0 encoder/decoder (PoC / M1 milestone)
// TotalMix FX はフェーダー値として Float32 (typetag ",f") を期待する。
"use strict";

/** 4バイト境界へゼロパディングした OSC 文字列を書き出す */
function oscString(str) {
  const len = Buffer.byteLength(str, "ascii") + 1; // NUL 終端
  const padded = Math.ceil(len / 4) * 4;
  const buf = Buffer.alloc(padded);
  buf.write(str, 0, "ascii");
  return buf;
}

/** OSC メッセージをエンコードする。args: {type: "f"|"i"|"s", value}[] */
function encode(address, args = []) {
  const parts = [oscString(address), oscString("," + args.map(a => a.type).join(""))];
  for (const a of args) {
    if (a.type === "f") {
      const b = Buffer.alloc(4);
      b.writeFloatBE(a.value);
      parts.push(b);
    } else if (a.type === "i") {
      const b = Buffer.alloc(4);
      b.writeInt32BE(a.value);
      parts.push(b);
    } else if (a.type === "s") {
      parts.push(oscString(a.value));
    } else {
      throw new Error(`unsupported OSC type: ${a.type}`);
    }
  }
  return Buffer.concat(parts);
}

/** 単一メッセージをデコードする */
function decodeMessage(buf) {
  let off = 0;
  const readString = () => {
    const end = buf.indexOf(0, off);
    const s = buf.toString("ascii", off, end);
    off = Math.ceil((end + 1) / 4) * 4;
    return s;
  };
  const address = readString();
  const tags = readString();
  const args = [];
  for (const t of tags.slice(1)) {
    if (t === "f") { args.push({ type: "f", value: buf.readFloatBE(off) }); off += 4; }
    else if (t === "i") { args.push({ type: "i", value: buf.readInt32BE(off) }); off += 4; }
    else if (t === "s") { args.push({ type: "s", value: readString() }); }
    else return { address, tags, args, truncated: true };
  }
  return { address, tags, args };
}

/**
 * 受信パケットをメッセージ配列へデコードする。
 * TotalMix FX からのフィードバックは "#bundle" でラップされるため再帰的に展開する。
 */
function decodePacket(buf) {
  if (buf.length >= 8 && buf.toString("ascii", 0, 7) === "#bundle") {
    const messages = [];
    let off = 16; // "#bundle\0" (8) + timetag (8)
    while (off + 4 <= buf.length) {
      const size = buf.readInt32BE(off);
      off += 4;
      messages.push(...decodePacket(buf.subarray(off, off + size)));
      off += size;
    }
    return messages;
  }
  const m = decodeMessage(buf);
  return m && m.address.startsWith("/") ? [m] : [];
}

module.exports = { encode, decodePacket };

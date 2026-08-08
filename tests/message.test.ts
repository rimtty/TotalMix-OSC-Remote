import { describe, expect, it } from "vitest";
import { decodePacket, encodeMessage } from "../src/osc/message";

describe("encodeMessage", () => {
  it("encodes /1/mastervolume with Float32 typetag", () => {
    const buf = encodeMessage("/1/mastervolume", [{ type: "f", value: 0.5 }]);
    // "/1/mastervolume\0" = 16 bytes, ",f\0\0" = 4 bytes, float32 = 4 bytes
    expect(buf.length).toBe(24);
    expect(buf.toString("ascii", 0, 15)).toBe("/1/mastervolume");
    expect(buf[15]).toBe(0);
    expect(buf.toString("ascii", 16, 18)).toBe(",f");
    expect(buf.readFloatBE(20)).toBeCloseTo(0.5, 6);
  });

  it("pads addresses to 4-byte boundaries", () => {
    const buf = encodeMessage("/1/bank+", [{ type: "f", value: 1 }]);
    // "/1/bank+" = 8 chars + NUL → padded to 12
    expect(buf.toString("ascii", 0, 8)).toBe("/1/bank+");
    expect(buf.length).toBe(12 + 4 + 4);
  });

  it("never emits an integer typetag for float args", () => {
    const buf = encodeMessage("/1/volume1", [{ type: "f", value: 1 }]);
    expect(buf.includes(",i")).toBe(false);
    expect(buf.toString("ascii").includes(",f")).toBe(true);
  });
});

describe("decodePacket", () => {
  it("round-trips a float message", () => {
    const [m] = decodePacket(encodeMessage("/1/volume3", [{ type: "f", value: 0.8172 }]));
    expect(m?.address).toBe("/1/volume3");
    expect(m?.args[0]?.type).toBe("f");
    expect(m?.args[0]?.value as number).toBeCloseTo(0.8172, 4);
  });

  it("round-trips a string message", () => {
    const [m] = decodePacket(encodeMessage("/1/mastervolumeVal", [{ type: "s", value: "-12.0 dB" }]));
    expect(m?.args[0]?.value).toBe("-12.0 dB");
  });

  it("unwraps #bundle packets (TotalMix feedback format)", () => {
    const inner1 = encodeMessage("/1/mastervolume", [{ type: "f", value: 0.75 }]);
    const inner2 = encodeMessage("/1/mastervolumeVal", [{ type: "s", value: "-3.5 dB" }]);
    const header = Buffer.alloc(16);
    header.write("#bundle", 0, "ascii");
    const size1 = Buffer.alloc(4);
    size1.writeInt32BE(inner1.length);
    const size2 = Buffer.alloc(4);
    size2.writeInt32BE(inner2.length);
    const bundle = Buffer.concat([header, size1, inner1, size2, inner2]);

    const messages = decodePacket(bundle);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.address).toBe("/1/mastervolume");
    expect(messages[1]?.args[0]?.value).toBe("-3.5 dB");
  });

  it("unwraps nested bundles", () => {
    const inner = encodeMessage("/1/volume1", [{ type: "f", value: 0.1 }]);
    const innerHeader = Buffer.alloc(16);
    innerHeader.write("#bundle", 0, "ascii");
    const sizeInner = Buffer.alloc(4);
    sizeInner.writeInt32BE(inner.length);
    const innerBundle = Buffer.concat([innerHeader, sizeInner, inner]);

    const outerHeader = Buffer.alloc(16);
    outerHeader.write("#bundle", 0, "ascii");
    const sizeOuter = Buffer.alloc(4);
    sizeOuter.writeInt32BE(innerBundle.length);
    const outerBundle = Buffer.concat([outerHeader, sizeOuter, innerBundle]);

    const messages = decodePacket(outerBundle);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.address).toBe("/1/volume1");
  });

  it("ignores malformed packets", () => {
    expect(decodePacket(Buffer.from("garbage"))).toEqual([]);
  });
});

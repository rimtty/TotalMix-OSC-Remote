import dgram from "node:dgram";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OscClient, type BusMessage } from "../src/osc/client";
import { decodePacket, encodeMessage } from "../src/osc/message";

/** 偽 TotalMix: 受信パケットを記録する UDP ソケット */
interface FakeTotalMix {
  socket: dgram.Socket;
  port: number;
  received: { address: string; args: { type: string; value: number | string }[] }[];
  waitFor(address: string, timeoutMs?: number): Promise<void>;
}

function startFake(): Promise<FakeTotalMix> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const fake: FakeTotalMix = {
      socket,
      port: 0,
      received: [],
      waitFor(address, timeoutMs = 2000) {
        return new Promise((res, rej) => {
          const deadline = Date.now() + timeoutMs;
          const poll = () => {
            if (fake.received.some((m) => m.address === address)) return res();
            if (Date.now() > deadline) return rej(new Error(`timeout waiting for ${address}`));
            setTimeout(poll, 10);
          };
          poll();
        });
      },
    };
    socket.on("message", (msg) => {
      fake.received.push(...decodePacket(msg));
    });
    socket.on("error", reject);
    socket.bind(0, "127.0.0.1", () => {
      fake.port = socket.address().port;
      resolve(fake);
    });
  });
}

function randomRecvPort(): number {
  return 29000 + Math.floor(Math.random() * 20000);
}

describe("OscClient (UDP loopback integration)", () => {
  let fake: FakeTotalMix;
  let client: OscClient;
  let recvPort: number;

  beforeEach(async () => {
    fake = await startFake();
    client = new OscClient();
    recvPort = randomRecvPort();
    client.configure({ host: "127.0.0.1", sendPort: fake.port, recvPort });
  });

  afterEach(() => {
    client.stop();
    fake.socket.close();
  });

  it("pins the bank on connect (busOutput + setBankStart)", async () => {
    await fake.waitFor("/1/busOutput");
    await fake.waitFor("/setBankStart");
    const bus = fake.received.find((m) => m.address === "/1/busOutput");
    expect(bus?.args[0]?.type).toBe("f");
    expect(bus?.args[0]?.value).toBe(1);
    const bank = fake.received.find((m) => m.address === "/setBankStart");
    expect(bank?.args[0]?.type).toBe("f");
    expect(bank?.args[0]?.value).toBe(0);
  });

  it("sends fader values as Float32, never as int", async () => {
    client.sendFloat("/1/mastervolume", 0.8172);
    await fake.waitFor("/1/mastervolume");
    const m = fake.received.find((x) => x.address === "/1/mastervolume");
    expect(m?.args[0]?.type).toBe("f");
    expect(m?.args[0]?.value as number).toBeCloseTo(0.8172, 4);
  });

  it("caches feedback from bundle-wrapped packets", async () => {
    await fake.waitFor("/1/busOutput"); // クライアントの bind 完了を保証

    const inner1 = encodeMessage("/1/mastervolume", [{ type: "f", value: 0.75 }]);
    const inner2 = encodeMessage("/1/mastervolumeVal", [{ type: "s", value: "-3.5 dB" }]);
    const header = Buffer.alloc(16);
    header.write("#bundle", 0, "ascii");
    const s1 = Buffer.alloc(4);
    s1.writeInt32BE(inner1.length);
    const s2 = Buffer.alloc(4);
    s2.writeInt32BE(inner2.length);
    const bundle = Buffer.concat([header, s1, inner1, s2, inner2]);

    const got = new Promise<void>((resolve) => {
      client.on("message", (m: { address: string }) => {
        if (m.address === "/1/mastervolumeVal") resolve();
      });
    });
    fake.socket.send(bundle, recvPort, "127.0.0.1");
    await got;

    expect(client.getFloat("/1/mastervolume")).toBeCloseTo(0.75, 4);
    expect(client.getString("/1/mastervolumeVal")).toBe("-3.5 dB");
  });

  it("switches bus before sending bank-relative messages (sendFloatTo)", async () => {
    await fake.waitFor("/1/busOutput"); // 初期 pin 完了を待つ
    fake.received.length = 0;

    const sendDone = client.sendFloatTo("playback", "/1/volume4", 0.5);
    await fake.waitFor("/1/busPlayback");
    // エコーを返してバス確定させる
    fake.socket.send(encodeMessage("/1/busPlayback", [{ type: "f", value: 1 }]), recvPort, "127.0.0.1");
    await sendDone;
    await fake.waitFor("/1/volume4");

    const busIdx = fake.received.findIndex((m) => m.address === "/1/busPlayback");
    const volIdx = fake.received.findIndex((m) => m.address === "/1/volume4");
    expect(busIdx).toBeGreaterThanOrEqual(0);
    expect(volIdx).toBeGreaterThan(busIdx);
    const bankStart = fake.received.find((m) => m.address === "/setBankStart");
    expect(bankStart?.args[0]?.type).toBe("f");
    expect(client.activeBus).toBe("playback");
  });

  it("namespaces bank-relative feedback per bus", async () => {
    await fake.waitFor("/1/busOutput");

    const received: string[] = [];
    client.on("message", (m: BusMessage) => received.push(`${m.bus}${m.address}`));

    const sendToClient = (buf: Buffer) =>
      new Promise<void>((resolve, reject) =>
        fake.socket.send(buf, recvPort, "127.0.0.1", (err) => (err ? reject(err) : resolve())),
      );
    const until = (marker: string, timeoutMs = 2000) =>
      new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + timeoutMs;
        const poll = () => {
          if (received.includes(marker)) return resolve();
          if (Date.now() > deadline) return reject(new Error(`timeout waiting for ${marker}`));
          setTimeout(poll, 10);
        };
        poll();
      });

    // input バスのダンプ: バスエコー → volume3
    await sendToClient(encodeMessage("/1/busInput", [{ type: "f", value: 1 }]));
    await sendToClient(encodeMessage("/1/volume3", [{ type: "f", value: 0.25 }]));
    await until("input/1/volume3");

    // output バスへ切替 → 同じ volume3 に別の値
    await sendToClient(encodeMessage("/1/busOutput", [{ type: "f", value: 1 }]));
    await sendToClient(encodeMessage("/1/volume3", [{ type: "f", value: 0.75 }]));
    await until("output/1/volume3");

    expect(client.getFloat("/1/volume3", "input")).toBeCloseTo(0.25, 4);
    expect(client.getFloat("/1/volume3", "output")).toBeCloseTo(0.75, 4);
    // バス非依存アドレスは名前空間化されない
    expect(client.getFloat("/1/mastervolume", "input")).toBe(client.getFloat("/1/mastervolume", "output"));
  });
});

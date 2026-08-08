// M1 PoC: TotalMix FX の Main フェーダーを OSC (Float32) で操作する
//
// 使い方:
//   node send-mastervolume.js <value 0.0-1.0> [host] [port]
//   例: node send-mastervolume.js 0.5
//
// 前提: TotalMix FX 側で OSC を有効化し、受信ポート(既定 7001)を合わせること。
// ⚠ 実行すると実際に Main アウトの音量が変わる。大音量事故に注意。
"use strict";
const dgram = require("node:dgram");
const { encode, decodePacket } = require("./osc");

const value = Number(process.argv[2]);
const host = process.argv[3] ?? "127.0.0.1";
const port = Number(process.argv[4] ?? 7001);
const FEEDBACK_PORT = 9001; // TotalMix の送信ポート既定値

if (!(value >= 0 && value <= 1)) {
  console.error("value must be a float in 0.0-1.0");
  process.exit(1);
}

// フィードバック受信(TotalMix -> ここ)
const rx = dgram.createSocket("udp4");
rx.on("message", (msg) => {
  for (const m of decodePacket(msg)) {
    if (/mastervolume/i.test(m.address)) {
      console.log(`[feedback] ${m.address} ${m.tags}`, m.args.map(a => a.value));
    }
  }
});
rx.bind(FEEDBACK_PORT, () => {
  // 送信(ここ -> TotalMix)。必ず Float32 (",f") で送る。
  const tx = dgram.createSocket("udp4");
  const packet = encode("/1/mastervolume", [{ type: "f", value }]);
  tx.send(packet, port, host, (err) => {
    if (err) { console.error(err); process.exit(1); }
    console.log(`sent /1/mastervolume ,f ${value} -> ${host}:${port}`);
    tx.close();
    // フィードバックを2秒間だけ待って終了
    setTimeout(() => { rx.close(); }, 2000);
  });
});

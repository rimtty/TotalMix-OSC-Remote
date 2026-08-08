import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { decodePacket, encodeMessage, type OscMessage } from "./message";

export interface OscConfig {
  host: string;
  /** TotalMix の受信ポート(Port incoming)。プラグイン → TotalMix */
  sendPort: number;
  /** TotalMix の送信ポート(Port outgoing)。TotalMix → プラグイン */
  recvPort: number;
}

export const DEFAULT_CONFIG: OscConfig = {
  host: "127.0.0.1",
  sendPort: 7001,
  recvPort: 9001,
};

export type OscStatus = "stopped" | "listening" | "error";

/**
 * 全アクションで共有する OSC/UDP シングルトンクライアント。
 *
 * - 送信は常に Float32(TotalMix は Int を無視する)
 * - 起動時にバンク固定(/1/busOutput 1.0 → /setBankStart 0)を送る
 * - 受信値はキャッシュし "message" イベントで配信する。受信値の再送信は
 *   TotalMix 側の丸めで音量がクリープするため行わない
 */
class OscClient extends EventEmitter {
  private socket?: dgram.Socket;
  private config: OscConfig = { ...DEFAULT_CONFIG };
  private cache = new Map<string, number | string>();
  private _status: OscStatus = "stopped";
  private lastError?: string;

  get status(): OscStatus {
    return this._status;
  }

  get statusDetail(): string | undefined {
    return this.lastError;
  }

  get currentConfig(): OscConfig {
    return { ...this.config };
  }

  configure(cfg: Partial<OscConfig>): void {
    const next: OscConfig = {
      host: cfg.host?.trim() || DEFAULT_CONFIG.host,
      sendPort: Number(cfg.sendPort) || DEFAULT_CONFIG.sendPort,
      recvPort: Number(cfg.recvPort) || DEFAULT_CONFIG.recvPort,
    };
    const changed =
      next.host !== this.config.host ||
      next.sendPort !== this.config.sendPort ||
      next.recvPort !== this.config.recvPort;
    this.config = next;
    if (changed || !this.socket) this.restart();
  }

  private restart(): void {
    this.stop();
    const socket = dgram.createSocket("udp4");
    this.socket = socket;
    socket.on("message", (msg) => {
      for (const m of decodePacket(msg)) this.handleMessage(m);
    });
    socket.on("error", (err) => {
      this.lastError = String(err.message ?? err);
      this._status = "error";
      this.emit("status", this._status);
      socket.close();
      if (this.socket === socket) this.socket = undefined;
    });
    socket.bind(this.config.recvPort, () => {
      this._status = "listening";
      this.lastError = undefined;
      this.emit("status", this._status);
      this.pinBank();
    });
  }

  stop(): void {
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // already closed
      }
      this.socket = undefined;
    }
    this._status = "stopped";
  }

  private handleMessage(m: OscMessage): void {
    const first = m.args[0];
    if (first !== undefined) this.cache.set(m.address, first.value);
    this.emit("message", m);
  }

  sendFloat(address: string, value: number): void {
    if (!this.socket) this.restart();
    const packet = encodeMessage(address, [{ type: "f", value }]);
    this.socket?.send(packet, this.config.sendPort, this.config.host);
  }

  /** バンク固定: Output バス選択+バンク先頭へ。全値フィードバックも誘発する */
  pinBank(): void {
    this.sendFloat("/1/busOutput", 1);
    this.sendFloat("/setBankStart", 0);
  }

  /** バス再選択でバンク全体の状態ダンプを要求する */
  refresh(): void {
    this.sendFloat("/1/busOutput", 1);
  }

  getFloat(address: string): number | undefined {
    const v = this.cache.get(address);
    return typeof v === "number" ? v : undefined;
  }

  getString(address: string): string | undefined {
    const v = this.cache.get(address);
    return typeof v === "string" ? v : undefined;
  }
}

export const osc = new OscClient();

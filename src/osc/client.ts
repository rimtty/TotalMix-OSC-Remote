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

/** TotalMix のミキサー行(パッチ段) */
export type Bus = "input" | "playback" | "output";

export const BUS_ADDRESS: Record<Bus, string> = {
  input: "/1/busInput",
  playback: "/1/busPlayback",
  output: "/1/busOutput",
};

/** 現在選択中のバスに依存する(バンク相対の)アドレスか */
const BANK_RELATIVE =
  /^\/1\/(volume\d+(Val)?|pan\d+(Val)?|mute\/1\/\d+|solo\/1\/\d+|trackname\d+|level\d+(Left|Right))$/;

/** バス確定を待つ最大時間。エコーが来なくても楽観的に進む */
const BUS_SWITCH_TIMEOUT_MS = 400;

export interface BusMessage extends OscMessage {
  /** このメッセージ受信時点で TotalMix 側が選択していた(と追跡している)バス */
  bus: Bus;
}

/**
 * 全アクションで共有する OSC/UDP シングルトンクライアント。
 *
 * - 送信は常に Float32(TotalMix は Int を無視する)
 * - `/1/volume{n}` 等は選択中バスへの相対アドレスのため、`ensureBus()` で
 *   行(Hardware Input / Software Playback / Hardware Output)を切り替えてから送る
 * - バンク相対アドレスの受信値はバスごとに分離してキャッシュする
 * - 受信値の再送信は TotalMix 側の丸めで音量がクリープするため行わない
 */
export class OscClient extends EventEmitter {
  private socket?: dgram.Socket;
  private config: OscConfig = { ...DEFAULT_CONFIG };
  private cache = new Map<string, number | string>();
  private _status: OscStatus = "stopped";
  private lastError?: string;

  /** TotalMix からのエコーで確定した現在バス(初期値はバンク固定時の output) */
  private confirmedBus: Bus = "output";
  private busWaiters: { bus: Bus; resolve: () => void; timer: NodeJS.Timeout }[] = [];

  get status(): OscStatus {
    return this._status;
  }

  get statusDetail(): string | undefined {
    return this.lastError;
  }

  get currentConfig(): OscConfig {
    return { ...this.config };
  }

  get activeBus(): Bus {
    return this.confirmedBus;
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
    for (const w of this.busWaiters) {
      clearTimeout(w.timer);
      w.resolve();
    }
    this.busWaiters = [];
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

    // バス選択のエコーで現在バスを確定する(状態ダンプの先頭で届く)
    for (const [bus, address] of Object.entries(BUS_ADDRESS) as [Bus, string][]) {
      if (m.address === address && typeof first?.value === "number" && first.value >= 0.5) {
        this.confirmedBus = bus;
        this.busWaiters = this.busWaiters.filter((w) => {
          if (w.bus !== bus) return true;
          clearTimeout(w.timer);
          w.resolve();
          return false;
        });
      }
    }

    if (first !== undefined) this.cache.set(this.cacheKey(m.address, this.confirmedBus), first.value);
    const busMessage: BusMessage = { ...m, bus: this.confirmedBus };
    this.emit("message", busMessage);
  }

  private cacheKey(address: string, bus: Bus): string {
    return BANK_RELATIVE.test(address) ? `${bus}|${address}` : address;
  }

  sendFloat(address: string, value: number): void {
    if (!this.socket) this.restart();
    const packet = encodeMessage(address, [{ type: "f", value }]);
    this.socket?.send(packet, this.config.sendPort, this.config.host);
  }

  /**
   * 対象バスを選択してから送信する。バス切替が発生した場合は
   * TotalMix のエコー(またはタイムアウト)まで待つ。
   * @returns switched: バス切替を送ったかどうか
   */
  async ensureBus(bus: Bus): Promise<{ switched: boolean }> {
    if (this.confirmedBus === bus) return { switched: false };
    this.sendFloat(BUS_ADDRESS[bus], 1);
    this.sendFloat("/setBankStart", 0);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        // エコーが来なくても楽観的に確定して先へ進む
        this.confirmedBus = bus;
        this.busWaiters = this.busWaiters.filter((w) => w.timer !== timer);
        resolve();
      }, BUS_SWITCH_TIMEOUT_MS);
      this.busWaiters.push({ bus, resolve, timer });
    });
    return { switched: true };
  }

  /** bus が null(mastervolume 等のステートレスアドレス)ならそのまま送る */
  async sendFloatTo(bus: Bus | null, address: string, value: number): Promise<void> {
    if (bus) await this.ensureBus(bus);
    this.sendFloat(address, value);
  }

  /** バンク固定: Output バス選択+バンク先頭へ。全値フィードバックも誘発する */
  pinBank(): void {
    this.sendFloat("/1/busOutput", 1);
    this.sendFloat("/setBankStart", 0);
  }

  /** バス再選択でバンク全体の状態ダンプを要求する */
  refresh(): void {
    this.sendFloat(BUS_ADDRESS[this.confirmedBus], 1);
  }

  getFloat(address: string, bus?: Bus): number | undefined {
    const v = this.cache.get(this.cacheKey(address, bus ?? this.confirmedBus));
    return typeof v === "number" ? v : undefined;
  }

  getString(address: string, bus?: Bus): string | undefined {
    const v = this.cache.get(this.cacheKey(address, bus ?? this.confirmedBus));
    return typeof v === "string" ? v : undefined;
  }
}

export const osc = new OscClient();

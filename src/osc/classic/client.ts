import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import {
  DEFAULT_CONFIG,
  refKey,
  type Bus,
  type ChangeEvent,
  type ChannelItem,
  type OscBackend,
  type OscConfig,
  type OscStatus,
  type TargetRef,
} from "../backend";
import { decodePacket, encodeMessage, type OscMessage } from "../message";
import { DEVICES, getDevice, getStrips } from "../../totalmix/devices";

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

/** バス切替後、状態ダンプの到着を待つ時間 */
const BUS_SETTLE_MS = 250;

export interface BusMessage extends OscMessage {
  /** このメッセージ受信時点で TotalMix 側が選択していた(と追跡している)バス */
  bus: Bus;
}

/**
 * クラシック(TouchOSC 互換)プロトコルのバックエンド実装。
 *
 * - 送信は常に Float32(TotalMix は Int を無視する)
 * - `/1/volume{n}` 等は選択中バスへの相対アドレスのため、`ensureBus()` で
 *   行を切り替えてから送る。バンクは常に先頭へ固定(/setBankStart 0)
 * - バンク相対アドレスの受信値はバスごとに分離してキャッシュする
 * - 受信値の再送信は TotalMix 側の丸めで音量がクリープするため行わない
 */
export class ClassicBackend extends EventEmitter implements OscBackend {
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

  // ----- OscBackend: 接続管理 -----

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

  /** バス再選択でバンク全体の状態ダンプを要求する */
  refresh(): void {
    this.sendFloat(BUS_ADDRESS[this.confirmedBus], 1);
  }

  // ----- OscBackend: ターゲット操作 -----

  async prepare(ref: TargetRef): Promise<void> {
    if (ref.kind !== "strip") return;
    const { switched } = await this.ensureBus(ref.bus);
    if (switched) await delay(BUS_SETTLE_MS);
  }

  getFader(ref: TargetRef): number | undefined {
    return this.getFloat(volumeAddress(ref), busOf(ref));
  }

  async setFader(ref: TargetRef, value: number): Promise<void> {
    await this.sendFloatTo(busOf(ref), volumeAddress(ref), value);
  }

  getDisplayValue(ref: TargetRef): string | undefined {
    return this.getString(volumeValAddress(ref), busOf(ref));
  }

  getMute(ref: TargetRef): boolean | undefined {
    const v = this.getFloat(muteStateAddress(ref), busOf(ref));
    return v === undefined ? undefined : v >= 0.5;
  }

  async toggleMute(ref: TargetRef): Promise<void> {
    if (ref.kind === "master") {
      // Main には専用 Mute が無い → mainDim をトグル(TotalMix 側 Dim 設定に従う)
      this.sendFloat("/1/mainDim", 1);
      return;
    }
    // バス切替を挟む場合は最新状態を取り直してからトグルする
    await this.prepare(ref);
    const current = this.getMute(ref) ?? false;
    await this.sendFloatTo(ref.bus, muteStateAddress(ref), current ? 0 : 1);
  }

  /**
   * 指定バスのチャンネル一覧。TotalMix の trackname フィードバック(ライブ)を
   * 優先し、未取得ならデバイス定義(既定ステレオペア)にフォールバックする。
   */
  async listChannels(bus: Bus, deviceId?: string): Promise<ChannelItem[]> {
    const { switched } = await this.ensureBus(bus);
    if (switched) await delay(300);

    const live: ChannelItem[] = [];
    for (let n = 1; n <= 48; n++) {
      const name = this.getString(`/1/trackname${n}`, bus);
      // "n.a." はバンク内の空き枠(実チャンネルはそこで終わり)
      if (name === undefined || name === "" || name === "n.a.") break;
      live.push({ value: String(n), label: `${n}: ${name}` });
    }
    if (live.length > 0) return live;

    const device = getDevice(deviceId) ?? DEVICES[0];
    if (!device) return [];
    return getStrips(device, bus).map((s) => ({ value: String(s.strip), label: `${s.strip}: ${s.label}` }));
  }

  onChange(cb: (ev: ChangeEvent) => void): void {
    this.on("change", cb);
  }

  onStatus(cb: (status: OscStatus) => void): void {
    this.on("status", cb);
  }

  // ----- クラシックプロトコル内部 -----

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

    const change = this.toChangeEvent(busMessage);
    if (change) this.emit("change", change);
  }

  /** 受信アドレスを正規化イベントへ変換する(該当なしは null) */
  private toChangeEvent(m: BusMessage): ChangeEvent | null {
    const value = m.args[0]?.value;

    if (m.address === "/1/mastervolume" && typeof value === "number") {
      return { type: "fader", key: "master", value };
    }
    if (m.address === "/1/mastervolumeVal" && typeof value === "string") {
      return { type: "faderDisplay", key: "master", text: value };
    }
    if (m.address === "/1/mainDim" && typeof value === "number") {
      return { type: "mute", key: "master", value: value >= 0.5 };
    }

    let match = /^\/1\/volume(\d+)$/.exec(m.address);
    if (match && typeof value === "number") {
      return { type: "fader", key: `${m.bus}:${match[1]}`, value };
    }
    match = /^\/1\/volume(\d+)Val$/.exec(m.address);
    if (match && typeof value === "string") {
      return { type: "faderDisplay", key: `${m.bus}:${match[1]}`, text: value };
    }
    match = /^\/1\/mute\/1\/(\d+)$/.exec(m.address);
    if (match && typeof value === "number") {
      return { type: "mute", key: `${m.bus}:${match[1]}`, value: value >= 0.5 };
    }
    return null;
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

  getFloat(address: string, bus?: Bus | null): number | undefined {
    const v = this.cache.get(this.cacheKey(address, bus ?? this.confirmedBus));
    return typeof v === "number" ? v : undefined;
  }

  getString(address: string, bus?: Bus | null): string | undefined {
    const v = this.cache.get(this.cacheKey(address, bus ?? this.confirmedBus));
    return typeof v === "string" ? v : undefined;
  }
}

// ----- ref → クラシックアドレスのマッピング -----

function busOf(ref: TargetRef): Bus | null {
  return ref.kind === "strip" ? ref.bus : null;
}

function volumeAddress(ref: TargetRef): string {
  return ref.kind === "master" ? "/1/mastervolume" : `/1/volume${ref.strip}`;
}

function volumeValAddress(ref: TargetRef): string {
  return ref.kind === "master" ? "/1/mastervolumeVal" : `/1/volume${ref.strip}Val`;
}

/** master は mainDim の状態を Mute 状態として扱う */
function muteStateAddress(ref: TargetRef): string {
  return ref.kind === "master" ? "/1/mainDim" : `/1/mute/1/${ref.strip}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// re-export: 既存コードとテストの互換用
export { refKey };

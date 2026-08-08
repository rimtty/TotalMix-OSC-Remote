/**
 * Protocol-neutral backend abstraction.
 *
 * Actions talk exclusively to {@link OscBackend} in terms of targets
 * (Main Out or a strip in a mixer row) and normalized values — they know
 * nothing about OSC addresses, banks or buses. The classic TotalMix
 * protocol lives in ./classic; a Global OSC backend (TotalMix FX 2.1+)
 * can be added behind the same interface (docs/GLOBAL-OSC-PLAN.md).
 */

export type Bus = "input" | "playback" | "output";

export type OscStatus = "stopped" | "listening" | "error";

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

/** 操作対象: Control Room の Main、または指定パッチ段のストリップ */
export type TargetRef =
  | { kind: "master" }
  | { kind: "strip"; bus: Bus; strip: number };

/** ChangeEvent のマッチングに使う正準キー */
export function refKey(ref: TargetRef): string {
  return ref.kind === "master" ? "master" : `${ref.bus}:${ref.strip}`;
}

export type ChannelItem = { value: string; label: string };

/** バックエンドが正規化して配信する状態変化 */
export type ChangeEvent =
  | { type: "fader"; key: string; value: number }
  | { type: "faderDisplay"; key: string; text: string }
  | { type: "mute"; key: string; value: boolean };

export interface OscBackend {
  readonly status: OscStatus;
  readonly statusDetail: string | undefined;

  configure(cfg: Partial<OscConfig>): void;
  stop(): void;
  /** 対象デバイスに全量状態の再送を要求する */
  refresh(): void;

  /**
   * 状態を読む前の同期(必要な場合のみ)。クラシックではバス切替+
   * ダンプ待ちに相当する。Global OSC ではノーオペになる想定。
   */
  prepare(ref: TargetRef): Promise<void>;

  /** フェーダー位置(正規化 0..1)。dB との相互変換は taper.ts を使う */
  getFader(ref: TargetRef): number | undefined;
  setFader(ref: TargetRef, value: number): Promise<void>;
  /** デバイスが報告する表示用文字列(例 "-12.0 dB")。無ければ undefined */
  getDisplayValue(ref: TargetRef): string | undefined;

  getMute(ref: TargetRef): boolean | undefined;
  /**
   * Mute のトグル。master はプロトコルにより実装が異なる
   * (クラシック: Main に Mute が無いため Dim トグルで代替)。
   */
  toggleMute(ref: TargetRef): Promise<void>;

  /** 指定パッチ段のチャンネル一覧(可能ならライブ名、なければデバイス定義) */
  listChannels(bus: Bus, deviceId?: string): Promise<ChannelItem[]>;

  onChange(cb: (ev: ChangeEvent) => void): void;
  onStatus(cb: (status: OscStatus) => void): void;
}

/** Shared settings types for actions and the Property Inspector. */

import type { Bus, TargetRef } from "./osc/backend";

export type GlobalSettings = {
  host?: string;
  sendPort?: number | string;
  recvPort?: number | string;
};

/**
 * ターゲット共通:
 * - master: Control Room の Main フェーダー
 * - strip:  指定バス(パッチ段)のストリップ
 */
export type TargetSettings = {
  target?: "master" | "strip";
  /** パッチ段: Hardware Input / Software Playback / Hardware Output */
  bus?: Bus;
  device?: string;
  strip?: number | string;
};

export type FaderDialSettings = TargetSettings & {
  /** 1クリックあたりの変化量(%) */
  stepPct?: number | string;
  /** 押しながら回転時の変化量(%) */
  fineStepPct?: number | string;
  pushAction?: "reset0db" | "mute";
  /** ロングタッチでジャンプする値(dB) */
  presetDb?: number | string;
  title?: string;
};

export type MuteKeySettings = TargetSettings;

export type FaderDimKeySettings = TargetSettings & {
  mode?: "db" | "factor";
  /** dB モードの減衰量(負値、既定 -20) */
  dimDb?: number | string;
  /** factor モードの倍率(既定 0.1) */
  factor?: number | string;
};

/** アクション設定 → バックエンドのターゲット参照 */
export function targetRefOf(s: TargetSettings): TargetRef {
  if ((s.target ?? "master") === "master") return { kind: "master" };
  return {
    kind: "strip",
    bus: (s.bus as Bus) || "output",
    strip: Number(s.strip) || 1,
  };
}

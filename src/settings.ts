/** Shared settings types for actions and the Property Inspector. */

export type GlobalSettings = {
  host?: string;
  sendPort?: number | string;
  recvPort?: number | string;
};

/** ターゲット共通: Main(mastervolume)か Output ストリップか */
export type TargetSettings = {
  target?: "master" | "strip";
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

export type MuteKeySettings = TargetSettings & {
  /** master 選択時の挙動: mainDim トグル */
};

export type FaderDimKeySettings = TargetSettings & {
  mode?: "db" | "factor";
  /** dB モードの減衰量(負値、既定 -20) */
  dimDb?: number | string;
  /** factor モードの倍率(既定 0.1) */
  factor?: number | string;
};

export function targetVolumeAddress(s: TargetSettings): string {
  if ((s.target ?? "master") === "master") return "/1/mastervolume";
  return `/1/volume${Number(s.strip) || 1}`;
}

export function targetVolumeValAddress(s: TargetSettings): string {
  if ((s.target ?? "master") === "master") return "/1/mastervolumeVal";
  return `/1/volume${Number(s.strip) || 1}Val`;
}

/** master には専用 Mute が無いため null(呼び出し側で mainDim 等にフォールバック) */
export function targetMuteAddress(s: TargetSettings): string | null {
  if ((s.target ?? "master") === "master") return null;
  return `/1/mute/1/${Number(s.strip) || 1}`;
}

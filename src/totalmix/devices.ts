/**
 * Strip definitions per supported RME device and mixer row (bus).
 *
 * Strip numbers are 1-based positions within the row with all channels in
 * their default stereo pairing, assuming the OSC bank is pinned to the start
 * (/setBankStart 0) and the bank size covers all strips (docs/OSC-ENDPOINTS.md).
 *
 * NOTE: これは既定(全ステレオペア)のフォールバック。実際のストリップ構成は
 * モノ分割設定でずれるため、Property Inspector のチャンネル一覧は可能なら
 * TotalMix からの trackname フィードバック(ライブ取得)を優先する。
 */

import type { Bus } from "../osc/client";

export interface Strip {
  /** 1-based strip index → /1/volume{strip}, /1/mute/1/{strip} */
  strip: number;
  label: string;
}

export interface DeviceDef {
  id: string;
  name: string;
  inputs: Strip[];
  playbacks: Strip[];
  outputs: Strip[];
}

function strips(labels: string[]): Strip[] {
  return labels.map((label, i) => ({ strip: i + 1, label }));
}

export const DEVICES: DeviceDef[] = [
  {
    id: "ucx2",
    name: "Fireface UCX II",
    inputs: strips([
      "Mic/Line 1/2",
      "AN 3/4",
      "AN 5/6",
      "AN 7/8",
      "SPDIF",
      "AES",
      "ADAT 1/2",
      "ADAT 3/4",
      "ADAT 5/6",
      "ADAT 7/8",
    ]),
    playbacks: strips([
      "AN 1/2",
      "AN 3/4",
      "AN 5/6",
      "Phones 7/8",
      "SPDIF",
      "AES",
      "ADAT 1/2",
      "ADAT 3/4",
      "ADAT 5/6",
      "ADAT 7/8",
    ]),
    outputs: strips([
      "AN 1/2 (Main)",
      "AN 3/4",
      "AN 5/6",
      "Phones 7/8",
      "SPDIF",
      "AES",
      "ADAT 1/2",
      "ADAT 3/4",
      "ADAT 5/6",
      "ADAT 7/8",
    ]),
  },
  {
    id: "ucx",
    name: "Fireface UCX",
    inputs: strips([
      "Mic/Line 1/2",
      "AN 3/4",
      "AN 5/6",
      "AN 7/8",
      "SPDIF",
      "ADAT 1/2",
      "ADAT 3/4",
      "ADAT 5/6",
      "ADAT 7/8",
    ]),
    playbacks: strips([
      "AN 1/2",
      "AN 3/4",
      "AN 5/6",
      "Phones 7/8",
      "SPDIF",
      "ADAT 1/2",
      "ADAT 3/4",
      "ADAT 5/6",
      "ADAT 7/8",
    ]),
    outputs: strips([
      "AN 1/2 (Main)",
      "AN 3/4",
      "AN 5/6",
      "Phones 7/8",
      "SPDIF",
      "ADAT 1/2 (SPDIF opt)",
      "ADAT 3/4",
      "ADAT 5/6",
      "ADAT 7/8",
    ]),
  },
  {
    id: "babyface-pro",
    name: "Babyface Pro (FS)",
    inputs: strips(["Mic 1/2", "Line 3/4", "AS 1/2 (ADAT/SPDIF)", "ADAT 3/4", "ADAT 5/6", "ADAT 7/8"]),
    playbacks: strips(["AN 1/2", "Phones 3/4", "AS 1/2 (ADAT/SPDIF)", "ADAT 3/4", "ADAT 5/6", "ADAT 7/8"]),
    outputs: strips(["AN 1/2 (Main)", "Phones 3/4", "AS 1/2 (ADAT/SPDIF)", "ADAT 3/4", "ADAT 5/6", "ADAT 7/8"]),
  },
];

export function getDevice(id: string | undefined): DeviceDef | undefined {
  return DEVICES.find((d) => d.id === id);
}

export function getStrips(device: DeviceDef, bus: Bus): Strip[] {
  switch (bus) {
    case "input":
      return device.inputs;
    case "playback":
      return device.playbacks;
    default:
      return device.outputs;
  }
}

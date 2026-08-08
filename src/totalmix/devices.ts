/**
 * Output strip definitions per supported RME device.
 *
 * Strip numbers are 1-based positions in the Output bus with all channels in
 * their default stereo pairing, assuming the OSC bank is pinned to the start
 * (/setBankStart 0) and the bank size covers all strips (docs/OSC-ENDPOINTS.md).
 */

export interface OutputStrip {
  /** 1-based strip index → /1/volume{strip}, /1/mute/1/{strip} */
  strip: number;
  label: string;
}

export interface DeviceDef {
  id: string;
  name: string;
  outputs: OutputStrip[];
}

export const DEVICES: DeviceDef[] = [
  {
    id: "ucx2",
    name: "Fireface UCX II",
    outputs: [
      { strip: 1, label: "AN 1/2 (Main)" },
      { strip: 2, label: "AN 3/4" },
      { strip: 3, label: "AN 5/6" },
      { strip: 4, label: "Phones 7/8" },
      { strip: 5, label: "SPDIF" },
      { strip: 6, label: "AES" },
      { strip: 7, label: "ADAT 1/2" },
      { strip: 8, label: "ADAT 3/4" },
      { strip: 9, label: "ADAT 5/6" },
      { strip: 10, label: "ADAT 7/8" },
    ],
  },
  {
    id: "ucx",
    name: "Fireface UCX",
    outputs: [
      { strip: 1, label: "AN 1/2 (Main)" },
      { strip: 2, label: "AN 3/4" },
      { strip: 3, label: "AN 5/6" },
      { strip: 4, label: "Phones 7/8" },
      { strip: 5, label: "SPDIF" },
      { strip: 6, label: "ADAT 1/2 (SPDIF opt)" },
      { strip: 7, label: "ADAT 3/4" },
      { strip: 8, label: "ADAT 5/6" },
      { strip: 9, label: "ADAT 7/8" },
    ],
  },
  {
    id: "babyface-pro",
    name: "Babyface Pro (FS)",
    outputs: [
      { strip: 1, label: "AN 1/2 (Main)" },
      { strip: 2, label: "Phones 3/4" },
      { strip: 3, label: "AS 1/2 (ADAT/SPDIF)" },
      { strip: 4, label: "ADAT 3/4" },
      { strip: 5, label: "ADAT 5/6" },
      { strip: 6, label: "ADAT 7/8" },
    ],
  },
];

export function getDevice(id: string | undefined): DeviceDef | undefined {
  return DEVICES.find((d) => d.id === id);
}

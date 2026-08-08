import {
  action,
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { osc, type BusMessage } from "../osc/client";
import { targetBus, targetMuteAddress, type MuteKeySettings } from "../settings";

/**
 * Mute トグルキー。対象は任意のパッチ段(Hardware Input / Software
 * Playback / Hardware Output)のストリップ、または Main(Dim トグル)。
 * DisableAutomaticStates: true のため、状態表示は TotalMix からの
 * フィードバックを正として setState で同期する。
 */
@action({ UUID: "com.rimtty.totalmix-osc-remote.mute-key" })
export class MuteKey extends SingletonAction<MuteKeySettings> {
  constructor() {
    super();
    osc.on("message", (m: BusMessage) => {
      void this.onOscMessage(m);
    });
  }

  override async onWillAppear(ev: WillAppearEvent<MuteKeySettings>): Promise<void> {
    if (ev.action.isKey()) {
      const settings = ev.payload.settings;
      const value = osc.getFloat(this.stateAddress(settings), targetBus(settings) ?? undefined) ?? 0;
      await ev.action.setState(value >= 0.5 ? 1 : 0);
    }
    osc.refresh();
  }

  override async onKeyDown(ev: KeyDownEvent<MuteKeySettings>): Promise<void> {
    const settings = ev.payload.settings;
    const muteAddr = targetMuteAddress(settings);
    if (muteAddr) {
      const bus = targetBus(settings);
      // バス切替を挟む場合は最新状態を取り直してからトグルする
      if (bus) {
        const { switched } = await osc.ensureBus(bus);
        if (switched) await delay(250);
      }
      const current = osc.getFloat(muteAddr, bus ?? undefined) ?? 0;
      void osc.sendFloatTo(bus, muteAddr, current >= 0.5 ? 0 : 1);
    } else {
      // Main には専用 Mute が無い → mainDim をトグル(TotalMix 側 Dim 設定に従う)
      osc.sendFloat("/1/mainDim", 1);
    }
  }

  private stateAddress(settings: MuteKeySettings): string {
    return targetMuteAddress(settings) ?? "/1/mainDim";
  }

  private async onOscMessage(m: BusMessage): Promise<void> {
    const value = m.args[0]?.value;
    if (typeof value !== "number") return;
    for (const visible of this.actions) {
      if (!visible.isKey()) continue;
      const settings = await visible.getSettings();
      const bus = targetBus(settings);
      if (bus && m.bus !== bus) continue;
      if (m.address === this.stateAddress(settings)) {
        await visible.setState(value >= 0.5 ? 1 : 0);
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

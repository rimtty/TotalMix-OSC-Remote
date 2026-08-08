import {
  action,
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { osc } from "../osc/client";
import { targetMuteAddress, type MuteKeySettings } from "../settings";

/**
 * Mute トグルキー。
 * DisableAutomaticStates: true のため、状態表示は TotalMix からの
 * フィードバックを正として setState で同期する。
 */
@action({ UUID: "com.rimtty.totalmix-osc-remote.mute-key" })
export class MuteKey extends SingletonAction<MuteKeySettings> {
  constructor() {
    super();
    osc.on("message", (m: { address: string; args: { value: number | string }[] }) => {
      void this.onOscMessage(m.address, m.args[0]?.value);
    });
  }

  override async onWillAppear(ev: WillAppearEvent<MuteKeySettings>): Promise<void> {
    if (ev.action.isKey()) {
      const value = osc.getFloat(this.stateAddress(ev.payload.settings)) ?? 0;
      await ev.action.setState(value >= 0.5 ? 1 : 0);
    }
    osc.refresh();
  }

  override async onKeyDown(ev: KeyDownEvent<MuteKeySettings>): Promise<void> {
    const settings = ev.payload.settings;
    const muteAddr = targetMuteAddress(settings);
    if (muteAddr) {
      const current = osc.getFloat(muteAddr) ?? 0;
      osc.sendFloat(muteAddr, current >= 0.5 ? 0 : 1);
    } else {
      // Main には専用 Mute が無い → mainDim をトグル(TotalMix 側 Dim 設定に従う)
      osc.sendFloat("/1/mainDim", 1);
    }
  }

  private stateAddress(settings: MuteKeySettings): string {
    return targetMuteAddress(settings) ?? "/1/mainDim";
  }

  private async onOscMessage(address: string, value: number | string | undefined): Promise<void> {
    if (typeof value !== "number") return;
    for (const visible of this.actions) {
      if (!visible.isKey()) continue;
      const settings = await visible.getSettings();
      if (address === this.stateAddress(settings)) {
        await visible.setState(value >= 0.5 ? 1 : 0);
      }
    }
  }
}

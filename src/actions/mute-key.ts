import {
  action,
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { backend, refKey, type ChangeEvent } from "../osc";
import { targetRefOf, type MuteKeySettings } from "../settings";

/**
 * Mute トグルキー。対象は任意のパッチ段のストリップ、または Main
 * (バックエンドがプロトコルに応じた実装を提供。クラシックでは Dim トグル)。
 * DisableAutomaticStates: true のため、状態表示はフィードバックを正として
 * setState で同期する。
 */
@action({ UUID: "com.rimtty.totalmix-osc-remote.mute-key" })
export class MuteKey extends SingletonAction<MuteKeySettings> {
  constructor() {
    super();
    backend.onChange((ev) => {
      void this.onChangeEvent(ev);
    });
  }

  override async onWillAppear(ev: WillAppearEvent<MuteKeySettings>): Promise<void> {
    if (ev.action.isKey()) {
      const muted = backend.getMute(targetRefOf(ev.payload.settings)) ?? false;
      await ev.action.setState(muted ? 1 : 0);
    }
    backend.refresh();
  }

  override async onKeyDown(ev: KeyDownEvent<MuteKeySettings>): Promise<void> {
    await backend.toggleMute(targetRefOf(ev.payload.settings));
  }

  private async onChangeEvent(ev: ChangeEvent): Promise<void> {
    if (ev.type !== "mute") return;
    for (const visible of this.actions) {
      if (!visible.isKey()) continue;
      const settings = await visible.getSettings();
      if (ev.key === refKey(targetRefOf(settings))) {
        await visible.setState(ev.value ? 1 : 0);
      }
    }
  }
}

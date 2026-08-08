import {
  action,
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { backend, refKey, type ChangeEvent } from "../osc";
import { dbToFader, faderToDb } from "../osc/taper";
import { targetRefOf, type FaderDimKeySettings } from "../settings";

interface DimState {
  original: number;
  dimmed: number;
}

/**
 * Fader Dim キー: 現在のフェーダー値を記憶して減衰(既定 -20 dB)、
 * 再押下で復元する。対象は Main または任意パッチ段のストリップ。
 * Dim 中に外部(TotalMix 本体やダイヤル)で値が変更されたら記憶値を
 * 破棄して OFF 表示に戻す(爆音事故防止)。
 */
@action({ UUID: "com.rimtty.totalmix-osc-remote.fader-dim-key" })
export class FaderDimKey extends SingletonAction<FaderDimKeySettings> {
  private dims = new Map<string, DimState>();

  /** TotalMix のエコーバック丸め(≈0.1%)を許容するしきい値 */
  private static readonly EXTERNAL_CHANGE_EPSILON = 0.01;

  constructor() {
    super();
    backend.onChange((ev) => {
      void this.onChangeEvent(ev);
    });
  }

  override async onWillAppear(ev: WillAppearEvent<FaderDimKeySettings>): Promise<void> {
    if ("setState" in ev.action) {
      await ev.action.setState(this.dims.has(ev.action.id) ? 1 : 0);
    }
    backend.refresh();
  }

  override onWillDisappear(ev: WillDisappearEvent<FaderDimKeySettings>): void {
    // キーがページから消えても Dim 状態は維持する(dims は残す)
    void ev;
  }

  override async onKeyDown(ev: KeyDownEvent<FaderDimKeySettings>): Promise<void> {
    const settings = ev.payload.settings;
    const ref = targetRefOf(settings);
    const active = this.dims.get(ev.action.id);

    if (active) {
      // 復元
      this.dims.delete(ev.action.id);
      await backend.setFader(ref, active.original);
      await ev.action.setState(0);
      return;
    }

    // バス切替等が必要な場合は状態同期を待って最新値を読む
    await backend.prepare(ref);
    const current = backend.getFader(ref);
    if (current === undefined) {
      // 現在値が未取得のままだと復元先が不明で危険なため、何もせず再同期する
      backend.refresh();
      await ev.action.showAlert();
      return;
    }

    const dimmed = this.computeDimmed(settings, current);
    this.dims.set(ev.action.id, { original: current, dimmed });
    await backend.setFader(ref, dimmed);
    await ev.action.setState(1);
  }

  private computeDimmed(settings: FaderDimKeySettings, value: number): number {
    if ((settings.mode ?? "db") === "factor") {
      const factor = Number(settings.factor) || 0.1;
      return Math.min(1, Math.max(0, value * factor));
    }
    const dimDb = Number(settings.dimDb ?? -20);
    return dbToFader(faderToDb(value) + dimDb);
  }

  private async onChangeEvent(ev: ChangeEvent): Promise<void> {
    if (ev.type !== "fader") return;
    for (const visible of this.actions) {
      if (!("setState" in visible)) continue;
      const dim = this.dims.get(visible.id);
      if (!dim) continue;
      const settings = await visible.getSettings();
      if (ev.key !== refKey(targetRefOf(settings))) continue;
      if (Math.abs(ev.value - dim.dimmed) > FaderDimKey.EXTERNAL_CHANGE_EPSILON) {
        // 外部で値が動いた → 記憶値は無効。復元すると爆音になり得るため破棄
        this.dims.delete(visible.id);
        await visible.setState(0);
      }
    }
  }
}

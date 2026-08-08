import {
  action,
  SingletonAction,
  type DialDownEvent,
  type DialRotateEvent,
  type TouchTapEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { osc } from "../osc/client";
import { dbToFader, faderToDb, formatDb } from "../osc/taper";
import {
  targetMuteAddress,
  targetVolumeAddress,
  targetVolumeValAddress,
  type FaderDialSettings,
} from "../settings";

interface DialState {
  value: number;
  feedbackTimer?: ReturnType<typeof setTimeout>;
  pendingFeedback?: { value?: string; indicator?: number; title?: string };
}

const FEEDBACK_INTERVAL_MS = 100; // タッチストリップ更新は最大 ~10回/秒

@action({ UUID: "com.rimtty.totalmix-osc-remote.fader-dial" })
export class FaderDial extends SingletonAction<FaderDialSettings> {
  private states = new Map<string, DialState>();

  constructor() {
    super();
    osc.on("message", (m: { address: string; args: { value: number | string }[] }) => {
      void this.onOscMessage(m.address, m.args[0]?.value);
    });
  }

  override async onWillAppear(ev: WillAppearEvent<FaderDialSettings>): Promise<void> {
    if (!("setFeedback" in ev.action)) return;
    const settings = ev.payload.settings;
    const cached = osc.getFloat(targetVolumeAddress(settings));
    const state = this.ensureState(ev.action.id, cached);
    await ev.action.setFeedback({
      title: this.titleFor(settings),
      value: this.valueTextFor(settings, state.value),
      indicator: { value: Math.round(state.value * 100) },
    });
    osc.refresh();
  }

  override onWillDisappear(ev: WillDisappearEvent<FaderDialSettings>): void {
    const state = this.states.get(ev.action.id);
    if (state?.feedbackTimer) clearTimeout(state.feedbackTimer);
    this.states.delete(ev.action.id);
  }

  override async onDialRotate(ev: DialRotateEvent<FaderDialSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const stepPct = Number(settings.stepPct) || 1;
    const finePct = Number(settings.fineStepPct) || 0.1;
    const step = (ev.payload.pressed ? finePct : stepPct) / 100;
    const addr = targetVolumeAddress(settings);
    const state = this.ensureState(ev.action.id, osc.getFloat(addr));
    state.value = clamp01(state.value + ev.payload.ticks * step);
    osc.sendFloat(addr, state.value);
    this.queueFeedback(ev.action, state, {
      value: formatDb(faderToDb(state.value)),
      indicator: Math.round(state.value * 100),
    });
  }

  override async onDialDown(ev: DialDownEvent<FaderDialSettings>): Promise<void> {
    const settings = ev.payload.settings;
    if ((settings.pushAction ?? "reset0db") === "reset0db") {
      await this.setValue(ev.action, settings, dbToFader(0));
    } else {
      this.toggleMute(settings);
    }
  }

  override async onTouchTap(ev: TouchTapEvent<FaderDialSettings>): Promise<void> {
    const settings = ev.payload.settings;
    if (ev.payload.hold) {
      const presetDb = Number(settings.presetDb ?? 0);
      await this.setValue(ev.action, settings, dbToFader(presetDb));
    } else {
      this.toggleMute(settings);
    }
  }

  private async setValue(
    actionRef: { id: string; setFeedback(payload: object): Promise<void> },
    settings: FaderDialSettings,
    value: number,
  ): Promise<void> {
    const addr = targetVolumeAddress(settings);
    const state = this.ensureState(actionRef.id, value);
    state.value = value;
    osc.sendFloat(addr, value);
    await actionRef.setFeedback({
      value: formatDb(faderToDb(value)),
      indicator: { value: Math.round(value * 100) },
    });
  }

  private toggleMute(settings: FaderDialSettings): void {
    const muteAddr = targetMuteAddress(settings);
    if (muteAddr) {
      const current = osc.getFloat(muteAddr) ?? 0;
      osc.sendFloat(muteAddr, current >= 0.5 ? 0 : 1);
    } else {
      // Main には専用 Mute が無いため Dim をトグルする
      osc.sendFloat("/1/mainDim", 1);
    }
  }

  private async onOscMessage(address: string, value: number | string | undefined): Promise<void> {
    for (const visible of this.actions) {
      if (!("setFeedback" in visible)) continue;
      const settings = await visible.getSettings();
      const volAddr = targetVolumeAddress(settings);
      const state = this.ensureState(visible.id, undefined);
      if (address === volAddr && typeof value === "number") {
        state.value = value;
        this.queueFeedback(visible, state, {
          indicator: Math.round(value * 100),
          value: formatDb(faderToDb(value)),
        });
      } else if (address === targetVolumeValAddress(settings) && typeof value === "string") {
        // TotalMix からの正式な dB 表示を優先する
        this.queueFeedback(visible, state, { value });
      }
    }
  }

  private queueFeedback(
    actionRef: { id: string; setFeedback(payload: object): Promise<void> },
    state: DialState,
    update: { value?: string; indicator?: number; title?: string },
  ): void {
    state.pendingFeedback = { ...state.pendingFeedback, ...update };
    if (state.feedbackTimer) return;
    state.feedbackTimer = setTimeout(() => {
      state.feedbackTimer = undefined;
      const pending = state.pendingFeedback;
      state.pendingFeedback = undefined;
      if (!pending) return;
      const payload: Record<string, unknown> = {};
      if (pending.title !== undefined) payload.title = pending.title;
      if (pending.value !== undefined) payload.value = pending.value;
      if (pending.indicator !== undefined) payload.indicator = { value: pending.indicator };
      void actionRef.setFeedback(payload);
    }, FEEDBACK_INTERVAL_MS);
  }

  private ensureState(id: string, initial: number | undefined): DialState {
    let state = this.states.get(id);
    if (!state) {
      state = { value: initial ?? 0 };
      this.states.set(id, state);
    } else if (initial !== undefined && state.value === 0) {
      state.value = initial;
    }
    return state;
  }

  private titleFor(settings: FaderDialSettings): string {
    if (settings.title) return settings.title;
    return (settings.target ?? "master") === "master" ? "Main" : `Out ${Number(settings.strip) || 1}`;
  }

  private valueTextFor(settings: FaderDialSettings, value: number): string {
    return osc.getString(targetVolumeValAddress(settings)) ?? formatDb(faderToDb(value));
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

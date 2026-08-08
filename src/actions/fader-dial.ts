import {
  action,
  SingletonAction,
  type DialDownEvent,
  type DialRotateEvent,
  type TouchTapEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { backend, refKey, type ChangeEvent } from "../osc";
import { dbToFader, faderToDb, formatDb } from "../osc/taper";
import { targetRefOf, type FaderDialSettings } from "../settings";

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
    backend.onChange((ev) => {
      void this.onChangeEvent(ev);
    });
  }

  override async onWillAppear(ev: WillAppearEvent<FaderDialSettings>): Promise<void> {
    if (!("setFeedback" in ev.action)) return;
    const settings = ev.payload.settings;
    const ref = targetRefOf(settings);
    const cached = backend.getFader(ref);
    const state = this.ensureState(ev.action.id, cached);
    await ev.action.setFeedback({
      title: this.titleFor(settings),
      value: backend.getDisplayValue(ref) ?? formatDb(faderToDb(state.value)),
      indicator: { value: Math.round(state.value * 100) },
    });
    backend.refresh();
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
    const ref = targetRefOf(settings);
    const state = this.ensureState(ev.action.id, backend.getFader(ref));
    state.value = clamp01(state.value + ev.payload.ticks * step);
    void backend.setFader(ref, state.value);
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
      void backend.toggleMute(targetRefOf(settings));
    }
  }

  override async onTouchTap(ev: TouchTapEvent<FaderDialSettings>): Promise<void> {
    const settings = ev.payload.settings;
    if (ev.payload.hold) {
      const presetDb = Number(settings.presetDb ?? 0);
      await this.setValue(ev.action, settings, dbToFader(presetDb));
    } else {
      void backend.toggleMute(targetRefOf(settings));
    }
  }

  private async setValue(
    actionRef: { id: string; setFeedback(payload: object): Promise<void> },
    settings: FaderDialSettings,
    value: number,
  ): Promise<void> {
    const state = this.ensureState(actionRef.id, value);
    state.value = value;
    void backend.setFader(targetRefOf(settings), value);
    await actionRef.setFeedback({
      value: formatDb(faderToDb(value)),
      indicator: { value: Math.round(value * 100) },
    });
  }

  private async onChangeEvent(ev: ChangeEvent): Promise<void> {
    if (ev.type === "mute") return;
    for (const visible of this.actions) {
      if (!("setFeedback" in visible)) continue;
      const settings = await visible.getSettings();
      if (ev.key !== refKey(targetRefOf(settings))) continue;
      const state = this.ensureState(visible.id, undefined);
      if (ev.type === "fader") {
        state.value = ev.value;
        this.queueFeedback(visible, state, {
          indicator: Math.round(ev.value * 100),
          value: formatDb(faderToDb(ev.value)),
        });
      } else {
        // TotalMix からの正式な dB 表示を優先する
        this.queueFeedback(visible, state, { value: ev.text });
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
    const ref = targetRefOf(settings);
    if (ref.kind === "master") return "Main";
    const busLabel = { input: "In", playback: "PB", output: "Out" }[ref.bus];
    return `${busLabel} ${ref.strip}`;
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

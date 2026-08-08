import streamDeck from "@elgato/streamdeck";
import { FaderDial } from "./actions/fader-dial";
import { FaderDimKey } from "./actions/fader-dim-key";
import { MuteKey } from "./actions/mute-key";
import { osc } from "./osc/client";
import { DEVICES, getDevice } from "./totalmix/devices";
import type { GlobalSettings } from "./settings";

streamDeck.actions.registerAction(new FaderDial());
streamDeck.actions.registerAction(new MuteKey());
streamDeck.actions.registerAction(new FaderDimKey());

function applyGlobalSettings(settings: GlobalSettings): void {
  osc.configure({
    host: settings.host,
    sendPort: Number(settings.sendPort) || undefined,
    recvPort: Number(settings.recvPort) || undefined,
  });
}

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
  applyGlobalSettings(ev.settings);
});

// Property Inspector の datasource: デバイス一覧/ストリップ一覧を返す
streamDeck.ui.onSendToPlugin(async (ev) => {
  const payload = ev.payload as { event?: string; device?: string; isRefresh?: boolean } | undefined;
  if (!payload?.event) return;

  if (payload.event === "getDevices") {
    await streamDeck.ui.sendToPropertyInspector({
      event: "getDevices",
      items: DEVICES.map((d) => ({ value: d.id, label: d.name })),
    });
    return;
  }

  if (payload.event === "getStrips") {
    const settings = await ev.action.getSettings<{ device?: string }>();
    const device = getDevice(payload.device ?? settings.device) ?? DEVICES[0];
    await streamDeck.ui.sendToPropertyInspector({
      event: "getStrips",
      items: (device?.outputs ?? []).map((o) => ({
        value: String(o.strip),
        label: `${o.strip}: ${o.label}`,
      })),
    });
  }
});

await streamDeck.connect();

const globals = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
applyGlobalSettings(globals ?? {});

osc.on("status", (status: string) => {
  streamDeck.logger.info(`OSC status: ${status} ${osc.statusDetail ?? ""}`);
});

import streamDeck from "@elgato/streamdeck";
import { FaderDial } from "./actions/fader-dial";
import { FaderDimKey } from "./actions/fader-dim-key";
import { MuteKey } from "./actions/mute-key";
import { backend, type Bus } from "./osc";
import { DEVICES } from "./totalmix/devices";
import type { GlobalSettings } from "./settings";

streamDeck.actions.registerAction(new FaderDial());
streamDeck.actions.registerAction(new MuteKey());
streamDeck.actions.registerAction(new FaderDimKey());

function applyGlobalSettings(settings: GlobalSettings): void {
  backend.configure({
    host: settings.host,
    sendPort: Number(settings.sendPort) || undefined,
    recvPort: Number(settings.recvPort) || undefined,
  });
}

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
  applyGlobalSettings(ev.settings);
});

function parseBus(value: unknown): Bus {
  return value === "input" || value === "playback" ? value : "output";
}

// Property Inspector の datasource: デバイス一覧/チャンネル一覧を返す
streamDeck.ui.onSendToPlugin(async (ev) => {
  const payload = ev.payload as { event?: string; device?: string; bus?: string } | undefined;
  if (!payload?.event) return;

  if (payload.event === "getDevices") {
    await streamDeck.ui.sendToPropertyInspector({
      event: "getDevices",
      items: DEVICES.map((d) => ({ value: d.id, label: d.name })),
    });
    return;
  }

  if (payload.event === "getStrips") {
    const settings = await ev.action.getSettings<{ device?: string; bus?: string }>();
    const bus = parseBus(payload.bus ?? settings.bus);
    const items = await backend.listChannels(bus, payload.device ?? settings.device);
    await streamDeck.ui.sendToPropertyInspector({ event: "getStrips", items });
  }
});

await streamDeck.connect();

const globals = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
applyGlobalSettings(globals ?? {});

backend.onStatus((status) => {
  streamDeck.logger.info(`OSC status: ${status} ${backend.statusDetail ?? ""}`);
});

// 起動直後のフィードバック確認用(SDK ログ、軽量サンプリング)
let rxLogged = 0;
backend.onChange((ev) => {
  if (rxLogged < 10) {
    rxLogged++;
    streamDeck.logger.debug(`OSC change ${JSON.stringify(ev)}`);
  }
});

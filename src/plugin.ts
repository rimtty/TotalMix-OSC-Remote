import streamDeck from "@elgato/streamdeck";
import { FaderDial } from "./actions/fader-dial";
import { FaderDimKey } from "./actions/fader-dim-key";
import { MuteKey } from "./actions/mute-key";
import { osc, type Bus, type BusMessage } from "./osc/client";
import { DEVICES, getDevice, getStrips } from "./totalmix/devices";
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

function parseBus(value: unknown): Bus {
  return value === "input" || value === "playback" ? value : "output";
}

/**
 * 指定バスのチャンネル一覧。TotalMix の trackname フィードバック(ライブ)を
 * 優先し、未取得ならデバイス定義(既定ステレオペア)にフォールバックする。
 * ライブ取得ならモノ分割済みチャンネルでも正しいストリップ番号が得られる。
 */
async function stripItems(bus: Bus, deviceId: string | undefined): Promise<{ value: string; label: string }[]> {
  const { switched } = await osc.ensureBus(bus);
  if (switched) await new Promise((r) => setTimeout(r, 300));

  const live: { value: string; label: string }[] = [];
  for (let n = 1; n <= 48; n++) {
    const name = osc.getString(`/1/trackname${n}`, bus);
    // "n.a." はバンク内の空き枠(実チャンネルはそこで終わり)
    if (name === undefined || name === "" || name === "n.a.") break;
    live.push({ value: String(n), label: `${n}: ${name}` });
  }
  if (live.length > 0) return live;

  const device = getDevice(deviceId) ?? DEVICES[0];
  if (!device) return [];
  return getStrips(device, bus).map((s) => ({ value: String(s.strip), label: `${s.strip}: ${s.label}` }));
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
    const items = await stripItems(bus, payload.device ?? settings.device);
    await streamDeck.ui.sendToPropertyInspector({ event: "getStrips", items });
  }
});

await streamDeck.connect();

const globals = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
applyGlobalSettings(globals ?? {});

osc.on("status", (status: string) => {
  streamDeck.logger.info(`OSC status: ${status} ${osc.statusDetail ?? ""}`);
});

// 起動直後のフィードバック確認用(SDK ログ、軽量サンプリング)
let rxLogged = 0;
osc.on("message", (m: BusMessage) => {
  if (rxLogged < 10) {
    rxLogged++;
    streamDeck.logger.debug(`OSC rx [${m.bus}] ${m.address} ${JSON.stringify(m.args.map((a) => a.value))}`);
  }
});

// Minimal Property Inspector helper (no external dependencies).
// Handles Stream Deck registration, action/global settings persistence and
// plugin messaging. Inputs opt in via data attributes:
//   data-setting="key"  → action settings
//   data-global="key"   → global settings (shared across all actions)
"use strict";

/* global WebSocket */

let websocket = null;
let piUuid = null;
let actionInfo = null;
let registerEventName = null;
let settings = {};
let globalSettings = {};

window.connectElgatoStreamDeckSocket = function (inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
  piUuid = inUUID;
  registerEventName = inRegisterEvent;
  actionInfo = JSON.parse(inActionInfo);
  settings = (actionInfo.payload && actionInfo.payload.settings) || {};

  websocket = new WebSocket("ws://127.0.0.1:" + inPort);
  websocket.onopen = () => {
    sendRaw({ event: registerEventName, uuid: piUuid });
    sendRaw({ event: "getGlobalSettings", context: piUuid });
    bindInputs();
    applySettingsToInputs();
    document.dispatchEvent(new CustomEvent("pi-ready"));
  };
  websocket.onmessage = (msg) => {
    const ev = JSON.parse(msg.data);
    switch (ev.event) {
      case "didReceiveGlobalSettings":
        globalSettings = (ev.payload && ev.payload.settings) || {};
        applyGlobalsToInputs();
        document.dispatchEvent(new CustomEvent("pi-globals", { detail: globalSettings }));
        break;
      case "didReceiveSettings":
        settings = (ev.payload && ev.payload.settings) || {};
        applySettingsToInputs();
        break;
      case "sendToPropertyInspector":
        document.dispatchEvent(new CustomEvent("pi-message", { detail: ev.payload }));
        break;
    }
  };
};

function sendRaw(obj) {
  if (websocket && websocket.readyState === 1) websocket.send(JSON.stringify(obj));
}

function persistSettings() {
  sendRaw({ event: "setSettings", context: piUuid, payload: settings });
}

function persistGlobalSettings() {
  sendRaw({ event: "setGlobalSettings", context: piUuid, payload: globalSettings });
}

function sendToPlugin(payload) {
  sendRaw({ event: "sendToPlugin", action: actionInfo.action, context: piUuid, payload });
}

function inputValue(el) {
  if (el.type === "checkbox") return el.checked;
  if (el.type === "number") return el.value === "" ? undefined : Number(el.value);
  return el.value;
}

function setInputValue(el, value) {
  if (value === undefined || value === null) return;
  if (el.type === "checkbox") el.checked = Boolean(value);
  else el.value = String(value);
}

function bindInputs() {
  document.querySelectorAll("[data-setting]").forEach((el) => {
    el.addEventListener("change", () => {
      settings[el.dataset.setting] = inputValue(el);
      persistSettings();
      document.dispatchEvent(new CustomEvent("pi-setting-changed", { detail: { key: el.dataset.setting } }));
    });
  });
  document.querySelectorAll("[data-global]").forEach((el) => {
    el.addEventListener("change", () => {
      globalSettings[el.dataset.global] = inputValue(el);
      persistGlobalSettings();
    });
  });
}

function applySettingsToInputs() {
  document.querySelectorAll("[data-setting]").forEach((el) => {
    setInputValue(el, settings[el.dataset.setting]);
  });
}

function applyGlobalsToInputs() {
  document.querySelectorAll("[data-global]").forEach((el) => {
    setInputValue(el, globalSettings[el.dataset.global]);
  });
}

/** select要素へ {value,label}[] を流し込む(現値は維持) */
function fillSelect(el, items, currentValue) {
  el.innerHTML = "";
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.value;
    opt.textContent = item.label;
    el.appendChild(opt);
  });
  if (currentValue !== undefined && currentValue !== null && currentValue !== "") {
    el.value = String(currentValue);
  }
}

// ページ側スクリプトから使う公開 API
window.pi = {
  get settings() {
    return settings;
  },
  get globalSettings() {
    return globalSettings;
  },
  persistSettings,
  sendToPlugin,
  fillSelect,
  applySettingsToInputs,
};

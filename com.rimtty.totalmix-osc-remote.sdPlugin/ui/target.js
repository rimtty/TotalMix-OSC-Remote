// Shared target-selection logic (Main / Output strip + device/strip pickers).
"use strict";

/* global pi */

function initTarget() {
  const targetSel = document.querySelector('[data-setting="target"]');
  const deviceSel = document.querySelector('[data-setting="device"]');
  const stripSel = document.querySelector('[data-setting="strip"]');
  const stripRows = document.querySelectorAll(".strip-only");

  function updateVisibility() {
    const isStrip = targetSel.value === "strip";
    stripRows.forEach((row) => {
      row.style.display = isStrip ? "" : "none";
    });
  }

  document.addEventListener("pi-ready", () => {
    pi.sendToPlugin({ event: "getDevices" });
    pi.sendToPlugin({ event: "getStrips", device: pi.settings.device });
    if (!targetSel.value) targetSel.value = pi.settings.target || "master";
    updateVisibility();
  });

  document.addEventListener("pi-message", (e) => {
    const payload = e.detail || {};
    if (payload.event === "getDevices") {
      pi.fillSelect(deviceSel, payload.items, pi.settings.device || "ucx2");
    } else if (payload.event === "getStrips") {
      pi.fillSelect(stripSel, payload.items, pi.settings.strip || "1");
    }
  });

  targetSel.addEventListener("change", updateVisibility);
  deviceSel.addEventListener("change", () => {
    // 設定保存の往復を待たずに、選択中デバイスを明示してストリップ一覧を要求する
    pi.sendToPlugin({ event: "getStrips", device: deviceSel.value });
  });
}

initTarget();

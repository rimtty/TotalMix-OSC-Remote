// Shared target-selection logic (Main / strip + row(bus)/device/strip pickers).
"use strict";

/* global pi */

function initTarget() {
  const targetSel = document.querySelector('[data-setting="target"]');
  const busSel = document.querySelector('[data-setting="bus"]');
  const deviceSel = document.querySelector('[data-setting="device"]');
  const stripSel = document.querySelector('[data-setting="strip"]');
  const stripRows = document.querySelectorAll(".strip-only");

  function updateVisibility() {
    const isStrip = targetSel.value === "strip";
    stripRows.forEach((row) => {
      row.style.display = isStrip ? "" : "none";
    });
  }

  function requestStrips() {
    pi.sendToPlugin({
      event: "getStrips",
      device: deviceSel.value || pi.settings.device,
      bus: busSel ? busSel.value : undefined,
    });
  }

  document.addEventListener("pi-ready", () => {
    pi.sendToPlugin({ event: "getDevices" });
    if (!targetSel.value) targetSel.value = pi.settings.target || "master";
    if (busSel && pi.settings.bus) busSel.value = pi.settings.bus;
    requestStrips();
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
  if (busSel) {
    busSel.addEventListener("change", requestStrips);
  }
  deviceSel.addEventListener("change", requestStrips);
}

initTarget();

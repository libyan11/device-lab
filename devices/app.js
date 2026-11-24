// Device Lab shell: a registry of test modules, a tab bar, and one shared results table / report.
// A module is { id, title, blurb, supported(): true | string, mount(root, ctx), unmount?() }.
// To add a new kind of device, write devices/mod-<name>.js and add it to MODULES below.
import overview from "./mod-overview.js";
import gamepad from "./mod-gamepad.js";
import keyboard from "./mod-keyboard.js";
import mouse from "./mod-mouse.js";
import touch from "./mod-touch.js";
import audio from "./mod-audio.js";
import camera from "./mod-camera.js";
import midi from "./mod-midi.js";
import hid from "./mod-hid.js";
import ports from "./mod-ports.js";
import display from "./mod-display.js";
import appliance from "./mod-appliance.js";
import storage from "./mod-storage.js";

const MODULES = [overview, gamepad, keyboard, mouse, touch, audio, camera, midi, hid, ports, storage, appliance, display];
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = new Map();     // key -> { module, status, name, detail }
let current = null, currentId = null;

const log = (...a) => { $("log").textContent += a.join(" ") + "\n"; };

function makeCtx(mod) {
  return {
    esc, sleep, log,
    result(status, name, detail = "", key = name) {
      key = `${mod.id}:${key}`;
      let tr = document.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
      if (!tr) { tr = document.createElement("tr"); tr.dataset.key = key; $("results").appendChild(tr); }
      tr.innerHTML = `<td class="s ${status}">${status}</td><td><div><span class="detail">${esc(mod.title)} · </span>${esc(name)}</div>${detail ? `<div class="detail">${esc(detail)}</div>` : ""}</td>`;
      results.set(key, { module: mod.id, status, name, detail });
      $("resultsCard").classList.remove("hidden");
      log(`[${status}] ${mod.title}: ${name} ${detail}`);
    },
    // Run `tick` every animation frame for `ms`, updating a status element with a countdown. Resolves when done.
    timed(ms, statusEl, label, tick) {
      return new Promise(resolve => {
        const t0 = performance.now(); let raf;
        const frame = now => {
          const left = ms - (now - t0);
          if (tick) tick(now);
          if (left <= 0) { if (statusEl) statusEl.textContent = ""; resolve(); return; }
          if (statusEl) statusEl.textContent = `${label} ${Math.ceil(left / 1000)}s…`;
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      });
    },
    // Show a question with answer buttons; resolves with the chosen label.
    ask(container, text, options) {
      return new Promise(resolve => {
        const box = document.createElement("div"); box.className = "note"; box.dataset.ask = "1";
        box.innerHTML = `<div style="font-weight:600;margin-bottom:8px">${esc(text)}</div><div class="row"></div>`;
        const row = box.querySelector(".row");
        for (const o of options) { const b = document.createElement("button"); b.textContent = o; b.className = "secondary"; b.onclick = () => { box.remove(); resolve(o); }; row.appendChild(b); }
        container.appendChild(box);
      });
    },
  };
}

function renderTabs() {
  const tabs = $("tabs"); tabs.innerHTML = "";
  for (const m of MODULES) {
    const b = document.createElement("button");
    b.textContent = m.title; b.dataset.tab = m.id;
    const sup = m.supported();
    if (sup !== true) { b.classList.add("na"); b.title = sup; }
    b.onclick = () => select(m.id);
    tabs.appendChild(b);
  }
}

function select(id) {
  const mod = MODULES.find(m => m.id === id); if (!mod) return;
  if (current && current.unmount) { try { current.unmount(); } catch (e) { log("unmount error", e); } }
  current = mod; currentId = id;
  for (const b of $("tabs").children) b.classList.toggle("on", b.dataset.tab === id);
  const panel = $("panel"); panel.innerHTML = "";
  const head = document.createElement("div");
  head.innerHTML = `<p class="detail" style="margin-top:0">${mod.blurb}</p>`;
  panel.appendChild(head);
  const sup = mod.supported();
  if (sup !== true) { const p = document.createElement("p"); p.className = "err"; p.textContent = sup; panel.appendChild(p); }
  const root = document.createElement("div"); root.dataset.module = id; panel.appendChild(root);
  try { mod.mount(root, makeCtx(mod), { supported: sup === true }); } catch (e) { root.innerHTML = `<p class="err">This test failed to start: ${esc(e.message)}</p>`; log("mount error", e.stack || e); }
  history.replaceState(null, "", "#" + id);
}

function summaryText() {
  const lines = [`Device Lab report, ${new Date().toLocaleString()}`, ""];
  for (const [, r] of results) lines.push(`[${r.status}] ${r.module}: ${r.name}${r.detail ? " - " + r.detail : ""}`);
  return lines.join("\n");
}
$("btnCopy").onclick = async () => { try { await navigator.clipboard.writeText(summaryText()); $("shareStatus").textContent = "Copied."; } catch (_) { $("shareStatus").textContent = "Couldn't copy; use the JSON download."; } };
$("btnJson").onclick = () => {
  const blob = new Blob([JSON.stringify({ tool: "Device Lab", time: new Date().toISOString(), userAgent: navigator.userAgent, results: [...results.values()] }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "device-lab-report.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("btnClear").onclick = () => { results.clear(); $("results").innerHTML = ""; $("resultsCard").classList.add("hidden"); };

renderTabs();
window.deviceLab = { results, select, modules: MODULES, get current() { return currentId; }, summaryText };
select((location.hash || "").slice(1) && MODULES.some(m => m.id === location.hash.slice(1)) ? location.hash.slice(1) : "overview");

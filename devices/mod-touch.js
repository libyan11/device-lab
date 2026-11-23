// Touchscreen / pen / trackpad: multi-touch count, pressure, and a grid sweep to find dead zones.
import { gridCoverage } from "./core.js";

export default {
  id: "touch", title: "Touch & pen",
  blurb: "Drag a finger (or pen, or mouse) across the grid so every square lights up; any square that stays grey is a dead zone. Also put several fingers down at once to count touch points.",
  supported: () => true,

  mount(root, ctx) {
    const COLS = 12, ROWS = 7;
    root.innerHTML = `
      <div id="tcGrid" class="tgrid" style="grid-template-columns:repeat(${COLS},1fr)">${Array.from({ length: COLS * ROWS }, () => "<div></div>").join("")}</div>
      <div class="row"><span class="mono" id="tcInfo">Touch points now: 0 · max at once: 0</span></div>
      <div class="row"><button id="tcRecord">Record touch result</button><button id="tcReset" class="secondary">Reset</button></div>`;
    const $ = id => root.querySelector("#" + id), grid = $("tcGrid"), cells = [...grid.children];
    let pts, active, maxActive, types, pressureMin, pressureMax, tiltSeen;
    const reset = () => { pts = []; active = new Map(); maxActive = 0; types = new Set(); pressureMin = 1; pressureMax = 0; tiltSeen = false; cells.forEach(c => c.classList.remove("hit")); info(); };
    const info = () => { $("tcInfo").textContent = `Touch points now: ${active.size} · max at once: ${maxActive}${types.size ? " · input: " + [...types].join(", ") : ""}${pressureMax > 0 ? ` · pressure ${pressureMin.toFixed(2)}–${pressureMax.toFixed(2)}` : ""}${tiltSeen ? " · pen tilt seen" : ""}`; };
    function hit(e) {
      const r = grid.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      pts.push([x, y]);
      const c = Math.min(COLS - 1, Math.floor(x * COLS)), rw = Math.min(ROWS - 1, Math.floor(y * ROWS));
      cells[rw * COLS + c].classList.add("hit");
    }
    grid.addEventListener("pointerdown", e => { try { grid.setPointerCapture?.(e.pointerId); } catch (_) {} active.set(e.pointerId, 1); maxActive = Math.max(maxActive, active.size); types.add(e.pointerType); hit(e); info(); });
    grid.addEventListener("pointermove", e => {
      if (!active.has(e.pointerId)) return; hit(e);
      if (e.pressure > 0 && e.pressure !== 0.5) { pressureMin = Math.min(pressureMin, e.pressure); pressureMax = Math.max(pressureMax, e.pressure); }
      if (e.tiltX || e.tiltY) tiltSeen = true; info();
    });
    const end = e => { active.delete(e.pointerId); info(); };
    grid.addEventListener("pointerup", end); grid.addEventListener("pointercancel", end);
    $("tcReset").onclick = reset;
    $("tcRecord").onclick = () => {
      const g = gridCoverage(pts, COLS, ROWS), t = [...types].join(", ") || "none";
      if (!pts.length) { ctx.result("INFO", "Touch grid", "Nothing touched yet.", "grid"); return; }
      ctx.result(g.coverage >= 0.99 ? "PASS" : g.coverage >= 0.9 ? "WARN" : "INFO", "Touch grid", g.missed.length ? `${g.hit} of ${g.total} squares responded (${t}). Unreached: ${g.missed.slice(0, 12).map(([c, r]) => `col ${c + 1} row ${r + 1}`).join("; ")}${g.missed.length > 12 ? "…" : ""}. Sweep again to rule out missed spots versus a true dead zone.` : `All ${g.total} squares responded (${t}).`, "grid");
      if (types.has("touch")) ctx.result(maxActive >= 5 ? "PASS" : maxActive >= 2 ? "INFO" : "WARN", "Multi-touch", `Up to ${maxActive} touch points at once.`, "multitouch");
      if (pressureMax > 0) ctx.result("INFO", "Pressure", `Range seen ${pressureMin.toFixed(2)}–${pressureMax.toFixed(2)}${tiltSeen ? "; tilt reported" : ""}.`, "pressure");
    };
    reset();
  },
};

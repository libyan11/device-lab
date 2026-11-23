// Display: dead / stuck pixel colour fills, refresh rate and dropped frames.
import { refreshRate, standardRefresh } from "./core.js";

const COLORS = [["Black", "#000"], ["White", "#fff"], ["Red", "#f00"], ["Green", "#0f0"], ["Blue", "#00f"], ["Grey", "#808080"]];

export default {
  id: "display", title: "Display",
  blurb: "Cycle through solid colours to spot dead or stuck pixels, backlight bleed and dirt, and measure the real refresh rate of this screen.",
  supported: () => true,

  mount(root, ctx) {
    root.innerHTML = `
      <div class="row"><button id="dpFill">Start colour test</button><span class="detail">Click anywhere to change colour, Esc to stop.</span></div>
      <div class="row"><button id="dpRate">Measure refresh rate (3s)</button><span class="detail" id="dpStatus"></span></div>
      <div class="row"><span class="mono" id="dpInfo"></span></div>
      <div class="row"><button id="dpRecord" class="secondary">Record: no dead or stuck pixels seen</button><button id="dpBad" class="secondary">Record: I saw bad pixels</button></div>`;
    const $ = id => root.querySelector("#" + id);
    $("dpInfo").textContent = `${screen.width}×${screen.height} CSS px · device pixel ratio ${devicePixelRatio} · ${screen.width * devicePixelRatio | 0}×${screen.height * devicePixelRatio | 0} physical · colour depth ${screen.colorDepth}-bit`;
    ctx.result("INFO", "Screen", $("dpInfo").textContent, "screen");
    $("dpFill").onclick = () => {
      let i = 0; const el = document.createElement("div"); el.className = "fsfill"; el.id = "dpFull"; document.body.appendChild(el);
      const paint = () => { const [n, c] = COLORS[i]; el.style.background = c; el.textContent = `${n} (${i + 1}/${COLORS.length}) · click for next, Esc to stop`; el.style.color = n === "Black" || n === "Blue" ? "#888" : "#444"; };
      const stop = () => { el.remove(); document.exitFullscreen?.().catch(() => {}); window.removeEventListener("keydown", key, true); };
      const next = () => { i++; if (i >= COLORS.length) stop(); else paint(); };
      const key = e => { if (e.key === "Escape") { stop(); } else if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); next(); } };
      el.onclick = next; window.addEventListener("keydown", key, true);
      paint(); el.requestFullscreen?.().catch(() => {});
    };
    $("dpRate").onclick = async () => {
      $("dpRate").disabled = true; const ts = [];
      await ctx.timed(3000, $("dpStatus"), "Measuring", now => ts.push(now));
      $("dpRate").disabled = false;
      const r = refreshRate(ts);
      if (!r.hz) { ctx.result("INFO", "Refresh rate", "Couldn't measure (is the tab in the background?).", "refresh"); return; }
      ctx.result(r.dropped <= r.frames * 0.03 ? "PASS" : "WARN", "Refresh rate", `About ${r.hz.toFixed(1)} Hz (nominal ${standardRefresh(r.hz)} Hz); ${r.dropped} of ${r.frames} frames were late.${r.dropped > r.frames * 0.03 ? " The page struggled to keep up; close other tabs and retry." : ""}`, "refresh");
    };
    $("dpRecord").onclick = () => ctx.result("PASS", "Dead / stuck pixels", "None seen in the colour fills.", "pixels");
    $("dpBad").onclick = () => ctx.result("FAIL", "Dead / stuck pixels", "Bad pixels or marks were seen in the colour fills.", "pixels");
  },
};

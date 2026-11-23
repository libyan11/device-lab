// Keyboard: key coverage map, rollover (how many keys at once), and chatter (a key registering twice from one press).
import { KeyboardTracker, KB_LAYOUT, KB_CODES, rolloverLabel, CHATTER_MS } from "./core.js";

let handlers = null;

export default {
  id: "keyboard", title: "Keyboard",
  blurb: "Press every key; each turns green once it registers. Then hold down as many keys as you can at once to find the rollover limit. Chatter (one press that types twice) shows up as a warning.",
  supported: () => true,

  mount(root, ctx) {
    root.innerHTML = `
      <div class="row"><span id="kbCount" class="detail">0 of ${KB_CODES.length} keys</span><span id="kbMax" class="detail"></span><button id="kbReset" class="secondary">Reset</button><button id="kbRecord">Record keyboard result</button></div>
      <div id="kbCap" class="note">Click here, then press keys. <b>Tab, Alt and Win keys may be captured by Windows.</b></div>
      <div class="kb" id="kbMap" style="margin-top:12px"></div>
      <div id="kbChatter" class="detail"></div>`;
    const $ = id => root.querySelector("#" + id);
    const T = new KeyboardTracker();
    const map = $("kbMap"), cells = new Map();
    for (const row of KB_LAYOUT) {
      const r = document.createElement("div"); r.className = "kbrow";
      for (const [code, label, w] of row) {
        const d = document.createElement("div"); d.className = "key" + (code ? "" : " gap"); d.style.width = `${w * 34 + (w - 1) * 3}px`; d.textContent = label;
        if (code) cells.set(code, d); r.appendChild(d);
      }
      map.appendChild(r);
    }
    const extra = new Set();
    function refresh() {
      for (const [c, el] of cells) { el.classList.toggle("on", T.down.has(c)); el.classList.toggle("seen", T.seen.has(c) && !T.down.has(c)); }
      const known = KB_CODES.filter(c => T.seen.has(c)).length;
      $("kbCount").textContent = `${known} of ${KB_CODES.length} keys` + (extra.size ? ` (+${extra.size} extra: ${[...extra].slice(0, 6).join(", ")})` : "");
      $("kbMax").textContent = T.max ? `Most keys held at once: ${T.max} (${rolloverLabel(T.max)})` : "";
      $("kbChatter").textContent = T.chatter.length ? `Chatter: ${T.chatter.length} double-registers (e.g. ${T.chatter.slice(0, 4).map(c => `${c.code} after ${c.gap} ms`).join(", ")})` : "";
    }
    const down = e => { if (!root.isConnected) return; e.preventDefault(); if (!cells.has(e.code)) extra.add(e.code); T.keydown(e.code, e.timeStamp, e.repeat); refresh(); };
    const up = e => { if (!root.isConnected) return; T.keyup(e.code, e.timeStamp); refresh(); };
    const blur = () => { T.down.clear(); refresh(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    handlers = { down, up, blur };
    $("kbReset").onclick = () => { T.reset(); extra.clear(); refresh(); };
    $("kbRecord").onclick = () => {
      const missing = KB_CODES.filter(c => !T.seen.has(c)), total = KB_CODES.length;
      ctx.result(missing.length === 0 ? "PASS" : T.seen.size < total * 0.5 ? "INFO" : "WARN", "Key coverage", missing.length ? `${total - missing.length} of ${total} keys registered. Not pressed: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? ` and ${missing.length - 20} more` : ""}. (Smaller keyboards legitimately lack some.)` : `All ${total} keys registered.`, "coverage");
      if (T.max) ctx.result(T.max >= 6 ? "PASS" : T.max >= 3 ? "WARN" : "INFO", "Rollover", `${T.max} keys at once (${rolloverLabel(T.max)}). Keys held: ${T.maxSet.join(", ")}. ${T.max < 6 ? "Hold more keys together to test the limit." : ""}`, "rollover");
      ctx.result(T.chatter.length === 0 ? "PASS" : "FAIL", "Key chatter", T.chatter.length ? `${T.chatter.length} keys registered twice within ${CHATTER_MS} ms of release: ${[...new Set(T.chatter.map(c => c.code))].join(", ")}. A worn or dirty switch.` : `No double-registers seen over ${T.presses} key presses.`, "chatter");
    };
    refresh();
  },

  unmount() { if (handlers) { window.removeEventListener("keydown", handlers.down); window.removeEventListener("keyup", handlers.up); window.removeEventListener("blur", handlers.blur); handlers = null; } },
};

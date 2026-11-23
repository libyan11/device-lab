// Mouse / trackpad: buttons, click chatter, scroll wheel glitches, polling rate.
import { ClickAnalyzer, BUTTON_NAMES, wheelGlitches, pollingRate, nearestPollingRate, CHATTER_MS } from "./core.js";

export default {
  id: "mouse", title: "Mouse",
  blurb: "Click every button (including side buttons) inside the box, scroll the wheel up and down, then sweep the mouse fast in circles to estimate the polling rate. Rapid double-clicks that register as 3 or a click that fires on its own point to a failing switch.",
  supported: () => true,

  mount(root, ctx) {
    root.innerHTML = `
      <div id="msZone" class="pointerzone" tabindex="0">Click, scroll and move the mouse in here</div>
      <div class="btngrid" id="msBtns" style="margin-top:10px">${BUTTON_NAMES.map((n, i) => `<div data-b="${i}">${n}</div>`).join("")}</div>
      <div class="row"><span class="mono" id="msInfo">Clicks: 0 · wheel events: 0 · moves: 0</span></div>
      <div class="row"><button id="msRate">Measure polling rate (5s)</button><button id="msRecord" class="secondary">Record mouse result</button><button id="msReset" class="secondary">Reset</button><span class="detail" id="msStatus"></span></div>`;
    const $ = id => root.querySelector("#" + id), zone = $("msZone");
    let C = new ClickAnalyzer(), wheel = [], moves = 0, stamps = null, rate = null;

    const info = () => { $("msInfo").textContent = `Clicks: ${C.count} · wheel events: ${wheel.length} · moves: ${moves}`; };
    zone.addEventListener("pointerdown", e => { C.down(e.button, e.timeStamp); const el = root.querySelector(`[data-b="${e.button}"]`); if (el) { el.classList.add("on"); el.classList.add("seen"); } info(); });
    zone.addEventListener("pointerup", e => { C.up(e.button, e.timeStamp); const el = root.querySelector(`[data-b="${e.button}"]`); if (el) el.classList.remove("on"); info(); });
    zone.addEventListener("contextmenu", e => e.preventDefault());
    zone.addEventListener("auxclick", e => e.preventDefault());
    zone.addEventListener("wheel", e => { e.preventDefault(); wheel.push(e.deltaY); info(); }, { passive: false });
    zone.addEventListener("pointermove", e => {
      moves++; zone.classList.add("live");
      if (stamps) { const list = e.getCoalescedEvents ? e.getCoalescedEvents() : []; if (list.length > 1) for (const c of list) stamps.push(c.timeStamp); else stamps.push(e.timeStamp); }
    });
    zone.addEventListener("pointerleave", () => zone.classList.remove("live"));
    $("msReset").onclick = () => { C = new ClickAnalyzer(); wheel = []; moves = 0; rate = null; root.querySelectorAll("#msBtns div").forEach(d => d.classList.remove("seen", "on")); info(); };
    $("msRate").onclick = async () => {
      $("msRate").disabled = true; stamps = [];
      zone.textContent = "Sweep the mouse FAST in big circles inside this box";
      await ctx.timed(5000, $("msStatus"), "Moving fast,", null);
      rate = pollingRate(stamps); stamps = null; $("msRate").disabled = false; zone.textContent = "Click, scroll and move the mouse in here";
      if (!rate.hz) ctx.result("INFO", "Polling rate", "Not enough fast movement was seen. Try again, moving faster.", "polling");
      else {
        const near = nearestPollingRate(rate.hz);
        ctx.result(rate.hz >= 450 ? "PASS" : rate.hz >= 120 ? "INFO" : "WARN", "Polling rate", `About ${Math.round(rate.hz)} Hz (nearest standard rate ${near} Hz), timing jitter ${Math.round(rate.jitter * 100)}%. Browsers can merge events, so a high-rate mouse may read lower here.`, "polling");
      }
    };
    $("msRecord").onclick = () => {
      const seen = BUTTON_NAMES.filter((_, i) => C.seen.has(i));
      ctx.result(C.seen.has(0) && C.seen.has(2) ? "PASS" : "WARN", "Buttons", `Seen: ${seen.join(", ") || "none"}. ${BUTTON_NAMES.filter((_, i) => !C.seen.has(i)).join(", ") || "Nothing"} not pressed (side buttons are optional).`, "buttons");
      ctx.result(C.chatter.length === 0 ? "PASS" : "FAIL", "Click chatter", C.chatter.length ? `${C.chatter.length} clicks re-registered within ${CHATTER_MS} ms (${[...new Set(C.chatter.map(c => BUTTON_NAMES[c.button] || c.button))].join(", ")}). Classic double-click failure of a worn switch.` : `No double-registers over ${C.count} clicks.`, "chatter");
      if (C.bounces.length) ctx.result("WARN", "Click bounce", `${C.bounces.length} presses lasted under 4 ms, which can be a faulty switch or a touch trackpad tap.`, "bounce");
      if (wheel.length) { const g = wheelGlitches(wheel); ctx.result(g.glitches === 0 ? "PASS" : "FAIL", "Scroll wheel", g.glitches ? `${g.glitches} backward ticks in the middle of steady scrolling (dirty or worn encoder) out of ${g.events} events.` : `${g.events} wheel events, no direction glitches.`, "wheel"); }
      else ctx.result("INFO", "Scroll wheel", "Not tested; scroll the wheel inside the box.", "wheel");
    };
    info();
  },
};

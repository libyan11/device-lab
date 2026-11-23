// Any gamepad the browser exposes through the Gamepad API: Xbox, Switch Pro, 8BitDo, Logitech, generic USB pads and more.
import { parseGamepadId, buttonLabels, analogTriggers, restStats, rateRest, rangeStats, rateRange, distinctLevels, updateRate } from "./core.js";

let raf = 0, state = null;

export default {
  id: "gamepad", title: "Gamepads",
  blurb: "Plug in or pair any controller (Xbox, Switch Pro, 8BitDo, Logitech, generic USB pad…), then <b>press any button</b> so the browser wakes it up. Tests stick drift and range, every button, analog triggers, rumble and update rate. (For deep genuine-vs-clone checks of PlayStation controllers, use the separate PlayStation Controller Checker.)",
  supported: () => typeof navigator.getGamepads === "function" ? true : "This browser has no Gamepad API.",

  mount(root, ctx) {
    root.innerHTML = `
      <div class="row"><label>Controller <select id="gpSel" aria-label="Controller"></select></label><span id="gpStatus" class="detail">Waiting for a controller… press any button on it.</span></div>
      <div id="gpInfo" class="note hidden"></div>
      <div id="gpLive" class="hidden">
        <div class="grid2" style="margin-top:14px">
          <div><canvas class="pad" id="gpCvL" width="400" height="400"></canvas><div class="mono" id="gpTxtL" style="text-align:center">L: –</div></div>
          <div><canvas class="pad" id="gpCvR" width="400" height="400"></canvas><div class="mono" id="gpTxtR" style="text-align:center">R: –</div></div>
        </div>
        <h3>Triggers</h3>
        <div class="bar"><b id="gpLTname">L2</b><div class="meter"><div id="gpMLT"></div></div><span class="mono" id="gpVLT">0</span></div>
        <div class="bar"><b id="gpRTname">R2</b><div class="meter"><div id="gpMRT"></div></div><span class="mono" id="gpVRT">0</span></div>
        <h3>Buttons</h3>
        <div class="btngrid" id="gpGrid"></div>
        <details style="margin-top:10px"><summary class="detail">Raw axes (for non-standard controllers)</summary><div id="gpAxes"></div></details>

        <h3>Tests</h3>
        <div class="row">
          <button id="gpDrift">Drift (3s)</button>
          <button id="gpRange">Stick range (8s)</button>
          <button id="gpTrig">Triggers (8s)</button>
          <button id="gpRate">Update rate (6s)</button>
          <button id="gpRumble">Rumble</button>
          <button id="gpBtns" class="secondary">Record button result</button>
        </div>
        <div class="detail" id="gpTestStatus"></div>
        <div id="gpAsk"></div>
      </div>`;
    const $ = id => root.querySelector("#" + id);
    const S = state = { idx: -1, family: "generic", id: null, seenBtn: new Set(), sampler: null, maxLT: 0, maxRT: 0, lt: [], rt: [], busy: false, trail: { L: [], R: [] }, pad: null };

    const pads = () => [...(navigator.getGamepads() || [])].filter(Boolean);
    const stdMap = p => p.mapping === "standard";
    const stickOf = (p, which) => { const a = p.axes, o = which === "L" ? 0 : 2; return [a[o] ?? 0, a[o + 1] ?? 0]; };
    const trigOf = (p, which) => {
      if (stdMap(p)) return p.buttons[which === "L" ? 6 : 7]?.value ?? 0;
      return 0;
    };

    function refreshList() {
      const ps = pads(), sel = $("gpSel"), sig = ps.map(p => p.index + p.id).join("|");
      if (sel.dataset.sig === sig) return;
      sel.dataset.sig = sig; sel.innerHTML = "";
      for (const p of ps) { const o = document.createElement("option"); o.value = p.index; o.textContent = `#${p.index} ${parseGamepadId(p.id).name}`; sel.appendChild(o); }
      if (ps.length && !ps.some(p => p.index === S.idx)) { S.idx = ps[0].index; sel.value = S.idx; selectPad(ps[0]); }
      if (!ps.length) { S.idx = -1; S.id = null; $("gpLive").classList.add("hidden"); $("gpInfo").classList.add("hidden"); $("gpStatus").textContent = "Waiting for a controller… press any button on it."; }
      else $("gpSel").value = S.idx;
    }
    $("gpSel").onchange = e => { S.idx = +e.target.value; const p = pads().find(x => x.index === S.idx); if (p) selectPad(p); };

    function selectPad(p) {
      const info = parseGamepadId(p.id);
      Object.assign(S, { id: p.id, family: info.family, seenBtn: new Set(), maxLT: 0, maxRT: 0, lt: [], rt: [], trail: { L: [], R: [] } });
      const labels = buttonLabels(info.family, p.mapping, p.buttons.length);
      $("gpGrid").innerHTML = labels.map((l, i) => `<div data-i="${i}">${ctx.esc(l)}</div>`).join("");
      const tl = labels[6], tr = labels[7];
      if (stdMap(p)) { $("gpLTname").textContent = tl; $("gpRTname").textContent = tr; }
      else { $("gpLTname").textContent = "L trigger"; $("gpRTname").textContent = "R trigger"; }
      const haptic = p.vibrationActuator ? "yes" : "no / not reported";
      $("gpInfo").innerHTML = `<b>${ctx.esc(info.name)}</b>${info.vendorName ? ` by ${ctx.esc(info.vendorName)}` : ""}<br>
        <span class="detail">Vendor ${info.vendor || "?"} · Product ${info.product || "?"} · mapping: ${p.mapping || "non-standard"} · ${p.buttons.length} buttons · ${p.axes.length} axes · rumble: ${haptic} · ${ctx.esc(p.connected ? "connected" : "disconnected")}</span>
        ${p.mapping !== "standard" ? `<br><span class="detail">The browser doesn't recognise this layout, so labels are generic and the trigger tests can't read it. Use the raw axes below.</span>` : ""}`;
      $("gpInfo").classList.remove("hidden"); $("gpLive").classList.remove("hidden");
      $("gpStatus").textContent = "Connected.";
      ctx.result("INFO", "Controller detected", `${info.name} (${info.vendor}:${info.product}), ${p.mapping || "non-standard"} mapping, ${p.buttons.length} buttons, ${p.axes.length} axes`, "detected");
    }

    function drawPad(cv, trace, cur) {
      const g = cv.getContext("2d"), w = cv.width, c = w / 2, R = c - 14;
      const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      g.clearRect(0, 0, w, w); g.strokeStyle = css("--border"); g.lineWidth = 2;
      g.beginPath(); g.arc(c, c, R, 0, 7); g.stroke(); g.beginPath(); g.moveTo(c, 14); g.lineTo(c, w - 14); g.moveTo(14, c); g.lineTo(w - 14, c); g.stroke();
      g.fillStyle = "rgba(91,143,240,.35)"; for (const [x, y] of trace) g.fillRect(c + x * R - 1.5, c + y * R - 1.5, 3, 3);
      g.fillStyle = css("--accent"); g.beginPath(); g.arc(c + cur[0] * R, c + cur[1] * R, 9, 0, 7); g.fill();
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      refreshList();
      const p = pads().find(x => x.index === S.idx); if (!p) return;
      S.pad = p;
      const L = stickOf(p, "L"), R = stickOf(p, "R");
      for (const [k, v] of [["L", L], ["R", R]]) { const t = S.trail[k]; if (Math.hypot(v[0], v[1]) > 0.08) { t.push(v); if (t.length > 1500) t.shift(); } }
      drawPad($("gpCvL"), S.trail.L, L); drawPad($("gpCvR"), S.trail.R, R);
      $("gpTxtL").textContent = `L: ${L[0].toFixed(2)}, ${L[1].toFixed(2)}`; $("gpTxtR").textContent = `R: ${R[0].toFixed(2)}, ${R[1].toFixed(2)}`;
      const lt = trigOf(p, "L"), rt = trigOf(p, "R");
      $("gpMLT").style.width = lt * 100 + "%"; $("gpMRT").style.width = rt * 100 + "%"; $("gpVLT").textContent = lt.toFixed(2); $("gpVRT").textContent = rt.toFixed(2);
      p.buttons.forEach((b, i) => {
        const el = $("gpGrid").children[i]; if (!el) return;
        if (b.pressed || b.value > 0.5) S.seenBtn.add(i);
        el.classList.toggle("on", !!b.pressed); el.classList.toggle("seen", S.seenBtn.has(i) && !b.pressed);
      });
      $("gpAxes").innerHTML = p.axes.map((v, i) => `<div class="bar"><span>Axis ${i}</span><div class="meter"><div style="width:${(v + 1) * 50}%"></div></div><span class="mono">${v.toFixed(2)}</span></div>`).join("");
      if (S.sampler) S.sampler(now, p, L, R, lt, rt);
    }
    raf = requestAnimationFrame(frame);

    // ---- tests ----
    const busy = on => { S.busy = on; for (const id of ["gpDrift", "gpRange", "gpTrig", "gpRate", "gpRumble", "gpBtns"]) $(id).disabled = on; };
    const status = $("gpTestStatus");
    const sticksName = () => S.pad && S.pad.mapping === "standard" ? "" : " (assuming axes 0–3 are the sticks)";

    $("gpDrift").onclick = async () => {
      busy(true); status.textContent = "Let go of both sticks and set the controller down…";
      const A = [], B = [];
      S.sampler = (_, p, L, R) => { A.push(L); B.push(R); };
      await ctx.timed(3000, status, "Measuring drift", null);
      S.sampler = null; busy(false);
      for (const [name, s] of [["Left stick", A], ["Right stick", B]]) {
        const rs = restStats(s), st = rateRest(rs);
        ctx.result(st, `${name} drift`, `Resting offset ${(rs.offset * 100).toFixed(1)}%, noise ${(rs.noise * 100).toFixed(2)}%. ${st === "PASS" ? "Rests at centre." : `You'd need a deadzone of about ${Math.ceil((rs.offset + rs.noise * 3) * 100)}% to hide this.`}${sticksName()}`, `drift-${name}`);
      }
    };
    $("gpRange").onclick = async () => {
      busy(true); status.textContent = "Rotate both sticks around the outer edge…";
      const A = [], B = [];
      S.sampler = (_, p, L, R) => { A.push(L); B.push(R); };
      await ctx.timed(8000, status, "Rotate both sticks around the edge,", null);
      S.sampler = null; busy(false);
      for (const [name, s] of [["Left stick", A], ["Right stick", B]]) {
        const rg = rangeStats(s), st = rateRange(rg);
        ctx.result(st, `${name} range`, st === "INFO" ? `Only ${Math.round(rg.coverage * 100)}% of the circle was swept; rotate more slowly and fully, then run it again.` : `Reaches ${Math.round(rg.maxR * 100)}% at the edge; roundness ${Math.round(rg.roundness * 100)}% (100% is a perfect circle).`, `range-${name}`);
      }
    };
    $("gpTrig").onclick = async () => {
      if (!S.pad || S.pad.mapping !== "standard") { ctx.result("INFO", "Triggers", "Needs a controller with the standard mapping; check the raw axes instead.", "triggers"); return; }
      busy(true); const lt = [], rt = []; status.textContent = "";
      S.sampler = (_, p, L, R, a, b) => { lt.push(a); rt.push(b); };
      await ctx.timed(8000, status, "Squeeze both triggers slowly all the way down and back,", null);
      S.sampler = null; busy(false);
      const analog = analogTriggers(S.family);
      for (const [name, v] of [["Left trigger", lt], ["Right trigger", rt]]) {
        const max = Math.max(0, ...v), lv = distinctLevels(v);
        let st, d;
        if (max < 0.9) { st = "FAIL"; d = `Only reached ${Math.round(max * 100)}%. Squeeze it fully, or the trigger is faulty.`; }
        else if (lv >= 8) { st = "PASS"; d = `Analog: ${lv} distinct levels, full travel.`; }
        else { st = analog ? "WARN" : "INFO"; d = `Digital (${lv} levels): on/off only.${analog ? " This family normally has analog triggers; may be a clone or worn." : " Normal for this controller family."}`; }
        ctx.result(st, name, d, `trig-${name}`);
      }
    };
    $("gpRate").onclick = async () => {
      busy(true); const samples = []; status.textContent = "";
      S.sampler = (now, p) => samples.push({ t: now, ts: p.timestamp });
      await ctx.timed(6000, status, "Keep moving both sticks around,", null);
      S.sampler = null; busy(false);
      const u = updateRate(samples);
      const st = u.share >= 0.85 ? "PASS" : u.share >= 0.4 ? "WARN" : "FAIL";
      ctx.result(st, "Update rate", `Fresh data on ${Math.round(u.share * 100)}% of screen frames (${u.hz.toFixed(0)} updates/s while the screen refreshes at ~${u.fps.toFixed(0)}). ${st === "PASS" ? "Keeps up with the display." : "Updates arrive slower than the display; feels laggy. Try a cable, or move closer if wireless."}`, "rate");
    };
    $("gpRumble").onclick = async () => {
      const p = S.pad; const act = p && p.vibrationActuator;
      if (!act || !act.playEffect) { ctx.result("INFO", "Rumble", "This controller or connection doesn't expose rumble to the browser.", "rumble"); return; }
      busy(true); const box = $("gpAsk"); const answers = [];
      for (const [label, params] of [["strong (low-frequency) motor", { strongMagnitude: 1, weakMagnitude: 0 }], ["weak (high-frequency) motor", { strongMagnitude: 0, weakMagnitude: 1 }]]) {
        status.textContent = `Running the ${label}…`;
        try { await act.playEffect("dual-rumble", { startDelay: 0, duration: 800, ...params }); } catch (e) { ctx.result("FAIL", "Rumble", `Browser refused: ${e.message}`, "rumble"); busy(false); status.textContent = ""; return; }
        await ctx.sleep(300);
        answers.push(await ctx.ask(box, `Did you feel the ${label}?`, ["Yes", "No"]));
      }
      busy(false); status.textContent = "";
      const n = answers.filter(a => a === "Yes").length;
      ctx.result(n === 2 ? "PASS" : n === 1 ? "WARN" : "FAIL", "Rumble", `${n} of 2 motors felt (${answers.map((a, i) => (i ? "weak" : "strong") + ": " + a).join(", ")}).`, "rumble");
    };
    $("gpBtns").onclick = () => {
      const p = S.pad; if (!p) return;
      const missing = p.buttons.map((_, i) => i).filter(i => !S.seenBtn.has(i) && !(p.mapping === "standard" && (i === 16)));   // Home/Guide is often grabbed by the OS
      const total = p.buttons.length, labels = buttonLabels(S.family, p.mapping, total);
      if (!missing.length) ctx.result("PASS", "Buttons", `All ${total} buttons registered.`, "buttons");
      else ctx.result("WARN", "Buttons", `${missing.length} not pressed yet: ${missing.map(i => labels[i]).join(", ")}. (Home/Guide is often captured by the OS and can't be seen.)`, "buttons");
    };
  },

  unmount() { cancelAnimationFrame(raf); raf = 0; if (state) state.sampler = null; },
};

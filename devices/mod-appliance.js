// Appliances with no data connection (hair dryer, fan, vacuum, blender, shaver, fridge, drill, pump…): judge them from outside by
// their sound, their vibration (a phone resting on them) and their magnetic field (a phone's compass).
// This shows whether it runs, whether each speed setting really changes, and whether it rattles or stutters. It does NOT test electrical safety.
import { runSummary, judgeAppliance, vibrationStats, fieldStrength, mean } from "./core.js";

let live = null, motionOff = null, magSensor = null;
const stopMic = () => { if (!live) return; live.stream?.getTracks().forEach(t => t.stop()); live.ac?.close().catch(() => {}); live = null; };
const stopSensors = () => { motionOff?.(); motionOff = null; try { magSensor?.stop(); } catch (_) {} magSensor = null; };

export default {
  id: "appliance", title: "Appliances",
  blurb: "For anything without a USB port: hair dryer, fan, vacuum, blender, shaver, fridge, power drill. Judge it by <b>sound</b> (does it run, does each speed really change, does it rattle or stutter), by <b>vibration</b> and <b>magnetic field</b> using a phone resting on it. This can't test electrical safety; use a proper tester for that, and never open or probe a plugged-in appliance.",
  supported: () => true,

  mount(root, ctx) {
    root.innerHTML = `
      <h3 style="margin-top:0">1. Sound signature (microphone)</h3>
      <p class="detail" style="margin-top:0">Put the microphone about 30 cm from the appliance. Record the quiet room first with the appliance <b>off</b>, then record it running. Do each speed or heat setting separately to compare them.</p>
      <div class="row"><button id="apStart">Start microphone</button><span id="apStatus" class="detail"></span></div>
      <div id="apBody" class="hidden">
        <div class="bar"><b>Level</b><div class="meter"><div id="apMeter"></div></div><span class="mono" id="apDb">–</span></div>
        <div class="row"><button id="apBase">Record background (3s, appliance OFF)</button>
          <label>Setting <input type="text" id="apLabel" value="Low" size="10" aria-label="Setting name"></label><button id="apRun">Record running (4s)</button><button id="apClear" class="secondary">Clear</button></div>
        <div class="detail" id="apTest"></div>
        <div class="tablewrap" style="overflow-x:auto"><table id="apTable" class="hidden"><thead><tr><th>Run</th><th>Level</th><th>Main tone</th><th>Tonal</th><th>Variation</th><th>Mains hum</th></tr></thead><tbody></tbody></table></div>
        <canvas id="apSpec" width="720" height="140" class="hidden" style="width:100%;height:auto;background:var(--code);border-radius:8px;margin-top:8px"></canvas>
      </div>

      <h3>2. Vibration (phone on the appliance)</h3>
      <p class="detail" style="margin-top:0">Open this page on your phone (Chrome or Safari), lay the phone flat on the appliance, and run it. Needs a phone with a motion sensor; computers usually have none. Sensors need a secure page: on Android use USB debugging and <code>chrome://inspect</code> port forwarding to localhost.</p>
      <div class="row"><button id="apVib">Measure vibration (5s)</button><span class="detail" id="apVibStatus"></span></div>

      <h3>3. Magnetic field (phone compass)</h3>
      <p class="detail" style="margin-top:0">A running motor, transformer or magnet changes the field a phone's magnetometer sees. Record with the appliance off, then on, with the phone touching it. Chrome on Android only.</p>
      <div class="row"><button id="apMagOff">Field: appliance OFF (3s)</button><button id="apMagOn">Field: appliance ON (3s)</button><span class="detail" id="apMagStatus"></span></div>`;
    const $ = id => root.querySelector("#" + id);
    let base = null; const runs = [];

    // ---- sound ----
    $("apStart").onclick = async () => {
      stopMic(); $("apStatus").textContent = "Asking for the microphone…";
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        const ac = new (window.AudioContext || window.webkitAudioContext)(); await ac.resume();
        const an = ac.createAnalyser(); an.fftSize = 16384; ac.createMediaStreamSource(stream).connect(an);
        live = { stream, ac, an }; $("apBody").classList.remove("hidden"); $("apStatus").textContent = `Listening (${ac.sampleRate} Hz)`;
        const buf = new Float32Array(2048);
        const loop = () => { if (!live || live.an !== an) return; requestAnimationFrame(loop); an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf.subarray(buf.length - 2048)) s += v * v; const db = 10 * Math.log10(s / 2048 || 1e-12); $("apMeter").style.width = Math.max(0, Math.min(100, (db + 70) / 70 * 100)) + "%"; $("apDb").textContent = db.toFixed(0) + " dB"; };
        loop();
      } catch (e) { $("apStatus").textContent = ""; ctx.result("FAIL", "Microphone opens", `${e.name}: ${e.message}`, "mic"); }
    };
    async function record(ms, label) {
      const btns = ["apBase", "apRun", "apClear"].map($); btns.forEach(b => b.disabled = true);
      try {
        const frames = []; let last = -1e9; const buf = new Float32Array(live.an.fftSize), sr = live.ac.sampleRate;
        await ctx.timed(ms, $("apTest"), label, now => { if (live && now - last >= 350) { last = now; live.an.getFloatTimeDomainData(buf); frames.push(Float32Array.from(buf)); } });
        return frames.length ? runSummary(frames, sr) : null;
      } finally { btns.forEach(b => b.disabled = false); }
    }
    function addRow(name, r) {
      $("apTable").classList.remove("hidden");
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${ctx.esc(name)}</td><td class="mono">${r.rmsDb.toFixed(0)} dB</td><td class="mono">${r.dominantHz.toFixed(0)} Hz</td><td class="mono">${Math.round(r.tonal * 100)}%</td><td class="mono">${Math.round(r.wobble * 100)}%</td><td class="mono">${r.hum.share > 0.1 ? r.hum.hz + " Hz " + Math.round(r.hum.share * 100) + "%" : "–"}</td>`;
      $("apTable").tBodies[0].appendChild(tr);
      const cv = $("apSpec"); cv.classList.remove("hidden"); const g = cv.getContext("2d"), sp = r.spectrum, maxHz = 2000, bins = Math.min(sp.mags.length, Math.floor(maxHz / sp.binHz));
      g.clearRect(0, 0, cv.width, cv.height); g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2f6fde";
      const top = Math.max(...sp.mags.subarray(1, bins)) || 1;
      for (let i = 1; i < bins; i++) { const h = Math.sqrt(sp.mags[i] / top) * (cv.height - 14); g.fillRect(i / bins * cv.width, cv.height - 14 - h, Math.max(1, cv.width / bins), h); }
      g.fillStyle = "#888"; g.font = "11px sans-serif"; for (const f of [0, 500, 1000, 1500, 2000]) g.fillText(f + " Hz", Math.min(cv.width - 40, f / maxHz * cv.width), cv.height - 2);
    }
    $("apBase").onclick = async () => { base = await record(3000, "Quiet,"); if (!base) return; addRow("Background", base); ctx.result("INFO", "Background noise", `${base.rmsDb.toFixed(0)} dBFS${base.hum.share > 0.15 ? `; already ${base.hum.hz} Hz mains hum in the room (${Math.round(base.hum.share * 100)}%)` : ""}.`, "background"); };
    $("apRun").onclick = async () => {
      if (!base) { $("apTest").textContent = "Record the background first."; return; }
      const name = $("apLabel").value.trim() || `Run ${runs.length + 1}`, r = await record(4000, `Recording ${name},`); if (!r) return; runs.push({ name, r }); addRow(name, r);
      const verdict = judgeAppliance(base, r), worst = verdict.some(v => v.status === "FAIL") ? "FAIL" : verdict.some(v => v.status === "WARN") ? "WARN" : "PASS";
      ctx.result(worst, `${name}: sound`, verdict.map(v => v.text).join(" "), `run-${name}`);
      if (runs.length >= 2) {
        const a = runs.at(-2), b = runs.at(-1), dDb = b.r.rmsDb - a.r.rmsDb, dHz = a.r.dominantHz ? Math.abs(b.r.dominantHz - a.r.dominantHz) / a.r.dominantHz : 0;
        const same = Math.abs(dDb) < 2 && dHz < 0.05;
        ctx.result(same ? "WARN" : "PASS", `${a.name} vs ${b.name}`, same ? `They sound the same (${dDb.toFixed(1)} dB, main tone ${a.r.dominantHz.toFixed(0)} vs ${b.r.dominantHz.toFixed(0)} Hz): the setting switch may not be doing anything.` : `Different: ${dDb >= 0 ? "+" : ""}${dDb.toFixed(1)} dB, main tone ${a.r.dominantHz.toFixed(0)} → ${b.r.dominantHz.toFixed(0)} Hz.`, "compare");
      }
    };
    $("apClear").onclick = () => { base = null; runs.length = 0; $("apTable").tBodies[0].innerHTML = ""; $("apTable").classList.add("hidden"); $("apSpec").classList.add("hidden"); };

    // ---- vibration ----
    $("apVib").onclick = async () => {
      $("apVib").disabled = true; const samples = [], st = $("apVibStatus");
      try {
        if (typeof DeviceMotionEvent !== "undefined" && DeviceMotionEvent.requestPermission) { const p = await DeviceMotionEvent.requestPermission(); if (p !== "granted") throw new Error("Motion permission was refused."); }
        const on = e => { const a = e.accelerationIncludingGravity || e.acceleration; if (a && a.x !== null && a.x !== undefined) samples.push({ t: performance.now(), v: Math.hypot(a.x, a.y, a.z) }); };
        window.addEventListener("devicemotion", on); motionOff = () => window.removeEventListener("devicemotion", on);
        await ctx.timed(5000, st, "Measuring,", null); stopSensors();
        if (samples.length < 20) { ctx.result("INFO", "Vibration", "No motion-sensor data. This device probably has none; open the page on a phone.", "vibration"); return; }
        const v = vibrationStats(samples), g = v.rms / 9.81;
        const level = v.rms < 0.05 ? "none to very faint" : v.rms < 0.5 ? "light" : v.rms < 2 ? "moderate" : "strong";
        ctx.result(v.rms < 0.05 ? "WARN" : "INFO", "Vibration", `${level}: ${v.rms.toFixed(2)} m/s² RMS (${g.toFixed(3)} g)${v.rms >= 0.05 ? `, strongest at about ${v.hz.toFixed(1)} Hz (~${Math.round(v.hz * 60)} per minute)` : ". Is it running and is the phone touching it?"}. Sampled at ${v.rate.toFixed(0)} Hz.`, "vibration");
      } catch (e) { ctx.result("INFO", "Vibration", e.message, "vibration"); }
      finally { $("apVib").disabled = false; st.textContent = ""; }
    };

    // ---- magnetic field ----
    const field = {};
    async function readField(which) {
      const st = $("apMagStatus"), btns = [$("apMagOff"), $("apMagOn")]; btns.forEach(b => b.disabled = true);
      try { await readField2(which, st); } finally { btns.forEach(b => b.disabled = false); }
    }
    async function readField2(which, st) {
      if (typeof Magnetometer === "undefined") { ctx.result("INFO", "Magnetic field", "No magnetometer API here (Chrome on an Android phone has one).", "magnetic"); return; }
      try {
        const m = new Magnetometer({ frequency: 30 }), vals = []; magSensor = m;
        await new Promise((res, rej) => { m.onreading = () => vals.push(fieldStrength(m.x, m.y, m.z)); m.onerror = e => rej(e.error || e); m.start(); ctx.timed(3000, st, `Reading (${which}),`, null).then(res); });
        stopSensors(); field[which] = mean(vals);
        if (field.off !== undefined && field.on !== undefined) {
          const d = Math.abs(field.on - field.off);
          ctx.result(d >= 5 ? "PASS" : "WARN", "Magnetic field", `Off ${field.off.toFixed(0)} µT, on ${field.on.toFixed(0)} µT (change ${d.toFixed(1)} µT). ${d >= 5 ? "A running motor or transformer is clearly detected." : "No real change: not running, or the phone isn't close enough to the motor."}`, "magnetic");
        } else ctx.result("INFO", "Magnetic field", `${which}: ${field[which].toFixed(0)} µT. Now record the other state.`, "magnetic");
      } catch (e) { ctx.result("INFO", "Magnetic field", `Couldn't read the magnetometer (${e.name || e.message}).`, "magnetic"); }
    }
    $("apMagOff").onclick = () => readField("off"); $("apMagOn").onclick = () => readField("on");
  },

  unmount() { stopMic(); stopSensors(); },
};

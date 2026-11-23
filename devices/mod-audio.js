// Microphone and speakers/headphones.
import { levelStats, toneToNoise, mean } from "./core.js";

let live = null;

function stopLive() { if (!live) return; cancelAnimationFrame(live.raf); live.stream?.getTracks().forEach(t => t.stop()); live.ac?.close().catch(() => {}); live = null; }

export default {
  id: "audio", title: "Audio",
  blurb: "Microphone: shows the live level, measures background noise, and checks for clipping and a clear voice signal. Speakers or headphones: plays a quiet tone on each side so you can confirm left and right.",
  supported: () => navigator.mediaDevices?.getUserMedia ? true : "This browser can't open the microphone (needs https:// or http://localhost).",

  mount(root, ctx) {
    root.innerHTML = `
      <h3 style="margin-top:0">Microphone</h3>
      <div class="row"><label>Input <select id="auIn" aria-label="Microphone"><option value="">Default microphone</option></select></label><button id="auStart">Start microphone</button><button id="auStop" class="secondary hidden">Stop</button><span id="auStatus" class="detail"></span></div>
      <div id="auLive" class="hidden">
        <div class="bar"><b>Level</b><div class="meter"><div id="auMeter"></div></div><span class="mono" id="auDb">–</span></div>
        <div class="row"><button id="auNoise">Noise floor (2s, stay silent)</button><button id="auSpeak">Voice test (3s, talk normally)</button><button id="auLoop">Speaker → mic loopback</button><span class="detail" id="auTest"></span></div>
      </div>
      <h3>Speakers / headphones</h3>
      <div class="row"><button id="auL">Left tone</button><button id="auC">Centre tone</button><button id="auR">Right tone</button><span class="detail">Quiet 440 Hz tones, 1 second each.</span></div>
      <div id="auAsk"></div>`;
    const $ = id => root.querySelector("#" + id);

    (async () => {   // list devices (labels only appear once permission was granted)
      try { const d = await navigator.mediaDevices.enumerateDevices(); for (const x of d.filter(x => x.kind === "audioinput")) { const o = document.createElement("option"); o.value = x.deviceId; o.textContent = x.label || "Microphone"; $("auIn").appendChild(o); } } catch (_) {}
    })();

    async function collect(ms, label) {
      const frames = [], buf = new Float32Array(live.an.fftSize);
      await ctx.timed(ms, $("auTest"), label, () => { live.an.getFloatTimeDomainData(buf); frames.push(Float32Array.from(buf)); });
      return frames;
    }
    $("auStart").onclick = async () => {
      stopLive(); $("auStatus").textContent = "Asking for the microphone…";
      try {
        const id = $("auIn").value;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        const ac = new (window.AudioContext || window.webkitAudioContext)(); await ac.resume();
        const src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 2048; src.connect(an);
        live = { stream, ac, an, raf: 0, last: null };
        const buf = new Float32Array(an.fftSize);
        const loop = () => { live.raf = requestAnimationFrame(loop); an.getFloatTimeDomainData(buf); const s = levelStats(buf); live.last = s; $("auMeter").style.width = Math.max(0, Math.min(100, (s.rmsDb + 70) / 70 * 100)) + "%"; $("auDb").textContent = s.rmsDb.toFixed(0) + " dB"; };
        loop();
        const t = stream.getAudioTracks()[0]; const st = t.getSettings ? t.getSettings() : {};
        $("auStatus").textContent = `Listening: ${t.label || "microphone"}${st.sampleRate ? `, ${st.sampleRate} Hz` : ""}`;
        $("auLive").classList.remove("hidden"); $("auStop").classList.remove("hidden");
        ctx.result("PASS", "Microphone opens", `${t.label || "microphone"}, ${ac.sampleRate} Hz, ${st.channelCount || "?"} channel(s)`, "open");
      } catch (e) { $("auStatus").textContent = ""; ctx.result("FAIL", "Microphone opens", `${e.name}: ${e.message}`, "open"); }
    };
    $("auStop").onclick = () => { stopLive(); $("auLive").classList.add("hidden"); $("auStop").classList.add("hidden"); $("auStatus").textContent = "Stopped."; };

    let noiseDb = null;
    $("auNoise").onclick = async () => {
      const fr = await collect(2000, "Stay quiet,"); const dbs = fr.map(f => levelStats(f).rmsDb); noiseDb = mean(dbs);
      const dc = Math.abs(mean(fr.map(f => levelStats(f).dc)));
      const st = noiseDb < -55 ? "PASS" : noiseDb < -42 ? "WARN" : "FAIL";
      ctx.result(st, "Mic noise floor", `${noiseDb.toFixed(0)} dBFS background noise${st === "PASS" ? " (quiet)." : st === "WARN" ? " (a bit hissy or the room is noisy)." : " (very noisy: faulty mic, bad cable, or loud room)."}`, "noise");
      if (dc > 0.02) ctx.result("WARN", "Mic DC offset", `Signal is offset by ${(dc * 100).toFixed(1)}% from zero; cheap or damaged interface.`, "dc");
    };
    $("auSpeak").onclick = async () => {
      const fr = await collect(3000, "Talk normally,"); const st = fr.map(levelStats);
      const peak = Math.max(...st.map(s => s.peak)), clip = st.reduce((a, s) => a + s.clipped, 0), loud = Math.max(...st.map(s => s.rmsDb));
      if (peak < 0.02) { ctx.result("FAIL", "Mic voice level", "Almost no signal heard. Muted, wrong input, or dead mic.", "voice"); return; }
      const snr = noiseDb === null ? null : loud - noiseDb;
      ctx.result(clip ? "WARN" : "PASS", "Mic level & clipping", `Peak ${(20 * Math.log10(peak)).toFixed(0)} dBFS, loudest ${loud.toFixed(0)} dBFS RMS. ${clip ? `${clip} clipped samples: turn the input gain down.` : "No clipping."}`, "voice");
      if (snr !== null) ctx.result(snr >= 30 ? "PASS" : snr >= 20 ? "WARN" : "FAIL", "Mic signal-to-noise", `Voice is ${snr.toFixed(0)} dB above the noise floor.`, "snr");
      else ctx.result("INFO", "Mic signal-to-noise", "Run the noise floor test first to get this.", "snr");
    };
    $("auLoop").onclick = async () => {
      const ac = new AudioContext(); await ac.resume(); const osc = ac.createOscillator(), g = ac.createGain();
      osc.frequency.value = 1000; g.gain.value = 0.2; osc.connect(g).connect(ac.destination); osc.start();
      const fr = await collect(1500, "Playing 1 kHz tone,"); osc.stop(); ac.close();
      const r = toneToNoise(fr.at(-1), live.ac.sampleRate, 1000);
      ctx.result(r.tone > 0.01 ? "PASS" : "WARN", "Speaker → mic loopback", r.tone > 0.01 ? `The mic heard the 1 kHz tone (${(20 * Math.log10(r.tone)).toFixed(0)} dBFS, ${Math.round(r.ratio * 100)}% pure). Both speaker and mic work.` : "The mic didn't hear the tone. Raise the volume, hold the mic closer to the speaker, or one of them is faulty.", "loopback");
    };

    async function tone(side) {
      const ac = new AudioContext(); await ac.resume(); const osc = ac.createOscillator(), p = ac.createStereoPanner(), g = ac.createGain();
      osc.frequency.value = 440; p.pan.value = side === "Left" ? -1 : side === "Right" ? 1 : 0; g.gain.value = 0.15;
      osc.connect(p).connect(g).connect(ac.destination); osc.start(); await ctx.sleep(1000); osc.stop(); ac.close();
      const a = await ctx.ask($("auAsk"), `Where did you hear the ${side.toLowerCase()} tone?`, ["Left", "Right", "Both / centre", "Nothing"]);
      const want = side === "Centre" ? "Both / centre" : side, ok = a === want;
      ctx.result(ok ? "PASS" : "FAIL", `Speaker ${side.toLowerCase()}`, ok ? `${side} channel works.` : `Expected ${want}, heard: ${a}.${a === "Nothing" ? " That channel is silent or muted." : " Channels may be swapped or the wiring is wrong."}`, `spk-${side}`);
    }
    $("auL").onclick = () => tone("Left"); $("auC").onclick = () => tone("Centre"); $("auR").onclick = () => tone("Right");
  },

  unmount: stopLive,
};

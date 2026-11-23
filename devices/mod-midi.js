// MIDI keyboards, pads, controllers and interfaces via Web MIDI.
import { MidiTracker, noteName } from "./core.js";

let access = null;

export default {
  id: "midi", title: "MIDI",
  blurb: "Plug in a MIDI keyboard, drum pad, knob controller or interface. Play every key/pad and turn every knob; the page logs what it receives, tracks velocity range and flags notes that never release.",
  supported: () => navigator.requestMIDIAccess ? true : "This browser has no Web MIDI (use Chrome or Edge).",

  mount(root, ctx) {
    root.innerHTML = `
      <div class="row"><button id="mdStart">Connect MIDI</button><span id="mdStatus" class="detail"></span></div>
      <div id="mdBody" class="hidden">
        <div id="mdPorts" class="note"></div>
        <div class="row"><button id="mdSend">Send a test note to outputs</button><button id="mdRecord">Record MIDI result</button><button id="mdReset" class="secondary">Reset</button></div>
        <h3>Incoming</h3><pre id="mdLog" style="min-height:60px">Play something…</pre>
        <div class="detail" id="mdSummary"></div>
      </div>`;
    const $ = id => root.querySelector("#" + id);
    let T = new MidiTracker(), lines = [];
    const summary = () => { $("mdSummary").textContent = `${T.count} messages · ${T.notes.size} distinct notes${T.notes.size ? ` · velocity ${T.velMin}–${T.velMax}` : ""} · ${T.ccs.size} controllers moved${T.on.size ? ` · ${T.on.size} notes still down` : ""}`; };
    const onmsg = e => {
      const m = T.feed([...e.data]); if (m.type === "active-sensing" || m.type === "clock") return;
      const txt = m.type === "note-on" ? `Note on  ${noteName(m.note)} vel ${m.velocity} ch${m.channel}` : m.type === "note-off" ? `Note off ${noteName(m.note)} ch${m.channel}` : m.type === "cc" ? `CC ${m.cc} = ${m.value} ch${m.channel}` : `${m.type} ${m.value ?? m.program ?? ""} ch${m.channel}`;
      lines.push(txt); if (lines.length > 14) lines.shift(); $("mdLog").textContent = lines.join("\n"); summary();
    };
    function listPorts() {
      const ins = [...access.inputs.values()], outs = [...access.outputs.values()];
      $("mdPorts").innerHTML = `<b>Inputs (${ins.length}):</b> ${ins.map(p => ctx.esc(p.name + (p.manufacturer ? " · " + p.manufacturer : ""))).join(", ") || "none"}<br><b>Outputs (${outs.length}):</b> ${outs.map(p => ctx.esc(p.name)).join(", ") || "none"}`;
      for (const i of ins) i.onmidimessage = onmsg;
    }
    $("mdStart").onclick = async () => {
      try {
        access = await navigator.requestMIDIAccess({ sysex: false }); access.onstatechange = () => { listPorts(); };
        $("mdBody").classList.remove("hidden"); listPorts(); summary();
        const n = access.inputs.size + access.outputs.size;
        ctx.result(n ? "PASS" : "WARN", "MIDI devices", n ? `${access.inputs.size} input(s), ${access.outputs.size} output(s) found.` : "MIDI access granted but no devices are plugged in.", "devices");
      } catch (e) { ctx.result("FAIL", "MIDI access", `${e.name}: ${e.message}`, "access"); }
    };
    $("mdReset").onclick = () => { T = new MidiTracker(); lines = []; $("mdLog").textContent = "Play something…"; summary(); };
    $("mdSend").onclick = async () => {
      const outs = [...access.outputs.values()]; if (!outs.length) { ctx.result("INFO", "MIDI output", "No output ports to send to.", "out"); return; }
      for (const o of outs) { o.send([0x90, 60, 80]); await ctx.sleep(400); o.send([0x80, 60, 0]); }
      ctx.result("INFO", "MIDI output", `Sent middle C to ${outs.map(o => o.name).join(", ")}. Did anything sound?`, "out");
    };
    $("mdRecord").onclick = () => {
      if (!T.count) { ctx.result("INFO", "MIDI input", "Nothing received yet; play a key or turn a knob.", "input"); return; }
      ctx.result("PASS", "MIDI input", `${T.count} messages, ${T.notes.size} distinct notes${T.notes.size ? `, velocity ${T.velMin}–${T.velMax}` : ""}, ${T.ccs.size} controllers. ${T.notes.size > 1 && T.velMax - T.velMin < 10 ? "Velocity barely varied; hit harder and softer to test velocity response." : ""}`, "input");
      if (T.on.size) ctx.result("FAIL", "Stuck notes", `${T.on.size} notes never sent a release (${[...T.on].slice(0, 5).join(", ")}): a stuck or sticky key.`, "stuck");
      else if (T.notes.size) ctx.result("PASS", "Stuck notes", "Every note released.", "stuck");
    };
  },

  unmount() { if (access) { for (const i of access.inputs.values()) i.onmidimessage = null; access.onstatechange = null; access = null; } },
};

// Pure analysis helpers for the Device Lab. No DOM, no browser APIs: everything here is unit-testable.

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const median = a => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const percentile = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
export const stdev = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
export const hex = (n, w = 4) => n.toString(16).padStart(w, "0");

// ---------- gamepads ----------
// Vendor and product IDs from the Gamepad API id string (Chrome: "... Vendor: 045e Product: 028e"; Firefox: "045e-028e-name").
export const VENDORS = {
  "045e": ["Microsoft", "xbox"], "054c": ["Sony", "playstation"], "057e": ["Nintendo", "nintendo"], "2dc8": ["8BitDo", "8bitdo"],
  "046d": ["Logitech", "generic"], "28de": ["Valve", "steam"], "0f0d": ["Hori", "generic"], "0e6f": ["PDP", "xbox"],
  "24c6": ["PowerA", "xbox"], "20d6": ["PowerA", "xbox"], "1532": ["Razer", "xbox"], "0079": ["DragonRise (generic)", "generic"],
  "2563": ["ShanWan (generic)", "generic"], "0810": ["Personal Communication Systems (generic)", "generic"], "1bad": ["Harmonix/Mad Catz", "generic"],
  "044f": ["ThrustMaster", "generic"], "1038": ["SteelSeries", "generic"], "2e24": ["Hyperkin", "generic"], "3537": ["GameSir", "generic"],
};
export const PRODUCTS = {
  "045e:028e": "Xbox 360 Controller", "045e:02a1": "Xbox 360 Wireless Receiver", "045e:02d1": "Xbox One Controller", "045e:02dd": "Xbox One Controller (2015)",
  "045e:02e3": "Xbox One Elite Controller", "045e:02ea": "Xbox One S Controller", "045e:02fd": "Xbox One S Controller (Bluetooth)", "045e:0b00": "Xbox Elite Series 2",
  "045e:0b12": "Xbox Series X|S Controller", "045e:0b13": "Xbox Series X|S Controller (Bluetooth)",
  "057e:2009": "Switch Pro Controller", "057e:2006": "Joy-Con (L)", "057e:2007": "Joy-Con (R)", "057e:2017": "SNES Controller (NSO)", "057e:2019": "N64 Controller (NSO)",
  "2dc8:3106": "8BitDo Pro 2", "2dc8:6001": "8BitDo SN30 Pro", "2dc8:5750": "8BitDo Ultimate", "2dc8:310a": "8BitDo Ultimate 2C",
  "046d:c21d": "Logitech F310 (XInput)", "046d:c216": "Logitech F310 (DirectInput)", "046d:c219": "Logitech F710", "046d:c21f": "Logitech F710 (XInput)",
  "28de:1102": "Steam Controller", "28de:1205": "Steam Deck", "054c:05c4": "DualShock 4", "054c:09cc": "DualShock 4 (v2)", "054c:0ce6": "DualSense",
};
export function parseGamepadId(id = "") {
  let vendor = "", product = "", name = id, m;
  if ((m = /Vendor:\s*([0-9a-f]{4})\s+Product:\s*([0-9a-f]{4})/i.exec(id))) {
    vendor = m[1].toLowerCase(); product = m[2].toLowerCase(); name = id.replace(/\s*\([^)]*\)\s*$/, "").trim();
  } else if ((m = /^([0-9a-f]{4})-([0-9a-f]{4})-(.*)$/i.exec(id))) {
    vendor = m[1].toLowerCase(); product = m[2].toLowerCase(); name = m[3].trim();
  }
  const v = VENDORS[vendor];
  const known = PRODUCTS[`${vendor}:${product}`];
  let family = v ? v[1] : "generic";
  if (family === "generic" && /xbox|xinput/i.test(name)) family = "xbox";
  if (/dualshock|dualsense|wireless controller/i.test(name) && vendor === "054c") family = "playstation";
  if (/switch|joy-?con|pro controller/i.test(name) && family === "generic") family = "nintendo";
  return { vendor, product, vendorName: v ? v[0] : "", name: known || name || "Unknown gamepad", knownProduct: !!known, family };
}

// Names for the 17 "standard" mapping buttons, by controller family. Standard index = position on an Xbox-style layout.
const STD_BASE = ["Bottom", "Right", "Left", "Top", "L1", "R1", "L2", "R2", "Back", "Start", "L3", "R3", "Up", "Down", "Left (D-pad)", "Right (D-pad)", "Home"];
const FACE = {
  xbox: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "LS click", "RS click", "D-pad up", "D-pad down", "D-pad left", "D-pad right", "Guide"],
  playstation: ["Cross", "Circle", "Square", "Triangle", "L1", "R1", "L2", "R2", "Share", "Options", "L3", "R3", "D-pad up", "D-pad down", "D-pad left", "D-pad right", "PS"],
  nintendo: ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "-", "+", "LS click", "RS click", "D-pad up", "D-pad down", "D-pad left", "D-pad right", "Home"],
  "8bitdo": ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "Select", "Start", "L3", "R3", "D-pad up", "D-pad down", "D-pad left", "D-pad right", "Home"],
  steam: ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "View", "Menu", "L3", "R3", "D-pad up", "D-pad down", "D-pad left", "D-pad right", "Steam"],
};
export function buttonLabels(family, mapping, count) {
  if (mapping === "standard") { const base = FACE[family] || FACE.xbox; return Array.from({ length: count }, (_, i) => base[i] || `Button ${i}`); }
  return Array.from({ length: count }, (_, i) => `Button ${i}`);
}
// Whether the triggers of this family are expected to be analog.
export const analogTriggers = family => family !== "nintendo";

export function restStats(samples) {
  const n = samples.length; if (!n) return null;
  let mx = 0, my = 0; for (const [x, y] of samples) { mx += x; my += y; } mx /= n; my /= n;
  let v = 0, maxR = 0; for (const [x, y] of samples) { v += (x - mx) ** 2 + (y - my) ** 2; maxR = Math.max(maxR, Math.hypot(x, y)); }
  return { n, meanX: mx, meanY: my, offset: Math.hypot(mx, my), noise: Math.sqrt(v / n), maxR };
}
export function rateRest(rs) {
  if (!rs) return "INFO";
  if (rs.offset <= 0.05 && rs.noise <= 0.02) return "PASS";
  if (rs.offset <= 0.12 && rs.noise <= 0.05) return "WARN";
  return "FAIL";
}
export function rangeStats(samples, bins = 32) {
  const best = new Array(bins).fill(0);
  for (const [x, y] of samples) {
    const r = Math.hypot(x, y); if (r < 0.5) continue;
    const b = Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * bins) % bins;
    if (r > best[b]) best[b] = r;
  }
  const used = best.filter(v => v > 0);
  const maxR = used.length ? Math.max(...used) : 0, minR = used.length ? Math.min(...used) : 0;
  return { bins, covered: used.length, coverage: used.length / bins, maxR, minR, roundness: maxR ? minR / maxR : 0 };
}
export function rateRange(rg) {
  if (rg.coverage < 0.75) return "INFO";          // not enough of the circle was swept
  if (rg.maxR >= 0.95 && rg.roundness >= 0.8) return "PASS";
  if (rg.maxR >= 0.85 && rg.roundness >= 0.65) return "WARN";
  return "FAIL";
}
export const distinctLevels = values => new Set(values.map(v => Math.round(v * 1000))).size;
// samples: [{t, ts}] one per animation frame. Returns how often the controller delivered fresh data.
export function updateRate(samples) {
  if (samples.length < 3) return { hz: 0, frames: samples.length, changed: 0, share: 0, fps: 0 };
  let changed = 0; for (let i = 1; i < samples.length; i++) if (samples[i].ts !== samples[i - 1].ts) changed++;
  const dur = (samples.at(-1).t - samples[0].t) / 1000, frames = samples.length - 1;
  return { hz: dur ? changed / dur : 0, frames, changed, share: changed / frames, fps: dur ? frames / dur : 0 };
}

// ---------- keyboard ----------
export const CHATTER_MS = 25;
export class KeyboardTracker {
  constructor() { this.down = new Set(); this.seen = new Set(); this.max = 0; this.maxSet = []; this.lastUp = new Map(); this.chatter = []; this.presses = 0; }
  keydown(code, t, repeat = false) {
    if (repeat) return;
    const up = this.lastUp.get(code);
    if (up !== undefined && t - up < CHATTER_MS && !this.down.has(code)) this.chatter.push({ code, gap: +(t - up).toFixed(1) });
    this.down.add(code); this.seen.add(code); this.presses++;
    if (this.down.size > this.max) { this.max = this.down.size; this.maxSet = [...this.down]; }
  }
  keyup(code, t) { this.down.delete(code); this.lastUp.set(code, t); }
  reset() { Object.assign(this, new KeyboardTracker()); }
}
export const rolloverLabel = n => n >= 10 ? "full N-key rollover" : n >= 6 ? "6-key rollover (typical)" : n >= 3 ? "limited rollover" : "poor rollover";
// Rows of [code, label, width in key units] for a standard ANSI 104-key layout.
const k = (c, l, w = 1) => [c, l || c.replace(/^(Key|Digit)/, ""), w];
export const KB_LAYOUT = [
  [k("Escape", "Esc"), ["", "", 1], k("F1"), k("F2"), k("F3"), k("F4"), ["", "", .5], k("F5"), k("F6"), k("F7"), k("F8"), ["", "", .5], k("F9"), k("F10"), k("F11"), k("F12"), ["", "", .5], k("PrintScreen", "PrtSc"), k("ScrollLock", "ScrLk"), k("Pause")],
  [k("Backquote", "`"), ...[..."1234567890"].map(d => k("Digit" + d)), k("Minus", "-"), k("Equal", "="), k("Backspace", "Bksp", 2), ["", "", .5], k("Insert", "Ins"), k("Home"), k("PageUp", "PgUp"), ["", "", .5], k("NumLock", "Num"), k("NumpadDivide", "/"), k("NumpadMultiply", "*"), k("NumpadSubtract", "-")],
  [k("Tab", "Tab", 1.5), ...[..."QWERTYUIOP"].map(c => k("Key" + c)), k("BracketLeft", "["), k("BracketRight", "]"), k("Backslash", "\\", 1.5), ["", "", .5], k("Delete", "Del"), k("End"), k("PageDown", "PgDn"), ["", "", .5], k("Numpad7", "7"), k("Numpad8", "8"), k("Numpad9", "9"), k("NumpadAdd", "+")],
  [k("CapsLock", "Caps", 1.75), ...[..."ASDFGHJKL"].map(c => k("Key" + c)), k("Semicolon", ";"), k("Quote", "'"), k("Enter", "Enter", 2.25), ["", "", 4], k("Numpad4", "4"), k("Numpad5", "5"), k("Numpad6", "6")],
  [k("ShiftLeft", "Shift", 2.25), ...[..."ZXCVBNM"].map(c => k("Key" + c)), k("Comma", ","), k("Period", "."), k("Slash", "/"), k("ShiftRight", "Shift", 2.75), ["", "", 1.5], k("ArrowUp", "↑"), ["", "", 1.5], k("Numpad1", "1"), k("Numpad2", "2"), k("Numpad3", "3"), k("NumpadEnter", "Ent")],
  [k("ControlLeft", "Ctrl", 1.25), k("MetaLeft", "Win", 1.25), k("AltLeft", "Alt", 1.25), k("Space", "Space", 6.25), k("AltRight", "Alt", 1.25), k("MetaRight", "Win", 1.25), k("ContextMenu", "Menu", 1.25), k("ControlRight", "Ctrl", 1.25), ["", "", .5], k("ArrowLeft", "←"), k("ArrowDown", "↓"), k("ArrowRight", "→"), ["", "", .5], k("Numpad0", "0", 2), k("NumpadDecimal", ".")],
];
export const KB_CODES = KB_LAYOUT.flat().map(x => x[0]).filter(Boolean);

// ---------- mouse / pointer ----------
// timestamps in ms (event.timeStamp of each coalesced pointer event during fast motion).
export function pollingRate(ts) {
  const dts = []; for (let i = 1; i < ts.length; i++) { const d = ts[i] - ts[i - 1]; if (d > 0.2 && d <= 25) dts.push(d); }
  if (dts.length < 20) return { hz: 0, samples: dts.length, jitter: 0 };
  const med = median(dts);
  return { hz: 1000 / med, samples: dts.length, jitter: stdev(dts) / med };
}
export const nearestPollingRate = hz => { const std = [125, 250, 500, 1000, 2000, 4000, 8000]; return std.reduce((a, b) => Math.abs(b - hz) < Math.abs(a - hz) ? b : a); };
export class ClickAnalyzer {
  constructor() { this.seen = new Set(); this.downAt = new Map(); this.upAt = new Map(); this.chatter = []; this.bounces = []; this.count = 0; }
  down(button, t) {
    const up = this.upAt.get(button);
    if (up !== undefined && t - up < CHATTER_MS) this.chatter.push({ button, gap: +(t - up).toFixed(1) });
    this.downAt.set(button, t); this.seen.add(button); this.count++;
  }
  up(button, t) {
    const d = this.downAt.get(button);
    if (d !== undefined && t - d < 4) this.bounces.push({ button, held: +(t - d).toFixed(1) });
    this.upAt.set(button, t);
  }
}
export const BUTTON_NAMES = ["Left", "Middle", "Right", "Back", "Forward"];
// Wheel events: a single opposite-direction tick in the middle of a steady scroll is a worn-encoder glitch.
export function wheelGlitches(deltas, minRun = 3) {
  const s = deltas.map(d => Math.sign(d)).filter(Boolean);
  let glitches = 0, run = 1;
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] === s[i - 1]) { run++; continue; }
    if (run >= minRun && s[i + 1] === s[i - 1]) glitches++;
    run = 1;
  }
  return { events: s.length, glitches };
}
// Fraction of grid cells touched, plus the cells never touched (for touch/pen/mouse dead-zone sweeps).
export function gridCoverage(points, cols, rows) {
  const hit = new Set(points.map(([x, y]) => `${Math.min(cols - 1, Math.max(0, Math.floor(x * cols)))},${Math.min(rows - 1, Math.max(0, Math.floor(y * rows)))}`));
  const missed = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!hit.has(`${c},${r}`)) missed.push([c, r]);
  return { cols, rows, hit: hit.size, total: cols * rows, coverage: hit.size / (cols * rows), missed };
}
export function refreshRate(ts) {
  const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
  if (d.length < 10) return { hz: 0, dropped: 0 };
  const med = median(d);
  return { hz: 1000 / med, dropped: d.filter(x => x > med * 1.5).length, frames: d.length };
}
export const standardRefresh = hz => { const std = [24, 30, 50, 60, 75, 90, 100, 120, 144, 165, 180, 240, 360]; return std.reduce((a, b) => Math.abs(b - hz) < Math.abs(a - hz) ? b : a); };

// ---------- audio ----------
export function levelStats(f32) {
  let sum = 0, peak = 0, dc = 0, clip = 0;
  for (let i = 0; i < f32.length; i++) { const v = f32[i]; sum += v * v; dc += v; const a = Math.abs(v); if (a > peak) peak = a; if (a >= 0.999) clip++; }
  const rms = Math.sqrt(sum / f32.length);
  return { rms, rmsDb: 20 * Math.log10(rms || 1e-9), peak, peakDb: 20 * Math.log10(peak || 1e-9), dc: dc / f32.length, clipped: clip };
}
// Power of a single frequency in a block of samples (Goertzel), normalised to 0..1 of a full-scale sine.
export function goertzel(f32, sampleRate, freq) {
  const w = 2 * Math.PI * freq / sampleRate, c = 2 * Math.cos(w); let s1 = 0, s2 = 0;
  for (let i = 0; i < f32.length; i++) { const s = f32[i] + c * s1 - s2; s2 = s1; s1 = s; }
  const p = s1 * s1 + s2 * s2 - c * s1 * s2;
  return Math.sqrt(Math.max(0, p)) * 2 / f32.length;
}
export function toneToNoise(f32, sampleRate, freq) {
  const tone = goertzel(f32, sampleRate, freq), total = levelStats(f32).rms * Math.SQRT2 || 1e-9;
  return { tone, total, ratio: clamp(tone / total) };
}
export function genSine(freq, sampleRate, n, amp = 0.5) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = amp * Math.sin(2 * Math.PI * freq * i / sampleRate); return a; }

// ---------- camera ----------
export function frameStats(rgba, w, h) {
  let r = 0, g = 0, b = 0, lum = 0, n = 0; const L = new Float32Array(w * h);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) { r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; const l = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]; L[p] = l; lum += l; n++; }
  let lap = 0, lc = 0, lapSq = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const v = 4 * L[y * w + x] - L[y * w + x - 1] - L[y * w + x + 1] - L[(y - 1) * w + x] - L[(y + 1) * w + x];
    lap += v; lapSq += v * v; lc++;
  }
  const lapVar = lc ? lapSq / lc - (lap / lc) ** 2 : 0;
  return { r: r / n, g: g / n, b: b / n, luma: lum / n, sharpness: lapVar };
}
export function frameDiff(a, b) { let d = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return d / (n / 4) / 3; }
export function rateCamera(s) {
  const notes = [];
  if (s.luma < 25) notes.push("image is almost black (lens covered or sensor off)");
  else if (s.luma > 235) notes.push("image is blown out white");
  if (s.sharpness < 15 && s.luma >= 25) notes.push("image is very soft or blurry (check the lens, or point it at a detailed scene)");
  const max = Math.max(s.r, s.g, s.b), min = Math.min(s.r, s.g, s.b);
  if (max - min > 60 && s.luma > 40) notes.push("strong colour cast");
  return notes;
}

// ---------- MIDI ----------
export function parseMidi(bytes) {
  const [st = 0, a = 0, b = 0] = bytes, type = st & 0xF0, channel = (st & 0x0F) + 1;
  if (st >= 0xF0) return { type: st === 0xFE ? "active-sensing" : st === 0xF8 ? "clock" : "system", channel: 0 };
  switch (type) {
    case 0x90: return b ? { type: "note-on", channel, note: a, velocity: b } : { type: "note-off", channel, note: a, velocity: 0 };
    case 0x80: return { type: "note-off", channel, note: a, velocity: b };
    case 0xB0: return { type: "cc", channel, cc: a, value: b };
    case 0xE0: return { type: "pitch-bend", channel, value: ((b << 7) | a) - 8192 };
    case 0xC0: return { type: "program", channel, program: a };
    case 0xD0: return { type: "pressure", channel, value: a };
    case 0xA0: return { type: "aftertouch", channel, note: a, value: b };
    default: return { type: "unknown", channel };
  }
}
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteName = n => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
export class MidiTracker {
  constructor() { this.on = new Set(); this.notes = new Set(); this.ccs = new Map(); this.velMin = 127; this.velMax = 0; this.count = 0; this.bendMin = 0; this.bendMax = 0; }
  feed(bytes) {
    const m = parseMidi(bytes); if (m.type === "active-sensing" || m.type === "clock") return m;
    this.count++;
    if (m.type === "note-on") { this.on.add(`${m.channel}:${m.note}`); this.notes.add(m.note); this.velMin = Math.min(this.velMin, m.velocity); this.velMax = Math.max(this.velMax, m.velocity); }
    else if (m.type === "note-off") this.on.delete(`${m.channel}:${m.note}`);
    else if (m.type === "cc") { const c = this.ccs.get(m.cc) || { min: 127, max: 0, n: 0 }; c.min = Math.min(c.min, m.value); c.max = Math.max(c.max, m.value); c.n++; this.ccs.set(m.cc, c); }
    else if (m.type === "pitch-bend") { this.bendMin = Math.min(this.bendMin, m.value); this.bendMax = Math.max(this.bendMax, m.value); }
    return m;
  }
}

// ---------- raw HID / USB ----------
// reports: array of Uint8Array (same report ID). Classifies each byte so unknown controllers can be decoded by eye.
export function byteMap(reports) {
  const len = Math.max(0, ...reports.map(r => r.length)), out = [];
  for (let i = 0; i < len; i++) {
    const vals = reports.map(r => r[i]).filter(v => v !== undefined), set = new Set(vals);
    let changes = 0, inc = 0;
    for (let j = 1; j < vals.length; j++) if (vals[j] !== vals[j - 1]) { changes++; if (vals[j] === ((vals[j - 1] + 1) & 255)) inc++; }
    let kind = "constant";
    if (changes) kind = inc >= changes * 0.8 && changes > 5 ? "counter" : set.size <= 3 ? "flags" : set.size <= 16 ? "bitfield/enum" : "analog";
    out.push({ index: i, min: Math.min(...vals), max: Math.max(...vals), distinct: set.size, changes, kind });
  }
  return out;
}
export const USB_CLASSES = { 0x00: "Per-interface", 0x01: "Audio", 0x02: "Communications (CDC)", 0x03: "HID (human interface)", 0x05: "Physical", 0x06: "Image/Camera", 0x07: "Printer", 0x08: "Mass storage", 0x09: "Hub", 0x0A: "CDC data", 0x0B: "Smart card", 0x0E: "Video", 0x0F: "Personal healthcare", 0xE0: "Wireless controller (Bluetooth)", 0xEF: "Miscellaneous", 0xFE: "Application-specific (DFU etc.)", 0xFF: "Vendor-specific" };
export const usbClassName = c => USB_CLASSES[c] || `Class 0x${hex(c, 2)}`;
export const HID_USAGE_PAGES = { 0x01: "Generic Desktop", 0x02: "Simulation", 0x03: "VR", 0x04: "Sport", 0x05: "Game", 0x06: "Generic Device", 0x07: "Keyboard", 0x08: "LED", 0x09: "Button", 0x0B: "Telephony", 0x0C: "Consumer", 0x0D: "Digitizer", 0x0F: "Physical Interface", 0x14: "Auxiliary Display", 0xFF00: "Vendor-defined" };
export const GENERIC_DESKTOP_USAGES = { 0x01: "Pointer", 0x02: "Mouse", 0x04: "Joystick", 0x05: "Game Pad", 0x06: "Keyboard", 0x07: "Keypad", 0x08: "Multi-axis Controller" };
export const hidUsageName = (page, usage) => page === 1 ? (GENERIC_DESKTOP_USAGES[usage] || `usage 0x${hex(usage, 2)}`) : `usage 0x${hex(usage, 2)}`;
export function vendorName(vid) { const v = VENDORS[hex(vid)]; return v ? v[0] : ""; }

// Serial line splitter: feed chunks of text, get complete lines back.
export class LineBuffer {
  constructor() { this.buf = ""; }
  push(chunk) { this.buf += chunk; const parts = this.buf.split(/\r?\n/); this.buf = parts.pop(); return parts; }
}

// ---------- appliance sound / vibration signatures ----------
// In-place radix-2 FFT (arrays must be a power of two long).
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// Amplitude spectrum (a sine of amplitude A reads about A) using a Hann window over the largest power-of-two block.
export function magSpectrum(f32, sampleRate) {
  let n = 1; while (n * 2 <= f32.length) n *= 2;
  const re = new Float64Array(n), im = new Float64Array(n); let ws = 0;
  for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); re[i] = f32[i] * w; ws += w; }
  fft(re, im);
  const mags = new Float64Array(n / 2); for (let k = 0; k < n / 2; k++) mags[k] = Math.hypot(re[k], im[k]) / (ws / 2);
  return { mags, binHz: sampleRate / n, n };
}
export function avgSpectra(list) { const out = new Float64Array(list[0].mags.length); for (const s of list) for (let i = 0; i < out.length; i++) out[i] += s.mags[i] / list.length; return { mags: out, binHz: list[0].binHz, n: list[0].n }; }
export function spectralPeaks(sp, count = 3, minHz = 20) {
  const lo = Math.max(1, Math.ceil(minHz / sp.binHz)), m = sp.mags, found = [];
  for (let i = lo; i < m.length - 1; i++) if (m[i] > m[i - 1] && m[i] >= m[i + 1]) found.push({ hz: i * sp.binHz, mag: m[i], bin: i });
  found.sort((a, b) => b.mag - a.mag);
  const out = []; for (const f of found) { if (out.every(o => Math.abs(o.bin - f.bin) > 6)) out.push(f); if (out.length >= count) break; }
  return out.map(({ hz, mag }) => ({ hz, mag }));
}
export function bandShare(sp, hz, tolHz, minHz = 20) {   // fraction of the (above minHz) power within hz ± tolHz
  const lo = Math.ceil(minHz / sp.binHz); let tot = 0, band = 0;
  for (let i = lo; i < sp.mags.length; i++) { const p = sp.mags[i] ** 2; tot += p; if (Math.abs(i * sp.binHz - hz) <= tolHz) band += p; }
  return tot ? band / tot : 0;
}
export function spectralFlatness(sp, minHz = 20) {   // 1 = pure noise, near 0 = pure tone
  const lo = Math.ceil(minHz / sp.binHz); let lg = 0, ar = 0, n = 0;
  for (let i = lo; i < sp.mags.length; i++) { const p = sp.mags[i] ** 2 + 1e-18; lg += Math.log(p); ar += p; n++; }
  return n ? Math.exp(lg / n) / (ar / n) : 0;
}
// Mains hum: power at the 50 Hz or 60 Hz family (fundamental and 2nd-4th harmonics), as a share of everything above 20 Hz.
export function humCheck(sp) {
  const tol = Math.max(1.5, 2 * sp.binHz), fam = f => [1, 2, 3, 4].reduce((a, h) => a + bandShare(sp, f * h, tol), 0);
  const a = fam(50), b = fam(60);
  return a >= b ? { hz: 50, share: a } : { hz: 60, share: b };
}
// Summarise a recording (list of Float32Array frames from the microphone).
export function runSummary(frames, sampleRate) {
  const rms = frames.map(f => levelStats(f).rms), meanRms = mean(rms), sp = avgSpectra(frames.map(f => magSpectrum(f, sampleRate)));
  const peaks = spectralPeaks(sp, 4), hum = humCheck(sp);
  return {
    rmsDb: 20 * Math.log10(meanRms || 1e-9), peakDb: 20 * Math.log10(Math.max(...frames.map(f => levelStats(f).peak)) || 1e-9),
    wobble: meanRms ? stdev(rms) / meanRms : 0,          // how much the loudness wanders from frame to frame
    flatness: spectralFlatness(sp), peaks, dominantHz: peaks[0]?.hz || 0, tonal: peaks[0] ? bandShare(sp, peaks[0].hz, 3 * sp.binHz) : 0,
    hum, spectrum: sp,
  };
}
// Compare a running appliance with the quiet baseline. Returns plain-language findings, each {status, text}.
export function judgeAppliance(base, run) {
  const out = [], delta = run.rmsDb - base.rmsDb;
  if (delta < 6) out.push({ status: "FAIL", text: `Only ${delta.toFixed(1)} dB louder than the background: it isn't running, or the mic is too far away or the wrong input.` });
  else out.push({ status: "PASS", text: `Running is ${delta.toFixed(0)} dB louder than the background.` });
  if (delta >= 6) {
    if (run.wobble > 0.2) out.push({ status: "WARN", text: `Loudness varies a lot (${Math.round(run.wobble * 100)}%): stuttering, a rattle, loose part, or intermittent power.` });
    else out.push({ status: "PASS", text: `Steady sound (${Math.round(run.wobble * 100)}% variation).` });
    if (run.tonal > 0.5) out.push({ status: "INFO", text: `Mostly one tone at about ${run.dominantHz.toFixed(0)} Hz (${Math.round(run.tonal * 100)}% of the sound): a whine or hum, typical of a fast motor or fan.` });
    if (run.hum.share > 0.25 && run.hum.share > base.hum.share * 3) out.push({ status: "INFO", text: `Strong ${run.hum.hz} Hz mains hum (${Math.round(run.hum.share * 100)}%): normal for transformers and some heaters, a buzz if it shouldn't be there.` });
  }
  return out;
}
// samples: [{t (ms), v (magnitude of acceleration)}]. Returns shaking strength and its main frequency.
export function vibrationStats(samples, { minHz = 1 } = {}) {
  const n = samples.length; if (n < 20) return { rms: 0, hz: 0, n, rate: 0 };
  const m = mean(samples.map(s => s.v)), v = samples.map(s => s.v - m), t = samples.map(s => (s.t - samples[0].t) / 1000);
  const dts = t.slice(1).map((x, i) => x - t[i]).filter(d => d > 0), rate = dts.length ? 1 / median(dts) : 0, nyq = rate / 2;
  const rms = Math.sqrt(mean(v.map(x => x * x)));
  let best = 0, bestP = 0;
  for (let f = minHz; f < nyq; f += 0.25) { let c = 0, s = 0; for (let i = 0; i < n; i++) { const a = 2 * Math.PI * f * t[i]; c += v[i] * Math.cos(a); s += v[i] * Math.sin(a); } const p = c * c + s * s; if (p > bestP) { bestP = p; best = f; } }
  return { rms, hz: best, n, rate };
}
export const fieldStrength = (x, y, z) => Math.hypot(x, y, z);

// ---------- storage (USB drives, SSDs, SD cards) ----------
// Each test block starts with its own index (and the inverted index as a check), followed by a pseudo-random stream seeded from
// that index. Reading a block back therefore says both "is it intact?" and, if not, "which other block's data is this?"
// (which is how counterfeit drives that wrap around past their real size give themselves away).
export function fillBlock(buf, index) {
  const u = new Uint32Array(buf.buffer, buf.byteOffset, buf.byteLength >> 2);
  let x = (Math.imul(index + 1, 2654435761) ^ 0x9E3779B9) >>> 0 || 1;
  for (let i = 2; i < u.length; i++) { x = (x ^ (x << 13)) >>> 0; x ^= x >>> 17; x = (x ^ (x << 5)) >>> 0; u[i] = x; }
  u[0] = index >>> 0; u[1] = ~index >>> 0;
}
// Returns { ok, foundIndex, badWords }. foundIndex is the block number stored in the data (-1 if the header is garbage).
export function verifyBlock(buf, expectedIndex, scratch) {
  const u = new Uint32Array(buf.buffer, buf.byteOffset, buf.byteLength >> 2);
  const headerOk = u.length >= 2 && u[1] === (~u[0] >>> 0), found = headerOk ? u[0] : -1;
  if (found !== expectedIndex) return { ok: false, foundIndex: found, badWords: u.length };
  scratch = scratch && scratch.byteLength === buf.byteLength ? scratch : new Uint8Array(buf.byteLength);
  fillBlock(scratch, expectedIndex);
  const e = new Uint32Array(scratch.buffer, scratch.byteOffset, scratch.byteLength >> 2); let bad = 0;
  for (let i = 0; i < u.length; i++) if (u[i] !== e[i]) bad++;
  return { ok: bad === 0, foundIndex: found, badWords: bad };
}
// samples: [{bytes, ms}] in order. Merges them into windows of at least minMs, so one fast cached block can't dominate.
export function speedStats(samples, minMs = 500) {
  const wins = []; let b = 0, t = 0;
  for (const s of samples) { b += s.bytes; t += s.ms; if (t >= minMs) { wins.push(b / 1e6 / (t / 1000)); b = 0; t = 0; } }
  const totalBytes = samples.reduce((a, s) => a + s.bytes, 0), totalMs = samples.reduce((a, s) => a + s.ms, 0);
  const avg = totalMs ? totalBytes / 1e6 / (totalMs / 1000) : 0;
  let first = avg, last = avg, drop = 0;
  if (wins.length >= 6) { const k = Math.floor(wins.length / 3); first = mean(wins.slice(0, k)); last = mean(wins.slice(-k)); drop = first ? 1 - last / first : 0; }
  return { avg, min: wins.length ? Math.min(...wins) : avg, max: wins.length ? Math.max(...wins) : avg, first, last, drop, windows: wins.length };
}
export function rateStorage(writeMBs, readMBs) {
  const cls = readMBs >= 300 ? "fast USB 3 / SSD class" : readMBs >= 100 ? "good USB 3 class" : readMBs >= 30 ? "budget USB 3, or the USB 2 limit" : readMBs >= 10 ? "slow (USB 2 class)" : "very slow";
  const status = writeMBs < 3 || readMBs < 10 ? "FAIL" : writeMBs < 10 || readMBs < 25 ? "WARN" : "PASS";
  return { status, cls };
}
// After reading every block back: summarise integrity and capacity honesty. results: [{index, ok, foundIndex}] for every verified block.
export function integritySummary(results, blockBytes) {
  const bad = results.filter(r => !r.ok), wrongBlock = bad.filter(r => r.foundIndex >= 0 && r.foundIndex !== r.index), corrupt = bad.filter(r => r.foundIndex === r.index || r.foundIndex < 0);
  const jumps = wrongBlock.filter(r => r.foundIndex > r.index).map(r => r.foundIndex - r.index), wrapped = jumps.length ? Math.min(...jumps) * blockBytes : 0;
  return { total: results.length, good: results.length - bad.length, bad: bad.length, wrongBlocks: wrongBlock.length, corruptBlocks: corrupt.length, firstBad: bad.length ? bad[0].index : -1, realBytes: wrapped };
}

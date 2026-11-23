// Simulated devices for testing devices.html without hardware. Each install function patches the page's own `navigator`
// (pass the iframe window) the way the real browser API would look. Like mock-controller.js, this proves the page's logic is
// self-consistent; it can't prove every physical device behaves identically.

// ---------- gamepads (Gamepad API) ----------
export function installGamepad(W, { id = "Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)", mapping = "standard", buttons = 17, axes = 4, rumble = true } = {}) {
  const st = { axes: new Array(axes).fill(0), buttons: new Array(buttons).fill(0), ts: 1, hz: 120, timer: 0, effects: [], connected: true };
  const snapshot = () => ({
    index: 0, id, connected: st.connected, mapping, timestamp: Math.floor(performance.now() * st.hz / 1000), axes: [...st.axes],
    buttons: st.buttons.map(v => ({ pressed: v > 0.5, touched: v > 0, value: v })),
    vibrationActuator: rumble ? { playEffect: async (type, params) => { st.effects.push({ type, ...params }); return "complete"; } } : undefined,
  });
  Object.defineProperty(W.navigator, "getGamepads", { configurable: true, value: () => st.connected ? [snapshot()] : [null] });
  const api = {
    st,
    set(patch) { Object.assign(st, patch); },
    stick(which, x, y) { const o = which === "L" ? 0 : 2; st.axes[o] = x; st.axes[o + 1] = y; },
    trigger(which, v) { st.buttons[which === "L" ? 6 : 7] = v; },
    press(i, v = 1) { st.buttons[i] = v; },
    start(hz = 120) { st.hz = hz; },   // a new report timestamp every 1/hz seconds, derived from the clock so timer jitter can't skew it
    stop() { clearInterval(st.timer); },
    remove() { api.stop(); delete W.navigator.getGamepads; },
  };
  api.start(120); return api;
}

// ---------- audio / video streams ----------
export function installMedia(W, { audio = true, video = true, tone = 220, noise = 0.0005 } = {}) {
  const state = { streams: [], ac: null, calls: [] };
  const md = W.navigator.mediaDevices;
  const devices = [{ kind: "audioinput", deviceId: "mic1", label: "Mock Microphone" }, { kind: "audiooutput", deviceId: "spk1", label: "Mock Speakers" }, { kind: "videoinput", deviceId: "cam1", label: "Mock Camera" }];
  const gum = async c => {
    state.calls.push(c);
    const tracks = [];
    if (c.audio) {
      const ac = state.ac ||= new W.AudioContext(); await ac.resume();
      const dest = ac.createMediaStreamDestination(), osc = ac.createOscillator(), g = ac.createGain();
      osc.frequency.value = tone; g.gain.value = state.talk ? 0.3 : noise; osc.connect(g).connect(dest); osc.start(); state.gain = g; state.osc = osc;
      tracks.push(...dest.stream.getAudioTracks());
    }
    if (c.video) {
      const cv = W.document.createElement("canvas"); cv.width = 640; cv.height = 360; const g = cv.getContext("2d"); let f = 0;
      const draw = () => { f++; for (let y = 0; y < 360; y += 20) for (let x = 0; x < 640; x += 20) { g.fillStyle = `hsl(${(x + y + f * 3) % 360},${60 + (x % 40)}%,${30 + ((x * 7 + y * 3) % 50)}%)`; g.fillRect(x, y, 20, 20); } };
      draw(); state.drawTimer = setInterval(draw, 33);
      tracks.push(...cv.captureStream(30).getVideoTracks());
    }
    const s = new W.MediaStream(tracks); state.streams.push(s); return s;
  };
  Object.defineProperty(md, "getUserMedia", { configurable: true, value: gum });
  Object.defineProperty(md, "enumerateDevices", { configurable: true, value: async () => devices.filter(d => (audio || !d.kind.startsWith("audio")) && (video || d.kind !== "videoinput")) });
  state.setTalking = on => { state.talk = on; if (state.gain) state.gain.gain.value = on ? 0.3 : noise; };
  state.stop = () => { clearInterval(state.drawTimer); };
  return state;
}

// ---------- MIDI ----------
export function installMidi(W, { ports = 1 } = {}) {
  const mk = (name, extra = {}) => ({ id: name, name, manufacturer: "Mock Instruments", state: "connected", onmidimessage: null, sent: [], send(b) { this.sent.push([...b]); }, ...extra });
  const inputs = new Map(), outputs = new Map();
  for (let i = 0; i < ports; i++) { inputs.set("in" + i, mk("Mock Keys " + i)); outputs.set("out" + i, mk("Mock Synth " + i)); }
  const access = { inputs, outputs, onstatechange: null };
  Object.defineProperty(W.navigator, "requestMIDIAccess", { configurable: true, value: async () => access });
  return { access, play: (bytes) => { for (const i of inputs.values()) i.onmidimessage?.({ data: Uint8Array.from(bytes) }); } };
}

// ---------- HID ----------
export function installHid(W, { vendorId = 0x1234, productId = 0xabcd, productName = "Mock Arcade Stick" } = {}) {
  const listeners = new Set();
  const dev = {
    vendorId, productId, productName, opened: false,
    collections: [{ usagePage: 1, usage: 5 }],
    async open() { this.opened = true; }, async close() { this.opened = false; },
    addEventListener(t, f) { if (t === "inputreport") listeners.add(f); }, removeEventListener(t, f) { listeners.delete(f); },
  };
  let n = 0, timer = 0;
  const api = {
    dev, quiet: false,
    start(ms = 4) {
      clearInterval(timer);
      timer = setInterval(() => {
        if (api.quiet) return; n++;
        const b = new Uint8Array(8);
        b[0] = n & 255;                              // rolling counter
        b[1] = Math.floor((Math.sin(n / 7) * 0.5 + 0.5) * 255);   // analog axis
        b[2] = (n >> 4) & 1;                         // on/off flag
        b[3] = 5;                                    // constant
        b[4] = (n * 37) & 255;                       // noisy analog
        b[5] = 0; b[6] = 0; b[7] = 0;
        const ev = { reportId: 1, data: new DataView(b.buffer), timeStamp: performance.now() };
        for (const f of [...listeners]) f(ev);
      }, ms);
    },
    stop() { clearInterval(timer); },
  };
  Object.defineProperty(W.navigator, "hid", { configurable: true, value: { requestDevice: async () => [dev], getDevices: async () => [dev] } });
  api.start(); return api;
}

// ---------- serial, USB, Bluetooth LE ----------
export function installPorts(W) {
  const log = { baud: 0, written: [], closed: false };
  const port = {
    getInfo: () => ({ usbVendorId: 0x2341, usbProductId: 0x0043 }),
    async open(o) { log.baud = o.baudRate; log.closed = false; this.readable = new W.ReadableStream({ start: c => { this.t = setInterval(() => { try { c.enqueue(new W.TextEncoder().encode("temp=21.5\r\nhum=40\r\n")); } catch (_) {} }, 40); }, cancel: () => clearInterval(this.t) }); this.writable = new W.WritableStream({ write: ch => { log.written.push(new W.TextDecoder().decode(ch)); } }); },
    async close() { log.closed = true; clearInterval(this.t); },
  };
  Object.defineProperty(W.navigator, "serial", { configurable: true, value: { requestPort: async () => port, getPorts: async () => [port] } });

  const usbDev = {
    vendorId: 0x046d, productId: 0xc52b, productName: "Mock USB Receiver", manufacturerName: "Mock Co", serialNumber: "SN123", usbVersionMajor: 2, usbVersionMinor: 0, deviceClass: 0,
    configurations: [{ configurationValue: 1, interfaces: [{ interfaceNumber: 0, alternates: [{ interfaceClass: 3, endpoints: [{ direction: "in", type: "interrupt" }] }] }] }],
    async open() { throw new DOMException("Access denied", "SecurityError"); }, async close() {},
  };
  Object.defineProperty(W.navigator, "usb", { configurable: true, value: { requestDevice: async () => usbDev, getDevices: async () => [usbDev] } });

  const chr = bytes => ({ readValue: async () => new DataView(Uint8Array.from(bytes).buffer) });
  const svcs = { battery_service: { getCharacteristic: async () => chr([73]) }, device_information: { getCharacteristic: async u => chr([...new TextEncoder().encode(u === "manufacturer_name_string" ? "Acme" : u === "model_number_string" ? "X1" : "1.0.2")]) } };
  const ble = { name: "Mock Gadget", gatt: { connect: async () => ({ getPrimaryService: async s => svcs[s] }), disconnect() {} } };
  Object.defineProperty(W.navigator, "bluetooth", { configurable: true, value: { requestDevice: async () => ble } });
  return { port, log, usbDev, ble };
}

// ---------- phone sensors ----------
export function installSensors(W, { magnetometer = true } = {}) {
  const state = { motionTimer: 0, shake: 0, hz: 12, field: 48, started: 0 };
  state.startMotion = (shake, hz) => {   // shake = amplitude in m/s², hz = vibration frequency; events at ~60 Hz like a phone
    clearInterval(state.motionTimer); const t0 = performance.now();
    state.motionTimer = setInterval(() => { const t = (performance.now() - t0) / 1000, a = shake * Math.sin(2 * Math.PI * hz * t); W.dispatchEvent(Object.assign(new W.Event("devicemotion"), { accelerationIncludingGravity: { x: 0.1, y: 0.2, z: 9.81 + a }, interval: 16 })); }, 16);
  };
  state.stopMotion = () => clearInterval(state.motionTimer);
  if (magnetometer) W.Magnetometer = class { constructor() { this.x = 0; this.y = 0; this.z = 0; } start() { this.t = setInterval(() => { const f = state.field; this.x = f * 0.6; this.y = f * 0.64; this.z = f * 0.48; this.onreading && this.onreading(); }, 30); } stop() { clearInterval(this.t); } };
  else delete W.Magnetometer;
  return state;
}

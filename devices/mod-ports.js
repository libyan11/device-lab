// Serial (Arduino, ESP32, USB-serial adapters), generic USB, and Bluetooth LE devices.
import { LineBuffer, hex, usbClassName, vendorName } from "./core.js";

let port = null, reader = null, closing = null;

async function closePort() {
  if (!port) return;
  try { await reader?.cancel(); } catch (_) {}
  try { await closing; } catch (_) {}
  try { await port.close(); } catch (_) {}
  port = null; reader = null;
}

export default {
  id: "ports", title: "Serial / USB / BLE",
  blurb: "Identify and talk to hardware that isn't a standard controller: serial boards (Arduino, ESP32, GPS, USB-serial adapters), any USB device (descriptors), and Bluetooth LE gadgets (battery level and device info).",
  supported: () => (navigator.serial || navigator.usb || navigator.bluetooth) ? true : "This browser has no Web Serial, WebUSB or Web Bluetooth (use Chrome or Edge).",

  mount(root, ctx) {
    const has = (api, label) => navigator[api] ? "" : ` disabled title="${label} not available in this browser"`;
    root.innerHTML = `
      <h3 style="margin-top:0">Serial port</h3>
      <div class="row"><label>Baud <select id="spBaud">${[9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600].map(b => `<option${b === 115200 ? " selected" : ""}>${b}</option>`).join("")}</select></label>
        <button id="spConnect"${has("serial", "Web Serial")}>Connect serial device…</button><button id="spClose" class="secondary hidden">Disconnect</button><span class="detail" id="spStatus"></span></div>
      <div id="spBox" class="hidden"><pre id="spOut" style="min-height:70px">Waiting for data…</pre>
        <div class="row"><input type="text" id="spIn" placeholder="Type a line to send" aria-label="Line to send" style="flex:1"><button id="spSend" class="secondary">Send</button><button id="spRecord">Record serial result</button></div></div>

      <h3>USB device</h3>
      <div class="row"><button id="usbPick"${has("usb", "WebUSB")}>Inspect a USB device…</button><span class="detail">Some devices (e.g. those Windows has claimed as HID, storage or audio) can't be opened by the browser, but their descriptors still show.</span></div>
      <div id="usbOut"></div>

      <h3>Bluetooth LE</h3>
      <div class="row"><button id="btPick"${has("bluetooth", "Web Bluetooth")}>Scan &amp; connect to a BLE device…</button><span class="detail" id="btStatus"></span></div>
      <div id="btOut"></div>`;
    const $ = id => root.querySelector("#" + id);

    // ---- serial ----
    let lines = 0, t0 = 0, bytes = 0; const lb = new LineBuffer();
    $("spConnect").onclick = async () => {
      try {
        await closePort();
        port = await navigator.serial.requestPort();
        const info = port.getInfo ? port.getInfo() : {}, baud = +$("spBaud").value;
        await port.open({ baudRate: baud });
        const id = info.usbVendorId !== undefined ? `${hex(info.usbVendorId)}:${hex(info.usbProductId || 0)}${vendorName(info.usbVendorId) ? " (" + vendorName(info.usbVendorId) + ")" : ""}` : "unknown (not USB)";
        $("spStatus").textContent = `Open: ${id} at ${baud} baud`; $("spBox").classList.remove("hidden"); $("spClose").classList.remove("hidden");
        $("spOut").textContent = ""; lines = 0; bytes = 0; t0 = performance.now();
        ctx.result("PASS", "Serial port opens", `${id} at ${baud} baud`, "open");
        const dec = new TextDecoderStream(); closing = port.readable.pipeTo(dec.writable).catch(() => {});
        reader = dec.readable.getReader();
        (async () => {
          try { for (;;) { const { value, done } = await reader.read(); if (done) break; bytes += value.length; for (const l of lb.push(value)) { lines++; $("spOut").textContent = ($("spOut").textContent + l + "\n").split("\n").slice(-200).join("\n"); $("spOut").scrollTop = 1e9; } } } catch (_) {}
        })();
      } catch (e) { ctx.result(e.name === "NotFoundError" ? "INFO" : "FAIL", "Serial port opens", `${e.name}: ${e.message}${e.name === "NetworkError" ? " (the port may be in use by another program)" : ""}`, "open"); }
    };
    $("spClose").onclick = async () => { await closePort(); $("spStatus").textContent = "Disconnected."; $("spClose").classList.add("hidden"); };
    $("spSend").onclick = async () => {
      if (!port?.writable) return; const w = port.writable.getWriter(); try { await w.write(new TextEncoder().encode($("spIn").value + "\n")); } finally { w.releaseLock(); }
    };
    $("spRecord").onclick = () => {
      const secs = (performance.now() - t0) / 1000;
      ctx.result(bytes ? "PASS" : "WARN", "Serial data", bytes ? `${bytes} bytes, ${lines} lines in ${secs.toFixed(1)}s (${(bytes / secs).toFixed(0)} B/s).` : "Nothing received. Check the baud rate, or the device may only reply when sent something.", "data");
    };

    // ---- USB ----
    $("usbPick").onclick = async () => {
      try {
        const d = await navigator.usb.requestDevice({ filters: [] });
        const rows = [["Product", d.productName || "?"], ["Manufacturer", d.manufacturerName || "?"], ["Serial", d.serialNumber || "?"], ["ID", `${hex(d.vendorId)}:${hex(d.productId)}${vendorName(d.vendorId) ? " · " + vendorName(d.vendorId) : ""}`],
          ["USB version", `${d.usbVersionMajor}.${d.usbVersionMinor}`], ["Device class", usbClassName(d.deviceClass)]];
        const cfgs = (d.configurations || []).map(c => `Config ${c.configurationValue}: ` + c.interfaces.map(i => { const a = i.alternates[0]; return `interface ${i.interfaceNumber} = ${usbClassName(a.interfaceClass)} (${a.endpoints.length} endpoints: ${a.endpoints.map(e => `${e.direction} ${e.type}`).join(", ")})`; }).join("; "));
        $("usbOut").innerHTML = `<table>${rows.map(([k, v]) => `<tr><th style="width:140px">${k}</th><td>${ctx.esc(v)}</td></tr>`).join("")}${cfgs.map(c => `<tr><th>Layout</th><td class="detail">${ctx.esc(c)}</td></tr>`).join("")}</table>`;
        ctx.result("INFO", "USB device", `${d.productName || "device"} (${hex(d.vendorId)}:${hex(d.productId)}), ${usbClassName(d.deviceClass)}, USB ${d.usbVersionMajor}.${d.usbVersionMinor}${d.usbVersionMajor < 2 ? ". USB 1.x: very slow" : ""}`, "usb");
        try { await d.open(); await d.close(); ctx.result("PASS", "USB device opens", "The browser could open and release the device.", "usb-open"); }
        catch (e) { ctx.result("INFO", "USB device opens", `Not openable from the browser (${e.name}); normal for devices Windows has claimed with its own driver.`, "usb-open"); }
      } catch (e) { if (e.name !== "NotFoundError") ctx.result("FAIL", "USB chooser", `${e.name}: ${e.message}`, "usb"); }
    };

    // ---- Bluetooth LE ----
    $("btPick").onclick = async () => {
      try {
        const d = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ["battery_service", "device_information"] });
        $("btStatus").textContent = `Connecting to ${d.name || "device"}…`;
        const server = await d.gatt.connect(); const out = [`<tr><th style="width:140px">Name</th><td>${ctx.esc(d.name || "(unnamed)")}</td></tr>`];
        let battery = null;
        try { const s = await server.getPrimaryService("battery_service"), c = await s.getCharacteristic("battery_level"); battery = (await c.readValue()).getUint8(0); out.push(`<tr><th>Battery</th><td>${battery}%</td></tr>`); } catch (_) { out.push(`<tr><th>Battery</th><td class="detail">Not reported by this device</td></tr>`); }
        try {
          const s = await server.getPrimaryService("device_information");
          for (const [n, u] of [["Manufacturer", "manufacturer_name_string"], ["Model", "model_number_string"], ["Firmware", "firmware_revision_string"]]) { try { const c = await s.getCharacteristic(u); out.push(`<tr><th>${n}</th><td>${ctx.esc(new TextDecoder().decode(await c.readValue()))}</td></tr>`); } catch (_) {} }
        } catch (_) {}
        $("btOut").innerHTML = `<table>${out.join("")}</table>`; $("btStatus").textContent = "";
        ctx.result("PASS", "Bluetooth LE connects", `${d.name || "device"} connected over GATT.`, "ble");
        if (battery !== null) ctx.result(battery >= 50 ? "PASS" : battery >= 20 ? "WARN" : "FAIL", "BLE battery", `${battery}% charge reported.`, "ble-battery");
        d.gatt.disconnect();
      } catch (e) { $("btStatus").textContent = ""; if (e.name !== "NotFoundError") ctx.result("FAIL", "Bluetooth LE", `${e.name}: ${e.message}`, "ble"); }
    };
  },

  unmount() { closePort(); },
};

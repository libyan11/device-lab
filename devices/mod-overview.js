// Overview: which browser APIs are available, and what's already plugged in.
import { parseGamepadId, hex } from "./core.js";

export default {
  id: "overview", title: "Overview",
  blurb: "What this browser can test, and what it can already see plugged in. Browsers only reveal some devices after you grant access on the matching tab.",
  supported: () => true,

  mount(root, ctx) {
    root.innerHTML = `
      <div class="row"><button id="ovRefresh">Refresh</button><span class="detail" id="ovNote"></span></div>
      <div class="tablewrap" style="overflow-x:auto"><table><thead><tr><th>Test</th><th>Browser support</th><th>Plugged in</th><th></th></tr></thead><tbody id="ovRows"></tbody></table></div>
      <p class="detail">PlayStation controllers work in the Gamepads tab for the basic tests. The separate PlayStation Controller Checker adds the genuine-vs-clone checks.</p>`;
    const $ = id => root.querySelector("#" + id);
    const yes = ok => ok ? `<span class="PASS">yes</span>` : `<span class="FAIL">no</span>`;

    async function scan() {
      const rows = [];
      const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
      rows.push(["gamepad", "Gamepads", !!navigator.getGamepads, pads.length ? pads.map(p => parseGamepadId(p.id).name).join(", ") : "none seen (press a button on a controller)"]);
      rows.push(["keyboard", "Keyboard", true, "always"]);
      rows.push(["mouse", "Mouse / trackpad", true, "always"]);
      rows.push(["touch", "Touch & pen", true, navigator.maxTouchPoints ? `${navigator.maxTouchPoints} touch points` : "no touchscreen reported"]);
      let ad = "unknown", vd = "unknown";
      try { const d = await navigator.mediaDevices.enumerateDevices(); ad = `${d.filter(x => x.kind === "audioinput").length} mic(s), ${d.filter(x => x.kind === "audiooutput").length} output(s)`; vd = `${d.filter(x => x.kind === "videoinput").length} camera(s)`; } catch (_) {}
      rows.push(["audio", "Microphone & speakers", !!navigator.mediaDevices?.getUserMedia, ad]);
      rows.push(["camera", "Camera", !!navigator.mediaDevices?.getUserMedia, vd]);
      rows.push(["midi", "MIDI", !!navigator.requestMIDIAccess, "grant access on the MIDI tab"]);
      let h = "grant access on the tab"; try { if (navigator.hid) { const d = await navigator.hid.getDevices(); h = d.length ? d.map(x => `${x.productName || "HID"} (${hex(x.vendorId)}:${hex(x.productId)})`).join(", ") : "none allowed yet"; } } catch (_) {}
      rows.push(["hid", "Raw HID", !!navigator.hid, h]);
      let p = "grant access on the tab"; try { const s = navigator.serial ? (await navigator.serial.getPorts()).length : 0, u = navigator.usb ? (await navigator.usb.getDevices()).length : 0; if (navigator.serial || navigator.usb) p = `${s} serial port(s), ${u} USB device(s) already allowed`; } catch (_) {}
      rows.push(["ports", "Serial / USB / Bluetooth LE", !!(navigator.serial || navigator.usb || navigator.bluetooth), p + (navigator.bluetooth ? "" : "")]);
      rows.push(["appliance", "Appliances (hair dryer, fan, vacuum…)", !!navigator.mediaDevices?.getUserMedia, "by sound; phone sensors for vibration and magnetic field" + (typeof Magnetometer !== "undefined" ? "" : " (no magnetometer here)")]);
      rows.push(["display", "Display", true, `${screen.width}×${screen.height} @${devicePixelRatio}x`]);
      $("ovRows").innerHTML = rows.map(([id, name, ok, plugged]) => `<tr><td>${ctx.esc(name)}</td><td>${yes(ok)}</td><td class="detail">${ctx.esc(plugged)}</td><td><button class="secondary" data-go="${id}">Open</button></td></tr>`).join("");
      $("ovRows").querySelectorAll("[data-go]").forEach(b => b.onclick = () => window.deviceLab.select(b.dataset.go));
      let bat = ""; try { if (navigator.getBattery) { const b = await navigator.getBattery(); bat = ` · this device's battery: ${Math.round(b.level * 100)}%${b.charging ? " (charging)" : ""}`; } } catch (_) {}
      $("ovNote").textContent = `${window.isSecureContext ? "Secure context" : "NOT a secure context (USB/HID/serial/camera need https:// or localhost)"}${bat}`;
      ctx.result("INFO", "Browser capabilities", rows.filter(r => r[2]).map(r => r[1]).join(", ") + " supported", "caps");
    }
    $("ovRefresh").onclick = scan; scan();
    window.addEventListener("gamepadconnected", scan);
  },
};

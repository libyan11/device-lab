// Raw HID inspector: works with any HID device (unknown controllers, flight sticks, wheels, pedals, arcade sticks, keypads).
// Shows what the device is, its report rate, and which bytes of its input report change, so you can decode an unknown layout by eye.
import { byteMap, hex, vendorName, HID_USAGE_PAGES, hidUsageName, median } from "./core.js";

let dev = null, onReport = null, tmr = 0;

export default {
  id: "hid", title: "Raw HID",
  blurb: "For any USB/Bluetooth HID device the Gamepad tab doesn't understand. Pick the device, press Start, then wiggle every stick, button and slider. Bytes that change are classified as buttons, analog axes or counters.",
  supported: () => navigator.hid ? true : "This browser has no WebHID (use Chrome or Edge, from https:// or http://localhost).",

  mount(root, ctx) {
    root.innerHTML = `
      <div class="row"><button id="hdPick">Choose HID device…</button><button id="hdKnown" class="secondary">Show already-allowed devices</button><span class="detail" id="hdStatus"></span></div>
      <div id="hdList"></div>
      <div id="hdMon" class="hidden">
        <div class="row"><button id="hdStart">Start monitoring</button><button id="hdStop" class="secondary" disabled>Stop &amp; record</button><span class="detail" id="hdRate"></span></div>
        <div class="tablewrap" style="overflow-x:auto"><table id="hdMap"></table></div>
        <h3>Latest report</h3><pre id="hdLast">–</pre>
      </div>`;
    const $ = id => root.querySelector("#" + id);
    let reports = [], times = [], reportId = null, t0 = 0;

    function describe(d) {
      const cols = (d.collections || []).map(c => `${HID_USAGE_PAGES[c.usagePage] || "page 0x" + hex(c.usagePage)} / ${hidUsageName(c.usagePage, c.usage)}`).join("; ");
      return `<b>${ctx.esc(d.productName || "HID device")}</b> <span class="detail">${hex(d.vendorId)}:${hex(d.productId)}${vendorName(d.vendorId) ? " · " + ctx.esc(vendorName(d.vendorId)) : ""} · ${ctx.esc(cols || "no collections")}${d.opened ? " · open" : ""}</span>`;
    }
    function listDevices(devs) {
      const box = $("hdList"); box.innerHTML = "";
      if (!devs.length) { box.innerHTML = `<p class="detail">No devices selected.</p>`; return; }
      devs.forEach((d, i) => {
        const r = document.createElement("div"); r.className = "row note"; r.style.justifyContent = "space-between";
        r.innerHTML = `<span>${describe(d)}</span>`; const b = document.createElement("button"); b.textContent = "Use this"; b.className = "secondary"; b.dataset.use = i;
        b.onclick = () => use(d); r.appendChild(b); box.appendChild(r);
      });
      ctx.result("INFO", "HID devices", devs.map(d => `${d.productName || "HID"} (${hex(d.vendorId)}:${hex(d.productId)})`).join("; "), "devices");
      if (devs.length === 1) use(devs[0]);
    }
    function use(d) { dev = d; $("hdMon").classList.remove("hidden"); $("hdStatus").textContent = `Selected ${d.productName || "device"}.`; }

    $("hdPick").onclick = async () => { try { listDevices(await navigator.hid.requestDevice({ filters: [] })); } catch (e) { ctx.result("FAIL", "HID chooser", `${e.name}: ${e.message}`, "chooser"); } };
    $("hdKnown").onclick = async () => { try { listDevices(await navigator.hid.getDevices()); } catch (e) { ctx.result("FAIL", "HID list", e.message, "list"); } };

    function render() {
      if (!reports.length) return;
      const secs = (performance.now() - t0) / 1000;
      $("hdRate").textContent = `${reports.length} reports in ${secs.toFixed(1)}s (${(reports.length / secs).toFixed(0)}/s) · report ID ${reportId}`;
      const map = byteMap(reports);
      $("hdMap").innerHTML = `<tr><th>Byte</th><th>Kind</th><th>Min</th><th>Max</th><th>Distinct</th></tr>` + map.map(b => `<tr><td class="mono">${b.index}</td><td class="${b.kind === "constant" ? "INFO" : "PASS"}">${b.kind}</td><td class="mono">${b.min}</td><td class="mono">${b.max}</td><td class="mono">${b.distinct}</td></tr>`).join("");
      $("hdLast").textContent = [...reports.at(-1)].map(v => v.toString(16).padStart(2, "0")).join(" ");
    }
    $("hdStart").onclick = async () => {
      if (!dev) return;
      try { if (!dev.opened) await dev.open(); } catch (e) { ctx.result("FAIL", "HID open", `${e.name}: ${e.message}. Close Steam/other apps that may hold the device.`, "open"); return; }
      reports = []; times = []; reportId = null; t0 = performance.now();
      onReport = ev => {
        if (reportId === null) reportId = ev.reportId; if (ev.reportId !== reportId) return;
        reports.push(new Uint8Array(ev.data.buffer, ev.data.byteOffset, ev.data.byteLength).slice()); times.push(ev.timeStamp);
        if (reports.length > 5000) { reports.shift(); times.shift(); }
      };
      dev.addEventListener("inputreport", onReport); tmr = setInterval(render, 400);
      $("hdStart").disabled = true; $("hdStop").disabled = false;
    };
    $("hdStop").onclick = () => {
      clearInterval(tmr); dev.removeEventListener("inputreport", onReport); render();
      $("hdStart").disabled = false; $("hdStop").disabled = true;
      const name = dev.productName || "HID device";
      if (!reports.length) { ctx.result("WARN", `${name} input reports`, "No input reports arrived. The device may only send data when something changes, or it may not be an input device. Move/press something while monitoring.", "reports"); return; }
      const secs = (times.at(-1) - times[0]) / 1000 || 1, map = byteMap(reports);
      const dts = times.slice(1).map((t, i) => t - times[i]).filter(x => x > 0);
      const active = map.filter(b => b.kind !== "constant"), analog = map.filter(b => b.kind === "analog"), counters = map.filter(b => b.kind === "counter");
      ctx.result(active.length ? "PASS" : "WARN", `${name} input reports`, `${reports.length} reports (${(reports.length / secs).toFixed(0)}/s, median gap ${median(dts).toFixed(1)} ms), report ID ${reportId}, ${map.length} bytes: ${active.length} change (${analog.length} analog, ${counters.length} counter), ${map.length - active.length} constant.${active.length ? "" : " Nothing changed; did you move or press anything?"}`, "reports");
    };
  },

  unmount() { clearInterval(tmr); if (dev && onReport) { try { dev.removeEventListener("inputreport", onReport); } catch (_) {} } onReport = null; },
};

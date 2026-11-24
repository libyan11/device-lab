// USB flash drives, SSDs, SD cards, external disks: real read/write speed, data integrity, and a counterfeit-capacity check.
// It writes known test data into a NEW folder it creates inside the folder you pick, reads every block back and verifies it,
// then deletes only what it created. Nothing else on the drive is touched.
import { fillBlock, verifyBlock, speedStats, rateStorage, integritySummary } from "./core.js";

const BLOCK = 4 * 1024 * 1024;          // 4 MiB per test block
let stopFlag = false;

export default {
  id: "storage", title: "Storage",
  blurb: "Test a USB drive, SSD or SD card: write speed, read speed, whether the data comes back intact, and (in fill mode) whether the drive really has the capacity it claims. Counterfeit drives report a big size but quietly overwrite old data once the real chips are full.",
  supported: () => typeof window.showDirectoryPicker === "function" ? true : "This browser can't write to folders (use Chrome or Edge on a computer).",

  mount(root, ctx) {
    root.innerHTML = `
      <div class="note" style="margin-top:0"><b>Before you start:</b> make an empty folder on the drive you want to test (for example <span class="mono">E:\\speedtest</span>) and choose that folder. Browsers refuse to open a drive's root. The test only creates and deletes files inside a temporary sub-folder of it. Leave the drive plugged in until it finishes.</div>
      <div class="row"><button id="stPick">Choose folder on the drive…</button><span id="stFolder" class="detail">No folder chosen.</span></div>
      <div class="row"><label>Test size <select id="stSize" aria-label="Test size">
        <option value="16">Tiny: 16 MB (seconds)</option><option value="256" selected>Quick: 256 MB</option><option value="1024">Standard: 1 GB</option><option value="4096">Thorough: 4 GB</option>
        <option value="fill">Fill all free space (fake-capacity check; slow)</option></select></label>
        <button id="stStart" disabled>Start test</button><button id="stStop" class="secondary" disabled>Stop</button></div>
      <p class="detail" id="stFillNote" style="margin-top:0">Sizes below "fill" check speed and integrity of the data written, but <b>can't prove capacity</b>. Fill mode writes until the drive is full, then reads everything back; on a large drive this can take hours. Do <b>not</b> use fill mode on your main system drive.</p>
      <div class="bar"><b id="stPhase">Idle</b><div class="meter"><div id="stMeter"></div></div><span class="mono" id="stSpeed">–</span></div>
      <div class="detail" id="stStatus"></div>`;
    const $ = id => root.querySelector("#" + id);
    let dir = null;

    $("stPick").onclick = async () => {
      try { dir = await window.showDirectoryPicker({ mode: "readwrite", id: "devicelab-storage" }); $("stFolder").textContent = `Folder: ${dir.name}`; $("stStart").disabled = false; }
      catch (e) { if (e.name !== "AbortError") ctx.result("FAIL", "Folder access", `${e.name}: ${e.message}${/system|root/i.test(e.message) ? " Pick a normal folder on the drive, not its root." : ""}`, "folder"); }
    };
    $("stStop").onclick = () => { stopFlag = true; $("stStatus").textContent = "Stopping after the current block…"; };

    const setBusy = on => { $("stStart").disabled = on || !dir; $("stPick").disabled = on; $("stSize").disabled = on; $("stStop").disabled = !on; };
    const phase = (name, frac, speed) => { $("stPhase").textContent = name; $("stMeter").style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + "%"; if (speed !== undefined) $("stSpeed").textContent = speed.toFixed(0) + " MB/s"; };
    const yieldUI = () => new Promise(r => setTimeout(r, 0));

    $("stStart").onclick = async () => {
      const fill = $("stSize").value === "fill", targetBlocks = fill ? Infinity : Math.max(2, Math.round(+$("stSize").value * 1024 * 1024 / BLOCK));
      if (fill && !confirm("Fill mode writes test data until the drive is completely full, then deletes it. Only continue if this is the drive you mean to test, and not your system drive. Continue?")) return;
      stopFlag = false; setBusy(true); $("stSpeed").textContent = "–";
      const stamp = `devicelab-test-${Date.now()}`; let sub = null;
      try {
        sub = await dir.getDirectoryHandle(stamp, { create: true });
        const fileBlocks = targetBlocks <= 16 ? 2 : 8, files = []; let written = 0, writeFail = null;
        const buf = new Uint8Array(BLOCK), wSamples = [];

        // ---- write ----
        outer: for (let f = 0; written < targetBlocks; f++) {
          if (stopFlag) break;
          const name = `blk-${String(f).padStart(6, "0")}.bin`, fh = await sub.getFileHandle(name, { create: true });
          let w = null, inFile = 0;
          try {
            w = await fh.createWritable();
            while (inFile < fileBlocks && written + inFile < targetBlocks) {
              if (stopFlag) break;
              fillBlock(buf, written + inFile);
              const t0 = performance.now(); await w.write(buf); const ms = performance.now() - t0;
              wSamples.push({ bytes: BLOCK, ms }); inFile++;
              phase("Writing", fill ? 0 : (written + inFile) / targetBlocks, BLOCK / 1e6 / (Math.max(ms, 0.01) / 1000)); $("stStatus").textContent = `Wrote ${((written + inFile) * BLOCK / 1048576).toFixed(0)} MB…`;
              if (inFile % 4 === 0) await yieldUI();
            }
            const t0 = performance.now(); await w.close(); w = null;
            const closeMs = performance.now() - t0; if (wSamples.length) wSamples[wSamples.length - 1].ms += closeMs;   // the flush at close is part of writing
            files.push({ name, blocks: inFile, first: written }); written += inFile;
          } catch (e) { writeFail = e; try { await w?.abort(); } catch (_) {} break outer; }
          if (inFile === 0) break;
        }
        const committed = files.reduce((a, f) => a + f.blocks, 0);
        const wst = speedStats(wSamples);
        if (committed < 2 && !writeFail) { ctx.result("INFO", "Storage test", "Stopped before enough data was written to measure anything.", "stopped"); return; }

        // ---- read back and verify ----
        const results = [], rSamples = [], scratch = new Uint8Array(BLOCK); let readFail = null;
        verify: for (const f of files) {
          const file = await (await sub.getFileHandle(f.name)).getFile();
          for (let b = 0; b < f.blocks; b++) {
            if (stopFlag) break verify;
            const t0 = performance.now(); let ab;
            try { ab = await file.slice(b * BLOCK, (b + 1) * BLOCK).arrayBuffer(); } catch (e) { readFail = e; break verify; }
            const ms = performance.now() - t0; rSamples.push({ bytes: BLOCK, ms });
            const v = verifyBlock(new Uint8Array(ab), f.first + b, scratch); results.push({ index: f.first + b, ok: v.ok, foundIndex: v.foundIndex });
            phase("Verifying", results.length / committed, BLOCK / 1e6 / (Math.max(ms, 0.01) / 1000)); if (b % 4 === 3) await yieldUI();
          }
        }
        const rst = speedStats(rSamples), sum = integritySummary(results, BLOCK), mb = n => (n * BLOCK / 1048576);

        // ---- report ----
        const rate = rateStorage(wst.avg, rst.avg);
        ctx.result(rate.status, "Write speed", `${wst.avg.toFixed(0)} MB/s average (slowest stretch ${wst.min.toFixed(0)}, fastest ${wst.max.toFixed(0)}), over ${mb(committed).toFixed(0)} MB.`, "write");
        ctx.result(rate.status, "Read speed", `${rst.avg.toFixed(0)} MB/s average: ${rate.cls}. Data just written may be served from your computer's memory cache, so very small tests can read faster than the drive really is; use 1 GB or more for a fair read figure.`, "read");
        if (wst.windows >= 6) ctx.result(wst.drop > 0.5 ? "WARN" : "PASS", "Sustained speed", wst.drop > 0.5 ? `Write speed fell from ${wst.first.toFixed(0)} to ${wst.last.toFixed(0)} MB/s (${Math.round(wst.drop * 100)}% drop): the drive's fast cache ran out, or it overheated. Common on cheap drives; real big transfers will be this slow.` : `Held steady (${wst.first.toFixed(0)} → ${wst.last.toFixed(0)} MB/s).`, "sustained");
        if (sum.total) {
          if (sum.bad === 0) ctx.result("PASS", "Data integrity", `All ${sum.total} blocks (${mb(sum.total).toFixed(0)} MB) came back exactly as written.`, "integrity");
          else if (sum.wrongBlocks > 0) ctx.result("FAIL", "Data integrity", `${sum.wrongBlocks} blocks contain data from a different place: the drive is overwriting its own data. First wrong block at ${mb(sum.firstBad).toFixed(0)} MB.`, "integrity");
          else ctx.result("FAIL", "Data integrity", `${sum.corruptBlocks} of ${sum.total} blocks came back corrupted (first at ${mb(sum.firstBad).toFixed(0)} MB). The drive, its cable or its port is faulty. Do not trust it with data you care about.`, "integrity");
        }
        if (fill || writeFail) {
          if (sum.wrongBlocks > 0) ctx.result("FAIL", "Capacity", `COUNTERFEIT: the drive accepted ${mb(committed).toFixed(0)} MB but older data was overwritten. Its real capacity is only about ${(sum.realBytes / 1048576).toFixed(0)} MB.`, "capacity");
          else if (sum.bad === 0 && sum.total) ctx.result("PASS", "Capacity", `The drive held ${mb(committed).toFixed(0)} MB (${(committed * BLOCK / 1e9).toFixed(1)} GB) with every block intact${writeFail ? ", then reported it was full" : ""}. Compare that with the size on the label; a few % less is normal formatting overhead.`, "capacity");
          else ctx.result("WARN", "Capacity", "Couldn't confirm capacity because some data came back corrupted.", "capacity");
        } else ctx.result("INFO", "Capacity", "Not tested at this size. Choose \"Fill all free space\" to check the drive really holds what its label says.", "capacity");
        if (writeFail && !fill) ctx.result("WARN", "Writing stopped early", `${writeFail.name}: ${writeFail.message}. The drive may be full or write-protected.`, "writefail");
        if (readFail) ctx.result("FAIL", "Reading back", `${readFail.name}: ${readFail.message}. The drive stopped answering mid-test.`, "readfail");

        // ---- many small files ----
        if (!stopFlag && !writeFail && !readFail) {
          const small = await sub.getDirectoryHandle("small", { create: true }), N = 60, sb = new Uint8Array(4096); let t0 = performance.now(), bad = 0;
          for (let i = 0; i < N; i++) { fillBlock(sb, i); const w = await (await small.getFileHandle(`f${i}.bin`, { create: true })).createWritable(); await w.write(sb); await w.close(); if (i % 10 === 9) phase("Small files", i / N); }
          const wOps = N / ((performance.now() - t0) / 1000); t0 = performance.now();
          for (let i = 0; i < N; i++) { const ab = await (await (await small.getFileHandle(`f${i}.bin`)).getFile()).arrayBuffer(); if (!verifyBlock(new Uint8Array(ab), i).ok) bad++; }
          const rOps = N / ((performance.now() - t0) / 1000);
          ctx.result(bad ? "FAIL" : wOps >= 30 ? "PASS" : wOps >= 8 ? "WARN" : "FAIL", "Small files", `${wOps.toFixed(0)} files/s written, ${rOps.toFixed(0)} files/s read (4 KB each)${bad ? `; ${bad} came back wrong` : ""}. ${wOps < 30 ? "Slow with many small files, which makes copying photos or code folders painful." : "Fine for everyday use."}`, "small");
        }
      } catch (e) {
        ctx.result("FAIL", "Storage test", `${e.name}: ${e.message}`, "error");
      } finally {
        phase("Cleaning up", 1);
        try { if (sub) await dir.removeEntry(sub.name, { recursive: true }); } catch (e) { ctx.result("WARN", "Cleanup", `Couldn't delete the temporary folder "${sub.name}" (${e.name}). Delete it by hand.`, "cleanup"); }
        phase("Done", 1); $("stStatus").textContent = ""; setBusy(false);
      }
    };
  },
};

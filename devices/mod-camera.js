// Webcam / any video input device.
import { frameStats, frameDiff, rateCamera, mean } from "./core.js";

let stream = null, rvfc = 0;
const stop = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };

export default {
  id: "camera", title: "Camera",
  blurb: "Opens the camera and checks resolution, real frame rate, brightness, sharpness, colour balance and that the picture isn't frozen.",
  supported: () => navigator.mediaDevices?.getUserMedia ? true : "This browser can't open the camera (needs https:// or http://localhost).",

  mount(root, ctx) {
    root.innerHTML = `
      <div class="row"><label>Camera <select id="cmSel" aria-label="Camera"><option value="">Default camera</option></select></label><button id="cmStart">Start camera</button><button id="cmStop" class="secondary hidden">Stop</button><span id="cmStatus" class="detail"></span></div>
      <video id="cmVid" class="vid hidden" autoplay muted playsinline style="max-height:320px"></video>
      <div class="row hidden" id="cmTests"><button id="cmRun">Analyze picture (4s)</button><span class="detail" id="cmTest"></span></div>`;
    const $ = id => root.querySelector("#" + id), vid = $("cmVid");
    (async () => { try { for (const x of (await navigator.mediaDevices.enumerateDevices()).filter(x => x.kind === "videoinput")) { const o = document.createElement("option"); o.value = x.deviceId; o.textContent = x.label || "Camera"; $("cmSel").appendChild(o); } } catch (_) {} })();

    $("cmStart").onclick = async () => {
      stop(); $("cmStatus").textContent = "Asking for the camera…";
      try {
        const id = $("cmSel").value;
        stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: id ? { exact: id } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        vid.srcObject = stream; await vid.play().catch(() => {});
        vid.classList.remove("hidden"); $("cmTests").classList.remove("hidden"); $("cmStop").classList.remove("hidden");
        const t = stream.getVideoTracks()[0], s = t.getSettings();
        $("cmStatus").textContent = `${t.label || "camera"}`;
        ctx.result("PASS", "Camera opens", `${t.label || "camera"}: ${s.width || vid.videoWidth}×${s.height || vid.videoHeight} at ${s.frameRate ? Math.round(s.frameRate) + " fps requested" : "unknown fps"}`, "open");
      } catch (e) { $("cmStatus").textContent = ""; ctx.result("FAIL", "Camera opens", `${e.name}: ${e.message}. It may be in use by another app, blocked in privacy settings, or unplugged.`, "open"); }
    };
    $("cmStop").onclick = () => { stop(); vid.classList.add("hidden"); $("cmTests").classList.add("hidden"); $("cmStop").classList.add("hidden"); $("cmStatus").textContent = "Stopped."; };

    $("cmRun").onclick = async () => {
      $("cmRun").disabled = true;
      const cv = document.createElement("canvas"); cv.width = 160; cv.height = 90; const g = cv.getContext("2d", { willReadFrequently: true });
      const grabs = []; let frames = 0, last = 0;
      const t0 = performance.now(); const cnt = vid.requestVideoFrameCallback ? () => { frames++; rvfc = vid.requestVideoFrameCallback(cnt); } : null; if (cnt) rvfc = vid.requestVideoFrameCallback(cnt);
      const startTime = vid.currentTime;
      await ctx.timed(4000, $("cmTest"), "Analyzing,", now => { if (now - last > 250) { last = now; g.drawImage(vid, 0, 0, 160, 90); grabs.push(g.getImageData(0, 0, 160, 90).data.slice()); } });
      if (cnt && vid.cancelVideoFrameCallback) vid.cancelVideoFrameCallback(rvfc);
      $("cmRun").disabled = false;
      const secs = (performance.now() - t0) / 1000, fps = cnt ? frames / secs : null;
      const stats = frameStats(grabs.at(-1), 160, 90), notes = rateCamera(stats);
      const diffs = grabs.slice(1).map((f, i) => frameDiff(grabs[i], f));
      const moved = vid.currentTime - startTime;
      const frozen = moved < 0.5 || (diffs.length && Math.max(...diffs) < 0.02 && mean(diffs) < 0.02 && stats.sharpness > 0 && moved < secs * 0.5);
      ctx.result(frozen ? "FAIL" : "PASS", "Video is live", frozen ? "The picture isn't updating (frozen frames)." : `Picture updates (video advanced ${moved.toFixed(1)} s in ${secs.toFixed(1)} s).`, "live");
      if (fps !== null) ctx.result(fps >= 24 ? "PASS" : fps >= 12 ? "WARN" : "FAIL", "Frame rate", `${fps.toFixed(1)} frames/s measured (${vid.videoWidth}×${vid.videoHeight}). Low light often forces cameras to a slower rate.`, "fps");
      ctx.result(notes.length ? "WARN" : "PASS", "Picture quality", `Brightness ${(stats.luma / 2.55).toFixed(0)}%, sharpness ${stats.sharpness.toFixed(0)}, colour R${stats.r.toFixed(0)} G${stats.g.toFixed(0)} B${stats.b.toFixed(0)}.${notes.length ? " " + notes.join("; ") + "." : ""}`, "quality");
    };
  },

  unmount() { stop(); },
};

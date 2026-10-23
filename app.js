(() => {
  "use strict";
  const MAGIC = 0x514f5331, HEADER = 25;
  const video = document.querySelector("#preview"), status = document.querySelector("#status");
  const start = document.querySelector("#start"), stop = document.querySelector("#stop"), reset = document.querySelector("#reset");
  const download = document.querySelector("#download"), filename = document.querySelector("#filename");
  let reader, controls, expectedTotal = null, expectedSize = null, chunks = new Map(), complete = false;
  const crcTable = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; } return table; })();
  const crc32 = bytes => { let c = 0xffffffff; for (const value of bytes) c = crcTable[(c ^ value) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const setStatus = message => { status.textContent = message; };
  const resetTransfer = () => { expectedTotal = null; expectedSize = null; chunks = new Map(); complete = false; download.disabled = true; setStatus("Transfer reset. Start or keep scanning."); };
  const fromBase64 = text => { const raw = atob(text); const result = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) result[i] = raw.charCodeAt(i); return result; };
  function readPacket(text) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new Error("not a QOS QR code");
    const data = fromBase64(text); if (data.length < HEADER) throw new Error("packet is too short");
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (view.getUint32(0) !== MAGIC || view.getUint8(4) !== 1) throw new Error("not a QOS1 packet");
    const index = view.getUint32(5), total = view.getUint32(9), size = Number(view.getBigUint64(13));
    const checksum = view.getUint32(21), chunk = data.slice(HEADER);
    if (!total || index >= total || !Number.isSafeInteger(size) || crc32(chunk) !== checksum) throw new Error("invalid QOS packet");
    return { index, total, size, chunk };
  }
  function accept(text) {
    if (complete) return;
    let packet; try { packet = readPacket(text); } catch (_) { return; }
    if (expectedTotal === null) { expectedTotal = packet.total; expectedSize = packet.size; }
    if (packet.total !== expectedTotal || packet.size !== expectedSize) return;
    chunks.set(packet.index, packet.chunk);
    setStatus(`Received ${chunks.size} / ${expectedTotal} frames`);
    if (chunks.size === expectedTotal) {
      let length = 0; for (let i = 0; i < expectedTotal; i++) { const part = chunks.get(i); if (!part) return; length += part.length; }
      if (length !== expectedSize) { setStatus("Frame-size check failed — reset and scan again."); return; }
      complete = true; download.disabled = false; setStatus(`Complete: ${expectedTotal} frames, ${length} bytes. Download is ready.`);
    }
  }
  async function startCamera() {
    if (!window.isSecureContext) { setStatus("Camera needs HTTPS. Publish this folder to GitHub Pages, Cloudflare Pages, or another HTTPS host."); return; }
    if (!window.ZXingBrowser) { setStatus("QR scanner library did not load. Check your Internet connection."); return; }
    try {
      reader = new ZXingBrowser.BrowserQRCodeReader();
      controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video, result => { if (result) accept(result.getText()); });
      start.disabled = true; stop.disabled = false; setStatus("Scanning for QOS QR frames…");
    } catch (error) { setStatus(`Could not start camera: ${error.message}`); }
  }
  function stopCamera() { if (controls) controls.stop(); controls = null; start.disabled = false; stop.disabled = true; setStatus(complete ? "Transfer complete." : "Camera stopped."); }
  download.addEventListener("click", () => { if (!complete) return; const parts = []; for (let i = 0; i < expectedTotal; i++) parts.push(chunks.get(i)); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(parts, { type: "application/octet-stream" })); link.download = filename.value.trim() || "qos-recovered.bin"; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); });
  start.addEventListener("click", startCamera); stop.addEventListener("click", stopCamera); reset.addEventListener("click", resetTransfer);
})();

"use strict";

let scannerActive    = false;
let scannerStream    = null;
let scannerAnimFrame = null;
let lastScannedId    = null;

function toggleScanner() {
  if (scannerActive) stopScanner();
  else startScanner();
}

async function startScanner() {
  const video   = document.getElementById('qr-video');
  const overlay = document.getElementById('scan-overlay');
  const idleMsg = document.getElementById('scan-idle-msg');
  const badge   = document.getElementById('scan-status-badge');
  const btn     = document.getElementById('scan-toggle-btn');
  const resultBar = document.getElementById('scan-result-bar');

  // Reset result
  resultBar.classList.remove('visible');
  lastScannedId = null;

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
    });
    video.srcObject = scannerStream;
    await video.play();

    scannerActive = true;
    overlay.style.display = 'block';
    idleMsg.style.display  = 'none';
    badge.innerHTML        = '<i class="bi bi-broadcast"></i> Scanning…';
    badge.style.background = 'var(--gpl)';
    badge.style.color      = 'var(--gmd)';
    btn.innerHTML          = '<i class="bi bi-stop-fill"></i> Stop Scanner';

    scanFrame();
  } catch (err) {
    const msg = err.name === 'NotAllowedError'
      ? 'Camera permission denied. Please allow camera access in your browser settings.'
      : 'Could not access camera: ' + err.message;
    showToast('' + msg);
    badge.innerHTML = '<i class="bi bi-x-circle-fill"></i> Error';
    badge.style.background = '#fff0f0';
    badge.style.color = '#c53030';
  }
}

function stopScanner() {
  if (!scannerActive) return;
  scannerActive = false;

  if (scannerAnimFrame) { cancelAnimationFrame(scannerAnimFrame); scannerAnimFrame = null; }
  if (scannerStream)    { scannerStream.getTracks().forEach(t => t.stop()); scannerStream = null; }

  const video   = document.getElementById('qr-video');
  const overlay = document.getElementById('scan-overlay');
  const idleMsg = document.getElementById('scan-idle-msg');
  const badge   = document.getElementById('scan-status-badge');
  const btn     = document.getElementById('scan-toggle-btn');

  video.srcObject   = null;
  overlay.style.display = 'none';
  idleMsg.style.display = 'flex';
  badge.innerHTML       = 'Idle';
  badge.style.background = 'var(--gpl)';
  badge.style.color      = 'var(--mut)';
  btn.innerHTML          = '<i class="bi bi-play-fill"></i> Start Scanner';
}

function scanFrame() {
  if (!scannerActive) return;

  const video  = document.getElementById('qr-video');
  const canvas = document.getElementById('qr-canvas');

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (code) {
      handleScanResult(code.data);
      return; // pause scanning until user acts
    }
  }

  scannerAnimFrame = requestAnimationFrame(scanFrame);
}

function handleScanResult(text) {
  if (typeof text !== 'string' || text.length > 2048 || /[\u0000-\u001f]/.test(text)) { showToast('Invalid QR content', 'warning'); stopScanner(); return; }
  let thesisId = null;
  const urlMatch = text.match(/\/thesis\/([^/?#]+)/);
  thesisId = urlMatch ? urlMatch[1] : text.trim();

  const thesis = DB.find(x => String(x.id) === String(thesisId));
  const badge  = document.getElementById('scan-status-badge');

  if (thesis) {
    lastScannedId = String(thesisId);

    // Flash green border on scan box
    const box = document.getElementById('scan-box');
    if (box) {
      box.style.outline = '4px solid #52b788';
      setTimeout(() => { if (box) box.style.outline = ''; }, 900);
    }

    // Populate and show result bar
    document.getElementById('scan-found-title').textContent = thesis.title;

    // Show/hide View File button depending on whether file exists
    const hasFile = !!thesis.parts?.full;
    const viewBtn = document.getElementById('scan-view-file-btn');
    if (viewBtn) viewBtn.style.display = hasFile ? '' : 'none';

    const resultBar = document.getElementById('scan-result-bar');
    resultBar.style.display = 'flex';   // show immediately
    resultBar.classList.add('visible'); // also add class for CSS

    badge.innerHTML        = '<i class="bi bi-check-circle-fill"></i> Found!';
    badge.style.background = '#e4e4e7';
    badge.style.color      = '#18181b';

    showToast('Thesis found:' + thesis.title.slice(0, 40) + '…');
    stopScanner();

    // Auto-open file viewer after short delay if file exists
    if (hasFile) {
      setTimeout(() => openScannedThesisFile(), 700);
    }

  } else {
    badge.innerHTML        = '<i class="bi bi-exclamation-triangle-fill"></i> Not found';
    badge.style.background = '#fff8e1';
    badge.style.color      = '#7a5c00';
    showToast('QR scanned — thesis not found in repository');
    setTimeout(() => {
      if (scannerActive) scannerAnimFrame = requestAnimationFrame(scanFrame);
    }, 2000);
  }
}

/* ── Open scanned thesis details modal ── */
function openScannedThesisModal() {
  if (!lastScannedId) { showToast('No thesis scanned yet'); return; }
  openThesisModal(lastScannedId);
}

/* ── Open scanned thesis file directly in viewer ── */
function openScannedThesisFile() {
  if (!lastScannedId) { showToast('No thesis scanned yet'); return; }
  const t = DB.find(x => String(x.id) === String(lastScannedId));
  if (!t) { showToast('Thesis not found in repository'); return; }

  if (t.parts && t.parts.full && t.parts.full.dataURL) {
    // Has an uploaded file — open file viewer directly
    openFileViewer(lastScannedId, 'full');
  } else {
    // No file uploaded — fall back to thesis info modal
    openThesisModal(lastScannedId);
    showToast('No file uploaded for this thesis — showing details ℹ');
  }
}

/* ── Alias for any old onclick refs ── */
function openScannedThesis() { openScannedThesisFile(); }


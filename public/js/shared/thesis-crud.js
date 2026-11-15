"use strict";

async function repositoryRequest(path, options = {}) {
  const request = { credentials: 'same-origin', cache: 'no-store', ...options };
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(request.method || '').toUpperCase()) && request.body === undefined) {
    request.headers = { ...(request.headers || {}), 'Content-Type': 'application/json' };
    request.body = '{}';
  }
  const response = await fetch('/api/repository/' + path, request);
  const result = await response.json().catch(() => ({}));
  if (response.status === 403 && typeof refreshSession === 'function' && !await refreshSession(true)) throw new Error('Your login is no longer active.');
  if (!response.ok) {
    const error = new Error(result.error || 'The repository request failed.');
    error.code = result.code;
    error.details = result;
    throw error;
  }
  return result;
}

const DEFAULT_PUBLICATION_YEAR = '2026';

async function initializeThesisFormOptions() {
  const year = document.getElementById('up-year');
  if (year && !year.value) year.value = DEFAULT_PUBLICATION_YEAR;
}

async function loadPendingSubmissions() {
  const { submissions } = await repositoryRequest('submissions');
  return submissions;
}

/* Byte formatting helper */
function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}


/* Persistence */
async function hydrateThesisFiles(thesis, partKeys = Object.keys(thesis?.parts || {})) {
  if (!thesis?.parts) return thesis;
  const requestedParts = Array.isArray(partKeys) ? partKeys : [partKeys];
  await Promise.all(requestedParts.map(async partKey => {
    const part = thesis.parts[partKey];
    if (!part) return;
    if (part.dataURL) return;
    delete part.loadError;
    try {
      let response;
      if (partKey === 'approval') {
        const result = await repositoryRequest(`theses/${encodeURIComponent(thesis.id)}/files/${partKey}`);
        response = await fetch(result.url);
      } else {
        response = await fetch(`/api/repository/theses/${encodeURIComponent(thesis.id)}/stream/${encodeURIComponent(partKey)}`, {
          credentials: 'same-origin', cache: 'no-store',
        });
        if (response.status === 403 && typeof refreshSession === 'function' && !await refreshSession(true)) {
          throw new Error('Your login is no longer active.');
        }
      }
      if (!response.ok) throw new Error('File download failed.');
      const blob = await response.blob();
      if (blob.size !== part.size || blob.type !== part.type) throw new Error('File verification failed.');
      part.dataURL = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      part.loadError = true;
      console.warn('Repository file download failed:', error);
    }
  }));
  return thesis;
}

async function loadDB() {
  try {
    const { theses } = await repositoryRequest('theses', { cache: 'default' });
    DB.splice(0, DB.length, ...theses);
  } catch (error) {
    DB.splice(0, DB.length);
    console.warn('Repository load failed:', error);
    throw error;
  }
}

/* Refresh only the thesis views that exist on the current page. */
function refreshThesisViews() {
  if (document.getElementById('admin-grid') && typeof buildAdminGrid === 'function') {
    buildAdminGrid();
  }
  if (document.getElementById('myuploads-grid') && typeof buildMyUploads === 'function') {
    buildMyUploads();
  }
  if (document.getElementById('advisee-results') && typeof initAdvisees === 'function') {
    initAdvisees();
  }
  if (document.getElementById('dash-tbody') && typeof buildDashboard === 'function') {
    buildDashboard();
  }
  if (document.getElementById('top-tbody') && typeof buildTopViews === 'function') {
    buildTopViews();
  }
  if (document.getElementById('repo-grid') && typeof renderThesisGrid === 'function') {
    if (typeof applyRender === 'function') {
      applyRender('repo-grid', 'rss-pills', repoFilters);
    } else {
      renderThesisGrid('repo-grid', DB, repoFilters);
    }
  }
  if (document.getElementById('guest-results')) {
    if (typeof refreshGuestSearch === 'function') refreshGuestSearch();
    else if (typeof renderGuestTheses === 'function') renderGuestTheses(DB);
  }
}

/* Refresh server-backed data when a user returns to an open page. */
window.addEventListener('focus', () => loadDB().then(refreshThesisViews).catch(() => {}));

/* Shared upload confirmation and progress flow. */
let uploadInProgress = false;

function showUploadResult(message, type) {
  const result = document.getElementById('upload-result');
  if (!result) return;
  result.textContent = message;
  result.className = `upload-result upload-result-${type}`;
  result.hidden = false;
  result.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
}

async function runUploadWithFeedback(publish) {
  if (uploadInProgress) return;
  uploadInProgress = true;
  const button = document.getElementById('publish-thesis-btn') || document.getElementById('adv-publish-thesis-btn');
  const idleButtonHTML = button?.innerHTML || '';
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="upload-button-spinner" aria-hidden="true"></span> Uploading\u2026';
  }
  const previousResult = document.getElementById('upload-result');
  if (previousResult) previousResult.hidden = true;
  openModal('upload-loading-modal');
  await new Promise(resolve => setTimeout(resolve, 50));
  try {
    const result = await publish();
    const message = result?.message || 'Thesis uploaded successfully.';
    const type = result?.type || 'success';
    showUploadResult(message, type);
    showToast(message, type);
  } catch (error) {
    console.error('Upload failed:', error);
    const message = error.message || 'Upload could not be saved. Please try again.';
    showUploadResult(message, 'danger');
    showToast(message, 'danger');
  } finally {
    closeModal('upload-loading-modal');
    uploadInProgress = false;
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = idleButtonHTML;
    }
  }
}

function addQRPrintHint(buttonId) {
  const button = document.getElementById(buttonId);
  if (!button || document.getElementById(buttonId + '-print-hint')) return;
  const hint = document.createElement('p');
  hint.id = buttonId + '-print-hint';
  hint.className = 'qr-print-hint';
  hint.textContent = 'For the physical copy: download and print this QR code, then attach it to the printed thesis.';
  button.before(hint);
}

function showAutoQR(t) {
  document.getElementById('qr-auto-title').textContent = t.title;
  document.getElementById('qr-auto-sub').textContent = t.authors || '';

  const box = document.getElementById('qr-auto-box');
  box.innerHTML = '';
  const qrDiv = document.createElement('div');
  box.appendChild(qrDiv);

  new QRCode(qrDiv, {
    text: 'https://www.thesislinkedu.org/thesis/' + t.id,
    width: 210,
    height: 210,
    colorDark: '#185f37',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  });

  document.getElementById('qr-auto-dl-btn').onclick = () => {
    generateAndDownloadQR(t, () => showToast('QR Code downloaded!'));
  };

  addQRPrintHint('qr-auto-dl-btn');
  openModal('qr-auto-modal');
  showToast('Thesis published! QR code generated');
}


/* Edit thesis modal */
let editingThesisId = null;

function openEditModal(id) {
  if (currentUser?.role === 'student') { showToast('Students have view-only access', 'danger'); return; }
  const t = DB.find(x => String(x.id) === String(id));
  if (!t) { showToast('Thesis not found'); return; }
  editingThesisId = String(id);

  document.getElementById('edit-title').value  = t.title    || '';
  document.getElementById('edit-auth').value   = t.authors  || '';
  document.getElementById('edit-adv').value = t.adviser || '';
  document.getElementById('edit-year').value   = t.year     || '';
  document.getElementById('edit-kw').value     = t.keywords || '';
  document.getElementById('edit-abs').value    = t.abstract || '';

  const sel = document.getElementById('edit-course');
  for (let opt of sel.options) opt.selected = (opt.value === t.course);

  openModal('edit-modal');
}

async function saveEditThesis() {
  if (currentUser?.role === 'student') { showToast('Students have view-only access', 'danger'); return; }
  const t = DB.find(x => String(x.id) === String(editingThesisId));
  if (!t) return;

  const missing = [
    ['edit-title', 'Full title'], ['edit-auth', 'Author(s)'], ['edit-adv', 'Adviser'], ['edit-course', 'Program'], ['edit-year', 'Year'],
    ['edit-kw', 'Keywords'], ['edit-abs', 'Abstract'],
  ].filter(([id]) => !document.getElementById(id)?.value.trim()).map(([fieldId, label]) => ({ fieldId, label }));
  if (missing.length) { showUploadValidationErrors(missing); return; }

  let metadata;
  try { metadata = Security.readThesisForm('edit'); }
  catch (error) {
    const suffix = { title: 'title', authors: 'auth', adviser: 'adv', course: 'course', year: 'year', keywords: 'kw', abstract: 'abs' }[error.field];
    if (suffix) showUploadValidationErrors([{ fieldId: `edit-${suffix}`, label: error.field, message: error.message }]);
    else showToast(error.message, 'warning');
    return;
  }
  try {
    await repositoryRequest(`theses/${encodeURIComponent(t.id)}`, { method: 'PATCH',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metadata) });
  } catch (error) { showToast(error.message, 'danger'); return; }
  Object.assign(t, metadata);
  refreshThesisViews();

  closeModal('edit-modal');
  showToast('Thesis updated successfully!');
}


/* Delete thesis modal */
let deletingThesisId = null;
let deletingThesisPending = false;

function setDeleteLoading(loading) {
  const modal = document.getElementById('delete-modal');
  const button = modal?.querySelector('button[onclick="confirmDelete()"]');
  if (modal) modal.setAttribute('aria-busy', String(loading));
  if (!button) return;
  if (!button.dataset.idleHtml) button.dataset.idleHtml = button.innerHTML;
  button.disabled = loading;
  button.innerHTML = loading
    ? '<span class="delete-button-spinner" aria-hidden="true"></span> Deleting…'
    : button.dataset.idleHtml;
}

function openDeleteModal(id) {
  if (currentUser?.role === 'student') { showToast('Students have view-only access', 'danger'); return; }
  const t = DB.find(x => String(x.id) === String(id));
  if (!t) { showToast('Thesis not found'); return; }
  deletingThesisId = String(id);
  deletingThesisPending = false;
  setDeleteLoading(false);
  document.getElementById('delete-thesis-name').textContent = t.title;
  openModal('delete-modal');
}

async function confirmDelete() {
  if (deletingThesisPending) return;
  if (currentUser?.role === 'student') { showToast('Students have view-only access', 'danger'); return; }
  const idx = DB.findIndex(x => String(x.id) === String(deletingThesisId));
  if (idx === -1) {
    closeModal('delete-modal');
    deletingThesisId = null;
    showToast('Thesis not found');
    return;
  }

  const t = DB[idx];
  deletingThesisPending = true;
  setDeleteLoading(true);
  try {
    await repositoryRequest(`theses/${encodeURIComponent(t.id)}`, { method: 'DELETE' });
    DB.splice(idx, 1);
    refreshThesisViews();
    closeModal('delete-modal');
    deletingThesisId = null;
    showToast(`“${t.title}” was deleted successfully.`, 'success');
  } catch (error) {
    showToast(error.message || 'The thesis could not be deleted. Please try again.', 'danger');
  } finally {
    deletingThesisPending = false;
    setDeleteLoading(false);
  }
}


/* QR generation/download */
function downloadQRForThesis(id, e) {
  if (e) e.stopPropagation();
  const t = DB.find(x => String(x.id) === String(id));
  if (!t) { showToast('Thesis not found'); return; }
  generateAndDownloadQR(t, () => showToast('QR Code downloaded!'));
}

/* ── Single shared QR generator used by ALL download buttons ── */
function waitForQRGraphic(container, timeout = 3000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const graphic = container.querySelector('canvas, img');
      if (graphic?.tagName === 'CANVAS') return resolve(graphic);
      if (graphic?.complete && graphic.naturalWidth) return resolve(graphic);
      if (Date.now() - started >= timeout) return reject(new Error('QR generation timed out.'));
      (window.requestAnimationFrame || window.setTimeout)(check, 25);
    };
    check();
  });
}

function generateAndDownloadQR(t, onDone) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
  document.body.appendChild(wrapper);

  const qrDiv = document.createElement('div');
  wrapper.appendChild(qrDiv);

  new QRCode(qrDiv, {
    text: 'https://www.thesislinkedu.org/thesis/' + t.id,
    width: 400, height: 400,
    colorDark: '#185f37', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  });

  waitForQRGraphic(qrDiv).then(img => {
    if (!img) {
      document.body.removeChild(wrapper);
      showToast('QR generation failed — try again');
      return;
    }

    const PAD = 28, QR = 400, LABEL_H = 80;
    const W = QR + PAD * 2;
    const H = QR + PAD * 2 + LABEL_H;

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Thin black border
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, W - 4, H - 4);

    const qrImg = img.tagName === 'CANVAS' ? img : new Image();
    qrImg.onload = () => {
      // Draw QR
      ctx.drawImage(qrImg, PAD, PAD, QR, QR);

      // Divider line
      ctx.strokeStyle = '#e3e3e6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD, QR + PAD + 10);
      ctx.lineTo(W - PAD, QR + PAD + 10);
      ctx.stroke();

      // Title text (wrapped, max 3 lines)
      ctx.fillStyle = '#18181b';
      ctx.textAlign = 'center';
      const maxW = W - PAD * 2;

      // Line 1: thesis title
      const words = t.title.split(' ');
      let line = '', lines = [];
      ctx.font = 'bold 15px sans-serif';
      for (let w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      lines = lines.slice(0, 2);
      lines.forEach((l, i) => ctx.fillText(l, W / 2, QR + PAD + 30 + i * 20));

      // Line: authors (smaller)
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#6b6b70';
      const authLine = (t.authors || '').split(';')[0].trim();
      ctx.fillText(authLine.slice(0, 55), W / 2, QR + PAD + 30 + lines.length * 20 + 4);

      // Download
      const safeName = t.title.slice(0, 40).replace(/[^a-z0-9]/gi, '_');
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = 'QR_' + safeName + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      document.body.removeChild(wrapper);
      if (onDone) onDone();
    };
    if (img.tagName === 'CANVAS') qrImg.onload();
    else qrImg.src = img.src;
  }).catch(error => {
    console.error('QR download failed:', error);
    wrapper.remove();
    showToast('QR code could not be downloaded. Please try again.', 'error');
  });
}

"use strict";

let singleUploadedFile = null;   // { name, size, type, ext, dataURL }
let approvalUploadedFile = null;
let thesisFileVersion = 0;
let approvalFileVersion = 0;
let resubmittingThesisId = null;
let uploadFormBaseline = null;
let uploadSubmissionSaved = false;

function currentUploadFormState() {
  return JSON.stringify(['up-title', 'up-auth', 'up-adv', 'up-course', 'up-year', 'up-kw', 'up-abs']
    .map(id => document.getElementById(id)?.value || ''));
}

async function initializeStudentUploadPage() {
  if (currentUser?.role !== 'student') return;
  const id = new URLSearchParams(window.location.search).get('submission');
  if (!id) { uploadFormBaseline = currentUploadFormState(); return; }
  try {
    const { submission } = await repositoryRequest(`student-submissions/${encodeURIComponent(id)}`);
    resubmittingThesisId = submission.id;
    document.getElementById('up-title').value = submission.title || '';
    document.getElementById('up-auth').value = submission.authors || '';
    document.getElementById('up-adv').value = submission.adviser || '';
    document.getElementById('up-course').value = submission.course || '';
    document.getElementById('up-year').value = submission.year || DEFAULT_PUBLICATION_YEAR;
    document.getElementById('up-kw').value = submission.keywords || '';
    document.getElementById('up-abs').value = submission.abstract || '';
    document.getElementById('tb-title').textContent = 'Correct Submission';
    document.getElementById('upload-form-title').innerHTML = '<i class="bi bi-pencil-square"></i> Correct Thesis Information';
    const notice = document.getElementById('resubmission-notice');
    document.getElementById('resubmission-remarks').textContent = submission.declineRemarks || 'Review the submission and make the requested corrections.';
    notice.hidden = false;
    const button = document.getElementById('publish-thesis-btn');
    button.innerHTML = '<i class="bi bi-arrow-repeat"></i> Resubmit for Review';
    const full = submission.parts?.full;
    if (full) {
      document.getElementById('sdz-label').textContent = `Current file: ${full.name}`;
      document.getElementById('sdz-sub').textContent = 'Click to select a replacement only if needed';
      document.getElementById('single-drop-zone').classList.add('file-attached');
      document.getElementById('single-file-input').required = false;
    }
    const approval = submission.parts?.approval;
    if (approval) {
      const label = document.querySelector('#approval-file-picker span');
      if (label) label.textContent = `Current file: ${approval.name} · choose to replace if needed`;
      document.getElementById('approval-file-input').required = false;
    }
    uploadFormBaseline = currentUploadFormState();
  } catch (error) {
    showUploadResult(error.message || 'The declined submission could not be loaded.', 'danger');
    document.getElementById('publish-thesis-btn').disabled = true;
  }
}

function singleDragOver(e) {
  e.preventDefault();
  const zone = document.getElementById('single-drop-zone');
  zone.style.borderColor = 'var(--gbs)';
  zone.style.background  = '#f0f0f1';
}
function singleDragLeave() {
  const zone = document.getElementById('single-drop-zone');
  zone.style.borderColor = '';
  zone.style.background  = '';
}
function singleDrop(e) {
  e.preventDefault();
  singleDragLeave();
  const file = e.dataTransfer.files[0];
  if (file) attachSingleFile(file);
}
function singleFileChange(e) {
  const file = e.target.files[0];
  if (file) attachSingleFile(file);
}

async function attachSingleFile(file) {
  const version = ++thesisFileVersion;
  let checked;
  try { checked = await Security.uploadFile(file, 'full'); }
  catch (error) { showToast(error.message, 'warning'); return; }
  if (version !== thesisFileVersion) return;
  const { name, ext, type } = checked;
  const reader = new FileReader();
  reader.onload = function(ev) {
    if (version !== thesisFileVersion) return;
    singleUploadedFile = {
      name, size: file.size, type,
      dataURL: 'data:' + type + ';base64,' + ev.target.result.split(',')[1], ext, blob: file
    };

    // Update drop zone → show preview
    const zone    = document.getElementById('single-drop-zone');
    const preview = document.getElementById('single-file-preview');
    const isPdf   = ext === '.pdf';
    zone.classList.remove('upload-invalid');
    zone.removeAttribute('aria-invalid');
    const fileError = document.getElementById('single-file-input-error');
    if (fileError) fileError.textContent = '';
    zone.classList.add('file-attached');

    document.getElementById('sdz-icon').innerHTML  = isPdf ? '<i class="bi bi-file-earmark-pdf-fill"></i>' : '<i class="bi bi-file-earmark-text-fill"></i>';
    document.getElementById('sdz-label').textContent = file.name;
    document.getElementById('sdz-sub').textContent   = fmtBytes(file.size) + ' · Click to replace';
    zone.style.borderColor  = 'var(--gbs)';
    zone.style.background   = '#f0f0f1';

    document.getElementById('sfp-icon').innerHTML = isPdf ? '<i class="bi bi-file-earmark-pdf-fill"></i>' : '<i class="bi bi-file-earmark-text-fill"></i>';
    document.getElementById('sfp-name').textContent = file.name;
    document.getElementById('sfp-size').textContent = fmtBytes(file.size);
    preview.style.display = 'none';
    document.getElementById('sdz-remove').style.display = 'inline-flex';

    syncUploadedParts();
    showToast('File attached: ' + file.name, 'success');
  };
  reader.readAsDataURL(file);
}

function removeSingleFile(skipConfirmation = false) {
  if (singleUploadedFile && !skipConfirmation && !window.confirm('Remove the attached thesis file?')) return false;
  thesisFileVersion++;
  singleUploadedFile = null;
  syncUploadedParts();
  document.getElementById('single-file-input').value = '';
  document.getElementById('sdz-icon').innerHTML  = '<i class="bi bi-file-earmark-pdf-fill"></i>';
  document.getElementById('sdz-label').textContent = 'Drag & drop your thesis file here';
  document.getElementById('sdz-sub').textContent   = 'or click to browse — PDF only';
  const zone = document.getElementById('single-drop-zone');
  zone.classList.remove('file-attached');
  zone.style.borderColor = '';
  zone.style.background  = '';
  document.getElementById('single-file-preview').style.display = 'none';
  document.getElementById('sdz-remove').style.display = 'none';
  return true;
}

async function approvalFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const version = ++approvalFileVersion;
  let checked;
  try { checked = await Security.uploadFile(file, 'approval'); }
  catch (error) { showToast(error.message, 'warning'); return; }
  if (version !== approvalFileVersion) return;
  const { name, ext, type } = checked;
  const reader = new FileReader();
  reader.onload = ev => {
    if (version !== approvalFileVersion) return;
    approvalUploadedFile = {
      name, size: file.size, ext, type,
      dataURL: 'data:' + type + ';base64,' + ev.target.result.split(',')[1], blob: file,
    };
    document.getElementById('approval-file-name').textContent = file.name;
    document.getElementById('approval-file-size').textContent = fmtBytes(file.size);
    document.getElementById('approval-image-thumb').src = approvalUploadedFile.dataURL;
    const approvalPreview = document.getElementById('approval-file-preview');
    document.querySelector('.approval-file-picker')?.classList.remove('upload-invalid');
    const approvalError = document.getElementById('approval-file-input-error');
    if (approvalError) approvalError.textContent = '';
    approvalPreview.style.display = 'flex';
    approvalPreview.classList.add('file-attached');
    showToast('Approval sheet attached: ' + file.name, 'success');
  };
  reader.readAsDataURL(file);
}

function removeApprovalFile(skipConfirmation = false) {
  if (approvalUploadedFile && !skipConfirmation && !window.confirm('Remove the attached approval sheet?')) return false;
  approvalFileVersion++;
  approvalUploadedFile = null;
  document.getElementById('approval-file-input').value = '';
  document.getElementById('approval-image-thumb').removeAttribute('src');
  document.getElementById('approval-file-preview').style.display = 'none';
  document.getElementById('approval-file-preview').classList.remove('file-attached');
  return true;
}

/* uploadedParts — plain object, synced with singleUploadedFile */
const uploadedParts = {};
function syncUploadedParts() {
  Object.keys(uploadedParts).forEach(k => delete uploadedParts[k]);
  if (singleUploadedFile) uploadedParts['full'] = singleUploadedFile;
}

/* ── PERSIST THESIS AND FILES THROUGH THE SERVER ────── */

function uploadThesis() {
  const missing = [
    ['up-title', 'Full title'], ['up-auth', 'Author(s)'], ['up-adv', 'Adviser'], ['up-course', 'Program'], ['up-year', 'Year'],
    ['up-kw', 'Keywords'], ['up-abs', 'Abstract'],
  ].filter(([id]) => !document.getElementById(id)?.value.trim()).map(([fieldId, label]) => ({ fieldId, label }));
  if (!resubmittingThesisId && !singleUploadedFile) missing.push({ fieldId: 'single-file-input', label: 'Thesis file', visualId: 'single-drop-zone' });
  if (!resubmittingThesisId && !approvalUploadedFile) missing.push({ fieldId: 'approval-file-input', label: 'Approval sheet', visualId: 'approval-file-picker' });
  if (missing.length) { showUploadValidationErrors(missing); return; }
  let metadata;
  try { metadata = Security.readThesisForm('up'); }
  catch (error) {
    const suffix = { title: 'title', authors: 'auth', adviser: 'adv', course: 'course', year: 'year', keywords: 'kw', abstract: 'abs' }[error.field];
    if (suffix) showUploadValidationErrors([{ fieldId: `up-${suffix}`, label: error.field, message: error.message }]);
    else showToast(error.message, 'warning');
    return;
  }
  const { title, year, authors: auth, course, adviser: adv, abstract: abs, keywords: kw } = metadata;

  const form = {
    title, auth, year, course, adv, abs, kw,
    file: singleUploadedFile,
    approvalFile: approvalUploadedFile,
  };
  runUploadWithFeedback(() => resubmittingThesisId ? publishStudentResubmission(form) : publishAdminThesis(form));
}

async function publishStudentResubmission(form) {
  const metadata = Security.thesis({ title: form.title, authors: form.auth, year: form.year, course: form.course, adviser: form.adv, abstract: form.abs, keywords: form.kw });
  const parts = { ...(form.file ? { full: form.file } : {}), ...(form.approvalFile ? { approval: form.approvalFile } : {}) };
  for (const file of Object.values(parts)) {
    if (!Security.safeFileURL(file.dataURL, file === form.approvalFile ? 'approval' : undefined)) throw new Error('The attached replacement file is invalid. Choose it again.');
  }
  const prepared = await repositoryRequest(`theses/${encodeURIComponent(resubmittingThesisId)}/resubmit`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata, files: Object.fromEntries(Object.entries(parts).map(([category, file]) =>
      [category, { name: file.name, size: file.size, type: file.type }])) }) });
  await Promise.all(prepared.uploads.map(async upload => {
    const file = parts[upload.category];
    const response = await fetch(upload.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file.blob });
    if (!response.ok) throw new Error(`Could not upload ${file.name}.`);
  }));
  await repositoryRequest(`theses/${encodeURIComponent(resubmittingThesisId)}/complete-resubmission`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  uploadSubmissionSaved = true;
  window.setTimeout(() => { window.location.href = '/pages/student/notifications.html'; }, 900);
  return { message: 'Corrections submitted successfully and are waiting for administrator review.' };
}

async function publishAdminThesis(form) {
  const metadata = Security.thesis({ title: form.title, authors: form.auth, year: form.year, course: form.course, adviser: form.adv, abstract: form.abs, keywords: form.kw });
  if (!Security.safeFileURL(form.file?.dataURL) || (form.approvalFile && !Security.safeFileURL(form.approvalFile.dataURL, 'approval'))) throw new Error('The attached file is invalid. Choose it again.');
  const parts = { full: form.file, ...(form.approvalFile ? { approval: form.approvalFile } : {}) };
  const created = await repositoryRequest('theses', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata, files: Object.fromEntries(Object.entries(parts).map(([category, file]) =>
      [category, { name: file.name, size: file.size, type: file.type }])) }) });
  const warningLabels = { title: 'title', abstract: 'abstract' };
  const warning = (created.duplicateWarnings || []).map(field => warningLabels[field]).filter(Boolean).join(', ');
  if (currentUser?.role === 'admin' && warning && !window.confirm(`Possible duplicate detected in: ${warning}.\n\nPublish this thesis anyway?`)) {
    await repositoryRequest(`theses/${encodeURIComponent(created.id)}`, { method: 'DELETE' }).catch(() => {});
    return { message: 'Upload cancelled. No thesis was published.', type: 'warning' };
  }
  try {
    await Promise.all(created.uploads.map(async upload => {
      const file = parts[upload.category];
      const response = await fetch(upload.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file.blob });
      if (!response.ok) throw new Error(`Could not upload ${file.name}.`);
    }));
    const complete = confirmDuplicate => repositoryRequest(`theses/${encodeURIComponent(created.id)}/complete`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmDuplicate }) });
    try {
      await complete(currentUser?.role === 'admin' && !!warning);
    } catch (error) {
      if (currentUser?.role !== 'admin' || error.code !== 'DUPLICATE_WARNING') throw error;
      const latestWarning = (error.details?.duplicateWarnings || []).map(field => warningLabels[field]).filter(Boolean).join(', ');
      if (!window.confirm(`Possible duplicate detected in: ${latestWarning}.\n\nPublish this thesis anyway?`)) throw new Error('Upload cancelled. No thesis was published.');
      await complete(true);
    }
  } catch (error) {
    await repositoryRequest(`theses/${encodeURIComponent(created.id)}`, { method: 'DELETE' }).catch(() => {});
    throw error;
  }
  await loadDB();
  refreshThesisViews();

  // Reset form fields
  ['up-title', 'up-year', 'up-auth', 'up-adv', 'up-kw', 'up-abs'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('up-year').value = DEFAULT_PUBLICATION_YEAR;
  // Reset single file upload zone
  removeSingleFile(true);
  removeApprovalFile(true);

  // ── Auto-show QR code after publish ──
  if (currentUser?.role === 'student') {
    return { message: warning
      ? `Thesis submitted for administrator review. Possible duplicate detected in: ${warning}.`
      : 'Thesis submitted successfully and is waiting for administrator approval.', type: warning ? 'warning' : 'success' };
  }
  const published = DB.find(item => item.id === created.id);
  if (published) showAutoQR(published);
  return { message: 'Thesis uploaded and published successfully.' };
}

function hasUnsavedUploadChanges() {
  if (uploadSubmissionSaved) return false;
  if (uploadFormBaseline !== null) return Boolean(singleUploadedFile || approvalUploadedFile || currentUploadFormState() !== uploadFormBaseline);
  const fieldIds = ['up-title', 'up-auth', 'up-adv', 'up-kw', 'up-abs'];
  const year = document.getElementById('up-year');
  const yearChanged = Boolean(year && year.value.trim() !== DEFAULT_PUBLICATION_YEAR);
  return Boolean(singleUploadedFile || approvalUploadedFile || yearChanged || fieldIds.some(id => {
    const field = document.getElementById(id);
    return field && field.value.trim();
  }));
}

window.addEventListener('beforeunload', event => {
  if (!hasUnsavedUploadChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});


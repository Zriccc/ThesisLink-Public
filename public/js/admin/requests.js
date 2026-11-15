"use strict";

let adminSubmissions = [];
let decliningSubmissionId = null;
let declineSubmissionPending = false;

function requestEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

async function initializeUploadRequests() {
  adminSubmissions = await loadPendingSubmissions();
  renderUploadRequests();
}

function getRequestStatus(request) {
  return request.status === 'accepted' ? 'approved' : ['approved', 'declined'].includes(request.status) ? request.status : 'pending';
}

function getRequestStudentName(request) {
  if (request.uploadedByName) return request.uploadedByName;
  const emailName = String(request.uploadedBy || 'Student').split('@')[0].replace(/[._-]+/g, ' ');
  return emailName.replace(/\b\w/g, character => character.toUpperCase());
}

function duplicateWarningText(warnings) {
  const labels = { title: 'title', abstract: 'abstract' };
  return (warnings || []).map(field => labels[field]).filter(Boolean).join(', ');
}

function toggleRequestMenu(menu) {
  if (!menu.open) return;
  document.querySelectorAll('.request-menu[open]').forEach(other => {
    if (other !== menu) other.open = false;
  });
}

function renderUploadRequests() {
  const body = document.getElementById('upload-requests-body');
  if (!adminSubmissions.length) {
    body.innerHTML = '<tr><td colspan="4" class="request-empty"><i class="bi bi-inbox"></i><span>No student upload requests yet.</span></td></tr>';
    return;
  }

  body.innerHTML = adminSubmissions.map(request => {
    const status = getRequestStatus(request);
    const submitted = request.submittedAt ? new Date(request.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
    const decisions = `
      <button type="button" ${status === 'approved' ? 'class="selected"' : ''} onclick="acceptUploadRequest(${Security.jsArg(request.id)})"><i class="bi bi-check-lg"></i> Approve</button>
      <button type="button" class="danger ${status === 'declined' ? 'selected' : ''}" onclick="declineUploadRequest(${Security.jsArg(request.id)})"><i class="bi bi-x-lg"></i> Decline</button>`;
    return `<tr class="request-row" tabindex="0" onclick="openUploadRequest(${Security.jsArg(request.id)})" onkeydown="if(event.key==='Enter'){openUploadRequest(${Security.jsArg(request.id)})}">
      <td><span class="request-title">${requestEscape(getRequestStudentName(request))}</span><small>${requestEscape(request.course)}</small>${request.duplicateWarnings?.length ? `<small class="request-duplicate-warning"><i class="bi bi-exclamation-triangle-fill"></i> Similar ${requestEscape(duplicateWarningText(request.duplicateWarnings))}</small>` : ''}</td>
      <td>${requestEscape(submitted)}</td>
      <td><span class="request-status request-status-${status}">${status}</span></td>
      <td class="request-menu-cell" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()"><details class="request-menu" ontoggle="toggleRequestMenu(this)"><summary aria-label="Request actions"><i class="bi bi-three-dots-vertical"></i></summary><div class="request-menu-popover">${decisions}</div></details></td>
    </tr>`;
  }).join('');
}

async function openUploadRequest(id) {
  const request = adminSubmissions.find(item => String(item.id) === String(id));
  if (!request) return;
  const storedIndex = DB.findIndex(item => String(item.id) === String(request.id));
  if (storedIndex === -1) DB.push(request);
  else DB[storedIndex] = request;

  await openThesisModal(request.id, false, true);
  document.getElementById('m-meta').insertAdjacentHTML('beforeend',
    `<div class="meta-item"><strong>Submitted by:</strong> ${requestEscape(getRequestStudentName(request))}</div>${request.duplicateWarnings?.length ? `<div class="meta-item request-duplicate-warning"><strong>Possible duplicate:</strong> ${requestEscape(duplicateWarningText(request.duplicateWarnings))}</div>` : ''}`);
  const footer = document.getElementById('request-modal-actions');
  const status = getRequestStatus(request);
  footer.innerHTML = status === 'pending' ? `
    <button class="request-action request-decline" onclick="declineUploadRequest(${Security.jsArg(request.id)})">Decline</button>
    <button class="request-action request-accept" onclick="acceptUploadRequest(${Security.jsArg(request.id)})">Approve and Publish</button>` :
    `<span class="request-status request-status-${status}">${status}</span>${status === 'declined' && request.declineRemarks ? `<p class="request-decline-remarks"><strong>Reason:</strong> ${requestEscape(request.declineRemarks)}</p>` : ''}`;
}

async function acceptUploadRequest(id) {
  const request = adminSubmissions.find(item => String(item.id) === String(id));
  if (!request || getRequestStatus(request) === 'approved') return;
  const warning = duplicateWarningText(request.duplicateWarnings);
  const prompt = warning
    ? `Possible duplicate detected in: ${warning}.\n\nApprove and publish “${request.title}” anyway?`
    : `Approve and publish “${request.title}”?`;
  if (!window.confirm(prompt)) return;
  try {
    const review = confirmDuplicate => repositoryRequest(`theses/${encodeURIComponent(request.id)}/review`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'approved', confirmDuplicate }) });
    try {
      await review(Boolean(warning));
    } catch (error) {
      if (error.code !== 'DUPLICATE_WARNING') throw error;
      const currentWarning = duplicateWarningText(error.details?.duplicateWarnings);
      if (!window.confirm(`Possible duplicate detected in: ${currentWarning}.\n\nPublish this submission anyway?`)) return;
      await review(true);
    }
    await Promise.all([loadDB(), initializeUploadRequests()]);
  } catch (error) { showToast(error.message, 'danger'); return; }
  closeModal('thesis-modal');
  showToast('Submission approved and published', 'success');
}

async function declineUploadRequest(id) {
  const request = adminSubmissions.find(item => String(item.id) === String(id));
  if (!request || request.status === 'declined') return;
  decliningSubmissionId = request.id;
  document.getElementById('decline-thesis-title').textContent = request.title;
  document.getElementById('decline-remarks').value = '';
  document.getElementById('decline-remarks-error').textContent = '';
  openModal('decline-request-modal');
}

async function submitDecline(event) {
  event.preventDefault();
  if (declineSubmissionPending || !decliningSubmissionId) return;
  const field = document.getElementById('decline-remarks');
  const fieldError = document.getElementById('decline-remarks-error');
  const button = document.getElementById('decline-submit-button');
  const remarks = field.value.trim();
  if (!remarks || remarks.length > 1000) {
    fieldError.textContent = remarks ? 'Keep the reason within 1,000 characters.' : 'Enter the reason for declining this submission.';
    field.focus();
    return;
  }
  declineSubmissionPending = true;
  button.disabled = true;
  button.textContent = 'Declining…';
  try {
    await repositoryRequest(`theses/${encodeURIComponent(decliningSubmissionId)}/review`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision: 'declined', remarks }) });
    await initializeUploadRequests();
  } catch (error) {
    showToast(error.message, 'danger');
    return;
  } finally {
    declineSubmissionPending = false;
    button.disabled = false;
    button.textContent = 'Decline submission';
  }
  closeModal('decline-request-modal');
  closeModal('thesis-modal');
  decliningSubmissionId = null;
  showToast('Submission declined and the student was notified.', 'warning');
}

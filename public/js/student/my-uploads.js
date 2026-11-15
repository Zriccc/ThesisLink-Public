"use strict";

var studentUploads = [];
var studentUploadFilter = 'all';

function filterStudentUploads(status) {
  if (!['all', 'pending', 'published', 'declined'].includes(status)) return;
  studentUploadFilter = status;
  renderStudentUploads();
}

function studentUploadEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function studentUploadDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

function studentUploadAction(submission) {
  const id = encodeURIComponent(submission.id);
  if (submission.status === 'declined') return `<a class="my-upload-action my-upload-primary" href="/pages/student/upload.html?submission=${id}"><i class="bi bi-pencil-square"></i> Edit and resubmit</a>`;
  if (submission.status === 'published') return `<a class="my-upload-action" href="/pages/student/repository.html?thesis=${id}"><i class="bi bi-eye"></i> View thesis</a>`;
  if (submission.status === 'pending') return `<span class="my-upload-waiting"><i class="bi bi-clock"></i> Awaiting review</span><button type="button" class="my-upload-action my-upload-remove" data-remove-submission="${studentUploadEscape(submission.id)}"><i class="bi bi-trash"></i> Remove submission</button>`;
  return '';
}

async function removeStudentUpload(id, button) {
  const submission = studentUploads.find(item => item.id === id);
  if (!submission || submission.status !== 'pending') return;
  if (!window.confirm(`Remove "${submission.title}"? This will delete the pending submission and its files.`)) return;
  button.disabled = true;
  try {
    await repositoryRequest(`theses/${encodeURIComponent(id)}`, { method: 'DELETE' });
    studentUploads = studentUploads.filter(item => item.id !== id);
    renderStudentUploads();
    showToast('Pending submission removed.', 'success');
  } catch (error) {
    showToast(error.message || 'The submission could not be removed. Try again.', 'danger');
  } finally {
    button.disabled = false;
  }
}

document.getElementById('student-upload-list')?.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-submission]');
  if (button) removeStudentUpload(button.dataset.removeSubmission, button);
});

function renderStudentUploads() {
  const list = document.getElementById('student-upload-list');
  if (!list) return;
  const filters = document.getElementById('student-upload-filters');
  if (filters) filters.innerHTML = [['all', 'All'], ['pending', 'Pending'], ['published', 'Published'], ['declined', 'Declined']].map(([status, label]) => {
    const count = studentUploads.filter(item => status === 'all' || item.status === status).length;
    return `<button type="button" class="my-upload-filter" aria-pressed="${studentUploadFilter === status}" onclick="filterStudentUploads('${status}')">${label} <span>${count}</span></button>`;
  }).join('');
  if (!studentUploads.length) {
    list.innerHTML = '<div class="my-upload-empty"><i class="bi bi-folder2-open"></i><strong>No uploads yet</strong><span>Your submitted theses will appear here.</span><a href="/pages/student/upload.html">Upload a thesis</a></div>';
    return;
  }
  const visible = studentUploads.filter(item => studentUploadFilter === 'all' || item.status === studentUploadFilter);
  if (!visible.length) {
    list.innerHTML = `<div class="my-upload-empty"><i class="bi bi-folder2-open"></i><strong>No ${studentUploadFilter} submissions</strong><button type="button" onclick="filterStudentUploads('all')">Show all submissions</button></div>`;
    return;
  }
  list.innerHTML = visible.map(submission => {
    const status = submission.status === 'published' ? 'Published' : submission.status === 'declined' ? 'Declined' : 'Pending';
    const comment = submission.status === 'declined'
      ? `<div class="my-upload-comment"><strong>Decline remarks</strong><p>${studentUploadEscape(submission.declineRemarks || 'Review your submission and correct the thesis information before resubmitting.')}</p></div>` : '';
    return `<article class="my-upload-card">
      <div class="my-upload-main"><div><span class="my-upload-program">${studentUploadEscape(submission.course || submission.program || '')} ${studentUploadEscape(submission.year || '')}</span><h2>${studentUploadEscape(submission.title)}</h2><time>Submitted ${studentUploadEscape(studentUploadDate(submission.submittedAt))}</time></div><span class="my-upload-status status-${studentUploadEscape(submission.status)}">${status}</span></div>
      ${comment}<div class="my-upload-footer">${studentUploadAction(submission)}</div>
    </article>`;
  }).join('');
}

async function loadStudentUploads() {
  const list = document.getElementById('student-upload-list');
  if (list) list.innerHTML = '<div class="my-upload-skeleton"><span></span><span></span><span></span></div>';
  try {
    const response = await repositoryRequest('student-submissions');
    studentUploads = Array.isArray(response.submissions) ? response.submissions : [];
    renderStudentUploads();
  } catch (error) {
    if (list) list.innerHTML = `<div class="my-upload-empty"><i class="bi bi-exclamation-circle"></i><strong>Uploads could not be loaded</strong><span>${studentUploadEscape(error.message || 'Refresh the page and try again.')}</span><button type="button" onclick="loadStudentUploads()">Try again</button></div>`;
  }
}

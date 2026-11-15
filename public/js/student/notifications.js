"use strict";

let studentNotifications = [];

function notificationEscape(value) {
  return Security.escapeHTML(String(value ?? ''));
}

function renderStudentNotifications() {
  const list = document.getElementById('notification-list');
  if (!studentNotifications.length) {
    list.classList.add('notification-list-feedback');
    list.innerHTML = '<div class="notification-feedback notification-empty"><i class="bi bi-bell-slash"></i><strong>No notifications yet</strong><span>Submission updates will appear here.</span></div>';
    return;
  }
  list.classList.remove('notification-list-feedback');
  list.innerHTML = studentNotifications.map(item => {
    const approved = item.type === 'submission_approved';
    const declined = item.type === 'submission_declined';
    const status = approved ? 'Approved' : 'Declined';
    const icon = approved ? 'bi-check-circle-fill' : 'bi-x-circle-fill';
    const update = `<p class="notification-update">Your upload request was ${approved ? 'approved. Your thesis is now available in the repository.' : 'declined. Review the comment below and edit your submission.'}</p>`;
    const comment = declined ? `<div class="notification-comment"><strong>Administrator comment</strong><p>${notificationEscape(item.message)}</p></div>` : '';
    const correction = declined ? `<button class="notification-primary-action" type="button" onclick="openSubmissionCorrection(${Security.jsArg(item.thesisId)}, ${Security.jsArg(item.id)})"><i class="bi bi-pencil-square"></i> Edit submission</button>` : '';
    const view = approved ? `<a class="notification-view-action" href="/pages/student/repository.html?thesis=${encodeURIComponent(item.thesisId)}">View thesis</a>` : '';
    const readAction = item.readAt ? '<span class="notification-read-label">Read</span>' : `<button class="notification-read-action" type="button" onclick="markNotificationRead(${Security.jsArg(item.id)}, this)">Mark as read</button>`;
    return `<article class="notification-card ${item.readAt ? 'is-read' : 'is-unread'}">
      <div class="notification-card-heading"><div><span class="notification-status notification-status-${approved ? 'approved' : 'declined'}"><i class="bi ${icon}"></i>${status}</span><strong class="notification-thesis-title">${notificationEscape(item.title)}</strong></div><time>${notificationEscape(new Date(item.createdAt).toLocaleString())}</time></div>
      ${update}${comment}<div class="notification-actions">${view}${correction}${readAction}</div>
    </article>`;
  }).join('');
}

async function openSubmissionCorrection(thesisId, notificationId) {
  try {
    await repositoryRequest(`notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  } catch (_) {}
  window.location.href = `/pages/student/upload.html?submission=${encodeURIComponent(thesisId)}`;
}

async function loadStudentNotifications() {
  const list = document.getElementById('notification-list');
  list.classList.remove('notification-list-feedback');
  list.innerHTML = '<div class="notification-skeleton" aria-label="Loading notifications"><span></span><span></span><span></span></div>';
  try {
    const result = await repositoryRequest('notifications');
    studentNotifications = result.notifications || [];
    renderStudentNotifications();
    initNotificationBadge();
  } catch (error) {
    list.classList.add('notification-list-feedback');
    list.innerHTML = '<div class="notification-feedback notification-feedback-error"><i class="bi bi-exclamation-triangle"></i><strong>Notifications could not be loaded</strong><span>Refresh the page or try again in a moment.</span><button type="button" onclick="loadStudentNotifications()">Try again</button></div>';
  }
}

async function markNotificationRead(id, button) {
  button.disabled = true;
  try {
    const result = await repositoryRequest(`notifications/${encodeURIComponent(id)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const item = studentNotifications.find(notification => notification.id === id);
    if (item) item.readAt = result.readAt;
    renderStudentNotifications();
    initNotificationBadge();
  } catch (error) {
    button.disabled = false;
    showToast(error.message, 'danger');
  }
}

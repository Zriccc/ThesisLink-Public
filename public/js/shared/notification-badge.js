"use strict";

async function initNotificationBadge() {
  const badges = document.querySelectorAll('[data-notification-count]');
  if (!badges.length) return;
  try {
    const result = await repositoryRequest('notifications?summary=1');
    const unread = Number(result.unread) || 0;
    badges.forEach(badge => {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.hidden = unread === 0;
    });
  } catch (_) {
    badges.forEach(badge => { badge.hidden = true; });
  }
}

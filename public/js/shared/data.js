"use strict";

/* ══════════════════════════════════════════════════════
   DATA LAYER
══════════════════════════════════════════════════════ */

/** Runtime collections. Populate these from the backend API. */
const ACCOUNTS = [];
let DB = [];
const USERS_DATA = [];

/* ══════════════════════════════════════════════════════
   APP STATE
══════════════════════════════════════════════════════ */
let currentUser = null;
let repoFilters   = { text: '', title: '', year: '', course: '', adviser: '', author: '', views: '', sort: '' };
let searchFilters = { text: '', year: '', course: '', adviser: '', author: '' };

/* Recent activity is kept locally until a backend activity API is connected. */
const ACTIVITY_MAX = 1000;
let activityCache = [];
const ACTIVITY_TYPES = Object.freeze({
  submitted: 'Thesis submitted', uploaded: 'Thesis published',
  approved: 'Upload approved', declined: 'Upload declined',
  edited: 'Thesis edited', deleted: 'Thesis deleted',
  registered: 'Account registered',
  'extended account': 'Account validity extended',
  'deleted graduated student account': 'Graduated student account deleted',
  'created adviser account': 'Adviser account created',
  'created faculty account': 'Faculty account created',
});
const activityText = (value, limit) => String(value ?? '').slice(0, limit);

function getActivities() {
  return activityCache;
}

async function loadActivities() {
  if (currentUser?.role !== 'admin') return [];
  const response = await fetch('/api/repository/activity', { credentials: 'same-origin', cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Activity could not be loaded.');
  activityCache = result.activities.filter(entry => Object.hasOwn(ACTIVITY_TYPES, entry.type));
  return activityCache;
}

function recordActivity(type, actor, subject) {
  // Explicit allowlist: views, searches, downloads and navigation never write logs.
  if (!Object.hasOwn(ACTIVITY_TYPES, type)) return;
  const entry = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    type,
    actor: activityText(actor || 'Guest user', 120),
    subject: activityText(subject, 240),
    createdAt: new Date().toISOString(),
  };
  activityCache.unshift(entry);
  activityCache = activityCache.slice(0, ACTIVITY_MAX);
  window.dispatchEvent(new Event('activity-updated'));
  if (['extended account', 'deleted graduated student account', 'created adviser account', 'created faculty account'].includes(type)) {
    fetch('/api/repository/activity', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, subject: entry.subject }) }).catch(() => {});
  }
}

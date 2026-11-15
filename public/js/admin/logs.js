"use strict";
let logsPage = 1;
const LOGS_PAGE_SIZE = 25;

function renderLogs() {
  if (currentUser?.role !== 'admin') return;
  const query = document.getElementById('logs-search').value.trim().toLowerCase();
  const action = document.getElementById('logs-action').value;
  const cutoff = Date.now() - Number(document.getElementById('logs-period').value) * 86400000;
  const rows = getActivities().filter(entry => (!action || entry.type === action) &&
    Date.parse(entry.createdAt) > cutoff &&
    [entry.actor, entry.subject, ACTIVITY_TYPES[entry.type]].some(value => value.toLowerCase().includes(query)));
  const pages = Math.max(1, Math.ceil(rows.length / LOGS_PAGE_SIZE));
  logsPage = Math.max(1, Math.min(logsPage, pages));
  const body = document.getElementById('logs-tbody');
  body.replaceChildren();
  rows.slice((logsPage - 1) * LOGS_PAGE_SIZE, logsPage * LOGS_PAGE_SIZE).forEach(entry => {
    const row = document.createElement('tr');
    [new Date(entry.createdAt).toLocaleString(), entry.actor, ACTIVITY_TYPES[entry.type], entry.subject || '—'].forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      cell.style.overflowWrap = 'anywhere';
      row.append(cell);
    });
    body.append(row);
  });
  if (!rows.length) {
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'text-center text-muted py-4';
    cell.textContent = query || action ? 'No logs match these filters.' : 'No important activity recorded in this period.';
    const row = document.createElement('tr');
    row.append(cell);
    body.append(row);
  }
  document.getElementById('logs-count').textContent = `${rows.length} log${rows.length === 1 ? '' : 's'} · Page ${logsPage} of ${pages}`;
  document.getElementById('logs-prev').disabled = logsPage === 1;
  document.getElementById('logs-next').disabled = logsPage === pages;
}

function initLogs() {
  if (currentUser?.role !== 'admin') return;
  const select = document.getElementById('logs-action');
  Object.entries(ACTIVITY_TYPES).forEach(([value, label]) => select.add(new Option(label, value)));
  ['logs-search', 'logs-action', 'logs-period'].forEach(id => {
    document.getElementById(id).addEventListener(id === 'logs-search' ? 'input' : 'change', () => { logsPage = 1; renderLogs(); });
  });
  document.getElementById('logs-prev').addEventListener('click', () => { logsPage--; renderLogs(); });
  document.getElementById('logs-next').addEventListener('click', () => { logsPage++; renderLogs(); });
  window.addEventListener('activity-updated', renderLogs);
  window.addEventListener('focus', () => loadActivities().then(renderLogs).catch(() => {}));
  setInterval(renderLogs, 60000);
  renderLogs();
}

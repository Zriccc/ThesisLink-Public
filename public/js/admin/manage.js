"use strict";

function buildAdminGrid() {
  const cm = { BSCS: 'chip-cs', BSIT: 'chip-it', BSDSA: 'chip-dsa' };
  // Admin sees all with full controls
  document.getElementById('admin-grid').innerHTML = DB.length ? DB.map(t => `
    <div class="thesis-card" style="cursor:default;">
      <div class="tc-body">
        <div class="tc-header">
          <span class="chip ${cm[t.course] || 'chip-cs'}">${Security.escapeHTML(t.course)}</span>
          <span class="tc-year">${Security.escapeHTML(t.year)}</span>
        </div>
        <div class="tc-title" title="${Security.escapeHTML(t.title)}">${Security.escapeHTML(t.title)}</div>
        <div class="tc-author"><i class="bi bi-person-fill"></i> ${Security.escapeHTML(t.authors)}</div>
        <div class="tc-adviser"><i class="bi bi-mortarboard-fill"></i> ${Security.escapeHTML(t.adviser)}</div>
        <div class="tc-actions" style="margin-bottom:.9rem;">
          <button class="btn-sm-custom btn-view" onclick="openThesisModal(${Security.jsArg(t.id)})" style="font-size:.73rem;padding:5px 10px;">
            <i class="bi bi-eye-fill"></i> View
          </button>
          <button class="btn-sm-custom btn-qr" onclick="downloadQRForThesis(${Security.jsArg(t.id)},event)" style="font-size:.73rem;padding:5px 10px;">
            <i class="bi bi-qr-code"></i> QR
          </button>
          <button class="btn-edit-sm" onclick="openEditModal(${Security.jsArg(t.id)})" style="font-size:.73rem;padding:5px 10px;">
            <i class="bi bi-pencil-square"></i> Edit
          </button>
          <button class="btn-danger-sm" onclick="openDeleteModal(${Security.jsArg(t.id)})" style="font-size:.73rem;padding:5px 10px;">
            <i class="bi bi-trash-fill"></i> Delete
          </button>
        </div>
      </div>
      <div class="tc-footer">
        <span class="tc-views"><i class="bi bi-eye-fill"></i> ${Security.escapeHTML(t.views)} views</span>
        <span class="tc-views" style="font-family:var(--font-mono);">${Security.escapeHTML(t.uploadedAt || t.year)}</span>
      </div>
    </div>`).join('') : '<div class="empty-state"><div class="empty-icon"><i class="bi bi-inbox"></i></div><p>No thesis records are available yet.</p></div>';
}

/* Adviser: My Uploads page */

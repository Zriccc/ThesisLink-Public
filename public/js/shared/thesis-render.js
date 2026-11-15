"use strict";

const REPOSITORY_PAGE_SIZE = 10;
let repositoryPage = 1;
let repositoryResultKey = '';

function installThesisViewerModals() {
  if (!document.getElementById('thesis-modal')) document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="thesis-modal">
      <div class="modal-box">
        <div class="modal-header"><div class="modal-title-text" id="m-title"></div><button type="button" class="modal-close" aria-label="Close thesis details" onclick="closeModal('thesis-modal')"><i class="bi bi-x-lg"></i></button></div>
        <div class="modal-body"><div class="meta-row" id="m-meta"></div><div class="section-divider">Abstract</div><div class="abstract-text" id="m-abstract"></div><div id="m-chapters"></div></div>
      </div>
    </div>`);
  if (!document.getElementById('file-viewer-modal')) document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="file-viewer-modal">
      <div class="modal-box" style="max-width:920px;width:96vw;padding:0;overflow:hidden;">
        <div class="fv-header"><div class="fv-header-info"><span class="fv-header-icon" id="fv-icon"><i class="bi bi-file-earmark-text-fill"></i></span><div><div class="fv-header-title" id="fv-title">File</div><div class="fv-header-sub" id="fv-sub">View Only</div></div></div><div style="display:flex;gap:8px;align-items:center;"><span class="fv-view-badge"><i class="bi bi-eye-fill"></i> View Only</span><button type="button" class="fv-close-btn" aria-label="Close file viewer" onclick="closeModal('file-viewer-modal')"><i class="bi bi-x-lg"></i></button></div></div>
        <div id="fv-body" class="fv-body"></div>
      </div>
    </div>`);
}

function paginationMarkup(page, pages, total, handler) {
  if (!total) return '';
  const first = (page - 1) * REPOSITORY_PAGE_SIZE + 1;
  const last = Math.min(page * REPOSITORY_PAGE_SIZE, total);
  return `<nav class="repository-pagination" aria-label="Repository pages">
    <span>${first}-${last} of ${total}</span>
    <div>
      <button type="button" onclick="${handler}(-1)" ${page === 1 ? 'disabled' : ''}>Previous</button>
      <span>Page ${page} of ${pages}</span>
      <button type="button" onclick="${handler}(1)" ${page === pages ? 'disabled' : ''}>Next</button>
    </div>
  </nav>`;
}

function renderThesisGrid(gridId, data, F, showPrompt = false) {
  const g = document.getElementById(gridId);
  g.classList.remove('repository-table-mode');
  if (showPrompt) {
    g.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="bi bi-search"></i></div><p>Type in the search bar above to find research studies.</p></div>`;
    return;
  }
  if (!data.length) {
    g.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="bi bi-inbox"></i></div><p>No studies match your search.</p></div>`;
    return;
  }
  const cm = { BSCS: 'chip-cs', BSIT: 'chip-it', BSDSA: 'chip-dsa' };
  g.innerHTML = data.map(t => `
    <div class="thesis-card" onclick="openThesisModal(${Security.jsArg(t.id)})">
      <div class="tc-body">
        <div class="tc-header">
          <span class="chip ${cm[t.course] || 'chip-cs'}">${Security.escapeHTML(t.course)}</span>
          <span class="tc-year">${Security.escapeHTML(t.year)}</span>
        </div>
        <button type="button" class="tc-title thesis-title-link" title="View ${Security.escapeHTML(t.title)} files"
                onclick="openThesisModal(${Security.jsArg(t.id)}); event.stopPropagation()">${Security.escapeHTML(t.title)}</button>
        <div class="tc-author"><i class="bi bi-person-fill"></i> ${Security.escapeHTML(t.authors)}</div>
        <div class="tc-adviser"><i class="bi bi-mortarboard-fill"></i> ${Security.escapeHTML(t.adviser)}</div>
        <div class="tc-abstract">${Security.escapeHTML(t.abstract)}</div>
      </div>
      <div class="tc-footer">
        <span class="tc-views"><i class="bi bi-eye-fill"></i> ${Security.escapeHTML(t.views)} views</span>
        <div class="tc-actions">
          <button class="btn-sm-custom btn-qr" onclick="openQRModal(${Security.jsArg(t.id)}, event)"><i class="bi bi-qr-code"></i> QR</button>
          <button class="btn-sm-custom btn-view" onclick="openThesisModal(${Security.jsArg(t.id)}); event.stopPropagation()"><i class="bi bi-eye-fill"></i> View</button>
        </div>
      </div>
    </div>`).join('');
}

function renderRepositoryTable(gridId, data) {
  const container = document.getElementById(gridId);
  container.classList.add('repository-table-mode');

  const courseMap = { BSCS: 'chip-cs', BSIT: 'chip-it', BSDSA: 'chip-dsa' };
  const isReadOnly = !currentUser || currentUser.role !== 'admin';
  container.innerHTML = `
    <div class="repository-table-wrap">
      <table class="data-table repository-results-table ${isReadOnly ? 'repository-results-readonly' : ''}">
        <thead><tr><th>Title</th><th>Program</th><th>Year</th><th>Views</th>${isReadOnly ? '' : '<th>Actions</th>'}</tr></thead>
        <tbody>${data.map(thesis => `
          <tr onclick="openThesisModal(${Security.jsArg(thesis.id)})" tabindex="0"
              onkeydown="if(event.key==='Enter'){openThesisModal(${Security.jsArg(thesis.id)})}">
            <td><button type="button" class="repository-table-title thesis-title-link"
                        onclick="openThesisModal(${Security.jsArg(thesis.id)}); event.stopPropagation()"
                        aria-label="View files for ${Security.escapeHTML(thesis.title)}">${Security.escapeHTML(thesis.title)}</button></td>
            <td><span class="chip ${courseMap[thesis.course] || 'chip-cs'}">${Security.escapeHTML(thesis.course)}</span></td>
            <td>${Security.escapeHTML(thesis.year)}</td>
            <td><i class="bi bi-eye-fill"></i> ${Security.escapeHTML(thesis.views)}</td>
            ${isReadOnly ? '' : `<td class="repository-actions-cell" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()">
                <div class="dropdown repository-actions-menu">
                  <button type="button" class="repository-actions-toggle" data-bs-toggle="dropdown" data-bs-boundary="viewport" aria-expanded="false" aria-label="Thesis actions" title="Actions"><i class="bi bi-three-dots-vertical"></i></button>
                  <div class="dropdown-menu dropdown-menu-end repository-actions-popover">
                    <button type="button" class="dropdown-item" onclick="openQRModal(${Security.jsArg(thesis.id)}, event)"><i class="bi bi-qr-code"></i> QR Code</button>
                    <button type="button" class="dropdown-item" onclick="openEditModal(${Security.jsArg(thesis.id)})"><i class="bi bi-pencil-square"></i> Edit</button>
                    <button type="button" class="dropdown-item danger" onclick="openDeleteModal(${Security.jsArg(thesis.id)})"><i class="bi bi-trash-fill"></i> Delete</button>
                  </div>
                </div>
              </td>`}
          </tr>`).join('') || `<tr class="table-empty-row"><td colspan="${isReadOnly ? 4 : 5}"><div class="table-empty-content"><i class="bi bi-inbox" aria-hidden="true"></i><strong>No studies match your search or filters.</strong><span>Records will appear here when available.</span></div></td></tr>`}</tbody>
      </table>
    </div>`;
}

function renderRepositoryResults(gridId, data, filters = {}) {
  const resultKey = JSON.stringify(filters) + ':' + data.map(thesis => thesis.id).join(',');
  if (resultKey !== repositoryResultKey) {
    repositoryPage = 1;
    repositoryResultKey = resultKey;
  }
  const pages = Math.max(1, Math.ceil(data.length / REPOSITORY_PAGE_SIZE));
  repositoryPage = Math.min(repositoryPage, pages);
  const start = (repositoryPage - 1) * REPOSITORY_PAGE_SIZE;
  renderRepositoryTable(gridId, data.slice(start, start + REPOSITORY_PAGE_SIZE));
  const grid = document.getElementById(gridId);
  grid.parentElement.querySelectorAll(':scope > .repository-pagination').forEach(pagination => pagination.remove());
  grid.insertAdjacentHTML('afterend', paginationMarkup(repositoryPage, pages, data.length, 'changeRepositoryPage'));
}

function changeRepositoryPage(direction) {
  repositoryPage += direction;
  applyRender('repo-grid', 'rss-pills', repoFilters);
  document.querySelector('#repo-grid .repository-table-wrap')?.scrollTo({ top: 0, left: 0 });
}

/* ══════════════════════════════════════════════════════
   THESIS MODAL
══════════════════════════════════════════════════════ */
const recordedThesisViews = new Set();
async function recordThesisView(thesis) {
  if (recordedThesisViews.has(String(thesis.id))) return;
  recordedThesisViews.add(String(thesis.id));
  try {
    const result = await repositoryRequest(`theses/${encodeURIComponent(thesis.id)}/view`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: '{}' });
    thesis.views = Number(result.views) || 0;
    const counter = document.getElementById('m-view-count');
    if (counter?.dataset.thesisId === String(thesis.id)) counter.textContent = thesis.views;
  } catch (_) {
    recordedThesisViews.delete(String(thesis.id));
  }
}

function prepareThesisModalLayout() {
  const meta = document.getElementById('m-meta');
  const modalBody = meta?.parentElement;
  if (!meta || !modalBody) return;

  let approvalZone = document.getElementById('m-approval');
  if (!approvalZone) {
    approvalZone = document.createElement('div');
    approvalZone.id = 'm-approval';
    modalBody.insertBefore(approvalZone, meta);
  }

  let infoHeading = document.getElementById('m-info-heading');
  if (!infoHeading) {
    infoHeading = document.createElement('div');
    infoHeading.id = 'm-info-heading';
    infoHeading.className = 'section-divider';
    infoHeading.textContent = 'Thesis Information';
    modalBody.insertBefore(infoHeading, meta);
  }

  approvalZone.innerHTML = '';
}

async function openThesisModal(id, countView = true, approvalFirstLayout = false) {
  const t = DB.find(x => String(x.id) === String(id));
  if (!t) return;
  if (countView) recordThesisView(t);

  if (approvalFirstLayout) prepareThesisModalLayout();
  document.getElementById('m-title').textContent = t.title;
  document.getElementById('m-meta').innerHTML = `
    <div class="meta-item"><strong>Authors:</strong> ${Security.escapeHTML(t.authors)}</div>
    <div class="meta-item"><strong>Adviser:</strong> ${Security.escapeHTML(t.adviser)}</div>
    <div class="meta-item"><strong>Year:</strong> ${Security.escapeHTML(t.year)}</div>
    <div class="meta-item"><strong>Program:</strong> ${Security.escapeHTML(t.course)}</div>
    <div class="meta-item"><strong>Views:</strong> <i class="bi bi-eye-fill"></i> <span id="m-view-count" data-thesis-id="${Security.escapeHTML(t.id)}">${Security.escapeHTML(t.views)}</span></div>`;
  document.getElementById('m-abstract').textContent = t.abstract;

  const isGuest = currentUser && currentUser.role === 'guest';
  const thesisModalBox = document.querySelector('#thesis-modal .modal-box');
  thesisModalBox?.classList.toggle('guest-thesis-reading-view', Boolean(isGuest));

  if (isGuest && !t.parts?.full) {
    // Guest without file access
    document.getElementById('m-chapters').innerHTML =
      `<div class="guest-lock"><i class="bi bi-lock-fill"></i> No preview available. Sign in with an institutional email to access the full thesis file.</div>`;
  } else if (isGuest) {
    renderGuestFileLinks(t);
  } else if (t.parts?.full) {
    // Uploaded thesis — single file
    const p = t.parts.full;
    const isPdf = (p.ext === '.pdf') || (p.name||'').toLowerCase().endsWith('.pdf');
    const approval = t.parts.approval;
    const approvalHtml = approval ? `
         <div class="section-divider" style="margin-top:1rem;">Approval Sheet <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:.75rem;color:var(--mut);">(View Only)</span></div>
         <div class="chapter-item">
           <div style="display:flex;align-items:center;gap:.6rem;min-width:0;">
             <span style="font-size:1.4rem;"><i class="bi bi-file-earmark-image-fill"></i></span>
             <div style="min-width:0;">
               <div class="chapter-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Security.escapeHTML(approval.name)}</div>
               <div style="font-size:.72rem;color:var(--mut);margin-top:1px;">${fmtBytes(approval.size)}</div>
             </div>
           </div>
           <button type="button" class="thesis-file-view"
                   aria-label="View approval sheet" onclick="openFileViewer(${Security.jsArg(t.id)},'approval')"><i class="bi bi-eye-fill"></i> View</button>
         </div>` : '';
    if (approvalFirstLayout) document.getElementById('m-approval').innerHTML = approvalHtml;
    document.getElementById('m-chapters').innerHTML =
      `<div class="section-divider">Thesis File <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:.75rem;color:var(--mut);">(View Only)</span></div>
       <div class="chapter-list">
         <div class="chapter-item">
           <div style="display:flex;align-items:center;gap:.6rem;min-width:0;">
             <span style="font-size:1.4rem;"><i class="bi ${isPdf ? 'bi-file-earmark-pdf-fill' : 'bi-file-earmark-text-fill'}"></i></span>
             <div style="min-width:0;">
               <div class="chapter-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Security.escapeHTML(p.name)}</div>
               <div style="font-size:.72rem;color:var(--mut);margin-top:1px;">${fmtBytes(p.size)}</div>
             </div>
           </div>
           <button type="button" class="thesis-file-view"
                   aria-label="View full thesis file" onclick="openFileViewer(${Security.jsArg(t.id)},'full')"><i class="bi bi-eye-fill"></i> View</button>
         </div>
         ${approvalFirstLayout ? '' : approvalHtml}
       </div>`;
  } else {
    document.getElementById('m-chapters').innerHTML =
      `<div class="section-divider">Thesis File</div>
       <div style="padding:.9rem 1rem;background:var(--gbg);border:1px solid var(--bdr);border-radius:9px;
                   font-size:.84rem;color:var(--mut);text-align:center;">
         <i class="bi bi-folder2-open"></i> No file uploaded yet for this thesis.
       </div>`;
  }

  openModal('thesis-modal');
  if (isGuest) protectGuestThesisReadingView();
}

function renderGuestFileLinks(thesis) {
  const file = thesis.parts.full;
  const approval = thesis.parts.approval;
  const fileName = String(file.name || 'Thesis document');
  const isPdf = String(file.ext || '').toLowerCase() === '.pdf' || fileName.toLowerCase().endsWith('.pdf');

  const approvalFile = approval ? `
    <div class="section-divider">Approval Sheet <span class="guest-view-only-label">(View Only)</span></div>
    <button type="button" class="viewer-file-card" onclick="closeModal('thesis-modal'); openFileViewer(${Security.jsArg(thesis.id)},'approval')">
      <span class="viewer-file-icon"><i class="bi bi-file-earmark-image-fill"></i></span>
      <span class="viewer-file-details">
        <strong>${guestEscape(approval.name || 'Approval sheet')}</strong>
        <small>Approval Sheet · ${fmtBytes(approval.size)}</small>
      </span>
      <span class="viewer-file-action"><i class="bi bi-eye-fill"></i> View</span>
    </button>` : '';

  document.getElementById('m-chapters').innerHTML = `
    <div class="section-divider">Full Thesis <span class="guest-view-only-label">(View Only)</span></div>
    <button type="button" class="viewer-file-card" onclick="closeModal('thesis-modal'); openFileViewer(${Security.jsArg(thesis.id)},'full')">
      <span class="viewer-file-icon"><i class="bi ${isPdf ? 'bi-file-earmark-pdf-fill' : 'bi-file-earmark-text-fill'}"></i></span>
      <span class="viewer-file-details">
        <strong>${guestEscape(fileName)}</strong>
        <small>${isPdf ? 'PDF Document' : 'Document'} · ${fmtBytes(file.size)}</small>
      </span>
      <span class="viewer-file-action"><i class="bi bi-eye-fill"></i> View</span>
    </button>
    ${approvalFile}`;
}

function renderGuestInlineThesis(thesis) {
  const file = thesis.parts.full;
  if (!Security.safeFileURL(file?.dataURL)) {
    document.getElementById('m-chapters').textContent = 'Document preview is unavailable. Re-upload a valid file.';
    return;
  }
  const approval = thesis.parts.approval;
  const fileName = String(file.name || 'Thesis document');
  const extension = String(file.ext || '').toLowerCase();
  const isPdf = extension === '.pdf' || fileName.toLowerCase().endsWith('.pdf');
  const isDocx = ['.doc', '.docx'].includes(extension) || /\.docx?$/.test(fileName.toLowerCase());
  const zoneId = `guest-inline-doc-${String(thesis.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;

  let documentPreview = '';
  if (isPdf) {
    documentPreview = `<iframe class="guest-inline-pdf" src="${Security.safeFileURL(file.dataURL)}#toolbar=0&navpanes=0" title="${guestEscape(fileName)}" oncontextmenu="return false"></iframe>`;
  } else if (isDocx) {
    documentPreview = `<div class="guest-inline-docx" id="${zoneId}"><div class="guest-inline-loading"><i class="bi bi-hourglass-split"></i> Rendering thesis document…</div></div>`;
  } else {
    documentPreview = `<div class="guest-inline-unavailable"><i class="bi bi-file-earmark-text-fill"></i><span>This file format cannot be previewed in the browser.</span></div>`;
  }

  const approvalPreview = approval?.dataURL ? `
    <div class="section-divider">Approval Sheet <span class="guest-view-only-label">(View Only)</span></div>
    <figure class="guest-inline-approval">
      <img src="${Security.safeFileURL(approval.dataURL, 'approval')}" alt="${guestEscape(approval.name || 'Approval sheet')}" />
      <figcaption>${guestEscape(approval.name || 'Approval sheet')}</figcaption>
    </figure>` : '';

  document.getElementById('m-chapters').innerHTML = `
    <div class="section-divider">Full Thesis <span class="guest-view-only-label">(View Only)</span></div>
    <div class="guest-inline-document">${documentPreview}</div>
    ${approvalPreview}`;

  if (isDocx) renderGuestDocxInline(file, zoneId);
}

function protectGuestThesisReadingView() {
  const modal = document.getElementById('thesis-modal');
  if (!modal || modal.dataset.guestProtectionReady === 'true') return;
  modal.dataset.guestProtectionReady = 'true';
  modal.addEventListener('contextmenu', event => event.preventDefault());
  modal.addEventListener('dragstart', event => event.preventDefault());
  modal.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && ['p', 's'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      showToast('This thesis is available for viewing only');
    }
  }, true);
}

function renderGuestDocxInline(file, zoneId) {
  const zone = document.getElementById(zoneId);
  if (!zone || typeof mammoth === 'undefined') return;
  try {
    const binary = atob(file.dataURL.split(',')[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    mammoth.convertToHtml({ arrayBuffer: bytes.buffer })
      .then(result => { zone.innerHTML = `<article class="guest-document-page">${Security.documentHTML(result.value)}</article>`; })
      .catch(() => { zone.innerHTML = '<div class="guest-inline-unavailable">Document preview is unavailable.</div>'; });
  } catch (error) {
    zone.innerHTML = '<div class="guest-inline-unavailable">Document preview is unavailable.</div>';
  }
}

/* ── FILE VIEWER ─────────────────────────────────────── */
async function openThesisFiles(thesisId) {
  const t = DB.find(x => String(x.id) === String(thesisId));
  if (!t) { showToast('Thesis not found'); return; }
  const firstPart = t.parts?.full
    ? 'full'
    : (t.parts?.approval ? 'approval' : '');

  if (!firstPart) {
    showToast('No viewable files are attached to this thesis');
    return;
  }

  recordThesisView(t);
  await openFileViewer(thesisId, firstPart);
}

function renderFileViewerTabs(t, activePart) {
  const availableParts = [
    { key: 'full', label: 'Thesis File' },
    { key: 'approval', label: 'Approval Sheet' },
  ].filter(item => t.parts?.[item.key]);

  if (availableParts.length < 2) return '';

  return `<div class="fv-document-tabs" role="tablist" aria-label="Thesis documents">
    ${availableParts.map(item => `<button type="button" role="tab"
      class="fv-document-tab ${item.key === activePart ? 'active' : ''}"
      aria-selected="${item.key === activePart}"
      onclick="openFileViewer(${Security.jsArg(t.id)},'${item.key}')">
      ${item.label}
    </button>`).join('')}
  </div>`;
}

let pdfRenderSequence = 0;
let activePdfDocument = null;
let activePdfObserver = null;

function disposePdfViewer() {
  pdfRenderSequence++;
  activePdfObserver?.disconnect();
  activePdfObserver = null;
  if (activePdfDocument) activePdfDocument.destroy().catch(() => {});
  activePdfDocument = null;
}

function dataURLBytes(dataURL) {
  const encoded = String(dataURL || '').split(',')[1];
  if (!encoded) throw new Error('PDF data is missing.');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function renderPdfDocument(p) {
  const zone = document.getElementById('pdf-render-zone');
  if (!zone) return;
  const sequence = pdfRenderSequence;

  try {
    const pdfjs = await import('/vendor/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs-dist/build/pdf.worker.mjs';
    const pdf = await pdfjs.getDocument({ data: dataURLBytes(p.dataURL), isEvalSupported: false }).promise;
    if (sequence !== pdfRenderSequence || !document.getElementById('pdf-render-zone')) {
      await pdf.destroy();
      return;
    }
    activePdfDocument = pdf;

    zone.innerHTML = '';
    zone.setAttribute('aria-busy', 'false');
    zone.setAttribute('aria-label', `${pdf.numPages} page PDF document`);
    const pageEntries = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const initial = page.getViewport({ scale: 1 });
      const shell = document.createElement('section');
      shell.className = 'fv-pdf-page';
      shell.dataset.page = String(pageNumber);
      shell.style.aspectRatio = `${initial.width} / ${initial.height}`;
      shell.setAttribute('aria-label', `Page ${pageNumber} of ${pdf.numPages}`);
      shell.innerHTML = `<span>Page ${pageNumber}</span>`;
      zone.appendChild(shell);
      pageEntries.push({ page, shell });
    }

    const renderPage = async entry => {
      if (entry.shell.dataset.rendered || sequence !== pdfRenderSequence) return;
      entry.shell.dataset.rendered = 'true';
      const base = entry.page.getViewport({ scale: 1 });
      const cssWidth = Math.max(280, Math.min(1100, zone.clientWidth - 20));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = entry.page.getViewport({ scale: (cssWidth / base.width) * pixelRatio });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
      canvas.style.height = 'auto';
      canvas.setAttribute('aria-label', entry.shell.getAttribute('aria-label'));
      entry.shell.replaceChildren(canvas);
      await entry.page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.filter(entry => entry.isIntersecting).forEach(entry => {
          const item = pageEntries.find(candidate => candidate.shell === entry.target);
          if (item) renderPage(item).catch(() => { item.shell.innerHTML = '<span>Page preview unavailable</span>'; });
          observer.unobserve(entry.target);
        });
      }, { root: document.getElementById('fv-body'), rootMargin: '900px 0px' });
      activePdfObserver = observer;
      pageEntries.forEach(entry => observer.observe(entry.shell));
    } else {
      for (const entry of pageEntries) await renderPage(entry);
    }
  } catch (error) {
    if (sequence === pdfRenderSequence) zone.innerHTML = '<div class="fv-preview-error"><i class="bi bi-file-earmark-pdf-fill"></i><strong>PDF preview unavailable</strong><span>Close the viewer and try opening the document again.</span></div>';
  }
}

async function openFileViewer(thesisId, partKey) {
  if (!['full', 'approval'].includes(partKey)) { showToast('Invalid file selection', 'danger'); return; }
  // Support both string and number IDs
  const t = DB.find(x => String(x.id) === String(thesisId));
  if (!t) { showToast('Thesis not found'); return; }
  let p = t.parts && t.parts[partKey];
  if (!p) { showToast('File not found'); return; }
  disposePdfViewer();
  const viewerRequest = pdfRenderSequence;
  if (partKey !== 'approval' && typeof hydrateThesisFiles === 'function') await hydrateThesisFiles(t, [partKey]);
  if (viewerRequest !== pdfRenderSequence) return;

  p = t.parts && t.parts[partKey];
  if (partKey !== 'approval') {
    if (p.loadError) { showToast('The document could not be loaded. Check your connection or sign in again, then retry.', 'danger'); return; }
    if (!Security.safeFileURL(p.dataURL, partKey)) { showToast('The document could not be opened. Please try again.', 'danger'); return; }
  }

  const isPdf = (p.ext === '.pdf') || (p.name||'').toLowerCase().endsWith('.pdf');
  const isDocx = (p.ext === '.docx') || (p.ext === '.doc') ||
                 (p.name||'').toLowerCase().endsWith('.docx') ||
                 (p.name||'').toLowerCase().endsWith('.doc');
  const isImage = (p.type || '').startsWith('image/') ||
                  ['.jpg', '.jpeg', '.png', '.webp'].includes((p.ext || '').toLowerCase());

  // Update header
  document.getElementById('fv-icon').innerHTML  = isPdf ? '<i class="bi bi-file-earmark-pdf-fill"></i>' : '<i class="bi bi-file-earmark-text-fill"></i>';
  document.getElementById('fv-title').textContent = p.name || 'File';
  document.getElementById('fv-sub').textContent   = isPdf
    ? 'PDF Document · ' + fmtBytes(p.size)
    : 'Word Document · ' + fmtBytes(p.size);

  let viewerContent = '';

  if (isImage) {
    document.getElementById('fv-icon').innerHTML = '<i class="bi bi-image-fill"></i>';
    document.getElementById('fv-sub').textContent = 'Approval Sheet Image · ' + fmtBytes(p.size);
  }

  if (isImage) {
    const approvalViewURL = `/api/repository/theses/${encodeURIComponent(t.id)}/files/approval?view=1`;
    viewerContent = `
      <div class="approval-image-viewer">
        <img id="approval-viewer-image" src="${approvalViewURL}" alt="${Security.escapeHTML(p.name || 'Approval sheet')}" />
      </div>`;
  } else if (isPdf) {
    viewerContent = `<div class="fv-pdf-viewer"><div id="pdf-render-zone" class="fv-pdf-pages" role="document" aria-busy="true"><div class="fv-pdf-loading"><i class="bi bi-hourglass-split"></i><span>Preparing document…</span></div></div></div>`;
  } else if (isDocx) {
    // DOCX: render as HTML with mammoth.js; never fall back to a download action.
    viewerContent = `
      <div style="padding:2rem;min-height:300px;" id="docx-render-zone">
        <div style="text-align:center;padding:2rem;color:var(--mut);">
          <div style="font-size:2.5rem;margin-bottom:1rem;"><i class="bi bi-hourglass-split"></i></div>
          <div>Rendering document…</div>
        </div>
      </div>`;
    // We'll render after inserting HTML
    setTimeout(() => renderDocx(p), 100);
  } else {
    viewerContent = `
      <div style="text-align:center;padding:3rem 2rem;background:var(--gbg);">
        <div style="font-size:3rem;margin-bottom:1rem;"><i class="bi bi-paperclip"></i></div>
        <div style="font-family:var(--font-serif);font-size:1.05rem;font-weight:700;color:var(--gdk);margin-bottom:1rem;">${Security.escapeHTML(p.name)}</div>
        <p style="font-size:.83rem;color:var(--mut);margin:0;">This file type cannot be shown in the view-only reader.</p>
      </div>`;
  }

  const viewerBody = document.getElementById('fv-body');
  viewerBody.classList.toggle('approval-mode', isImage);
  viewerBody.innerHTML = renderFileViewerTabs(t, partKey) + viewerContent;

  if (isImage) {
    document.getElementById('approval-viewer-image')?.addEventListener('error', event => {
      event.currentTarget.closest('.approval-image-viewer').innerHTML = '<div class="fv-preview-error"><i class="bi bi-file-earmark-image-fill"></i><strong>Approval sheet unavailable</strong><span>Sign in again, then retry opening this approval sheet.</span></div>';
    }, { once: true });
  }

  openModal('file-viewer-modal');
  if (isPdf) renderPdfDocument(p);
  if (isDocx) {
    setTimeout(() => renderDocx(p), 150);
  }

  protectViewOnlyViewer();
  
  // Add guest viewing protections
  if (currentUser && currentUser.role === 'guest') {
    protectGuestViewer();
  }
}

function protectViewOnlyViewer() {
  const modal = document.getElementById('file-viewer-modal');
  if (!modal || modal.dataset.viewOnlyProtected === 'true') return;
  modal.dataset.viewOnlyProtected = 'true';

  modal.addEventListener('keydown', event => {
    const blockedShortcut = (event.ctrlKey || event.metaKey) &&
      ['p', 's'].includes(String(event.key).toLowerCase());
    if (!blockedShortcut) return;
    event.preventDefault();
    showToast('Printing and saving are unavailable in the view-only reader');
  }, true);

  modal.addEventListener('contextmenu', event => {
    event.preventDefault();
    showToast('The context menu is unavailable in the view-only reader');
  }, true);
}

function renderDocx(p) {
  const zone = document.getElementById('docx-render-zone');
  if (!zone) return;

  // Try mammoth if loaded
  if (typeof mammoth !== 'undefined') {
    // Convert base64 dataURL to ArrayBuffer
    const base64 = p.dataURL.split(',')[1];
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    mammoth.convertToHtml({ arrayBuffer: bytes.buffer })
      .then(result => {
        zone.innerHTML = `
          <div style="max-width:780px;margin:0 auto;padding:2rem;font-family:var(--font-sans);font-size:.92rem;line-height:1.7;color:#222;background:white;min-height:400px;box-shadow:0 0 0 1px var(--bdr);">
            ${Security.documentHTML(result.value)}
          </div>`;
      })
      .catch(() => showDocxFallback(zone, p));
  } else {
    showDocxFallback(zone, p);
  }
}

function showDocxFallback(zone, p) {
  zone.innerHTML = `
    <div style="text-align:center;padding:3rem 2rem;background:var(--gbg);border-radius:12px;border:1px solid var(--bdr);margin:1.5rem;">
      <div style="font-size:3rem;margin-bottom:1rem;"><i class="bi bi-file-earmark-text-fill"></i></div>
      <div style="font-family:var(--font-serif);font-size:1.05rem;font-weight:700;color:var(--gdk);margin-bottom:.5rem;">${Security.escapeHTML(p.name)}</div>
      <div style="font-size:.82rem;color:var(--mut);margin-bottom:1.5rem;">Word Document · ${fmtBytes(p.size)}</div>
      <p style="font-size:.83rem;color:var(--mut);margin:0;">
        A view-only preview is unavailable for this document.
      </p>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   QR MODAL
══════════════════════════════════════════════════════ */
function openQRModal(id, e) {
  if (e) e.stopPropagation();
  const t = DB.find(x => String(x.id) === String(id));
  if (!t) return;

  document.getElementById('qr-title').textContent = t.title;

  const qrBox = document.getElementById('qr-box');
  qrBox.innerHTML = '';
  const qrDiv = document.createElement('div');
  qrBox.appendChild(qrDiv);
  new QRCode(qrDiv, {
    text: 'https://www.thesislinkedu.org/thesis/' + t.id,
    width: 210, height: 210,
    colorDark: '#185f37', colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H,
  });

  document.getElementById('qr-dl-btn').onclick = () => {
    generateAndDownloadQR(t, () => showToast('QR Code downloaded!'));
  };

  addQRPrintHint('qr-dl-btn');
  openModal('qr-modal');
}


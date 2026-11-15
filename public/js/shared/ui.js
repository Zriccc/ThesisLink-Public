"use strict";

/* Toast notifications */
let toastTimer = null;
function showToast(msg, type) {
  if (!type) {
    if (/not found|not available|too large|only pdf|only docx|disabled|failed|required first|not uploaded/i.test(msg)) type = 'danger';
    else if (/required|please|fill in|attach|enter a|answer all|cannot be undone/i.test(msg)) type = 'warning';
    else if (/success|published|updated|saved|downloaded|deleted|submitted|approved|created|found|attached/i.test(msg)) type = 'success';
    else type = 'info';
  }
  const icons = { success: 'bi-check-circle-fill', danger: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill', info: 'bi-info-circle-fill' };
  if (!Object.hasOwn(icons, type)) type = 'info';
  const el = document.getElementById('toast-el');
  el.innerHTML = `<i class="bi ${icons[type]} me-2"></i>${Security.escapeHTML(msg)}`;
  el.className = 'toast-custom toast-' + type + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}



/* Modal open/close */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  if (id === 'file-viewer-modal' && typeof disposePdfViewer === 'function') disposePdfViewer();
}


/* Mobile sidebar */
function toggleMobileSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.querySelector('.sidebar-overlay').classList.toggle('open');
}
function closeMobileSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay').classList.remove('open');
  document.getElementById('menu-toggle')?.focus();
}
function installMobileSidebarBackButton() {
  const header = document.querySelector('.sidebar .sb-hd');
  if (!header || header.querySelector('.sidebar-back-btn')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sidebar-back-btn';
  button.setAttribute('aria-label', 'Back to main content');
  button.innerHTML = '<i class="bi bi-arrow-left" aria-hidden="true"></i>';
  button.addEventListener('click', closeMobileSidebar);
  header.appendChild(button);
}
installMobileSidebarBackButton();

/* Filter dropdown toggle (search + guest) */
function toggleFilterDropdown(id) {
  const menu = document.getElementById(id);
  
  // Close other dropdowns
  document.querySelectorAll('.guest-filter-menu').forEach(m => {
    if (m.id !== id) m.classList.remove('active');
  });
  
  // Toggle current dropdown
  menu.classList.toggle('active');
}

function clearUploadValidationErrors() {
  document.querySelectorAll('.upload-invalid').forEach(el => {
    el.classList.remove('upload-invalid');
    el.removeAttribute('aria-invalid');
  });
  document.querySelectorAll('.upload-field-error').forEach(el => { el.textContent = ''; });
}

function showUploadValidationErrors(items) {
  clearUploadValidationErrors();
  items.forEach(({ fieldId, label, visualId, message }) => {
    const field = document.getElementById(fieldId);
    const visual = document.getElementById(visualId || fieldId) || field;
    if (!visual) return;
    visual.classList.add('upload-invalid');
    visual.setAttribute('aria-invalid', 'true');
    let error = document.getElementById(fieldId + '-error');
    if (!error) {
      error = document.createElement('p');
      error.id = fieldId + '-error';
      error.className = 'upload-field-error';
      visual.insertAdjacentElement('afterend', error);
    }
    error.textContent = message || `${label} is required.`;
    if (field) field.setAttribute('aria-describedby', error.id);
  });
  const first = items[0];
  const firstField = first && document.getElementById(first.fieldId);
  const firstVisual = first && (document.getElementById(first.visualId || first.fieldId) || firstField);
  firstVisual?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast(items.some(item => item.message) ? 'Correct the highlighted fields.' : 'Complete the highlighted required fields.', 'warning');
  if (firstField && firstField.type !== 'file') setTimeout(() => firstField.focus({ preventScroll: true }), 350);
}

function showUploadValidationError(fieldId, label, visualId) {
  showUploadValidationErrors([{ fieldId, label, visualId }]);
}

document.addEventListener('input', event => {
  if (event.target.matches('.fg-input, .fg-select, .fg-textarea')) {
    event.target.classList.remove('upload-invalid');
    event.target.removeAttribute('aria-invalid');
    const error = document.getElementById(event.target.id + '-error');
    if (error) error.textContent = '';
  }
});

function toggleGuestFilterPanel(event) {
  if (event) event.stopPropagation();
  const panel = document.getElementById('guest-filter-panel');
  const button = document.querySelector('.guest-filter-toggle');
  if (!panel || !button) return;
  const isOpen = panel.classList.toggle('open');
  button.classList.toggle('active', isOpen);
  button.setAttribute('aria-expanded', String(isOpen));
}

document.addEventListener('click', event => {
  const wrap = document.querySelector('.guest-filter-panel-wrap');
  if (!wrap || wrap.contains(event.target)) return;
  const panel = document.getElementById('guest-filter-panel');
  const button = document.querySelector('.guest-filter-toggle');
  if (panel) panel.classList.remove('open');
  if (button) {
    button.classList.remove('active');
    button.setAttribute('aria-expanded', 'false');
  }
});


function titleSortControl(value, handler, extraOptions = []) {
  const options = [['', 'Default'], ['title', 'A-Z (Ascending)'], ['title-desc', 'Z-A (Descending)'], ...extraOptions];
  const selected = options.find(option => option[0] === value) || options[0];
  return `<div class="title-sort-control"><span>Sort by</span><details class="title-sort-dropdown"><summary aria-label="Sort titles"><span>${selected[1]}</span><i class="bi bi-chevron-down" aria-hidden="true"></i></summary><div class="title-sort-options">${options.map(([order, label]) => `<button type="button" value="${order}" aria-pressed="${selected[0] === order}" onclick="updateTitleSortControl(this);${handler}">${label}</button>`).join('')}</div></details></div>`;
}
function updateTitleSortControl(button) {
  const dropdown = button.closest('details');
  dropdown.querySelector('summary span').textContent = button.textContent;
  dropdown.querySelectorAll('button').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
  dropdown.open = false;
  dropdown.querySelector('summary').focus();
}
document.addEventListener('click', event => {
  document.querySelectorAll('.title-sort-dropdown[open]').forEach(dropdown => {
    if (!dropdown.contains(event.target)) dropdown.open = false;
  });
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelectorAll('.title-sort-dropdown[open]').forEach(dropdown => {
    dropdown.open = false;
    dropdown.querySelector('summary').focus();
  });
});
function sortThesisTitles(rows, order) {
  if (!['title', 'title-desc'].includes(order)) return rows;
  return [...rows].sort((a, b) => (order === 'title-desc' ? -1 : 1) * String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base', numeric: true }));
}

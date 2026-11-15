"use strict";

let facultyApprovalSheets = [];
let activeFacultyReportType = 'abstract';
const facultyApprovalFilters = { program: '', year: '' };

function setFacultyReportProgress(message = '', busy = false) {
  const status = document.getElementById('faculty-report-status');
  if (status) {
    status.textContent = message;
    status.hidden = !message;
  }
  document.querySelectorAll('.faculty-report-field select').forEach(select => { select.disabled = busy; });
}

function approvalSheetEscape(value) {
  return Security.escapeHTML(String(value ?? ''));
}

function facultyReportTitle(value) {
  return String(value ?? '').trim().toLocaleUpperCase();
}

function facultyReportAuthors(value) {
  return String(value ?? '').split(';').map(name => String(name).trim().replace(/\s+/g, ' ')
    .toLocaleLowerCase().replace(/(^|[\s.'\u2019-])(\p{L})/gu,
      (_match, separator, letter) => separator + letter.toLocaleUpperCase()))
    .filter(Boolean).join('; ');
}

function filterFacultyApprovalSheets(rows, filters) {
  return rows.filter(item =>
    (!filters.program || String(item.program) === String(filters.program)) &&
    (!filters.year || String(item.year) === String(filters.year))
  );
}

function currentFacultyApprovalSheets() {
  return filterFacultyApprovalSheets(facultyApprovalSheets, facultyApprovalFilters);
}

function selectFacultyApprovalFilter(key, value) {
  facultyApprovalFilters[key] = value;
  renderFacultyApprovalSheets();
}

function selectFacultyReportType(value) {
  activeFacultyReportType = value === 'approval' ? 'approval' : 'abstract';
  const button = document.getElementById('approval-report-download');
  if (!button) return;
  button.innerHTML = activeFacultyReportType === 'approval'
    ? '<i class="bi bi-file-earmark-pdf"></i> Download approval sheets'
    : '<i class="bi bi-file-earmark-text"></i> Download abstract report';
  button.disabled = !currentFacultyApprovalSheets().length;
}

function renderFacultyApprovalFilters() {
  const keys = ['program', 'year'];
  keys.forEach(key => {
    const select = document.getElementById(`approval-report-${key}`);
    if (!select) return;
    const values = [...new Set(facultyApprovalSheets.map(item => String(item[key] ?? '')).filter(Boolean))]
      .sort((a, b) => key === 'year' ? Number(b) - Number(a) : a.localeCompare(b));
    const allLabel = key === 'program' ? 'All programs' : 'All years';
    select.innerHTML = ['', ...values].map(value => `<option value="${approvalSheetEscape(value)}">${approvalSheetEscape(value || allLabel)}</option>`).join('');
    select.value = facultyApprovalFilters[key];
  });
}

function renderFacultyApprovalSheets() {
  const body = document.getElementById('approval-sheets-body');
  const rows = currentFacultyApprovalSheets();
  const count = document.getElementById('approval-report-count');
  const download = document.getElementById('approval-report-download');
  if (count) count.textContent = `${rows.length} approved advisee ${rows.length === 1 ? 'thesis' : 'theses'} match the selected filters.`;
  if (download) download.disabled = !rows.length;
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="4" class="request-empty"><i class="bi bi-file-earmark-image"></i><span>No approved advisee theses match the selected filters.</span></td></tr>';
    return;
  }
  body.innerHTML = rows.map(item => `<tr class="faculty-report-thesis-row" role="link" tabindex="0" onclick="openFacultyReportThesis(${Security.jsArg(item.id)})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openFacultyReportThesis(${Security.jsArg(item.id)})}">
    <td class="faculty-report-thesis-cell"><strong>${approvalSheetEscape(item.title)}</strong><small>${approvalSheetEscape(item.authors)}</small></td>
    <td>${approvalSheetEscape(item.adviser || '—')}</td><td>${approvalSheetEscape(item.program)}</td><td>${approvalSheetEscape(item.year)}</td>
  </tr>`).join('');
}

async function loadFacultyApprovalSheets() {
  const body = document.getElementById('approval-sheets-body');
  body.innerHTML = '<tr><td colspan="4"><div class="table-skeleton"><span></span><span></span><span></span></div></td></tr>';
  try {
    const result = await repositoryRequest('approval-sheets');
    facultyApprovalSheets = result.approvalSheets || [];
    renderFacultyApprovalFilters();
    renderFacultyApprovalSheets();
  } catch (error) {
    body.innerHTML = `<tr><td colspan="4" class="request-empty"><i class="bi bi-exclamation-triangle"></i><span>${approvalSheetEscape(error.message)}</span><button type="button" onclick="loadFacultyApprovalSheets()">Try again</button></td></tr>`;
  }
}

function openFacultyReportThesis(id) {
  return openThesisModal(id);
}

function approvalPdfFilename() {
  const scope = [facultyApprovalFilters.program || 'all-programs', facultyApprovalFilters.year || 'all-years']
    .map(value => String(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
  return `approval-sheets-${scope.join('-')}.pdf`;
}

function abstractPdfFilename() {
  const scope = [facultyApprovalFilters.program || 'all-programs', facultyApprovalFilters.year || 'all-years']
    .map(value => String(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
  return `abstract-report-${scope.join('-')}.pdf`;
}

function facultyDegreeName(program) {
  return ({
    BSCS: 'Bachelor of Science in Computer Science',
    BSIT: 'Bachelor of Science in Information Technology',
    BSDSA: 'Bachelor of Science in Data Science and Analytics',
  })[String(program || '')] || String(program || '');
}

function renderFacultyAbstractPage(pdf, report) {
  AbstractReportTemplate.render(pdf, {
    title: facultyReportTitle(report.title),
    authors: facultyReportAuthors(report.authors),
    adviser: String(report.adviser || '').trim() || 'Unassigned',
    abstract: String(report.abstract || '').trim(),
    keywords: String(report.keywords || '').trim(),
    degree: facultyDegreeName(report.program),
  });
}

async function downloadFilteredAbstracts() {
  const rows = currentFacultyApprovalSheets();
  const button = document.getElementById('approval-report-download');
  if (!rows.length || button?.disabled) return;
  const idleLabel = button.innerHTML;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  setFacultyReportProgress('Preparing the selected abstract report...', true);
  try {
    const pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    rows.forEach((report, index) => {
      setFacultyReportProgress(`Preparing abstract ${index + 1} of ${rows.length}...`, true);
      if (index) pdf.addPage();
      renderFacultyAbstractPage(pdf, report);
    });
    pdf.save(abstractPdfFilename());
    if (typeof showToast === 'function') showToast('Filtered abstract report downloaded.', 'success');
  } catch (error) {
    console.error('Abstract report download failed:', error);
    if (typeof showToast === 'function') showToast('The abstract report could not be downloaded.', 'danger');
  } finally {
    button.innerHTML = idleLabel;
    button.disabled = !currentFacultyApprovalSheets().length;
    button.removeAttribute('aria-busy');
    setFacultyReportProgress();
  }
}

async function downloadFilteredApprovalSheets() {
  const rows = currentFacultyApprovalSheets();
  const button = document.getElementById('approval-report-download');
  if (!rows.length || button?.disabled) return;
  const idleLabel = button.innerHTML;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  setFacultyReportProgress('Reading uploaded approval sheets and creating your PDF. Please wait...', true);
  try {
    button.textContent = 'Creating PDF...';
    const ids = rows.map(row => encodeURIComponent(row.id)).join(',');
    const response = await fetch(`/api/repository/approval-sheets/pdf?ids=${ids}`, {
      credentials: 'same-origin', cache: 'no-store',
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Approval sheets could not be downloaded.');
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = approvalPdfFilename();
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (typeof showToast === 'function') showToast('Filtered approval sheets downloaded.', 'success');
  } catch (error) {
    console.error('Approval sheet report download failed:', error);
    if (typeof showToast === 'function') showToast(error.message || 'Approval sheets could not be downloaded.', 'danger');
  } finally {
    button.innerHTML = idleLabel;
    button.disabled = !currentFacultyApprovalSheets().length;
    button.removeAttribute('aria-busy');
    setFacultyReportProgress();
  }
}

function downloadSelectedFacultyReport() {
  return activeFacultyReportType === 'approval' ? downloadFilteredApprovalSheets() : downloadFilteredAbstracts();
}

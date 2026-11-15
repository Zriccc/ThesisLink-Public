"use strict";

let currentReportRows = [];
const reportValue = id => document.getElementById(`report-${id}`).value;
const reportText = value => String(value ?? '');
function reportCSVCell(value) {
  let text = reportText(value);
  if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return text.replace(/"/g, '""');
}
function reportEscape(value) {
  return reportText(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}
function reportPersonName(value) {
  return reportText(value).trim().replace(/\s+/g, ' ').slice(0, 120);
}
function reportTitleCase(value) {
  return reportPersonName(value).toLocaleLowerCase().replace(/(^|[\s.'’\-])(\p{L})/gu,
    (_match, separator, letter) => separator + letter.toLocaleUpperCase());
}
function reportExportTitle(value) {
  return reportText(value).trim().toLocaleUpperCase();
}
function reportExportAuthors(value) {
  return reportText(value).split(';').map(reportTitleCase).filter(Boolean).join('; ');
}
function masterlistExportRow(row, number) {
  return [number, reportExportTitle(row?.title), reportExportAuthors(row?.authors), row?.adviser || 'Unassigned', row?.course || '', row?.year || ''];
}
function reportDegreeName(course) {
  return ({
    BSCS: 'Bachelor of Science in Computer Science',
    BSIT: 'Bachelor of Science in Information Technology',
    BSDSA: 'Bachelor of Science in Data Science and Analytics'
  })[reportText(course)] || reportText(course);
}
function downloadPdfFile(pdf, filename) {
  if (typeof pdf.save === 'function') {
    pdf.save(filename);
    return;
  }
  const url = window.URL.createObjectURL(pdf.output('blob'));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 40000);
}
function reportSource() {
  if (currentUser?.role === 'admin') return DB;
  const name = reportText(currentUser?.name).trim().toLowerCase();
  return currentUser?.role === 'faculty' && name
    ? DB.filter(t => reportText(t.adviser).trim().toLowerCase() === name) : [];
}
async function initReports() {
  const source = reportSource();
  for (const field of ['adviser', 'year', 'course']) {
    const select = document.getElementById(`report-${field}`);
    const values = [...new Set(source.map(t => reportText(t[field])).filter(Boolean))];
    values.sort((a, b) => field === 'year' ? b.localeCompare(a, undefined, {numeric:true}) : a.localeCompare(b));
    select.innerHTML = `<option value="">All ${field === 'year' ? 'years' : field === 'course' ? 'programs' : 'advisers'}</option>` + values.map(v => `<option value="${reportEscape(v)}">${reportEscape(v)}</option>`).join('');
    if (field === 'adviser' && currentUser?.role === 'faculty') {
      select.innerHTML = `<option value="${reportEscape(currentUser.name)}">${reportEscape(currentUser.name)}</option>`;
      select.disabled = true;
    }

  }
  for (const field of ['adviser', 'year', 'course']) {
    document.getElementById(`report-${field}`).addEventListener('change', generateReport);
  }
  await initDocumentReports(source);
  showReportFilter('year');
  generateReport();
}
async function initDocumentReports(source) {
  const thesisSelect = document.getElementById('document-thesis');
  if (!thesisSelect || currentUser?.role !== 'admin') return;
  thesisSelect.innerHTML = '<option value="">Select a thesis</option>' + source.slice()
    .sort((a, b) => reportText(a.title).localeCompare(reportText(b.title)))
    .map(thesis => `<option value="${reportEscape(thesis.id)}">${reportEscape(thesis.title)} (${reportEscape(thesis.year)})</option>`)
    .join('');
  for (const id of ['document-thesis', 'approval-panel-one', 'approval-panel-two', 'document-program-chair', 'document-dean']) {
    document.getElementById(id)?.addEventListener(id.startsWith('document-') && id !== 'document-thesis' ? 'input' : 'change', syncDocumentButtons);
  }
  await loadDocumentPanelMembers();
  syncDocumentButtons();
}
async function loadDocumentPanelMembers() {
  const selects = ['approval-panel-one', 'approval-panel-two'].map(id => document.getElementById(id)).filter(Boolean);
  if (!selects.length) return;
  try {
    const { members = [] } = await authRequest('panel-members');
    for (const select of selects) {
      const options = ['<option value="">Select a panel member</option>'];
      options.push(...members.map(member => `<option value="${reportEscape(member.id)}" data-name="${reportEscape(member.name)}">${reportEscape(member.name)} (Faculty)</option>`));
      select.innerHTML = options.join('');
    }
    setDocumentError('');
  } catch (_) {
    setDocumentError('Panel members could not be loaded. Refresh the page and try again.');
  }
}
function selectedDocumentThesis() {
  const id = reportText(document.getElementById('document-thesis')?.value);
  return reportSource().find(thesis => reportText(thesis.id) === id) || null;
}
function documentField(id) {
  return reportPersonName(document.getElementById(id)?.value || '');
}
function documentPanelName(id) {
  const select = document.getElementById(id);
  return reportPersonName(select?.selectedOptions?.[0]?.dataset.name || '');
}
function setDocumentError(message) {
  const error = document.getElementById('report-document-error');
  if (error) error.textContent = message;
}
function syncDocumentButtons() {
  const thesis = selectedDocumentThesis();
  const first = document.getElementById('approval-panel-one')?.value || '';
  const second = document.getElementById('approval-panel-two')?.value || '';
  const complete = Boolean(thesis && first && second && first !== second && documentField('document-program-chair') && documentField('document-dean'));
  const abstractButton = document.getElementById('abstract-download');
  const approvalButton = document.getElementById('approval-download');
  if (abstractButton) abstractButton.disabled = !thesis;
  if (approvalButton) approvalButton.disabled = !complete;
}
function validateApprovalDocument() {
  const thesis = selectedDocumentThesis();
  const first = document.getElementById('approval-panel-one')?.value || '';
  const second = document.getElementById('approval-panel-two')?.value || '';
  let message = '';
  if (!thesis) message = 'Select a thesis.';
  else if (!first || !second) message = 'Select both panel members.';
  else if (first === second) message = 'Select two different panel members.';
  else if (!documentField('document-program-chair') || !documentField('document-dean')) message = 'Enter the program chair and dean.';
  setDocumentError(message);
  return !message;
}
function reportThesisId(id) {
  return currentUser?.role === 'admin' && reportSource().some(thesis => reportText(thesis.id) === reportText(id))
    ? reportText(id) : '';
}
function bindReportThesisLinks() {
  document.querySelectorAll('[data-report-thesis-id]').forEach(row => {
    const open = () => openThesisModal(row.dataset.reportThesisId);
    row.addEventListener('click', open);
    row.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
  });
}
function generateReport() {
  currentReportRows = reportSource().filter(t =>
    ['year', 'course', 'adviser'].every(field => (field === 'adviser' && currentUser?.role === 'faculty') || !reportValue(field) || reportText(t[field]) === reportValue(field))
  ).sort((a, b) => reportText(a.year).localeCompare(reportText(b.year), undefined, {numeric:true}) || reportText(a.title).localeCompare(reportText(b.title)));
  document.getElementById('report-print').disabled = !currentReportRows.length;
  document.getElementById('report-date').textContent = 'Generated ' + new Date().toLocaleString();
  // Program sections follow the printed masterlist; years run from oldest to newest within each section.
  const courses = [...new Set(currentReportRows.map(t => reportText(t.course)))].sort();
  currentReportRows = courses.flatMap(course => currentReportRows.filter(t => reportText(t.course) === course));
  let previousCourse = null;
  document.getElementById('report-tbody').innerHTML = currentReportRows.length ? currentReportRows.map((t, i) => {
    const course = reportText(t.course);
    const heading = course !== previousCourse ? '<tr class="report-course-heading"><th colspan="6" scope="rowgroup">' + reportEscape(reportCourseName(course)) + '</th></tr>' : '';
    previousCourse = course;
    const thesisId = reportThesisId(t.id);
    const attributes = thesisId ? ` class="report-thesis-link" data-report-thesis-id="${reportEscape(thesisId)}" role="button" tabindex="0"` : '';
    return heading + `<tr${attributes}>` + [i + 1, t.title, t.authors, t.adviser || 'Unassigned', t.course, t.year].map(v => '<td>' + reportEscape(v) + '</td>').join('') + '</tr>';
  }).join('') : '<tr><td colspan="6" class="report-empty">No theses match your filters.</td></tr>';
  bindReportThesisLinks();
}
function drawMasterlistSigner(pdf, x, y, action, name, role) {
  pdf.setTextColor(0); pdf.setFont('times', 'normal'); pdf.setFontSize(8);
  pdf.text(action, x, y, {align:'center'});
  pdf.line(x - 27, y + 11, x + 27, y + 11);
  if (name) {
    pdf.setFont('times', 'bold');
    pdf.text(reportExportTitle(name), x, y + 9, {align:'center', maxWidth:54});
  }
  pdf.setFont('times', 'normal');
  pdf.text(role, x, y + 16, {align:'center', maxWidth:54});
}
function drawMasterlistSignatures(pdf) {
  let y = (pdf.lastAutoTable?.finalY || 53) + 12;
  if (y > 158) { pdf.addPage(); y = 58; }
  drawMasterlistSigner(pdf, 58, y, 'Prepared by', reportPersonName(currentUser?.name), 'ThesisLink Administrator');
  drawMasterlistSigner(pdf, 148.5, y, 'Noted by', documentField('document-program-chair'), 'Program Chair');
  drawMasterlistSigner(pdf, 239, y, 'Approved by', documentField('document-dean'), 'Dean, CCSICT');
}
async function printReport() {
  generateReport();
  if (!currentReportRows.length) return;
  const rows = currentReportRows.map(row => ({...row}));
  const button = document.getElementById('report-print');
  button.disabled = true;
  const label = button.innerHTML;
  button.textContent = 'Downloading...';
  try {
    const pdf = new window.jspdf.jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'});
    const logos = await waitForReportLogos();
    const addHeader = () => {
      pdf.addImage(logos[0], 'JPEG', 70, 10, 16, 16);
      pdf.addImage(logos[1], 'PNG', 211, 10, 16, 16);
      pdf.setFont('times', 'normal'); pdf.setFontSize(11);
      pdf.text('Republic of the Philippines', 148.5, 13, {align:'center'});
      pdf.setFont('times', 'bold');
      pdf.text('ISABELA STATE UNIVERSITY', 148.5, 18, {align:'center'});
      pdf.setFont('times', 'normal');
      pdf.text('Cabagan, Isabela', 148.5, 23, {align:'center'});
      pdf.setDrawColor(30); pdf.setLineWidth(0.2);
      pdf.line(10, 29, 287, 29); pdf.line(10, 29.6, 287, 29.6);
      pdf.setFont('times', 'bold'); pdf.setFontSize(10.5);
      pdf.text('COLLEGE OF COMPUTING STUDIES, INFORMATION AND COMMUNICATION TECHNOLOGY', 148.5, 35, {align:'center'});
      pdf.setFont('times', 'normal'); pdf.setFontSize(10);
      pdf.text('CCSICT LEARNING AND INNOVATION CENTER', 148.5, 42, {align:'center'});
      pdf.setFont('times', 'bold'); pdf.setTextColor(80, 53, 79);
      pdf.text('MASTERLIST OF THESES', 148.5, 48, {align:'center'});
      pdf.setTextColor(0);
    };
    let number = 0;
    let nextY = 53;
    const courses = [...new Set(rows.map(row => reportText(row.course)))];
    for (const course of courses) {
      pdf.autoTable({
        startY: nextY, margin: {top:53, right:10, bottom:12, left:10},
        tableWidth:277, theme:'grid', showHead:'everyPage', rowPageBreak:'avoid',
        head: [[{content:reportCourseName(course), colSpan:6}]],
        body: rows.filter(row => reportText(row.course) === course).map(row => masterlistExportRow(row, ++number)),
        styles:{font:'helvetica',fontSize:8,cellPadding:1.4,lineColor:[45,45,45],lineWidth:0.2,textColor:0,valign:'middle',overflow:'linebreak'},
        headStyles:{fillColor:[197,214,220],textColor:0,fontSize:10,fontStyle:'bold',halign:'center'},
        columnStyles:{0:{cellWidth:11,halign:'center'},1:{cellWidth:83},2:{cellWidth:89},3:{cellWidth:55,halign:'center'},4:{cellWidth:19,halign:'center'},5:{cellWidth:20,halign:'center'}},
        willDrawPage:addHeader
      });
      nextY = pdf.lastAutoTable.finalY + 3;
      if (nextY > 185 && course !== courses[courses.length - 1]) { pdf.addPage(); nextY = 53; }
    }
    if (currentUser?.role === 'admin') drawMasterlistSignatures(pdf);
    for(let page = 1; page <= pdf.getNumberOfPages(); page++) {
      pdf.setPage(page); pdf.setFont('helvetica','normal'); pdf.setFontSize(8); pdf.setTextColor(80);
      pdf.text('Page ' + page + ' of ' + pdf.getNumberOfPages(), 287, 204, {align:'right'});
    }
    downloadPdfFile(pdf, 'thesis-masterlist-landscape.pdf');
  } catch (error) {
    console.error('Report download failed:', error);
    const message = 'Unable to download the PDF. Please reload the page and try again.';
    if (typeof showToast === 'function') showToast(message); else window.alert(message);
  } finally {
    button.innerHTML = label;
    button.disabled = !currentReportRows.length;
  }
}

function reportLogos() {
  const logos = Array.from(document.querySelectorAll('.report-logo'));
  if (logos.length < 2 || logos.some(image => !image.complete || !image.naturalWidth)) throw new Error('Report logos are unavailable.');
  return logos;
}
async function waitForReportLogos(timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { return reportLogos(); } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  return reportLogos();
}
function drawPortraitLetterhead(pdf, heading, logos = []) {
  if (logos[0] && typeof pdf.addImage === 'function') pdf.addImage(logos[0], 'JPEG', 28, 10, 17, 17);
  if (logos[1] && typeof pdf.addImage === 'function') pdf.addImage(logos[1], 'PNG', 165, 10, 17, 17);
  pdf.setTextColor(0); pdf.setFont('times', 'normal'); pdf.setFontSize(10);
  pdf.text('Republic of the Philippines', 105, 13, {align:'center'});
  pdf.setFont('times', 'bold'); pdf.text('ISABELA STATE UNIVERSITY', 105, 18, {align:'center'});
  pdf.setFont('times', 'normal'); pdf.text('Cabagan, Isabela', 105, 23, {align:'center'});
  pdf.setDrawColor(30); pdf.setLineWidth(.2); pdf.line(16, 30, 194, 30); pdf.line(16, 30.6, 194, 30.6);
  pdf.setFont('times', 'bold'); pdf.setFontSize(9.5);
  pdf.text('COLLEGE OF COMPUTING STUDIES, INFORMATION AND COMMUNICATION TECHNOLOGY', 105, 36, {align:'center', maxWidth:178});
  pdf.setFontSize(12); pdf.text(heading, 105, 46, {align:'center'});
}
function drawApprovalSigner(pdf, signer, x, y) {
  pdf.setTextColor(0); pdf.setFont('times', 'bold'); pdf.setFontSize(12);
  if (signer.name) pdf.text(reportExportTitle(signer.name), x, y, {align:'center', maxWidth:70});
  else pdf.line(x - 28, y, x + 28, y);
  pdf.setFont('times', 'normal'); pdf.setFontSize(12);
  pdf.text(signer.role, x, y + 5, {align:'center'});
  pdf.line(x - 23, y + 17, x + 23, y + 17);
  pdf.text('Date Signed', x, y + 22, {align:'center'});
}
function abstractReportData(thesis) {
  return {
    id: reportText(thesis?.id),
    title: reportExportTitle(thesis?.title),
    authors: reportExportAuthors(thesis?.authors),
    adviser: reportPersonName(thesis?.adviser),
    course: reportText(thesis?.course),
    degree: reportDegreeName(thesis?.course),
    year: reportText(thesis?.year),
    keywords: reportText(thesis?.keywords).trim(),
    abstract: reportText(thesis?.abstract).trim()
  };
}
function approvalSheetData(thesis, fields = {}) {
  const course = reportText(thesis?.course);
  return {
    id: reportText(thesis?.id),
    title: reportExportTitle(thesis?.title),
    authors: reportExportAuthors(thesis?.authors),
    course,
    degree: reportDegreeName(course),
    signers: [
      {name: reportPersonName(thesis?.adviser), role: 'Capstone Project Adviser'},
      {name: reportPersonName(fields.panelOne), role: 'Panel Member'},
      {name: reportPersonName(fields.panelTwo), role: 'Panel Member'},
      {name: reportPersonName(fields.programChair), role: `Program Chair, ${course}`},
      {name: reportPersonName(fields.dean), role: 'Dean, CCSICT'}
    ]
  };
}
function writeReportLines(pdf, lines, startY, options = {}) {
  const x = options.x || 20;
  const lineHeight = options.lineHeight || 5;
  const bottom = options.bottom || 268;
  let y = startY;
  for (const line of lines) {
    if (y > bottom) { pdf.addPage(); y = 20; }
    pdf.text(line || ' ', x, y, options.textOptions || {});
    y += lineHeight;
  }
  return y;
}
function renderAbstractReport(pdf, report) {
  AbstractReportTemplate.render(pdf, report);
}
function renderApprovalSheet(pdf, sheet) {
  ApprovalSheetTemplate.render(pdf, sheet);
}

function reportFilename(prefix, title) {
  const safeTitle = reportText(title).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 70) || 'thesis';
  return `${prefix}-${safeTitle}.pdf`;
}
async function downloadAbstractReport() {
  const thesis = selectedDocumentThesis();
  if (!thesis) { setDocumentError('Select a thesis.'); return; }
  setDocumentError('');
  const button = document.getElementById('abstract-download');
  const label = button.innerHTML;
  button.disabled = true; button.textContent = 'Downloading...';
  try {
    const pdf = new window.jspdf.jsPDF({orientation:'portrait', unit:'mm', format:'letter'});
    renderAbstractReport(pdf, abstractReportData(thesis));
    downloadPdfFile(pdf, reportFilename('abstract', thesis.title));
    if (typeof showToast === 'function') showToast('Abstract report downloaded.', 'success');
  } catch (error) {
    console.error('Abstract report download failed:', error);
    setDocumentError('Unable to download the abstract report. Reload the page and try again.');
  } finally {
    button.innerHTML = label; syncDocumentButtons();
  }
}
async function downloadApprovalSheet() {
  if (!validateApprovalDocument()) return;
  const thesis = selectedDocumentThesis();
  const sheet = approvalSheetData(thesis, {
    panelOne: documentPanelName('approval-panel-one'),
    panelTwo: documentPanelName('approval-panel-two'),
    programChair: documentField('document-program-chair'),
    dean: documentField('document-dean')
  });
  const button = document.getElementById('approval-download');
  const label = button.innerHTML;
  button.disabled = true; button.textContent = 'Downloading...';
  try {
    const pdf = new window.jspdf.jsPDF({orientation:'portrait', unit:'mm', format:'letter'});
    renderApprovalSheet(pdf, sheet);
    downloadPdfFile(pdf, reportFilename('approval-sheet', thesis.title));
    if (typeof showToast === 'function') showToast('Approval sheet downloaded.', 'success');
  } catch (error) {
    console.error('Approval sheet download failed:', error);
    setDocumentError('Unable to download the approval sheet. Reload the page and try again.');
  } finally {
    button.innerHTML = label; syncDocumentButtons();
  }
}

function reportCourseName(course) {
  return ({BSCS: 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE', BSIT: 'BACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY', BSDSA: 'BACHELOR OF SCIENCE IN DATA SCIENCE AND ANALYTICS'})[course] || course || 'UNSPECIFIED PROGRAM';
}
function showReportFilter(field) {
  document.querySelectorAll('[data-filter]').forEach(button => {
    const active = button.dataset.filter === field;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const select = document.getElementById('report-' + field);
  const panel = document.getElementById('report-filter-options');
  panel.replaceChildren();
  Array.from(select.options).forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.textContent;
    button.className = 'report-filter-chip';
    button.setAttribute('aria-pressed', String(select.value === option.value));
    button.onclick = () => { select.value = option.value; generateReport(); showReportFilter(field); };
    panel.appendChild(button);
  });
}

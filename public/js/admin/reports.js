"use strict";

let currentReportRows = [];

function reportEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function initReports() {
  const advisers = [...new Set(DB.map(thesis => thesis.adviser).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const years = [...new Set(DB.map(thesis => String(thesis.year)).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
  document.getElementById('report-adviser').insertAdjacentHTML('beforeend', advisers.map(adviser => `<option value="${reportEscape(adviser)}">${reportEscape(adviser)}</option>`).join(''));
  document.getElementById('report-year').insertAdjacentHTML('beforeend', years.map(year => `<option value="${reportEscape(year)}">${reportEscape(year)}</option>`).join(''));
  generateReport();
}

function generateReport() {
  const adviser = document.getElementById('report-adviser').value;
  const year = document.getElementById('report-year').value;
  currentReportRows = DB.filter(thesis => (!adviser || thesis.adviser === adviser) && (!year || String(thesis.year) === year))
    .sort((a, b) => String(a.adviser).localeCompare(String(b.adviser)) || Number(b.year) - Number(a.year) || String(a.title).localeCompare(String(b.title)));

  const scope = [adviser && `Adviser: ${adviser}`, year && `Year: ${year}`].filter(Boolean).join(' • ') || 'All advisers and years';
  document.getElementById('report-scope').textContent = scope;
  document.getElementById('report-date').textContent = `Generated ${new Date().toLocaleString()}`;
  document.getElementById('report-total').textContent = currentReportRows.length.toLocaleString();
  document.getElementById('report-advisers').textContent = new Set(currentReportRows.map(thesis => thesis.adviser).filter(Boolean)).size.toLocaleString();
  const advisees = currentReportRows.flatMap(thesis => String(thesis.authors || '').split(';')).map(name => name.trim().toLowerCase()).filter(Boolean);
  document.getElementById('report-advisees').textContent = new Set(advisees).size.toLocaleString();

  document.getElementById('report-tbody').innerHTML = currentReportRows.length
    ? currentReportRows.map((thesis, index) => {
      const startsGroup = index === 0 || currentReportRows[index - 1].adviser !== thesis.adviser;
      return `<tr class="${startsGroup ? 'report-adviser-start' : ''}"><td>${reportEscape(thesis.adviser || 'Unassigned')}</td><td>${reportEscape(thesis.authors)}</td><td>${reportEscape(thesis.title)}</td><td>${reportEscape(thesis.year)}</td><td>${reportEscape(thesis.course)}</td></tr>`;
    }).join('')
    : '<tr><td colspan="5" class="report-empty">No adviser thesis records match the selected filters.</td></tr>';
}

function downloadReportCSV() {
  generateReport();
  const rows = [['Adviser', 'Advisee(s)', 'Thesis Title', 'Year', 'Program'], ...currentReportRows.map(thesis => [thesis.adviser || 'Unassigned', thesis.authors, thesis.title, thesis.year, thesis.course])];
  const csv = rows.map(row => row.map(value => `"${reportCSVCell(value)}"`).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `adviser-advisee-thesis-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

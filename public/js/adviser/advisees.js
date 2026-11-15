"use strict";

let adviserTheses = [];
let activeAdviseeFilter = '';
let adviseeTitleSort = '';
const adviseeFilters = { course: '', year: '' };

function toggleAdviseeFilter(key) {
  activeAdviseeFilter = activeAdviseeFilter === key ? '' : key;
  renderAdviseeFilters();
}

function selectAdviseeFilter(key, value) {
  adviseeFilters[key] = value;
  renderAdviseeFilters();
  renderAdvisees();
}

function renderAdviseeFilters() {
  document.getElementById('advisee-filter-buttons').innerHTML = ['course', 'year'].map(key => {
    const open = activeAdviseeFilter === key;
    return `<button type="button" class="dashboard-filter-tile ${open || adviseeFilters[key] ? 'active' : ''}" aria-expanded="${open}" aria-controls="advisee-filter-options" onclick="toggleAdviseeFilter('${key}')"><span>${key === 'course' ? 'Program' : 'Year'}${adviseeFilters[key] ? ': ' + adviseeEscape(adviseeFilters[key]) : ''}</span><i class="bi bi-chevron-${open ? 'up' : 'down'}"></i></button>`;
  }).join('') + titleSortControl(adviseeTitleSort, 'adviseeTitleSort=this.value;renderAdvisees()');
  const panel = document.getElementById('advisee-filter-options');
  panel.hidden = !activeAdviseeFilter;
  if (!activeAdviseeFilter) { panel.innerHTML = ''; return; }
  const key = activeAdviseeFilter;
  const values = [...new Set(adviserTheses.map(thesis => String(thesis[key] ?? '')).filter(Boolean))]
    .sort((a, b) => key === 'course' ? a.localeCompare(b) : Number(b) - Number(a));
  panel.innerHTML = `<span class="advisee-filter-label">Sort by ${key}:</span><div class="dashboard-filter-chips">` + ['', ...values].map(value =>
    `<button type="button" class="dashboard-filter-chip" aria-pressed="${adviseeFilters[key] === value}" data-value="${adviseeEscape(value)}" onclick="selectAdviseeFilter('${key}',this.dataset.value)">${adviseeEscape(value || 'All ' + (key === 'course' ? 'programs' : 'years'))}</button>`
  ).join('') + '</div>';
}

function adviseeEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function initAdvisees() {
  const adviserName = String(currentUser?.name || '').trim().toLowerCase();
  adviserTheses = DB.filter(thesis => String(thesis.adviser || '').trim().toLowerCase() === adviserName);
  const params = new URLSearchParams(window.location.search);
  adviseeTitleSort = ['title', 'title-desc'].includes(params.get('sort')) ? params.get('sort') : '';
  for (const key of ['course', 'year']) {
    adviseeFilters[key] = params.get('filter') === key ? params.get('value') || '' : '';
  }
  renderAdviseeFilters();
  renderAdvisees();
}

function renderAdvisees() {
  const query = String(document.getElementById('advisee-search')?.value || '').trim().toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const sort = params.get('sort') || '';
  let rows = adviserTheses.filter(thesis =>
    ['course', 'year'].every(key => {
      const selected = adviseeFilters[key];
      return !selected || String(thesis[key] ?? '') === selected;
    }) &&
    (!query || [thesis.title, thesis.authors, thesis.course, thesis.year]
      .some(field => String(field || '').toLowerCase().includes(query)))
  );

  if (sort === 'title' || sort === 'course') {
    rows.sort((a, b) => String(a[sort] || '').localeCompare(String(b[sort] || '')));
  }
  if (sort === 'year' || sort === 'views') {
    rows.sort((a, b) => (Number(b[sort]) || 0) - (Number(a[sort]) || 0));
  }

  rows = sortThesisTitles(rows, adviseeTitleSort);
  const uniqueAdvisees = new Set(
    adviserTheses.flatMap(thesis => String(thesis.authors || '').split(';')).map(author => author.trim().toLowerCase()).filter(Boolean)
  );
  const thesisTotal = document.getElementById('adviser-thesis-total');
  const adviseeTotal = document.getElementById('adviser-advisee-total');
  if (thesisTotal) thesisTotal.textContent = adviserTheses.length.toLocaleString();
  if (adviseeTotal) adviseeTotal.textContent = uniqueAdvisees.size.toLocaleString();
  document.getElementById('advisee-result-count').textContent = `${rows.length} advisee ${rows.length === 1 ? 'thesis' : 'theses'}`;

  const results = document.getElementById('advisee-results');


  results.innerHTML = `<div class="repository-table-wrap"><table class="data-table repository-results-table">
    <thead><tr><th>Title</th><th>Author</th><th>Program</th><th>Year</th><th>Views</th></tr></thead>
    <tbody>${rows.map(thesis => `<tr onclick="openAdviseeThesis(${Security.jsArg(thesis.id)})" tabindex="0" onkeydown="if(event.key==='Enter'){openAdviseeThesis(${Security.jsArg(thesis.id)})}">
      <td data-label="Title"><button type="button" class="repository-table-title thesis-title-link" onclick="event.stopPropagation();openAdviseeThesis(${Security.jsArg(thesis.id)})">${adviseeEscape(thesis.title)}</button></td>
      <td data-label="Author"><strong class="advisee-author">${adviseeEscape(thesis.authors)}</strong><span class="advisee-adviser">Adviser: ${adviseeEscape(thesis.adviser)}</span></td>
      <td data-label="Program"><span class="chip ${thesis.course === 'BSIT' ? 'chip-it' : thesis.course === 'BSDSA' ? 'chip-dsa' : 'chip-cs'}">${adviseeEscape(thesis.course)}</span></td>
      <td data-label="Year">${adviseeEscape(thesis.year)}</td>
      <td data-label="Views"><i class="bi bi-eye-fill"></i> ${Number(thesis.views) || 0}</td>
    </tr>`).join('') || `<tr class="table-empty-row"><td colspan="5"><div class="table-empty-content"><i class="bi bi-inbox" aria-hidden="true"></i><strong>No advisee theses match the selected filters.</strong><span>Records will appear here when available.</span></div></td></tr>`}</tbody></table></div>`;
}

function openAdviseeThesis(id) {
  const thesis = adviserTheses.find(item => String(item.id) === String(id));
  if (!thesis) return;
  return openThesisModal(thesis.id, false, true);
}

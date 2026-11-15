"use strict";

function openSortedRepository(sortBy, value = '') {
  const allowed = ['title', 'title-desc', 'course', 'year', 'views'];
  if (!allowed.includes(sortBy)) return;
  const params = new URLSearchParams({ sort: sortBy });
  if (value !== '') {
    params.set('filter', sortBy);
    params.set('value', value);
  }
  const repositoryPath = currentUser?.role === 'faculty'
    ? '/pages/adviser/advisees.html'
    : '/pages/admin/repository.html';
  window.location.href = repositoryPath + '?' + params.toString();
}

function getDashboardTheses() {
  if (currentUser?.role !== 'faculty') return DB;
  const adviserName = String(currentUser.name || '').trim().toLowerCase();
  return DB.filter(thesis => String(thesis.adviser || '').trim().toLowerCase() === adviserName);
}

function dashboardCategoryOptions(key) {
  const theses = getDashboardTheses();
  if (key === 'course') return [...new Set(theses.map(t => t.course).filter(Boolean))].sort();
  if (key === 'year') return [...new Set(theses.map(t => String(t.year)).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
  if (key === 'views') return [...new Set(theses.map(t => String(Number(t.views) || 0)))].sort((a, b) => Number(b) - Number(a));
  return [];
}

function dashboardRepositoryURL(course = '', year = '', sort = 'year') {
  const params = new URLSearchParams();
  if (course) params.set('course', course);
  if (year) params.set('year', year);
  if (['title', 'title-desc', 'year', 'views'].includes(sort)) params.set('sort', sort);
  return '/pages/admin/repository.html' + (params.size ? '?' + params.toString() : '');
}

function dashboardQuickFiltersMarkup() {
  const option = value => Security.escapeHTML(String(value));
  const courses = dashboardCategoryOptions('course');
  const years = dashboardCategoryOptions('year');
  return `<div class="dashboard-quick-filters">
    <label class="dashboard-quick-field"><span>Program</span><select id="dashboard-course-filter">
      <option value="">All programs</option>${courses.map(value => `<option value="${option(value)}">${option(value)}</option>`).join('')}
    </select></label>
    <label class="dashboard-quick-field"><span>Year</span><select id="dashboard-year-filter">
      <option value="">All years</option>${years.map(value => `<option value="${option(value)}">${option(value)}</option>`).join('')}
    </select></label>
    <label class="dashboard-quick-field"><span>Sort</span><select id="dashboard-sort-filter">
      <option value="year">Newest</option><option value="views">Most viewed</option><option value="title">Title A-Z</option><option value="title-desc">Title Z-A</option>
    </select></label>
    <button id="dashboard-filter-submit" class="dashboard-filter-submit" type="button" onclick="openDashboardRepository()"><i class="bi bi-arrow-right" aria-hidden="true"></i> View results</button>
  </div>`;
}

function openDashboardRepository() {
  const course = document.getElementById('dashboard-course-filter')?.value || '';
  const year = document.getElementById('dashboard-year-filter')?.value || '';
  const sort = document.getElementById('dashboard-sort-filter')?.value || 'year';
  window.location.href = dashboardRepositoryURL(course, year, sort);
}

function buildDashboard() {
  buildRecentActivity();
  const registeredTotal = document.getElementById('registered-users-total');
  if (registeredTotal) {
    registeredTotal.textContent = '...';
    loadAccountDirectory().then(users => { registeredTotal.textContent = users.length.toLocaleString(); })
      .catch(() => { registeredTotal.textContent = 'Unavailable'; registeredTotal.title = 'Account directory unavailable'; });
  }
  const dashboardTheses = getDashboardTheses();
  if (currentUser?.role === 'admin') {
    const thesisTotal = document.getElementById('admin-thesis-total');
    const viewTotal = document.getElementById('admin-view-total');
    if (thesisTotal) thesisTotal.textContent = dashboardTheses.length.toLocaleString();
    if (viewTotal) viewTotal.textContent = dashboardTheses.reduce((total, thesis) => total + (Number(thesis.views) || 0), 0).toLocaleString();
  }
  if (currentUser?.role === 'faculty') {
    const authors = new Set(dashboardTheses.flatMap(thesis => String(thesis.authors || '').split(';'))
      .map(author => author.trim().toLowerCase()).filter(Boolean));
    const thesisTotal = document.getElementById('adviser-thesis-total');
    const viewTotal = document.getElementById('adviser-view-total');
    const adviseeTotal = document.getElementById('adviser-advisee-total');
    if (thesisTotal) thesisTotal.textContent = dashboardTheses.length.toLocaleString();
    if (viewTotal) viewTotal.textContent = dashboardTheses.reduce((total, thesis) => total + (Number(thesis.views) || 0), 0).toLocaleString();
    if (adviseeTotal) adviseeTotal.textContent = authors.size.toLocaleString();
  }

  document.getElementById('dash-tbody').innerHTML = dashboardQuickFiltersMarkup();

}

function buildRecentActivity() {
  const list = document.getElementById('recent-activity-list');
  if (!list || currentUser?.role !== 'admin') return;
  const entries = getActivities().slice(0, 4);
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No important activity recorded yet.';
    list.append(empty);
    return;
  }
  entries.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'act-item';
    const dot = document.createElement('div');
    dot.className = 'act-dot g';
    const details = document.createElement('div');
    const text = document.createElement('div');
    text.className = 'act-text';
    const actor = document.createElement('strong');
    actor.textContent = entry.actor;
    text.append(actor, document.createTextNode(' — ' + ACTIVITY_TYPES[entry.type] + (entry.subject ? ': ' + entry.subject : '')));
    const time = document.createElement('div');
    time.className = 'act-time';
    time.textContent = new Date(entry.createdAt).toLocaleString();
    details.append(text, time);
    item.append(dot, details);
    list.append(item);
  });
}

window.addEventListener('activity-updated', buildRecentActivity);
window.addEventListener('focus', () => loadActivities().then(buildRecentActivity).catch(() => {}));

function buildTopViews() {
  const courseMap = { BSCS: 'chip-cs', BSIT: 'chip-it', BSDSA: 'chip-dsa' };
  const rows = [...DB].sort((a, b) => b.views - a.views).slice(0, 5);
  document.getElementById('top-tbody').innerHTML = rows.length ? rows.map(t => `
    <tr>
      <td style="max-width:230px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.83rem;">${Security.escapeHTML(t.title)}</td>
      <td><span class="chip ${courseMap[t.course] || 'chip-cs'}">${Security.escapeHTML(t.course)}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.81rem;"><i class="bi bi-eye-fill"></i> ${Security.escapeHTML(t.views)}</td>
    </tr>`).join('') : '<tr><td colspan="3" class="text-center text-muted py-4">No thesis records are available yet.</td></tr>';
}

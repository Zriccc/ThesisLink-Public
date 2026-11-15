"use strict";

function mountSearch(wrapId, pillsId, gridId, F) {
  document.getElementById(wrapId).innerHTML = `
    <div class="search-wrap">
      <div class="search-controls">
        <button class="search-filter-toggle" type="button" onclick="toggleSearchFilters(event,'${gridId}')" aria-label="Show filters" aria-expanded="false"><i class="bi bi-funnel-fill"></i></button>
        <div class="search-query-group">
        <div class="search-inner">
          <input class="search-input" id="ssinp-${gridId}"
            autocomplete="off" maxlength="240"
            oninput="onSearchInput(this,'${gridId}','${pillsId}')"/>
          <button class="search-clear" id="ssclr-${gridId}" onclick="clearSearch('${gridId}','${pillsId}')"><i class="bi bi-x-lg"></i></button>
        </div>
        <button class="search-submit" type="button" aria-label="Search" onclick="submitSearch('${gridId}','${pillsId}')"><i class="bi bi-search"></i><span>Search</span></button>
        </div>
      </div>
      <div class="search-filter-panel" id="ssfilters-${gridId}"></div>
      <div class="search-dropdown" id="ssdd-${gridId}"></div>
    </div>`;

  buildSearchFilterPanel(gridId, pillsId);

  // Repository search lives in the topbar, but its filters belong in the
  // page flow so opening them moves the thesis cards down instead of
  // covering them.
  const wrap = document.getElementById(wrapId);
  const panel = document.getElementById('ssfilters-' + gridId);
  const pills = document.getElementById(pillsId);
  if (wrap?.classList.contains('topbar-search') && panel && pills?.parentNode) {
    panel.classList.add('repository-filter-panel');
    const filterAnchor = document.getElementById('repository-filter-anchor');
    if (filterAnchor) {
      filterAnchor.appendChild(panel);
    } else {
      pills.parentNode.insertBefore(panel, pills);
    }
  }

  document.addEventListener('click', e => {
    const dd  = document.getElementById('ssdd-' + gridId);
    const inp = document.getElementById('ssinp-' + gridId);
    if (dd && inp && !dd.contains(e.target) && e.target !== inp) dd.classList.remove('open');
    const panel = document.getElementById('ssfilters-' + gridId);
    const toggle = document.querySelector(`[onclick*="toggleSearchFilters(event,'${gridId}')"]`);
    if (panel && !panel.contains(e.target) && e.target !== toggle && !toggle?.contains(e.target)) {
      panel.classList.remove('open');
      if (toggle) {
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
      }
    }
  }, { passive: true });
}

function buildSearchFilterPanel(gridId, pillsId) {
  const F = getFilters(gridId);
  const years = [...new Set(DB.map(t => String(t.year)))].sort((a, b) => b - a);
  const courses = [...new Set(DB.map(t => t.course).filter(Boolean))].sort();
  const advisers = [...new Set(DB.map(t => t.adviser).filter(Boolean))].sort();
  const authors = [...new Set(DB.flatMap(t => t.authors.split(';').map(a => a.trim())).filter(Boolean))].sort();
  const field = (type, title, allLabel, values) => {
    const labelId = `ssf-${gridId}-${type}`;
    const items = [`<li><button class="dropdown-item" type="button" aria-pressed="${!F[type]}" data-filter-value="" onclick="applySearchPanelFilter('${gridId}','${pillsId}','${type}',this.dataset.filterValue,'${labelId}','${allLabel}')">${allLabel}</button></li>`]
      .concat(values.map(value => `<li><button class="dropdown-item" type="button" aria-pressed="${String(F[type] || '') === String(value)}" data-filter-value="${escapeFilterValue(value)}" onclick="applySearchPanelFilter('${gridId}','${pillsId}','${type}',this.dataset.filterValue,'${labelId}',this.textContent)">${Security.escapeHTML(value)}</button></li>`))
      .join('');
    return `<div class="dropdown search-filter-field">
      <span>${title}</span>
      <button class="btn btn-light dropdown-toggle w-100" type="button" data-bs-toggle="dropdown" aria-expanded="false"><span id="${labelId}">${allLabel}</span></button>
      <ul class="dropdown-menu w-100">${items}</ul>
    </div>`;
  };
  document.getElementById('ssfilters-' + gridId).innerHTML = `
    ${field('year', 'Year', 'All years', years)}
    ${field('course', 'Program', 'All programs', courses)}
    ${field('adviser', 'Adviser', 'All advisers', advisers)}
    ${field('author', 'Author', 'All authors', authors)}
    ${titleSortControl(getFilters(gridId).sort, `getFilters('${gridId}').sort=this.value;applyRender('${gridId}','${pillsId}',getFilters('${gridId}'))`, gridId === 'repo-grid' ? [['year', 'Newest'], ['views', 'Most viewed'], ['course', 'Program']] : [])}`;
  syncSearchFilterControls(gridId);
}

function syncSearchFilterControls(gridId, F = getFilters(gridId)) {
  for (const [type, fallback] of Object.entries({year:'All years',course:'All programs',adviser:'All advisers',author:'All authors'})) {
    const label = document.getElementById(`ssf-${gridId}-${type}`);
    if (!label) continue;
    const value = String(F[type] || '');
    label.textContent = value || fallback;
    label.closest('.search-filter-field')?.querySelectorAll('[data-filter-value]').forEach(item => {
      item.setAttribute('aria-pressed', String(item.dataset.filterValue === value));
    });
  }
}

function escapeFilterValue(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toggleSearchFilters(event, gridId) {
  event.stopPropagation();
  const panel = document.getElementById('ssfilters-' + gridId);
  const button = event.currentTarget;
  const isOpen = panel.classList.toggle('open');
  button.classList.toggle('active', isOpen);
  button.setAttribute('aria-expanded', String(isOpen));
}

function applySearchPanelFilter(gridId, pillsId, type, value, labelId, label) {
  const F = getFilters(gridId);
  F[type] = value;
  const labelElement = document.getElementById(labelId);
  if (labelElement) labelElement.textContent = label.trim();
  labelElement?.closest('.search-filter-field')?.querySelectorAll('[data-filter-value]').forEach(item => {
    item.setAttribute('aria-pressed', String(item.dataset.filterValue === String(value)));
  });
  renderPills(pillsId, gridId, F);
  applyRender(gridId, pillsId, F);
}

function getFilters(gridId) { return gridId === 'repo-grid' ? repoFilters : searchFilters; }

function applyRepositorySortFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const sort = params.get('sort');
  repoFilters.sort = ['title', 'title-desc', 'course', 'year', 'views'].includes(sort) ? sort : '';
  for (const type of ['course', 'year']) {
    const directValue = Security.search(params.get(type));
    if (directValue !== '') repoFilters[type] = directValue;
  }
  const filter = params.get('filter');
  const value = Security.search(params.get('value'));
  if (['title', 'course', 'year', 'views'].includes(filter) && value !== '') {
    repoFilters[filter] = value;
  }
}

function sortRepositoryResults(theses, filters) {
  const sort = filters?.sort;
  if (sort === 'title' || sort === 'title-desc') return sortThesisTitles(theses, sort);
  const results = [...theses];
  if (sort === 'title' || sort === 'course') {
    results.sort((a, b) => String(a[sort] || '').localeCompare(String(b[sort] || ''), undefined, { sensitivity: 'base' }));
  } else if (sort === 'year' || sort === 'views') {
    results.sort((a, b) => Number(b[sort] || 0) - Number(a[sort] || 0));
  }
  return results;
}

function onSearchInput(inp, gridId, pillsId) {
  const q = inp.value.trim();
  document.getElementById('ssclr-' + gridId).style.display = q ? 'block' : 'none';
  const dropdown = document.getElementById('ssdd-' + gridId);
  if (dropdown) dropdown.classList.remove('open');
}

function submitSearch(gridId, pillsId) {
  const inp = document.getElementById('ssinp-' + gridId);
  if (!inp) return;
  const F = getFilters(gridId);
  F.text = Security.search(inp.value);
  const clear = document.getElementById('ssclr-' + gridId);
  if (clear) clear.style.display = F.text ? 'block' : 'none';
  const dropdown = document.getElementById('ssdd-' + gridId);
  if (dropdown) dropdown.classList.remove('open');
  applyRender(gridId, pillsId, F);
}

function openDropdown(inp, gridId) {
  if (inp.value.trim()) buildDropdown(gridId, inp.value.trim());
}

function buildDropdown(gridId, q) {
  if (!q) { document.getElementById('ssdd-' + gridId).classList.remove('open'); return; }
  q = Security.search(q);
  const ql = q.toLowerCase();
  const titles = [], authors = [], advisers = [], years = [], courses = [];
  const sA = new Set(), sAdv = new Set(), sY = new Set(), sC = new Set();

  DB.forEach(t => {
    if (t.title.toLowerCase().includes(ql) || t.keywords.toLowerCase().includes(ql) || t.abstract.toLowerCase().includes(ql)) titles.push(t);
    t.authors.split(';').forEach(a => {
      const at = a.trim();
      if (at.toLowerCase().includes(ql) && !sA.has(at)) { sA.add(at); authors.push({ txt: at, id: t.id }); }
    });
    if (t.adviser.toLowerCase().includes(ql) && !sAdv.has(t.adviser)) { sAdv.add(t.adviser); advisers.push(t.adviser); }
    if (String(t.year).includes(q) && !sY.has(t.year)) { sY.add(t.year); years.push(t.year); }
    if (t.course.toLowerCase().includes(ql) && !sC.has(t.course)) { sC.add(t.course); courses.push(t.course); }
  });

  let h = '';
  if (titles.length) {
    h += `<div class="dd-section"><i class="bi bi-file-earmark-text"></i> Studies</div>`;
    h += titles.slice(0, 4).map(t =>
      `<div class="dd-item" onclick="pickTitle(${Security.jsArg(t.id)},'${gridId}')">
        <span class="dd-icon"><i class="bi bi-file-earmark-text"></i></span>
        <div style="flex:1">
          <div class="dd-main">${highlight(t.title, ql)}</div>
          <div class="dd-sub">${Security.escapeHTML(t.authors.split(';')[0].trim())} · ${Security.escapeHTML(t.year)}</div>
        </div>
        <span class="dd-tag">${Security.escapeHTML(t.course)}</span>
      </div>`).join('');
  }
  if (authors.length) {
    h += `<div class="dd-section"><i class="bi bi-person-fill"></i> Authors</div>`;
    h += authors.slice(0, 3).map(a =>
      `<div class="dd-item" onclick="pickFilter('${gridId}','author',${Security.jsArg(a.txt)})">
        <span class="dd-icon"><i class="bi bi-person-fill"></i></span>
        <div class="dd-main">${highlight(a.txt, ql)}</div>
      </div>`).join('');
  }
  if (advisers.length) {
    h += `<div class="dd-section"><i class="bi bi-mortarboard-fill"></i> Advisers</div>`;
    h += advisers.slice(0, 3).map(a =>
      `<div class="dd-item" onclick="pickFilter('${gridId}','adviser',${Security.jsArg(a)})">
        <span class="dd-icon"><i class="bi bi-mortarboard-fill"></i></span>
        <div class="dd-main">${highlight(a, ql)}</div>
      </div>`).join('');
  }
  if (years.length) {
    h += `<div class="dd-section"><i class="bi bi-calendar3"></i> Year</div>`;
    h += years.map(y =>
      `<div class="dd-item" onclick="pickFilter('${gridId}','year',${Security.jsArg(y)})">
        <span class="dd-icon"><i class="bi bi-calendar3"></i></span>
        <div class="dd-main">${Security.escapeHTML(y)}</div>
      </div>`).join('');
  }
  if (courses.length) {
    h += `<div class="dd-section"><i class="bi bi-mortarboard"></i> Program</div>`;
    h += courses.map(c =>
      `<div class="dd-item" onclick="pickFilter('${gridId}','course',${Security.jsArg(c)})">
        <span class="dd-icon"><i class="bi bi-folder2"></i></span>
        <div class="dd-main">${Security.escapeHTML(c)}</div>
      </div>`).join('');
  }
  if (!h) h = `<div class="dd-empty">No results found for "<strong>${Security.escapeHTML(q)}</strong>"</div>`;

  const dd = document.getElementById('ssdd-' + gridId);
  dd.innerHTML = h;
  dd.classList.add('open');
}

function highlight(str, q) {
  str = String(str ?? ''); q = Security.search(q);
  if (!q) return Security.escapeHTML(str);
  const lower = str.toLowerCase(), needle = q.toLowerCase();
  let cursor = 0, output = '', found;
  while ((found = lower.indexOf(needle, cursor)) !== -1) {
    output += Security.escapeHTML(str.slice(cursor, found)) + '<mark>' + Security.escapeHTML(str.slice(found, found + q.length)) + '</mark>';
    cursor = found + q.length;
  }
  return output + Security.escapeHTML(str.slice(cursor));
}

async function openRepositoryThesisFromUrl() {
  const id = new URLSearchParams(window.location.search).get('thesis');
  if (!id || !DB.some(thesis => String(thesis.id) === String(id))) return false;
  await openThesisModal(id);
  return true;
}

function pickTitle(id, gridId) {
  openThesisModal(id);
  document.getElementById('ssdd-' + gridId).classList.remove('open');
}

function pickFilter(gridId, type, val) {
  const F = getFilters(gridId);
  const pillsId = gridId === 'repo-grid' ? 'rss-pills' : 'sss-pills';
  if (type === 'author') {
    F.author = val;
  } else {
    F[type] = val;
    const inp = document.getElementById('ssinp-' + gridId);
    if (inp) { inp.value = ''; F.text = ''; document.getElementById('ssclr-' + gridId).style.display = 'none'; }
  }
  document.getElementById('ssdd-' + gridId).classList.remove('open');
  renderPills(pillsId, gridId, F);
  applyRender(gridId, pillsId, F);
}

function clearSearch(gridId, pillsId) {
  const F = getFilters(gridId);
  const inp = document.getElementById('ssinp-' + gridId);
  if (inp) inp.value = '';
  F.text = '';
  document.getElementById('ssclr-' + gridId).style.display = 'none';
  document.getElementById('ssdd-' + gridId).classList.remove('open');
  applyRender(gridId, pillsId, F);
}

function renderPills(pillsId, gridId, F) {
  syncSearchFilterControls(gridId, F);
  let h = '';
  if (F.title)   h += `<span class="filter-pill"><i class="bi bi-file-earmark-text"></i> ${Security.escapeHTML(F.title)}<button class="pill-remove" onclick="removePill('title','${gridId}','${pillsId}')">×</button></span>`;
  if (F.year)    h += `<span class="filter-pill"><i class="bi bi-calendar3"></i> ${Security.escapeHTML(F.year)}<button class="pill-remove" onclick="removePill('year','${gridId}','${pillsId}')">×</button></span>`;
  if (F.course)  h += `<span class="filter-pill"><i class="bi bi-folder2"></i> ${Security.escapeHTML(F.course)}<button class="pill-remove" onclick="removePill('course','${gridId}','${pillsId}')">×</button></span>`;
  if (F.adviser) h += `<span class="filter-pill"><i class="bi bi-mortarboard-fill"></i> ${Security.escapeHTML(F.adviser)}<button class="pill-remove" onclick="removePill('adviser','${gridId}','${pillsId}')">×</button></span>`;
  if (F.author)  h += `<span class="filter-pill"><i class="bi bi-person-fill"></i> ${Security.escapeHTML(F.author)}<button class="pill-remove" onclick="removePill('author','${gridId}','${pillsId}')">×</button></span>`;
  if (F.views)   h += `<span class="filter-pill"><i class="bi bi-eye-fill"></i> ${Security.escapeHTML(F.views)} views<button class="pill-remove" onclick="removePill('views','${gridId}','${pillsId}')">×</button></span>`;
  document.getElementById(pillsId).innerHTML = h
    ? `<div class="filter-pills">${h}</div>` : '';
}

function removePill(type, gridId, pillsId) {
  const F = getFilters(gridId);
  F[type] = '';
  renderPills(pillsId, gridId, F);
  applyRender(gridId, pillsId, F);
}

function applyRender(gridId, pillsId, F) {
  const results = DB.filter(t => {
    const q  = F.text.toLowerCase();
    const mt = !q || t.title.toLowerCase().includes(q) || t.authors.toLowerCase().includes(q) ||
               t.adviser.toLowerCase().includes(q) || t.keywords.toLowerCase().includes(q) ||
               t.abstract.toLowerCase().includes(q) ||
               String(t.year).includes(q) || t.course.toLowerCase().includes(q);
    return mt &&
      (!F.title   || t.title === F.title) &&
      (!F.year    || String(t.year) === String(F.year)) &&
      (!F.course  || t.course === F.course) &&
      (!F.adviser || t.adviser.toLowerCase().includes(F.adviser.toLowerCase())) &&
      (!F.author  || t.authors.toLowerCase().includes(F.author.toLowerCase())) &&
      (!F.views   || String(t.views) === String(F.views));
  });
  const noInput = !F.text && !F.title && !F.year && !F.course && !F.adviser && !F.author && !F.views;
  const renderedResults = gridId === 'repo-grid' ? sortRepositoryResults(results, F) : results;
  if (gridId === 'repo-grid' && typeof renderRepositoryResults === 'function') {
    renderRepositoryResults(gridId, renderedResults, F);
  } else {
    renderThesisGrid(gridId, renderedResults, F, gridId === 'search-grid' && noInput);
  }
}


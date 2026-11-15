"use strict";

let guestRepositoryPage = 1;
let guestRepositoryResultKey = '';

async function initGuestAccount() {
  currentUser = { name: 'Guest User', email: 'guest', role: 'guest' };
}

function guestEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function renderGuestTheses(theses) {
  const container = document.getElementById('guest-results');
  container.classList.remove('is-empty');

  const resultKey = JSON.stringify({ query: document.getElementById('guest-search')?.value || '', filters: guestFilters, sort: guestTitleSort }) + ':' + theses.map(thesis => thesis.id).join(',');
  if (resultKey !== guestRepositoryResultKey) {
    guestRepositoryPage = 1;
    guestRepositoryResultKey = resultKey;
  }
  const pages = Math.max(1, Math.ceil(theses.length / REPOSITORY_PAGE_SIZE));
  guestRepositoryPage = Math.min(guestRepositoryPage, pages);
  const start = (guestRepositoryPage - 1) * REPOSITORY_PAGE_SIZE;
  const visibleTheses = theses.slice(start, start + REPOSITORY_PAGE_SIZE);

  const courseClasses = { BSCS: 'chip-cs', BSIT: 'chip-it', BSDSA: 'chip-dsa' };
  container.innerHTML = `<div class="guest-table-wrap"><table class="data-table guest-results-table">
    <thead><tr><th>Title</th><th>Author(s)</th><th>Adviser</th><th>Program</th><th>Year</th><th>Views</th></tr></thead>
    <tbody>${visibleTheses.map(thesis => `<tr onclick="openThesisModal(${Security.jsArg(thesis.id)})" tabindex="0" onkeydown="if(event.key==='Enter'){openThesisModal(${Security.jsArg(thesis.id)})}">
      <td><button type="button" class="guest-table-title thesis-title-link"
                  onclick="openThesisModal(${Security.jsArg(thesis.id)}); event.stopPropagation()"
                  aria-label="View files for ${guestEscape(thesis.title)}">${guestEscape(thesis.title)}</button></td>
      <td>${guestEscape(thesis.authors)}</td>
      <td>${guestEscape(thesis.adviser)}</td>
      <td><span class="chip ${courseClasses[thesis.course] || 'chip-cs'}">${guestEscape(thesis.course)}</span></td>
      <td>${guestEscape(thesis.year)}</td>
      <td><i class="bi bi-eye-fill"></i> ${Number(thesis.views) || 0}</td>
    </tr>`).join('') || `<tr class="table-empty-row"><td colspan="6"><div class="table-empty-content"><i class="bi bi-inbox" aria-hidden="true"></i><strong>No thesis records match your search or filters.</strong><span>Records will appear here when available.</span></div></td></tr>`}</tbody>
  </table></div>${paginationMarkup(guestRepositoryPage, pages, theses.length, 'changeGuestRepositoryPage')}`;
}

function changeGuestRepositoryPage(direction) {
  guestRepositoryPage += direction;
  refreshGuestSearch();
  document.querySelector('#guest-results .guest-table-wrap')?.scrollTo({ top: 0, left: 0 });
}

let guestTitleSort = '';

function getGuestSearchResults() {
  const query = Security.search(document.getElementById('guest-search')?.value).toLowerCase();
  const searched = DB.filter(thesis => !query || [
    thesis.title,
    thesis.abstract,
    thesis.authors,
    thesis.adviser,
    thesis.course,
    thesis.year,
    thesis.keywords
  ].some(value => String(value || '').toLowerCase().includes(query)));
  return sortThesisTitles(applyGuestFilters(searched), guestTitleSort);
}

function refreshGuestSearch() {
  const searchInput = document.getElementById('guest-search');
  const clearButton = document.getElementById('guest-search-clear');
  if (clearButton) clearButton.hidden = !searchInput?.value;
  renderGuestTheses(getGuestSearchResults());
}

function setupGuestEventListeners() {
  const searchInput = document.getElementById('guest-search');
  const searchBtn = document.querySelector('.guest-search-btn');
  const clearButton = document.getElementById('guest-search-clear');
  
  searchBtn.addEventListener('click', refreshGuestSearch);
  searchInput.addEventListener('input', refreshGuestSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') refreshGuestSearch();
  });
  clearButton?.addEventListener('click', () => {
    searchInput.value = '';
    refreshGuestSearch();
    searchInput.focus();
  });
  
  // Initialize filter dropdowns
  populateGuestFilterDropdowns();
  renderGuestFilterState();
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.guest-filter-dropdown')) {
      document.querySelectorAll('.guest-filter-menu').forEach(m => m.classList.remove('active'));
    }
  });
}

function toggleGuestFilters(event) {
  event?.stopPropagation();
  const panel = document.getElementById('guest-filters-panel');
  const button = document.querySelector('.guest-filter-toggle');
  const isOpen = panel.classList.toggle('open');
  button.classList.toggle('active', isOpen);
  button.setAttribute('aria-expanded', String(isOpen));
}

// Store current guest filters
let guestFilters = {
  year: '',
  course: '',
  adviser: '',
  author: ''
};

function populateGuestFilterDropdowns() {
  const years = [...new Set(DB.map(t => t.year))].sort((a, b) => b - a);
  const advisers = [...new Set(DB.map(t => t.adviser))].sort();
  const authors = [...new Set(DB.flatMap(t => t.authors.split(';').map(a => a.trim())))].sort();
  
  if (!document.getElementById('guest-title-sort')) {
    const control = document.createElement('div');
    control.id = 'guest-title-sort';
    control.innerHTML = titleSortControl(guestTitleSort, 'guestTitleSort=this.value;refreshGuestSearch()');
    document.getElementById('guest-filters-panel').appendChild(control);
  }
  // Populate years
  const yearMenu = document.getElementById('year-filter');
  yearMenu.innerHTML = '<div class="guest-filter-item" onclick="applyGuestFilter(\'year\', \'\')">All Years</div>';
  years.forEach(year => {
    const item = document.createElement('div');
    item.className = 'guest-filter-item';
    item.textContent = year;
    item.onclick = () => applyGuestFilter('year', year);
    yearMenu.appendChild(item);
  });
  
  // Populate advisers
  const adviserMenu = document.getElementById('adviser-filter');
  adviserMenu.innerHTML = '<div class="guest-filter-item" onclick="applyGuestFilter(\'adviser\', \'\')">All Advisers</div>';
  advisers.forEach(adviser => {
    const item = document.createElement('div');
    item.className = 'guest-filter-item';
    item.textContent = adviser;
    item.onclick = () => applyGuestFilter('adviser', adviser);
    adviserMenu.appendChild(item);
  });
  
  // Populate authors
  const authorMenu = document.getElementById('author-filter');
  authorMenu.innerHTML = '<div class="guest-filter-item" onclick="applyGuestFilter(\'author\', \'\')">All Authors</div>';
  authors.forEach(author => {
    const item = document.createElement('div');
    item.className = 'guest-filter-item';
    item.textContent = author;
    item.onclick = () => applyGuestFilter('author', author);
    authorMenu.appendChild(item);
  });
}

function applyGuestFilter(type, value) {
  guestFilters[type] = value;
  
  // Close dropdown
  document.querySelectorAll('.guest-filter-menu').forEach(m => m.classList.remove('active'));
  renderGuestFilterState();
  
  // Update display with filtered results
  refreshGuestSearch();
}

function renderGuestFilterState() {
  const labels = { year: 'Year', course: 'Program', adviser: 'Adviser', author: 'Author' };
  Object.entries(labels).forEach(([type, label]) => {
    const button = document.getElementById(`${type}-filter`)?.previousElementSibling;
    if (button) button.innerHTML = `${guestFilters[type] ? `${label}: ${guestEscape(guestFilters[type])}` : label} <i class="bi bi-chevron-down"></i>`;
  });

  const active = Object.entries(guestFilters).filter(([, value]) => value !== '');
  const container = document.getElementById('guest-active-filters');
  if (!container) return;
  container.innerHTML = active.map(([type, value]) => `<span class="guest-filter-pill"><span>${labels[type]}: ${guestEscape(value)}</span><button type="button" onclick="removeGuestFilter('${type}')" aria-label="Remove ${labels[type]} filter"><i class="bi bi-x"></i></button></span>`).join('');
  container.classList.toggle('has-filters', active.length > 0);
}

function removeGuestFilter(type) {
  if (!(type in guestFilters)) return;
  guestFilters[type] = '';
  renderGuestFilterState();
  refreshGuestSearch();
}

function applyGuestFilters(theses) {
  return theses.filter(thesis => {
    if (guestFilters.year && thesis.year != guestFilters.year) return false;
    if (guestFilters.course && thesis.course !== guestFilters.course) return false;
    if (guestFilters.adviser && thesis.adviser !== guestFilters.adviser) return false;
    if (guestFilters.author && !thesis.authors.includes(guestFilters.author)) return false;
    return true;
  });
}

let guestScannerStream = null;
let guestScannerFrame = null;
let guestScannerTimeout = null;
let guestScannerRetry = null;

function setGuestScannerStatus(message) {
  const status = document.getElementById('guest-scanner-status');
  if (status) status.textContent = message;
}

function closeGuestQRScanner() {
  if (guestScannerFrame) cancelAnimationFrame(guestScannerFrame);
  if (guestScannerTimeout) clearTimeout(guestScannerTimeout);
  if (guestScannerRetry) clearTimeout(guestScannerRetry);
  guestScannerFrame = null;
  guestScannerTimeout = null;
  guestScannerRetry = null;
  if (guestScannerStream) guestScannerStream.getTracks().forEach(track => track.stop());
  guestScannerStream = null;
  const video = document.getElementById('qr-video');
  if (video) video.srcObject = null;
  const scanner = document.getElementById('guest-scanner');
  if (scanner) scanner.hidden = true;
  document.body.style.overflow = '';
}

function guestThesisIdFromQR(text) {
  if (typeof text !== 'string' || text.length > 2048 || /[\u0000-\u001f]/.test(text)) return '';
  const match = text.match(/\/thesis\/([^/?#]+)/);
  const value = match ? match[1] : text.trim();
  try { return decodeURIComponent(value); } catch (_) { return ''; }
}

async function openGuestThesisFromPath() {
  const id = guestThesisIdFromQR(window.location.pathname);
  if (!id || !window.location.pathname.startsWith('/thesis/')) return;
  let thesis = DB.find(item => String(item.id) === id);
  if (!thesis) {
    try {
      const { theses } = await repositoryRequest(`theses?refresh=${Date.now()}`, { cache: 'no-store' });
      DB.splice(0, DB.length, ...theses);
      renderGuestTheses(DB);
      thesis = DB.find(item => String(item.id) === id);
    } catch (_) { /* keep the unavailable message below */ }
  }
  if (thesis) openThesisModal(thesis.id);
  else showToast('This thesis is unavailable or has not been published.');
}

async function openGuestQRScanner() {
  const video = document.getElementById('qr-video');
  const canvas = document.getElementById('qr-canvas');
  const scanner = document.getElementById('guest-scanner');

  if (!navigator.mediaDevices?.getUserMedia || typeof jsQR !== 'function') {
    showToast('QR scanning is not supported by this browser.');
    return;
  }

  closeGuestQRScanner();
  scanner.hidden = false;
  document.body.style.overflow = 'hidden';
  setGuestScannerStatus('Allow camera access to begin scanning.');

  try {
    guestScannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } }
    });
    video.srcObject = guestScannerStream;
    await video.play();
    setGuestScannerStatus('Scanning…');

    function scanFrame() {
      if (!guestScannerStream) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        });
        
        if (code?.data) {
          const thesisId = guestThesisIdFromQR(code.data);
          const thesis = DB.find(x => String(x.id) === String(thesisId));
          if (thesis) {
            setGuestScannerStatus('Thesis found. Opening…');
            closeGuestQRScanner();
            showToast('Thesis found! Opening…');
            setTimeout(() => openThesisModal(thesis.id), 300);
          } else {
            setGuestScannerStatus('Thesis not found. Try another ThesisLink QR code.');
            showToast('Thesis not found in the published repository.');
            guestScannerRetry = setTimeout(() => {
              if (guestScannerStream) guestScannerFrame = requestAnimationFrame(scanFrame);
            }, 1500);
          }
          return;
        }
      }
      guestScannerFrame = requestAnimationFrame(scanFrame);
    }
    scanFrame();
    guestScannerTimeout = setTimeout(() => {
      closeGuestQRScanner();
      showToast('Scanner timed out. Open it to try again.');
    }, 120000);
  } catch (err) {
    closeGuestQRScanner();
    const msg = err.name === 'NotAllowedError'
      ? 'Camera permission denied. Please allow camera access.'
      : 'Could not access camera: ' + err.message;
    showToast(msg);
  }
}

window.addEventListener('pagehide', closeGuestQRScanner);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.getElementById('guest-scanner')?.hidden) closeGuestQRScanner();
});

function protectGuestViewer() {
  // Keep the compact guest badge without adding a warning row above the document.
  const guestBadge = document.getElementById('fv-guest-badge');
  if (guestBadge) guestBadge.style.display = 'inline-block';
  
  // Prevent printing
  let style = document.getElementById('guest-protect-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'guest-protect-style';
    style.textContent = `
      @media print {
        * { display: none !important; }
      }
      #file-viewer-modal { -webkit-user-select: none; user-select: none; }
    `;
    document.head.appendChild(style);
  }
  
  // Prevent keyboard shortcuts (Ctrl+P, Ctrl+S, Ctrl+Shift+S, etc.)
  const fileViewerModal = document.getElementById('file-viewer-modal');
  if (fileViewerModal && fileViewerModal.dataset.guestProtectionReady !== 'true') {
    fileViewerModal.dataset.guestProtectionReady = 'true';
    fileViewerModal.addEventListener('keydown', (e) => {
      // Ctrl+P (Print)
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        showToast('Printing is disabled for guest users');
        return false;
      }
      // Ctrl+S (Save)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        showToast('Saving is disabled for guest users');
        return false;
      }
      // Ctrl+Shift+S (Save As)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        return false;
      }
    }, true);
    
    // Prevent right-click context menu
    fileViewerModal.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showToast('Context menu is disabled for guest users');
      return false;
    }, true);

    fileViewerModal.addEventListener('copy', (e) => {
      e.preventDefault();
    }, true);
  }
}



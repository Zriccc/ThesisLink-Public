"use strict";

// Identity comes only from the server's verified, HttpOnly session cookie.
let verifiedSession = null;
let sessionExpiryTimer = null;
let sessionValidationTimer = null;
let sessionActivityTimer = null;
let sessionRenewalPromise = null;
let sessionActivityInstalled = false;
let lastSessionRenewalAt = 0;
let sessionLastActivityAt = 0;
let sessionFailureReason = '';
let accountDirectory = {};
let googleIdentityReady = false;
let googleIdentityLoading = null;
let googleIdentityNonce = '';
const ROLE_HOME = { admin: '/pages/admin/dashboard.html', faculty: '/pages/adviser/repository.html', student: '/pages/student/repository.html', guest: '/' };

function installShellSkeletons() {
  document.querySelectorAll('.sidebar').forEach(sidebar => {
    sidebar.classList.add('sidebar-shell-loading');
    sidebar.setAttribute('aria-busy', 'true');
    sidebar.querySelectorAll('[data-account-roles]').forEach(item => { item.hidden = true; });
    const nav = sidebar.querySelector('.sb-nav');
    if (nav && !nav.querySelector('.sidebar-nav-skeleton')) {
      const skeleton = document.createElement('div');
      skeleton.className = 'sidebar-nav-skeleton';
      skeleton.setAttribute('aria-hidden', 'true');
      skeleton.innerHTML = '<span></span>'.repeat(7);
      nav.prepend(skeleton);
    }
  });
}

function revealAuthorizedNavigation() {
  document.querySelectorAll('.sidebar [data-account-roles]').forEach(item => { item.hidden = false; });
}

function finishShellSkeletons() {
  document.querySelectorAll('.sidebar-shell-loading').forEach(sidebar => {
    sidebar.classList.remove('sidebar-shell-loading');
    sidebar.removeAttribute('aria-busy');
    sidebar.querySelector('.sidebar-nav-skeleton')?.remove();
  });
}

function installRouteSkeletons() {
  installShellSkeletons();
  document.querySelectorAll('.topbar').forEach(topbar => {
    topbar.classList.add('topbar-loading');
    topbar.setAttribute('aria-busy', 'true');
  });
  const tableColumns = { 'users-tbody': 6, 'logs-tbody': 4, 'upload-requests-body': 4, 'report-tbody': 6 };
  Object.entries(tableColumns).forEach(([id, fallbackColumns]) => {
    const body = document.getElementById(id);
    if (!body || body.children.length) return;
    const table = body.closest('table');
    const columns = table?.querySelectorAll('thead th').length || table?.querySelectorAll('colgroup col').length || fallbackColumns;
    const cells = '<td class="route-skeleton-cell"><span></span></td>'.repeat(columns);
    body.innerHTML = `<tr class="route-skeleton-row" aria-hidden="true">${cells}</tr>`.repeat(6);
  });
  ['admin-grid', 'myuploads-grid'].forEach(id => {
    const grid = document.getElementById(id);
    if (grid && !grid.children.length) grid.innerHTML = `<div class="route-skeleton-grid" aria-hidden="true">${'<div class="route-skeleton-card"><span></span><span></span><span></span><span></span></div>'.repeat(6)}</div>`;
  });
  ['repo-grid', 'advisee-results'].forEach(id => {
    const table = document.getElementById(id);
    if (!table || table.children.length) return;
    table.classList.add('repository-table-mode');
    const columns = id === 'advisee-results' || location.pathname.includes('/admin/') ? 5 : 4;
    const cells = '<td class="route-skeleton-cell"><span></span></td>'.repeat(columns);
    table.innerHTML = `<div class="repository-table-wrap route-skeleton-table" aria-hidden="true"><table class="data-table repository-results-table"><thead><tr>${'<th class="route-skeleton-cell"><span></span></th>'.repeat(columns)}</tr></thead><tbody>${`<tr class="route-skeleton-row">${cells}</tr>`.repeat(7)}</tbody></table></div>`;
  });
  const filters = document.getElementById('dash-tbody');
  if (filters && !filters.children.length) filters.innerHTML = `<div class="route-skeleton-tiles" aria-hidden="true">${'<span></span>'.repeat(3)}</div>`;
  const activity = document.getElementById('recent-activity-list');
  if (activity && !activity.children.length) activity.innerHTML = `<div class="route-skeleton-list" aria-hidden="true">${'<span></span>'.repeat(4)}</div>`;
}

function finishTopbarSkeletons() {
  const finish = () => document.querySelectorAll('.topbar-loading').forEach(topbar => {
    topbar.classList.remove('topbar-loading');
    topbar.removeAttribute('aria-busy');
  });
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
  else setTimeout(finish, 0);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installRouteSkeletons);
else installRouteSkeletons();

async function authRequest(action, body) {
  if (body !== undefined) body = Security.authPayload(action, body);
  const response = await fetch('/api/auth/' + action, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || (response.status === 429 ? 'Too many attempts. Please wait and try again.' : 'The request could not be completed.'));
  }
  return result;
}
function loadSession() { return verifiedSession; }
function sessionEndUrl(reason) { return '/pages/auth/index.html?session=' + encodeURIComponent(reason); }
async function refreshSession(redirectOnFailure = false) {
  const result = await authRequest('session');
  verifiedSession = result.user;
  sessionFailureReason = result.reason || '';
  scheduleSessionExpiry(verifiedSession);
  if (!verifiedSession && sessionFailureReason && redirectOnFailure && !location.pathname.endsWith('/pages/auth/index.html')) window.location.replace(sessionEndUrl(sessionFailureReason));
  return verifiedSession;
}
function scheduleSessionExpiry(user) {
  clearTimeout(sessionExpiryTimer);
  sessionExpiryTimer = null;
  if (!user?.sessionExpiresAt) return;
  const remaining = Date.parse(user.sessionExpiresAt) - Date.now();
  if (remaining <= 0) return window.location.replace(sessionEndUrl('expired'));
  sessionExpiryTimer = setTimeout(() => {
    verifiedSession = null;
    window.location.replace(sessionEndUrl('expired'));
  }, Math.min(remaining, 2147483647));
}
async function renewSessionForActivity() {
  if (!verifiedSession) return null;
  if (sessionRenewalPromise) return sessionRenewalPromise;
  clearTimeout(sessionActivityTimer);
  sessionActivityTimer = null;
  const activityAt = new Date(sessionLastActivityAt || Date.now()).toISOString();
  sessionRenewalPromise = authRequest('session/activity', { activityAt }).then(result => {
    verifiedSession = result.user;
    lastSessionRenewalAt = Date.now();
    scheduleSessionExpiry(verifiedSession);
    return verifiedSession;
  }).finally(() => { sessionRenewalPromise = null; });
  return sessionRenewalPromise;
}
function recordSessionActivity() {
  if (!verifiedSession || document.visibilityState === 'hidden') return;
  sessionLastActivityAt = Date.now();
  if (sessionActivityTimer || sessionRenewalPromise) return;
  const throttleRemaining = Math.max(0, 5 * 60 * 1000 - (Date.now() - lastSessionRenewalAt));
  const expiryRemaining = Date.parse(verifiedSession.sessionExpiresAt) - Date.now();
  const delay = Number.isFinite(expiryRemaining) ? Math.max(0, Math.min(throttleRemaining, expiryRemaining - 60000)) : throttleRemaining;
  sessionActivityTimer = setTimeout(() => {
    sessionActivityTimer = null;
    renewSessionForActivity().catch(() => {});
  }, delay);
}
function monitorSession() {
  clearInterval(sessionValidationTimer);
  lastSessionRenewalAt = Date.now();
  sessionLastActivityAt = 0;
  if (!sessionActivityInstalled) {
    for (const event of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(event, recordSessionActivity, { passive: true });
    window.addEventListener('scroll', recordSessionActivity, { passive: true, capture: true });
    sessionActivityInstalled = true;
  }
  sessionValidationTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshSession(true).catch(() => {});
  }, 60000);
}
function addAccountYears(value, years) {
  const date = new Date(value), month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + years);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.toISOString();
}
function savedUserValidity() { return accountDirectory; }
function accountMetadata(user) { return accountDirectory[user.email.toLowerCase()] || user; }
function accountExpiry(user) { return user.role === 'student' ? user.expiresAt : null; }
async function loadAccountDirectory() {
  const { users } = await authRequest('users');
  accountDirectory = Object.fromEntries(users.map(user => [user.email.toLowerCase(), user]));
  return users;
}
async function saveUserMetadata(user) {
  await authRequest('users/' + encodeURIComponent(user.id) + '/extend', { expiresAt: user.expiresAt, extension: user.extensions.at(-1) });
  await loadAccountDirectory();
}
async function deleteManagedAccount(user) {
  await authRequest('users/' + encodeURIComponent(user.id) + '/delete', {});
  await loadAccountDirectory();
}
async function requireAuth(allowedRoles) {
  try {
    const user = await refreshSession(true);
    if (!user || user.mustChangePassword) {
      if (!user && sessionFailureReason) return null;
      window.location.replace('/pages/auth/index.html' + (user?.mustChangePassword ? '?recovery=1' : ''));
      return null;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) { window.location.replace(ROLE_HOME[user.role] || '/'); return null; }
    currentUser = user;
    return user;
  } catch (_) { window.location.replace('/pages/auth/index.html'); return null; }
}

function installAccountNavigation() {
  const nav = document.querySelector('.sb-nav');
  if (!nav || nav.querySelector('[data-account-navigation]')) return;
  const account = document.createElement('a');
  account.className = 'nav-item';
  account.href = '/pages/account/index.html';
  account.dataset.href = '/pages/account/index.html';
  account.dataset.title = 'Account';
  account.dataset.accountNavigation = 'true';
  account.innerHTML = '<span class="ni-icon"><i class="bi bi-person-gear" aria-hidden="true"></i></span> Account';
  nav.appendChild(account);
}

const ROLE_NAVIGATION = Object.freeze({
  admin: [
    ['Main', 'Home', 'bi-house-door-fill', '/pages/admin/dashboard.html'],
    ['', 'Repository', 'bi-journal-bookmark-fill', '/pages/admin/repository.html'],
    ['Management', 'Upload Thesis', 'bi-upload', '/pages/admin/upload.html'],
    ['', 'Upload Requests', 'bi-inbox-fill', '/pages/admin/requests.html'],
    ['', 'Reports', 'bi-bar-chart-fill', '/pages/admin/reports.html'],
    ['', 'Users', 'bi-people-fill', '/pages/admin/users.html'],
    ['', 'Logs', 'bi-clock-history', '/pages/admin/logs.html'],
    ['Tools', 'QR Scanner', 'bi-camera-fill', '/pages/admin/scanner.html'],
  ],
  faculty: [
    ['Main', 'Home', 'bi-house-door-fill', '/pages/adviser/repository.html'],
    ['Management', 'Reports', 'bi-bar-chart-fill', '/pages/adviser/reports.html'],
    ['', 'Advisees', 'bi-people-fill', '/pages/adviser/advisees.html'],
    ['Tools', 'QR Scanner', 'bi-camera-fill', '/pages/adviser/scanner.html'],
  ],
  student: [
    ['Main', 'Home', 'bi-house-door-fill', '/pages/student/repository.html'],
    ['', 'Upload Thesis', 'bi-upload', '/pages/student/upload.html'],
    ['', 'Notifications', 'bi-bell-fill', '/pages/student/notifications.html'],
    ['Tools', 'QR Scanner', 'bi-camera-fill', '/pages/student/scanner.html'],
  ],
});

function renderRoleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const role = window.currentUser?.role || currentUser?.role;
  const items = ROLE_NAVIGATION[role];
  if (!sidebar || !items) return;
  const header = sidebar.querySelector('.sb-hd');
  if (header) header.innerHTML = '<div class="sb-brand"><div class="sb-icon">T</div><div><div class="sb-title">ThesisLink</div><div class="sb-clg">CCSICT Repository</div></div></div>';
  const nav = sidebar.querySelector('.sb-nav');
  if (!nav) return;
  nav.innerHTML = items.map(([section, label, icon, href]) => {
    const heading = section ? `<div class="nav-label">${section}</div>` : '';
    const badge = role === 'student' && label === 'Notifications' ? ' <span class="notification-nav-badge" data-notification-count hidden></span>' : '';
    return `${heading}<a class="nav-item" href="${href}" data-title="${label}"><span class="ni-icon"><i class="bi ${icon}" aria-hidden="true"></i></span> ${label}${badge}</a>`;
  }).join('') + '<div class="nav-label">Account</div>';
  installAccountNavigation();
  const footer = sidebar.querySelector('.sb-footer');
  if (footer) footer.innerHTML = '<button class="btn-logout" onclick="doLogout()"><i class="bi bi-box-arrow-left" aria-hidden="true"></i> Sign Out</button>';
  if (typeof installMobileSidebarBackButton === 'function') installMobileSidebarBackButton();
}

function removeEmptyNavigationSections() {
  document.querySelectorAll('.sidebar .nav-label').forEach(label => {
    let item = label.nextElementSibling;
    let hasNavigation = false;
    while (item && !item.classList.contains('nav-label')) {
      if (item.classList.contains('nav-item') && !item.hidden) hasNavigation = true;
      item = item.nextElementSibling;
    }
    if (!hasNavigation) label.remove();
  });
}

function installWorkspaceFooter() {
  if (!['admin', 'faculty', 'student'].includes(currentUser?.role)) return;
  const app = document.getElementById('app');
  if (!app || app.querySelector('.workspace-footer')) return;
  app.classList.add('workspace-footer-layout');
  const footer = document.createElement('footer');
  footer.className = 'workspace-footer';
  footer.innerHTML = '<p>© 2026 <strong>ThesisLink</strong> · CCSICT · Isabela State University – Cabagan Campus</p>';
  app.appendChild(footer);
}

function initShell() {
  if (!currentUser) return;
  renderRoleSidebar();
  document.getElementById('sb-name').textContent  = currentUser.name;
  document.getElementById('sb-email').textContent = currentUser.email;

  const rb  = document.getElementById('sb-role-badge');
  const lbl = { admin: 'Admin', faculty: 'Faculty', student: 'Student', guest: 'Guest' };
  const cls = { admin: 'rb-admin', faculty: 'rb-adviser', student: 'rb-student', guest: 'rb-guest' };
  rb.textContent = lbl[currentUser.role];
  rb.className   = `role-badge ${cls[currentUser.role]}`;

  

  installWorkspaceFooter();
  if (typeof initializeThesisFormOptions === 'function') initializeThesisFormOptions();
  markActiveNav();
  monitorSession();
  revealAuthorizedNavigation();
  removeEmptyNavigationSections();
  finishShellSkeletons();
  finishTopbarSkeletons();
}

/** Highlights the current page's nav-item based on the URL, and sets the topbar title from its data-title. */
function markActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-item[href], .nav-item[data-href]').forEach(n => {
    const destination = n.getAttribute('href') || n.dataset.href;
    n.classList.toggle('active', destination === path);
  });
  const active = document.querySelector('.nav-item[href="' + path + '"], .nav-item[data-href="' + path + '"]');
  const titleEl = document.getElementById('tb-title');
  if (active && titleEl && active.dataset.title) titleEl.textContent = active.dataset.title;
}


function switchAuthTab(tab) {
  document.querySelector('.auth-card')?.classList.remove('password-setup-mode');
  document.querySelectorAll('.auth-tab').forEach((el, index) => el.classList.toggle('active', (index === 0 && tab === 'login') || (index === 1 && tab === 'register')));
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('first-login-password').hidden = true;
  document.getElementById('verification-wait').hidden = true;
  hideAuthAlert('login-alert'); hideAuthAlert('register-alert');
  clearAuthFieldErrors();
}
function showAuthAlert(id, message, type = 'error') {
  const el = document.getElementById(id);
  el.textContent = message;
  el.className = 'auth-alert ' + type;
  el.style.display = 'block';
}
function hideAuthAlert(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
const authFieldIds = ['l-email', 'l-pass', 'r-name', 'r-email', 'r-pass', 'r-confirm', 'r-terms', 'new-adviser-password', 'new-adviser-confirm'];
function setAuthFieldError(id, message) {
  const input = document.getElementById(id), error = document.getElementById(id + '-error');
  if (!input || !error) return false;
  error.textContent = message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  return Boolean(message);
}
function clearAuthFieldError(id) { setAuthFieldError(id, ''); }
function clearAuthFieldErrors(ids = authFieldIds) { ids.forEach(clearAuthFieldError); }
function focusFirstInvalid(ids) { ids.map(id => document.getElementById(id)).find(input => input?.getAttribute('aria-invalid') === 'true')?.focus(); }
function validAuthEmail(value) { try { Security.email(value); return true; } catch (_) { return false; } }
function validInstitutionalEmail(value) { try { Security.institutionalEmail(value); return true; } catch (_) { return false; } }
function updateRegisterPasswordRules() {
  const rules = Security.passwordRequirements(document.getElementById('r-pass')?.value || '');
  document.querySelectorAll('[data-register-password-rule]').forEach(item => {
    const met = rules[item.dataset.registerPasswordRule] === true;
    item.classList.toggle('met', met);
    item.setAttribute('aria-label', `${met ? 'Met' : 'Not met'}: ${item.textContent}`);
  });
  return Object.values(rules).every(Boolean);
}
function installAuthFieldValidation() {
  authFieldIds.forEach(id => document.getElementById(id)?.addEventListener('input', () => clearAuthFieldError(id)));
  document.getElementById('r-pass')?.addEventListener('input', updateRegisterPasswordRules);
  updateRegisterPasswordRules();
}
function toggleAuthPassword(id, button) {
  const input = document.getElementById(id);
  if (!input) return;
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  button.textContent = visible ? 'Show' : 'Hide';
  button.setAttribute('aria-pressed', String(!visible));
  input.focus();
}
function openAuthPolicies() {
  const modal = document.getElementById('auth-policy-modal');
  const body = document.getElementById('auth-policy-body');
  const button = document.getElementById('auth-policy-read');
  modal.classList.add('open');
  body.scrollTop = 0;
  button.disabled = true;
  requestAnimationFrame(() => { updateAuthPolicyReadState(); body.focus(); });
}
function closeAuthPolicies() { document.getElementById('auth-policy-modal').classList.remove('open'); }
function updateAuthPolicyReadState() {
  const body = document.getElementById('auth-policy-body');
  document.getElementById('auth-policy-read').disabled = body.scrollTop + body.clientHeight < body.scrollHeight - 4;
}
function acknowledgeAuthPolicies() {
  const checkbox = document.getElementById('r-terms');
  checkbox.disabled = false;
  document.getElementById('r-terms-label').classList.remove('is-disabled');
  closeAuthPolicies();
  checkbox.focus();
}
function showVerificationWait(email) {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('first-login-password').hidden = true;
  document.getElementById('verification-email').textContent = email;
  document.getElementById('verification-wait').hidden = false;
  try { localStorage.setItem('tl_pending_verification_email', email); } catch (_) { /* email prefill is optional */ }
}
function showVerifiedLogin(email) {
  switchAuthTab('login');
  if (email) document.getElementById('l-email').value = email;
  showAuthAlert('login-alert', 'Email verified successfully. Sign in to continue.', 'success');
}
async function doLogin() {
  const email = document.getElementById('l-email').value.trim(), password = document.getElementById('l-pass').value;
  const emailValid = Boolean(email) && validAuthEmail(email);
  hideAuthAlert('login-alert');
  clearAuthFieldErrors(['l-email', 'l-pass']);
  setAuthFieldError('l-email', !email ? 'Email address is required.' : !emailValid ? 'Enter a valid email address.' : '');
  setAuthFieldError('l-pass', password ? '' : 'Password is required.');
  if (!emailValid || !password) { focusFirstInvalid(['l-email', 'l-pass']); return; }
  const button = document.getElementById('login-submit');
  if (button.disabled) return;
  setAuthButtonLoading(button, true, 'Signing in…');
  try {
    const result = await authRequest('login', { email, password });
    const { user } = result;
    verifiedSession = user;
    sessionFailureReason = '';
    scheduleSessionExpiry(user);
    document.getElementById('l-pass').value = '';
    if (user.mustChangePassword) return beginAdviserPasswordChange();
    window.location.href = ROLE_HOME[user.role];
  } catch (error) { showAuthAlert('login-alert', error.message); }
  finally { setAuthButtonLoading(button, false); }
}
function setAuthButtonLoading(button, loading, label = '') {
  if (!button) return;
  if (loading) {
    button.dataset.idleLabel = button.textContent.trim();
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const spinner = document.createElement('span');
    spinner.className = 'auth-button-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    button.replaceChildren(spinner, document.createTextNode(label));
    return;
  }
  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.textContent = button.dataset.idleLabel || button.textContent;
  delete button.dataset.idleLabel;
}
async function initializeGoogleIdentity() {
  if (googleIdentityReady) return;
  if (googleIdentityLoading) return googleIdentityLoading;
  googleIdentityLoading = (async () => {
    const result = await authRequest('google/config');
    if (!window.google?.accounts?.id) throw new Error('Google sign-in could not be loaded. Check your connection and try again.');
    const nonce = await createGoogleNonce();
    googleIdentityNonce = nonce.raw;
    google.accounts.id.initialize({
      client_id: result.clientId,
      callback: finishGoogleAuth,
      nonce: nonce.hashed,
      auto_select: false,
      context: 'signin',
      hd: 'isu.edu.ph',
      use_fedcm_for_button: true,
    });
    renderGoogleButton('google-login-submit', 'login');
    renderGoogleButton('google-register-submit', 'register');
    googleIdentityReady = true;
  })();
  try { await googleIdentityLoading; }
  catch (error) { showGoogleLoadError(error); throw error; }
  finally { googleIdentityLoading = null; }
}
async function createGoogleNonce() {
  if (!window.crypto?.getRandomValues || !window.crypto?.subtle) throw new Error('Secure Google sign-in is unavailable in this browser.');
  const random = window.crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of random) binary += String.fromCharCode(byte);
  const raw = window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const digest = await window.crypto.subtle.digest('SHA-256', Uint8Array.from(raw, character => character.charCodeAt(0)));
  const hashed = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return { raw, hashed };
}
function renderGoogleButton(hostId, state) {
  const host = document.getElementById(hostId);
  if (!host || !window.google?.accounts?.id) return;
  host.replaceChildren();
  google.accounts.id.renderButton(host, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    locale: 'en',
    width: String(Math.min(400, Math.max(200, host.clientWidth || 320))),
    state,
  });
}
function showGoogleLoadError(error) {
  const message = error?.message || 'Google sign-in is unavailable. Please try again later or use your email and password.';
  for (const id of ['google-login-submit', 'google-register-submit']) {
    const host = document.getElementById(id);
    if (host) host.textContent = 'Google sign-in unavailable';
  }
  if (error) showAuthAlert('login-alert', message);
}
function setGoogleButtonLoading(host, loading) {
  if (!host) return;
  if (!loading) {
    host.removeAttribute('aria-busy');
    renderGoogleButton(host.id, host.id.includes('register') ? 'register' : 'login');
    return;
  }
  host.setAttribute('aria-busy', 'true');
  const spinner = document.createElement('span');
  spinner.className = 'auth-button-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  host.replaceChildren(spinner, document.createTextNode('Signing in with Google...'));
}
async function finishGoogleAuth(response) {
  const registering = response?.state === 'register';
  const alertId = registering ? 'register-alert' : 'login-alert';
  const button = document.getElementById(registering ? 'google-register-submit' : 'google-login-submit');
  hideAuthAlert(alertId);
  setGoogleButtonLoading(button, true);
  try {
    if (!response?.credential) throw new Error('Google sign-in did not return an account. Please try again.');
    if (!googleIdentityNonce) throw new Error('Google sign-in security verification failed. Please try again.');
    const result = await authRequest('google', { credential: response.credential, nonce: googleIdentityNonce });
    const { user } = result;
    verifiedSession = user;
    sessionFailureReason = '';
    scheduleSessionExpiry(user);
    if (user.mustChangePassword) return beginAdviserPasswordChange();
    window.location.href = ROLE_HOME[user.role];
  } catch (error) {
    showAuthAlert(alertId, error.message);
    setGoogleButtonLoading(button, false);
  }
}
async function doRegister() {
  const name = document.getElementById('r-name').value.trim(), email = document.getElementById('r-email').value.trim();
  const password = document.getElementById('r-pass').value, confirm = document.getElementById('r-confirm').value;
  const acceptedTerms = document.getElementById('r-terms').checked;
  hideAuthAlert('register-alert');
  clearAuthFieldErrors(['r-name', 'r-email', 'r-pass', 'r-confirm', 'r-terms']);
  const strongPassword = updateRegisterPasswordRules();
  setAuthFieldError('r-name', name ? '' : 'Full name is required.');
  setAuthFieldError('r-email', !email ? 'ISU email address is required.' : !validInstitutionalEmail(email) ? 'Use your @isu.edu.ph email address.' : '');
  setAuthFieldError('r-pass', !password ? 'Password is required.' : !strongPassword ? 'Add an uppercase letter, number, and symbol.' : '');
  setAuthFieldError('r-confirm', !confirm ? 'Confirm your password.' : password !== confirm ? 'Passwords do not match.' : '');
  setAuthFieldError('r-terms', acceptedTerms ? '' : 'Read and accept the Terms and Privacy Policy before registering.');
  const registrationFields = ['r-name', 'r-email', 'r-pass', 'r-confirm', 'r-terms'];
  const invalid = registrationFields.some(id => document.getElementById(id).getAttribute('aria-invalid') === 'true');
  if (invalid) { focusFirstInvalid(registrationFields); return; }
  const button = document.getElementById('register-submit');
  if (button.disabled) return;
  setAuthButtonLoading(button, true, 'Creating account…');
  try {
    await authRequest('register', { name, email, password, acceptedTerms: true });
    document.getElementById('r-pass').value = '';
    document.getElementById('r-confirm').value = '';
    clearAuthFieldErrors(registrationFields);
    showVerificationWait(email);
  } catch (error) { showAuthAlert('register-alert', error.message); }
  finally { setAuthButtonLoading(button, false); }
}
async function requestPasswordReset() {
  const email = document.getElementById('l-email').value.trim();
  const emailValid = Boolean(email) && validAuthEmail(email);
  hideAuthAlert('login-alert');
  setAuthFieldError('l-email', !email ? 'Email address is required.' : !emailValid ? 'Enter a valid email address.' : '');
  if (!emailValid) { document.getElementById('l-email').focus(); return; }
  const button = document.getElementById('reset-password-submit');
  if (button.disabled) return;
  button.disabled = true;
  try { const result = await authRequest('recover', { email }); showAuthAlert('login-alert', result.message, 'success'); }
  catch (error) { showAuthAlert('login-alert', error.message); }
  finally { button.disabled = false; }
}
function beginAdviserPasswordChange() {
  document.querySelector('.auth-card')?.classList.add('password-setup-mode');
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('first-login-password').hidden = false;
  document.getElementById('password-change-error').textContent = '';
  clearAuthFieldErrors(['new-adviser-password', 'new-adviser-confirm']);
}
async function cancelAdviserPasswordChange() { await doLogout(); }
async function finishAdviserPasswordChange(event) {
  event.preventDefault();
  const password = document.getElementById('new-adviser-password').value;
  const confirm = document.getElementById('new-adviser-confirm').value;
  const errorEl = document.getElementById('password-change-error');
  errorEl.textContent = '';
  clearAuthFieldErrors(['new-adviser-password', 'new-adviser-confirm']);
  const strongPassword = Object.values(Security.passwordRequirements(password)).every(Boolean);
  setAuthFieldError('new-adviser-password', !password ? 'New password is required.' : !strongPassword ? 'Use 8 to 20 characters with an uppercase letter, number, and symbol.' : '');
  setAuthFieldError('new-adviser-confirm', !confirm ? 'Confirm your new password.' : password !== confirm ? 'Passwords do not match.' : '');
  if (!strongPassword || !confirm || password !== confirm) { focusFirstInvalid(['new-adviser-password', 'new-adviser-confirm']); return; }
  const button = document.getElementById('save-first-password');
  if (button.disabled) return;
  button.disabled = true;
  try {
    const result = await authRequest('password', { password });
    verifiedSession = null;
    document.getElementById('new-adviser-password').value = '';
    document.getElementById('new-adviser-confirm').value = '';
    history.replaceState(null, '', '/pages/auth/index.html');
    switchAuthTab('login'); showAuthAlert('login-alert', result.message, 'success');
  } catch (error) { errorEl.textContent = error.message; }
  finally { button.disabled = false; }
}
async function initAuthPage() {
  installAuthFieldValidation();
  const params = new URLSearchParams(location.search);
  const googleResult = params.get('google');
  if (googleResult) {
    history.replaceState(null, '', '/pages/auth/index.html');
    if (googleResult === 'terms') {
      switchAuthTab('register');
      showAuthAlert('register-alert', 'Read and accept the Terms and Privacy Policy, then continue with Google to finish registration.');
    } else if (googleResult === 'domain') showAuthAlert('login-alert', 'Only verified @isu.edu.ph Google accounts can sign in.');
    else if (googleResult === 'cancelled') showAuthAlert('login-alert', 'Google sign-in was cancelled.');
    else if (googleResult === 'rate-limit') showAuthAlert('login-alert', 'Too many Google sign-in attempts. Please wait a few minutes and try again.');
    else if (googleResult === 'rejected') showAuthAlert('login-alert', 'This account cannot sign in. Contact the administrator.');
    else showAuthAlert('login-alert', 'Google sign-in could not be completed. Please try again.');
  }
  if (params.has('verified')) {
    let email = '';
    try {
      email = localStorage.getItem('tl_pending_verification_email') || '';
      localStorage.removeItem('tl_pending_verification_email');
      localStorage.setItem('tl_email_verified', JSON.stringify({ email, at: Date.now() }));
    } catch (_) { /* email prefill is optional */ }
    try { await authRequest('logout', {}); } catch (_) { /* confirmation is already complete */ }
    history.replaceState(null, '', '/pages/auth/index.html');
    showVerifiedLogin(email);
    return;
  }
  if (params.get('password') === 'changed') {
    let message = 'Password updated. Sign in with your new password.';
    try { message = sessionStorage.getItem('tl_account_message') || message; sessionStorage.removeItem('tl_account_message'); } catch (_) { /* default message remains */ }
    history.replaceState(null, '', '/pages/auth/index.html');
    showAuthAlert('login-alert', message, 'success');
    return;
  }
  if (params.get('error') === 'rate-limit') showAuthAlert('login-alert', 'Too many verification attempts. Please wait a few minutes and open the link again.');
  else if (params.get('session') === 'expired' || params.has('expired')) showAuthAlert('login-alert', 'Your 30-minute session ended. Sign in again to continue.');
  else if (params.get('session') === 'replaced') showAuthAlert('login-alert', 'You were signed out because this account was signed in on another device.');
  else if (params.get('session') === 'signed-out') showAuthAlert('login-alert', 'Your login is no longer active. Sign in again to continue.');
  else if (params.has('error')) showAuthAlert('login-alert', 'This confirmation link is invalid or expired. Request a new password reset or register again.');
  try {
    const user = await refreshSession();
    if (user && (params.has('recovery') || user.mustChangePassword)) return beginAdviserPasswordChange();
    if (user) window.location.replace(ROLE_HOME[user.role]);
    else if (params.has('recovery')) showAuthAlert('login-alert', 'Your reset link expired. Request a new one.');
  } catch (error) { showAuthAlert('login-alert', error.message); }
}
window.addEventListener('storage', event => {
  if (event.key !== 'tl_email_verified' || !event.newValue) return;
  try { showVerifiedLogin(JSON.parse(event.newValue).email || ''); } catch (_) { showVerifiedLogin(''); }
});
function doGuest() { window.location.href = '/'; }
function backToAuth() { window.location.href = '/pages/auth/index.html'; }
async function doLogout() {
  try { await authRequest('logout', {}); verifiedSession = null; clearTimeout(sessionExpiryTimer); clearTimeout(sessionActivityTimer); clearInterval(sessionValidationTimer); window.location.href = '/'; }
  catch (error) { showToast(error.message, 'danger'); }
}
// Discard the retired browser-only session; it never grants access.
try { localStorage.removeItem('tl_session'); } catch (_) { /* storage may be unavailable */ }
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });

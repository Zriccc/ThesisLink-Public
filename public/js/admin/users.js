"use strict";
let managedUsers = [];
let extensionEmail = null;
let usersLoading = false;
let usersRefreshStarted = false;
function canExtendAccount(user) {
  return user.role === 'student' && !user.graduated;
}
function userText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
async function buildUsersTable({ quiet = false } = {}) {
  if (usersLoading) return;
  usersLoading = true;
  const status = document.getElementById('users-refresh-status');
  if (status && !quiet) status.textContent = 'Refreshing...';
  try { await loadAccountDirectory(); } catch (error) {
    if (!quiet) document.getElementById('users-tbody').innerHTML = `<tr><td colspan="6">${userText(error.message)}</td></tr>`;
    if (status) status.textContent = 'Refresh failed';
    usersLoading = false;
    return;
  }
  const users = new Map(USERS_DATA.map(user => [user.email.toLowerCase(), accountMetadata(user)]));
  Object.values(savedUserValidity()).forEach(user => users.set(user.email.toLowerCase(), user));
  managedUsers = [...users.values()];
  document.getElementById('users-tbody').innerHTML = managedUsers.map((user, index) => {
    const expiry = accountExpiry(user);
    const remaining = expiry ? Date.parse(expiry) - Date.now() : Infinity;
    const status = user.graduated ? 'Graduated' : remaining <= 0 ? 'Expired' :
      remaining <= 30 * 86400000 ? 'Expiring soon' :
      !user.status || ['pending', 'active', 'registered'].includes(user.status.toLowerCase()) ? 'Registered' : user.status;
    const badge = { graduated: 'graduated', expired: 'expired', 'expiring soon': 'expiring', registered: 'active' }[status.toLowerCase()] || 'inactive';
    return `<tr><td class="user-name">${userText(user.name)}</td><td>${userText(user.email)}</td><td class="user-role">${userText(user.role)}</td>
      <td><span class="user-status user-status-${badge}">${userText(status)}</span></td>
      <td class="user-expiry">${expiry ? new Date(expiry).toLocaleDateString() : user.role === 'student' ? 'Registration date needed' : 'No expiry'}</td>
      <td>${['student', 'faculty'].includes(user.role) ? `<details class="user-actions-menu" ontoggle="positionUserActions(this)"><summary aria-label="Account actions for ${userText(user.name)}"><i class="bi bi-three-dots-vertical"></i></summary>
        <div class="user-actions-popover">
          ${canExtendAccount(user) ? `<button type="button" onclick="this.closest('details').open=false;openAccountExtension(${index})">Extend validity</button>` : ''}
          ${user.role === 'student' ? `<button type="button" onclick="deleteManagedAccountFromList(${index},this)">${user.graduated ? 'Delete account' : 'Mark graduated and delete'}</button>` : `<button type="button" class="danger" onclick="deleteManagedAccountFromList(${index},this)">Delete account</button>`}
        </div></details>` : '&mdash;'}</td></tr>`;

  }).join('') || '<tr><td colspan="6" class="text-center text-muted py-4">No registered users yet.</td></tr>';
  if (status) status.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  usersLoading = false;
}
function startUsersAutoRefresh() {
  if (usersRefreshStarted) return;
  usersRefreshStarted = true;
  const refresh = () => {
    if (document.visibilityState === 'visible') buildUsersTable({ quiet: true });
  };
  window.setInterval(refresh, 15000);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
}
function openAccountExtension(index) {
  if (currentUser?.role !== 'admin') return;
  const user = managedUsers[index];
  if (!user || !canExtendAccount(accountMetadata(user))) return;
  extensionEmail = user.email;
  document.getElementById('extension-user').textContent = user.name + ' · ' + user.email;
  const base = Math.max(Date.now(), Date.parse(accountExpiry(user)) || 0);
  document.getElementById('extension-date').value = addAccountYears(base, 1).slice(0, 10);
  document.getElementById('extension-confirm').checked = false;
  document.getElementById('extension-error').textContent = user.graduated
    ? 'This student is already marked as graduated and cannot receive an extension.' : '';
  openModal('account-extension-modal');
}
async function saveAccountExtension() {
  if (currentUser?.role !== 'admin' || !extensionEmail) return;
  const error = document.getElementById('extension-error');
  const selected = managedUsers.find(item => item.email === extensionEmail);
  const stored = savedUserValidity()[extensionEmail.toLowerCase()];
  if (!selected || (!stored && !USERS_DATA.some(item => item.email.toLowerCase() === extensionEmail.toLowerCase()))) {
    error.textContent = 'This account no longer exists. Refresh the user list.'; return;
  }
  const user = accountMetadata(selected);
  if (user.graduated || user.role !== 'student') { error.textContent = 'Only students who have not graduated can receive an extension.'; return; }
  if (!document.getElementById('extension-confirm').checked) { error.textContent = 'Confirm the in-person request and student eligibility.'; return; }
  const date = document.getElementById('extension-date').value;
  const expiresAt = Date.parse(date + 'T23:59:59+08:00');
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.max(Date.now(), Date.parse(accountExpiry(user)) || 0)) {
    error.textContent = 'Choose a date after today and the current expiry date.'; return;
  }
  const extension = { requestedInPerson: true, notGraduatedConfirmed: true, previousExpiry: accountExpiry(user),
    expiresAt: new Date(expiresAt).toISOString(), approvedAt: new Date().toISOString(), approvedBy: currentUser.email };
  try { await saveUserMetadata({ ...user, expiresAt: extension.expiresAt, extensions: [...(user.extensions || []), extension] }); }
  catch (failure) { error.textContent = failure.message; return; }
  recordActivity('extended account', currentUser.name, user.email);
  closeModal('account-extension-modal');
  extensionEmail = null;
  buildUsersTable();
  showToast('Account validity extended', 'success');
}
async function deleteManagedAccountFromList(index, actionButton) {
  if (currentUser?.role !== 'admin') return;
  if (!managedUsers[index]) return;
  const user = accountMetadata(managedUsers[index]);
  if (!['student', 'faculty'].includes(user.role)) return;
  const label = user.role === 'student' ? 'student' : 'Faculty';
  const confirmation = user.role === 'student' && !user.graduated
    ? 'Mark ' + user.name + ' as graduated and permanently delete their account?'
    : 'Permanently delete the ' + label + ' account of ' + user.name + '?';
  if (!window.confirm(confirmation + ' Their uploaded theses and files will remain in the repository.')) return;
  const originalLabel = actionButton.textContent;
  actionButton.disabled = true;
  actionButton.textContent = 'Deleting...';
  actionButton.closest('details').open = false;
  try { await deleteManagedAccount(user); }
  catch (_) {
    actionButton.disabled = false;
    actionButton.textContent = originalLabel;
    showToast(`Could not delete the ${label} account. Please try again.`, 'danger');
    return;
  }
  recordActivity(`deleted ${label.toLowerCase()} account`, currentUser.name, 'Uploaded theses retained');
  buildUsersTable();
  showToast(`${label} account deleted. Uploaded theses and files retained.`, 'success');
}
const facultyFields = ['faculty-name', 'faculty-email', 'faculty-password'];
function setFacultyFieldError(id, message) {
  const field = document.getElementById(id);
  const error = document.getElementById(id + '-error');
  if (error) error.textContent = message;
  if (field) field.setAttribute('aria-invalid', String(Boolean(message)));
}
function clearFacultyErrors() {
  facultyFields.forEach(id => setFacultyFieldError(id, ''));
  document.getElementById('faculty-create-error').textContent = '';
}
function openCreateFaculty() {
  if (currentUser?.role !== 'admin') return;
  facultyFields.forEach(id => document.getElementById(id).value = '');
  clearFacultyErrors();
  document.getElementById('faculty-password').type = 'password';
  document.getElementById('faculty-password-toggle').textContent = 'Show';
  document.getElementById('faculty-password-toggle').setAttribute('aria-pressed', 'false');
  openModal('create-faculty-modal');
}
async function createFacultyAccount(event) {
  event.preventDefault();
  if (currentUser?.role !== 'admin') return;
  const error = document.getElementById('faculty-create-error');
  const name = document.getElementById('faculty-name').value.trim();
  const email = document.getElementById('faculty-email').value.trim().toLowerCase();
  const password = document.getElementById('faculty-password').value;
  clearFacultyErrors();
  setFacultyFieldError('faculty-name', name ? '' : 'Full name is required.');
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  setFacultyFieldError('faculty-email', !email ? 'Email address is required.' : !validEmail ? 'Enter a valid email address.' : '');
  setFacultyFieldError('faculty-password', !password ? 'Temporary password is required.' : password.length < 8 || password.length > 20 ? 'Use 8–20 characters.' : '');
  const invalid = facultyFields.find(id => document.getElementById(id).getAttribute('aria-invalid') === 'true');
  if (invalid) { document.getElementById(invalid).focus(); return; }
  const exists = () => savedUserValidity()[email] || [...ACCOUNTS, ...USERS_DATA].some(user => user.email.toLowerCase() === email);
  if (exists()) { setFacultyFieldError('faculty-email', 'This email already has an account.'); document.getElementById('faculty-email').focus(); return; }
  const button = document.getElementById('create-faculty-submit');
  if (button.disabled) return;
  button.disabled = true;
  try {
    await authRequest("users", { name, email, password });
    recordActivity('created faculty account', currentUser.name, email);
    document.getElementById('faculty-password').value = '';
    closeModal('create-faculty-modal');
    buildUsersTable();
    showToast('Faculty account created. Share the temporary sign-in details securely.', 'success');
  } catch (_) { error.textContent = 'The account could not be saved. Please try again.'; }
  finally { button.disabled = false; }
}

facultyFields.forEach(id => document.getElementById(id)?.addEventListener('input', () => setFacultyFieldError(id, '')));

function positionUserActions(menu) {
  if (!menu.open) return;
  document.querySelectorAll('.user-actions-menu[open]').forEach(other => { if (other !== menu) other.open = false; });
  const box = menu.querySelector('summary').getBoundingClientRect();
  const popover = menu.querySelector('.user-actions-popover');
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  popover.style.left = Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8)) + 'px';
  popover.style.top = Math.max(8, box.bottom + height + 8 > window.innerHeight ? box.top - height - 4 : box.bottom + 4) + 'px';
}
function closeUserActions() {
  document.querySelectorAll('.user-actions-menu[open]').forEach(menu => { menu.open = false; });
}
document.addEventListener('click', event => { if (!event.target.closest('.user-actions-menu')) closeUserActions(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeUserActions(); });
window.addEventListener('resize', closeUserActions);
document.addEventListener('scroll', closeUserActions, true);

function toggleFacultyPassword() {
  const input = document.getElementById('faculty-password');
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  const button = document.getElementById('faculty-password-toggle');
  button.textContent = visible ? 'Hide' : 'Show';
  button.setAttribute('aria-pressed', String(visible));
}

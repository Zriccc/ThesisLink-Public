"use strict";

const accountFieldIds = ['current-password', 'new-password', 'confirm-password'];
const ACCOUNT_LOAD_TIMEOUT_MS = 12000;

function accountFieldError(id, message = '') {
  const input = document.getElementById(id), error = document.getElementById(id + '-error');
  if (!input || !error) return;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  error.textContent = message;
}
function clearAccountErrors(ids = accountFieldIds) { ids.forEach(id => accountFieldError(id)); }
function focusAccountError(ids) { ids.map(id => document.getElementById(id)).find(field => field?.getAttribute('aria-invalid') === 'true')?.focus(); }
function showAccountAlert(message, type = 'error') {
  const alert = document.getElementById('account-alert');
  alert.textContent = message;
  alert.className = 'account-alert ' + type;
  alert.hidden = false;
}
function setAccountLoading(button, loading, label) { setAuthButtonLoading(button, loading, label); }
function accountPasswordRules(password) {
  return Security.passwordRequirements(password);
}
function updateAccountPasswordRules() {
  const password = document.getElementById('new-password')?.value || '';
  const rules = accountPasswordRules(password);
  document.querySelectorAll('[data-password-rule]').forEach(item => {
    const met = rules[item.dataset.passwordRule] === true;
    item.classList.toggle('met', met);
    item.setAttribute('aria-label', `${met ? 'Met' : 'Not met'}: ${item.textContent}`);
  });
  return Object.values(rules).every(Boolean);
}

function finishAccountLoading() {
  const skeleton = document.querySelector('.account-profile-skeleton');
  if (skeleton) skeleton.hidden = true;
  document.getElementById('account-profile')?.removeAttribute('aria-busy');
  if (typeof finishShellSkeletons === 'function') finishShellSkeletons();
  if (typeof finishTopbarSkeletons === 'function') finishTopbarSkeletons();
}

function accountSessionRequest(timeoutMs = ACCOUNT_LOAD_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Account details are taking longer than expected.')), timeoutMs);
  });
  return Promise.race([authRequest('session'), timeout]).finally(() => clearTimeout(timer));
}

function configureAccountNavigation(role) {
  document.querySelectorAll('[data-account-roles]').forEach(item => {
    const roles = item.dataset.accountRoles.split(/\s+/);
    if (!roles.includes(role)) item.remove();
  });
}

async function initAccountPage() {
  try {
    const result = await accountSessionRequest();
    const user = result.user;
    if (!user) {
      finishAccountLoading();
      return window.location.replace('/pages/auth/index.html');
    }
    currentUser = user;
    configureAccountNavigation(user.role);
    initShell();
    document.getElementById('account-name').textContent = user.name;
    document.getElementById('account-email').textContent = user.email;
    document.getElementById('account-role').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    finishAccountLoading();
    document.querySelector('.account-profile-content').hidden = false;

    const passwordPanel = document.getElementById('password-panel');
    passwordPanel.hidden = false;
    accountFieldIds.forEach(id => document.getElementById(id)?.addEventListener('input', () => accountFieldError(id)));
    document.getElementById('new-password')?.addEventListener('input', updateAccountPasswordRules);
    updateAccountPasswordRules();
  } catch (_) {
    finishAccountLoading();
    showAccountAlert('Account details could not be loaded. Refresh the page and try again.');
  }
}

async function submitPasswordChange(event) {
  event.preventDefault();
  const currentPassword = document.getElementById('current-password').value;
  const password = document.getElementById('new-password').value;
  const confirmation = document.getElementById('confirm-password').value;
  const ids = ['current-password', 'new-password', 'confirm-password'];
  clearAccountErrors(ids);
  const strongPassword = updateAccountPasswordRules();
  accountFieldError('current-password', currentPassword ? '' : 'Current password is required.');
  accountFieldError('new-password', !password ? 'New password is required.' : !strongPassword ? 'Add an uppercase letter, number, and symbol.' : '');
  accountFieldError('confirm-password', !confirmation ? 'Confirm your new password.' : confirmation !== password ? 'Passwords do not match.' : '');
  if (!currentPassword || !strongPassword || confirmation !== password) return focusAccountError(ids);
  const button = document.getElementById('password-submit');
  if (button.disabled) return;
  setAccountLoading(button, true, 'Updating password…');
  try {
    const result = await authRequest('change-password', { currentPassword, password });
    try { sessionStorage.setItem('tl_account_message', result.message); } catch (_) { /* optional */ }
    window.location.href = '/pages/auth/index.html?password=changed';
  } catch (error) {
    if (/current password is incorrect/i.test(error.message)) {
      accountFieldError('current-password', error.message);
      document.getElementById('current-password').focus();
    } else showAccountAlert(error.message);
  }
  finally { setAccountLoading(button, false); }
}

async function requestAccountPasswordReset() {
  const button = document.getElementById('account-reset-password');
  const status = document.getElementById('account-reset-status');
  if (!button || button.disabled || !currentUser?.email) return;
  status.hidden = true;
  setAccountLoading(button, true, 'Sending reset email…');
  try {
    const result = await authRequest('recover', { email: currentUser.email });
    status.textContent = result.message;
    status.hidden = false;
  } catch (error) {
    showAccountAlert(error.message);
  } finally {
    setAccountLoading(button, false);
  }
}

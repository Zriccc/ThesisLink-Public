(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Security = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const courses = ['BSCS', 'BSIT', 'BSDSA'];
  const limits = { name: 120, email: 254, password: 20, title: 500, authors: 1000, adviser: 120, keywords: 1000, abstract: 20000, search: 240, filename: 255 };
  function invalid(message, field) { const error = new Error(message); error.status = 400; if (field) error.field = field; throw error; }
  function object(value, label = 'Request') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(label + ' must be an object.');
    return value;
  }
  function text(value, label, max, required = false, multiline = false) {
    if (typeof value !== 'string') invalid(label + ' must be text.');
    // Canonicalize ordinary text, preserving punctuation and non-English names.
    if (value.length > max) invalid(label + ' must be at most ' + max + ' characters.');
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/i.test(value) || (!multiline && /[\r\n\t]/.test(value))) invalid(label + ' contains unsupported control or invisible characters.');
    let result = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
    if (multiline) {
      result = result.replace(/\u00a0/g, ' ')
        .split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n')
        .replace(/\n{3,}/g, '\n\n').trim();
    }
    if (result.length > max || (required && !result)) invalid('Enter a valid ' + label.toLowerCase() + '.');
    return result;
  }
  function email(value, label = 'Email') {
    const result = text(value, label, limits.email, true).toLowerCase();
    const parts = result.split('@');
    if (parts.length !== 2 || parts[0].length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(parts[0]) || parts[0].startsWith('.') || parts[0].endsWith('.') || parts[0].includes('..') || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(parts[1])) invalid('Enter a valid ' + label.toLowerCase() + '.');
    return result;
  }
  function institutionalEmail(value, label = 'ISU email') {
    const result = email(value, label);
    if (!result.endsWith('@isu.edu.ph')) invalid('Use your @isu.edu.ph email address.');
    return result;
  }
  function password(value, min = 8) {
    if (typeof value !== 'string' || value.length < min || value.length > limits.password || value.includes('\0')) invalid('Password must contain ' + min + ' to ' + limits.password + ' characters.');
    return value; // Never trim, normalize, escape, or otherwise mutate a password.
  }
  function passwordRequirements(value) {
    const passwordValue = typeof value === 'string' ? value : '';
    return {
      length: passwordValue.length >= 8 && passwordValue.length <= limits.password,
      uppercase: /[A-Z]/.test(passwordValue),
      number: /\d/.test(passwordValue),
      symbol: /[^A-Za-z0-9\s]/.test(passwordValue)
    };
  }
  function choice(value, allowed, label) { if (!allowed.includes(value)) invalid('Choose a valid ' + label + '.'); return value; }
  function year(value, field) {
    const latest = new Date().getFullYear();
    if (!['string', 'number'].includes(typeof value) || !/^\d{4}$/.test(String(value)) || Number(value) < 2010 || Number(value) > latest) invalid(`Year must be between 2010 and ${latest}.`, field);
    return Number(value);
  }
  function uuid(value) {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) invalid('Invalid account identifier.');
    return value;
  }
  function timestamp(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) invalid('Enter a valid expiry date.');
    return value;
  }
  function authPayload(action, body) {
    object(body);
    const output = {};
    if (action === 'session/activity') output.activityAt = timestamp(body.activityAt);
    if (action === 'google') {
      output.credential = text(body.credential, 'Google credential', 8192, true);
      output.nonce = text(body.nonce, 'Google security nonce', 128, true);
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(output.nonce)) invalid('Google sign-in security verification failed. Please try again.');
    }
    if (['login', 'recover', 'users'].includes(action)) output.email = email(body.email);
    if (action === 'register') output.email = institutionalEmail(body.email);
    if (action === 'change-password') {
      output.currentPassword = password(body.currentPassword, 1);
      output.password = password(body.password, 8);
    }
    if (['login', 'register', 'password', 'users'].includes(action)) output.password = password(body.password, 8);
    if (['register', 'users'].includes(action)) output.name = text(body.name, 'Name', limits.name, true);
    if (action === 'register') {
      if (body.acceptedTerms !== true) invalid('Read and accept the Terms and Privacy Policy before registering.');
      output.acceptedTerms = true;
    }
    if (action === 'users') {
      output.role = 'faculty';
    }
    if (/^users\/[^/]+\/extend$/.test(action)) {
      object(body.extension, 'Extension');
      output.expiresAt = timestamp(body.expiresAt);
      if (body.extension.requestedInPerson !== true || body.extension.notGraduatedConfirmed !== true) invalid('Confirm the in-person request and student eligibility.');
      output.extension = { requestedInPerson: true, notGraduatedConfirmed: true };
    }
    // Only recognized properties are returned; supplied roles/approval identity are ignored.
    return output;
  }
  function thesis(value) {
    object(value, 'Thesis');
    const fieldValue = (field, read) => { try { return read(); } catch (error) { error.field ||= field; throw error; } };
    const title = fieldValue('title', () => text(value.title, 'Title', limits.title, true));
    const authors = fieldValue('authors', () => text(value.authors, 'Authors', limits.authors, true));
    const adviser = fieldValue('adviser', () => text(value.adviser, 'Adviser', limits.adviser, true));
    const rawKeywords = fieldValue('keywords', () => text(value.keywords, 'Keywords', limits.keywords, true));
    const abstract = fieldValue('abstract', () => text(value.abstract, 'Abstract', limits.abstract, true, true));
    const namePattern = /^[\p{L}\p{M} .,'’\-;]+$/u;
    if (title.length < 5 || !/[\p{L}\p{N}].*[\p{L}\p{N}]/u.test(title) || /[@#$%^*_=~{}[\]\\|!]{3,}/u.test(title)) invalid('Enter a clear title using words and ordinary punctuation.', 'title');
    if (!namePattern.test(authors) || authors.split(';').some(name => !name.trim())) invalid('Enter author names using letters; separate multiple authors with semicolons.', 'authors');
    if (!namePattern.test(adviser)) invalid('Enter the adviser name using letters and ordinary name punctuation.', 'adviser');
    const keywordList = rawKeywords.split(/[,;]/).map(item => item.trim());
    if (keywordList.length > 5 || keywordList.some(item => !item || item.length > 80 || !/[\p{L}\p{N}]/u.test(item) || !/^[\p{L}\p{M}\p{N}\s+#&/().:'’_%\-]+$/u.test(item))) invalid('Enter up to 5 keywords separated by commas.', 'keywords');
    const keywords = keywordList.join(', ');
    const abstractWords = abstract.match(/[\p{L}\p{N}]+/gu) || [];
    if (abstract.length < 30 || abstractWords.length < 5) invalid('Abstract must contain at least 5 words and 30 characters.', 'abstract');
    return { title, authors, adviser, course: fieldValue('course', () => choice(value.course, courses, 'program')), year: year(value.year, 'year'), keywords, abstract };
  }
  function readThesisForm(prefix) {
    const fields = { title: 'title', authors: 'auth', adviser: 'adv', course: 'course', year: 'year', keywords: 'kw', abstract: 'abs' };
    return thesis(Object.fromEntries(Object.entries(fields).map(([key, suffix]) => [key, document.getElementById(prefix + '-' + suffix).value])));
  }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function jsArg(value) { return escapeHTML(JSON.stringify(String(value ?? ''))); }
  function search(value) { return String(value ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limits.search); }
  function documentHTML(value) {
    if (typeof DOMPurify === 'undefined') return escapeHTML(value);
    return DOMPurify.sanitize(value, { USE_PROFILES: { html: true }, FORBID_TAGS: ['form', 'input', 'button', 'textarea', 'select', 'style'], FORBID_ATTR: ['style'], SANITIZE_NAMED_PROPS: true });
  }
  const mimeByExt = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  function fileHeader(bytes, ext) {
    const ascii = String.fromCharCode(...bytes.slice(0, 12));
    if (ext === '.pdf') return ascii.startsWith('%PDF-');
    if (ext === '.png') return [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
    if (['.jpg', '.jpeg'].includes(ext)) return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (ext === '.webp') return ascii.startsWith('RIFF') && ascii.slice(8) === 'WEBP';
    if (ext === '.docx') return bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4;
    return false;
  }
  async function uploadFile(file, kind) {
    const name = text(file.name, 'Filename', limits.filename, true);
    if (/[\\/]/.test(name)) invalid('Filename cannot contain path separators.');
    const ext = '.' + name.split('.').pop().toLowerCase();
    const allowed = kind === 'approval' ? ['.png', '.jpg', '.jpeg', '.webp'] : ['.pdf'];
    if (!allowed.includes(ext)) invalid(kind === 'approval' ? 'Choose a JPG, PNG, or WEBP approval image.' : 'Choose a PDF thesis file.');
    const max = kind === 'approval' ? 10485760 : 52428800;
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > max) invalid('File must be nonempty and no larger than ' + max / 1048576 + ' MB.');
    if (file.type && file.type !== mimeByExt[ext]) invalid('File content type does not match its extension.');
    if (!fileHeader(new Uint8Array(await file.slice(0, 12).arrayBuffer()), ext)) invalid('File contents do not match the selected file type.');
    return { name, ext, type: mimeByExt[ext] };
  }
  function safeFileURL(value, kind = 'full') {
    if (typeof value !== 'string') return '';
    const comma = value.indexOf(',');
    if (comma < 0 || comma > 120 || value.length > (kind === 'approval' ? 14000000 : 70000000)) return '';
    const header = value.slice(0, comma);
    const ext = Object.keys(mimeByExt).find(ext => header === 'data:' + mimeByExt[ext] + ';base64');
    if (!ext || (kind === 'approval' ? !['.png', '.jpg', '.jpeg', '.webp'].includes(ext) : !['.pdf', '.docx'].includes(ext))) return '';
    const body = value.slice(comma + 1);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body) || body.length % 4) return '';
    try {
      const bytes = Uint8Array.from(atob(body.slice(0, 16)), c => c.charCodeAt(0));
      return fileHeader(bytes, ext) ? value : '';
    } catch (_) { return ''; }
  }
  function installFieldLimits() {
    function apply(root) {
      root.querySelectorAll('input,textarea').forEach(field => {
        if (['file', 'checkbox', 'radio', 'number', 'date', 'hidden'].includes(field.type)) return;
        const id = field.id;
        let max = field.type === 'password' ? limits.password : field.type === 'email' ? limits.email : limits.search;
        if (/^(up|edit)-/.test(id)) max = ({ title: limits.title, auth: limits.authors, adv: limits.adviser, kw: limits.keywords, abs: limits.abstract })[id.split('-')[1]] || max;
        if (/^(up|edit)-year$/.test(id)) { field.min = '2010'; field.max = String(new Date().getFullYear()); }
        if (['r-name', 'faculty-name'].includes(id)) max = limits.name;
        field.maxLength = max;
        if (field.type === 'password') field.minLength = 8;
        if (['up-abs', 'edit-abs'].includes(id) && !field.dataset.abstractNormalizer) {
          field.dataset.abstractNormalizer = 'true';
          field.addEventListener('blur', () => { field.value = text(field.value, 'Abstract', limits.abstract, false, true); });
        }
      });
    }
    apply(document);
    new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) { if (node.matches('input,textarea')) apply(node.parentNode); else apply(node); } }).observe(document.body, { childList: true, subtree: true });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installFieldLimits);
    else installFieldLimits();
  }
  return { limits, courses, object, text, email, institutionalEmail, password, passwordRequirements, choice, year, uuid, timestamp, authPayload, thesis, readThesisForm, escapeHTML, jsArg, search, documentHTML, uploadFile, safeFileURL, fileHeader };
});

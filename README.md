# ThesisLink Public

ThesisLink is a web-based research repository for the College of Computing Studies, Information and Communication Technology. This repository contains the school-hosted PHP/MySQL implementation and its Guest, Student, Faculty, and Administrator workspaces.

## Included features

- Public browsing, search, filtering, QR scanning, and controlled thesis viewing
- Institutional email/password and Google sign-in
- Student submissions, duplicate warnings, review remarks, notifications, correction, and resubmission
- Faculty advisee reports, abstract reports, and approval-sheet reports
- Administrator account, repository, review, reporting, and audit-log tools
- Cloudflare R2 file storage, SMTP email delivery, and MySQL persistence
- One-time `/setup` installer and command-line maintenance utilities

## Requirements

- PHP 8.2 or later
- MySQL or MariaDB with InnoDB
- PHP extensions: `pdo_mysql`, `intl`, `mbstring`, `openssl`, `gd`, `curl`, and `zip`
- Apache rewrite support and HTTPS for production
- Composer on the development computer
- Cloudflare R2, SMTP, and Google OAuth credentials for live integrations

## Source installation

Install the PHP dependencies without committing them:

```bash
composer install --no-dev --prefer-dist
```

Create a deployable archive:

```bash
php scripts/package.php
```

The archive is written to `dist/`. It contains the PHP dependencies, compiled frontend, database schema, and a unique `INSTALL-CODE.txt`. Keep that code private.

## Server installation

1. Create an empty MySQL or MariaDB database and an application database user.
2. Extract the generated deployment ZIP outside the public web directory.
3. Point the domain document root to the extracted `public/` directory.
4. Open `https://YOUR-DOMAIN/setup`.
5. Enter the installation code, exact HTTPS application URL, database details, R2 credentials, SMTP settings, Google Client ID, and first Administrator account.
6. Complete installation and confirm that `/setup` is locked afterward.

Only `public/` should be web-accessible. Keep `config/`, `resources/`, `scripts/`, `src/`, `vendor/`, exports, and runtime storage outside the document root.

## Administrator accounts

The first verified Administrator is created by `/setup`. To add another Administrator later, run this command from the application directory:

```bash
php scripts/admin.php
```

The command refuses to overwrite or promote an existing account.

## Testing

The integration suite uses an isolated MariaDB instance, local PHP server, mock object storage, and development mailbox. It does not use live credentials.

```powershell
$env:PHP_BIN = 'C:\path\to\php.exe'
$env:MARIADB_HOME = 'C:\path\to\mysql'
node tests/integration.js
```

See [MIGRATION.md](MIGRATION.md) for data migration and production cutover guidance.

The optional Supabase export utility requires Node.js and its single package dependency:

```bash
npm install
npm run export:supabase
```

## Secrets and generated data

Do not commit any of the following:

- `config/config.local.php`
- `.env` files
- `INSTALL-CODE.txt` or `config/install-code.php`
- `vendor/`, `.runtime/`, `storage/`, `exports/`, or `dist/`
- Database exports, API keys, passwords, tokens, or production logs

The provided `.gitignore` excludes these paths. Production credentials must be entered through the one-time setup page and stored only on the server.

## License

Copyright (c) 2026 Jheric Raton Mayubay.

ThesisLink is available under the [MIT License](LICENSE). Third-party components remain subject to their respective licenses. The ThesisLink name, institutional marks, and logos are not granted for independent branding use by the MIT License.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function firstFile(candidates) {
  return candidates.find(candidate => candidate && fs.existsSync(candidate));
}

export function findPhp(environment, root) {
  const selected = firstFile([
    environment.PHP_BIN,
    path.join(root, '.runtime', 'php', 'php.exe'),
    'C:\\xampp\\php\\php.exe',
  ]);
  if (!selected) {
    throw new Error('PHP 8.2+ was not found. Install XAMPP or set PHP_BIN to php.exe.');
  }
  return selected;
}

export function findMariaDb(environment, root) {
  const homes = [
    environment.MARIADB_HOME,
    path.join(root, '.runtime', 'mariadb-10.11.13-winx64'),
    'C:\\xampp\\mysql',
  ].filter(Boolean);
  for (const home of homes) {
    const bin = path.join(home, 'bin');
    const initialize = firstFile([
      path.join(bin, 'mariadb-install-db.exe'),
      path.join(bin, 'mysql_install_db.exe'),
      path.join(bin, 'mariadb-install-db'),
      path.join(bin, 'mysql_install_db'),
    ]);
    const server = firstFile([
      path.join(bin, 'mariadbd.exe'),
      path.join(bin, 'mysqld.exe'),
      path.join(bin, 'mariadbd'),
      path.join(bin, 'mysqld'),
    ]);
    if (initialize && server) return { home, initialize, server };
  }
  throw new Error('MariaDB was not found. Install XAMPP or set MARIADB_HOME to its mysql directory.');
}

export function createTestDirectory(root) {
  const runtime = path.join(root, '.runtime');
  fs.mkdirSync(runtime, { recursive: true });
  return fs.mkdtempSync(path.join(runtime, `integration-${os.hostname()}-`));
}

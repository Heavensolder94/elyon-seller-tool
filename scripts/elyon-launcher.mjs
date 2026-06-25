import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const isWindows = process.platform === 'win32';

function run(command, args = []) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: root, shell: isWindows, stdio: 'inherit' });
    child.on('close', (code) => resolve(code));
    child.on('error', () => resolve(1));
  });
}

function openBrowser(url) {
  const command = isWindows ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = isWindows ? ['/c', 'start', '', url] : [url];
  execFile(command, args, { cwd: root }, () => {});
}

console.log('=====================================');
console.log('       🚀 ELYON LAUNCHER V1');
console.log('=====================================');

if (!existsSync(join(root, 'package.json'))) {
  console.error('FEHLER: package.json nicht gefunden.');
  process.exit(1);
}

if (!existsSync(join(root, '.env.local')) && !existsSync(join(root, '.env'))) {
  console.warn('WARNUNG: .env.local fehlt. API-Funktionen laufen erst mit deinen neuen Keys.');
}

console.log('\n[1/4] GitHub synchronisieren...');
await run('git', ['pull']);

console.log('\n[2/4] Pakete prüfen/installieren...');
const installCode = await run('npm', ['install']);
if (installCode !== 0) process.exit(installCode);

console.log('\n[3/4] Browser öffnen...');
openBrowser('http://127.0.0.1:4173');

console.log('\n[4/4] Elyon Seller Tool starten...');
console.log('Zum Stoppen: STRG + C');
await run('npm', ['run', 'dev']);

const $ = (id) => document.getElementById(id);
const consoleBox = $('console');

function write(text) {
  consoleBox.textContent += text;
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

function setDot(id, state) {
  const el = $(id);
  el.className = `dot ${state}`;
}

async function refreshStatus() {
  const status = await window.elyon.status();
  $('rootPath').textContent = status.root;

  setDot('projectDot', status.packageJson ? 'ok' : 'bad');
  $('projectText').textContent = status.packageJson ? 'OK' : 'Fehlt';

  const hasEnv = status.envLocal || status.env;
  setDot('envDot', hasEnv ? 'ok' : 'warn');
  $('envText').textContent = hasEnv ? (status.envLocal ? '.env.local' : '.env') : 'fehlt';

  setDot('modulesDot', status.nodeModules ? 'ok' : 'warn');
  $('modulesText').textContent = status.nodeModules ? 'installiert' : 'noch nicht installiert';
}

window.elyon.onLog(write);
window.elyon.onServerStopped(() => write('\nServer gestoppt.\n'));

$('refreshBtn').addEventListener('click', refreshStatus);
$('syncBtn').addEventListener('click', async () => { await window.elyon.gitPull(); await refreshStatus(); });
$('installBtn').addEventListener('click', async () => { await window.elyon.npmInstall(); await refreshStatus(); });
$('startBtn').addEventListener('click', async () => { await window.elyon.gitPull(); await window.elyon.npmInstall(); await window.elyon.startDev(); await refreshStatus(); });
$('browserBtn').addEventListener('click', () => window.elyon.openBrowser());
$('folderBtn').addEventListener('click', () => window.elyon.openFolder());
$('stopBtn').addEventListener('click', () => window.elyon.stopDev());
$('clearBtn').addEventListener('click', () => { consoleBox.textContent = ''; });

refreshStatus();

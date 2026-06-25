const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
let mainWindow;
let devProcess;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 860,
    minHeight: 620,
    backgroundColor: '#07110d',
    title: 'Elyon Launcher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));
}

function run(command, args = [], label = command) {
  return new Promise((resolve) => {
    send('log', `\n▶ ${label}\n`);
    const child = spawn(command, args, { cwd: root, shell: process.platform === 'win32' });
    child.stdout.on('data', (data) => send('log', data.toString()));
    child.stderr.on('data', (data) => send('log', data.toString()));
    child.on('close', (code) => {
      send('log', `\n${label} beendet mit Code ${code}\n`);
      resolve(code);
    });
    child.on('error', (error) => {
      send('log', `\nFEHLER: ${error.message}\n`);
      resolve(1);
    });
  });
}

function getStatus() {
  return {
    packageJson: fs.existsSync(path.join(root, 'package.json')),
    envLocal: fs.existsSync(path.join(root, '.env.local')),
    env: fs.existsSync(path.join(root, '.env')),
    nodeModules: fs.existsSync(path.join(root, 'node_modules')),
    root,
  };
}

ipcMain.handle('status', async () => getStatus());
ipcMain.handle('open-folder', async () => shell.openPath(root));
ipcMain.handle('open-browser', async () => shell.openExternal('http://127.0.0.1:4173'));
ipcMain.handle('git-pull', async () => run('git', ['pull'], 'GitHub Sync'));
ipcMain.handle('npm-install', async () => run('npm', ['install'], 'Pakete installieren'));

ipcMain.handle('start-dev', async () => {
  if (devProcess) {
    send('log', '\nElyon läuft bereits.\n');
    await shell.openExternal('http://127.0.0.1:4173');
    return 0;
  }
  send('log', '\n▶ Elyon Seller Tool starten\n');
  devProcess = spawn('npm', ['run', 'dev'], { cwd: root, shell: process.platform === 'win32' });
  devProcess.stdout.on('data', (data) => send('log', data.toString()));
  devProcess.stderr.on('data', (data) => send('log', data.toString()));
  devProcess.on('close', (code) => {
    send('log', `\nElyon Server beendet mit Code ${code}\n`);
    devProcess = null;
    send('server-stopped');
  });
  setTimeout(() => shell.openExternal('http://127.0.0.1:4173'), 1200);
  return 0;
});

ipcMain.handle('stop-dev', async () => {
  if (devProcess) {
    devProcess.kill();
    devProcess = null;
    send('log', '\nServer wurde gestoppt.\n');
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (devProcess) devProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

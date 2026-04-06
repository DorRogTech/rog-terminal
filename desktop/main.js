const { app, BrowserWindow, Tray, Menu, shell, nativeTheme } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let tray;
let backendProcess;

const isDev = !app.isPackaged;
const BACKEND_PORT = 3001;
const FRONTEND_DEV_URL = 'http://localhost:5173';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    title: 'Rog Terminal',
    icon: path.join(__dirname, '..', 'frontend', 'public', 'icons', 'icon-512.svg'),
    backgroundColor: '#0a0e17',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Dark theme
  nativeTheme.themeSource = 'dark';

  if (isDev) {
    mainWindow.loadURL(FRONTEND_DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Load from built frontend
    const frontendPath = path.join(process.resourcesPath, 'frontend', 'index.html');
    mainWindow.loadFile(frontendPath);
  }

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    // Minimize to tray instead of closing
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Use a simple tray icon
  tray = new Tray(path.join(__dirname, '..', 'frontend', 'public', 'icons', 'icon-72.svg'));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Rog Terminal', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip('Rog Terminal');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

function startBackend() {
  if (!isDev) return; // In production, backend runs separately

  const backendPath = path.join(__dirname, '..', 'backend', 'src', 'server.js');
  backendProcess = spawn('node', [backendPath], {
    env: { ...process.env, PORT: BACKEND_PORT.toString() },
    stdio: 'pipe',
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[backend] ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[backend] ${data}`);
  });

  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});

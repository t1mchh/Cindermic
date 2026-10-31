const { app, BrowserWindow, session } = require('electron');
const path = require('node:path');
const { createBackend } = require('../server/backend.cjs');

let window;
let backend;
let closing = false;

async function existingBackend() {
  try {
    const response = await fetch('http://127.0.0.1:43130/api/health', {
      signal: AbortSignal.timeout(1000),
    });
    if ((await response.json()).app === 'cindermic') return 'http://127.0.0.1:43130';
  } catch {}
}

if (!app.requestSingleInstanceLock()) app.quit();
else
  app
    .whenReady()
    .then(async () => {
      let url = await existingBackend();
      if (!url) {
        const storageDirectory = app.isPackaged
          ? path.join(app.getPath('userData'), 'backend')
          : path.join(app.getAppPath(), '.local');
        backend = await createBackend({ storageDirectory });
        url = backend.url;
      }
      const origin = new URL(url).origin;
      session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
        callback(
          contents.getURL().startsWith(`${origin}/`) &&
            ['media', 'speaker-selection'].includes(permission),
        );
      });
      session.defaultSession.setPermissionCheckHandler(
        (contents, permission) =>
          !!contents?.getURL().startsWith(`${origin}/`) &&
          ['media', 'speaker-selection'].includes(permission),
      );
      window = new BrowserWindow({
        width: 1240,
        height: 900,
        minWidth: 830,
        minHeight: 720,
        title: 'Cindermic',
        backgroundColor: '#101114',
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, target) => {
        if (new URL(target).origin !== origin) event.preventDefault();
      });
      await window.loadURL(url);
    })
    .catch((error) => {
      console.error(error.message);
      app.exit(1);
    });

app.on('second-instance', () => {
  window?.show();
  window?.focus();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  if (!backend || closing) return;
  event.preventDefault();
  closing = true;
  backend.close().finally(() => app.quit());
});

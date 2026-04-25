const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const { startServer, closeActiveCheckout } = require('./server');

let mainWindow = null;
let backend = null;

function isPortAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findBackendPort() {
  const preferredPort = Number(process.env.PORT || 3001);
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error('Could not find an available local port for the freight service.');
}

async function createWindow() {
  const port = await findBackendPort();
  backend = await startServer(port);

  mainWindow = new BrowserWindow({
    width: 1040,
    height: 980,
    minWidth: 900,
    minHeight: 720,
    title: 'Living Culture Freight Costing',
    show: false,
    backgroundColor: '#f3f1e8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--freight-port=${port}`]
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('freight:request', async (_event, request) => {
  const port = backend?.port;
  if (!port) {
    throw new Error('Freight service is not ready yet.');
  }

  const response = await fetch(`http://127.0.0.1:${port}${request.path}`, {
    method: request.method || 'GET',
    headers: {
      'Content-Type': 'application/json'
    },
    body: request.body ? JSON.stringify(request.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Freight service error ${response.status}`);
  }

  return data;
});

app.whenReady().then(() => {
  createWindow().catch(error => {
    dialog.showErrorBox('Freight Costing could not start', error.message);
    app.quit();
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch(error => {
      dialog.showErrorBox('Freight Costing could not start', error.message);
    });
  }
});

app.on('before-quit', () => {
  closeActiveCheckout().catch(() => {});
  backend?.server?.close?.();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

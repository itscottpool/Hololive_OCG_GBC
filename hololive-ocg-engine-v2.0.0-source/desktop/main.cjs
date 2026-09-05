"use strict";

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

let gameWindow = null;
let serverProcess = null;
let quitting = false;

function runtimeRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, "game") : path.resolve(__dirname, "..");
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill();
  serverProcess = null;
}

function startServer() {
  return new Promise((resolve, reject) => {
    const root = runtimeRoot();
    const serverPath = path.join(root, "src", "web-server.ts");
    const child = spawn(process.execPath, ["--experimental-strip-types", serverPath, "--port", "0"], {
      cwd: root,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProcess = child;
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => finish(new Error("The local game engine did not start in time.")), 15_000);

    function finish(error, url) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(url);
    }

    child.stdout.on("data", chunk => {
      output += chunk.toString("utf8");
      const match = output.match(/Hololive OCG battle client: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) finish(null, match[1]);
    });
    child.stderr.on("data", chunk => { output += chunk.toString("utf8"); });
    child.once("error", finish);
    child.once("exit", code => {
      serverProcess = null;
      if (!settled) finish(new Error(`The local game engine stopped during startup (code ${code ?? "unknown"}).\n${output}`));
      else if (!quitting && gameWindow && !gameWindow.isDestroyed()) gameWindow.close();
    });
  });
}

async function createWindow() {
  const url = await startServer();
  const icon = path.join(runtimeRoot(), "assets", "ui", "EndlessNights.ico");
  gameWindow = new BrowserWindow({
    title: "Hololive Original Card Game - Endless Nights",
    width: 960,
    height: 540,
    minWidth: 480,
    minHeight: 270,
    useContentSize: true,
    autoHideMenuBar: true,
    backgroundColor: "#09181c",
    icon,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);
  gameWindow.webContents.setWindowOpenHandler(({ url: requestedUrl }) => {
    if (/^https?:/i.test(requestedUrl)) shell.openExternal(requestedUrl);
    return { action: "deny" };
  });
  gameWindow.webContents.on("will-navigate", (event, requestedUrl) => {
    if (!requestedUrl.startsWith(url)) event.preventDefault();
  });
  gameWindow.once("ready-to-show", () => gameWindow.show());
  gameWindow.once("closed", () => {
    gameWindow = null;
    if (!quitting) app.quit();
  });
  await gameWindow.loadURL(url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!gameWindow) return;
    if (gameWindow.isMinimized()) gameWindow.restore();
    gameWindow.focus();
  });
  app.whenReady().then(createWindow).catch(error => {
    dialog.showErrorBox("Endless Nights could not start", error instanceof Error ? error.message : String(error));
    app.quit();
  });
}

app.on("before-quit", () => {
  quitting = true;
  stopServer();
});
app.on("window-all-closed", () => app.quit());


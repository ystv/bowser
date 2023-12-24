import { app, BrowserWindow } from "electron";
import * as path from "path";
import { createIPCHandler } from "electron-trpc/main";
import { emitObservable, setSender } from "./ipcEventBus";
import { appRouter } from "./ipcApi";
import { tryCreateAPIClient } from "./base/serverApiClient";
import { validateLocalMediaState } from "./base/settings";
import isSquirrel from "electron-squirrel-startup";
import { selectedShow } from "./base/selectedShow";
import Icon from "../icon/png/64x64.png";
import * as Sentry from "@sentry/electron/main";
import { logFlagState } from "@bowser/feature-flags";
import { getLogger } from "./base/logging";
import { OBSIntegration } from "./obs/obs";
import { VMixIntegration } from "./vmix/vmix";
import { OntimeIntegration } from "./ontime/ontime";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (isSquirrel) {
  app.quit();
}

const logger = getLogger("main");

/* eslint-disable no-console */
console.log = logger.debug;
console.info = logger.info;
console.warn = logger.warn;
console.error = logger.error;
/* eslint-enable no-console */

logger.info(
  `Bowser Desktop v${global.__APP_VERSION__} (${global.__GIT_COMMIT__}) starting up.`,
);
logFlagState(true);

if (import.meta.env.VITE_DESKTOP_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_DESKTOP_SENTRY_DSN,
    release: global.__SENTRY_RELEASE__,
  });
  logger.info("[Main] Sentry enabled");
}

// https://www.electronforge.io/config/plugins/vite
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

const createWindow = async () => {
  logger.debug("Pre-flight...");
  await Promise.all([
    validateLocalMediaState(),
    tryCreateAPIClient(),
    OBSIntegration.start(undefined, true),
    process.platform === "win32"
      ? VMixIntegration.start(undefined, true)
      : Promise.resolve(),
    OntimeIntegration.start(undefined, true),
  ]);
  logger.debug("Pre-flight complete, starting app");

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    maxWidth: 1280,
    height: 720,
    icon: Icon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // and load the index.html of the app.
  logger.debug("Loading main window JS...");
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  if (process.env.BOWSER_OPEN_DEVTOOLS === "true") {
    mainWindow.webContents.openDevTools();
  }

  logger.debug("Creating IPC handler...");
  createIPCHandler({ router: appRouter, windows: [mainWindow] });
  setSender(mainWindow.webContents.send.bind(mainWindow.webContents));
  emitObservable("selectedShowChange", selectedShow);
  logger.info("Startup complete.");
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

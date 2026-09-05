/**
 * electron/main.js
 *
 * ToolCEO Electron main process — cross-platform .tceo file association.
 *
 * Platform coverage:
 *  Windows  – HKCU registry via `reg add` (no admin required)
 *  macOS    – app.on('open-file') + electron-builder Info.plist config
 *  Linux    – ~/.local/share/mime + ~/.local/share/applications .desktop file
 *             via xdg-mime / update-mime-database
 *
 * Common to all platforms:
 *  - Single-instance lock (second-instance event relays .tceo path to renderer)
 *  - process.argv scanning at cold-start
 *  - IPC 'vault-file-open' → renderer with { filePath }
 */

'use strict';

const { app, BrowserWindow, ipcMain, dialog, nativeImage, net, Notification } = require('electron');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');
const https     = require('https');
const AdmZip    = require('adm-zip');
const { spawn, execFile, execFileSync } = require('child_process');

// ─── CONSTANTS ─────────────────────────────────────────────────────────────────

const TCEO_EXT          = '.tceo';
const TCEO_MIME         = 'application/x-tceo';
const TCEO_PROG_ID      = 'ToolCEO.VaultFile';
const TCEO_FILE_DESC    = 'ToolCEO Vault File';
const IS_WIN            = process.platform === 'win32';
const IS_MAC            = process.platform === 'darwin';
const IS_LINUX          = process.platform === 'linux';

const RESOURCES_DIR     = path.join(__dirname, '..', 'resources');
const TCEO_FILE_ICON_RELATIVE = path.join('assets', 'icons', 'fileicon.ico');
const TCEO_FILE_ICON_PNG_RELATIVE = path.join('assets', 'icons', 'fileicon.png');
const TCEO_ICON_SOURCE_RELATIVE = path.join('assets', 'fileimage.png');
const APP_ICON_PNG_RELATIVE = path.join('assets', 'icon.png');
const TCEO_ICON_ICO     = path.join(RESOURCES_DIR, 'tceo-file-icon.ico');   // Windows
const TCEO_ICON_PNG     = path.join(RESOURCES_DIR, 'tceo-file-icon.png');   // Linux / macOS

// Linux paths (all in user home — no sudo needed)
const XDG_DATA_HOME     = process.env.XDG_DATA_HOME
                          || path.join(os.homedir(), '.local', 'share');
const LINUX_MIME_DIR    = path.join(XDG_DATA_HOME, 'mime', 'packages');
const LINUX_APPS_DIR    = path.join(XDG_DATA_HOME, 'applications');
const LINUX_MIME_FILE   = path.join(LINUX_MIME_DIR, 'application-x-tceo.xml');
const LINUX_DESKTOP     = path.join(LINUX_APPS_DIR, 'toolceo.desktop');
const LINUX_ICON_DEST   = path.join(XDG_DATA_HOME, 'icons', 'hicolor', '256x256', 'apps', 'toolceo.png');
const LINUX_MIME_ICON_DIR = path.join(XDG_DATA_HOME, 'icons', 'hicolor', '256x256', 'mimetypes');
const LINUX_MIME_ICON_DEST = path.join(LINUX_MIME_ICON_DIR, 'application-x-tceo.png');

// ─── STATE ─────────────────────────────────────────────────────────────────────

let mainWindow     = null;
let splashWindow   = null;
let backendProcess = null;

/** .tceo path queued before the window was ready (cold-start or second-instance). */
let _pendingVaultFile = null;

// ─── SINGLE-INSTANCE LOCK ─────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  // Another instance is already running — it will receive our argv via the
  // second-instance event and handle the file.  Quit this ghost instance.
  app.quit();
  process.exit(0);
}

// ─── EXTRACT .tceo PATH FROM argv ─────────────────────────────────────────────

/**
 * Returns the first .tceo file path found in an argv array, or null.
 * Uses a plain string comparison — never require()s or import()s the path.
 * Skips Electron/Chromium flags (anything starting with '-').
 * @param {string[]} argv
 * @returns {string | null}
 */
function extractTceoPath(argv) {
  return argv.find(
    (arg) => !arg.startsWith('-') && arg.toLowerCase().endsWith(TCEO_EXT)
  ) || null;
}

// Capture any .tceo path present at cold-start, before app is ready.
// In dev mode:      argv = [electron, '.', ...extra-args]
// In packaged mode: argv = [ToolCEO.exe, ...extra-args]
// We skip index 0 (exe) and index 1 (app dir / main script) to avoid
// accidentally treating the app root as a vault file path.
_pendingVaultFile = extractTceoPath(process.argv.slice(2));

// ─── SECOND-INSTANCE: already running, user opened another .tceo ──────────────

app.on('second-instance', (_event, commandLine) => {
  // commandLine[0] = exe, commandLine[1] = app dir (dev) or first real arg (packaged)
  // Search everything from index 1 onward for a .tceo path.
  const tceoPath = commandLine.find(
    (arg) => !arg.startsWith('-') && arg.toLowerCase().endsWith(TCEO_EXT)
  ) || null;

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    if (tceoPath) sendVaultFileOpen(tceoPath);
  } else if (tceoPath) {
    _pendingVaultFile = tceoPath;
  }
});

// ─── macOS: open-file event ────────────────────────────────────────────────────
// On macOS, the OS sends this event (not argv) when a file is double-clicked.
// We must call event.preventDefault() or Electron ignores the event.

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (!filePath.toLowerCase().endsWith(TCEO_EXT)) return;

  if (mainWindow && mainWindow.webContents) {
    sendVaultFileOpen(filePath);
  } else {
    // App might not be fully ready yet (e.g., launched by file open at boot)
    _pendingVaultFile = filePath;
  }
});

// ─── SEND vault-file-open TO RENDERER ─────────────────────────────────────────

/**
 * Sends the vault-file-open IPC to the renderer.
 * Safe to call before the window is ready — queues the path if needed.
 * @param {string} filePath  Absolute path to the .tceo file
 */
function sendVaultFileOpen(filePath) {
  if (!mainWindow || !mainWindow.webContents) {
    _pendingVaultFile = filePath;
    return;
  }
  mainWindow.webContents.send('vault-file-open', { filePath });
  _pendingVaultFile = null;
}

// ─── GENERATE ICONS ───────────────────────────────────────────────────────────

/**
 * Creates vault icons from assets/icon.png using Jimp.
 *   Windows → resources/tceo-file-icon.ico  (PNG-in-ICO container)
 *   Linux   → resources/tceo-file-icon.png  (256×256 PNG)
 * Both paths are generated from the same source image.
 * This is non-blocking / best-effort — failures are logged and swallowed.
 */
async function ensureVaultIcons() {
  const sourcePath = getBundledAssetPath(TCEO_ICON_SOURCE_RELATIVE);
  const generatedIcoPath = getBundledAssetPath(TCEO_FILE_ICON_RELATIVE);
  const generatedPngPath = getBundledAssetPath(TCEO_FILE_ICON_PNG_RELATIVE);
  const needIco = IS_WIN && !fs.existsSync(TCEO_ICON_ICO);
  const needPng = (IS_LINUX || IS_MAC) && !fs.existsSync(TCEO_ICON_PNG);

  if (!needIco && !needPng) return;

  try {
    if (!fs.existsSync(RESOURCES_DIR)) {
      fs.mkdirSync(RESOURCES_DIR, { recursive: true });
    }

    if (needIco) {
      if (fs.existsSync(generatedIcoPath)) {
        fs.copyFileSync(generatedIcoPath, TCEO_ICON_ICO);
      } else {
        await writeMultiSizeIco(sourcePath, TCEO_ICON_ICO);
      }
      console.log('[tceo-icon] Windows icon generated:', TCEO_ICON_ICO);
    }

    if (needPng) {
      if (fs.existsSync(generatedPngPath)) {
        fs.copyFileSync(generatedPngPath, TCEO_ICON_PNG);
      } else {
        const sharp = require('sharp');
        await sharp(sourcePath)
          .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toFile(TCEO_ICON_PNG);
      }
      console.log('[tceo-icon] PNG icon generated:', TCEO_ICON_PNG);
    }
  } catch (err) {
    console.warn('[tceo-icon] Icon generation skipped:', err.message);
  }
}

async function writeMultiSizeIco(sourcePath, targetPath) {
  const sharp = require('sharp');
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map(async (size) => ({
    size,
    data: await sharp(sourcePath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  })));
  const headerSize = 6 + images.length * 16;
  const header = Buffer.alloc(headerSize);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = headerSize;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header[entry] = image.size === 256 ? 0 : image.size;
    header[entry + 1] = image.size === 256 ? 0 : image.size;
    header[entry + 2] = 0;
    header[entry + 3] = 0;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });

  fs.writeFileSync(targetPath, Buffer.concat([header, ...images.map((image) => image.data)]));
}

// ─── PLATFORM FILE ASSOCIATION HELPERS ────────────────────────────────────────

// ── Windows ──────────────────────────────────────────────────────────────────

/**
 * Writes a single Windows registry value using the built-in `reg add` command.
 * All keys go to HKEY_CURRENT_USER — no elevation required.
 */
function regSet(keyPath, valueName, type, data) {
  if (!IS_WIN) return Promise.resolve();

  return new Promise((resolve) => {
    const isDefault = valueName === '(Default)';
    // Build the argument list:
    //   reg add <key> [/ve | /v <name>] /t <type> /d <data> /f
    const args = ['add', keyPath];
    if (isDefault) {
      args.push('/ve');               // default (unnamed) value
    } else {
      args.push('/v', valueName);
    }
    args.push('/t', type, '/d', data, '/f');

    execFile('reg', args, { windowsHide: true }, (err) => {
      if (err) console.warn(`[tceo-reg] ${keyPath}: ${err.message}`);
      resolve();
    });
  });
}

function getTceoFileIconPath() {
  if (app.isPackaged) {
    const packagedIcon = path.join(process.resourcesPath, TCEO_FILE_ICON_RELATIVE);
    if (fs.existsSync(packagedIcon)) return packagedIcon;
  }
  const devIcon = path.join(__dirname, '..', TCEO_FILE_ICON_RELATIVE);
  if (fs.existsSync(devIcon)) return devIcon;
  return TCEO_ICON_ICO;
}

function getBundledAssetPath(relativePath) {
  const appPath = app.getAppPath();
  const appAsset = path.join(appPath, relativePath);
  if (fs.existsSync(appAsset)) return appAsset;
  return path.join(__dirname, '..', relativePath);
}

function getTceoRasterIconPath() {
  if (fs.existsSync(TCEO_ICON_PNG)) return TCEO_ICON_PNG;
  const generatedPng = getBundledAssetPath(TCEO_FILE_ICON_PNG_RELATIVE);
  if (fs.existsSync(generatedPng)) return generatedPng;
  const sourcePng = getBundledAssetPath(TCEO_ICON_SOURCE_RELATIVE);
  if (fs.existsSync(sourcePng)) return sourcePng;
  return getBundledAssetPath(APP_ICON_PNG_RELATIVE);
}

async function registerWindowsFileAssociation() {
  if (!IS_WIN) return;

  const exePath  = process.execPath;

  // In dev mode the command must be:  "electron.exe" "c:\path\to\ToolCEO" "%1"
  // so Electron loads the project directory as the app, not treating the .tceo file as the app entry point.
  // In a packaged build (app.isPackaged), the executable is self-contained: "ToolCEO.exe" "%1"
  const appArg  = app.isPackaged ? '' : `"${path.join(__dirname, '..')}" `;
  const openCmd = `"${exePath}" ${appArg}"%1"`;

  const hkcu     = 'HKCU\\Software\\Classes';

  await Promise.all([
    // Map .tceo → ProgID
    regSet(`${hkcu}\\.tceo`,                                    '(Default)',    'REG_SZ', TCEO_PROG_ID),
    regSet(`${hkcu}\\.tceo`,                                    'Content Type','REG_SZ', TCEO_MIME),
    regSet(`${hkcu}\\.tceo\\OpenWithProgids`,                   TCEO_PROG_ID,   'REG_NONE', ''),

    // ProgID display name
    regSet(`${hkcu}\\${TCEO_PROG_ID}`,                          '(Default)',    'REG_SZ', TCEO_FILE_DESC),

    // Open verb
    regSet(`${hkcu}\\${TCEO_PROG_ID}\\shell\\open`,             '(Default)',    'REG_SZ', 'Open with ToolCEO'),
    regSet(`${hkcu}\\${TCEO_PROG_ID}\\shell\\open\\command`,    '(Default)',    'REG_SZ', openCmd),
  ]);

  try {
    const iconPath = getTceoFileIconPath();
    execFileSync(
      'reg',
      ['add', `HKCU\\Software\\Classes\\${TCEO_PROG_ID}\\DefaultIcon`, '/ve', '/t', 'REG_SZ', '/d', `"${iconPath}",0`, '/f'],
      { stdio: 'ignore', windowsHide: true }
    );
    refreshWindowsShellIcons();
  } catch (err) {
    console.log('Icon registration skipped:', err.message);
  }

  console.log('[tceo-assoc] Windows file association registered. openCmd:', openCmd);
}

function psSingleQuote(value) {
  return String(value).replace(/'/g, "''");
}

function refreshWindowsShellIcons(filePath) {
  if (!IS_WIN) return;

  try {
    execFileSync('ie4uinit.exe', ['-show'], { stdio: 'ignore', windowsHide: true });
  } catch (_) {}

  const desktopPath = app.isReady() ? app.getPath('desktop') : '';
  const fileCall = filePath
    ? `[ShellNotify]::Path(0x00002000, 0x0005, '${psSingleQuote(filePath)}', $null);`
    : '';
  const desktopCall = desktopPath
    ? `[ShellNotify]::Path(0x00001000, 0x0005, '${psSingleQuote(desktopPath)}', $null);`
    : '';
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ShellNotify {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, EntryPoint = "SHChangeNotify")]
  public static extern void Path(int eventId, uint flags, string item1, string item2);
  [DllImport("shell32.dll", EntryPoint = "SHChangeNotify")]
  public static extern void IdList(int eventId, uint flags, IntPtr item1, IntPtr item2);
}
"@
[ShellNotify]::IdList(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero);
${fileCall}
${desktopCall}
`;

  execFile(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 5000 },
    () => {}
  );
}

function notifySavedFile(filePath) {
  if (filePath && path.extname(filePath).toLowerCase() === TCEO_EXT) {
    refreshWindowsShellIcons(filePath);
  }
  return filePath;
}

// ── Linux ─────────────────────────────────────────────────────────────────────

/**
 * Registers the .tceo MIME type and .desktop file in ~/.local/share.
 * No sudo needed — everything goes into the user's XDG data home.
 *
 * Steps:
 *  1. Write ~/.local/share/mime/packages/application-x-tceo.xml
 *  2. Run `update-mime-database ~/.local/share/mime`
 *  3. Copy app icon to ~/.local/share/icons/hicolor/256x256/apps/toolceo.png
 *  4. Write ~/.local/share/applications/toolceo.desktop
 *  5. Run `xdg-mime default toolceo.desktop application/x-tceo`
 *  6. Run `update-desktop-database ~/.local/share/applications`
 */
async function registerLinuxFileAssociation() {
  if (!IS_LINUX) return;

  const exePath   = process.execPath;

  // Icon: prefer generated PNG, fall back to source PNG
  const iconSrc   = getTceoRasterIconPath();

  try {
    const sharp = require('sharp');
    fs.mkdirSync(LINUX_MIME_ICON_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(LINUX_ICON_DEST), { recursive: true });
    await sharp(iconSrc)
      .resize(256, 256)
      .png()
      .toFile(LINUX_MIME_ICON_DEST);
    await sharp(iconSrc)
      .resize(256, 256)
      .png()
      .toFile(LINUX_ICON_DEST);
  } catch (err) {
    try {
      const image = nativeImage.createFromPath(iconSrc).resize({ width: 256, height: 256 });
      if (image.isEmpty()) throw new Error('PNG could not be decoded');
      fs.mkdirSync(LINUX_MIME_ICON_DIR, { recursive: true });
      fs.mkdirSync(path.dirname(LINUX_ICON_DEST), { recursive: true });
      fs.writeFileSync(LINUX_MIME_ICON_DEST, image.toPNG());
      fs.writeFileSync(LINUX_ICON_DEST, image.toPNG());
    } catch (fallbackErr) {
      console.log('Icon registration skipped:', fallbackErr.message || err.message);
    }
  }

  // ── 1. MIME type XML ─────────────────────────────────────────────────────
  const mimeXml = `<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="${TCEO_MIME}">
    <comment>${TCEO_FILE_DESC}</comment>
    <icon name="application-x-tceo"/>
    <glob pattern="*${TCEO_EXT}"/>
    <magic priority="80">
      <match type="string" offset="0" value="TCEO"/>
    </magic>
  </mime-type>
</mime-info>`;

  ensureDir(LINUX_MIME_DIR);
  fs.writeFileSync(LINUX_MIME_FILE, mimeXml, 'utf8');

  // ── 2. Update MIME database ──────────────────────────────────────────────
  await runCmd('update-mime-database', [path.join(XDG_DATA_HOME, 'mime')]);

  // ── 3. Install icon ──────────────────────────────────────────────────────
  ensureDir(path.dirname(LINUX_ICON_DEST));

  // ── 4. .desktop file ────────────────────────────────────────────────────
  const desktop = [
    '[Desktop Entry]',
    'Version=1.0',
    'Type=Application',
    `Name=ToolCEO`,
    `Comment=${TCEO_FILE_DESC} — open with ToolCEO`,
    `Exec="${exePath}" %f`,
    `Icon=toolceo`,
    `MimeType=${TCEO_MIME};`,
    `Categories=Office;Utility;`,
    'NoDisplay=false',
    `StartupNotify=true`,
  ].join('\n') + '\n';

  ensureDir(LINUX_APPS_DIR);
  fs.writeFileSync(LINUX_DESKTOP, desktop, 'utf8');

  // ── 5. Set as default handler ────────────────────────────────────────────
  await runCmd('xdg-mime', ['default', 'toolceo.desktop', TCEO_MIME]);

  // ── 6. Refresh applications index ────────────────────────────────────────
  await runCmd('update-desktop-database', [LINUX_APPS_DIR]);

  try {
    execFileSync('update-icon-caches', [path.join(XDG_DATA_HOME, 'icons', 'hicolor')], { stdio: 'ignore' });
  } catch (err) {
    console.log('Icon registration skipped:', err.message);
  }

  console.log('[tceo-assoc] Linux file association registered.');
}

// ── macOS ─────────────────────────────────────────────────────────────────────
// For packaged builds, electron-builder handles Info.plist via the `build`
// section in package.json (CFBundleDocumentTypes).
// In development mode, file open events are delivered via app.on('open-file')
// once the user manually associates .tceo with the app using "Get Info" in Finder
// or the `duti` CLI tool.

async function registerMacosFileAssociation() {
  if (!IS_MAC) return;

  // In dev mode: use `duti` if available to set the default handler.
  // `duti` is a lightweight open-source CLI: https://github.com/moretension/duti
  // Install via: brew install duti
  const bundleId = app.isPackaged
    ? (app.applicationId || 'com.toolceo.app')  // set in electron-builder config
    : 'com.github.electron';                      // Electron dev bundle ID

  await runCmd('duti', ['-s', bundleId, TCEO_MIME, 'all'])
    .catch(() => {
      // duti not installed — log hint and continue
      console.info(
        '[tceo-assoc] macOS: `duti` not found. To register .tceo manually, run:\n' +
        `  duti -s ${bundleId} ${TCEO_MIME} all\n` +
        '  (install with: brew install duti)'
      );
    });
}

// ─── UTILITY ──────────────────────────────────────────────────────────────────

/** Creates a directory and all its parents if they don't exist. */
function ensureDir(dirPath) {
  try { fs.mkdirSync(dirPath, { recursive: true }); } catch (_) {}
}

/**
 * Runs an external command and resolves when it exits.
 * Rejects if the command cannot be found (ENOENT).
 */
function runCmd(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 10_000 }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          reject(err);   // command not found — let caller decide
        } else {
          console.warn(`[tceo-assoc] ${cmd} exited with error:`, err.message);
          resolve();     // non-fatal
        }
      } else {
        resolve();
      }
    });
  });
}

// ─── PLATFORM DISPATCH ────────────────────────────────────────────────────────

/**
 * Registers .tceo file association for the current OS.
 * Fire-and-forget — failures are logged but never crash the app.
 */
async function registerFileAssociation() {
  try {
    if (IS_WIN)   await registerWindowsFileAssociation();
    if (IS_LINUX) await registerLinuxFileAssociation();
    if (IS_MAC)   await registerMacosFileAssociation();
  } catch (err) {
    console.warn('[tceo-assoc] File association registration failed:', err.message);
  }
}

// ─── BACKEND ──────────────────────────────────────────────────────────────────

function startBackend() {
  const backendExePath = path.join(
    process.resourcesPath,
    'engines', 'python', 'main_backend.exe'
  );

  if (app.isPackaged && fs.existsSync(backendExePath)) {
    console.log('[backend] Launching packaged backend from:', backendExePath);
    backendProcess = spawn(backendExePath, [], {
      detached: false,
      stdio: 'ignore',
      windowsHide: true,
    });
  } else {
    // Development mode
    const venvPython = path.join(__dirname, '..', 'backend', 'venv', 'Scripts', 'python.exe');
    const pythonCmd = fs.existsSync(venvPython)
      ? venvPython
      : (IS_WIN ? 'python.exe' : 'python3');
    const backendDir = path.join(__dirname, '..', 'backend');

    console.log('[backend] Launching dev backend with:', pythonCmd);
    backendProcess = spawn(
      pythonCmd,
      ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
      { cwd: backendDir, stdio: 'ignore', windowsHide: true }
    );
  }

  backendProcess.on('error', (err) => {
    console.error('[backend] Backend failed to start:', err.message);
  });

  backendProcess.on('exit', (code) => {
    console.log('[backend] Backend exited with code:', code);
  });
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    try {
      if (IS_WIN && backendProcess.pid) {
        execFileSync('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch (_) {}
    backendProcess = null;
  }
}

function waitForBackend(url, retries, delay, callback) {
  const http = require('http');
  http.get(url, () => callback()).on('error', () => {
    if (retries <= 0) { callback(); return; }
    setTimeout(() => waitForBackend(url, retries - 1, delay, callback), delay);
  });
}

// ─── WINDOW CREATION ──────────────────────────────────────────────────────────

function createSplash() {
  const appIconPath = getBundledAssetPath(APP_ICON_PNG_RELATIVE);
  splashWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    frame: true,
    transparent: false,
    backgroundColor: '#0A1F1C',
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    center: true,
    title: 'ToolCEO',
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splashWindow.setMenuBarVisibility(false);
  splashWindow.loadFile(path.join(__dirname, '..', 'frontend', 'splash.html'));

  // If user closes the splash manually, show the main window immediately
  splashWindow.on('closed', () => {
    splashWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
}

function createWindow() {
  const appIconPath = getBundledAssetPath(APP_ICON_PNG_RELATIVE);
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 1000,
    minHeight: 650,
    icon: appIconPath,
    show: false,
    backgroundColor: '#0A1F1C',
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#081918',
      symbolColor: '#8FAAA6',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'index.html'));

  if (!app.isPackaged) {
    mainWindow.webContents.session.clearCache();
  }

  // Wait for both: 4s minimum splash time AND window ready-to-show
  const timerDone   = new Promise(resolve => setTimeout(resolve, 10000));
  const windowReady = new Promise(resolve => mainWindow.once('ready-to-show', resolve));

  Promise.all([timerDone, windowReady]).then(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.destroy();
      splashWindow = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.once('did-finish-load', () => {
    // A .tceo file was queued before the window was ready — send it now.
    if (_pendingVaultFile) {
      // Small delay to let the renderer finish its DOMContentLoaded bootstrap
      setTimeout(() => sendVaultFileOpen(_pendingVaultFile), 600);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── MODULE DOWNLOAD STATE ────────────────────────────────────────────────────

/**
 * Active download state. Only one download at a time.
 * Shape:
 *  { moduleId, downloadUrl, tempPath, req, received, total,
 *    paused, pausedAt, speedSamples, reconnectTimer }
 */
let _activeDownload = null;

/** Returns the engines root directory: dev → project root/engines, packaged → resources/../engines */
function _getEnginesDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, '..', 'engines');
  }
  return path.join(__dirname, '..', 'engines');
}

/** Send a native OS notification (no-op if Notification not supported). */
function _notify(title, body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  } catch (_) { /* ignore */ }
}

/**
 * Update speed samples and compute bytes-per-second over a rolling 2-second window.
 * Returns { speedBps, etaSeconds }.
 */
function _calcSpeed(samples, received, total) {
  const now = Date.now();
  samples.push({ time: now, bytes: received });
  // Keep only last 2 seconds
  const cutoff = now - 2000;
  while (samples.length > 1 && samples[0].time < cutoff) samples.shift();

  let speedBps = 0;
  if (samples.length >= 2) {
    const oldest  = samples[0];
    const newest  = samples[samples.length - 1];
    const dt      = (newest.time - oldest.time) / 1000;
    const db      = newest.bytes - oldest.bytes;
    speedBps      = dt > 0 ? db / dt : 0;
  }

  const remaining   = total > 0 ? total - received : 0;
  const etaSeconds  = speedBps > 0 && remaining > 0 ? Math.ceil(remaining / speedBps) : 0;
  return { speedBps, etaSeconds };
}

/** Follow HTTP redirects and resolve to the final response. */
function _httpsGetFollow(url, headers, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        resolve(_httpsGetFollow(res.headers.location, headers, redirectsLeft - 1));
        return;
      }
      resolve({ res, req });
    });
    req.on('error', reject);
  });
}

// ─── APP READY ────────────────────────────────────────────────────────────────

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

app.whenReady().then(async () => {
  // ── IPC: Save file to downloads ───────────────────────────────────────────
  ipcMain.handle('save-to-downloads', (_event, filename, base64Data) => {
    const downloadsDir = app.getPath('downloads');
    let outName = (filename || 'compressed.pdf').trim();
    if (!outName.toLowerCase().endsWith('.pdf')) outName += '.pdf';
    const filePath = path.join(downloadsDir, outName);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    return filePath;
  });

  // ── IPC: Save file via system dialog ──────────────────────────────────────
  ipcMain.handle('save-file-dialog', async (_event, filename, base64Data) => {
    const downloadsDir = app.getPath('downloads');
    let outName = (filename || 'output.pdf').trim();
    const ext = path.extname(outName).replace('.', '').toLowerCase() || 'pdf';

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save File',
      defaultPath: path.join(downloadsDir, outName),
      buttonLabel: 'Save',
      filters: [
        { name: `${ext.toUpperCase()} Documents (*.${ext})`, extensions: [ext] },
        { name: 'All Files (*.*)', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) return null;

    const buffer = Buffer.from(base64Data, 'base64');
    try {
      fs.writeFileSync(filePath, buffer);
      return notifySavedFile(filePath);
    } catch (_err) {
      // Try incrementing the filename if the target is locked
      const dir  = path.dirname(filePath);
      const fext = path.extname(filePath);
      const base = path.basename(filePath, fext);
      for (let i = 1; i < 100; i++) {
        const alt = path.join(dir, `${base} (${i})${fext}`);
        try { fs.writeFileSync(alt, buffer); return notifySavedFile(alt); } catch (_) {}
      }
      const fallback = path.join(dir, `${base}_${Date.now()}${fext}`);
      fs.writeFileSync(fallback, buffer);
      return notifySavedFile(fallback);
    }
  });

  // ── IPC: Read a local .tceo file and return its bytes to the renderer ─────
  // The renderer cannot use fs directly (contextIsolation:true), so the main
  // process reads the file and transfers the bytes via IPC.
  ipcMain.handle('read-local-file', (_event, filePath) => {
    try {
      const buf = fs.readFileSync(filePath);
      return {
        ok     : true,
        // Transfer as a plain ArrayBuffer — IPC serialises it safely
        buffer : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        name   : path.basename(filePath),
        size   : buf.length,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ── IPC: Read clipboard file / image and return bytes to renderer ──────────
  ipcMain.handle('read-clipboard-file', () => {
    try {
      const { clipboard } = require('electron');

      // 1. Check if an image is in clipboard (screenshot or copied image)
      const image = clipboard.readImage();
      if (image && !image.isEmpty()) {
        const pngBuf = image.toPNG();
        return {
          ok: true,
          name: `clipboard_image_${Date.now()}.png`,
          type: 'image/png',
          buffer: pngBuf.buffer.slice(pngBuf.byteOffset, pngBuf.byteOffset + pngBuf.byteLength),
        };
      }

      // 2. Check Windows Explorer copied file (FileNameW)
      if (process.platform === 'win32') {
        const rawBuf = clipboard.readBuffer('FileNameW');
        if (rawBuf && rawBuf.length > 0) {
          const filePath = rawBuf.toString('utf16le').replace(/\0+$/, '').trim();
          if (filePath && fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.isFile()) {
              const buf = fs.readFileSync(filePath);
              return {
                ok: true,
                name: path.basename(filePath),
                type: 'application/octet-stream',
                buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
              };
            }
          }
        }
      }

      // 3. Check plain text (copied file path string or file:// URL)
      const text = clipboard.readText();
      if (text) {
        let cleanPath = text.trim().replace(/^file:\/\/\/?/, '');
        if (cleanPath.startsWith('"') && cleanPath.endsWith('"')) {
          cleanPath = cleanPath.slice(1, -1);
        }
        if (cleanPath && fs.existsSync(cleanPath)) {
          const stats = fs.statSync(cleanPath);
          if (stats.isFile()) {
            const buf = fs.readFileSync(cleanPath);
            return {
              ok: true,
              name: path.basename(cleanPath),
              type: 'application/octet-stream',
              buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
            };
          }
        }
      }

      return { ok: false, error: 'No file or image found in clipboard' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ── IPC: Read modules.json — returns flat { office: 'not_installed', ... } ─
  ipcMain.handle('read-modules-json', () => {
    const modulesPath = app.isPackaged
      ? path.join(process.resourcesPath, '..', 'modules.json')
      : path.join(__dirname, '..', 'modules.json');
    try {
      const raw  = fs.readFileSync(modulesPath, 'utf8');
      const data = JSON.parse(raw);
      return Object.fromEntries(
        Object.entries(data.modules).map(([k, v]) => [k, v.status])
      );
    } catch (_) {
      return {};
    }
  });

  // ── IPC: Write a single module's status back to modules.json ──────────────
  ipcMain.handle('write-modules-json', (_event, moduleId, status) => {
    const modulesPath = app.isPackaged
      ? path.join(process.resourcesPath, '..', 'modules.json')
      : path.join(__dirname, '..', 'modules.json');
    try {
      const raw  = fs.readFileSync(modulesPath, 'utf8');
      const data = JSON.parse(raw);
      if (data.modules[moduleId]) {
        data.modules[moduleId].status = status;
      }
      fs.writeFileSync(modulesPath, JSON.stringify(data, null, 2), 'utf8');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ── IPC: Start module download ─────────────────────────────────────────────
  ipcMain.handle('start-module-download', async (_event, { moduleId, downloadUrl }) => {
    // One download at a time
    if (_activeDownload) {
      return { ok: false, reason: 'busy' };
    }

    // Online check
    if (!net.isOnline()) {
      _notify('No internet connection', 'Please check your network and try again.');
      return { ok: false, reason: 'offline' };
    }

    const tempPath = path.join(app.getPath('temp'), `${moduleId}-${Date.now()}.zip`);

    _activeDownload = {
      moduleId,
      downloadUrl,
      tempPath,
      req: null,
      received: 0,
      total: 0,
      paused: false,
      pausedAt: 0,
      speedSamples: [],
      reconnectTimer: null,
    };

    // Throttle IPC progress events to ~150ms intervals
    let _lastProgressSend = 0;

    const sendProgress = (payload) => {
      const now = Date.now();
      if (now - _lastProgressSend >= 150) {
        _lastProgressSend = now;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('module-download-progress', payload);
        }
      }
    };

    try {
      const { res, req } = await _httpsGetFollow(downloadUrl, { 'User-Agent': 'ToolCEO/1.0' });
      _activeDownload.req = req;
      _activeDownload.total = parseInt(res.headers['content-length'] || '0', 10);

      const writeStream = fs.createWriteStream(tempPath);

      await new Promise((resolve, reject) => {
        res.on('data', (chunk) => {
          if (!_activeDownload) { res.destroy(); writeStream.close(); return; }
          _activeDownload.received += chunk.length;
          writeStream.write(chunk);

          const { speedBps, etaSeconds } = _calcSpeed(
            _activeDownload.speedSamples,
            _activeDownload.received,
            _activeDownload.total
          );
          const percent = _activeDownload.total > 0
            ? Math.round((_activeDownload.received / _activeDownload.total) * 100)
            : 0;

          sendProgress({
            moduleId,
            receivedBytes: _activeDownload.received,
            totalBytes:    _activeDownload.total,
            speedBps,
            etaSeconds,
            percent,
          });
        });

        res.on('end', () => { writeStream.end(); resolve(); });
        res.on('error', (err) => { writeStream.destroy(); reject(err); });
        req.on('error', (err) => { writeStream.destroy(); reject(err); });
      });

    } catch (err) {
      // Network error mid-download
      if (_activeDownload) {
        _activeDownload.paused = true;
        _activeDownload.pausedAt = _activeDownload.received;
        _notify('Connection lost', 'Download paused. Check your connection.');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('module-download-error', { moduleId, reason: 'connection-lost', received: _activeDownload.received });
        }
        // Start reconnect polling
        _activeDownload.reconnectTimer = setInterval(() => {
          if (!_activeDownload || !_activeDownload.paused) {
            clearInterval(_activeDownload && _activeDownload.reconnectTimer);
            return;
          }
          if (net.isOnline()) {
            clearInterval(_activeDownload.reconnectTimer);
            _activeDownload.reconnectTimer = null;
            // Auto-resume
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('module-download-error', { moduleId, reason: 'connection-restored' });
            }
          }
        }, 5000);
      }
      return { ok: false, reason: 'network-error', error: err.message };
    }

    // Check still active (could have been cancelled)
    if (!_activeDownload) return { ok: false, reason: 'cancelled' };

    // Extract ZIP to engines/<moduleId>/
    try {
      const enginesDir = _getEnginesDir();
      const destDir    = path.join(enginesDir, moduleId);
      fs.mkdirSync(destDir, { recursive: true });

      const zip = new AdmZip(tempPath);
      zip.extractAllTo(destDir, true /* overwrite */);
    } catch (err) {
      _activeDownload = null;
      return { ok: false, reason: 'extraction-failed', error: err.message };
    }

    // Delete temp zip
    try { fs.unlinkSync(tempPath); } catch (_) { /* ignore */ }

    // Write installed status
    const modulesPath = app.isPackaged
      ? path.join(process.resourcesPath, '..', 'modules.json')
      : path.join(__dirname, '..', 'modules.json');
    try {
      const raw  = fs.readFileSync(modulesPath, 'utf8');
      const data = JSON.parse(raw);
      if (data.modules[moduleId]) data.modules[moduleId].status = 'installed';
      fs.writeFileSync(modulesPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (_) { /* non-fatal */ }

    const modName = moduleId.charAt(0).toUpperCase() + moduleId.slice(1) + ' Module';
    _notify(modName + ' installed', `${modName} downloaded and installed successfully.`);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('module-download-complete', { moduleId });
    }

    _activeDownload = null;
    return { ok: true };
  });

  // ── IPC: Cancel module download ────────────────────────────────────────────
  ipcMain.handle('cancel-module-download', () => {
    if (!_activeDownload) return { ok: false };
    const { req, tempPath, reconnectTimer } = _activeDownload;
    if (reconnectTimer) clearInterval(reconnectTimer);
    if (req) { try { req.destroy(); } catch (_) {} }
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
    _activeDownload = null;
    return { ok: true };
  });

  // ── IPC: Resume module download (after connection-lost) ───────────────────
  ipcMain.handle('resume-module-download', async () => {
    if (!_activeDownload || !_activeDownload.paused) return { ok: false, reason: 'not-paused' };

    if (!net.isOnline()) return { ok: false, reason: 'offline' };

    const { moduleId, downloadUrl, tempPath, pausedAt } = _activeDownload;
    _activeDownload.paused = false;
    _activeDownload.received = pausedAt;
    _activeDownload.speedSamples = [];

    _notify('Connection restored', 'Resuming download…');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('module-download-error', { moduleId, reason: 'resuming' });
    }

    let _lastProgressSend = 0;
    const sendProgress = (payload) => {
      const now = Date.now();
      if (now - _lastProgressSend >= 150) {
        _lastProgressSend = now;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('module-download-progress', payload);
        }
      }
    };

    try {
      const resumeHeaders = {
        'User-Agent': 'ToolCEO/1.0',
        'Range': `bytes=${pausedAt}-`,
      };
      const { res, req } = await _httpsGetFollow(downloadUrl, resumeHeaders);
      _activeDownload.req = req;
      // If server returns 200 (doesn't support range), total is full size; if 206, add to offset
      if (res.statusCode === 200) {
        _activeDownload.received = 0;
        _activeDownload.total = parseInt(res.headers['content-length'] || '0', 10);
      } else {
        _activeDownload.total = pausedAt + parseInt(res.headers['content-length'] || '0', 10);
      }

      // Append mode if 206, overwrite if 200
      const writeFlag = res.statusCode === 206 ? 'a' : 'w';
      const writeStream = fs.createWriteStream(tempPath, { flags: writeFlag });

      await new Promise((resolve, reject) => {
        res.on('data', (chunk) => {
          if (!_activeDownload) { res.destroy(); writeStream.close(); return; }
          _activeDownload.received += chunk.length;
          writeStream.write(chunk);

          const { speedBps, etaSeconds } = _calcSpeed(
            _activeDownload.speedSamples,
            _activeDownload.received,
            _activeDownload.total
          );
          const percent = _activeDownload.total > 0
            ? Math.round((_activeDownload.received / _activeDownload.total) * 100)
            : 0;

          sendProgress({ moduleId, receivedBytes: _activeDownload.received, totalBytes: _activeDownload.total, speedBps, etaSeconds, percent });
        });

        res.on('end', () => { writeStream.end(); resolve(); });
        res.on('error', reject);
        req.on('error', reject);
      });

    } catch (err) {
      if (_activeDownload) {
        _activeDownload.paused = true;
        _activeDownload.pausedAt = _activeDownload.received;
        _notify('Connection lost', 'Download paused again. Check your connection.');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('module-download-error', { moduleId, reason: 'connection-lost', received: _activeDownload.received });
        }
      }
      return { ok: false, reason: 'network-error' };
    }

    if (!_activeDownload) return { ok: false, reason: 'cancelled' };

    // Extract + install (same as start handler)
    try {
      const enginesDir = _getEnginesDir();
      const destDir    = path.join(enginesDir, moduleId);
      fs.mkdirSync(destDir, { recursive: true });
      const zip = new AdmZip(tempPath);
      zip.extractAllTo(destDir, true);
    } catch (err) {
      _activeDownload = null;
      return { ok: false, reason: 'extraction-failed', error: err.message };
    }

    try { fs.unlinkSync(tempPath); } catch (_) {}

    const modulesPath = app.isPackaged
      ? path.join(process.resourcesPath, '..', 'modules.json')
      : path.join(__dirname, '..', 'modules.json');
    try {
      const raw  = fs.readFileSync(modulesPath, 'utf8');
      const data = JSON.parse(raw);
      if (data.modules[moduleId]) data.modules[moduleId].status = 'installed';
      fs.writeFileSync(modulesPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (_) {}

    const modName = moduleId.charAt(0).toUpperCase() + moduleId.slice(1) + ' Module';
    _notify(modName + ' installed', `${modName} downloaded and installed successfully.`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('module-download-complete', { moduleId });
    }

    _activeDownload = null;
    return { ok: true };
  });

  // ── Show splash immediately, then load main window + backend in parallel ──
  createSplash();
  createWindow();
  startBackend();
  ensureVaultIcons();           // fire-and-forget — no await
  registerFileAssociation();    // fire-and-forget

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ─── CLEANUP ──────────────────────────────────────────────────────────────────

// Stop backend on every possible close event
app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') app.quit();
});
app.on('before-quit', () => stopBackend());
app.on('will-quit', () => stopBackend());

// Handle force close and crash
process.on('exit', () => stopBackend());
process.on('SIGINT', () => { stopBackend(); process.exit(0); });
process.on('SIGTERM', () => { stopBackend(); process.exit(0); });

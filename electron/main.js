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

const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');
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
  const backendDir = path.join(__dirname, '..', 'backend');
  const pythonCmd  = IS_WIN ? 'python.exe' : 'python3';

  backendProcess = spawn(
    pythonCmd,
    ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
    { cwd: backendDir, stdio: 'ignore' }
  );

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err.message);
  });
}

function waitForBackend(url, retries, delay, callback) {
  const http = require('http');
  http.get(url, () => callback()).on('error', () => {
    if (retries <= 0) { callback(); return; }
    setTimeout(() => waitForBackend(url, retries - 1, delay, callback), delay);
  });
}

// ─── WINDOW CREATION ──────────────────────────────────────────────────────────

function createWindow() {
  const appIconPath = getBundledAssetPath(APP_ICON_PNG_RELATIVE);
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 750,
    minWidth: 1000,
    minHeight: 650,
    icon: appIconPath,
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

  mainWindow.webContents.once('did-finish-load', () => {
    // A .tceo file was queued before the window was ready — send it now.
    if (_pendingVaultFile) {
      // Small delay to let the renderer finish its DOMContentLoaded bootstrap
      setTimeout(() => sendVaultFileOpen(_pendingVaultFile), 600);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
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

  // ── Generate icons + register file association (all platforms) ────────────
  await ensureVaultIcons();
  registerFileAssociation();   // fire-and-forget — non-blocking for window open

  // ── Start backend, then open window ───────────────────────────────────────
  startBackend();
  waitForBackend('http://127.0.0.1:8000/health', 20, 500, () => {
    createWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ─── CLEANUP ──────────────────────────────────────────────────────────────────

app.on('window-all-closed', () => {
  if (!IS_MAC) app.quit();
});

app.on('will-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});

const { spawn, execFileSync } = require('child_process');
const electron = require('electron');
const path = require('path');
const fs = require('fs');

// ─── BRAND DEV ELECTRON.EXE ─────────────────────────────────────────────────
// In dev mode the taskbar shows the Electron default icon because
// Windows reads the icon from the running .exe.  We use rcedit
// (already bundled by electron-winstaller) to stamp our icon + name
// into the dev electron.exe.  A stamp file avoids re-patching every run.
if (process.platform === 'win32') {
  const electronExe = String(electron);
  const rcedit = path.join(__dirname, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
  const ico = path.join(__dirname, 'assets', 'icon.ico');
  const stamp = path.join(path.dirname(electronExe), '.toolceo-branded');

  if (fs.existsSync(rcedit) && fs.existsSync(ico) && !fs.existsSync(stamp)) {
    try {
      execFileSync(rcedit, [electronExe, '--set-icon', ico], { stdio: 'ignore' });
      execFileSync(rcedit, [
        electronExe,
        '--set-version-string', 'ProductName', 'ToolCEO',
        '--set-version-string', 'FileDescription', 'ToolCEO Desktop Application',
      ], { stdio: 'ignore' });
      fs.writeFileSync(stamp, 'branded');
      console.log('[start] ✓ Dev electron.exe branded with ToolCEO icon');
    } catch (err) {
      console.warn('[start] Could not brand electron.exe:', err.message);
    }
  }
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.TOOLCEO_CLEAN_ON_START = '1';

const args = process.argv.slice(2);
if (args.length === 0) {
  args.push('.');
}

const child = spawn(electron, args, {
  stdio: 'inherit',
  windowsHide: false,
  env,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});

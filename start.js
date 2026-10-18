const { spawn, execFileSync } = require('child_process');
const electron = require('electron');
const path = require('path');
const fs = require('fs');

// Ensure the local dev electron binary has ToolCEO's branded icon embedded
// so Windows Taskbar never shows the default Electron atom icon.
try {
  const rceditPath = path.join(__dirname, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  const stampMarker = path.join(__dirname, 'node_modules', 'electron', 'dist', '.toolceo_icon_stamped');
  if (process.platform === 'win32' && fs.existsSync(rceditPath) && fs.existsSync(iconPath) && !fs.existsSync(stampMarker)) {
    execFileSync(rceditPath, [electron, '--set-icon', iconPath], { stdio: 'ignore' });
    fs.writeFileSync(stampMarker, '1');
  }
} catch (_) {}

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

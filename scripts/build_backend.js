/**
 * Build the standalone Python backend used by the Electron application.
 * Runs from source so packaged builds always contain the current API/routes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.join(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const pythonVenv = process.platform === 'win32'
  ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
  : path.join(backendDir, 'venv', 'bin', 'python');
const bootstrapPython = process.env.TOOLCEO_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
const bootstrapArgs = process.platform === 'win32' && !process.env.TOOLCEO_PYTHON ? ['-3'] : [];
let python = process.env.TOOLCEO_PYTHON || (fs.existsSync(pythonVenv) ? pythonVenv : bootstrapPython);
let pythonArgs = python === bootstrapPython ? bootstrapArgs : [];
const distDir = path.join(rootDir, 'engines', 'python');

function runPython(args, options = {}) {
  return spawnSync(python, [...pythonArgs, ...args], {
    cwd: backendDir,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
}

function installBuildDependencies() {
  if (!fs.existsSync(pythonVenv) && !process.env.TOOLCEO_PYTHON) {
    console.log('[backend-build] Creating backend Python environment');
    const created = runPython(['-m', 'venv', path.join(backendDir, 'venv')]);
    if (created.error || created.status !== 0) {
      console.error('[backend-build] Could not create a Python environment. Install Python 3 and retry.');
      process.exit(created.status || 1);
    }
    python = pythonVenv;
    pythonArgs = [];
  }

  console.log('[backend-build] Installing backend and PyInstaller dependencies');
  const installed = runPython([
    '-m', 'pip', 'install', '-r', path.join(backendDir, 'requirements.txt'), 'pyinstaller==6.22.2',
  ]);
  if (installed.error || installed.status !== 0) {
    console.error('[backend-build] Python dependency installation failed.');
    process.exit(installed.status || 1);
  }
}

if (!fs.existsSync(path.join(backendDir, 'main_backend.spec'))) {
  console.error('[backend-build] Missing backend/main_backend.spec.');
  process.exit(1);
}

console.log(`[backend-build] Building backend with ${python}`);
let pyinstallerCheck = runPython(['-m', 'PyInstaller', '--version'], { stdio: 'ignore' });
if (pyinstallerCheck.error || pyinstallerCheck.status !== 0) {
  installBuildDependencies();
  pyinstallerCheck = runPython(['-m', 'PyInstaller', '--version'], { stdio: 'ignore' });
}
if (pyinstallerCheck.error || pyinstallerCheck.status !== 0) {
  console.error('[backend-build] PyInstaller is unavailable in the selected Python environment.');
  process.exit(1);
}

const result = runPython([
  '-m', 'PyInstaller',
  '--clean',
  '--noconfirm',
  '--distpath', distDir,
  '--workpath', path.join(backendDir, 'build'),
    'main_backend.spec',
]);

if (result.error) {
  console.error(`[backend-build] Could not start Python: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error('[backend-build] PyInstaller failed. Install backend/requirements.txt and PyInstaller in the selected Python environment.');
  process.exit(result.status || 1);
}

const executableName = process.platform === 'win32' ? 'main_backend.exe' : 'main_backend';
const executablePath = path.join(distDir, executableName);
if (!fs.existsSync(executablePath) || fs.statSync(executablePath).size === 0) {
  console.error(`[backend-build] Expected backend executable was not created: ${executablePath}`);
  process.exit(1);
}

console.log(`[backend-build] Backend ready: ${executablePath}`);

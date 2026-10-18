/**
 * scripts/build_backend.js
 * Compiles backend/main_backend.py into engines/python/main_backend.exe using PyInstaller.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');
const distDir = path.join(rootDir, 'engines', 'python');
const pythonPath = path.join(backendDir, 'venv', 'Scripts', 'python.exe');

if (!fs.existsSync(pythonPath)) {
  console.error('[build_backend] Error: Python venv not found at:', pythonPath);
  process.exit(1);
}

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log('[build_backend] Building updated main_backend.exe with PyInstaller...');

const args = [
  '-m', 'PyInstaller',
  '--clean',
  '--noconfirm',
  '--onefile',
  '--noconsole',
  '--name', 'main_backend',
  '--distpath', distDir,
  '--workpath', path.join(backendDir, 'build'),
  '--specpath', backendDir,
  '--paths', backendDir,
  '--collect-all', 'uvicorn',
  '--collect-all', 'fastapi',
  '--collect-all', 'starlette',
  '--collect-all', 'pydantic',
  '--collect-all', 'pikepdf',
  '--collect-all', 'fitz',
  '--collect-all', 'pymupdf',
  '--collect-all', 'pdfplumber',
  '--collect-all', 'pdfminer',
  '--collect-all', 'PIL',
  '--collect-all', 'openpyxl',
  '--collect-all', 'pandas',
  '--collect-all', 'docx',
  '--collect-all', 'pptx',
  '--collect-all', 'pycdlib',
  '--hidden-import', 'main',
  '--hidden-import', 'routers',
  '--hidden-import', 'tools',
  '--hidden-import', 'asyncio.proactor_events',
  'main_backend.py',
];

const result = spawnSync(pythonPath, args, {
  cwd: backendDir,
  stdio: 'inherit',
  shell: false,
});

if (result.status !== 0) {
  console.error('[build_backend] PyInstaller build failed with code:', result.status);
  process.exit(result.status || 1);
}

const targetExe = path.join(distDir, 'main_backend.exe');
if (fs.existsSync(targetExe)) {
  const stat = fs.statSync(targetExe);
  console.log(`[build_backend] ✓ Successfully created ${targetExe} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
} else {
  console.error('[build_backend] Output executable not found at:', targetExe);
  process.exit(1);
}

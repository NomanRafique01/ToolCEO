/**
 * scripts/build.js
 * Wrapper around electron-builder to ensure TEMP and TMP point to the user's
 * AppData\Local\Temp directory on Windows, preventing makensis failure
 * (!include: could not find: "C:\Windows\TEMP\nstXXXX.tmp").
 */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const rootDir = path.join(__dirname, '..');

if (process.platform === 'win32') {
  const userTemp = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Temp')
    : path.join(os.homedir(), 'AppData', 'Local', 'Temp');
  if (fs.existsSync(userTemp)) {
    process.env.TEMP = userTemp;
    process.env.TMP = userTemp;
  }
}

const args = process.argv.slice(2);
const builderArgs = args.length > 0 ? args : ['--win', '--x64'];

// Never reuse a previous appOutDir: Windows cannot remove its files while a
// ToolCEO instance launched from that directory is still running.
const outputOverride = builderArgs.some((arg) => arg.startsWith('--config.directories.output'));
if (!outputOverride) {
  const buildOutput = path.join(rootDir, 'dist', `build-${Date.now()}-${process.pid}`);
  builderArgs.push(`--config.directories.output=${buildOutput}`);
  console.log(`[build] Writing artifacts to ${buildOutput}`);
}

const electronBuilderCli = path.join(
  rootDir,
  'node_modules',
  'electron-builder',
  'cli.js'
);

const child = spawn(process.execPath, [electronBuilderCli, ...builderArgs], {
  stdio: 'inherit',
  env: process.env,
});

child.on('close', (code) => {
  process.exit(code || 0);
});

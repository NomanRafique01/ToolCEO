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

const electronBuilderBin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
);

const child = spawn(electronBuilderBin, builderArgs, {
  stdio: 'inherit',
  env: process.env,
  shell: true
});

child.on('close', (code) => {
  process.exit(code || 0);
});

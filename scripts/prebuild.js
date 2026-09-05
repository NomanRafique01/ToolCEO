/**
 * scripts/prebuild.js
 * Runs automatically prior to 'npm run build'.
 * 1. Resets modules.json so all modules are strictly "not_installed".
 * 2. Generates build-info.json with a unique build ID and timestamp.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const modulesJsonPath = path.join(rootDir, 'modules.json');
const buildInfoRootPath = path.join(rootDir, 'build-info.json');
const buildInfoFrontendPath = path.join(rootDir, 'frontend', 'build-info.json');

console.log('[prebuild] Preparing clean build environment...');

// 1. Reset modules.json
try {
  if (fs.existsSync(modulesJsonPath)) {
    const raw = fs.readFileSync(modulesJsonPath, 'utf8');
    const data = JSON.parse(raw);
    if (data && data.modules) {
      for (const key of Object.keys(data.modules)) {
        data.modules[key].status = 'not_installed';
      }
      fs.writeFileSync(modulesJsonPath, JSON.stringify(data, null, 2), 'utf8');
      console.log('[prebuild] ✓ modules.json reset: all modules set to "not_installed".');
    }
  }
} catch (err) {
  console.error('[prebuild] ⚠ Error resetting modules.json:', err.message);
}

// 2. Generate unique build-info.json
try {
  const buildInfo = {
    buildId: `build-${Date.now()}`,
    buildTimestamp: Date.now(),
    buildDate: new Date().toISOString(),
  };
  const jsonContent = JSON.stringify(buildInfo, null, 2);
  fs.writeFileSync(buildInfoRootPath, jsonContent, 'utf8');
  fs.writeFileSync(buildInfoFrontendPath, jsonContent, 'utf8');
  console.log(`[prebuild] ✓ build-info.json generated with buildId: ${buildInfo.buildId}`);
} catch (err) {
  console.error('[prebuild] ⚠ Error creating build-info.json:', err.message);
}

console.log('[prebuild] Ready for packaging.');

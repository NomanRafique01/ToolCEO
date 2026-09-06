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

// 3. Clear recent history and conversion database (local dev & system app data)
try {
  console.log('[prebuild] Clearing recent history and conversion databases...');
  let Database = null;
  try {
    Database = require('better-sqlite3');
  } catch (_) {}

  const os = require('os');
  const targetDirs = [];

  // Windows AppData
  if (process.env.APPDATA) {
    targetDirs.push(path.join(process.env.APPDATA, 'ToolCEO'));
    targetDirs.push(path.join(process.env.APPDATA, 'toolceo'));
  }
  if (process.env.LOCALAPPDATA) {
    targetDirs.push(path.join(process.env.LOCALAPPDATA, 'ToolCEO'));
    targetDirs.push(path.join(process.env.LOCALAPPDATA, 'toolceo'));
  }

  // macOS / Linux
  targetDirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'ToolCEO'));
  targetDirs.push(path.join(os.homedir(), 'Library', 'Application Support', 'toolceo'));
  targetDirs.push(path.join(os.homedir(), '.config', 'ToolCEO'));
  targetDirs.push(path.join(os.homedir(), '.config', 'toolceo'));

  // Project root / electron dirs
  targetDirs.push(rootDir);
  targetDirs.push(path.join(rootDir, 'electron'));

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) continue;

    const dbFiles = ['toolceo_history.db', 'toolceo_history.db-wal', 'toolceo_history.db-shm'];
    const dbPath = path.join(dir, 'toolceo_history.db');

    // First, wipe rows and auto-increment sequence via better-sqlite3 if available
    if (Database && fs.existsSync(dbPath)) {
      try {
        const db = new Database(dbPath);
        try {
          db.prepare('DELETE FROM conversions').run();
          try { db.prepare("DELETE FROM sqlite_sequence WHERE name = 'conversions'").run(); } catch (_) {}
          try { db.pragma('vacuum'); } catch (_) {}
          console.log(`[prebuild] ✓ Wiped conversion history records in: ${dbPath}`);
        } finally {
          db.close();
        }
      } catch (dbErr) {
        // May be locked or table not yet created
      }
    }

    // Next, attempt to unlink the DB files cleanly
    for (const f of dbFiles) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          console.log(`[prebuild] ✓ Removed database file: ${p}`);
        } catch (unlinkErr) {
          // File might be locked if dev app is running; records were wiped via SQL above
        }
      }
    }

    // Remove last_installed_build.json marker so new build runs clean install logic
    const marker = path.join(dir, 'last_installed_build.json');
    if (fs.existsSync(marker)) {
      try {
        fs.unlinkSync(marker);
        console.log(`[prebuild] ✓ Removed build marker: ${marker}`);
      } catch (_) {}
    }
  }
} catch (err) {
  console.error('[prebuild] ⚠ Error clearing history databases:', err.message);
}

console.log('[prebuild] Ready for packaging.');

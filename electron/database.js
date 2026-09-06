/**
 * electron/database.js
 *
 * Local SQLite conversion history database for ToolCEO.
 * Stored at app.getPath('userData')/toolceo_history.db with WAL mode enabled.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db = null;
let dbPath = null;

function initDatabase(app) {
  if (db) return db;

  const userDataDir = app.getPath('userData');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  dbPath = path.join(userDataDir, 'toolceo_history.db');
  db = new Database(dbPath);

  // Performance enhancement
  db.pragma('journal_mode = WAL');

  // Create table per prompt specifications
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_filename TEXT NOT NULL,
      input_format TEXT NOT NULL,
      output_filename TEXT NOT NULL,
      output_format TEXT NOT NULL,
      output_path TEXT NOT NULL,
      file_size_bytes INTEGER,
      category TEXT NOT NULL,
      converted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'success',
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_conversions_converted_at ON conversions(converted_at DESC);
  `);

  console.log('[database] SQLite initialized at:', dbPath);
  return db;
}

function addConversion(data) {
  if (!db) throw new Error('Database not initialized');

  const {
    original_filename,
    input_format,
    output_filename,
    output_format,
    output_path,
    file_size_bytes = null,
    category,
    status = 'success',
    error_message = null,
  } = data;

  const stmt = db.prepare(`
    INSERT INTO conversions (
      original_filename,
      input_format,
      output_filename,
      output_format,
      output_path,
      file_size_bytes,
      category,
      status,
      error_message
    ) VALUES (
      @original_filename,
      @input_format,
      @output_filename,
      @output_format,
      @output_path,
      @file_size_bytes,
      @category,
      @status,
      @error_message
    )
  `);

  const info = stmt.run({
    original_filename: original_filename || 'Unknown',
    input_format: (input_format || '').toLowerCase().replace(/^\./, ''),
    output_filename: output_filename || 'output',
    output_format: (output_format || '').toLowerCase().replace(/^\./, ''),
    output_path: output_path || '',
    file_size_bytes: file_size_bytes != null ? Math.round(file_size_bytes) : null,
    category: (category || 'document').toLowerCase(),
    status: status || 'success',
    error_message: error_message || null,
  });

  return { id: info.lastInsertRowid };
}

function getAllConversions() {
  if (!db) return [];
  const stmt = db.prepare('SELECT * FROM conversions ORDER BY converted_at DESC');
  return stmt.all();
}

function deleteConversion(id) {
  if (!db) return { success: false };
  const stmt = db.prepare('DELETE FROM conversions WHERE id = ?');
  const info = stmt.run(id);
  return { success: info.changes > 0 };
}

function clearAllConversions() {
  if (!db) return { success: false };
  try {
    const stmt = db.prepare('DELETE FROM conversions');
    stmt.run();
    try {
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'conversions'").run();
    } catch (_) {}
    try {
      db.pragma('vacuum');
    } catch (_) {}
    console.log('[database] All conversions and auto-increment sequence cleared successfully.');
    return { success: true };
  } catch (err) {
    console.error('[database] Failed to clear all conversions:', err.message);
    return { success: false, error: err.message };
  }
}

function closeDatabase() {
  if (db) {
    try {
      db.close();
    } catch (_) {}
    db = null;
  }
}

function deleteDatabaseFile() {
  closeDatabase();
  if (dbPath) {
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      const walPath = dbPath + '-wal';
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      const shmPath = dbPath + '-shm';
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      console.log('[database] SQLite database file wiped cleanly');
    } catch (err) {
      console.warn('[database] Failed to delete database file:', err.message);
    }
  }
}

module.exports = {
  initDatabase,
  addConversion,
  getAllConversions,
  deleteConversion,
  clearAllConversions,
  closeDatabase,
  deleteDatabaseFile,
};
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'news.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS headlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT,
    author TEXT,
    categories TEXT,
    published_at TEXT,
    fetched_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_source ON headlines(source_id);
  CREATE INDEX IF NOT EXISTS idx_fetched ON headlines(fetched_at);
  CREATE INDEX IF NOT EXISTS idx_published ON headlines(published_at);

  CREATE TABLE IF NOT EXISTS fetch_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT,
    status TEXT,
    message TEXT,
    fetched_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS suggested_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    submitted_at TEXT DEFAULT (datetime('now'))
  );
`);

const insertHeadline = db.prepare(`
  INSERT OR IGNORE INTO headlines (source_id, title, url, description, image_url, author, categories, published_at)
  VALUES (@source_id, @title, @url, @description, @image_url, @author, @categories, @published_at)
`);

const logFetch = db.prepare(`
  INSERT INTO fetch_log (source_id, status, message) VALUES (?, ?, ?)
`);

module.exports = {
    db,
    insertHeadline: (h) => insertHeadline.run(h),

    getLatestPerSource: () => db.prepare(`
    SELECT h.*, h.rowid FROM headlines h
    INNER JOIN (
      SELECT source_id, MAX(fetched_at) as max_fetched
      FROM headlines GROUP BY source_id
    ) latest ON h.source_id = latest.source_id AND h.fetched_at = latest.max_fetched
    ORDER BY h.fetched_at DESC
  `).all(),

    getHeadlineById: (id) => db.prepare(`SELECT * FROM headlines WHERE id = ?`).get(id),

    getHistoryBySource: (sourceId, page = 1, limit = 15) => {
        const offset = (page - 1) * limit;
        const rows = db.prepare(`SELECT * FROM headlines WHERE source_id = ? ORDER BY fetched_at DESC LIMIT ? OFFSET ?`).all(sourceId, limit, offset);
        const total = db.prepare(`SELECT COUNT(*) as count FROM headlines WHERE source_id = ?`).get(sourceId).count;
        return { rows, total, page, limit };
    },

    getStats: () => db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM headlines) as total_headlines,
      (SELECT COUNT(DISTINCT source_id) FROM headlines) as active_sources,
      (SELECT COUNT(*) FROM headlines WHERE fetched_at >= datetime('now', '-1 hour')) as last_hour,
      (SELECT fetched_at FROM headlines ORDER BY fetched_at DESC LIMIT 1) as last_fetch
  `).get(),

    logFetch: (sourceId, status, message) => logFetch.run(sourceId, status, message),
    
    cleanupOldHeadlines: (days = 30) => {
        const result = db.prepare(`DELETE FROM headlines WHERE fetched_at < datetime('now', '-' || ? || ' days')`).run(days);
        console.log(`[DB] Cleanup complete. Removed ${result.changes} old headlines.`);
        return result.changes;
    },

    insertSuggestedUrl: (url) => {
        return db.prepare(`INSERT INTO suggested_urls (url) VALUES (?)`).run(url);
    },

    getSuggestedUrls: () => {
        return db.prepare(`SELECT * FROM suggested_urls ORDER BY submitted_at DESC`).all();
    },

    deleteSuggestedUrl: (id) => {
        return db.prepare(`DELETE FROM suggested_urls WHERE id = ?`).run(id);
    }
};

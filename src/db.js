const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './data/estate-maintain.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'technician' CHECK(role IN ('admin','manager','technician')),
    team_id INTEGER REFERENCES teams(id),
    avatar_color TEXT DEFAULT '#4F46E5',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    type TEXT DEFAULT 'estate' CHECK(type IN ('estate','villa','apartment','cottage','commercial','land')),
    notes TEXT,
    team_id INTEGER REFERENCES teams(id),
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    location_description TEXT,
    make TEXT,
    model TEXT,
    serial_number TEXT,
    install_date TEXT,
    warranty_expiry TEXT,
    status TEXT DEFAULT 'operational' CHECK(status IN ('operational','needs_repair','out_of_service','retired')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS work_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    asset_id INTEGER REFERENCES assets(id),
    assigned_to INTEGER REFERENCES users(id),
    assigned_team_id INTEGER REFERENCES teams(id),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
    status TEXT DEFAULT 'open' CHECK(status IN ('open','in_progress','on_hold','completed','cancelled')),
    category TEXT,
    due_date TEXT,
    completed_at DATETIME,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS work_order_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    comment TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS preventive_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    property_id INTEGER NOT NULL REFERENCES properties(id),
    asset_id INTEGER REFERENCES assets(id),
    assigned_team_id INTEGER REFERENCES teams(id),
    frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','biweekly','monthly','quarterly','semiannual','annual')),
    last_completed DATETIME,
    next_due TEXT,
    category TEXT,
    priority TEXT DEFAULT 'medium',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT,
    category TEXT,
    quantity INTEGER DEFAULT 0,
    min_quantity INTEGER DEFAULT 0,
    unit_cost REAL DEFAULT 0,
    location TEXT,
    property_id INTEGER REFERENCES properties(id),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

function logActivity(entityType, entityId, action, details, userId) {
  const stmt = db.prepare(
    'INSERT INTO activity_log (entity_type, entity_id, action, details, user_id) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(entityType, entityId, action, details || null, userId || null);
}

module.exports = { db, logActivity };

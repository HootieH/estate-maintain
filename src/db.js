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
    year_built INTEGER,
    square_footage INTEGER,
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

  CREATE TABLE IF NOT EXISTS work_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    property_id INTEGER REFERENCES properties(id),
    location TEXT,
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
    requester_name TEXT NOT NULL,
    requester_email TEXT,
    requester_phone TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),
    approved_by INTEGER REFERENCES users(id),
    work_order_id INTEGER REFERENCES work_orders(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

  CREATE TABLE IF NOT EXISTS procedures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    is_template INTEGER DEFAULT 1,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS procedure_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    procedure_id INTEGER NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    step_type TEXT NOT NULL CHECK(step_type IN ('checkbox','text_input','number_input','pass_fail')),
    is_required INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS work_order_procedures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    procedure_id INTEGER NOT NULL REFERENCES procedures(id),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed')),
    started_at DATETIME,
    completed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS procedure_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_procedure_id INTEGER NOT NULL REFERENCES work_order_procedures(id) ON DELETE CASCADE,
    procedure_step_id INTEGER NOT NULL REFERENCES procedure_steps(id),
    value TEXT,
    completed_by INTEGER REFERENCES users(id),
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    channel_type TEXT NOT NULL CHECK(channel_type IN ('direct','team','work_order')),
    channel_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS message_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS time_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    hours REAL NOT NULL,
    description TEXT,
    logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK(type IN ('assignment','status_change','comment','due_soon','overdue','request','pm_due')),
    title TEXT NOT NULL,
    message TEXT,
    entity_type TEXT,
    entity_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    parent_location_id INTEGER REFERENCES locations(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL CHECK(unit IN ('hours','miles','km','cycles','gallons','liters','kwh')),
    current_reading REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS meter_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_id INTEGER NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    value REAL NOT NULL,
    recorded_by INTEGER REFERENCES users(id),
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS meter_triggers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meter_id INTEGER NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    preventive_schedule_id INTEGER REFERENCES preventive_schedules(id),
    trigger_every REAL NOT NULL,
    last_triggered_value REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    specialty TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    property_id INTEGER REFERENCES properties(id),
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','received','cancelled')),
    total_cost REAL DEFAULT 0,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    part_id INTEGER REFERENCES parts(id),
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_cost REAL NOT NULL DEFAULT 0,
    received_quantity INTEGER DEFAULT 0
  );
`);

// Migrations for existing databases
try {
  db.prepare("SELECT year_built FROM properties LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE properties ADD COLUMN year_built INTEGER");
  db.exec("ALTER TABLE properties ADD COLUMN square_footage INTEGER");
}

try {
  db.prepare("SELECT estimated_hours FROM work_orders LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE work_orders ADD COLUMN estimated_hours REAL");
  db.exec("ALTER TABLE work_orders ADD COLUMN actual_cost REAL");
}

try {
  db.prepare("SELECT location_id FROM assets LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE assets ADD COLUMN location_id INTEGER REFERENCES locations(id)");
}

try {
  db.prepare("SELECT onboarding_completed FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0");
}

function logActivity(entityType, entityId, action, details, userId) {
  const stmt = db.prepare(
    'INSERT INTO activity_log (entity_type, entity_id, action, details, user_id) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(entityType, entityId, action, details || null, userId || null);
}

function createNotification(userId, type, title, message, entityType, entityId) {
  const stmt = db.prepare(
    'INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run(userId, type, title, message || null, entityType || null, entityId || null);
}

module.exports = { db, logActivity, createNotification };

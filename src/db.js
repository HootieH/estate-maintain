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
    sender_id INTEGER REFERENCES users(id),
    channel_type TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    content TEXT NOT NULL,
    parent_message_id INTEGER REFERENCES messages(id),
    message_type TEXT DEFAULT 'user',
    is_edited INTEGER DEFAULT 0,
    edited_at DATETIME,
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
    type TEXT NOT NULL CHECK(type IN ('assignment','status_change','comment','due_soon','overdue','request','pm_due','mention')),
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

  CREATE TABLE IF NOT EXISTS work_order_parts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    part_id INTEGER NOT NULL REFERENCES parts(id),
    quantity_used REAL NOT NULL DEFAULT 1,
    unit_cost REAL DEFAULT 0,
    added_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS asset_downtime (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    reason TEXT,
    category TEXT CHECK(category IN ('breakdown','planned','external','other')),
    work_order_id INTEGER REFERENCES work_orders(id),
    reported_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#6B7280',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS entity_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tag_id, entity_type, entity_id)
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, entity_type, entity_id)
  );

  CREATE TABLE IF NOT EXISTS saved_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    filters TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS work_order_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    property_id INTEGER REFERENCES properties(id),
    asset_id INTEGER REFERENCES assets(id),
    priority TEXT DEFAULT 'medium',
    category TEXT,
    assigned_to INTEGER REFERENCES users(id),
    assigned_team_id INTEGER REFERENCES teams(id),
    estimated_hours REAL,
    procedure_id INTEGER REFERENCES procedures(id),
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS recurring_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES work_order_templates(id) ON DELETE CASCADE,
    frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','biweekly','monthly','quarterly','semiannual','annual')),
    next_due TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'light' CHECK(theme IN ('light','dark','auto')),
    notifications_enabled INTEGER DEFAULT 1,
    email_notifications INTEGER DEFAULT 0,
    default_property_id INTEGER REFERENCES properties(id),
    sidebar_collapsed INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS gl_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    account_number TEXT,
    qbo_account_id TEXT,
    account_type TEXT DEFAULT 'expense' CHECK(account_type IN ('expense','cogs','asset','liability')),
    category TEXT,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT,
    purchase_order_id INTEGER REFERENCES purchase_orders(id),
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    invoice_date TEXT,
    due_date TEXT,
    subtotal REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    total_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','matched','approved','sent_to_billcom','processing','paid','void')),
    matched_discrepancy REAL,
    notes TEXT,
    billcom_bill_id TEXT,
    qbo_bill_id TEXT,
    approved_by INTEGER REFERENCES users(id),
    approved_at DATETIME,
    paid_at DATETIME,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoice_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    purchase_order_item_id INTEGER REFERENCES purchase_order_items(id),
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_cost REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    gl_account_id INTEGER REFERENCES gl_accounts(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS integration_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL CHECK(provider IN ('billcom','quickbooks')),
    config_key TEXT NOT NULL,
    config_value TEXT,
    is_secret INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, config_key)
  );

  CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    external_id TEXT,
    direction TEXT CHECK(direction IN ('push','pull')),
    status TEXT CHECK(status IN ('success','error','pending')),
    details TEXT,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    scope_of_work TEXT,
    property_id INTEGER REFERENCES properties(id),
    category TEXT,
    budget_min REAL,
    budget_max REAL,
    deadline TEXT,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','bidding','evaluating','awarded','in_progress','completed','cancelled')),
    awarded_bid_id INTEGER,
    purchase_order_id INTEGER REFERENCES purchase_orders(id),
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_passkeys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT UNIQUE NOT NULL,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    device_type TEXT,
    backed_up INTEGER DEFAULT 0,
    transports TEXT,
    name TEXT DEFAULT 'Passkey',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft','submitted','under_review','selected','rejected','withdrawn')),
    total_amount REAL NOT NULL DEFAULT 0,
    timeline_days INTEGER,
    start_date TEXT,
    completion_date TEXT,
    warranty_terms TEXT,
    payment_terms TEXT,
    inclusions TEXT,
    exclusions TEXT,
    notes TEXT,
    score REAL,
    submitted_at DATETIME,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Permissions system
  CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT,
    UNIQUE(resource, action)
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK(role IN ('admin','manager','technician')),
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE(role, permission_id)
  );

  CREATE TABLE IF NOT EXISTS user_permission_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    grant_type TEXT NOT NULL CHECK(grant_type IN ('grant','revoke')),
    granted_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, permission_id)
  );

  CREATE TABLE IF NOT EXISTS role_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_system INTEGER DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS role_template_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL REFERENCES role_templates(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    UNIQUE(template_id, permission_id)
  );

  CREATE TABLE IF NOT EXISTS user_property_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, property_id)
  );

  CREATE TABLE IF NOT EXISTS invite_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    role TEXT DEFAULT 'technician' CHECK(role IN ('admin','manager','technician')),
    team_id INTEGER REFERENCES teams(id),
    invited_by INTEGER NOT NULL REFERENCES users(id),
    expires_at DATETIME NOT NULL,
    accepted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK(method IN ('password','passkey')),
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS work_order_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    reviewer_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK(status IN ('pending','approved','rework_requested')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS approval_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('purchase_order','invoice','work_order')),
    condition_field TEXT NOT NULL,
    condition_operator TEXT NOT NULL CHECK(condition_operator IN ('>','>=','<','<=','=')),
    condition_value TEXT NOT NULL,
    required_role TEXT NOT NULL CHECK(required_role IN ('admin','manager')),
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS approval_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER REFERENCES approval_rules(id),
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    requested_by INTEGER NOT NULL REFERENCES users(id),
    assigned_to INTEGER REFERENCES users(id),
    delegated_to INTEGER REFERENCES users(id),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolved_by INTEGER REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS delegations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delegator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delegate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bid_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bid_id INTEGER NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK(category IN ('materials','labor','equipment','permits','subcontractors','overhead','other')),
    description TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit TEXT,
    unit_cost REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    notes TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bid_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bid_id INTEGER NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    comment TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS project_milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    completed_at DATETIME,
    completed_by INTEGER REFERENCES users(id),
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS change_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    amount REAL DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    approved_by INTEGER REFERENCES users(id),
    approved_at DATETIME,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bid_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bid_id INTEGER NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    criterion TEXT NOT NULL,
    score INTEGER NOT NULL CHECK(score >= 1 AND score <= 5),
    notes TEXT,
    scored_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bid_id, criterion, scored_by)
  );

  CREATE TABLE IF NOT EXISTS bid_invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id),
    status TEXT DEFAULT 'invited' CHECK(status IN ('invited','viewed','responded','declined')),
    invited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    responded_at DATETIME,
    UNIQUE(project_id, vendor_id)
  );

  -- Messaging system
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_type TEXT NOT NULL,
    channel_key TEXT NOT NULL,
    name TEXT,
    created_by INTEGER REFERENCES users(id),
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel_type, channel_key)
  );

  CREATE TABLE IF NOT EXISTS channel_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_starred INTEGER DEFAULT 0,
    muted INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS message_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(message_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS message_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id, reaction)
  );

  CREATE TABLE IF NOT EXISTS message_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    data TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pinned_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    pinned_by INTEGER NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(channel_id, message_id)
  );

  CREATE TABLE IF NOT EXISTS user_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, team_id)
  );

  CREATE TABLE IF NOT EXISTS location_procedures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    procedure_id INTEGER NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(location_id, procedure_id)
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

// Wave 2 migrations
try {
  db.prepare("SELECT signed_off_by FROM work_orders LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE work_orders ADD COLUMN signed_off_by INTEGER REFERENCES users(id)");
  db.exec("ALTER TABLE work_orders ADD COLUMN signed_off_at DATETIME");
  db.exec("ALTER TABLE work_orders ADD COLUMN template_id INTEGER REFERENCES work_order_templates(id)");
}

try {
  db.prepare("SELECT parent_asset_id FROM assets LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE assets ADD COLUMN parent_asset_id INTEGER REFERENCES assets(id)");
  db.exec("ALTER TABLE assets ADD COLUMN criticality TEXT DEFAULT 'medium' CHECK(criticality IN ('critical','high','medium','low'))");
  db.exec("ALTER TABLE assets ADD COLUMN purchase_date TEXT");
  db.exec("ALTER TABLE assets ADD COLUMN replacement_cost REAL");
}

try {
  db.prepare("SELECT preferred_vendor_id FROM parts LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE parts ADD COLUMN preferred_vendor_id INTEGER REFERENCES vendors(id)");
  db.exec("ALTER TABLE parts ADD COLUMN reorder_point INTEGER DEFAULT 0");
}

try {
  db.prepare("SELECT estimated_cost FROM preventive_schedules LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE preventive_schedules ADD COLUMN estimated_cost REAL");
  db.exec("ALTER TABLE preventive_schedules ADD COLUMN assigned_to INTEGER REFERENCES users(id)");
}

try {
  db.prepare("SELECT procedure_id FROM preventive_schedules LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE preventive_schedules ADD COLUMN procedure_id INTEGER REFERENCES procedures(id)");
}

try {
  db.prepare("SELECT description FROM procedure_steps LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE procedure_steps ADD COLUMN description TEXT");
}

try {
  db.prepare("SELECT last_login_at FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN last_login_at DATETIME");
}

try {
  db.prepare("SELECT billcom_vendor_id FROM vendors LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE vendors ADD COLUMN billcom_vendor_id TEXT");
  db.exec("ALTER TABLE vendors ADD COLUMN qbo_vendor_id TEXT");
}

try {
  db.prepare("SELECT invoice_status FROM purchase_orders LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE purchase_orders ADD COLUMN invoice_status TEXT");
  db.exec("ALTER TABLE purchase_orders ADD COLUMN payment_status TEXT");
}

try {
  db.prepare("SELECT qbo_class_id FROM properties LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE properties ADD COLUMN qbo_class_id TEXT");
}

// User management migrations
try {
  db.prepare("SELECT status FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active' CHECK(status IN ('invited','active','suspended','deactivated'))");
  db.exec("ALTER TABLE users ADD COLUMN force_password_reset INTEGER DEFAULT 0");
  db.exec("ALTER TABLE users ADD COLUMN is_team_lead INTEGER DEFAULT 0");
  // Sync status with existing is_active column
  db.exec("UPDATE users SET status = 'active' WHERE is_active = 1");
  db.exec("UPDATE users SET status = 'deactivated' WHERE is_active = 0");
}

// Migrate users.team_id data into user_teams junction table
try {
  db.exec("CREATE TABLE IF NOT EXISTS user_teams (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, team_id))");
  db.exec("INSERT OR IGNORE INTO user_teams (user_id, team_id) SELECT id, team_id FROM users WHERE team_id IS NOT NULL");
} catch (e) {
  // user_teams already populated or no data to migrate
}

// Owner flag migration
try {
  db.prepare("SELECT is_owner FROM users LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE users ADD COLUMN is_owner INTEGER DEFAULT 0");
}

// Property-scoped invites migration
try {
  db.prepare("SELECT property_ids FROM invite_tokens LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE invite_tokens ADD COLUMN property_ids TEXT");
}

// Messaging migrations
try {
  db.prepare("SELECT parent_message_id FROM messages LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE messages ADD COLUMN parent_message_id INTEGER REFERENCES messages(id)");
  db.exec("ALTER TABLE messages ADD COLUMN message_type TEXT DEFAULT 'user'");
  db.exec("ALTER TABLE messages ADD COLUMN is_edited INTEGER DEFAULT 0");
  db.exec("ALTER TABLE messages ADD COLUMN edited_at DATETIME");
}

// Widen messages.channel_type CHECK and make sender_id nullable for system messages
try {
  // Test if the old CHECK constraint exists by inserting a property-type message
  db.exec(`INSERT INTO messages (sender_id, channel_type, channel_id, content) VALUES (NULL, 'property', '__migration_test__', '__test__')`);
  db.exec(`DELETE FROM messages WHERE channel_id = '__migration_test__'`);
} catch (e) {
  // Old CHECK constraint still active — recreate table without it
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER REFERENCES users(id),
      channel_type TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      content TEXT NOT NULL,
      parent_message_id INTEGER REFERENCES messages_new(id),
      message_type TEXT DEFAULT 'user',
      is_edited INTEGER DEFAULT 0,
      edited_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO messages_new SELECT id, sender_id, channel_type, channel_id, content, parent_message_id, message_type, is_edited, edited_at, created_at FROM messages;
    DROP TABLE messages;
    ALTER TABLE messages_new RENAME TO messages;
  `);
}

// Widen notifications.type CHECK to include 'mention'
try {
  db.exec(`INSERT INTO notifications (user_id, type, title) VALUES (0, 'mention', '__migration_test__')`);
  db.exec(`DELETE FROM notifications WHERE title = '__migration_test__'`);
} catch (e) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL CHECK(type IN ('assignment','status_change','comment','due_soon','overdue','request','pm_due','mention')),
      title TEXT NOT NULL,
      message TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO notifications_new SELECT * FROM notifications;
    DROP TABLE notifications;
    ALTER TABLE notifications_new RENAME TO notifications;
  `);
}

// Project/bidding migrations
try {
  db.prepare("SELECT bid_deadline FROM projects LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE projects ADD COLUMN bid_deadline TEXT");
  db.exec("ALTER TABLE projects ADD COLUMN progress INTEGER DEFAULT 0");
}

try {
  db.prepare("SELECT rejection_reason FROM bids LIMIT 1").get();
} catch (e) {
  db.exec("ALTER TABLE bids ADD COLUMN rejection_reason TEXT");
  db.exec("ALTER TABLE bids ADD COLUMN revised_from_id INTEGER REFERENCES bids(id)");
}

// Seed permissions (idempotent)
const permissionDefs = [
  ['workorders', 'view'], ['workorders', 'create'], ['workorders', 'edit'], ['workorders', 'delete'],
  ['workorders', 'assign'], ['workorders', 'sign_off'], ['workorders', 'review'],
  ['properties', 'view'], ['properties', 'create'], ['properties', 'edit'], ['properties', 'delete'],
  ['assets', 'view'], ['assets', 'create'], ['assets', 'edit'], ['assets', 'delete'],
  ['preventive', 'view'], ['preventive', 'create'], ['preventive', 'edit'], ['preventive', 'delete'],
  ['parts', 'view'], ['parts', 'create'], ['parts', 'edit'], ['parts', 'delete'],
  ['teams', 'view'], ['teams', 'create'], ['teams', 'edit'], ['teams', 'delete'], ['teams', 'manage_members'],
  ['vendors', 'view'], ['vendors', 'create'], ['vendors', 'edit'], ['vendors', 'delete'],
  ['purchaseorders', 'view'], ['purchaseorders', 'create'], ['purchaseorders', 'edit'],
  ['purchaseorders', 'delete'], ['purchaseorders', 'approve'],
  ['invoices', 'view'], ['invoices', 'create'], ['invoices', 'edit'],
  ['invoices', 'delete'], ['invoices', 'approve'], ['invoices', 'send_to_billcom'],
  ['projects', 'view'], ['projects', 'create'], ['projects', 'edit'], ['projects', 'delete'], ['projects', 'award'],
  ['procedures', 'view'], ['procedures', 'create'], ['procedures', 'edit'], ['procedures', 'delete'],
  ['requests', 'view'], ['requests', 'approve'], ['requests', 'decline'],
  ['reports', 'view'], ['reports', 'export'],
  ['users', 'view'], ['users', 'create'], ['users', 'edit'], ['users', 'suspend'],
  ['users', 'deactivate'], ['users', 'force_reset'], ['users', 'manage_permissions'],
  ['settings', 'view'], ['settings', 'edit'],
  ['integrations', 'view'], ['integrations', 'configure'],
  ['messages', 'view'], ['messages', 'send'], ['messages', 'pin'], ['messages', 'announce'],
  ['audit_log', 'view'], ['audit_log', 'export'],
  ['approvals', 'view'], ['approvals', 'manage_rules'], ['approvals', 'delegate'],
];

const insertPerm = db.prepare('INSERT OR IGNORE INTO permissions (resource, action) VALUES (?, ?)');
const insertPermsTx = db.transaction(() => {
  for (const [resource, action] of permissionDefs) {
    insertPerm.run(resource, action);
  }
});
insertPermsTx();

// Seed role-permission mappings (idempotent)
const allPerms = db.prepare('SELECT id, resource, action FROM permissions').all();
const permMap = {};
for (const p of allPerms) permMap[`${p.resource}:${p.action}`] = p.id;

const techPerms = [
  'workorders:view', 'workorders:create', 'workorders:edit',
  'properties:view', 'assets:view', 'preventive:view',
  'parts:view', 'procedures:view',
  'messages:view', 'messages:send',
  'teams:view', 'requests:view',
];

const managerPerms = [
  ...Object.keys(permMap).filter(k =>
    !k.startsWith('users:manage_permissions') && !k.startsWith('users:deactivate') &&
    !k.startsWith('settings:edit') && !k.startsWith('integrations:configure') &&
    !k.startsWith('approvals:manage_rules')
  ),
];

const insertRolePerm = db.prepare('INSERT OR IGNORE INTO role_permissions (role, permission_id) VALUES (?, ?)');
const seedRolePermsTx = db.transaction(() => {
  // Admin gets everything
  for (const p of allPerms) {
    insertRolePerm.run('admin', p.id);
  }
  // Manager
  for (const key of managerPerms) {
    if (permMap[key]) insertRolePerm.run('manager', permMap[key]);
  }
  // Technician
  for (const key of techPerms) {
    if (permMap[key]) insertRolePerm.run('technician', permMap[key]);
  }
});
seedRolePermsTx();

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

/**
 * Ensure a channel exists and has the given members. Returns the channel row.
 */
function ensureChannel(channelType, channelKey, name, memberUserIds, createdBy) {
  let channel = db.prepare('SELECT * FROM channels WHERE channel_type = ? AND channel_key = ?').get(channelType, channelKey);
  if (!channel) {
    const result = db.prepare('INSERT INTO channels (channel_type, channel_key, name, created_by) VALUES (?, ?, ?, ?)')
      .run(channelType, channelKey, name || null, createdBy || null);
    channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid);
  }
  // Add members
  const addMember = db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id) VALUES (?, ?)');
  for (const uid of (memberUserIds || [])) {
    addMember.run(channel.id, uid);
  }
  return channel;
}

/**
 * Post a system message to a channel. Auto-creates the channel if needed.
 */
function postSystemMessage(channelType, channelKey, content, memberUserIds) {
  const channel = ensureChannel(channelType, channelKey, null, memberUserIds || []);
  db.prepare(
    "INSERT INTO messages (sender_id, channel_type, channel_id, content, message_type) VALUES (NULL, ?, ?, ?, 'system')"
  ).run(channelType, channelKey, content);
}

module.exports = { db, logActivity, createNotification, ensureChannel, postSystemMessage };

require('dotenv/config');

const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Database setup (duplicated from src/db.js to keep seed standalone)
// ---------------------------------------------------------------------------
const dbPath = process.env.DB_PATH || './data/estate-maintain.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure schema exists
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

// ---------------------------------------------------------------------------
// Helper — date arithmetic
// ---------------------------------------------------------------------------
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function datetimeAgo(hours) {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

// ---------------------------------------------------------------------------
// Clear existing data (respect FK order)
// ---------------------------------------------------------------------------
console.log('Clearing existing data...');
db.exec(`
  DELETE FROM activity_log;
  DELETE FROM work_order_comments;
  DELETE FROM work_orders;
  DELETE FROM preventive_schedules;
  DELETE FROM parts;
  DELETE FROM assets;
  DELETE FROM properties;
  DELETE FROM users;
  DELETE FROM teams;
`);

// Reset auto-increment counters
db.exec(`
  DELETE FROM sqlite_sequence WHERE name IN (
    'teams','users','properties','assets','work_orders',
    'work_order_comments','preventive_schedules','parts','activity_log'
  );
`);

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
console.log('Seeding teams...');
const insertTeam = db.prepare(
  'INSERT INTO teams (name, description) VALUES (?, ?)'
);

const teams = [
  ['Grounds & Landscaping', 'Exterior maintenance, gardens, pools, and landscaping'],
  ['Interior Maintenance', 'HVAC, plumbing, electrical, and interior upkeep'],
  ['Security & Systems', 'Security systems, automation, cameras, and access control'],
  ['Housekeeping', 'Cleaning, laundry, and household supplies management'],
];

const insertTeams = db.transaction(() => {
  for (const t of teams) insertTeam.run(...t);
});
insertTeams();

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
console.log('Seeding users...');
const hash = bcrypt.hashSync('password123', 10);

const insertUser = db.prepare(
  'INSERT INTO users (email, password_hash, name, role, team_id, avatar_color) VALUES (?, ?, ?, ?, ?, ?)'
);

const users = [
  ['admin@estate.com',   hash, 'James Harrington', 'admin',      null, '#4F46E5'],
  ['manager@estate.com', hash, 'Sarah Mitchell',   'manager',    null, '#7C3AED'],
  ['tom@estate.com',     hash, 'Tom Richards',     'technician', 1,    '#059669'],
  ['maria@estate.com',   hash, 'Maria Santos',     'technician', 2,    '#DC2626'],
  ['dave@estate.com',    hash, 'Dave Wilson',       'technician', 2,    '#D97706'],
  ['alex@estate.com',    hash, 'Alex Chen',         'technician', 3,    '#2563EB'],
  ['emma@estate.com',    hash, 'Emma Thompson',     'technician', 4,    '#EC4899'],
  ['robert@estate.com',  hash, 'Robert Blake',      'manager',    1,    '#0D9488'],
];

const insertUsers = db.transaction(() => {
  for (const u of users) insertUser.run(...u);
});
insertUsers();

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------
console.log('Seeding properties...');
const insertProperty = db.prepare(
  'INSERT INTO properties (name, address, type, team_id, notes) VALUES (?, ?, ?, ?, ?)'
);

const properties = [
  ['Harrington Manor', '1 Manor Drive, Hampshire, SO21 1DB', 'estate', 1,
    'Principal residence. Georgian manor house, 12 bedrooms, extensive grounds including formal gardens, stables, and lake.'],
  ['Chelsea Townhouse', '42 Cadogan Place, London, SW1X 9RX', 'villa', 2,
    'London residence. 4-storey Victorian townhouse, 6 bedrooms.'],
  ['Lake Cottage', 'The Boathouse, Lake Windermere, LA23 1LJ', 'cottage', 1,
    'Weekend retreat. 3-bedroom lakeside cottage with private dock.'],
  ['Kensington Apartments', '15-17 Kensington Court, London, W8 5DL', 'apartment', 4,
    'Investment property. 4 luxury apartments, fully managed.'],
  ['Vineyard Estate', 'Domaine de la Colline, Provence, 84220', 'estate', 1,
    'French country estate with working vineyard. 8 bedrooms, wine cellar, pool house.'],
];

const insertProperties = db.transaction(() => {
  for (const p of properties) insertProperty.run(...p);
});
insertProperties();

// Property IDs
const MANOR = 1;
const CHELSEA = 2;
const COTTAGE = 3;
const KENSINGTON = 4;
const VINEYARD = 5;

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
console.log('Seeding assets...');
const insertAsset = db.prepare(
  `INSERT INTO assets (name, category, property_id, location_description, status, install_date, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const assets = [
  // Manor (1-7)
  ['HVAC Central System',      'HVAC',             MANOR,     'Main plant room, east wing basement',   'operational',  '2019-06-15', 'Daikin VRV system serving main house'],
  ['Swimming Pool',            'Pools',            MANOR,     'South garden, behind the orangery',     'operational',  '2015-04-01', '25m heated outdoor pool with automatic cover'],
  ['Backup Generator',         'Electrical',       MANOR,     'Utility compound, north side',          'operational',  '2020-11-20', 'Caterpillar 100kW diesel generator'],
  ['Stable Block Roof',        'Structural',       MANOR,     'Stable block, west courtyard',          'needs_repair', '1985-01-01', 'Grade II listed slate roof, several cracked tiles'],
  ['Ride-on Mower',            'Grounds Equipment',MANOR,     'Main garage, bay 3',                    'operational',  '2022-03-10', 'John Deere X590, 54in deck'],
  ['Security Gate System',     'Access Control',   MANOR,     'Main entrance and rear service gate',   'operational',  '2021-08-05', 'BFT Giotto 60 automated gates with intercom'],
  ['Wine Cellar Climate Control','HVAC',           MANOR,     'Cellar, main house basement',           'operational',  '2018-02-28', 'EuroCave Inoa system, maintains 12-14C'],

  // Chelsea (8-11)
  ['Boiler System',            'HVAC',             CHELSEA,   'Basement plant room',                   'needs_repair', '2016-09-10', 'Vaillant ecoTEC plus 938, intermittent pressure loss'],
  ['Elevator',                 'Mechanical',       CHELSEA,   'Central shaft, all floors',             'operational',  '2017-05-22', 'Stannah passenger lift, 4 person capacity'],
  ['Roof Terrace Drainage',    'Plumbing',         CHELSEA,   'Fourth floor roof terrace',             'operational',  '2019-11-15', 'ACO channel drainage with leaf guards'],
  ['Smart Home Hub',           'Automation',       CHELSEA,   'Ground floor utility cupboard',         'operational',  '2023-01-08', 'Control4 EA-5 with lighting, blinds, HVAC integration'],

  // Lake Cottage (12-15)
  ['Wood Burning Stove',       'Heating',          COTTAGE,   'Main living room',                      'operational',  '2020-10-05', 'Charnwood Island II, DEFRA approved'],
  ['Dock & Moorings',          'Marine',           COTTAGE,   'Lake frontage, private dock',           'needs_repair', '2010-06-01', 'Timber dock, 2 mooring points — boards rotting in places'],
  ['Septic System',            'Plumbing',         COTTAGE,   'Rear garden, north corner',             'operational',  '2018-07-20', 'Klargester BioDisc, 6-person capacity'],
  ['Hot Tub',                  'Pools',            COTTAGE,   'Rear deck',                             'out_of_service','2021-04-15', 'Jacuzzi J-335, pump motor failed'],

  // Kensington (16-18)
  ['Communal Boiler',          'HVAC',             KENSINGTON,'Basement plant room',                   'operational',  '2020-01-15', 'Potterton Paramount 115 commercial boiler'],
  ['Entry Intercom System',    'Security',         KENSINGTON,'Main entrance lobby',                   'operational',  '2019-08-30', 'Comelit 4-unit video intercom system'],
  ['Flat 2 Kitchen Units',     'Fixtures',         KENSINGTON,'Flat 2, first floor',                   'needs_repair', '2017-03-20', 'Hinge failures on multiple cabinet doors, worktop chipped'],

  // Vineyard (19-22)
  ['Irrigation System',        'Grounds',          VINEYARD,  'Vineyard terraces and formal garden',   'operational',  '2019-05-10', 'Hunter Pro-C drip irrigation, 12 zones'],
  ['Pool Filtration',          'Pools',            VINEYARD,  'Pool plant room, rear of pool house',   'operational',  '2020-07-01', 'Pentair sand filter with salt chlorinator'],
  ['Solar Panel Array',        'Electrical',       VINEYARD,  'South-facing barn roof',                'operational',  '2021-09-15', '48-panel array, 18kW peak output'],
  ['Wine Press',               'Equipment',        VINEYARD,  'Winery building, ground floor',         'operational',  '2016-08-20', 'Zambelli horizontal press, 20hl capacity'],
];

const insertAssets = db.transaction(() => {
  for (const a of assets) insertAsset.run(...a);
});
insertAssets();

// ---------------------------------------------------------------------------
// User / team quick-reference IDs
// ---------------------------------------------------------------------------
const ADMIN = 1;
const MANAGER = 2;
const TOM = 3;
const MARIA = 4;
const DAVE = 5;
const ALEX = 6;
const EMMA = 7;
// const ROBERT = 8;

const TEAM_GROUNDS = 1;
const TEAM_INTERIOR = 2;
const TEAM_SECURITY = 3;
const TEAM_HOUSEKEEPING = 4;

// ---------------------------------------------------------------------------
// Work Orders
// ---------------------------------------------------------------------------
console.log('Seeding work orders...');
const insertWO = db.prepare(
  `INSERT INTO work_orders
    (title, description, property_id, asset_id, assigned_to, assigned_team_id,
     priority, status, category, due_date, completed_at, created_by, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const workOrders = [
  // 1 — Stable roof (critical, open, overdue)
  ['Repair stable block roof tiles',
   'Multiple cracked and slipped slate tiles on the stable block. Water ingress reported during last storm. Listed building consent may be required for repairs.',
   MANOR, 4, TOM, TEAM_GROUNDS, 'critical', 'open', 'Structural',
   daysFromNow(-5), null, ADMIN, datetimeAgo(72)],

  // 2 — Boiler service (high, in_progress)
  ['Annual boiler service - Chelsea',
   'Annual service and safety inspection for the Vaillant boiler. Investigate intermittent pressure loss reported by housekeeper.',
   CHELSEA, 8, MARIA, TEAM_INTERIOR, 'high', 'in_progress', 'HVAC',
   daysFromNow(3), null, MANAGER, datetimeAgo(96)],

  // 3 — Hot tub motor (medium, on_hold)
  ['Hot tub motor replacement',
   'Pump motor has failed — unit completely non-functional. Replacement Jacuzzi OEM motor on order from distributor (ETA 2 weeks).',
   COTTAGE, 15, null, TEAM_INTERIOR, 'medium', 'on_hold', 'Mechanical',
   daysFromNow(14), null, MANAGER, datetimeAgo(168)],

  // 4 — Dock repairs (high, open)
  ['Dock repairs before summer',
   'Rotting deck boards and corroded mooring hardware need replacement before the season. Source marine-grade hardwood and stainless fittings.',
   COTTAGE, 13, TOM, TEAM_GROUNDS, 'high', 'open', 'Marine',
   daysFromNow(21), null, ADMIN, datetimeAgo(48)],

  // 5 — Flat 2 kitchen (medium, in_progress)
  ['Flat 2 kitchen refit',
   'Replace damaged cabinet hinges, repair chipped worktop, and re-seal sink area. Coordinate access with tenant.',
   KENSINGTON, 18, DAVE, TEAM_INTERIOR, 'medium', 'in_progress', 'Fixtures',
   daysFromNow(10), null, MANAGER, datetimeAgo(120)],

  // 6 — Security camera update (low, completed)
  ['Security camera firmware update',
   'Apply latest firmware to all 12 cameras. Update NVR software. Verify night-vision and motion detection post-update.',
   MANOR, 6, ALEX, TEAM_SECURITY, 'low', 'completed', 'Security',
   daysFromNow(-10), datetimeAgo(48), ADMIN, datetimeAgo(240)],

  // 7 — Pool chemicals (medium, open)
  ['Swimming pool chemical balance',
   'Weekly test showed pH drift and low chlorine. Adjust chemical dosing and check auto-chlorinator tablet levels.',
   MANOR, 2, TOM, TEAM_GROUNDS, 'medium', 'open', 'Pools',
   daysFromNow(1), null, MANAGER, datetimeAgo(24)],

  // 8 — Wine cellar alarm (high, open)
  ['Wine cellar humidity alarm',
   'Climate control flagged humidity at 82% — target is 65-75%. Check EuroCave condenser and drainage. Collection at risk.',
   MANOR, 7, MARIA, TEAM_INTERIOR, 'high', 'open', 'HVAC',
   daysFromNow(0), null, ADMIN, datetimeAgo(6)],

  // 9 — Elevator inspection (high, open, unassigned)
  ['Elevator annual inspection',
   'Statutory annual LOLER inspection due. Book with approved lift engineer. Ensure access to motor room on roof.',
   CHELSEA, 9, null, TEAM_INTERIOR, 'high', 'open', 'Mechanical',
   daysFromNow(7), null, ADMIN, datetimeAgo(36)],

  // 10 — Irrigation timer (medium, open)
  ['Garden irrigation timer replacement',
   'Zone 4 and Zone 7 timers failing to trigger. Replace Hunter Pro-C timer modules.',
   VINEYARD, 19, TOM, TEAM_GROUNDS, 'medium', 'open', 'Grounds',
   daysFromNow(14), null, MANAGER, datetimeAgo(60)],

  // 11 — Solar panel cleaning (low, open)
  ['Solar panel cleaning',
   'Annual clean for the 48-panel array. Output has dropped ~8% vs last quarter — likely dust and bird droppings.',
   VINEYARD, 21, null, TEAM_GROUNDS, 'low', 'open', 'Electrical',
   daysFromNow(30), null, MANAGER, datetimeAgo(48)],

  // 12 — Intercom replacement (medium, open)
  ['Replace entry intercom unit 3',
   'Flat 3 intercom handset has no audio on door release. Replacement Comelit handset in stock.',
   KENSINGTON, 17, ALEX, TEAM_SECURITY, 'medium', 'open', 'Security',
   daysFromNow(5), null, MANAGER, datetimeAgo(72)],

  // 13 — Deep clean (medium, completed)
  ['Deep clean - all Kensington flats',
   'Quarterly deep clean of all 4 apartments including carpets, windows, and kitchen appliances.',
   KENSINGTON, null, EMMA, TEAM_HOUSEKEEPING, 'medium', 'completed', 'Cleaning',
   daysFromNow(-14), datetimeAgo(336), MANAGER, datetimeAgo(504)],

  // 14 — Repaint shutters (low, open)
  ['Repaint exterior shutters',
   'Provencal Blue paint peeling on south-facing shutters. Sand, prime, and repaint all 14 window shutters.',
   VINEYARD, null, null, TEAM_GROUNDS, 'low', 'open', 'Paint',
   daysFromNow(45), null, ADMIN, datetimeAgo(120)],

  // 15 — HVAC filters (medium, completed)
  ['HVAC filter replacement - Manor',
   'Replace all VRV system air filters in main house. 14 wall units plus 3 ducted units in the east wing.',
   MANOR, 1, MARIA, TEAM_INTERIOR, 'medium', 'completed', 'HVAC',
   daysFromNow(-20), datetimeAgo(480), ADMIN, datetimeAgo(720)],
];

const insertWorkOrders = db.transaction(() => {
  for (const wo of workOrders) insertWO.run(...wo);
});
insertWorkOrders();

// ---------------------------------------------------------------------------
// Work Order Comments
// ---------------------------------------------------------------------------
console.log('Seeding work order comments...');
const insertComment = db.prepare(
  'INSERT INTO work_order_comments (work_order_id, user_id, comment, created_at) VALUES (?, ?, ?, ?)'
);

const comments = [
  // WO 1 — Stable roof
  [1, TOM,     'Inspected the roof this morning. Count 23 cracked tiles on the south face alone. We\'ll need scaffolding for safe access.', datetimeAgo(60)],
  [1, ADMIN,   'I\'ve contacted the listed buildings officer. They confirmed like-for-like slate replacement doesn\'t need consent. Go ahead and get scaffolding quotes.', datetimeAgo(48)],
  [1, TOM,     'Scaffolding quote from Henderson\'s: 2,400 for 2-week hire. Slate supplier can deliver 50 Penrhyn slates by Friday.', datetimeAgo(24)],

  // WO 2 — Boiler service
  [2, MARIA,   'Pressure dropping from 1.5 to 0.8 bar overnight. I suspect the expansion vessel diaphragm. Will test tomorrow.', datetimeAgo(72)],
  [2, MANAGER, 'If it\'s the expansion vessel, do we have one in stock? Otherwise order express — we can\'t leave Chelsea without heating for long.', datetimeAgo(60)],

  // WO 3 — Hot tub
  [3, DAVE,    'Motor ordered from Jacuzzi UK — part number 6500-352. Expected delivery 12th. Will need two people for the swap.', datetimeAgo(120)],

  // WO 5 — Kitchen refit
  [5, DAVE,    'Tenant confirmed access on Tuesday and Thursday mornings. Starting with hinge replacements.', datetimeAgo(96)],
  [5, MANAGER, 'Get a quote for a full worktop replacement while you\'re there — the chip is near the sink and could get worse.', datetimeAgo(84)],

  // WO 8 — Wine cellar
  [8, MARIA,   'On my way now. Could be a blocked condensate drain — happened before in 2023.', datetimeAgo(4)],
  [8, ADMIN,   'Please treat this as urgent — there are several cases of \'89 Petrus in that cellar.', datetimeAgo(5)],
];

const insertComments = db.transaction(() => {
  for (const c of comments) insertComment.run(...c);
});
insertComments();

// ---------------------------------------------------------------------------
// Preventive Maintenance Schedules
// ---------------------------------------------------------------------------
console.log('Seeding preventive maintenance schedules...');
const insertPM = db.prepare(
  `INSERT INTO preventive_schedules
    (title, description, property_id, asset_id, assigned_team_id, frequency,
     next_due, category, priority, is_active)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const schedules = [
  ['Pool chemical testing',
   'Test pH, chlorine, alkalinity, and calcium hardness. Adjust dosing as required.',
   MANOR, 2, TEAM_GROUNDS, 'weekly', daysFromNow(2), 'Pools', 'medium', 1],

  ['HVAC filter inspection',
   'Inspect all VRV unit filters for dust accumulation. Clean or replace as needed.',
   MANOR, 1, TEAM_INTERIOR, 'monthly', daysFromNow(12), 'HVAC', 'medium', 1],

  ['Generator load test',
   'Run backup generator under load for 30 minutes. Check fuel, oil, and coolant levels.',
   MANOR, 3, TEAM_SECURITY, 'quarterly', daysFromNow(-3), 'Electrical', 'high', 1],

  ['Elevator safety inspection',
   'LOLER-compliant thorough examination by approved engineer.',
   CHELSEA, 9, TEAM_INTERIOR, 'annual', daysFromNow(60), 'Mechanical', 'high', 1],

  ['Boiler service',
   'Full annual service including flue gas analysis and safety checks.',
   CHELSEA, 8, TEAM_INTERIOR, 'annual', daysFromNow(3), 'HVAC', 'high', 1],

  ['Septic tank pump-out',
   'Full de-sludge of septic tank by approved waste carrier.',
   COTTAGE, 14, TEAM_INTERIOR, 'annual', daysFromNow(90), 'Plumbing', 'medium', 1],

  ['Irrigation system winterization',
   'Drain all lines, blow out with compressed air, shut off supply valves.',
   VINEYARD, 19, TEAM_GROUNDS, 'annual', daysFromNow(180), 'Grounds', 'medium', 1],

  ['Solar panel cleaning',
   'Clean all 48 panels with deionized water. Inspect mounting brackets and wiring.',
   VINEYARD, 21, TEAM_GROUNDS, 'semiannual', daysFromNow(30), 'Electrical', 'low', 1],

  ['Security system check',
   'Test all cameras, motion sensors, gate automation, and intercom. Verify recording storage.',
   MANOR, 6, TEAM_SECURITY, 'monthly', daysFromNow(-1), 'Security', 'high', 1],

  ['Deep clean rotation',
   'Full deep clean of one apartment per cycle. Rotate through flats 1-4.',
   KENSINGTON, null, TEAM_HOUSEKEEPING, 'biweekly', daysFromNow(5), 'Cleaning', 'medium', 1],

  ['Pool filter backwash',
   'Backwash sand filter and check salt chlorinator cell. Log filter pressure readings.',
   VINEYARD, 20, TEAM_GROUNDS, 'biweekly', daysFromNow(-2), 'Pools', 'medium', 1],

  ['Wine cellar climate calibration',
   'Calibrate temperature and humidity sensors. Verify condenser operation and refrigerant levels.',
   MANOR, 7, TEAM_INTERIOR, 'quarterly', daysFromNow(45), 'HVAC', 'medium', 1],
];

const insertSchedules = db.transaction(() => {
  for (const s of schedules) insertPM.run(...s);
});
insertSchedules();

// ---------------------------------------------------------------------------
// Parts Inventory
// ---------------------------------------------------------------------------
console.log('Seeding parts inventory...');
const insertPart = db.prepare(
  `INSERT INTO parts (name, sku, category, quantity, min_quantity, unit_cost, location, property_id, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const parts = [
  ['HVAC Air Filters (20x25)',      'HVF-2025',  'Filters',    12, 5,   24.99,  'Manor stores',           MANOR,     null],
  ['Pool Chlorine Tabs 3in',        'PCL-300',   'Chemicals',   3, 10,  89.99,  'Manor pool house',       MANOR,     'LOW STOCK — order placed'],
  ['Boiler Pressure Relief Valve',  'BPR-100',   'Plumbing',    2, 1,  145.00,  'Chelsea basement',       CHELSEA,   null],
  ['Smart Lock Batteries CR123A',   'BAT-CR123', 'Electrical',  24, 10,  3.99,  'Manor security office',  MANOR,     null],
  ['Elevator Cable Set',            'ELC-500',   'Mechanical',   1, 1, 2400.00, 'Chelsea basement',       CHELSEA,   null],
  ['Ride-on Mower Blades',          'MBL-42',    'Grounds',      2, 2,   67.50, 'Manor garage',           MANOR,     null],
  ['Irrigation Drip Heads',         'IRG-DH50',  'Grounds',      8, 20,   4.25, 'Vineyard shed',          VINEYARD,  'LOW STOCK — need bulk reorder'],
  ['Wine Press Gaskets',            'WPG-12',    'Equipment',    6, 4,   32.00, 'Vineyard cellar',        VINEYARD,  null],
  ['Hot Tub Pump Motor',            'HTP-750',   'Mechanical',   0, 1,  485.00, 'On order',               COTTAGE,   'LOW STOCK — on order, ETA 2 weeks'],
  ['Exterior Paint - Provencal Blue','PNT-PB5L', 'Paint',        4, 2,   65.00, 'Vineyard shed',          VINEYARD,  null],
  ['Security Camera (4K)',          'CAM-4K',    'Security',     2, 1,  299.00, 'Manor security office',  MANOR,     null],
  ['Intercom Handset Unit',         'INT-HS3',   'Security',     1, 2,  175.00, 'Kensington store',       KENSINGTON,'LOW STOCK'],
  ['Septic Treatment Bio-Tabs',     'SEP-BT12',  'Chemicals',    8, 6,   42.00, 'Cottage utility room',   COTTAGE,   null],
  ['Solar Panel Cleaner 5L',        'SPC-5L',    'Chemicals',    2, 2,   38.00, 'Vineyard shed',          VINEYARD,  null],
  ['Door Hinge Set (Brass)',        'DHG-BR6',   'Hardware',    15, 5,   18.50, 'Manor stores',           MANOR,     null],
];

const insertParts = db.transaction(() => {
  for (const p of parts) insertPart.run(...p);
});
insertParts();

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------
console.log('Seeding activity log...');
const insertActivity = db.prepare(
  `INSERT INTO activity_log (entity_type, entity_id, action, details, user_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const activities = [
  ['work_order', 8, 'created',   'Work order created: Wine cellar humidity alarm',                  ADMIN,   datetimeAgo(6)],
  ['work_order', 8, 'commented', 'James Harrington: Please treat this as urgent',                   ADMIN,   datetimeAgo(5)],
  ['work_order', 8, 'commented', 'Maria Santos: On my way now. Could be a blocked condensate drain', MARIA,  datetimeAgo(4)],
  ['work_order', 7, 'created',   'Work order created: Swimming pool chemical balance',              MANAGER, datetimeAgo(24)],
  ['work_order', 1, 'commented', 'Tom Richards: Scaffolding quote from Henderson\'s: 2,400',        TOM,     datetimeAgo(24)],
  ['asset',     15, 'updated',   'Hot Tub status changed from needs_repair to out_of_service',      DAVE,    datetimeAgo(30)],
  ['work_order', 9, 'created',   'Work order created: Elevator annual inspection',                  ADMIN,   datetimeAgo(36)],
  ['work_order', 4, 'created',   'Work order created: Dock repairs before summer',                  ADMIN,   datetimeAgo(48)],
  ['work_order', 6, 'completed', 'Work order completed: Security camera firmware update',           ALEX,    datetimeAgo(48)],
  ['preventive_schedule', 9, 'overdue', 'Security system check is overdue',                         null,    datetimeAgo(24)],
  ['preventive_schedule', 3, 'overdue', 'Generator load test is overdue',                           null,    datetimeAgo(72)],
  ['parts',      2, 'low_stock', 'Pool Chlorine Tabs 3in below minimum (3 of 10)',                  null,    datetimeAgo(12)],
  ['parts',      9, 'low_stock', 'Hot Tub Pump Motor out of stock (0 of 1)',                        null,    datetimeAgo(30)],
  ['work_order', 5, 'commented', 'Dave Wilson: Tenant confirmed access on Tuesday and Thursday',    DAVE,    datetimeAgo(96)],
];

const insertActivities = db.transaction(() => {
  for (const a of activities) insertActivity.run(...a);
});
insertActivities();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const counts = {
  teams:       db.prepare('SELECT COUNT(*) AS c FROM teams').get().c,
  users:       db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
  properties:  db.prepare('SELECT COUNT(*) AS c FROM properties').get().c,
  assets:      db.prepare('SELECT COUNT(*) AS c FROM assets').get().c,
  work_orders: db.prepare('SELECT COUNT(*) AS c FROM work_orders').get().c,
  comments:    db.prepare('SELECT COUNT(*) AS c FROM work_order_comments').get().c,
  schedules:   db.prepare('SELECT COUNT(*) AS c FROM preventive_schedules').get().c,
  parts:       db.prepare('SELECT COUNT(*) AS c FROM parts').get().c,
  activities:  db.prepare('SELECT COUNT(*) AS c FROM activity_log').get().c,
};

console.log('\n========================================');
console.log('  Database seeded successfully!');
console.log('========================================');
console.log(`  Teams:                ${counts.teams}`);
console.log(`  Users:                ${counts.users}`);
console.log(`  Properties:           ${counts.properties}`);
console.log(`  Assets:               ${counts.assets}`);
console.log(`  Work Orders:          ${counts.work_orders}`);
console.log(`  Comments:             ${counts.comments}`);
console.log(`  PM Schedules:         ${counts.schedules}`);
console.log(`  Parts:                ${counts.parts}`);
console.log(`  Activity Log Entries: ${counts.activities}`);
console.log('========================================\n');

console.log('Login credentials (all passwords: "password123"):');
console.log('  admin@estate.com     — Admin (James Harrington)');
console.log('  manager@estate.com   — Manager (Sarah Mitchell)');
console.log('  tom@estate.com       — Technician, Grounds & Landscaping');
console.log('  maria@estate.com     — Technician, Interior Maintenance');
console.log('  dave@estate.com      — Technician, Interior Maintenance');
console.log('  alex@estate.com      — Technician, Security & Systems');
console.log('  emma@estate.com      — Technician, Housekeeping');
console.log('  robert@estate.com    — Manager, Grounds & Landscaping');

db.close();

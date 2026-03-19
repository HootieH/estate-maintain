#!/usr/bin/env node
// Promote a user to god mode (is_owner=1)
// Usage: node promote.js <email>
// This is the ONLY way to grant god mode — it cannot be done through the UI.

require('dotenv').config();
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || './data/estate.db';
const email = process.argv[2];

if (!email) {
  console.log('Usage: node promote.js <email>');
  console.log('Grants god mode to a user (sees all properties, full system access).');
  process.exit(1);
}

const db = new Database(dbPath);
const user = db.prepare('SELECT id, email, name, role, is_owner FROM users WHERE email = ?').get(email);

if (!user) {
  console.error(`No user found with email: ${email}`);
  db.close();
  process.exit(1);
}

if (user.is_owner) {
  console.log(`${user.name} (${user.email}) already has god mode.`);
  db.close();
  process.exit(0);
}

db.prepare('UPDATE users SET is_owner = 1, role = ? WHERE id = ?').run('admin', user.id);
console.log(`God mode granted to ${user.name} (${user.email}).`);
console.log('This user can now see all properties and manage the entire system.');
db.close();

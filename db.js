const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'rajbharath_asn.db'));

// Create tables if they don't already exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    supplier_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT NOT NULL,
    supplier_id INTEGER NOT NULL,
    po_file_path TEXT,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS asns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asn_number TEXT UNIQUE,
    po_id INTEGER NOT NULL,
    supplier_id INTEGER NOT NULL,
    invoice_number TEXT,
    invoice_date TEXT,
    transport_method TEXT,
    vehicle_number TEXT,
    status TEXT DEFAULT 'Draft',
    rejection_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS asn_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asn_id INTEGER NOT NULL,
    part_description TEXT,
    qty REAL,
    uom TEXT,
    amount_with_tax REAL,
    item_status TEXT DEFAULT 'Pending',
    item_remarks TEXT
  );
`);

console.log('Database and tables created successfully!');

module.exports = db;
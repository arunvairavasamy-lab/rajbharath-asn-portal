const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      supplier_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id SERIAL PRIMARY KEY,
      po_number TEXT NOT NULL,
      supplier_id INTEGER NOT NULL,
      po_file_path TEXT,
      uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS asns (
      id SERIAL PRIMARY KEY,
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
      id SERIAL PRIMARY KEY,
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
}

setup().catch(err => console.error('Database setup error:', err));

module.exports = pool;
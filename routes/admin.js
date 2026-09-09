const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const db = require('../db');

// Middleware: only allow logged-in Admins
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/login');
  }
  next();
}

// Multer setup for PO file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'uploads', 'po'));
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage: storage });

// Admin Dashboard
// Securely serve a PO file (Admin only)
router.get('/po/:id/file', requireAdmin, (req, res) => {
  const path = require('path');
  const fs = require('fs');
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);

  if (!po || !po.po_file_path) {
    return res.status(404).send('PO file not found.');
  }

  const filePath = path.join(__dirname, '..', 'uploads', 'po', po.po_file_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found on server.');
  }

  res.sendFile(filePath);
});
router.get('/dashboard', requireAdmin, (req, res) => {
  const suppliers = db.prepare('SELECT * FROM suppliers').all();
  res.render('admin-suppliers', { suppliers, error: null, success: null });
});

// Handle "Add Supplier" form submission
router.post('/suppliers/add', requireAdmin, (req, res) => {
  const { name, code, username, password } = req.body;
  const suppliers = db.prepare('SELECT * FROM suppliers').all();

  try {
    const insertSupplier = db.prepare('INSERT INTO suppliers (name, code) VALUES (?, ?)');
    const result = insertSupplier.run(name, code);
    const newSupplierId = result.lastInsertRowid;

    const hashedPassword = bcrypt.hashSync(password, 10);
    const insertUser = db.prepare(
      'INSERT INTO users (username, password, role, supplier_id) VALUES (?, ?, ?, ?)'
    );
    insertUser.run(username, hashedPassword, 'supplier', newSupplierId);

    const updatedSuppliers = db.prepare('SELECT * FROM suppliers').all();
    res.render('admin-suppliers', {
      suppliers: updatedSuppliers,
      error: null,
      success: `Supplier "${name}" added with login "${username}"`
    });
  } catch (err) {
    res.render('admin-suppliers', {
      suppliers,
      error: 'Error: ' + err.message,
      success: null
    });
  }
});

// Show PO upload page
router.get('/po/upload', requireAdmin, (req, res) => {
  const suppliers = db.prepare('SELECT * FROM suppliers').all();
  const pos = db.prepare(`
    SELECT purchase_orders.*, suppliers.name AS supplier_name
    FROM purchase_orders
    JOIN suppliers ON purchase_orders.supplier_id = suppliers.id
  `).all();
  res.render('admin-po-upload', { suppliers, pos, error: null, success: null });
});

// Handle PO upload form submission
router.post('/po/upload', requireAdmin, upload.single('po_file'), (req, res) => {
  const { po_number, supplier_id } = req.body;
  const suppliers = db.prepare('SELECT * FROM suppliers').all();

  try {
    const filePath = req.file ? req.file.filename : null;

    const insertPO = db.prepare(
      'INSERT INTO purchase_orders (po_number, supplier_id, po_file_path) VALUES (?, ?, ?)'
    );
    insertPO.run(po_number, supplier_id, filePath);

    const pos = db.prepare(`
      SELECT purchase_orders.*, suppliers.name AS supplier_name
      FROM purchase_orders
      JOIN suppliers ON purchase_orders.supplier_id = suppliers.id
    `).all();

    res.render('admin-po-upload', {
      suppliers,
      pos,
      error: null,
      success: `PO "${po_number}" uploaded successfully`
    });
  } catch (err) {
    const pos = db.prepare(`
      SELECT purchase_orders.*, suppliers.name AS supplier_name
      FROM purchase_orders
      JOIN suppliers ON purchase_orders.supplier_id = suppliers.id
    `).all();
    res.render('admin-po-upload', {
      suppliers,
      pos,
      error: 'Error: ' + err.message,
      success: null
    });
  }
});

module.exports = router;
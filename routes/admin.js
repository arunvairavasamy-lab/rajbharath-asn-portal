const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/login');
  }
  next();
}

const uploadDir = path.join(__dirname, '..', 'uploads', 'po');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage: storage });

router.get('/po/:id/file', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);
    const po = result.rows[0];
    if (!po || !po.po_file_path) {
      return res.status(404).send('PO file not found.');
    }
    const filePath = path.join(uploadDir, po.po_file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found on server.');
    }
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
});

router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM suppliers');
    res.render('admin-suppliers', { suppliers: result.rows, error: null, success: null });
  } catch (err) {
    console.error(err);
    res.render('admin-suppliers', { suppliers: [], error: 'Error loading suppliers.', success: null });
  }
});

router.post('/suppliers/add', requireAdmin, async (req, res) => {
  const { name, code, username, password } = req.body;
  try {
    const insertSupplier = await pool.query(
      'INSERT INTO suppliers (name, code) VALUES ($1, $2) RETURNING id',
      [name, code]
    );
    const newSupplierId = insertSupplier.rows[0].id;

    const hashedPassword = bcrypt.hashSync(password, 10);
    await pool.query(
      'INSERT INTO users (username, password, role, supplier_id) VALUES ($1, $2, $3, $4)',
      [username, hashedPassword, 'supplier', newSupplierId]
    );

    const updated = await pool.query('SELECT * FROM suppliers');
    res.render('admin-suppliers', {
      suppliers: updated.rows,
      error: null,
      success: 'Supplier "' + name + '" added with login "' + username + '"'
    });
  } catch (err) {
    console.error(err);
    const suppliers = await pool.query('SELECT * FROM suppliers');
    res.render('admin-suppliers', { suppliers: suppliers.rows, error: 'Error: ' + err.message, success: null });
  }
});

router.get('/po/upload', requireAdmin, async (req, res) => {
  try {
    const suppliers = await pool.query('SELECT * FROM suppliers');
    const pos = await pool.query(
      'SELECT purchase_orders.*, suppliers.name AS supplier_name FROM purchase_orders JOIN suppliers ON purchase_orders.supplier_id = suppliers.id'
    );
    res.render('admin-po-upload', { suppliers: suppliers.rows, pos: pos.rows, error: null, success: null });
  } catch (err) {
    console.error(err);
    res.render('admin-po-upload', { suppliers: [], pos: [], error: 'Error loading data.', success: null });
  }
});

router.post('/po/upload', requireAdmin, upload.single('po_file'), async (req, res) => {
  const { po_number, supplier_id } = req.body;
  try {
    const filePath = req.file ? req.file.filename : null;
    await pool.query(
      'INSERT INTO purchase_orders (po_number, supplier_id, po_file_path) VALUES ($1, $2, $3)',
      [po_number, supplier_id, filePath]
    );

    const suppliers = await pool.query('SELECT * FROM suppliers');
    const pos = await pool.query(
      'SELECT purchase_orders.*, suppliers.name AS supplier_name FROM purchase_orders JOIN suppliers ON purchase_orders.supplier_id = suppliers.id'
    );
    res.render('admin-po-upload', {
      suppliers: suppliers.rows,
      pos: pos.rows,
      error: null,
      success: 'PO "' + po_number + '" uploaded successfully'
    });
  } catch (err) {
    console.error(err);
    const suppliers = await pool.query('SELECT * FROM suppliers');
    const pos = await pool.query(
      'SELECT purchase_orders.*, suppliers.name AS supplier_name FROM purchase_orders JOIN suppliers ON purchase_orders.supplier_id = suppliers.id'
    );
    res.render('admin-po-upload', { suppliers: suppliers.rows, pos: pos.rows, error: 'Error: ' + err.message, success: null });
  }
});

module.exports = router;
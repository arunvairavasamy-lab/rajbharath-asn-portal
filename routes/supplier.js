const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const db = require('../db');

function requireSupplier(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'supplier') {
    return res.redirect('/login');
  }
  next();
}

router.get('/asns', requireSupplier, (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const asns = db.prepare(
    'SELECT asns.*, purchase_orders.po_number FROM asns JOIN purchase_orders ON asns.po_id = purchase_orders.id WHERE asns.supplier_id = ? ORDER BY asns.id DESC'
  ).all(supplierId);
  res.render('supplier-asns', { asns });
});

router.get('/dashboard', requireSupplier, (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const pos = db.prepare('SELECT * FROM purchase_orders WHERE supplier_id = ?').all(supplierId);
  res.render('supplier-pos', { pos });
});

router.get('/po/:id/file', requireSupplier, (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const poId = req.params.id;
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND supplier_id = ?').get(poId, supplierId);
  if (!po || !po.po_file_path) {
    return res.status(404).send('PO file not found or access denied.');
  }
  const filePath = path.join(__dirname, '..', 'uploads', 'po', po.po_file_path);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found on server.');
  }
  res.sendFile(filePath);
});

router.get('/asn/new/:poId', requireSupplier, (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const poId = req.params.poId;
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND supplier_id = ?').get(poId, supplierId);
  if (!po) {
    return res.status(404).send('PO not found or access denied.');
  }
  res.render('supplier-asn-form', { po, error: null, existingAsn: null, existingItems: null });
});

router.get('/asn/edit/:asnId', requireSupplier, (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const asnId = req.params.asnId;
  const asn = db.prepare('SELECT * FROM asns WHERE id = ? AND supplier_id = ?').get(asnId, supplierId);
  if (!asn) {
    return res.status(404).send('ASN not found or access denied.');
  }
  if (asn.status !== 'Rejected') {
    return res.status(400).send('Only rejected ASNs can be edited.');
  }
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(asn.po_id);
  const items = db.prepare('SELECT * FROM asn_items WHERE asn_id = ?').all(asnId);
  res.render('supplier-asn-form', { po, error: null, existingAsn: asn, existingItems: items });
});

router.post('/asn/preview', requireSupplier, (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const po_id = req.body.po_id;
  const asn_id = req.body.asn_id;
  const invoice_number = req.body.invoice_number;
  const invoice_date = req.body.invoice_date;
  const transport_method = req.body.transport_method;
  const vehicle_number = req.body.vehicle_number;
  const part_description = req.body.part_description;
  const qty = req.body.qty;
  const uom = req.body.uom;
  const amount_with_tax = req.body.amount_with_tax;

  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND supplier_id = ?').get(po_id, supplierId);
  if (!po) {
    return res.status(404).send('PO not found or access denied.');
  }

  const descriptions = Array.isArray(part_description) ? part_description : [part_description];
  const qtys = Array.isArray(qty) ? qty : [qty];
  const uoms = Array.isArray(uom) ? uom : [uom];
  const amounts = Array.isArray(amount_with_tax) ? amount_with_tax : [amount_with_tax];

  const items = [];
  for (let i = 0; i < descriptions.length; i++) {
    if (descriptions[i] && descriptions[i].trim() !== '') {
      items.push({
        part_description: descriptions[i],
        qty: qtys[i],
        uom: uoms[i],
        amount_with_tax: amounts[i]
      });
    }
  }

  res.render('supplier-asn-preview', {
    po: po,
    asn_id: asn_id || '',
    invoice_number: invoice_number,
    invoice_date: invoice_date,
    transport_method: transport_method,
    vehicle_number: vehicle_number,
    items: items
  });
});

router.post('/asn/save', requireSupplier, async (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const po_id = req.body.po_id;
  const asn_id = req.body.asn_id;
  const invoice_number = req.body.invoice_number;
  const invoice_date = req.body.invoice_date;
  const transport_method = req.body.transport_method;
  const vehicle_number = req.body.vehicle_number;
  const part_description = req.body.part_description;
  const qty = req.body.qty;
  const uom = req.body.uom;
  const amount_with_tax = req.body.amount_with_tax;

  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND supplier_id = ?').get(po_id, supplierId);
  if (!po) {
    return res.status(404).send('PO not found or access denied.');
  }

  let asnId;
  let asnNumber;

  if (asn_id) {
    const existingAsn = db.prepare('SELECT * FROM asns WHERE id = ? AND supplier_id = ? AND status = ?').get(asn_id, supplierId, 'Rejected');
    if (!existingAsn) {
      return res.status(404).send('Rejected ASN not found or access denied.');
    }
    asnId = existingAsn.id;
    asnNumber = existingAsn.asn_number;

    db.prepare('UPDATE asns SET invoice_number = ?, invoice_date = ?, transport_method = ?, vehicle_number = ?, status = ?, rejection_reason = NULL WHERE id = ?')
      .run(invoice_number, invoice_date, transport_method, vehicle_number, 'Submitted', asnId);

    db.prepare('DELETE FROM asn_items WHERE asn_id = ?').run(asnId);
  } else {
    const insertASN = db.prepare('INSERT INTO asns (po_id, supplier_id, invoice_number, invoice_date, transport_method, vehicle_number, status) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = insertASN.run(po_id, supplierId, invoice_number, invoice_date, transport_method, vehicle_number, 'Submitted');
    asnId = result.lastInsertRowid;
    asnNumber = 'ASN-' + String(asnId).padStart(4, '0');
    db.prepare('UPDATE asns SET asn_number = ? WHERE id = ?').run(asnNumber, asnId);
  }

  const descriptions = Array.isArray(part_description) ? part_description : [part_description];
  const qtys = Array.isArray(qty) ? qty : [qty];
  const uoms = Array.isArray(uom) ? uom : [uom];
  const amounts = Array.isArray(amount_with_tax) ? amount_with_tax : [amount_with_tax];

  const insertItem = db.prepare('INSERT INTO asn_items (asn_id, part_description, qty, uom, amount_with_tax, item_status) VALUES (?, ?, ?, ?, ?, ?)');

  for (let i = 0; i < descriptions.length; i++) {
    if (descriptions[i] && descriptions[i].trim() !== '') {
      insertItem.run(asnId, descriptions[i], qtys[i], uoms[i], amounts[i], 'Pending');
    }
  }

  const qrDataUrl = await QRCode.toDataURL(asnNumber);
  res.render('supplier-asn-success', { asnNumber: asnNumber, qrDataUrl: qrDataUrl, asnId: asnId });
});

router.get('/asn/:id/print', requireSupplier, async (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const asnId = req.params.id;
  const asn = db.prepare('SELECT * FROM asns WHERE id = ? AND supplier_id = ?').get(asnId, supplierId);
  if (!asn) {
    return res.status(404).send('ASN not found or access denied.');
  }
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(asn.po_id);
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(supplierId);
  const items = db.prepare('SELECT * FROM asn_items WHERE asn_id = ?').all(asnId);
  const qrDataUrl = await QRCode.toDataURL(asn.asn_number);
  res.render('supplier-asn-print', { asn: asn, po: po, supplier: supplier, items: items, qrDataUrl: qrDataUrl });
});

module.exports = router;
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const pool = require('../db');

function requireSupplier(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'supplier') {
    return res.redirect('/login');
  }
  next();
}

router.get('/asns', requireSupplier, async (req, res) => {
  const supplierId = req.session.user.supplier_id;
  try {
    const result = await pool.query(
      'SELECT asns.*, purchase_orders.po_number FROM asns JOIN purchase_orders ON asns.po_id = purchase_orders.id WHERE asns.supplier_id = $1 ORDER BY asns.id DESC',
      [supplierId]
    );
    res.render('supplier-asns', { asns: result.rows });
  } catch (err) {
    console.error(err);
    res.render('supplier-asns', { asns: [] });
  }
});

router.get('/dashboard', requireSupplier, async (req, res) => {
  const supplierId = req.session.user.supplier_id;
  try {
    const result = await pool.query('SELECT * FROM purchase_orders WHERE supplier_id = $1', [supplierId]);
    res.render('supplier-pos', { pos: result.rows });
  } catch (err) {
    console.error(err);
    res.render('supplier-pos', { pos: [] });
  }
});

router.get('/po/:id/file', requireSupplier, async (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const poId = req.params.id;
  try {
    const result = await pool.query('SELECT * FROM purchase_orders WHERE id = $1 AND supplier_id = $2', [poId, supplierId]);
    const po = result.rows[0];
    if (!po || !po.po_file_path) {
      return res.status(404).send('PO file not found or access denied.');
    }
    const filePath = path.join(__dirname, '..', 'uploads', 'po', po.po_file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found on server.');
    }
    res.sendFile(filePath);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
});

router.get('/asn/new/:poId', requireSupplier, async (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const poId = req.params.poId;
  try {
    const result = await pool.query('SELECT * FROM purchase_orders WHERE id = $1 AND supplier_id = $2', [poId, supplierId]);
    const po = result.rows[0];
    if (!po) {
      return res.status(404).send('PO not found or access denied.');
    }
    res.render('supplier-asn-form', { po, error: null, existingAsn: null, existingItems: null });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
});

router.get('/asn/edit/:asnId', requireSupplier, async (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const asnId = req.params.asnId;
  try {
    const asnResult = await pool.query('SELECT * FROM asns WHERE id = $1 AND supplier_id = $2', [asnId, supplierId]);
    const asn = asnResult.rows[0];
    if (!asn) {
      return res.status(404).send('ASN not found or access denied.');
    }
    if (asn.status !== 'Rejected') {
      return res.status(400).send('Only rejected ASNs can be edited.');
    }
    const poResult = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [asn.po_id]);
    const itemsResult = await pool.query('SELECT * FROM asn_items WHERE asn_id = $1', [asnId]);
    res.render('supplier-asn-form', { po: poResult.rows[0], error: null, existingAsn: asn, existingItems: itemsResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
});

router.post('/asn/preview', requireSupplier, async (req, res) => {
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

  try {
    const result = await pool.query('SELECT * FROM purchase_orders WHERE id = $1 AND supplier_id = $2', [po_id, supplierId]);
    const po = result.rows[0];
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
      po, asn_id: asn_id || '', invoice_number, invoice_date, transport_method, vehicle_number, items
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
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

  try {
    const poResult = await pool.query('SELECT * FROM purchase_orders WHERE id = $1 AND supplier_id = $2', [po_id, supplierId]);
    const po = poResult.rows[0];
    if (!po) {
      return res.status(404).send('PO not found or access denied.');
    }

    let asnId;
    let asnNumber;

    if (asn_id) {
      const existingResult = await pool.query(
        'SELECT * FROM asns WHERE id = $1 AND supplier_id = $2 AND status = $3',
        [asn_id, supplierId, 'Rejected']
      );
      const existingAsn = existingResult.rows[0];
      if (!existingAsn) {
        return res.status(404).send('Rejected ASN not found or access denied.');
      }
      asnId = existingAsn.id;
      asnNumber = existingAsn.asn_number;

      await pool.query(
        'UPDATE asns SET invoice_number = $1, invoice_date = $2, transport_method = $3, vehicle_number = $4, status = $5, rejection_reason = NULL WHERE id = $6',
        [invoice_number, invoice_date, transport_method, vehicle_number, 'Submitted', asnId]
      );
      await pool.query('DELETE FROM asn_items WHERE asn_id = $1', [asnId]);
    } else {
      const insertResult = await pool.query(
        'INSERT INTO asns (po_id, supplier_id, invoice_number, invoice_date, transport_method, vehicle_number, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [po_id, supplierId, invoice_number, invoice_date, transport_method, vehicle_number, 'Submitted']
      );
      asnId = insertResult.rows[0].id;
      asnNumber = 'ASN-' + String(asnId).padStart(4, '0');
      await pool.query('UPDATE asns SET asn_number = $1 WHERE id = $2', [asnNumber, asnId]);
    }

    const descriptions = Array.isArray(part_description) ? part_description : [part_description];
    const qtys = Array.isArray(qty) ? qty : [qty];
    const uoms = Array.isArray(uom) ? uom : [uom];
    const amounts = Array.isArray(amount_with_tax) ? amount_with_tax : [amount_with_tax];

    for (let i = 0; i < descriptions.length; i++) {
      if (descriptions[i] && descriptions[i].trim() !== '') {
        await pool.query(
          'INSERT INTO asn_items (asn_id, part_description, qty, uom, amount_with_tax, item_status) VALUES ($1, $2, $3, $4, $5, $6)',
          [asnId, descriptions[i], qtys[i], uoms[i], amounts[i], 'Pending']
        );
      }
    }

    const qrDataUrl = await QRCode.toDataURL(asnNumber);
    res.render('supplier-asn-success', { asnNumber, qrDataUrl, asnId });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error: ' + err.message);
  }
});

router.get('/asn/:id/print', requireSupplier, async (req, res) => {
  const supplierId = req.session.user.supplier_id;
  const asnId = req.params.id;
  try {
    const asnResult = await pool.query('SELECT * FROM asns WHERE id = $1 AND supplier_id = $2', [asnId, supplierId]);
    const asn = asnResult.rows[0];
    if (!asn) {
      return res.status(404).send('ASN not found or access denied.');
    }
    const poResult = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [asn.po_id]);
    const supplierResult = await pool.query('SELECT * FROM suppliers WHERE id = $1', [supplierId]);
    const itemsResult = await pool.query('SELECT * FROM asn_items WHERE asn_id = $1', [asnId]);
    const qrDataUrl = await QRCode.toDataURL(asn.asn_number);
    res.render('supplier-asn-print', {
      asn, po: poResult.rows[0], supplier: supplierResult.rows[0], items: itemsResult.rows, qrDataUrl
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
});

module.exports = router;
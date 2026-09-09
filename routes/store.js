const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const db = require('../db');

function requireStore(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'store') {
    return res.redirect('/login');
  }
  next();
}

router.get('/dashboard', requireStore, (req, res) => {
  res.render('store-dashboard');
});

router.get('/scan', requireStore, (req, res) => {
  res.render('store-scan');
});

router.get('/asn/lookup', requireStore, (req, res) => {
  const asnNumber = req.query.asn_number;
  const asn = db.prepare('SELECT * FROM asns WHERE asn_number = ?').get(asnNumber);
  if (!asn) {
    return res.send('No ASN found with number "' + asnNumber + '". <br><a href="/store/scan">Try again</a>');
  }
  res.redirect('/store/asn/' + asn.id);
});

router.get('/export/asn-items', requireStore, async (req, res) => {
  const rows = db.prepare(
    'SELECT asns.asn_number, purchase_orders.po_number, suppliers.name AS supplier_name, asns.invoice_number, asn_items.part_description, asn_items.qty, asn_items.uom, asn_items.amount_with_tax, asn_items.item_status, asn_items.item_remarks FROM asn_items JOIN asns ON asn_items.asn_id = asns.id JOIN purchase_orders ON asns.po_id = purchase_orders.id JOIN suppliers ON asns.supplier_id = suppliers.id ORDER BY asns.id'
  ).all();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('ASN Line Items');

  sheet.columns = [
    { header: 'ASN Number', key: 'asn_number', width: 15 },
    { header: 'PO Number', key: 'po_number', width: 15 },
    { header: 'Supplier', key: 'supplier_name', width: 25 },
    { header: 'Invoice Number', key: 'invoice_number', width: 15 },
    { header: 'Part Description', key: 'part_description', width: 25 },
    { header: 'Quantity', key: 'qty', width: 10 },
    { header: 'UOM', key: 'uom', width: 10 },
    { header: 'Amount with Tax', key: 'amount_with_tax', width: 15 },
    { header: 'Item Status', key: 'item_status', width: 12 },
    { header: 'Item Remarks', key: 'item_remarks', width: 25 }
  ];

  rows.forEach(function(row) { sheet.addRow(row); });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=asn_line_items.xlsx');

  await workbook.xlsx.write(res);
  res.end();
});

router.get('/asn/:id', requireStore, (req, res) => {
  const asnId = req.params.id;
  const asn = db.prepare('SELECT * FROM asns WHERE id = ?').get(asnId);
  if (!asn) {
    return res.status(404).send('ASN not found.');
  }
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(asn.po_id);
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(asn.supplier_id);
  const items = db.prepare('SELECT * FROM asn_items WHERE asn_id = ?').all(asnId);
  res.render('store-asn-verify', { asn: asn, po: po, supplier: supplier, items: items, message: null });
});

router.post('/asn/:id/verify', requireStore, (req, res) => {
  const asnId = req.params.id;
  const rawItemIds = req.body.item_ids;
  const itemIds = Array.isArray(rawItemIds) ? rawItemIds : [rawItemIds];

  const updateItem = db.prepare('UPDATE asn_items SET item_status = ?, item_remarks = ? WHERE id = ?');

  for (let i = 0; i < itemIds.length; i++) {
    const id = itemIds[i];
    const status = req.body['item_status_' + id] || 'Pending';
    const remark = req.body['item_remarks_' + id] || '';
    updateItem.run(status, remark, id);
  }

  const allItems = db.prepare('SELECT * FROM asn_items WHERE asn_id = ?').all(asnId);
  const anyRejected = allItems.some(function(item) { return item.item_status === 'Rejected'; });
  const overallStatus = anyRejected ? 'Rejected' : 'Approved';

  db.prepare('UPDATE asns SET status = ? WHERE id = ?').run(overallStatus, asnId);

  const asn = db.prepare('SELECT * FROM asns WHERE id = ?').get(asnId);
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(asn.po_id);
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(asn.supplier_id);

  res.render('store-asn-verify', {
    asn: asn, po: po, supplier: supplier, items: allItems,
    message: 'ASN ' + asn.asn_number + ' updated. Overall status: ' + overallStatus
  });
});

module.exports = router;
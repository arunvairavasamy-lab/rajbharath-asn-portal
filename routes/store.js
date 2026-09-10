const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const pool = require('../db');

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

router.get('/asn/lookup', requireStore, async (req, res) => {
  const asnNumber = req.query.asn_number;
  try {
    const result = await pool.query('SELECT * FROM asns WHERE asn_number = $1', [asnNumber]);
    const asn = result.rows[0];
    if (!asn) {
      return res.send('No ASN found with number "' + asnNumber + '". <br><a href="/store/scan">Try again</a>');
    }
    res.redirect('/store/asn/' + asn.id);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
});

router.get('/export/asn-items', requireStore, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        asns.asn_number,
        purchase_orders.po_number,
        suppliers.name AS supplier_name,
        asns.invoice_number,
        asn_items.part_description,
        asn_items.qty,
        asn_items.uom,
        asn_items.amount_with_tax,
        asn_items.item_status,
        asn_items.item_remarks
      FROM asn_items
      JOIN asns ON asn_items.asn_id = asns.id
      JOIN purchase_orders ON asns.po_id = purchase_orders.id
      JOIN suppliers ON asns.supplier_id = suppliers.id
      ORDER BY asns.id`
    );

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

    result.rows.forEach(row => sheet.addRow(row));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=asn_line_items.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
});

router.get('/asn/:id', requireStore, async (req, res) => {
  const asnId = req.params.id;
  try {
    const asnResult = await pool.query('SELECT * FROM asns WHERE id = $1', [asnId]);
    const asn = asnResult.rows[0];
    if (!asn) {
      return res.status(404).send('ASN not found.');
    }
    const poResult = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [asn.po_id]);
    const supplierResult = await pool.query('SELECT * FROM suppliers WHERE id = $1', [asn.supplier_id]);
    const itemsResult = await pool.query('SELECT * FROM asn_items WHERE asn_id = $1', [asnId]);
    res.render('store-asn-verify', {
      asn, po: poResult.rows[0], supplier: supplierResult.rows[0], items: itemsResult.rows, message: null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
});

router.post('/asn/:id/verify', requireStore, async (req, res) => {
  const asnId = req.params.id;
  const rawItemIds = req.body.item_ids;
  const itemIds = Array.isArray(rawItemIds) ? rawItemIds : [rawItemIds];

  try {
    for (let i = 0; i < itemIds.length; i++) {
      const id = itemIds[i];
      const status = req.body['item_status_' + id] || 'Pending';
      const remark = req.body['item_remarks_' + id] || '';
      await pool.query('UPDATE asn_items SET item_status = $1, item_remarks = $2 WHERE id = $3', [status, remark, id]);
    }

    const allItemsResult = await pool.query('SELECT * FROM asn_items WHERE asn_id = $1', [asnId]);
    const allItems = allItemsResult.rows;
    const anyRejected = allItems.some(item => item.item_status === 'Rejected');
    const overallStatus = anyRejected ? 'Rejected' : 'Approved';

    await pool.query('UPDATE asns SET status = $1 WHERE id = $2', [overallStatus, asnId]);

    const asnResult = await pool.query('SELECT * FROM asns WHERE id = $1', [asnId]);
    const asn = asnResult.rows[0];
    const poResult = await pool.query('SELECT * FROM purchase_orders WHERE id = $1', [asn.po_id]);
    const supplierResult = await pool.query('SELECT * FROM suppliers WHERE id = $1', [asn.supplier_id]);

    res.render('store-asn-verify', {
      asn, po: poResult.rows[0], supplier: supplierResult.rows[0], items: allItems,
      message: 'ASN ' + asn.asn_number + ' updated. Overall status: ' + overallStatus
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error.');
  }
});

module.exports = router;
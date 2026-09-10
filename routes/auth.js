const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');

router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) {
      return res.render('login', { error: 'Invalid username or password' });
    }

    const passwordMatches = bcrypt.compareSync(password, user.password);

    if (!passwordMatches) {
      return res.render('login', { error: 'Invalid username or password' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      supplier_id: user.supplier_id
    };

    if (user.role === 'admin') {
      res.redirect('/admin/dashboard');
    } else if (user.role === 'supplier') {
      res.redirect('/supplier/dashboard');
    } else if (user.role === 'store') {
      res.redirect('/store/dashboard');
    } else {
      res.redirect('/login');
    }
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Something went wrong. Please try again.' });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
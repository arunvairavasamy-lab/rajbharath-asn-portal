const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// Show login page
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Handle login form submission
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user) {
    return res.render('login', { error: 'Invalid username or password' });
  }

  const passwordMatches = bcrypt.compareSync(password, user.password);

  if (!passwordMatches) {
    return res.render('login', { error: 'Invalid username or password' });
  }

  // Save user info in session
  req.session.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    supplier_id: user.supplier_id
  };

  // Redirect based on role
  if (user.role === 'admin') {
    res.redirect('/admin/dashboard');
  } else if (user.role === 'supplier') {
    res.redirect('/supplier/dashboard');
  } else if (user.role === 'store') {
    res.redirect('/store/dashboard');
  } else {
    res.redirect('/login');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: 'rajbharath-secret-key',
  resave: false,
  saveUninitialized: false
}));

// Auto-create default accounts if they don't already exist
async function ensureUser(username, plainPassword, role) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      const hashed = bcrypt.hashSync(plainPassword, 10);
      await pool.query('INSERT INTO users (username, password, role) VALUES ($1, $2, $3)', [username, hashed, role]);
      console.log('Created default user:', username);
    }
  } catch (err) {
    console.error('Error ensuring user', username, err);
  }
}

setTimeout(() => {
  ensureUser('admin', 'admin123', 'admin');
  ensureUser('store1', 'store123', 'store');
}, 2000);

// Auth routes (login/logout)
const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

// Admin routes
const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

const supplierRoutes = require('./routes/supplier');
app.use('/supplier', supplierRoutes);

const storeRoutes = require('./routes/store');
app.use('/store', storeRoutes);

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
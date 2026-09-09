const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');

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
function ensureUser(username, plainPassword, role) {
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!existing) {
    const hashed = bcrypt.hashSync(plainPassword, 10);
    db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hashed, role);
    console.log('Created default user:', username);
  }
}
ensureUser('admin', 'admin123', 'admin');
ensureUser('store1', 'store123', 'store');

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
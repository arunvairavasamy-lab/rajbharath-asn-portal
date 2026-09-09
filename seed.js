const db = require('./db');
const bcrypt = require('bcryptjs');

// Create Admin user
const username = 'admin';
const plainPassword = 'admin123';
const hashedPassword = bcrypt.hashSync(plainPassword, 10);

try {
  const insert = db.prepare(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
  );
  insert.run(username, hashedPassword, 'admin');
  console.log('Admin user created successfully!');
  console.log('Username: admin');
  console.log('Password: admin123');
} catch (err) {
  if (err.message.includes('UNIQUE constraint failed')) {
    console.log('Admin user already exists — no changes made.');
  } else {
    console.error('Error creating admin user:', err.message);
  }
}

// Create Store user
const storeUsername = 'store1';
const storePlainPassword = 'store123';
const storeHashedPassword = bcrypt.hashSync(storePlainPassword, 10);

try {
  const insertStore = db.prepare(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)'
  );
  insertStore.run(storeUsername, storeHashedPassword, 'store');
  console.log('Store user created successfully!');
  console.log('Username: store1');
  console.log('Password: store123');
} catch (err) {
  if (err.message.includes('UNIQUE constraint failed')) {
    console.log('Store user already exists — no changes made.');
  } else {
    console.error('Error creating store user:', err.message);
  }
}
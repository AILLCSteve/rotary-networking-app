// fix-admin.js - Update admin credentials
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'networking.db'));

// Delete all existing admin users and create new one
db.serialize(() => {
  // Delete all existing admins
  db.run(`DELETE FROM admin_users`, (err) => {
    if (err) {
      console.error('Error deleting admins:', err);
    } else {
      console.log('Deleted all existing admin users');
    }

    // Create new admin with admin/admin
    const password = 'admin';
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) {
        console.error('Error hashing password:', err);
        db.close();
        return;
      }

      db.run(`
        INSERT INTO admin_users (admin_id, email, password_hash)
        VALUES (?, ?, ?)
      `, ['admin-1', 'admin', hash], (err) => {
        if (err) {
          console.error('Error creating admin:', err);
        } else {
          console.log('✅ Admin user created successfully: admin / admin');
        }

        db.close(() => {
          console.log('Database updated!');
        });
      });
    });
  });
});

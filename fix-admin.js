const db = require('./db');
const bcrypt = require('bcryptjs');

const admin = db.get('users').find({ username: 'admin' }).value();
if (admin) {
  console.log('Admin found:', { username: admin.username, role: admin.role, status: admin.status });
  // Update password to Nasirumbi
  const newHash = bcrypt.hashSync('Nasirumbi', 10);
  db.get('users').find({ username: 'admin' }).assign({ passwordHash: newHash }).write();
  console.log('Password updated to Nasirumbi');
} else {
  console.log('Admin user not found');
  process.exit(1);
}

const Database = require('better-sqlite3');
const db = new Database('./prisma/dev.db');
const cols = db.pragma('table_info(users)').map(r => r.name);
console.log('COLS:', cols.join(', '));
const hasPlatform = cols.includes('platform');
if (!hasPlatform) {
  db.exec('ALTER TABLE users ADD COLUMN platform TEXT');
  console.log('ADDED platform column');
} else {
  console.log('platform column already exists');
}
db.close();

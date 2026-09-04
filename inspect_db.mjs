import Database from 'better-sqlite3';

const db = new Database('database.sqlite');

console.log('--- TABLES ---');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log(tables);

console.log('\n--- SESSIONS ---');
console.log(db.prepare("SELECT * FROM sessions").all());

console.log('\n--- TASKS ---');
console.log(db.prepare("SELECT * FROM tasks").all());

console.log('\n--- MEMORIES (search for marketplace/keywords) ---');
console.log(db.prepare("SELECT * FROM memories LIMIT 20").all());

console.log('\n--- MESSAGES (search for marketplace/keywords) ---');
console.log(db.prepare("SELECT id, session_id, role, substr(content, 1, 100) as preview FROM messages ORDER BY id DESC LIMIT 20").all());

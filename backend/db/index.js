const mysql = require("mysql2");

console.log("🔥 DB INDEX LOADED FROM:", __filename);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: {
    rejectUnauthorized: false
  }
});

// ✅ mysql2 promise wrapper (NO overrides)
const promisePool = pool.promise();

console.log("✅ MySQL Pool Ready (promise-based)");

module.exports = promisePool;

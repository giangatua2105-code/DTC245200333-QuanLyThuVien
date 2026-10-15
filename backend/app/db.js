const { Pool } = require("pg");
module.exports = new Pool({
  host: process.env.DB_HOST || "postgres",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "library_app",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "library",
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  options: "-c timezone=Asia/Ho_Chi_Minh",
});

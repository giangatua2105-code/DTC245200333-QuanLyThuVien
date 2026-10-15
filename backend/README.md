# Backend Node.js / Express

Backend API + PostgreSQL, cấu hình giám sát/log trong infra. Xem README.md ở LibraryPro để chạy chung với frontend bằng Docker. API được reverse proxy qua Nginx ở frontend.

Chạy kiểm thử: `npm ci` rồi `npm test` trong thư mục backend. Test dùng PostgreSQL engine PGlite, không cần Docker. Để npm start chạy ngoài Docker cần tự cung cấp biến DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME/SESSION_SECRET/SMTP_*, chạy npm run init trước. Khi dùng Compose mọi biến này được cung cấp sẵn từ .env tại LibraryPro.

Các nhóm API ở app/routes, middleware ở app/app.js, schema ở app/schema.sql. Đặc tả endpoint ở API.md.

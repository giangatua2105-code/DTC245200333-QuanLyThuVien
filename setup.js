const fs = require("fs"),
  crypto = require("crypto");
if (fs.existsSync(".env")) {
  console.log(".env đã tồn tại; giữ nguyên mật khẩu và dữ liệu.");
  process.exit(0);
}
const keys = [
  "DB_ADMIN_PASSWORD",
  "DB_PASSWORD",
  "EXPORTER_PASSWORD",
  "PGADMIN_PASSWORD",
  "GRAFANA_PASSWORD",
  "ADMIN_PASSWORD",
  "LIBRARIAN_PASSWORD",
  "READER_PASSWORD",
  "SESSION_SECRET",
];
const data = Object.fromEntries(
  keys.map((k) => [
    k,
    crypto.randomBytes(k === "SESSION_SECRET" ? 32 : 16).toString("hex"),
  ]),
);
fs.writeFileSync(
  ".env",
  Object.entries(data)
    .map(([k, v]) => k + "=" + v)
    .join("\n") + "\n",
  { mode: 0o600 },
);
console.log(
  "Đã tạo .env. Mật khẩu đăng nhập nằm ở các dòng ADMIN_PASSWORD / LIBRARIAN_PASSWORD / READER_PASSWORD. Không đưa .env lên GitHub.",
);

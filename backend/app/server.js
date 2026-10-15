const fs = require("fs");
if (process.env.LOG_FILE) {
  const original = console.log,
    originalError = console.error;
  function write(args) {
    try {
      const path = process.env.LOG_FILE;
      if (fs.existsSync(path) && fs.statSync(path).size > 10 * 1024 * 1024)
        fs.renameSync(path, path + ".1");
      fs.appendFileSync(path, args.map(String).join(" ") + "\n", {
        mode: 0o644,
      });
    } catch (e) {
      originalError("log_write_failed", e.code);
    }
  }
  console.log = (...args) => {
    original(...args);
    write(args);
  };
  console.error = (...args) => {
    originalError(...args);
    write(args);
  };
}
const db = require("./db"),
  nodemailer = require("nodemailer");
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mailpit",
  port: Number(process.env.SMTP_PORT || 1025),
  secure: process.env.SMTP_SECURE === "true",
  ...(process.env.SMTP_USER
    ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
    : {}),
});
const app = require("./app")(db, (to, token) =>
  transport.sendMail({
    from: process.env.SMTP_FROM || "library@example.com",
    to,
    subject: "Đặt lại mật khẩu thư viện",
    text:
      "Mã đặt lại mật khẩu (hiệu lực 15 phút, dùng một lần):\n" +
      token +
      "\nMở Quên mật khẩu → nhập mã và mật khẩu mới.",
  }),
);
const server = app.listen(3000, "0.0.0.0", () =>
  console.log("Library API listening on 3000"),
);
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
db.on("error", (err) =>
  console.error("database_pool_error", err.code || err.name),
);

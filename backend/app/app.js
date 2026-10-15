const express = require("express"),
  session = require("express-session"),
  crypto = require("crypto"),
  { hash, verify } = require("./password"),
  prom = require("prom-client");
const roles = ["reader", "librarian", "admin"];
const day = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
class Failure extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
module.exports = function createApp(db, sendMail) {
  const app = express();
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.set("X-Request-Id", req.requestId);
    next();
  });
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw Error("SESSION_SECRET cần ít nhất 32 ký tự");
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: require("./session-store")(db),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE === "true",
        maxAge: 8 * 3600000,
      },
    }),
  );
  const registry = new prom.Registry();
  prom.collectDefaultMetrics({ register: registry });
  const count = new prom.Counter({
    name: "library_http_requests_total",
    help: "HTTP requests",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  });
  app.use((req, res, next) => {
    res.on("finish", () => {
      count.inc({
        method: req.method,
        route: req.route?.path || "other",
        status: res.statusCode,
      });
      if (req.path.startsWith("/api"))
        console.log(
          JSON.stringify({
            time: new Date().toISOString(),
            requestId: req.requestId,
            method: req.method,
            path: req.route?.path || req.path,
            status: res.statusCode,
          }),
        );
    });
    next();
  });
  app.get("/metrics", async (req, res) =>
    res.type(registry.contentType).send(await registry.metrics()),
  );
  app.get("/health", async (req, res) => {
    await db.query("SELECT 1");
    res.json({ ok: true });
  });
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;
  const tx = async (fn) => {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      const out = await fn(c);
      await c.query("COMMIT");
      return out;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  };
  const text = (v, max = 200) => {
    if (typeof v !== "string" || !v.trim() || v.trim().length > max)
      throw new Failure("Thông tin trống hoặc quá dài");
    return v.trim();
  };
  const email = (v) => {
    v = text(v).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      throw new Failure("Email không hợp lệ");
    return v;
  };
  const password = (v) => {
    if (typeof v !== "string" || v.length < 10 || v.length > 128)
      throw new Failure("Mật khẩu cần 10–128 ký tự");
    return v;
  };
  const id = (v) => {
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < 1) throw new Failure("Mã không hợp lệ");
    return n;
  };
  const csrf = () => crypto.randomBytes(24).toString("hex");
  app.get("/api/session", async (req, res) => {
    req.session.csrf ||= csrf();
    const u = (
      await q(
        "SELECT id,name,email,role,phone,address,active,version FROM users WHERE id=$1",
        [req.session.uid || 0],
      )
    )[0];
    if (!u || !u.active || u.version !== req.session.version)
      delete req.session.uid;
    res.json({
      csrf: req.session.csrf,
      user: req.session.uid ? u : null,
      today: day(new Date()),
      serverTime: new Date().toISOString(),
    });
  });
  app.use("/api", (req, res, next) => {
    if (
      req.method !== "GET" &&
      (!req.session.csrf || req.get("X-CSRF-Token") !== req.session.csrf)
    )
      return next(new Failure("Phiên hết hạn, hãy tải lại trang", 403));
    next();
  });
  async function limit(key, max = 10) {
    const r = await q(
      "INSERT INTO rate_limits VALUES($1,1,NOW()+INTERVAL '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires<NOW() THEN 1 ELSE rate_limits.count+1 END,expires=CASE WHEN rate_limits.expires<NOW() THEN NOW()+INTERVAL '15 minutes' ELSE rate_limits.expires END RETURNING count",
      [key],
    );
    if (r[0].count > max)
      throw new Failure("Thử quá nhiều lần, chờ 15 phút", 429);
  }
  const context = {
    q,
    tx,
    text,
    email,
    password,
    id,
    csrf,
    limit,
    roles,
    day,
    Failure,
    hash,
    verify,
    crypto,
    sendMail,
  };
  require("./routes/auth")(app, context);
  app.use("/api", async (req, res, next) => {
    const u = (
      await q("SELECT * FROM users WHERE id=$1", [req.session.uid || 0])
    )[0];
    if (!u || !u.active || u.version !== req.session.version)
      throw new Failure("Vui lòng đăng nhập", 401);
    req.user = u;
    next();
  });
  const staff = (req, res, next) =>
    roles.indexOf(req.user.role) >= 1
      ? next()
      : next(new Failure("Chỉ dành cho thủ thư/admin", 403));
  const admin = (req, res, next) =>
    req.user.role === "admin"
      ? next()
      : next(new Failure("Chỉ dành cho admin", 403));
  Object.assign(context, { staff, admin });
  require("./routes/stats")(app, context);
  require("./routes/catalog")(app, context);
  require("./routes/loans")(app, context);
  require("./routes/users")(app, context);
  app.use("/api", (req, res) =>
    res.status(404).json({ message: "Không tìm thấy API" }),
  );
  app.use(require("./error-handler"));
  return app;
};

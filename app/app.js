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
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "20kb" }));
  class Store extends session.Store {
    get(sid, cb) {
      db.query("SELECT data FROM sessions WHERE sid=$1 AND expires>NOW()", [
        sid,
      ])
        .then((r) => cb(null, r.rows[0]?.data))
        .catch(cb);
    }
    set(sid, data, cb) {
      db.query(
        "INSERT INTO sessions VALUES($1,$2,$3) ON CONFLICT(sid) DO UPDATE SET data=$2,expires=$3",
        [sid, JSON.stringify(data), new Date(Date.now() + 8 * 3600000)],
      )
        .then(() => cb())
        .catch(cb);
    }
    destroy(sid, cb) {
      db.query("DELETE FROM sessions WHERE sid=$1", [sid])
        .then(() => cb())
        .catch(cb);
    }
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw Error("SESSION_SECRET cần ít nhất 32 ký tự");
  app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: new Store(),
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
  app.post("/api/register", async (req, res) => {
    await limit("register:" + req.ip);
    const b = req.body;
    await q("INSERT INTO users(name,email,password) VALUES($1,$2,$3)", [
      text(b.name, 100),
      email(b.email),
      hash(password(b.password)),
    ]);
    res.status(201).json({ message: "Đăng ký thành công, hãy đăng nhập" });
  });
  app.post("/api/login", async (req, res) => {
    await limit("login:" + req.ip, 30);
    const e = email(req.body.email),
      u = (await q("SELECT * FROM users WHERE email=$1", [e]))[0];
    if (!u || !u.active || !verify(req.body.password || "", u.password))
      throw new Failure("Email hoặc mật khẩu không đúng", 401);
    await new Promise((resolve, reject) =>
      req.session.regenerate((e) => (e ? reject(e) : resolve())),
    );
    req.session.uid = u.id;
    req.session.version = u.version;
    req.session.csrf = csrf();
    res.json({ message: "Đăng nhập thành công" });
  });
  app.post("/api/logout", (req, res, next) =>
    req.session.destroy((e) =>
      e ? next(e) : res.json({ message: "Đã đăng xuất" }),
    ),
  );
  app.post("/api/forgot", async (req, res) => {
    await limit("forgot:" + req.ip, 5);
    const e = email(req.body.email),
      u = (
        await q("SELECT id FROM users WHERE email=$1 AND active=true", [e])
      )[0];
    if (u) {
      const token = crypto.randomBytes(32).toString("hex"),
        digest = crypto.createHash("sha256").update(token).digest("hex");
      await tx(async (c) => {
        await c.query("DELETE FROM resets WHERE user_id=$1", [u.id]);
        await c.query(
          "INSERT INTO resets VALUES($1,$2,NOW()+INTERVAL '15 minutes')",
          [digest, u.id],
        );
      });
      await sendMail(e, token);
    }
    res.json({
      message:
        "Nếu email tồn tại, mã đặt lại đã được gửi. Mở hộp thư để lấy mã (hiệu lực 15 phút).",
    });
  });
  app.post("/api/reset", async (req, res) => {
    await limit("reset:" + req.ip, 10);
    const digest = crypto
        .createHash("sha256")
        .update(text(req.body.token, 100))
        .digest("hex"),
      p = hash(password(req.body.password));
    await tx(async (c) => {
      const r = await c.query(
        "DELETE FROM resets WHERE hash=$1 AND expires>NOW() RETURNING user_id",
        [digest],
      );
      if (!r.rowCount) throw new Failure("Mã không đúng, đã dùng hoặc hết hạn");
      await c.query(
        "UPDATE users SET password=$1,version=version+1 WHERE id=$2",
        [p, r.rows[0].user_id],
      );
      await c.query("DELETE FROM resets WHERE user_id=$1", [r.rows[0].user_id]);
    });
    res.json({ message: "Đổi mật khẩu thành công, hãy đăng nhập" });
  });
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
  app.get("/api/categories", async (req, res) =>
    res.json(await q("SELECT * FROM categories ORDER BY name")),
  );
  app.post("/api/categories", staff, async (req, res) =>
    res
      .status(201)
      .json(
        (
          await q("INSERT INTO categories(name) VALUES($1) RETURNING *", [
            text(req.body.name, 100),
          ])
        )[0],
      ),
  );
  app.put("/api/categories/:id", staff, async (req, res) => {
    const r = await q("UPDATE categories SET name=$1 WHERE id=$2 RETURNING *", [
      text(req.body.name, 100),
      id(req.params.id),
    ]);
    if (!r.length) throw new Failure("Không tìm thấy", 404);
    res.json(r[0]);
  });
  app.delete("/api/categories/:id", staff, async (req, res) => {
    await q("DELETE FROM categories WHERE id=$1", [id(req.params.id)]);
    res.json({ message: "Đã xóa thể loại" });
  });
  app.get("/api/books", async (req, res) =>
    res.json(
      await q(
        "SELECT b.*,c.name category,b.quantity-(SELECT COUNT(*)::int FROM loans l WHERE l.book_id=b.id AND returned_at IS NULL) available FROM books b JOIN categories c ON c.id=b.category_id WHERE b.title ILIKE $1 OR b.author ILIKE $1 ORDER BY b.id DESC",
        ["%" + String(req.query.search || "").slice(0, 100) + "%"],
      ),
    ),
  );
  function book(b) {
    const n = Number(b.quantity);
    if (!Number.isInteger(n) || n < 0 || n > 10000)
      throw new Failure("Số lượng từ 0–10000");
    return [text(b.title), text(b.author, 100), id(b.category_id), n];
  }
  app.post("/api/books", staff, async (req, res) =>
    res
      .status(201)
      .json(
        (
          await q(
            "INSERT INTO books(title,author,category_id,quantity) VALUES($1,$2,$3,$4) RETURNING *",
            book(req.body),
          )
        )[0],
      ),
  );
  app.put("/api/books/:id", staff, async (req, res) => {
    const bid = id(req.params.id),
      v = book(req.body);
    await tx(async (c) => {
      if (
        !(await c.query("SELECT id FROM books WHERE id=$1 FOR UPDATE", [bid]))
          .rowCount
      )
        throw new Failure("Không tìm thấy", 404);
      const r = await c.query(
        "SELECT COUNT(*)::int n FROM loans WHERE book_id=$1 AND returned_at IS NULL",
        [bid],
      );
      if (v[3] < r.rows[0].n)
        throw new Failure("Số lượng không được nhỏ hơn số sách đang mượn");
      await c.query(
        "UPDATE books SET title=$1,author=$2,category_id=$3,quantity=$4 WHERE id=$5",
        [...v, bid],
      );
    });
    res.json({ message: "Đã sửa sách" });
  });
  app.delete("/api/books/:id", staff, async (req, res) => {
    await q("DELETE FROM books WHERE id=$1", [id(req.params.id)]);
    res.json({ message: "Đã xóa sách" });
  });
  app.get("/api/loans", async (req, res) =>
    res.json(
      await q(
        "SELECT l.*,b.title,u.name,u.email,(returned_at IS NULL AND due_date<(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) overdue FROM loans l JOIN books b ON b.id=l.book_id JOIN users u ON u.id=l.user_id WHERE ($1::int=0 OR user_id=$1) ORDER BY l.id DESC",
        [req.user.role === "reader" ? req.user.id : 0],
      ),
    ),
  );
  app.post("/api/loans", async (req, res) => {
    const bid = id(req.body.book_id),
      uid = req.user.role === "reader" ? req.user.id : id(req.body.user_id),
      due = text(req.body.due_date, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(due) ||
      Number.isNaN(Date.parse(due)) ||
      new Date(due).toISOString().slice(0, 10) !== due
    )
      throw new Failure("Ngày không hợp lệ");
    if (due < day(new Date()))
      throw new Failure("Hạn trả không được trước ngày mượn");
    const result = await tx(async (c) => {
      const u = (
        await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [uid])
      ).rows[0];
      if (!u || u.role !== "reader" || !u.active)
        throw new Failure("Chọn độc giả đang hoạt động");
      const b = (
        await c.query("SELECT * FROM books WHERE id=$1 FOR UPDATE", [bid])
      ).rows[0];
      if (!b) throw new Failure("Không có sách này");
      const n = (
        await c.query(
          "SELECT COUNT(*)::int n FROM loans WHERE book_id=$1 AND returned_at IS NULL",
          [bid],
        )
      ).rows[0].n;
      if (n >= b.quantity) throw new Failure("Sách đã hết");
      return (
        await c.query(
          "INSERT INTO loans(user_id,book_id,due_date) VALUES($1,$2,$3) RETURNING *",
          [uid, bid, due],
        )
      ).rows[0];
    });
    res.status(201).json(result);
  });
  app.post("/api/loans/:id/return", async (req, res) => {
    const r = await q(
      "UPDATE loans SET returned_at=NOW() WHERE id=$1 AND returned_at IS NULL AND ($2::int=0 OR user_id=$2) RETURNING *",
      [id(req.params.id), req.user.role === "reader" ? req.user.id : 0],
    );
    if (!r.length) throw new Failure("Phiếu không thuộc bạn hoặc đã trả", 403);
    res.json({ message: "Đã trả sách" });
  });
  app.get("/api/users", staff, async (req, res) =>
    res.json(
      await q(
        "SELECT id,name,email,role,phone,address,active FROM users WHERE ($1 OR role='reader') ORDER BY id",
        [req.user.role === "admin"],
      ),
    ),
  );
  app.post("/api/users", staff, async (req, res) => {
    const b = req.body;
    await q(
      "INSERT INTO users(name,email,password,phone,address) VALUES($1,$2,$3,$4,$5)",
      [
        text(b.name, 100),
        email(b.email),
        hash(password(b.password)),
        String(b.phone || "").slice(0, 20),
        String(b.address || "").slice(0, 200),
      ],
    );
    res.status(201).json({ message: "Đã tạo độc giả" });
  });
  app.put("/api/users/:id", staff, async (req, res) => {
    const b = req.body;
    const r = await q(
      "UPDATE users SET name=$1,phone=$2,address=$3 WHERE id=$4 AND ($5 OR role='reader') RETURNING id",
      [
        text(b.name, 100),
        String(b.phone || "").slice(0, 20),
        String(b.address || "").slice(0, 200),
        id(req.params.id),
        req.user.role === "admin",
      ],
    );
    if (!r.length) throw new Failure("Không thể sửa tài khoản này", 403);
    res.json({ message: "Đã sửa độc giả" });
  });
  app.delete("/api/users/:id", staff, async (req, res) => {
    await tx(async (c) => {
      const uid = id(req.params.id),
        u = (await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [uid]))
          .rows[0];
      if (!u || u.role !== "reader") throw new Failure("Chỉ được xóa độc giả");
      if (
        (
          await c.query(
            "SELECT id FROM loans WHERE user_id=$1 AND returned_at IS NULL",
            [uid],
          )
        ).rowCount
      )
        throw new Failure("Độc giả còn sách chưa trả");
      await c.query("DELETE FROM resets WHERE user_id=$1", [uid]);
      await c.query("DELETE FROM users WHERE id=$1", [uid]);
    });
    res.json({ message: "Đã xóa độc giả" });
  });
  app.put("/api/users/:id/role", admin, async (req, res) => {
    const uid = id(req.params.id),
      r = req.body.role;
    if (!roles.includes(r)) throw new Failure("Vai trò không hợp lệ");
    if (uid === req.user.id) throw new Failure("Không thể tự đổi quyền");
    await tx(async (c) => {
      const u = (
        await c.query("SELECT role FROM users WHERE id=$1 FOR UPDATE", [uid])
      ).rows[0];
      if (!u) throw new Failure("Không tìm thấy", 404);
      if (
        u.role === "reader" &&
        r !== "reader" &&
        (
          await c.query(
            "SELECT id FROM loans WHERE user_id=$1 AND returned_at IS NULL",
            [uid],
          )
        ).rowCount
      )
        throw new Failure("Độc giả phải trả hết sách trước khi đổi chức vụ");
      await c.query("UPDATE users SET role=$1,version=version+1 WHERE id=$2", [
        r,
        uid,
      ]);
    });
    res.json({ message: "Đã đổi chức vụ; người dùng cần đăng nhập lại" });
  });
  app.use(express.static(__dirname + "/static"));
  app.use((err, req, res, next) => {
    let status = err.status || 500,
      message = err.message;
    if (err.code === "23505") {
      status = 409;
      message = "Dữ liệu đã tồn tại hoặc bạn đang mượn sách này";
    }
    if (err.code === "23503") {
      status = 409;
      message =
        "Dữ liệu đang được sử dụng trong sách/phiếu mượn, không thể xóa; hoặc mã liên kết không tồn tại";
    }
    if (err.code === "23514" || err.code === "22008") {
      status = 400;
      message = "Ngày hoặc số lượng không hợp lệ";
    }
    if (status >= 500) {
      console.error("request_error", err.code || err.name);
      message = "Lỗi hệ thống, vui lòng thử lại";
    }
    res.status(status).json({ message });
  });
  return app;
};

module.exports = function registerRoutes(app, ctx) {
  const {
    q,
    tx,
    text,
    email,
    password,
    csrf,
    limit,
    Failure,
    hash,
    verify,
    crypto,
    sendMail,
  } = ctx;
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
};

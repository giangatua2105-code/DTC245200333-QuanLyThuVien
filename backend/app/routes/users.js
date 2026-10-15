module.exports = function registerRoutes(app, ctx) {
  const {
    q,
    tx,
    text,
    email,
    password,
    id,
    staff,
    admin,
    roles,
    Failure,
    hash,
  } = ctx;
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
};

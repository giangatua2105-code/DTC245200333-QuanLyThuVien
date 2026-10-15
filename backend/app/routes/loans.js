module.exports = function registerRoutes(app, ctx) {
  const { q, tx, text, id, day, Failure } = ctx;
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
};

module.exports = function registerRoutes(app, ctx) {
  const { q, tx, text, id, staff, Failure } = ctx;
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
};

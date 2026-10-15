// Scope every loan statistic to the logged-in reader; staff can view all.
module.exports = function registerStats(app, { q }) {
  app.get("/api/stats", async (req, res) => {
    const uid = req.user.role === "reader" ? req.user.id : 0;
    const [books, loans, readers, recent] = await Promise.all([
      q(
        "SELECT COUNT(*)::int titles, COALESCE(SUM(quantity),0)::int copies FROM books",
      ),
      q(
        "SELECT COUNT(*) FILTER (WHERE returned_at IS NULL)::int active, COUNT(*) FILTER (WHERE returned_at IS NULL AND due_date<(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::int overdue, COUNT(*) FILTER (WHERE returned_at IS NOT NULL)::int returned FROM loans WHERE ($1::int=0 OR user_id=$1)",
        [uid],
      ),
      uid
        ? Promise.resolve([])
        : q("SELECT COUNT(*)::int count FROM users WHERE role='reader'"),
      q(
        "SELECT l.id,l.borrowed_at,l.due_date,l.returned_at,b.title,u.name,(l.returned_at IS NULL AND l.due_date<(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) overdue FROM loans l JOIN books b ON b.id=l.book_id JOIN users u ON u.id=l.user_id WHERE ($1::int=0 OR l.user_id=$1) ORDER BY l.id DESC LIMIT 5",
        [uid],
      ),
    ]);
    res.json({
      books: books[0],
      loans: loans[0],
      readers: readers[0]?.count ?? null,
      recent,
    });
  });
};

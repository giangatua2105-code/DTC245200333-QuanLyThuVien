const db = require("./db"),
  { hash } = require("./password"),
  fs = require("fs");
(async () => {
  await db.query(fs.readFileSync(__dirname + "/schema.sql", "utf8"));
  for (const [email, name, role, key] of [
    ["admin@example.com", "Quản trị viên", "admin", "ADMIN_PASSWORD"],
    ["thuthu@example.com", "Thủ thư", "librarian", "LIBRARIAN_PASSWORD"],
    ["docgia@example.com", "Độc giả mẫu", "reader", "READER_PASSWORD"],
  ]) {
    if (!process.env[key] || process.env[key].length < 10)
      throw Error(key + " cần ít nhất 10 ký tự");
    await db.query(
      "INSERT INTO users(name,email,password,role) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING",
      [name, email, hash(process.env[key]), role],
    );
  }
  await db.query(
    "INSERT INTO categories(name) VALUES('Văn học'),('Công nghệ'),('Kỹ năng') ON CONFLICT DO NOTHING",
  );
  if (!(await db.query("SELECT id FROM books LIMIT 1")).rowCount)
    await db.query(
      "INSERT INTO books(title,author,category_id,quantity) VALUES('Dế Mèn phiêu lưu ký','Tô Hoài',(SELECT id FROM categories WHERE name='Văn học'),3),('Lập trình JavaScript','Nhóm tác giả',(SELECT id FROM categories WHERE name='Công nghệ'),2)",
    );
  await db.end();
  console.log("Khởi tạo hoàn tất");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

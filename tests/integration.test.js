const { test, before, after } = require("node:test"),
  assert = require("node:assert/strict"),
  request = require("supertest"),
  fs = require("fs");
const { PGlite } = require("@electric-sql/pglite"),
  { hash } = require("../app/password");
let db,
  app,
  admin,
  staff,
  reader,
  other,
  mail = [],
  category,
  book,
  loan;
async function csrf(agent) {
  return (await agent.get("/api/session")).body.csrf;
}
async function send(agent, url, method = "post", body = {}) {
  const token = await csrf(agent);
  return agent[method](url).set("X-CSRF-Token", token).send(body);
}
async function login(agent, email) {
  const r = await send(agent, "/api/login", "post", {
    email,
    password: "TestPass@12345",
  });
  assert.equal(r.status, 200, r.body.message);
}
before(async () => {
  process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long";
  db = new PGlite();
  await db.exec(fs.readFileSync(__dirname + "/../app/schema.sql", "utf8"));
  await db.exec("SET TIME ZONE 'Asia/Ho_Chi_Minh'");
  const adapter = {
    query: async (s, p = []) => {
      const r = await db.query(s, p);
      return { ...r, rowCount: r.rows.length || r.affectedRows || 0 };
    },
    connect: async () => ({ ...adapter, release() {} }),
  };
  for (const [name, email, role] of [
    ["Admin", "admin@test.vn", "admin"],
    ["Thủ thư", "staff@test.vn", "librarian"],
    ["Độc giả", "reader@test.vn", "reader"],
    ["Người khác", "other@test.vn", "reader"],
  ])
    await adapter.query(
      "INSERT INTO users(name,email,password,role) VALUES($1,$2,$3,$4)",
      [name, email, hash("TestPass@12345"), role],
    );
  app = require("../app/app")(adapter, async (to, token) =>
    mail.push({ to, token }),
  );
  admin = request.agent(app);
  staff = request.agent(app);
  reader = request.agent(app);
  other = request.agent(app);
  await login(admin, "admin@test.vn");
  await login(staff, "staff@test.vn");
  await login(reader, "reader@test.vn");
  await login(other, "other@test.vn");
});
after(async () => db.close());
test("Đăng ký lưu DB, không được tự chọn admin, chặn email trùng", async () => {
  const a = request.agent(app);
  let r = await send(a, "/api/register", "post", {
    name: "Bạn mới",
    email: "new@test.vn",
    password: "TestPass@12345",
    role: "admin",
  });
  assert.equal(r.status, 201);
  const u = (
    await db.query("SELECT * FROM users WHERE email=$1", ["new@test.vn"])
  ).rows[0];
  assert.equal(u.role, "reader");
  assert.notEqual(u.password, "TestPass@12345");
  r = await send(a, "/api/register", "post", {
    name: "Trùng",
    email: "new@test.vn",
    password: "TestPass@12345",
  });
  assert.equal(r.status, 409);
});
test("CSRF và quyền được kiểm tra tại backend", async () => {
  assert.equal((await reader.post("/api/books").send({})).status, 403);
  assert.equal(
    (await send(reader, "/api/categories", "post", { name: "X" })).status,
    403,
  );
  assert.equal((await request(app).get("/api/books")).status, 401);
});
test("Thủ thư thêm sửa thể loại và sách, dữ liệu tồn tại", async () => {
  let r = await send(staff, "/api/categories", "post", { name: "Công nghệ" });
  assert.equal(r.status, 201);
  category = r.body.id;
  r = await send(staff, "/api/books", "post", {
    title: "Node cơ bản",
    author: "Tủa",
    category_id: category,
    quantity: 1,
  });
  assert.equal(r.status, 201);
  book = r.body.id;
  r = await send(staff, "/api/books/" + book, "put", {
    title: "Node.js cơ bản",
    author: "Tủa",
    category_id: category,
    quantity: 1,
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await reader.get("/api/books?search=Node.js")).body[0].available,
    1,
  );
  assert.equal(
    (
      await send(staff, "/api/categories/" + category, "put", {
        name: "Lập trình",
      })
    ).status,
    200,
  );
});
test("Chặn hạn trước ngày mượn và ngày không tồn tại", async () => {
  assert.equal(
    (
      await send(reader, "/api/loans", "post", {
        book_id: book,
        due_date: "2000-01-01",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await send(reader, "/api/loans", "post", {
        book_id: book,
        due_date: "2099-02-30",
      })
    ).status,
    400,
  );
});
test("Độc giả tự mượn; không thể gán phiếu cho người khác", async () => {
  const r = await send(reader, "/api/loans", "post", {
    book_id: book,
    user_id: 4,
    due_date: "2099-01-01",
  });
  assert.equal(r.status, 201, r.body.message);
  assert.equal(r.body.user_id, 3);
  loan = r.body.id;
  assert.equal((await reader.get("/api/books")).body[0].available, 0);
  assert.equal((await other.get("/api/loans")).body.length, 0);
});
test("Chặn sách hết, giảm kho dưới số đang mượn, xóa dữ liệu có liên kết", async () => {
  assert.equal(
    (
      await send(other, "/api/loans", "post", {
        book_id: book,
        due_date: "2099-01-01",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await send(staff, "/api/books/" + book, "put", {
        title: "Node",
        author: "Tủa",
        category_id: category,
        quantity: 0,
      })
    ).status,
    400,
  );
  assert.equal((await send(staff, "/api/books/" + book, "delete")).status, 409);
  assert.equal(
    (await send(staff, "/api/categories/" + category, "delete")).status,
    409,
  );
  assert.equal((await send(staff, "/api/users/3", "delete")).status, 400);
});
test("Chỉ chủ phiếu hoặc thủ thư trả sách; không trả hai lần", async () => {
  assert.equal(
    (await send(other, "/api/loans/" + loan + "/return")).status,
    403,
  );
  assert.equal(
    (await send(reader, "/api/loans/" + loan + "/return")).status,
    200,
  );
  assert.equal(
    (await send(reader, "/api/loans/" + loan + "/return")).status,
    403,
  );
  assert.equal((await reader.get("/api/books")).body[0].available, 1);
  assert.ok((await reader.get("/api/loans")).body[0].returned_at);
});
test("Admin phân quyền; thủ thư không phân quyền; phiên cũ bị thu hồi", async () => {
  assert.equal(
    (await send(staff, "/api/users/4/role", "put", { role: "admin" })).status,
    403,
  );
  assert.equal(
    (await send(admin, "/api/users/1/role", "put", { role: "reader" })).status,
    400,
  );
  assert.equal(
    (await send(admin, "/api/users/4/role", "put", { role: "librarian" }))
      .status,
    200,
  );
  assert.equal((await other.get("/api/books")).status, 401);
  await login(other, "other@test.vn");
  assert.equal((await other.get("/api/session")).body.user.role, "librarian");
});
test("Quên mật khẩu: mã qua email, một lần, thu hồi phiên cũ", async () => {
  const a = request.agent(app);
  assert.equal(
    (await send(a, "/api/forgot", "post", { email: "reader@test.vn" })).status,
    200,
  );
  assert.equal(mail.length, 1);
  let r = await send(a, "/api/reset", "post", {
    token: mail[0].token,
    password: "NewPassword@12345",
  });
  assert.equal(r.status, 200, r.body.message);
  assert.equal((await reader.get("/api/books")).status, 401);
  assert.equal(
    (
      await send(a, "/api/reset", "post", {
        token: mail[0].token,
        password: "AgainPassword@12345",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await send(a, "/api/login", "post", {
        email: "reader@test.vn",
        password: "TestPass@12345",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await send(a, "/api/login", "post", {
        email: "reader@test.vn",
        password: "NewPassword@12345",
      })
    ).status,
    200,
  );
});
test("Thêm sửa xóa độc giả và xóa sách/thể loại chưa có lịch sử", async () => {
  let r = await send(staff, "/api/users", "post", {
    name: "Độc giả CRUD",
    email: "crud@test.vn",
    password: "TestPass@12345",
    phone: "0912345678",
    address: "Bắc Giang",
  });
  assert.equal(r.status, 201);
  let u = (await staff.get("/api/users")).body.find(
    (u) => u.email === "crud@test.vn",
  );
  assert.equal(
    (
      await send(staff, "/api/users/" + u.id, "put", {
        name: "Đã sửa",
        phone: "0987654321",
        address: "Hà Nội",
      })
    ).status,
    200,
  );
  assert.equal((await send(staff, "/api/users/" + u.id, "delete")).status, 200);
  r = await send(staff, "/api/categories", "post", { name: "Để xóa" });
  const cid = r.body.id;
  r = await send(staff, "/api/books", "post", {
    title: "Sách xóa",
    author: "A",
    category_id: cid,
    quantity: 2,
  });
  assert.equal(
    (await send(staff, "/api/books/" + r.body.id, "delete")).status,
    200,
  );
  assert.equal(
    (await send(staff, "/api/categories/" + cid, "delete")).status,
    200,
  );
});
test("Thủ thư mượn và trả hộ, trạng thái quá hạn theo thời gian DB", async () => {
  const r = await send(staff, "/api/loans", "post", {
    book_id: book,
    user_id: 3,
    due_date: "2099-01-01",
  });
  assert.equal(r.status, 201);
  await db.query(
    "UPDATE loans SET borrowed_at='2020-01-01',due_date='2020-01-02' WHERE id=$1",
    [r.body.id],
  );
  assert.equal((await staff.get("/api/loans")).body[0].overdue, true);
  assert.equal(
    (await send(staff, "/api/loans/" + r.body.id + "/return")).status,
    200,
  );
});
test("Mã reset hết hạn bị chặn, logout và health/metrics", async () => {
  const a = request.agent(app);
  await send(a, "/api/forgot", "post", { email: "reader@test.vn" });
  await db.exec("UPDATE resets SET expires=NOW()-INTERVAL '1 minute'");
  assert.equal(
    (
      await send(a, "/api/reset", "post", {
        token: mail.at(-1).token,
        password: "OtherPassword@12345",
      })
    ).status,
    400,
  );
  assert.equal((await send(staff, "/api/logout")).status, 200);
  assert.equal((await staff.get("/api/books")).status, 401);
  assert.equal((await request(app).get("/health")).status, 200);
  assert.match(
    (await request(app).get("/metrics")).text,
    /library_http_requests_total/,
  );
});
test("Database trực tiếp chặn hạn trước ngày mượn và trả trước lúc mượn", async () => {
  await assert.rejects(
    () =>
      db.query(
        "INSERT INTO loans(user_id,book_id,borrowed_at,due_date) VALUES(3,$1,'2026-10-14T08:00:00+07','2026-10-13')",
        [book],
      ),
    (e) => e.code === "23514",
  );
  await assert.rejects(
    () =>
      db.query(
        "INSERT INTO loans(user_id,book_id,borrowed_at,due_date,returned_at) VALUES(3,$1,'2026-10-14T08:00:00+07','2026-10-15','2026-10-14T07:00:00+07')",
        [book],
      ),
    (e) => e.code === "23514",
  );
});
test("Chặn mượn trùng dù kho vẫn còn cuốn khác", async () => {
  assert.equal(
    (
      await send(admin, "/api/books/" + book, "put", {
        title: "Node.js cơ bản",
        author: "Tủa",
        category_id: category,
        quantity: 2,
      })
    ).status,
    200,
  );
  const a = request.agent(app);
  assert.equal(
    (
      await send(a, "/api/login", "post", {
        email: "reader@test.vn",
        password: "NewPassword@12345",
      })
    ).status,
    200,
  );
  let r = await send(a, "/api/loans", "post", {
    book_id: book,
    due_date: "2099-01-01",
  });
  assert.equal(r.status, 201);
  const lid = r.body.id;
  assert.equal(
    (
      await send(a, "/api/loans", "post", {
        book_id: book,
        due_date: "2099-01-01",
      })
    ).status,
    409,
  );
  assert.equal((await send(a, "/api/loans/" + lid + "/return")).status, 200);
});

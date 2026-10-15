const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state = {},
  tab = "books",
  records = [],
  cats = [],
  users = [],
  search = "";
const roleName = { reader: "Độc giả", librarian: "Thủ thư", admin: "Admin" };
async function api(path, method = "GET", data) {
  const r = await fetch("/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": state.csrf || "",
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const b = await r.json();
  if (!r.ok) throw Error(b.message || "Không thể xử lý");
  return b;
}
function notify(m) {
  $("#notice").textContent = m;
}
function run(fn) {
  return async () => {
    try {
      await fn();
    } catch (e) {
      notify(e.message);
    }
  };
}
async function boot() {
  state = await api("/session");
  $("#identity").innerHTML = state.user
    ? `${esc(state.user.name)} · ${roleName[state.user.role]} <button id="logout">Đăng xuất</button>`
    : "";
  $("#workspace").hidden = !state.user;
  if (!state.user) {
    auth("login");
    return;
  }
  $("#auth").innerHTML = "";
  $("#logout").onclick = run(async () => {
    await api("/logout", "POST");
    tab = "books";
    await boot();
  });
  const tabs = [
    ["books", "Kho sách"],
    ["loans", state.user.role === "reader" ? "Sách tôi mượn" : "Mượn / Trả"],
    ...(state.user.role !== "reader"
      ? [
          ["categories", "Thể loại"],
          [
            "users",
            state.user.role === "admin" ? "Người dùng & Phân quyền" : "Độc giả",
          ],
        ]
      : []),
  ];
  if (!tabs.some((t) => t[0] === tab)) tab = "books";
  $("#nav").innerHTML = tabs
    .map(
      ([id, n]) =>
        `<button data-tab="${id}" class="${id === tab ? "active" : ""}">${n}</button>`,
    )
    .join("");
  $("#nav")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = run(async () => {
          tab = b.dataset.tab;
          search = "";
          await boot();
        })),
    );
  await render();
}
function auth(mode) {
  const names = {
    login: "Đăng nhập",
    register: "Đăng ký",
    forgot: "Quên mật khẩu",
    reset: "Đặt lại mật khẩu",
  };
  $("#auth").innerHTML =
    `<div class="auth-tabs">${["login", "register", "forgot"].map((m) => `<button data-mode="${m}" class="secondary">${names[m]}</button>`).join("")}</div><h2>${names[mode]}</h2><form id="authForm">${mode === "register" ? '<label for="auth-name">Họ tên</label><input id="auth-name" name="name" required maxlength="100" autocomplete="name">' : ""}${mode !== "reset" ? '<label for="auth-email">Email</label><input id="auth-email" name="email" type="email" required maxlength="200" autocomplete="email">' : '<label for="auth-token">Mã từ email</label><input id="auth-token" name="token" required maxlength="64" autocomplete="off">'}${mode !== "forgot" ? '<label for="auth-password">Mật khẩu (ít nhất 10 ký tự)</label><input id="auth-password" name="password" type="password" required minlength="10" maxlength="128" autocomplete="' + (mode === "login" ? "current-password" : "new-password") + '">' : ""}<button class="wide">${names[mode]}</button></form>${mode === "forgot" ? '<p>Chạy thử: mở <a href="http://localhost:8025" target="_blank" rel="noopener">hộp thư Mailpit</a> để lấy mã.</p><button id="resetLink" class="secondary">Tôi đã có mã đặt lại</button>' : ""}`;
  $("#auth")
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.onclick = () => auth(b.dataset.mode)));
  if ($("#resetLink")) $("#resetLink").onclick = () => auth("reset");
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.submitter;
    b.disabled = true;
    try {
      const r = await api(
        "/" + mode,
        "POST",
        Object.fromEntries(new FormData(e.target)),
      );
      notify(r.message);
      if (mode === "login") await boot();
      else if (mode === "register" || mode === "reset") auth("login");
    } catch (err) {
      notify(err.message);
    } finally {
      b.disabled = false;
    }
  };
}
function field(name, label, value = "", type = "text", extra = "") {
  return `<label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
}
function select(name, label, items, value) {
  return `<label for="field-${name}">${label}</label><select id="field-${name}" name="${name}" required>${items.map((i) => `<option value="${i.id}" ${String(i.id) === String(value) ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select>`;
}
function modal(title, fields, save) {
  $("#modalTitle").textContent = title;
  $("#fields").innerHTML = fields;
  $("#formError").textContent = "";
  $("#modal").showModal();
  $("#cancel").onclick = () => $("#modal").close();
  $("#editor").onsubmit = async (e) => {
    e.preventDefault();
    e.submitter.disabled = true;
    try {
      await save(Object.fromEntries(new FormData(e.target)));
      $("#modal").close();
      notify("Đã lưu thành công");
      await render();
    } catch (err) {
      $("#formError").textContent = err.message;
    } finally {
      e.submitter.disabled = false;
    }
  };
}
async function render() {
  const staff = state.user.role !== "reader";
  $("#add").hidden = !staff;
  $("#filters").innerHTML = "";
  const titles = {
    books: "Kho sách",
    loans: "Mượn và trả sách",
    categories: "Thể loại sách",
    users:
      state.user.role === "admin"
        ? "Người dùng & Phân quyền"
        : "Quản lý độc giả",
  };
  $("#title").textContent = titles[tab];
  $("#subtitle").textContent =
    tab === "loans"
      ? "Hạn trả không trước ngày mượn. Ngày trả ghi tự động theo thời gian hệ thống."
      : "Tìm kiếm và quản lý dữ liệu thư viện.";
  cats = await api("/categories");
  if (staff) users = await api("/users");
  records = await api(
    "/" +
      tab +
      (tab === "books" ? "?search=" + encodeURIComponent(search) : ""),
  );
  if (tab === "books") {
    $("#filters").innerHTML =
      '<form id="searchForm"><input id="search" placeholder="Tìm tên sách hoặc tác giả" value="' +
      esc(search) +
      '"></form>';
    $("#searchForm").onsubmit = async (e) => {
      e.preventDefault();
      search = $("#search").value;
      try {
        await render();
      } catch (err) {
        notify(err.message);
      }
    };
    $("#content").innerHTML =
      '<div class="cards">' +
      records
        .map(
          (b) =>
            `<article class="card"><span class="tag">${esc(b.category)}</span><h3>${esc(b.title)}</h3><p>${esc(b.author)}</p><p>Còn <b>${b.available}</b> / ${b.quantity} cuốn</p><div class="actions"><button data-action="borrow" data-id="${b.id}" ${b.available < 1 ? "disabled" : ""}>Mượn sách</button>${staff ? `<button class="secondary" data-action="edit" data-id="${b.id}">Sửa</button><button class="danger" data-action="delete" data-id="${b.id}">Xóa</button>` : ""}</div></article>`,
        )
        .join("") +
      "</div>";
  } else {
    const heads =
      tab === "loans"
        ? [
            "Mã",
            "Độc giả",
            "Sách",
            "Ngày mượn",
            "Hạn trả",
            "Trạng thái",
            "Thao tác",
          ]
        : tab === "categories"
          ? ["Mã", "Tên thể loại", "Thao tác"]
          : ["Họ tên", "Email", "Chức vụ", "Điện thoại / Địa chỉ", "Thao tác"];
    $("#content").innerHTML =
      '<div class="tablewrap"><table><thead><tr>' +
      heads.map((h) => `<th>${h}</th>`).join("") +
      "</tr></thead><tbody>" +
      records
        .map((r) => {
          let cells;
          if (tab === "loans")
            cells = [
              r.id,
              esc(r.name),
              esc(r.title),
              esc(formatTime(r.borrowed_at)),
              esc(String(r.due_date).slice(0, 10)),
              r.returned_at
                ? "Đã trả: " + esc(formatTime(r.returned_at))
                : r.overdue
                  ? '<b class="overdue">Quá hạn</b>'
                  : "Đang mượn",
              r.returned_at
                ? "—"
                : `<button data-action="return" data-id="${r.id}">Trả sách</button>`,
            ];
          else if (tab === "categories")
            cells = [
              r.id,
              esc(r.name),
              `<button data-action="edit" data-id="${r.id}">Sửa</button><button class="danger" data-action="delete" data-id="${r.id}">Xóa</button>`,
            ];
          else
            cells = [
              esc(r.name),
              esc(r.email),
              roleName[r.role],
              esc(r.phone) + "<br>" + esc(r.address),
              `<button data-action="edit" data-id="${r.id}">Sửa</button>${r.role === "reader" ? `<button class="danger" data-action="delete" data-id="${r.id}">Xóa</button>` : ""}${state.user.role === "admin" && r.id !== state.user.id ? `<button class="secondary" data-action="role" data-id="${r.id}">Phân quyền</button>` : ""}`,
            ];
          return (
            "<tr>" + cells.map((v) => "<td>" + v + "</td>").join("") + "</tr>"
          );
        })
        .join("") +
      "</tbody></table></div>";
  }
  if (!records.length)
    $("#content").innerHTML = '<div class="empty">Chưa có dữ liệu.</div>';
  $("#add").hidden = !staff || tab === "loans";
  $("#add").onclick = run(async () => edit());
  $("#content")
    .querySelectorAll("[data-action]")
    .forEach(
      (b) =>
        (b.onclick = run(async () => {
          const r = records.find((r) => r.id === Number(b.dataset.id)),
            a = b.dataset.action;
          if (a === "edit") edit(r);
          if (
            a === "delete" &&
            confirm(
              "Xóa dữ liệu này? Dữ liệu đã có lịch sử mượn sẽ được giữ lại.",
            )
          ) {
            notify((await api("/" + tab + "/" + r.id, "DELETE")).message);
            await render();
          }
          if (a === "return" && confirm("Xác nhận đã trả sách?")) {
            notify(
              (await api("/loans/" + r.id + "/return", "POST", {})).message,
            );
            await render();
          }
          if (a === "role")
            modal(
              "Phân quyền cho " + r.name,
              select(
                "role",
                "Chức vụ",
                Object.entries(roleName).map(([id, name]) => ({ id, name })),
                r.role,
              ),
              (b) => api("/users/" + r.id + "/role", "PUT", b),
            );
          if (a === "borrow") {
            state = await api("/session");
            if (!state.user) return boot();
            const readers = users.filter(
              (u) => u.role === "reader" && u.active,
            );
            if (staff && !readers.length) throw Error("Hãy thêm độc giả trước");
            const due = new Date(
              new Date(state.serverTime).getTime() + 14 * 86400000,
            );
            const future = new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Ho_Chi_Minh",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(due);
            modal(
              "Mượn: " + r.title,
              (staff
                ? select("user_id", "Độc giả", readers)
                : "<p>Người mượn: " + esc(state.user.name) + "</p>") +
                field(
                  "due_date",
                  "Hạn trả",
                  future,
                  "date",
                  `required min="${state.today}"`,
                ),
              (b) => api("/loans", "POST", { ...b, book_id: r.id }),
            );
          }
        })),
    );
}
function edit(r = {}) {
  let f;
  if (tab === "books") {
    if (!cats.length) throw Error("Thêm thể loại trước");
    f =
      field("title", "Tên sách", r.title, "text", 'required maxlength="200"') +
      field("author", "Tác giả", r.author, "text", 'required maxlength="100"') +
      select("category_id", "Thể loại", cats, r.category_id) +
      field(
        "quantity",
        "Tổng số cuốn",
        r.quantity ?? 1,
        "number",
        'required min="0" max="10000"',
      );
  } else if (tab === "categories")
    f = field(
      "name",
      "Tên thể loại",
      r.name,
      "text",
      'required maxlength="100"',
    );
  else
    f =
      field("name", "Họ tên", r.name, "text", 'required maxlength="100"') +
      (!r.id
        ? field("email", "Email", "", "email", 'required maxlength="200"') +
          field(
            "password",
            "Mật khẩu ban đầu",
            "",
            "password",
            'required minlength="10" maxlength="128"',
          )
        : "") +
      field("phone", "Điện thoại", r.phone, "text", 'maxlength="20"') +
      field("address", "Địa chỉ", r.address, "text", 'maxlength="200"');
  modal(
    (r.id ? "Sửa" : "Thêm") +
      " " +
      { books: "sách", categories: "thể loại", users: "độc giả" }[tab],
    f,
    (b) => api("/" + tab + (r.id ? "/" + r.id : ""), r.id ? "PUT" : "POST", b),
  );
}
function formatTime(s) {
  return new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}
setInterval(() => {
  if (state.user && tab === "loans" && !$("#modal").open)
    render().catch((e) => notify(e.message));
}, 60000);
boot().catch((e) => notify(e.message));

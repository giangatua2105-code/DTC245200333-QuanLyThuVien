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
const roleName = { reader: "Độc giả", librarian: "Thủ thư", admin: "Admin" },
  navSymbol = {
    dashboard: "▦",
    books: "▤",
    loans: "⇄",
    categories: "▧",
    users: "♙",
  };
let state = {},
  tab = "dashboard",
  records = [],
  cats = [],
  users = [],
  search = "",
  filter = "",
  page = 1,
  renderVersion = 0,
  toastTimer;
async function api(path, method = "GET", data) {
  let r;
  try {
    r = await fetch("/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": state.csrf || "",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
  } catch {
    throw Error("Không kết nối được hệ thống. Kiểm tra kết nối và thử lại.");
  }
  let b;
  try {
    b = await r.json();
  } catch {
    throw Error("Hệ thống chưa sẵn sàng. Vui lòng thử lại.");
  }
  if (!r.ok) {
    const e = Error(b.message || "Không thể xử lý");
    e.status = r.status;
    throw e;
  }
  return b;
}
function notify(message, kind = "success") {
  $("#notice").textContent = message;
  $("#notice").dataset.kind = kind;
  $("#notice").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#notice").hidden = true), 7000);
}
function run(fn) {
  return async () => {
    try {
      await fn();
    } catch (e) {
      notify(e.message, "error");
      if (e.status === 401) await boot().catch(() => {});
    }
  };
}
async function boot() {
  state = await api("/session");
  $("#authLayout").hidden = !!state.user;
  $("#shell").hidden = !state.user;
  if (!state.user) {
    auth("login");
    return;
  }
  $("#auth").innerHTML = "";
  const name = state.user.name,
    initials = name
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((x) => x[0])
      .join("")
      .toUpperCase();
  $("#identity").innerHTML =
    `<div class="user-profile"><span class="avatar">${esc(initials)}</span><div class="user-info"><strong>${esc(name)}</strong><small>${roleName[state.user.role]}</small></div></div><button id="logout">Đăng xuất</button>`;
  $("#logout").onclick = run(async () => {
    await api("/logout", "POST");
    tab = "dashboard";
    search = "";
    filter = "";
    page = 1;
    await boot();
  });
  $("#today").textContent = new Date(state.serverTime).toLocaleDateString(
    "vi-VN",
    {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    },
  );
  const tabs = [
    ["dashboard", "Tổng quan"],
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
  if (!tabs.some((t) => t[0] === tab)) tab = "dashboard";
  $("#nav").innerHTML = tabs
    .map(
      ([id, n]) =>
        `<button data-tab="${id}" class="${id === tab ? "active" : ""}" ${id === tab ? 'aria-current="page"' : ""}><span class="nav-symbol" aria-hidden="true">${navSymbol[id]}</span>${n}</button>`,
    )
    .join("");
  $("#nav")
    .querySelectorAll("button")
    .forEach((b) => (b.onclick = run(() => navigate(b.dataset.tab))));
  await render();
}
async function navigate(target) {
  tab = target;
  search = "";
  filter = "";
  page = 1;
  await boot();
}
function auth(mode) {
  const names = {
      login: "Đăng nhập",
      register: "Đăng ký",
      forgot: "Quên mật khẩu",
      reset: "Đặt lại mật khẩu",
    },
    descriptions = {
      login:
        "Tiếp tục hành trình đọc của bạn. Đăng nhập để mượn sách và theo dõi hạn trả.",
      register: "Tạo tài khoản độc giả để khám phá và mượn sách từ thư viện.",
      forgot:
        "Nhập email tài khoản. Chúng tôi sẽ gửi mã để bạn đặt lại mật khẩu.",
      reset: "Nhập mã trong email và tạo mật khẩu mới cho tài khoản.",
    };
  $("#auth").innerHTML =
    `<div class="auth-tabs">${["login", "register", "forgot"].map((m) => `<button data-mode="${m}" class="${m === mode ? "selected" : ""}">${names[m]}</button>`).join("")}</div><h2>${names[mode]}</h2><p class="auth-description">${descriptions[mode]}</p><form id="authForm">${mode === "register" ? field("name", "Họ và tên", "", "text", 'required maxlength="100" autocomplete="name" placeholder="Nhập họ và tên"') : ""}${mode !== "reset" ? field("email", "Địa chỉ email", "", "email", 'required maxlength="200" autocomplete="email" placeholder="ban@example.com"') : field("token", "Mã đặt lại mật khẩu", "", "text", 'required minlength="64" maxlength="64" autocomplete="off" placeholder="Dán mã từ email"')}${mode !== "forgot" ? '<label for="authPassword">' + (mode === "reset" ? "Mật khẩu mới" : "Mật khẩu") + '</label><div class="password-wrap"><input id="authPassword" name="password" type="password" required minlength="10" maxlength="128" autocomplete="' + (mode === "login" ? "current-password" : "new-password") + '" placeholder="Ít nhất 10 ký tự"><button type="button" class="password-toggle" aria-label="Hiện mật khẩu">Hiện</button></div>' : ""}<button class="wide" type="submit">${names[mode]} <span aria-hidden="true">→</span></button><p id="authError" class="error" role="alert"></p></form>${mode === "forgot" ? '<p class="auth-note">Bản chạy thử: lấy mã tại <a id="mailLink" href="#" target="_blank" rel="noopener">hộp thư Mailpit</a>.</p><button id="resetLink" class="text-button">Tôi đã có mã đặt lại →</button>' : '<p class="auth-note">' + (mode === "register" ? "Tài khoản đăng ký mới có chức vụ Độc giả." : "Chức vụ và quyền được cấp bởi quản trị viên thư viện.") + "</p>"}`;
  $("#auth")
    .querySelectorAll("[data-mode]")
    .forEach((b) => (b.onclick = () => auth(b.dataset.mode)));
  if ($("#mailLink")) {
    const url = new URL(location.href);
    url.port = "8025";
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    $("#mailLink").href = url.href;
  }
  if ($("#resetLink")) $("#resetLink").onclick = () => auth("reset");
  const toggle = $(".password-toggle");
  if (toggle)
    toggle.onclick = () => {
      const input = $("#authPassword"),
        show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.textContent = show ? "Ẩn" : "Hiện";
      toggle.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
    };
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector("[type=submit]");
    b.disabled = true;
    $("#authError").textContent = "";
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
      $("#authError").textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
}
function field(name, label, value = "", type = "text", extra = "") {
  return `<label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
}
function select(name, label, items, value) {
  return `<label for="field-${name}">${label}</label><select id="field-${name}" name="${name}" required>${items.map((i) => `<option value="${esc(i.id)}" ${String(i.id) === String(value) ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select>`;
}
function modal(title, fields, save) {
  $("#modalTitle").textContent = title;
  $("#fields").innerHTML = fields;
  $("#formError").textContent = "";
  $("#save").textContent = "Lưu";
  $("#modal").showModal();
  $("#cancel").onclick = $("#closeModal").onclick = () => $("#modal").close();
  $("#editor").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.submitter || $("#save");
    b.disabled = true;
    b.textContent = "Đang lưu…";
    try {
      const out = await save(Object.fromEntries(new FormData(e.target)));
      $("#modal").close();
      notify(out?.message || "Đã lưu thành công");
      await render();
    } catch (err) {
      $("#formError").textContent = err.message;
    } finally {
      b.disabled = false;
      b.textContent = "Lưu";
    }
  };
}
function ask(message, danger = false) {
  return new Promise((resolve) => {
    const dialog = $("#confirmDialog");
    $("#confirmMessage").textContent = message;
    $("#confirmOK").className = danger ? "danger" : "";
    dialog.showModal();
    let done = false;
    function finish(v) {
      if (done) return;
      done = true;
      dialog.close();
      resolve(v);
    }
    $("#confirmCancel").onclick = () => finish(false);
    $("#confirmOK").onclick = () => finish(true);
    dialog.oncancel = (e) => {
      e.preventDefault();
      finish(false);
    };
  });
}
const empty = (
  title = "Chưa có dữ liệu",
  detail = "Dữ liệu sẽ hiển thị tại đây khi có thao tác mới.",
) =>
  `<div class="empty"><div class="empty-symbol" aria-hidden="true">▤</div><h3>${title}</h3><p>${detail}</p></div>`;
function status(r) {
  return `<span class="badge ${r.returned_at ? "returned" : r.overdue ? "late" : ""}">${r.returned_at ? "Đã trả" : r.overdue ? "Quá hạn" : "Đang mượn"}</span>`;
}
async function render() {
  const version = ++renderVersion,
    staff = state.user.role !== "reader";
  const titles = {
      dashboard: "Tổng quan",
      books: "Kho sách",
      loans: staff ? "Quản lý mượn & trả" : "Sách tôi mượn",
      categories: "Thể loại sách",
      users:
        state.user.role === "admin"
          ? "Người dùng & Phân quyền"
          : "Quản lý độc giả",
    },
    subtitles = {
      dashboard: "Một góc nhìn rõ ràng về hoạt động thư viện của bạn.",
      books: "Tìm cuốn sách tiếp theo và bắt đầu một hành trình mới.",
      loans: "Theo dõi lịch sử, hạn trả và xác nhận trả sách ngay tại đây.",
      categories:
        "Sắp xếp kho sách theo từng lĩnh vực, dễ tìm kiếm và quản lý.",
      users: "Quản lý thông tin độc giả và chức vụ trong hệ thống.",
    };
  $("#title").textContent = titles[tab];
  $("#breadcrumb").textContent = titles[tab];
  $("#subtitle").textContent = subtitles[tab];
  $("#pageLabel").textContent = staff ? "QUẢN LÝ THƯ VIỆN" : "THƯ VIỆN CỦA BẠN";
  $("#overview").hidden = tab !== "dashboard";
  $("#filters").hidden = tab === "dashboard";
  $("#content").hidden = tab === "dashboard";
  $("#pagination").hidden = tab === "dashboard";
  $("#add").hidden = !staff || ["dashboard", "loans"].includes(tab);
  $("#add").textContent =
    tab === "books"
      ? "+ Thêm sách"
      : tab === "categories"
        ? "+ Thêm thể loại"
        : "+ Thêm độc giả";
  $("#add").onclick = run(() => edit());
  if (tab === "dashboard") {
    const stats = await api("/stats");
    if (version !== renderVersion) return;
    dashboard(stats);
    return;
  }
  $("#content").innerHTML =
    '<div class="loading"><div class="spinner"></div>Đang tải dữ liệu…</div>';
  const results = await Promise.all([
    api("/categories"),
    staff ? api("/users") : Promise.resolve([]),
    api("/" + tab),
  ]);
  if (version !== renderVersion) return;
  [cats, users, records] = results;
  toolbar();
  draw();
}
function dashboard(s) {
  const staff = state.user.role !== "reader",
    cards = [
      ["Đầu sách", s.books.titles, s.books.copies + " cuốn trong kho", "▤"],
      [
        staff ? "Phiếu đang mượn" : "Sách đang mượn",
        s.loans.active,
        "Chưa xác nhận trả sách",
        "⇄",
      ],
      ["Phiếu quá hạn", s.loans.overdue, "Cần ưu tiên trả sách", "◷"],
      [
        staff ? "Độc giả" : "Lượt đã trả",
        staff ? s.readers : s.loans.returned,
        staff ? "Tài khoản độc giả trong thư viện" : "Lịch sử trả sách của bạn",
        "♙",
      ],
    ];
  $("#overview").innerHTML =
    `<div class="hero"><div><span class="eyebrow">CHÀO MỪNG TRỞ LẠI</span><h2>Xin chào, ${esc(state.user.name)}.</h2><p>${staff ? "Quản lý kho sách và các lượt mượn trong một không gian. Bắt đầu bằng việc kiểm tra các phiếu đang mượn." : "Cuốn sách tiếp theo đang chờ bạn. Khám phá kho sách hoặc kiểm tra hạn trả của những cuốn đang mượn."}</p><button id="explore">Khám phá kho sách <span aria-hidden="true">→</span></button></div><div class="hero-decoration" aria-hidden="true">L</div></div><div class="stats">${cards.map(([name, value, note, symbol], i) => `<article class="stat ${i === 2 && value > 0 ? "alert" : ""}"><div class="stat-top"><span>${name}</span><span class="stat-symbol" aria-hidden="true">${symbol}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`).join("")}</div><div class="section-heading"><h2>Hoạt động mượn gần đây</h2><button id="allLoans" class="text-button">Xem tất cả →</button></div>${s.recent.length ? `<div class="tablewrap"><table><thead><tr><th>PHIẾU</th><th>SÁCH / ĐỘC GIẢ</th><th>HẠN TRẢ</th><th>TRẠNG THÁI</th></tr></thead><tbody>${s.recent.map((r) => `<tr><td>#${r.id}</td><td><strong>${esc(r.title)}</strong><small>${esc(r.name)}</small></td><td>${dateOnly(r.due_date)}</td><td>${status(r)}</td></tr>`).join("")}</tbody></table></div>` : empty("Chưa có lượt mượn", "Khám phá kho sách và tạo lượt mượn đầu tiên.")}`;
  $("#explore").onclick = run(() => navigate("books"));
  $("#allLoans").onclick = run(() => navigate("loans"));
}
function toolbar() {
  const options =
    tab === "books"
      ? '<option value="">Tất cả thể loại</option>' +
        cats
          .map(
            (c) =>
              `<option value="${c.id}" ${String(c.id) === filter ? "selected" : ""}>${esc(c.name)}</option>`,
          )
          .join("")
      : tab === "loans"
        ? ["", "active", "overdue", "returned"]
            .map(
              (v, i) =>
                `<option value="${v}" ${filter === v ? "selected" : ""}>${["Tất cả trạng thái", "Đang mượn", "Quá hạn", "Đã trả"][i]}</option>`,
            )
            .join("")
        : tab === "users" && state.user.role === "admin"
          ? '<option value="">Tất cả chức vụ</option>' +
            Object.entries(roleName)
              .map(
                ([v, n]) =>
                  `<option value="${v}" ${filter === v ? "selected" : ""}>${n}</option>`,
              )
              .join("")
          : "";
  $("#filters").innerHTML =
    `<form id="searchForm"><div class="search-wrap"><span class="search-symbol" aria-hidden="true">⌕</span><input id="search" aria-label="Tìm kiếm" placeholder="${tab === "books" ? "Tìm tên sách, tác giả…" : tab === "loans" ? "Tìm tên sách, độc giả, mã phiếu…" : "Tìm kiếm tên, email…"}" value="${esc(search)}"></div></form>${options ? '<select id="filter" aria-label="Bộ lọc">' + options + "</select>" : ""}<span id="resultCount" class="result-count"></span>`;
  $("#searchForm").onsubmit = (e) => {
    e.preventDefault();
    search = $("#search").value;
    page = 1;
    draw();
  };
  $("#search").oninput = () => {
    search = $("#search").value;
    page = 1;
    draw();
  };
  if ($("#filter"))
    $("#filter").onchange = () => {
      filter = $("#filter").value;
      page = 1;
      draw();
    };
}
function draw() {
  const query = search.toLocaleLowerCase("vi"),
    staff = state.user.role !== "reader";
  let items = records.filter((r) =>
    [r.title, r.author, r.name, r.email, r.phone, r.address, r.id].some((v) =>
      String(v ?? "")
        .toLocaleLowerCase("vi")
        .includes(query),
    ),
  );
  if (filter)
    items = items.filter((r) =>
      tab === "books"
        ? String(r.category_id) === filter
        : tab === "loans"
          ? filter === "returned"
            ? !!r.returned_at
            : filter === "overdue"
              ? !r.returned_at && r.overdue
              : !r.returned_at
          : tab === "users"
            ? r.role === filter
            : true,
    );
  const size = tab === "books" ? 6 : 8,
    total = items.length,
    pages = Math.max(1, Math.ceil(total / size));
  page = Math.min(page, pages);
  const rows = items.slice((page - 1) * size, page * size);
  $("#resultCount").textContent = total + " kết quả";
  if (!total)
    $("#content").innerHTML = empty(
      search || filter ? "Không tìm thấy kết quả" : "Chưa có dữ liệu",
      search || filter
        ? "Thử một từ khóa hoặc bộ lọc khác."
        : "Thêm dữ liệu để bắt đầu quản lý thư viện.",
    );
  else if (tab === "books")
    $("#content").innerHTML =
      '<div class="cards">' +
      rows
        .map(
          (b) =>
            `<article class="card"><div class="book-cover cover-${b.id % 4}"><div class="cover-book"><span aria-hidden="true">${esc(b.title[0]?.toUpperCase() || "L")}</span></div><span class="tag">${esc(b.category)}</span></div><div class="card-body"><h3>${esc(b.title)}</h3><p class="author">${esc(b.author)}</p><div class="stock"><span>Có thể mượn</span><strong>${b.available} / ${b.quantity} cuốn</strong></div><div class="actions"><button class="borrow-button" data-action="borrow" data-id="${b.id}" ${b.available < 1 ? "disabled" : ""}>${b.available < 1 ? "Hết sách" : "Mượn sách"}</button>${staff ? `<button class="secondary" data-action="edit" data-id="${b.id}">Sửa</button><button class="danger" data-action="delete" data-id="${b.id}">Xóa</button>` : ""}</div></div></article>`,
        )
        .join("") +
      "</div>";
  else {
    const heads =
      tab === "loans"
        ? [
            "PHIẾU",
            "SÁCH / ĐỘC GIẢ",
            "NGÀY MƯỢN",
            "HẠN TRẢ",
            "TRẠNG THÁI",
            "THAO TÁC",
          ]
        : tab === "categories"
          ? ["MÃ", "THỂ LOẠI", "THAO TÁC"]
          : ["NGƯỜI DÙNG", "CHỨC VỤ", "LIÊN HỆ", "THAO TÁC"];
    $("#content").innerHTML =
      '<div class="tablewrap"><table><thead><tr>' +
      heads.map((h) => "<th>" + h + "</th>").join("") +
      "</tr></thead><tbody>" +
      rows
        .map((r) => {
          let cells;
          if (tab === "loans")
            cells = [
              "#" + r.id,
              `<strong>${esc(r.title)}</strong><small>${esc(r.name)}</small>`,
              esc(formatTime(r.borrowed_at)),
              dateOnly(r.due_date),
              status(r) +
                (r.returned_at
                  ? "<small>Đã trả: " +
                    esc(formatTime(r.returned_at)) +
                    "</small>"
                  : ""),
              r.returned_at
                ? "—"
                : `<button data-action="return" data-id="${r.id}">Trả sách</button>`,
            ];
          else if (tab === "categories")
            cells = [
              "#" + r.id,
              `<strong>${esc(r.name)}</strong>`,
              `<button class="secondary" data-action="edit" data-id="${r.id}">Sửa</button><button class="danger" data-action="delete" data-id="${r.id}">Xóa</button>`,
            ];
          else
            cells = [
              `<strong>${esc(r.name)}</strong><small>${esc(r.email)}</small>`,
              `<span class="badge ${r.role}">${roleName[r.role]}</span>`,
              esc(r.phone || "—") +
                "<small>" +
                esc(r.address || "Chưa có địa chỉ") +
                "</small>",
              `<button class="secondary" data-action="edit" data-id="${r.id}">Sửa</button>${r.role === "reader" ? `<button class="danger" data-action="delete" data-id="${r.id}">Xóa</button>` : ""}${state.user.role === "admin" && r.id !== state.user.id ? `<button data-action="role" data-id="${r.id}">Phân quyền</button>` : ""}`,
            ];
          return (
            "<tr>" + cells.map((v) => "<td>" + v + "</td>").join("") + "</tr>"
          );
        })
        .join("") +
      "</tbody></table></div>";
  }
  $("#pagination").innerHTML =
    `<span>${total ? "Hiển thị " + ((page - 1) * size + 1) + "–" + Math.min(page * size, total) + " / " + total : "0 kết quả"}</span><div class="page-actions"><button id="prev" ${page === 1 ? "disabled" : ""}>← Trước</button><span>${page} / ${pages}</span><button id="next" ${page === pages ? "disabled" : ""}>Sau →</button></div>`;
  $("#prev").onclick = () => {
    page--;
    draw();
  };
  $("#next").onclick = () => {
    page++;
    draw();
  };
  $("#content")
    .querySelectorAll("[data-action]")
    .forEach(
      (b) =>
        (b.onclick = run(async () => {
          b.disabled = true;
          try {
            await action(b.dataset.action, Number(b.dataset.id));
          } finally {
            b.disabled = false;
          }
        })),
    );
}
async function action(a, id) {
  const r = records.find((r) => r.id === id);
  if (!r) return;
  if (a === "edit") return edit(r);
  if (
    a === "delete" &&
    (await ask(
      "Xóa " +
        (r.title || r.name) +
        "? Dữ liệu đã có lịch sử mượn sẽ được giữ lại.",
      true,
    ))
  ) {
    notify((await api("/" + tab + "/" + r.id, "DELETE")).message);
    await render();
  }
  if (
    a === "return" &&
    (await ask(
      "Xác nhận đã trả sách “" +
        r.title +
        "”? Ngày trả được ghi theo thời gian hiện tại.",
    ))
  ) {
    notify((await api("/loans/" + r.id + "/return", "POST", {})).message);
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
      ) +
        '<p class="form-hint">Người dùng sẽ cần đăng nhập lại sau khi đổi chức vụ.</p>',
      (b) => api("/users/" + r.id + "/role", "PUT", b),
    );
  if (a === "borrow") {
    state = await api("/session");
    if (!state.user) return boot();
    const staff = state.user.role !== "reader",
      readers = users.filter((u) => u.role === "reader" && u.active);
    if (staff && !readers.length) throw Error("Hãy thêm độc giả trước");
    const due = new Date(new Date(state.serverTime).getTime() + 14 * 86400000),
      future = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(due);
    modal(
      "Mượn: " + r.title,
      (staff
        ? select("user_id", "Độc giả", readers)
        : "<p>Người mượn: <strong>" + esc(state.user.name) + "</strong></p>") +
        field(
          "due_date",
          "Hạn trả sách",
          future,
          "date",
          `required min="${state.today}"`,
        ) +
        '<p class="form-hint">Hạn trả không trước ngày mượn. Ngày mượn được hệ thống ghi tự động.</p>',
      (b) => api("/loans", "POST", { ...b, book_id: r.id }),
    );
  }
}
function edit(r = {}) {
  let f;
  if (tab === "books") {
    if (!cats.length) throw Error("Hãy thêm thể loại trước khi thêm sách");
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
      field("name", "Họ và tên", r.name, "text", 'required maxlength="100"') +
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
  return new Date(s).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function dateOnly(s) {
  const raw = String(s).slice(0, 10);
  return esc(raw.split("-").reverse().join("/"));
}
setInterval(() => {
  if (
    state.user &&
    ["dashboard", "loans"].includes(tab) &&
    !$("#modal").open &&
    !$("#confirmDialog").open
  )
    render().catch((e) => notify(e.message, "error"));
}, 60000);
boot().catch((e) => notify(e.message, "error"));

# Hệ thống Quản lý Thư viện — Node.js

Hướng dẫn Ubuntu từng bước, tạo 3 commit và minh chứng báo cáo: [HUONG_DAN_TUNG_BUOC_UBUNTU.md](HUONG_DAN_TUNG_BUOC_UBUNTU.md).

Bản ngày 15/10/2026 đã sửa thụt lề hai dòng user trong compose.yaml. ZIP có thể có sẵn .env; setup.js giữ nguyên file này. Chưa xác nhận toàn bộ Docker stack chạy trong môi trường kiểm tra.

Dự án đơn giản cho Đề 1. Backend Node.js/Express, frontend HTML/CSS/JavaScript thuần; dữ liệu thật lưu PostgreSQL 16. Không dùng localStorage để giả lập dữ liệu.

## 1. Chạy trên Windows (PowerShell)

Cần Docker Desktop **đang chạy**, chế độ Linux containers. Giải nén và mở terminal tại thư mục có `compose.yaml`. Không chạy trong thư mục dự án thư viện cũ và không dùng lại volume cũ.

Nếu máy đã có Node.js 22 trở lên:

```powershell
node setup.js
docker compose up -d --build
```

Nếu chưa có Node.js, dùng Docker để tạo cấu hình:

```powershell
docker run --rm -v "${PWD}:/work" -w /work node:22.16.0-alpine node setup.js
docker compose up -d --build
```

Lần đầu cần Internet để tải image và npm dependencies. Đợi dịch vụ app healthy:

```powershell
docker compose ps
docker compose logs app --tail 40
```

Mở **http://localhost:8080**. Nếu chưa có `.env`, `setup.js` sẽ tạo file này; nếu đã có thì giữ nguyên. Chạy lại setup sẽ giữ nguyên file này. Không sửa mật khẩu database trong `.env` sau khi database đã được tạo mà không đổi mật khẩu tương ứng trong PostgreSQL.

## 2. Tài khoản có sẵn

| Chức vụ | Email | Mật khẩu lấy từ .env |
|---|---|---|
| Admin | admin@example.com | ADMIN_PASSWORD |
| Thủ thư | thuthu@example.com | LIBRARIAN_PASSWORD |
| Độc giả | docgia@example.com | READER_PASSWORD |

Mở `.env` trong Notepad, sao chép **phần sau dấu =** đúng dòng, không sao chép tên biến. Ba tài khoản được tạo khi app chạy lần đầu. Thay giá trị seed password sau đó không đổi mật khẩu của tài khoản đã tồn tại; dùng Quên mật khẩu.

## 3. Chức năng và quyền

| Chức năng | Độc giả | Thủ thư | Admin |
|---|---|---|---|
| Đăng nhập/đăng xuất, đăng ký, quên mật khẩu | Có | Có | Có |
| Xem/tìm sách, thể loại | Có | Có | Có |
| Tự mượn, tự trả, xem lịch sử của mình | Có | — | — |
| Mượn/trả hộ độc giả, xem toàn bộ phiếu | — | Có | Có |
| Thêm/sửa/xóa sách và thể loại | — | Có | Có |
| Thêm/sửa/xóa độc giả | — | Có | Có |
| Xem người dùng hệ thống, phân quyền chức vụ | — | — | Có |

Đăng ký luôn tạo **độc giả**, kể cả khi cố gửi role=admin vào API. Admin tạo độc giả rồi bấm **Phân quyền** để đổi thành thủ thư hoặc admin. Có sẵn một thủ thư. Người bị đổi quyền cần đăng nhập lại; phiên cũ bị thu hồi. Admin không tự đổi quyền của mình.

### Quy tắc mượn/trả đã chốt

- **Hạn trả ≥ ngày mượn**; kiểm tra frontend, backend và CHECK constraint của PostgreSQL.
- Ngày mượn, ngày trả thực tế do database ghi bằng NOW(), múi giờ Việt Nam; không cho nhập lùi ngày.
- Hạn trả là ngày: quá hạn từ 00:00 ngày tiếp theo theo Asia/Ho_Chi_Minh. Trả trễ vẫn được phép, lịch sử giữ hạn trả và thời điểm trả thực tế.
- Tự động cập nhật danh sách phiếu mỗi 60 giây. Khi mượn lại lấy ngày hiện tại từ server.
- Chỉ mượn khi còn sách. Không được có hai phiếu đang mượn cùng một sách cho một độc giả.
- Khóa dòng trong transaction khi mượn/sửa kho, tránh cấp quá số lượng khi nhiều người thao tác.
- Không sửa tổng số cuốn xuống thấp hơn số đang mượn.
- Không xóa sách/độc giả đã có lịch sử phiếu mượn hoặc thể loại có sách. Dữ liệu chưa có liên kết xóa bình thường. Không xóa phiếu để bảo toàn lịch sử.
- Độc giả đang mượn sách phải trả hết trước khi được đổi chức vụ.

### Quên mật khẩu hoạt động thế nào?

1. Ở trang đăng nhập, chọn **Quên mật khẩu**, nhập email đã đăng ký.
2. Mở http://localhost:8025 (Mailpit), chọn email gửi đến địa chỉ đó.
3. Sao chép mã 64 ký tự trong thư.
4. Chọn **Tôi đã có mã đặt lại**, nhập mã và mật khẩu mới (10–128 ký tự).
5. Đăng nhập bằng mật khẩu mới. Mã dùng một lần, hết hạn sau 15 phút. Phiên cũ bị thu hồi.

Mailpit là hộp thư thử nghiệm cục bộ: thư **không gửi đến Gmail thật**. Khi triển khai thật, cấu hình SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD và SMTP_FROM trong `.env`, rồi chạy `docker compose up -d app`. Không trả mã reset qua API, không log mật khẩu/mã reset; database chỉ lưu hash mã.

## 4. Các công cụ theo đề

| Công cụ | Địa chỉ | Đăng nhập |
|---|---|---|
| Web qua Nginx | http://localhost:8080 | Tài khoản thư viện |
| pgAdmin | http://localhost:5050 | admin@example.com / PGADMIN_PASSWORD |
| Grafana | http://localhost:3001 | admin / GRAFANA_PASSWORD |
| Prometheus | http://localhost:9090 | Cục bộ |
| Hộp thư thử nghiệm | http://localhost:8025 | Cục bộ |

pgAdmin → Add New Server:

- General/Name: Library.
- Connection/Host: `postgres` (không phải localhost).
- Port: 5432; Maintenance database: `library`.
- Username: `library_app`; Password: giá trị DB_PASSWORD trong `.env`.
- Xem Schemas → public → Tables: users, books, categories, loans, sessions, resets, rate_limits.

Grafana có sẵn hai datasource Prometheus/Loki và dashboard **Thư viện - Giám sát**. Prometheus Targets theo dõi app Node.js, PostgreSQL, Nginx, cAdvisor và Prometheus.

cAdvisor đọc thông tin container trong Docker Linux; trên Docker Desktop dữ liệu CPU/RAM phụ thuộc cấu hình cgroups và phiên bản Docker. Nếu thiếu biểu đồ container, xem `docker compose logs cadvisor --tail 100`; không coi biểu đồ trống là bằng chứng đã giám sát thành công. Các kiểm tra Docker thực tế cần chạy trên máy nộp bài.

### LogQL (Grafana → Explore → Loki)

Promtail đọc log API Node.js và access/error log Nginx từ volume chia sẻ, gửi về Loki. Tạo vài thao tác đăng nhập/mượn/trả trước khi truy vấn; chọn khoảng thời gian Last 15 minutes.

```logql
{job="library"}
```

```logql
{job="library"} | json | status >= 400
```

```logql
{job="nginx"} |= "POST /api/loans"
```

```logql
sum(count_over_time({job="library"} | json | status >= 400 [5m]))
```

Promtail được dùng để khớp đề bài; đây là bộ image cố định cho bài thực hành. Tài liệu kỹ thuật tham khảo: https://grafana.com/docs/loki/latest/ và https://prometheus.io/docs/prometheus/latest/configuration/configuration/.

## 5. Hardening đã cấu hình

- App chạy bằng user node, Nginx bằng nginx, Promtail bằng 10001; filesystem app/Nginx read-only với tmpfs.
- no-new-privileges và cap_drop ALL cho phần lớn dịch vụ. PostgreSQL giữ quyền entrypoint cần thiết để chuẩn bị volume rồi chuyển sang user postgres; cAdvisor có quyền đọc thông tin host để giám sát, là ngoại lệ của stack.
- Database network internal; PostgreSQL không mở cổng ra host. App dùng library_app, không dùng superuser postgres. Exporter dùng metrics + pg_monitor.
- Mật khẩu ngẫu nhiên, `.env` được gitignore. Password người dùng được scrypt với salt; session lưu PostgreSQL, cookie HttpOnly/SameSite=Lax.
- CSRF token, query tham số, kiểm tra quyền backend, escape dữ liệu frontend và giới hạn thử đăng nhập/reset.
- Nginx reverse proxy, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy; đường /metrics không truy cập qua web công khai.
- Cổng công cụ quản trị bind 127.0.0.1 cho bài chạy cục bộ. Mailpit chỉ để test.

Dùng **security headers** theo lựa chọn của đề, chưa cấu hình HTTPS tự ký. Nếu đưa lên máy chủ Internet cần HTTPS, bật COOKIE_SECURE=true trong môi trường app, SMTP thật và bảo vệ công cụ quản trị. cAdvisor có mount /var/run đọc socket Docker, không đưa dịch vụ này ra bên ngoài.

## 6. Kiểm thử

```powershell
npm ci
npm test
```

Bộ test dùng Express thật + PostgreSQL engine qua PGlite (PostgreSQL WebAssembly), không giả dữ liệu bằng mảng. Không cần Docker cho test nghiệp vụ. Chi tiết kết quả và giới hạn kiểm tra: `KIEM_THU.md`.

Kiểm tra thủ công sau khi Docker chạy:

1. Đăng nhập độc giả → Kho sách → Mượn → chọn hạn trả ngày hôm nay hoặc sau → Lưu.
2. Mở Sách tôi mượn → Trả sách → xác nhận. Kho tăng số cuốn còn.
3. Đăng nhập thủ thư → thêm/sửa thể loại, sách và độc giả; mượn/trả hộ.
4. Đăng nhập admin → Người dùng & Phân quyền → đổi độc giả mới thành thủ thư → người đó đăng nhập lại.
5. Làm thử quy trình Quên mật khẩu ở trên.
6. Kiểm tra dữ liệu trong pgAdmin, dashboard Grafana, Prometheus Targets và 3 LogQL query.

## 7. Đưa GitHub và nộp bài

ZIP chưa được đăng lên GitHub. Tạo repo bằng tài khoản/tên theo mã sinh viên, thay URL bên dưới bằng repo của bạn. Không commit `.env`, node_modules hoặc dữ liệu volume.

```powershell
git init
git branch -M main
git add package.json package-lock.json app setup.js Dockerfile .dockerignore .gitignore .env.example tests README.md KIEM_THU.md BAT_DAU.txt
git commit -m "feat: library CRUD, reader borrow-return and authentication"
$libraryFullCompose = Get-Content compose.yaml -Raw
Copy-Item infra/stages/commit1.yaml compose.yaml -Force
git add compose.yaml infra/db-init.sh infra/nginx.conf infra/nginx.Dockerfile
git commit -m "commit 1: configure Nginx reverse proxy and security headers"
Copy-Item infra/stages/commit2.yaml compose.yaml -Force
git add compose.yaml infra/prometheus.yml infra/grafana
git commit -m "commit 2: integrate Prometheus Grafana and exporters"
[System.IO.File]::WriteAllText((Join-Path $PWD "compose.yaml"), $libraryFullCompose, [System.Text.UTF8Encoding]::new($false))
git add compose.yaml infra/loki.yml infra/promtail.yml infra/promtail.Dockerfile infra/stages
git commit -m "commit 3: integrate Loki Promtail and LogQL documentation"
git remote add origin https://github.com/TAI_KHOAN/TEN_REPO.git
git push -u origin main
```

Các bản Compose trong `infra/stages` giúp commit 1 có web + PostgreSQL + pgAdmin + Nginx, commit 2 thêm giám sát, commit 3 thêm log tập trung. Lệnh cuối khôi phục Compose đầy đủ. Thực hiện chuỗi lệnh trong cùng một cửa sổ PowerShell để giữ biến `$libraryFullCompose`. Chụp màn hình ứng dụng, pgAdmin, Targets, Grafana và LogQL để làm minh chứng.

## 8. Dừng và giữ dữ liệu

```powershell
docker compose down
docker compose up -d
```

`down` giữ named volumes. **Không dùng `down -v` nếu muốn giữ database**. Để xem lỗi: `docker compose logs app postgres nginx --tail 100`. Nếu Docker báo unable to start, cần mở/sửa Docker Desktop trước.

## Cấu trúc

- app/app.js: API, auth, phân quyền, nghiệp vụ; app/server.js: SMTP/log/server.
- app/schema.sql: bảng, CHECK/FK/index; app/init.js: tạo schema và seed lần đầu.
- app/static: frontend không cần build.
- compose.yaml, Dockerfile, infra/: triển khai và giám sát.
- setup.js: sinh `.env`; tests/: kiểm thử tích hợp.

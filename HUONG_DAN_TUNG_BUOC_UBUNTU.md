# TRIỂN KHAI HỆ THỐNG QUẢN LÝ THƯ VIỆN — TỪNG BƯỚC TRÊN UBUNTU

Sinh viên: Giàng A Tủa. Điền đúng MSSV, lớp, khoa, trường và giảng viên theo thông tin thực tế.

## 0. Kết quả kiểm tra ZIP ngày 15/10/2026

- File Compose gốc có hai dòng `user: "65534:65534"` sai thụt lề trong prometheus và postgres-exporter. Đã sửa thụt lề, không thay đổi chức năng ứng dụng.
- Stack chính build Dockerfile ở thư mục gốc, chạy `app/`, phục vụ giao diện `app/static/`. Hai thư mục backend/frontend là mã bổ sung có sẵn; không cần chạy npm trong đó để triển khai Compose chính.
- Có 12 dịch vụ. Có sẵn cấu hình từng giai đoạn tại infra/stages/commit1.yaml và commit2.yaml.
- Nhánh main trong ZIP gốc chưa có commit, dù có thư mục .git và remote origin. Không phải bằng chứng repository trực tuyến đã có đủ commit. Nếu repository khác của bạn đã có commit thì giữ lịch sử đó.
- Máy kiểm tra hiện tại không có Docker CLI/daemon: chưa thể xác nhận toàn bộ container chạy, exporter UP, Grafana hay Loki có dữ liệu. Thực hiện các bước dưới đây để xác nhận trên máy nộp bài.
- Không dùng ảnh minh chứng giả hoặc ghi dịch vụ đã chạy trước khi kiểm tra thực tế.

## 1. Chuẩn bị thư mục và Docker

Giải nén ZIP vào một thư mục riêng, ví dụ thư mục Downloads. Mở thư mục có compose.yaml, bấm chuột phải → Open in Terminal. Nếu giải nén dưới Downloads:

```bash
cd "$HOME/Downloads/HE THONG THU VIEN"
pwd
ls
```

Nếu vị trí khác, sửa đường dẫn theo vị trí thật. Phải thấy compose.yaml, Dockerfile, app, infra và setup.js.

```bash
docker --version
docker compose version
docker info
```

Chỉ tiếp tục khi `docker info` có phần Server, không báo không kết nối được daemon. Nếu Docker Engine đã cài nhưng dừng:

```bash
sudo systemctl start docker
docker info
```

Nếu dùng Docker Desktop, mở Docker Desktop và chờ Engine running. Nếu permission denied với Docker Engine, dùng sudo trước các lệnh Docker trong hướng dẫn này; không chmod 777 socket Docker. Nếu command not found, cần cài Docker Engine và Compose plugin trước theo tài liệu chính thức: https://docs.docker.com/engine/install/ubuntu/.

## 2. Tạo/giữ mật khẩu, kiểm tra cấu hình

ZIP người dùng gửi đã có .env; giữ nguyên để tương thích dữ liệu cũ. Lệnh setup không ghi đè .env. Không sao chép .env.example đè .env hiện tại.

Nếu đã có Node.js:

```bash
node setup.js
```

Nếu chưa có Node.js, dùng container tạm:

```bash
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:22.16.0-alpine node setup.js
```

```bash
chmod 600 .env
docker compose config --quiet
docker compose config --services
```

`config --quiet` thành công khi không có lỗi. Danh sách đầy đủ: postgres, app, nginx, pgadmin, mailpit, prometheus, grafana, loki, promtail, nginx-exporter, postgres-exporter, cadvisor.

Không chụp hoặc đưa mật khẩu .env lên GitHub. Không dùng `docker compose config` đầy đủ để làm minh chứng vì có thể in mật khẩu.

## 3. Khởi động toàn bộ dự án

```bash
docker compose up -d --build
docker compose ps -a
docker compose logs app postgres nginx --tail 60
```

Lần đầu cần Internet để tải images và npm packages. Chờ postgres và app healthy; các dịch vụ khác phải ở trạng thái running/Up. Không phải dịch vụ nào cũng có healthcheck.

```bash
curl -i http://localhost:8080/health
curl -I http://localhost:8080
```

Health phải trả HTTP 200. Xem X-Content-Type-Options, X-Frame-Options, Content-Security-Policy, Referrer-Policy trên phản hồi Nginx.

Mở trình duyệt TRÊN máy chạy Docker:

| Thành phần | URL | Tài khoản |
|---|---|---|
| Website qua Nginx | http://localhost:8080 | admin@example.com / ADMIN_PASSWORD |
| pgAdmin | http://localhost:5050 | admin@example.com / PGADMIN_PASSWORD |
| Grafana | http://localhost:3001 | admin / GRAFANA_PASSWORD |
| Prometheus | http://localhost:9090 | Không yêu cầu đăng nhập trong cấu hình local |
| Mailpit thử email | http://localhost:8025 | Không yêu cầu đăng nhập trong cấu hình local |

Lấy mật khẩu tương ứng bằng cách mở .env trên máy, chỉ sao chép phần sau dấu =. Không gửi file .env cho người khác. Nếu Ubuntu nằm trong máy ảo, mở trình duyệt trong Ubuntu vì cổng hiện bind 127.0.0.1.

## 4. Kiểm tra website và database

1. Đăng nhập admin@example.com, xem Kho sách và menu quản trị.
2. Đăng xuất; đăng nhập docgia@example.com với READER_PASSWORD.
3. Kho sách → Mượn → chọn hạn trả hôm nay hoặc một ngày tương lai → Lưu.
4. Sách tôi mượn → xác nhận phiếu vừa tạo, số lượng còn giảm.
5. Trả sách → xác nhận trạng thái đã trả, số lượng còn tăng.
6. Thử chọn hạn trả trước hôm nay: hệ thống phải chặn. Ngày mượn/trả thực tế do server/DB ghi. Nếu giao diện chặn chọn ngày cũ, đó là kiểm tra frontend; bộ test còn kiểm tra backend và constraint DB.
7. Đăng nhập thuthu@example.com bằng LIBRARIAN_PASSWORD: thử quản lý sách, thể loại, độc giả và mượn/trả hộ.

pgAdmin:

1. Đăng nhập http://localhost:5050.
2. Servers → Register → Server.
3. General / Name: Library.
4. Connection: Host `postgres`, Port `5432`, Maintenance database `library`, Username `library_app`, Password lấy dòng DB_PASSWORD.
5. Save → Databases → library → Schemas → public → Tables.
6. Chọn library → Tools → Query Tool, chạy:

```sql
SELECT id, name, email, role FROM users;
SELECT id, title, quantity FROM books;
SELECT id, user_id, book_id, borrowed_at, due_date, returned_at
FROM loans ORDER BY id DESC;
```

Chụp website có phiếu mượn và kết quả SELECT tương ứng. Không chọn cột password/session/reset để đưa vào báo cáo.

## 5. Prometheus + Grafana

1. Mở http://localhost:9090/targets. Nếu giao diện đổi, vào Status → Target health.
2. Xác nhận năm job: prometheus, library, nginx, postgres, containers đều UP.
3. Ở trang Query chạy lần lượt:

```promql
up
pg_up
nginx_up
sum by (name) (rate(container_cpu_usage_seconds_total{image!=""}[1m]))
sum by (name) (container_memory_working_set_bytes{image!=""})
```

`up=1` chỉ xác nhận scrape thành công; phải kiểm tra thêm pg_up=1, nginx_up=1 và metrics CPU/RAM thực tế. Exporter chạy không tự chứng minh DB/web được giám sát.

4. Mở http://localhost:3001 → đăng nhập → Dashboards → Thư viện - Giám sát.
5. Chọn Last 15 minutes, Refresh 5s. Chờ ít nhất vài lần scrape sau khi khởi động; mở website và thao tác để có lưu lượng.
6. Xác nhận biểu đồ trạng thái, HTTP, Nginx, PostgreSQL, CPU và RAM container có dữ liệu.
7. Chụp trang Targets và dashboard. Nếu biểu đồ trống, xem lỗi trước khi ghi kết quả đạt.

```bash
docker compose logs prometheus nginx-exporter postgres-exporter cadvisor grafana --tail 80
```

## 6. Loki + Promtail và 3 truy vấn LogQL

Tạo dữ liệu log bằng cách đăng nhập, mượn/trả rồi gửi một request chưa đăng nhập để tạo lỗi 401:

```bash
curl -i http://localhost:8080/api/loans
```

Mở Grafana → Explore → chọn datasource Loki → Code; chọn Last 15 minutes. Chạy từng truy vấn riêng và chụp kết quả.

Query 1 — toàn bộ log API:

```logql
{job="library"}
```

Query 2 — log API có HTTP status từ 400 trở lên:

```logql
{job="library"} | json | status >= 400
```

Query 3 — log Nginx khi gửi yêu cầu mượn sách:

```logql
{job="nginx"} |= "POST /api/loans"
```

Query 3 chỉ có kết quả sau khi thực hiện mượn sách. Nếu chưa có, dùng `{job="nginx"}` để kiểm tra nguồn log trước. Mở rộng Last 1 hour nếu thao tác đã lâu.

```bash
docker compose logs loki promtail --tail 80
```

Chụp mỗi query có dữ liệu thật, giải thích job library là log ứng dụng JSON và job nginx là access/error log của reverse proxy.

## 7. Minh chứng hardening

Biện pháp 1 — non-root:

```bash
docker compose exec app id
docker compose exec nginx id
```

UID phải khác 0. Không khẳng định tất cả dịch vụ đều non-root: PostgreSQL entrypoint có giai đoạn chuẩn bị volume, cAdvisor có quyền/mount giám sát host.

Biện pháp 2 — filesystem chỉ đọc, bỏ capabilities và chống tăng quyền:

```bash
docker inspect "$(docker compose ps -q app)" --format '{{.HostConfig.ReadonlyRootfs}} {{json .HostConfig.CapDrop}} {{json .HostConfig.SecurityOpt}}'
```

Mong đợi true, ALL, no-new-privileges:true.

Biện pháp 3 — cô lập mạng và không publish DB:

```bash
docker network inspect library-simple_database --format '{{.Internal}}'
docker compose ps postgres
docker inspect "$(docker compose ps -q postgres)" --format '{{json .HostConfig.PortBindings}}'
```

Mạng database internal phải là true, không có binding cổng PostgreSQL ra host. Dòng `5432/tcp` trong ps chỉ là cổng bên trong container.

Biện pháp 4 — tài khoản DB giới hạn:

```bash
docker compose exec postgres psql -U postgres -d library -c "SELECT rolname, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname IN ('library_app','metrics');"
```

Các cột quyền superuser/createdb/createrole phải false. Ứng dụng dùng library_app, exporter dùng metrics có pg_monitor.

Biện pháp 5 — security headers Nginx:

```bash
curl -I http://localhost:8080
curl -i http://localhost:8080/metrics
```

Phải thấy headers bảo mật; /metrics qua Nginx trả 404. Prometheus vẫn scrape trực tiếp app qua mạng nội bộ. Đề cho phép HTTPS tự ký HOẶC security headers; bản này dùng security headers, không ghi là đã triển khai HTTPS.

Biện pháp 6 — mật khẩu không commit:

```bash
git check-ignore .env
git ls-files .env
```

Lệnh đầu in .env, lệnh sau không in file nào. Không đổi DB_PASSWORD trong .env sau khi DB đã khởi tạo nếu chưa đồng bộ mật khẩu role trong PostgreSQL.

## 8. Tạo lịch sử Git cho BẢN ZIP MỚI CHƯA CÓ COMMIT

Nếu đã làm trên repository khác và có 3 commit hợp lệ thì giữ nguyên, dùng `git log --oneline -5` để kiểm tra. Không chạy quy trình dưới để thay thế lịch sử đó.

Tạo tài khoản/repository theo MSSV thật của bạn. Trong ví dụ lệnh push bên dưới, thay TAI_KHOAN và TEN_REPO bằng giá trị thật. Không thêm README tự động trên GitHub khi định đẩy một repository mới từ local.

Đặt tên tác giả commit nếu máy chưa cấu hình, thay email mẫu bằng email GitHub của bạn:

```bash
git config user.name "Giang A Tua"
git config user.email "EMAIL_GITHUB_CUA_BAN"
git branch -M main
```

Giữ bản Compose đầy đủ ở ngoài thư mục repo. Thực hiện các lệnh trong CÙNG terminal, không đóng giữa chừng:

```bash
library_full_compose=$(mktemp)
cp compose.yaml "$library_full_compose"
cp infra/stages/commit1.yaml compose.yaml
git add .dockerignore .gitignore .env.example Dockerfile package.json package-lock.json setup.js app tests README.md BAT_DAU.txt KIEM_THU.md HUONG_DAN_TUNG_BUOC_UBUNTU.md compose.yaml infra/db-init.sh infra/nginx.conf infra/nginx.Dockerfile
git commit -m "commit 1: trien khai web thu vien PostgreSQL pgAdmin va Nginx reverse proxy"
```

Commit 1: web + database + DB tool + Nginx. Để chạy riêng trạng thái này:

```bash
docker compose config --quiet
docker compose up -d --build
```

Commit 2:

```bash
cp infra/stages/commit2.yaml compose.yaml
git add compose.yaml infra/prometheus.yml infra/grafana
git commit -m "commit 2: giam sat container Nginx PostgreSQL bang Prometheus va Grafana"
docker compose config --quiet
docker compose up -d --build
```

Commit 3 — khôi phục Compose đầy đủ đã sửa:

```bash
cp "$library_full_compose" compose.yaml
git add compose.yaml infra/loki.yml infra/promtail.yml infra/promtail.Dockerfile infra/stages backend frontend
git commit -m "commit 3: tich hop Loki Promtail va truy van log bang LogQL"
docker compose config --quiet
docker compose up -d --build
git log --oneline -3
git status --short
```

backend/frontend được giữ nguyên từ ZIP, không nằm trong đường build chính. File compose.yaml.bak có sẵn là bản dự phòng, không dùng để chạy và không cần commit. Không dùng `git add .` nếu chưa kiểm tra các file có thông tin riêng.

Kiểm tra remote (ZIP có thể đã có origin):

```bash
git remote -v
```

Nếu origin đã có, dùng:

```bash
git remote set-url origin https://github.com/TAI_KHOAN/TEN_REPO.git
```

Nếu chưa có origin, dùng:

```bash
git remote add origin https://github.com/TAI_KHOAN/TEN_REPO.git
```

Sau đó:

```bash
git push -u origin main
```

Nếu bị rejected vì remote đã có lịch sử, không force push. Giữ nguyên và kiểm tra lịch sử remote trước. Không có quyền push thì đăng nhập GitHub bằng tài khoản sở hữu repository.

## 9. Báo cáo tối thiểu 10 trang — làm sau khi chạy thật

Đề cương gợi ý 12 trang (phải dàn trang thực tế khi làm Word, không tính số mục là số trang):

| Trang dự kiến | Nội dung | Minh chứng |
|---|---|---|
| 1 | Bìa: trường/khoa, môn, đề tài, Giàng A Tủa, MSSV, lớp, GV, năm | Điền thông tin thật |
| 2 | Mục lục tự động, mục tiêu và phạm vi | Heading 1/2 trong Word |
| 3 | Kiến trúc: browser → Nginx → app → PostgreSQL; pgAdmin, metrics, log | Sơ đồ kiến trúc tự vẽ |
| 4 | Công nghệ, cấu trúc thư mục và các service/network/volume | Cây thư mục, bảng dịch vụ |
| 5 | GitHub, README, nội dung 3 commit | Trang repo + git log |
| 6 | Triển khai web, đăng nhập/phân quyền, mượn/trả | Ảnh web thực tế |
| 7 | PostgreSQL, pgAdmin, bảng users/books/loans | Ảnh query dữ liệu |
| 8 | Nginx reverse proxy và security headers | curl headers + cấu hình |
| 9 | Prometheus/exporters và Targets | Ảnh 5 job UP |
| 10 | Grafana giám sát web/DB/container | Dashboard có dữ liệu |
| 11 | Loki/Promtail, 3 LogQL và giải thích kết quả | Ảnh ba query có log |
| 12 | Hardening, kiểm thử, kết quả/hạn chế, tài liệu tham khảo | Lệnh UID, mạng, DB roles |

Chú thích và đánh số từng hình, nêu thao tác nào tạo ra dữ liệu, nhận xét kết quả. Chỉ kết luận đạt đối với phần đã có minh chứng thật. Chưa có ảnh chạy Docker thì báo cáo chưa hoàn chỉnh.

## 10. Trình tự demo và xử lý lỗi

Demo: `docker compose ps` → website mượn/trả → pgAdmin SELECT → Nginx headers → Targets → Grafana → 3 LogQL → hardening → GitHub/3 commit.

| Lỗi | Xử lý |
|---|---|
| YAML parse error | Dùng compose.yaml đã sửa; chạy config --quiet |
| Cannot connect Docker daemon | Mở Docker Desktop hoặc start Docker Engine |
| address already in use | Dừng đúng ứng dụng cũ đang chiếm cổng; không xóa volume |
| password authentication failed | Kiểm tra .env có khớp volume DB đang dùng; không tự xóa database |
| app unhealthy | Xem logs app postgres; kiểm tra DB/init và mật khẩu |
| 502 Bad Gateway | Xem trạng thái/log app và nginx |
| Grafana No data | Kiểm tra Targets, datasource, khoảng thời gian, exporter logs |
| Loki không có log | Tạo request, kiểm tra logs promtail/loki, khoảng thời gian và job labels |
| CPU/RAM container trống | Xem logs cadvisor, kiểm tra quyền/mount/cgroups trên máy chạy |

Các lệnh hỗ trợ:

```bash
docker compose ps -a
docker compose logs --tail 100
docker compose restart app nginx
```

Dừng và giữ dữ liệu:

```bash
docker compose down
```

Chạy lại:

```bash
docker compose up -d
```

Không chạy `docker compose down -v` nếu cần giữ dữ liệu. Không phải mọi lỗi đều cần build lại toàn bộ hoặc xóa volume.

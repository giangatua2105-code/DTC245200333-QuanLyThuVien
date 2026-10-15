# API LibraryHub

Base URL khi chạy Compose: http://localhost:8080/api. Session dùng cookie, không dùng token trong localStorage. Đầu tiên GET /session, lấy csrf. Mọi POST/PUT/DELETE phải gửi header X-CSRF-Token tương ứng và cookie cùng phiên. Sau đăng nhập/session regeneration phải GET /session lại.

| Method | Đường dẫn | Quyền / nội dung |
|---|---|---|
| GET | /session | Khởi tạo CSRF; trả user, today, serverTime |
| POST | /register | name,email,password; role luôn reader |
| POST | /login | email,password |
| POST | /logout | Hủy session |
| POST | /forgot | email; gửi mã tới SMTP |
| POST | /reset | token,password; thu hồi session cũ |
| GET | /stats | Đã đăng nhập; reader chỉ xem phiếu của mình |
| GET | /books?search= | Đã đăng nhập; tìm tên/tác giả |
| POST | /books | Staff; title,author,category_id,quantity |
| PUT | /books/:id | Staff; cùng dữ liệu thêm sách |
| DELETE | /books/:id | Staff; không xóa nếu có phiếu |
| GET | /categories | Đã đăng nhập |
| POST | /categories | Staff; name |
| PUT | /categories/:id | Staff; name |
| DELETE | /categories/:id | Staff; không xóa nếu có sách |
| GET | /loans | Reader xem của mình; staff xem tất cả |
| POST | /loans | book_id,due_date; staff thêm user_id; reader luôn là chính mình |
| POST | /loans/:id/return | Chủ phiếu hoặc staff |
| GET | /users | Staff xem độc giả; admin xem tất cả |
| POST | /users | Staff; name,email,password,phone,address; tạo reader |
| PUT | /users/:id | Staff; name,phone,address; thủ thư chỉ sửa độc giả |
| DELETE | /users/:id | Staff; chỉ xóa reader chưa có lịch sử phiếu |
| PUT | /users/:id/role | Admin; role=reader/librarian/admin |

Staff = librarian hoặc admin. Không được đổi quyền của chính admin đang đăng nhập.

Thành công trả JSON dữ liệu hoặc {message}; lỗi {message,requestId}. Status 400 validation, 401 chưa đăng nhập/session thu hồi, 403 sai quyền/CSRF, 404 không tìm thấy, 409 trùng/FK, 429 thử quá nhiều lần, 500 lỗi nội bộ. Mã X-Request-Id trong response tương ứng requestId trong log. /health và /metrics nằm ngoài /api; /metrics bị Nginx chặn truy cập công khai.

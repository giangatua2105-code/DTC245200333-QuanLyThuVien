# Frontend LibraryHub

HTML/CSS/JavaScript thuần, không cần npm/build. Giao diện tiếng Việt: tổng quan, kho sách, mượn/trả, thể loại, độc giả và phân quyền theo tài khoản.

Giải nén Frontend.zip cùng thư mục cha với Backend.zip để có LibraryPro/frontend và LibraryPro/backend. Chạy Compose ở LibraryPro theo README của gói backend.

Nginx phục vụ index.html/app.js/style.css và proxy /api/ tới app:3000. Không mở index.html trực tiếp bằng file:// vì các chức năng cần API và cookie session. Frontend dùng đường dẫn API cùng origin, không có dữ liệu mẫu giả trong mã giao diện. Các hình sách là trang trí CSS theo tên sách, không phải bìa xuất bản thật. Không tải font/icon bên ngoài.

Nginx chạy non-root, security headers/CSP, logs ở /logs; /metrics không mở ra web. Thiết kế responsive cho điện thoại; tìm kiếm/lọc/phân trang chạy trên dữ liệu lấy từ API.

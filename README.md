# Hệ Thống Quản Trị Bản Quyền Serverless trên Netlify (Daily PC Cleaner PRO)

Bộ mã nguồn máy chủ quản trị và API kích hoạt bản quyền đám mây cho **Daily PC Cleaner PRO**, được tối ưu 100% để chạy trên nền tảng **Netlify Serverless** (hoàn toàn miễn phí, hoạt động 24/7 không cần bật máy tính).

---

## 🌟 Cấu trúc thư mục

```
NetlifyAdmin/
├── netlify.toml               # Cấu hình định tuyến & redirects trên Netlify
├── package.json               # Khai báo cấu hình dự án
├── README.md                  # Hướng dẫn triển khai chi tiết
├── public/                    # Giao diện Web tĩnh (Frontend)
│   ├── index.html             # Bảng điều khiển quản trị (Dashboard SaaS)
│   └── login.html             # Trang đăng nhập bảo mật
└── netlify/
    └── functions/
        └── api.js             # Serverless Functions API (Xác thực, Kích hoạt, Quản lý Key)
```

---

## 🚀 3 Bước Triển Khai Lên Netlify (Chỉ 2 Phút)

### Cách 1: Đẩy qua GitHub (Khuyên dùng - Nhanh & Tự Động)

1. **Đưa mã nguồn lên GitHub**:
   * Tạo 1 Repository mới trên GitHub (ví dụ: `daily-pc-cleaner-license`).
   * Copy toàn bộ các file bên trong thư mục `NetlifyAdmin` này đẩy lên Repository đó.

2. **Kết nối Netlify**:
   * Truy cập [https://app.netlify.com](https://app.netlify.com) và đăng nhập (bằng tài khoản GitHub).
   * Nhấn **Add new site** -> Chọn **Import an existing project** -> Chọn **GitHub**.
   * Chọn Repository bạn vừa tạo ở Bước 1.

3. **Bấm Triển Khai (Deploy)**:
   * Netlify sẽ tự động nhận diện file cấu hình `netlify.toml`.
   * Nhấn nút **Deploy site** -> Chờ khoảng **30 giây** là hoàn tất!
   * Bạn sẽ nhận được đường dẫn dạng: `https://ten-ung-dung.netlify.app`.

---

## 🔐 Thiết Lập Mật Khẩu Quản Trị (Tùy Chọn)

Mặc định khi mới tạo, tài khoản và mật khẩu quản trị là:
* **Tài khoản:** `admin`
* **Mật khẩu:** `admin123`

Để đổi mật khẩu bảo mật riêng của bạn:
1. Trên giao diện Netlify, vào mục **Site configuration** -> **Environment variables**.
2. Thêm 2 biến sau:
   * `ADMIN_USERNAME`: Tên tài khoản bạn muốn đặt
   * `ADMIN_PASSWORD`: Mật khẩu bảo mật bạn muốn đặt
3. Bấm **Save** và nhấn **Trigger deploy** để áp dụng.

---

## 💾 Lưu Trữ Dữ Liệu Bền Vững (Database)

Hệ thống hỗ trợ 2 phương án lưu trữ dữ liệu đám mây:
1. **Netlify Blobs (Tích hợp sẵn)**: Tự động kích hoạt trên Netlify, không cần cấu hình thêm bất kỳ tài khoản ngoài nào.
2. **Upstash Redis (Miễn phí)**: Nếu muốn đồng bộ với Redis Serverless:
   * Đăng ký tài khoản miễn phí tại [https://upstash.com](https://upstash.com).
   * Tạo 1 Database Redis (Free tier 10.000 requests/ngày).
   * Thêm 2 biến môi trường trên Netlify: `UPSTASH_REDIS_REST_URL` và `UPSTASH_REDIS_REST_TOKEN`.

---

## 💻 Cấu Hình Ứng Dụng Khách (Daily PC Cleaner Client)

Sau khi có URL trên Netlify (ví dụ: `https://my-cleaner-license.netlify.app`):
1. Mở file [DailyPCCleaner.ini](file:///C:/Users/Ying/.gemini/antigravity/scratch/DailyPCCleaner/DailyPCCleaner.ini):
   ```ini
   LicenseServerUrl=https://my-cleaner-license.netlify.app/
   ```
2. Đóng gói file `DailyPCCleaner.exe` gửi cho khách hàng.
3. Khi khách hàng mở app và nhập mã Key bạn cấp từ trang web Netlify, app sẽ kết nối thẳng lên Netlify để kích hoạt thành công 100%!

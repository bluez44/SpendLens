# SpendLens: Trải nghiệm qua mắt một người dùng trẻ & đề xuất cải tiến

> **Ngày:** 2026-09-17 · **Nhánh review:** `feat/shareable-cards` (commit `6da6a52`)
> **Cách làm:** đọc toàn bộ màn hình trong `src/app/`, các component `sl/*`, `share/*`, `settings/*` và logic trong `src/lib/`, rồi đi lại từng luồng như người dùng thật. App không chạy trên web nên review dựa trên code và copy trong `locales/vi.json`, không dựa trên ảnh chụp thiết bị. Mục nào cần kiểm chứng trên máy thật đều được đánh dấu **(cần kiểm chứng)**.

---

## 0. Persona

**Linh, 21 tuổi, sinh viên năm 3 kiêm part-time barista ở Sài Gòn.**

- Thu nhập: ~4–6 triệu/tháng từ lương part-time, cộng tiền gia đình chu cấp.
- Chi tiêu: trà sữa, cà phê, Grab/Xanh SM, Shopee, đi chơi cuối tuần với bạn, vài gói subscription (Spotify, Netflix share, iCloud).
- Thói quen: dùng Locket, TikTok, Instagram Story hằng ngày. Đã tải thử Money Lover / Misa nhưng bỏ sau 1 tuần vì "nhập mệt quá".
- Mong muốn: ghi chi tiêu **nhanh như chụp Locket**, nhìn là biết tháng này "cháy ví" chưa, có gì vui để khoe hoặc so với bạn bè.

---

## 1. Ấn tượng đầu tiên (TL;DR)

| 👍 Thích | 👎 Chưa ổn |
|---|---|
| Mở app là vào camera luôn, đúng vibe Locket | Chụp xong **bắt buộc gõ ghi chú** mới lưu được, nên vẫn "nhập mệt" |
| Swipe up xem các card giao dịch hôm nay rất đã | Chỉ xem được **hôm nay**. Hôm qua ăn gì phải vào History |
| Recap tuần / Streak share lên story được | Không có tìm kiếm, không lọc được theo danh mục |
| Dark mode, tiếng Việt tự nhiên, format `45.000₫` chuẩn | Không có backup/sync. Đổi máy là mất hết |
| Có subscription, đa tiền tệ, khoá app bằng vân tay/PIN | Điều hướng khó đoán: nút ⌂ vào Tổng quan, nút ☰ vào Thu chi, Thư viện nằm trong một FAB |

---

## 2. Đi qua từng màn hình

### 2.1 Camera (`/`)

**Hiện có:** viewfinder bo góc, pinch zoom + double-tap reset zoom, flash, lật camera, tắt tiếng chụp. Chạm nửa dưới viewfinder để ghi chú. Pill "Hôm nay −xxx₫" ở giữa thanh trên. Nút share card ở góc phải. Vuốt lên xem card giao dịch hôm nay.

**Cảm nhận của Linh:**
- ✅ "Mở app là chụp, thích!" Pill tổng chi hôm nay là chi tiết hay.
- ❌ **Không chọn được ảnh từ thư viện** ở camera. Bill Shopee/chuyển khoản thì mình có sẵn screenshot rồi, chụp lại màn hình rất kỳ.
- ❌ **Không có cách ghi nhanh không cần ảnh.** Trả tiền gửi xe 5k thì chẳng có gì để chụp. Hiện tại phải bấm chụp đại một tấm.
- ❌ Vùng chạm ghi chú (nửa dưới viewfinder) **vô hình**. Lần đầu dùng mình không biết là có. Ngoài ra còn dễ chạm nhầm khi định bấm chụp.
- ❌ Nút share card nằm ngay cạnh thanh nav (góc phải trên), trông như một nút thứ 4 lạc loài. Hơn nữa đang ở camera mà bấm vào lại ra recap tuần, không liên quan gì đến việc đang chụp.
- ❌ Pill chỉ hiện **chi**. Hôm nhận lương cũng chỉ thấy số âm.
- ⚠️ Icon ⌂ (home) và ☰ (menu) không nói rõ là "Tổng quan" và "Thu chi".
- ⚠️ Các nút tròn (home, menu, flash, flip, shutter) **thiếu `accessibilityLabel`**, nên TalkBack/VoiceOver đọc không ra.

### 2.2 Card giao dịch hôm nay (swipe up)

- ✅ Full-screen, ảnh + gradient + số tiền to: rất "Locket".
- ❌ Chỉ có hôm nay. Muốn lướt lại **cả tuần như một cuộn phim/story** thì không được.
- ❌ Không có thao tác nhanh trên card: sửa, xoá, đổi danh mục. Muốn làm gì cũng phải tap vào chi tiết.
- ⚠️ Card không có ảnh chỉ là một nền màu trơn của danh mục, trông khá trống.
- ⚠️ Nút share per-card **chỉ hiện khi có ảnh** (cả ở chi tiết giao dịch).
- ⚠️ Không có chỉ báo vị trí kiểu "3/7" khi đang lướt.

### 2.3 Nhập chi tiết (`/entry`)

**Hiện có:** ảnh preview, toggle Chi/Thu, ô số tiền lớn, chọn tiền tệ, 7 danh mục tĩnh + danh mục tự tạo, ghi chú, ngày giờ.

- ❌ **Ghi chú bắt buộc** (`canSave = amount > 0 && note !== ''`). Đây là điểm ma sát lớn nhất. Người dùng trẻ muốn chỉ cần *số tiền + danh mục* là lưu được. Ghi chú nên để tuỳ chọn, hoặc tự điền tên danh mục.
- ❌ Ô số tiền **không auto-focus**, nên phải chạm thêm một lần nữa. **(cần kiểm chứng)**
- ❌ Không có **gợi ý số tiền nhanh** (20k, 50k, 100k…) hay phím tắt "000".
- ❌ **Thu nhập không có danh mục** (lương, freelance, được cho, hoàn tiền…), nên sau này không phân tích được nguồn thu.
- ❌ Tạo danh mục riêng phải chọn "Khác" rồi mới hiện ô nhập, **không ai tự đoán được**. Xoá danh mục thì phải long-press (ẩn), mà danh mục tự tạo cũng không chọn được icon hay màu.
- ❌ Lưu xong app `router.replace('/')` quay về camera **không có toast/haptic xác nhận**, cũng không có "Hoàn tác".
- ❌ Không nhớ danh mục/ghi chú hay dùng. Sáng nào cũng "Cà phê · 29k" mà phải gõ lại.
- 🐞 **Bug:** khi **sửa** giao dịch, ô ngày giờ vẫn cho chọn nhưng giá trị bị bỏ qua. Payload dùng `existing.date` / `existing.time` / `existing.createdAt` (`src/app/entry.tsx`, hàm `save`), nên **không đổi được ngày của giao dịch cũ**.

### 2.4 Tổng quan (`/home`)

**Hiện có:** segmented Ngày/Tuần/Tháng, thẻ số dư gradient + delta so với kỳ trước, thanh ngân sách tháng, bar chart chi theo tháng (link sang So sánh), donut top 5 danh mục có % thay đổi.

- ✅ Delta "so với tuần trước" dễ hiểu, màu sắc đẹp.
- ❌ Thanh ngân sách **luôn là của tháng**, kể cả khi đang xem "Ngày" hay "Tuần", gây khó hiểu.
- ❌ Không có "**Hôm nay còn tiêu được bao nhiêu**" (ngân sách còn lại ÷ số ngày còn lại). Với sinh viên, đây là con số quan trọng nhất.
- ❌ Donut và legend **không tap được**. Muốn xem "Ăn uống tháng này gồm những gì" thì không có đường đi.
- ❌ Bar chart không chạm để xem số từng tháng. **(cần kiểm chứng)**
- ❌ Không có lối tắt sang Thu chi, Thư viện, Subscription. Header chỉ có ⚙ và ✕.
- ❌ Không có "subscription sắp tới hạn" hay "chi lớn nhất tuần".
- 🐞 `BudgetBar` và `BudgetSheet` dùng `formatVND` cứng. Nếu tiền tệ chính là USD thì ngân sách hiển thị sai đơn vị.

### 2.5 Thu chi (`/history`) & Tháng cũ (`/history-months`)

- ✅ Nhóm theo ngày có tổng ròng từng ngày, export CSV có chọn khoảng ngày.
- ❌ **Không có tìm kiếm** ("tháng trước mình đi Phúc Long bao nhiêu lần?").
- ❌ **Không lọc** theo danh mục, thu/chi, tiền tệ, có ảnh/không ảnh.
- ❌ Ngày/Tuần/Tháng luôn là **kỳ hiện tại**, không lùi được "tuần trước". Riêng tháng cũ lại tách ra một màn hình khác, gây gãy mạch.
- ❌ Không **vuốt để xoá/sửa** trên dòng giao dịch.
- ⚠️ Nút share ở header là **export CSV**, trong khi icon share ở chỗ khác là chia sẻ ảnh. Cùng icon mà hai nghĩa.
- ⚠️ FAB "Thư viện" nổi ở góc trái dưới có thể che dòng cuối.

### 2.6 Thư viện (`/gallery`)

- ✅ Grid 3 cột, subtitle "N khoảnh khắc chi tiêu" dễ thương.
- ❌ Hiển thị **cả giao dịch không có ảnh** (tile placeholder), làm loãng "thư viện ảnh".
- ❌ Không nhóm theo tháng, không lọc, không có chế độ xem như Locket "history" hay recap video.
- ⚠️ Dòng quy đổi `≈ …` dùng `c.textSecondary` trên nền đen mờ, **tương phản kém**, nhất là ở light theme.
- ⚠️ Dùng `ScrollView` + `map` toàn bộ giao dịch. Vài nghìn ảnh sẽ lag, nên chuyển sang `FlatList`/`FlashList`.

### 2.7 Chi tiết giao dịch (`/transaction/[id]`)

- ❌ Ảnh header 340px **không phóng to/xem full** được. Muốn đọc bill thì chịu.
- ❌ Nút xoá chỉ là text đỏ ở cuối, còn sửa là icon bút trên ảnh. Hai hành động chính lại có hai kiểu hiển thị.
- ❌ Không có "Nhân bản giao dịch" (rất hay dùng cho khoản lặp lại không định kỳ).
- ⚠️ Dòng "Ghi chú" gần như **không bao giờ hiện**, vì entry luôn lưu `note: null` và gộp vào `name`.

### 2.8 Subscription (`/subscriptions`)

- ✅ Có nhắc trước 7/3/1 ngày, tạm dừng, tự tạo giao dịch khi đến hạn. Rất hữu ích với Gen Z nhiều gói.
- ❌ Chỉ có chu kỳ **hàng tháng**. Thiếu hàng năm (iCloud 1 năm, domain), hàng tuần, 3 tháng.
- ❌ Không có **tổng chi subscription/tháng** ở đầu danh sách.
- ❌ Empty state chỉ có một dòng chữ, chưa có CTA hay gợi ý nhanh (Spotify, Netflix, YouTube Premium, iCloud…).
- ⚠️ Nút thêm là ký tự `＋` trong header native. Header ở đây và ở Cài đặt là header native, **khác phong cách** header tự vẽ ở các màn còn lại.

### 2.9 Chia sẻ (`/share`)

- ✅ Recap tuần có "narrative" (blew_budget, splurged, locked_in…) rất bắt trend, có nút ẩn số tiền để giữ riêng tư. Xuất 1080×1920 đúng khung story.
- ❌ Chỉ có 2 loại card. Thiếu **Recap tháng**, **Wrapped cuối năm**, "Top 3 quán đi nhiều nhất", "Ngày cháy ví nhất".
- ❌ Không có chọn **theme/màu nền/sticker** cho card.
- ❌ Streak chỉ đếm "ngày có log". Không có mốc thưởng (7/30/100 ngày), huy hiệu hay "streak freeze".
- ⚠️ Chỉ vào được từ nút góc camera và từ thông báo. Tổng quan và Thu chi không có lối vào.

### 2.10 Cài đặt (`/settings`)

- ✅ Đủ các nhóm: ngân sách, nhắc nhở, ngôn ngữ, khoá app, giao diện, subscription, tiền tệ, dữ liệu.
- ❌ **Không có Sao lưu / Khôi phục** (Google Drive, iCloud, file). Chỉ export CSV **một chiều**, **không import** được. Với người dùng thật đây là rủi ro mất dữ liệu lớn nhất. Spec `2026-07-27-drive-sync-and-app-lock-design.md` mới làm xong phần app lock.
- ❌ Thứ tự nhóm chưa hợp lý: Ngôn ngữ chen giữa Nhắc nhở và Bảo mật, còn Subscription nằm trong Cài đặt thay vì là tính năng chính.
- ❌ Ngân sách chỉ có **một con số tổng/tháng**. Không đặt được theo danh mục ("ăn uống tối đa 2 triệu") và không chọn được ngày bắt đầu chu kỳ (nhận lương ngày 10).
- ⚠️ Màu `#FB5B4D` hardcode trong `data-section.tsx`, `entry.tsx`, `budget-bar.tsx` thay vì dùng `Money.expense`.

---

## 3. Lỗi phát hiện trong lúc review

| # | Mức độ | Mô tả | Vị trí |
|---|---|---|---|
| B1 | Cao | Sửa giao dịch không đổi được ngày giờ (picker hiện nhưng giá trị bị bỏ qua) | `src/app/entry.tsx` → `save()` |
| B2 | Trung bình | Ngân sách luôn format VND, sai khi tiền tệ chính khác VND | `src/components/sl/budget-bar.tsx`, `budget-sheet.tsx` |
| B3 | Thấp | Dòng "Ghi chú" ở chi tiết không bao giờ hiện vì entry luôn lưu `note: null` | `entry.tsx`, `transaction/[id].tsx`, `txn-card.tsx` |
| B4 | Thấp | Chữ `≈` quy đổi tương phản kém trên overlay tối | `gallery.tsx`, `txn-card.tsx` |
| B5 | Thấp | README ghi "seed dữ liệu mẫu lần đầu", nhưng `seed.ts` là DEV-ONLY và không được gọi. README cũ | `README.md` |
| B6 | A11y | Nhiều `Pressable` dạng icon thiếu `accessibilityLabel` | `index.tsx`, `transaction/[id].tsx`, `gallery.tsx` |

---

## 4. Đề xuất tính năng **mới**

Ưu tiên theo góc nhìn người dùng trẻ: **P0** = thiếu là dễ bỏ app, **P1** = tạo thói quen/khác biệt, **P2** = "nice to have".

### P0: Giữ chân người dùng

1. **Sao lưu & khôi phục**
   - Google Drive / iCloud tự động hằng ngày, kèm "Sao lưu ngay" và "Khôi phục từ bản sao lưu".
   - Import lại từ CSV/JSON đã export.
   - Tận dụng cột `uuid` + `updated_at` đã có sẵn trong `transactions`.
2. **Ghi nhanh không cần ảnh** (Quick add)
   - Nút "⚡ Nhập nhanh" hoặc long-press shutter mở bàn phím số ngay.
   - Chỉ cần số tiền + chạm 1 danh mục là lưu (ghi chú tuỳ chọn).
3. **Chọn ảnh từ thư viện / screenshot** ngay ở màn camera (icon thư viện ở slot trái shutter, hiện đang trống `sideSlot`).
4. **Tìm kiếm & bộ lọc** ở Thu chi: tìm theo ghi chú, lọc theo danh mục, thu/chi, khoảng tiền, có ảnh.
5. **Onboarding 3 bước**: mục đích (tiết kiệm / kiểm soát / chỉ ghi lại) → ngân sách tháng + ngày nhận lương → bật nhắc nhở. Kèm coachmark cho vùng chạm ghi chú và cử chỉ vuốt lên.

### P1: Tạo thói quen & "viral"

6. **Ngân sách thông minh**
   - "Hôm nay còn tiêu được X₫" (safe-to-spend), hiện ngay trên pill ở camera.
   - Ngân sách theo danh mục.
   - Chu kỳ theo ngày nhận lương (vd. 10 → 9 tháng sau).
7. **Mục tiêu tiết kiệm (Saving goals)**: "Mua AirPods 4 triệu – còn 62 ngày", có thanh tiến độ và sticker ăn mừng khi đạt. Rất hợp tâm lý Gen Z.
8. **Streak 2.0 & gamification**
   - Mốc 7/30/100 ngày có huy hiệu, "Streak freeze" 1 lần/tuần.
   - Thử thách tuần: "No-spend day", "Tuần không trà sữa", "Dưới 100k/ngày".
   - Thông báo nhắc giữ streak trước 21h nếu hôm nay chưa log.
9. **Recap tháng & "SpendLens Wrapped"** cuối năm, dạng story nhiều slide: danh mục top, ngày tiêu nhiều nhất, quán quen, tổng số khoảnh khắc, "tính cách chi tiêu" (vd. *"Chiến thần trà sữa"*).
10. **Tuỳ biến share card**: chọn theme màu/gradient, sticker, ẩn/hiện từng dòng. Có thêm card "Top 3 chỗ tiêu nhiều" và "Ngày cháy ví nhất".
11. **Chia tiền / nợ bạn bè (Split bill)**: đánh dấu "mình trả hộ 3 người", theo dõi ai còn nợ, share tin nhắn đòi nợ dễ thương. Đi ăn nhóm là use case cực phổ biến.
12. **Home-screen widget (Android/iOS)**: "Hôm nay −85k · còn 120k" + nút mở camera. Widget kiểu Locket là điểm cộng rất lớn.
13. **Danh mục thu nhập**: Lương, Part-time, Freelance, Được cho, Hoàn tiền, Bán đồ cũ.

### P2: Nâng cao

14. **OCR đọc số tiền từ bill/screenshot chuyển khoản** (on-device ML Kit), tự điền số tiền, ngày và tên cửa hàng.
15. **Gợi ý thông minh**: nhớ ghi chú/danh mục/số tiền hay dùng theo khung giờ (7h sáng → "Cà phê · 29k").
16. **Ví / nguồn tiền**: Tiền mặt, Momo, ZaloPay, thẻ ngân hàng, kèm số dư từng ví và chuyển tiền giữa các ví.
17. **Chu kỳ subscription linh hoạt** (tuần / 3 tháng / năm), tổng chi subscription/tháng, gợi ý "gói bạn ít dùng".
18. **Tag / địa điểm** (tuỳ chọn, xin quyền vị trí) để xem "bản đồ chi tiêu" và "quán quen".
19. **Thêm tiền tệ du lịch phổ biến** với người Việt: THB, SGD, CNY, TWD, AUD. Có chế độ **"Chuyến đi"** gom chi phí một chuyến.
20. **Chế độ riêng tư nhanh**: lắc máy hoặc chạm pill để ẩn toàn bộ số tiền khi đưa máy cho bạn xem.

---

## 5. Đề xuất **cải tiến** tính năng hiện có

| Khu vực | Cải tiến | Lý do |
|---|---|---|
| Entry | Ghi chú **không bắt buộc**, mặc định tên danh mục | Bớt ma sát lớn nhất trong luồng chính |
| Entry | Auto-focus ô số tiền; chip số tiền nhanh (10k/20k/50k/100k) và phím "000" | Nhập < 3 giây |
| Entry | Nút "＋ Danh mục" luôn hiện (không cần chọn "Khác"); chọn emoji/màu cho danh mục tự tạo | Khả năng khám phá |
| Entry | Sau khi lưu: toast "Đã lưu −45k · Hoàn tác" + haptic nhẹ | Phản hồi và an toàn |
| Entry | Sửa lỗi B1 (không đổi ngày khi sửa) | Đúng kỳ vọng |
| Camera | Pill tổng hiển thị cả thu (hoặc số ròng) và safe-to-spend; tap pill mở Tổng quan | Thông tin hữu ích nhất ngay màn đầu |
| Camera | Hint lần đầu "Chạm để ghi chú" trên viewfinder, sau đó ẩn | Tính năng ẩn → khám phá được |
| Camera | Chuyển nút share card ra khỏi camera (sang Tổng quan / Thu chi) | Giảm nhiễu màn chụp |
| Card swipe | Cho lướt **7 ngày gần nhất** với divider theo ngày, kèm chỉ báo vị trí | Cảm giác "cuộn phim" |
| Card swipe | Long-press card: Sửa · Xoá · Nhân bản · Chia sẻ | Thao tác tại chỗ |
| Card swipe | Card không ảnh: icon danh mục cỡ lớn + pattern thay nền trơn | Đỡ trống trải |
| Home | Donut/legend tap → danh sách giao dịch của danh mục đó | Drill-down tự nhiên |
| Home | Thanh ngân sách theo range đang chọn (ngày/tuần prorate từ tháng) | Nhất quán |
| Home | Card "Sắp tới hạn" (subscription 7 ngày tới) và "Khoản chi lớn nhất" | Insight nhanh |
| Thu chi | Mũi tên ‹ › lùi/tiến kỳ; gộp `/history-months` vào đây | Bớt một màn hình, bớt gãy mạch |
| Thu chi | Swipe row trái = xoá, phải = sửa | Chuẩn mobile |
| Thu chi | Đổi icon export CSV thành "download/xuất file" | Tránh trùng nghĩa với share ảnh |
| Thư viện | Chỉ hiện giao dịch có ảnh; nhóm theo tháng có sticky header; `FlatList` | Đúng tinh thần "thư viện", hiệu năng |
| Chi tiết | Tap ảnh → xem full màn hình, pinch-zoom; thêm "Nhân bản" | Đọc bill |
| Chi tiết | Share được cả giao dịch không có ảnh (card nền danh mục) | Nhất quán |
| Subscription | Tổng chi/tháng ở đầu; empty state có template gói phổ biến | Giá trị ngay lập tức |
| Share | Mở từ Tổng quan; thêm Recap tháng | Dễ tìm |
| Cài đặt | Sắp xếp lại: Tài khoản & Sao lưu → Ngân sách → Nhắc nhở → Giao diện & Ngôn ngữ → Bảo mật → Tiền tệ → Dữ liệu → Thông tin | Theo tần suất dùng |
| Nhắc nhở | Copy nhắc nhở vui hơn, xoay vòng nhiều câu ("Hôm nay ví bạn ổn không? 👀") | Ít bị tắt thông báo |

---

## 6. Đề xuất UI/UX tổng thể

### 6.1 Điều hướng
- **Giữ camera là màn khởi động** (theo quy ước dự án, không thêm tab bar). Nên thêm một **"dock" nổi** gọn ở màn camera, gồm 3 icon có nhãn nhỏ: *Tổng quan · Thu chi · Thư viện*, thay cho cặp ⌂/☰ khó hiểu hiện nay.
- Thống nhất header: **Cài đặt** và **Subscription** đang dùng header native, còn các màn khác tự vẽ (tiêu đề 22px + nút tròn). Nên đưa hết về header tự vẽ.
- Thống nhất nút đóng/quay lại: có màn dùng ✕ (Home, History, Compare), có màn dùng ← (Gallery, Detail). Quy ước: màn *modal* dùng ✕, màn *push* dùng ←.

### 6.2 Phản hồi & chuyển động
- **Haptics** (`expo-haptics`) khi chụp, lưu, xoá, vượt ngân sách, đạt streak. Hiện chưa có haptic nào.
- **Toast** dùng chung (component `sl/toast`) thay cho `Alert.alert` ở các thông báo không cần quyết định (lưu thành công, đã sao chép…). Giữ `Alert` cho thao tác phá huỷ.
- Micro-animation: số tiền "đếm lên" ở thẻ số dư, confetti nhẹ khi dưới ngân sách cuối tháng hoặc đạt mốc streak.
- Skeleton/empty state có minh hoạ và CTA ở Thu chi, Thư viện, Subscription, So sánh (hiện chủ yếu là một dòng chữ xám).

### 6.3 Thị giác
- Dùng token thay màu hardcode (`#FB5B4D`, `#F59E0B`, `#FF6B6B`, `#D1FAE5`). Dùng `fontWeight` qua `W.*` thay chuỗi `'500'`/`'700'` trong `settings/*`.
- Danh mục: bổ sung **emoji/icon** vào chip ở mọi nơi (legend donut, compare, card). Tăng số danh mục tĩnh hợp với người trẻ: *Cà phê/Trà sữa, Học tập, Làm đẹp, Quà tặng, Thú cưng*.
- Kiểm tra tương phản WCAG AA cho chữ phụ trên overlay ảnh (B4) và chữ trắng trên gradient peach→coral ở light mode.
- Tuỳ chọn **accent color** (peach, tím, xanh mint, đen trắng tối giản). Người dùng trẻ thích cá nhân hoá.

### 6.4 Khả năng tiếp cận
- Thêm `accessibilityLabel` / `accessibilityRole` cho mọi nút icon (B6).
- Tôn trọng *Dynamic Type / font scale*: kiểm tra các kích thước cố định (`fontSize: 44`, `46`) khi người dùng tăng cỡ chữ. **(cần kiểm chứng)**
- Vùng chạm ≥ 44×44 (nút đóng ảnh ở Entry hiện 30×30).

### 6.5 Ngôn ngữ & giọng văn
- Copy phần Share đã rất "Gen Z" ("Log vài giao dịch trước đã nhé!"), nhưng Cài đặt/Entry còn khô ("SỐ TIỀN", "GHI CHÚ"). Nên thống nhất một giọng thân thiện, nhất quán.
- Tránh trộn Anh–Việt không chủ đích: `"{{n}} txns tuần này"`, `"{{pct}}% budget"`. Nên đổi thành "giao dịch" và "ngân sách", hoặc chủ đích giữ tiếng lóng nhưng áp dụng đồng đều.

---

## 7. Lộ trình gợi ý

| Giai đoạn | Nội dung | Effort ước lượng |
|---|---|---|
| **Sprint 1: Sửa & bớt ma sát** | B1–B6, ghi chú tuỳ chọn, auto-focus số tiền + chip số tiền nhanh, toast "Hoàn tác", haptics, chọn ảnh từ thư viện ở camera | S–M |
| **Sprint 2: Không mất dữ liệu** | Sao lưu/khôi phục Google Drive (theo spec đã có), import CSV/JSON, onboarding 3 bước | M–L |
| **Sprint 3: Tìm & hiểu dữ liệu** | Tìm kiếm + lọc, drill-down donut, gộp history-months, lùi/tiến kỳ, safe-to-spend, ngân sách theo danh mục | M |
| **Sprint 4: Thói quen & viral** | Streak 2.0 + thử thách, Recap tháng, tuỳ biến share card, widget màn hình chính | L |
| **Sau đó** | Mục tiêu tiết kiệm, Split bill, ví/nguồn tiền, OCR bill, Wrapped cuối năm | L–XL |

> Mỗi hạng mục không nhỏ nên đi theo quy trình của dự án: spec trong `docs/superpowers/specs/` → plan trong `docs/superpowers/plans/` → implement.

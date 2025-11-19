# Hướng dẫn Build App Windows và Android

## 📦 Windows Desktop App (Electron)

### Cài đặt dependencies
```bash
cd frontend
npm install
```

### Chạy app trong development mode
```bash
npm run electron:dev
```

### Build Windows Installer (.exe)
```bash
npm run electron:build:win
```

**Output:** File `.exe` sẽ có trong `frontend/dist-electron/`

### Icon
- Đặt file icon `icon.ico` vào thư mục `frontend/electron/`
- Kích thước khuyến nghị: 256x256 hoặc 512x512

---

## 📱 Android APK (Capacitor)

### Prerequisites
1. **Cài Android Studio**: https://developer.android.com/studio
2. **Cài Android SDK** (qua Android Studio)
3. **Set environment variables** (Windows):
   ```powershell
   # Thêm vào System Environment Variables
   ANDROID_HOME = C:\Users\YourName\AppData\Local\Android\Sdk
   ```

### Setup lần đầu
```bash
cd frontend

# Initialize Capacitor
npm run capacitor:init

# Add Android platform
npm run capacitor:add:android

# Sync web assets
npm run capacitor:sync
```

### Development
```bash
# Build web app
npm run build

# Sync to Android
npm run capacitor:sync

# Open in Android Studio
npm run capacitor:open:android
```

### Build APK trong Android Studio
1. Mở Android Studio
2. File > Open > Chọn thư mục `frontend/android/`
3. Build > Build Bundle(s) / APK(s) > Build APK(s)
4. APK sẽ có trong `frontend/android/app/build/outputs/apk/debug/`

### Build Release APK (Signed)

#### 1. Tạo Keystore
```bash
keytool -genkey -v -keystore pusd-release.keystore -alias pusd -keyalg RSA -keysize 2048 -validity 10000
```

#### 2. Cập nhật `capacitor.config.ts`
```typescript
android: {
  buildOptions: {
    keystorePath: 'path/to/pusd-release.keystore',
    keystoreAlias: 'pusd',
    keystorePassword: 'your-keystore-password',
    keystoreAliasPassword: 'your-alias-password',
  },
}
```

#### 3. Build trong Android Studio
- Build > Generate Signed Bundle / APK
- Chọn APK
- Chọn keystore file
- Nhập passwords
- Build

---

## 🚀 Quick Commands

### Windows
```bash
cd frontend
npm run electron:dev        # Dev mode
npm run electron:build:win   # Build installer
```

### Android
```bash
cd frontend
npm run build                           # Build web
npm run capacitor:sync                  # Sync to Android
npm run capacitor:open:android          # Open Android Studio
```

---

## 📝 Notes

- **Windows**: Cần icon.ico trong `frontend/electron/`
- **Android**: Cần Android Studio và SDK đã cài đặt
- **Keystore**: Lưu cẩn thận, mất là không build được release APK
- **Build size**: Electron ~100-150MB, Android APK ~20-50MB

---

## 🔧 Troubleshooting

### Electron không chạy
- Kiểm tra port 3000 có bị chiếm không
- Xóa `node_modules` và `npm install` lại

### Android build lỗi
- Kiểm tra ANDROID_HOME đã set chưa
- Kiểm tra Android SDK đã cài đầy đủ chưa
- Xóa `android/` và chạy lại `capacitor:add:android`

### APK không cài được
- Kiểm tra "Unknown sources" đã bật chưa
- Với release APK, cần sign đúng keystore


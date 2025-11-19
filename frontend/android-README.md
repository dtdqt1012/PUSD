# Android APK Build Guide

## Prerequisites
1. Install Android Studio
2. Install Android SDK
3. Set ANDROID_HOME environment variable

## Setup (First Time)
```bash
# Initialize Capacitor
npm run capacitor:init

# Add Android platform
npm run capacitor:add:android

# Sync web assets
npm run capacitor:sync
```

## Development
```bash
# Build web app
npm run build

# Sync to Android
npm run capacitor:sync

# Open in Android Studio
npm run capacitor:open:android
```

## Build APK in Android Studio
1. Open Android Studio
2. Open `android/` folder
3. Build > Build Bundle(s) / APK(s) > Build APK(s)
4. APK will be in `android/app/build/outputs/apk/`

## Sign APK (for release)
1. Generate keystore:
```bash
keytool -genkey -v -keystore pusd-release.keystore -alias pusd -keyalg RSA -keysize 2048 -validity 10000
```

2. Update `capacitor.config.ts` with keystore path

3. Build signed APK in Android Studio:
   - Build > Generate Signed Bundle / APK
   - Select APK
   - Choose keystore file
   - Enter passwords
   - Build

## Environment Variables
Set in `capacitor.config.ts`:
- `keystorePath`: Path to keystore file
- `keystoreAlias`: Alias name
- `keystorePassword`: Keystore password
- `keystoreAliasPassword`: Alias password


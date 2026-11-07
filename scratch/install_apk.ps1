$env:PATH = "D:\Android\AndroidSDK\platform-tools;$env:PATH"
& adb devices -l
Write-Host "Installing app-debug.apk onto emulator-5554..."
& adb -s emulator-5554 install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk

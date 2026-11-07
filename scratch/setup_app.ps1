$env:PATH = "D:\Android\AndroidSDK\platform-tools;$env:PATH"

Write-Host "Granting POST_NOTIFICATIONS..."
& adb -s emulator-5554 shell pm grant com.cura.app android.permission.POST_NOTIFICATIONS

Write-Host "Setting up port reverse for Metro (8081)..."
& adb -s emulator-5554 reverse tcp:8081 tcp:8081

Write-Host "Verifying package permissions..."
& adb -s emulator-5554 shell dumpsys package com.cura.app | Select-String "android.permission.POST_NOTIFICATIONS"

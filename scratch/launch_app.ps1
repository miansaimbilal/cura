$env:PATH = "D:\Android\AndroidSDK\platform-tools;$env:PATH"
& adb -s emulator-5554 reverse tcp:8081 tcp:8081
& adb -s emulator-5554 logcat -c
Write-Host "Launching com.cura.app/.MainActivity..."
& adb -s emulator-5554 shell am start -n com.cura.app/.MainActivity

Start-Sleep -Seconds 5
$pid = & adb -s emulator-5554 shell pidof com.cura.app
Write-Host "PID of com.cura.app: $pid"

& adb -s emulator-5554 shell dumpsys activity activities | Select-String "com.cura.app"

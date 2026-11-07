$env:PATH = "D:\Android\AndroidSDK\platform-tools;$env:PATH"
Write-Host "--- SQLite database files for com.cura.app ---"
& adb -s emulator-5554 shell "run-as com.cura.app ls -la files/SQLite/"
& adb -s emulator-5554 shell "run-as com.cura.app ls -la databases/"

$env:PATH = "D:\Android\AndroidSDK\platform-tools;$env:PATH"
& adb -s emulator-5554 shell screencap -p /sdcard/screen.png
& adb -s emulator-5554 pull /sdcard/screen.png scratch/screen.png
Test-Path scratch/screen.png

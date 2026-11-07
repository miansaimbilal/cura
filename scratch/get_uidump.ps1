$env:PATH = "D:\Android\AndroidSDK\platform-tools;$env:PATH"
& adb -s emulator-5554 shell uiautomator dump /sdcard/window_dump.xml
& adb -s emulator-5554 pull /sdcard/window_dump.xml scratch/window_dump.xml
Test-Path scratch/window_dump.xml

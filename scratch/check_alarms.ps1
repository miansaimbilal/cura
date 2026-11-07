$env:PATH = "D:\Android\AndroidSDK\platform-tools;$env:PATH"
& adb -s emulator-5554 shell "dumpsys alarm | grep -E 'com.cura.app|NOTIFICATION_EVENT'"

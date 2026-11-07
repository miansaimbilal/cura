$env:PATH = "D:\Android\AndroidSDK\platform-tools;$env:PATH"
& adb -s emulator-5554 shell "dumpsys activity intents | grep -A 5 -B 2 '8e51f40'"

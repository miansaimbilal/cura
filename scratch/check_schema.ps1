$env:PATH = "D:\Android\AndroidSDK\platform-tools;$env:PATH"
& adb -s emulator-5554 shell "run-as com.cura.app sqlite3 files/SQLite/cura.db 'PRAGMA user_version; SELECT name FROM sqlite_master WHERE type=\"table\";'"

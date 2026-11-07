$env:PATH = "C:\nvm4w\nodejs;D:\Android\AndroidSDK\platform-tools;D:\Android\AndroidSDK\cmdline-tools\latest\bin;$env:PATH"
& "D:\Android\AndroidSDK\platform-tools\adb.exe" devices -l

Write-Host "--- JAVA ---"
Get-Command java -ErrorAction SilentlyContinue | Format-List Source, Version
if ($env:JAVA_HOME) { Write-Host "JAVA_HOME=$env:JAVA_HOME" }

Write-Host "--- ANDROID SDK / CMDLINE TOOLS ---"
Get-ChildItem "D:\Android" -ErrorAction SilentlyContinue | Format-Table Name, FullName
Get-ChildItem "D:\Android\AndroidSDK" -ErrorAction SilentlyContinue | Format-Table Name, FullName

Write-Host "--- EAS CLI ---"
Get-Command eas -ErrorAction SilentlyContinue | Format-List Source

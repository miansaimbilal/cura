$env:PATH = "C:\nvm4w\nodejs;D:\Android\AndroidSDK\platform-tools;$env:PATH"
$env:ANDROID_HOME = "D:\Android\AndroidSDK"
$env:ANDROID_SDK_ROOT = "D:\Android\AndroidSDK"
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot"
$env:GRADLE_USER_HOME = "D:\Android\.gradle"

Set-Location mobile/android
.\gradlew.bat assembleDebug --stacktrace

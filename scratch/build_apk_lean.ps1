$env:PATH = "C:\nvm4w\nodejs;D:\Android\AndroidSDK\platform-tools;$env:PATH"
$env:ANDROID_HOME = "D:\Android\AndroidSDK"
$env:ANDROID_SDK_ROOT = "D:\Android\AndroidSDK"
$env:JAVA_HOME = "D:\Android\Android Studio\jbr"
$env:GRADLE_USER_HOME = "D:\Android\.gradle"

Set-Location mobile/android
.\gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64 --no-parallel --max-workers=2 '-Dorg.gradle.jvmargs=-Xmx1200m -XX:MaxMetaspaceSize=384m'

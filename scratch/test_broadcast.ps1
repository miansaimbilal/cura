$env:PATH = "D:\Android\AndroidSDK\platform-tools;$env:PATH"

Write-Host "Sending broadcast..."
& adb -s emulator-5554 shell "am broadcast -a expo.modules.notifications.NOTIFICATION_EVENT -d expo-notifications://notifications/scheduled/53589d38-891c-45e4-9ecb-fffbc6a59f44/trigger -n com.cura.app/expo.modules.notifications.service.NotificationsService"

Start-Sleep -Seconds 3

Write-Host "Checking active notifications for com.cura.app..."
& adb -s emulator-5554 shell "dumpsys notification --noredact | grep -A 20 'com.cura.app'"

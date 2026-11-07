$env:PATH = "C:\nvm4w\nodejs;$env:PATH"
$env:EXPO_NO_TELEMETRY = "1"
Set-Location mobile
npx expo start --port 8081

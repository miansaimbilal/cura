$env:PATH = "C:\nvm4w\nodejs;$env:PATH"
$env:EXPO_NO_TELEMETRY = "1"
Set-Location mobile
npx expo-doctor
Write-Host "DOCTOR_EXIT_CODE=$LASTEXITCODE"
npx expo install --check
Write-Host "INSTALL_CHECK_EXIT_CODE=$LASTEXITCODE"

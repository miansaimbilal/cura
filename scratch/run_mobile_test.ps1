$env:PATH = "C:\nvm4w\nodejs;$env:PATH"
Set-Location mobile
npm test
Write-Host "EXIT_CODE=$LASTEXITCODE"

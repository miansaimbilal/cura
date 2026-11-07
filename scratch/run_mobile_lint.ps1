$env:PATH = "C:\nvm4w\nodejs;$env:PATH"
Set-Location mobile
npm run lint
Write-Host "EXIT_CODE=$LASTEXITCODE"

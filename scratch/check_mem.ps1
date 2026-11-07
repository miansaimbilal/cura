Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 ProcessName, Id, @{Name="WS_MB"; Expression={[math]::Round($_.WorkingSet64 / 1MB)}} | Format-Table -AutoSize

[xml]$xml = Get-Content scratch/window_dump.xml
$nodes = $xml.SelectNodes("//node[@text!='']")
$nodes | Select-Object -Property @{Name="text"; Expression={$_.GetAttribute("text")}}, @{Name="bounds"; Expression={$_.GetAttribute("bounds")}} | Format-Table -AutoSize

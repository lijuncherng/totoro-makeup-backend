$body = @{
    count = 10
    times = 1
    kind = "makeup"
    expiresDays = 365
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
    "x-admin-secret" = "default-admin-secret-change-me"
}

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3005/api/recharge/generate" -Method Post -Body $body -Headers $headers
    Write-Host "Success!"
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host "Response: $($_.Exception.Response)"
}

# 生成 100 次补跑和阳光跑卡密
$makeupBody = @{
    count = 1
    times = 100
    kind = "makeup"
    expiresDays = 365
} | ConvertTo-Json

$sunrunBody = @{
    count = 1
    times = 100
    kind = "sunrun"
    expiresDays = 365
} | ConvertTo-Json

$headers = @{
    "Content-Type" = "application/json"
    "x-admin-secret" = "default-admin-secret-change-me"
}

Write-Host "===== 生成 100 次补跑卡密 =====" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3005/api/recharge/generate" -Method Post -Body $makeupBody -Headers $headers
    Write-Host "Success!" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "===== 生成 100 次阳光跑卡密 =====" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3005/api/recharge/generate" -Method Post -Body $sunrunBody -Headers $headers
    Write-Host "Success!" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME = 'C:\Android\sdk'
$env:ANDROID_SDK_ROOT = 'C:\Android\sdk'
$adb = 'C:\Android\sdk\platform-tools\adb.exe'

Set-Location 'C:\Users\ASUS\desktop\kotha_project\client'
Write-Output '=== [1/5] web build ==='
& npm run build 2>&1 | Select-Object -Last 3
Write-Output '=== [2/5] cap sync ==='
& npx cap sync android 2>&1 | Select-Object -Last 2

Set-Location 'C:\Users\ASUS\desktop\kotha_project\client\android'
Write-Output '=== [3/5] gradle assembleDebug ==='
& .\gradlew.bat assembleDebug --no-daemon 2>&1 | Select-Object -Last 3

Write-Output '=== [4/5] install + launch ==='
& $adb install -r 'app\build\outputs\apk\debug\app-debug.apk' 2>&1 | Select-Object -Last 1
& $adb shell pm grant ai.customgpt.kotha android.permission.RECORD_AUDIO 2>&1 | Out-Null
& $adb logcat -c 2>&1 | Out-Null
& $adb shell am force-stop ai.customgpt.kotha 2>&1 | Out-Null
& $adb shell monkey -p ai.customgpt.kotha -c android.intent.category.LAUNCHER 1 2>&1 | Out-Null

Write-Output '=== [5/5] wait + screenshot ==='
Start-Sleep -Seconds 8
& $adb shell screencap -p /sdcard/k.png 2>&1 | Out-Null
Remove-Item 'C:\Users\ASUS\Desktop\kotha_screen.png' -ErrorAction SilentlyContinue
& $adb pull /sdcard/k.png 'C:\Users\ASUS\Desktop\kotha_screen.png' 2>&1 | Out-Null
& $adb shell rm /sdcard/k.png 2>&1 | Out-Null
Write-Output '=== console errors (if any) ==='
& $adb logcat -d 2>&1 | Select-String -Pattern "boot-error|Uncaught|TypeError|net::ERR|chromium.*ERROR|Console:" | Select-Object -Last 12
Write-Output 'DONE'

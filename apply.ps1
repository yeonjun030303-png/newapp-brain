# apply.ps1 - 클립보드의 "저장 패키지"를 이 저장소에 적용하고 커밋/푸시한다.
# 사용: AI가 준 코드블록을 복사한 뒤 저장소 폴더에서  .\apply.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$text = Get-Clipboard -Raw
if (-not $text) { Write-Host '클립보드가 비어 있어요'; exit 1 }

# 코드블록 울타리(```)가 맨 앞/뒤에 붙어 있으면 제거
$lines = $text -split "`r?`n"
if ($lines.Count -gt 1 -and $lines[0].TrimStart().StartsWith('```')) { $lines = $lines[1..($lines.Count-1)] }
if ($lines.Count -gt 1 -and $lines[-1].Trim() -eq '```') { $lines = $lines[0..($lines.Count-2)] }
$text = ($lines -join "`n") + "`n"

$blocks = [regex]::Matches($text, '(?m)^=== FILE: (.+?) ===\r?\n')
if ($blocks.Count -eq 0) { Write-Host '=== FILE: 경로 === 블록이 없어요'; exit 1 }

$files = @()
for ($i = 0; $i -lt $blocks.Count; $i++) {
  $b = $blocks[$i]
  $start = $b.Index + $b.Length
  $end = if ($i + 1 -lt $blocks.Count) { $blocks[$i + 1].Index } else { $text.Length }
  $content = $text.Substring($start, $end - $start).TrimEnd() + "`n"
  $rel = $b.Groups[1].Value.Trim()
  if ($rel -match '\.\.' -or [System.IO.Path]::IsPathRooted($rel) -or $rel -match '^\.git([/\\]|$)') { throw "허용되지 않는 경로: $rel" }
  $files += [pscustomobject]@{ Path = $rel; Content = $content }
}

Write-Host '적용할 파일:'
$files | ForEach-Object { Write-Host (' - ' + $_.Path) }
$ok = Read-Host '적용할까요? (Enter=예, n=취소)'
if ($ok -eq 'n') { Write-Host '취소했어요'; exit 0 }

$enc = New-Object System.Text.UTF8Encoding($false)
foreach ($f in $files) {
  $full = Join-Path $PSScriptRoot $f.Path
  New-Item -ItemType Directory -Force -Path (Split-Path $full) | Out-Null
  [System.IO.File]::WriteAllText($full, $f.Content, $enc)
}
git pull --rebase --autostash
git add -A
git commit -m ('apply: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm'))
git push
Write-Host '완료! 봇이 inbox 메모를 읽고 정리할 거예요.'

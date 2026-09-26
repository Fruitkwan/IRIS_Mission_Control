param(
    [string]$Transcript = (Join-Path $PSScriptRoot 'VIDEO_TRANSCRIPT.md'),
    [string]$Output = (Join-Path $PSScriptRoot 'irisops-voiceover.wav')
)

$ErrorActionPreference = 'Stop'

$source = Get-Content -LiteralPath $Transcript -Raw
$matches = [regex]::Matches($source, '(?ms)^##\s+\d+:\d+–\d+:\d+\s+—[^\r\n]*\r?\n(.*?)(?=^##\s+\d+:\d+–|\z)')
if ($matches.Count -ne 9) { throw "Expected 9 narration scenes; found $($matches.Count)." }

$durations = @(20, 25, 25, 30, 40, 30, 30, 25, 15)
$waveFiles = @()
$tempVoiceDir = Join-Path ([System.IO.Path]::GetTempPath()) ('irisops-voice-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempVoiceDir | Out-Null
try {
    for ($i = 0; $i -lt $matches.Count; $i++) {
        $spoken = ($matches[$i].Groups[1].Value.Trim() -replace '\s+', ' ' -replace '[`*]', '')
        $words = Join-Path $tempVoiceDir ("voice-scene-{0:D2}.txt" -f ($i + 1))
        $wave = Join-Path $tempVoiceDir ("voice-scene-{0:D2}.wav" -f ($i + 1))
        [System.IO.File]::WriteAllText($words, $spoken, [System.Text.UTF8Encoding]::new($false))
        $filterPath = $words.Replace('\', '/').Replace(':', '\:')
        & ffmpeg -hide_banner -loglevel error -y -f lavfi -i "flite=textfile='$filterPath':voice=slt" -c:a pcm_s16le $wave
        if ($LASTEXITCODE -ne 0) { throw "FFmpeg narration scene $($i + 1) failed." }
        $waveFiles += $wave
    }

    $ffmpegArgs = @('-hide_banner', '-loglevel', 'error', '-y')
    foreach ($wave in $waveFiles) { $ffmpegArgs += @('-i', $wave) }
    $filters = @()
    for ($i = 0; $i -lt $waveFiles.Count; $i++) {
        $filters += "[$($i):a]apad,atrim=duration=$($durations[$i]),asetpts=PTS-STARTPTS[a$($i)]"
    }
    $filters += ((0..($waveFiles.Count - 1) | ForEach-Object { "[a$_]" }) -join '') + "concat=n=$($waveFiles.Count):v=0:a=1[out]"
    $ffmpegArgs += @('-filter_complex', ($filters -join ';'), '-map', '[out]', '-c:a', 'pcm_s16le', $Output)
    & ffmpeg @ffmpegArgs
    if ($LASTEXITCODE -ne 0) { throw "FFmpeg failed with exit code $LASTEXITCODE" }
} finally {
    Remove-Item -LiteralPath $tempVoiceDir -Recurse -Force
}
Write-Output $Output

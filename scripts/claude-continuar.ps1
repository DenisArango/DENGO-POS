# Retoma la sesión más reciente de Claude Code en este proyecto, sin pedir permisos.
# Lo ejecuta la tarea programada "DENGO - Claude continuar" (Programador de tareas de Windows).
# Log: scripts\logs\claude-continuar-<fecha>.log

$ErrorActionPreference = 'Continue'
$repo = 'C:\denis\DENGO-POS'
$logDir = Join-Path $repo 'scripts\logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ("claude-continuar-{0:yyyy-MM-dd_HHmm}.log" -f (Get-Date))

# Corre una sola vez: la tarea se repite cada 30 min por si a la hora indicada la sesión seguía activa.
$done = Join-Path $logDir ("hecho-{0:yyyy-MM-dd}.txt" -f (Get-Date))
if (Test-Path $done) { exit 0 }

# Si la sesión de Claude tuvo actividad hace menos de 15 min, otro agente sigue trabajando en ella:
# no retomarla en paralelo (se pisarían los archivos). Se reintenta en la próxima repetición.
$sessions = "$env:USERPROFILE\.claude\projects\c--denis-DENGO-POS"
$latest = Get-ChildItem $sessions -Filter '*.jsonl' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latest -and ((Get-Date) - $latest.LastWriteTime).TotalMinutes -lt 15) {
  "[$(Get-Date)] La sesión sigue activa ($($latest.LastWriteTime)); se reintenta luego" | Out-File $log -Encoding utf8
  exit 0
}
"[$(Get-Date)] iniciado" | Out-File $done -Encoding utf8

# La extensión de VS Code trae el ejecutable; su carpeta cambia con cada versión, así que se busca el más nuevo.
$exe = Get-ChildItem "$env:USERPROFILE\.vscode\extensions" -Filter 'claude.exe' -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -like '*native-binary*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) { "No se encontró claude.exe" | Out-File $log -Encoding utf8; exit 1 }

# Docker (base de demo) tiene que estar arriba para probar en vivo.
if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
  Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe' -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 60
}

$prompt = 'Continúa con la tarea pendiente desde donde te quedaste (facturación FEL con FELplex). Revisa el resumen de la sesión y la memoria del proyecto, levanta los servicios que necesites para probar y avanza hasta terminar o hasta el 99% de tus tokens. Recuerda: no hagas deploy ni commit.'

Set-Location $repo
"[$(Get-Date)] Inicio con $($exe.FullName)" | Out-File $log -Encoding utf8
& $exe.FullName --continue -p $prompt --dangerously-skip-permissions *>> $log
"[$(Get-Date)] Fin (código $LASTEXITCODE)" | Out-File $log -Append -Encoding utf8

# Install the ODD Live button controller on Diana from Windows PowerShell.
# Run once on the computer that can SSH to Diana. No Ubuntu commands are needed.
[CmdletBinding()]
param(
  [string]$DianaHost = "100.79.71.60",
  [string]$SshUser = "mixtu",
  [string]$SshKey = (Join-Path $env:USERPROFILE ".ssh\id_ed25519_odd_diana")
)

$ErrorActionPreference = "Stop"
$target = "$SshUser@$DianaHost"

if (-not (Test-Path -LiteralPath $SshKey)) {
  throw "SSH key not found: $SshKey"
}
if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
  throw "OpenSSH client (ssh.exe) is not available in PATH."
}

$bootstrap = @'
set -e
umask 077
mkdir -p "$HOME/.config/odd-live" "$HOME/odd-ai-humans/gpu-worker"
curl -fsSL https://raw.githubusercontent.com/SULT66/OneDealTheDay/main/gpu-worker/odd_live_chloe_worker.py -o "$HOME/odd-ai-humans/gpu-worker/odd_live_chloe_worker.py"
curl -fsSL https://raw.githubusercontent.com/SULT66/OneDealTheDay/main/gpu-worker/odd_live_program.py -o "$HOME/odd-ai-humans/gpu-worker/odd_live_program.py"
curl -fsSL https://raw.githubusercontent.com/SULT66/OneDealTheDay/main/gpu-worker/odd_live_supervisor.py -o "$HOME/odd-ai-humans/gpu-worker/odd_live_supervisor.py"
read -rsp "Enter ODD_LIVE_WORKER_KEY (input hidden): " ODD_LIVE_WORKER_KEY
printf "\n"
case "$ODD_LIVE_WORKER_KEY" in
  *[!A-Za-z0-9_-]*|"") echo "Invalid worker key format." >&2; exit 2 ;;
esac
printf "ODD_LIVE_API_BASE=%s\nODD_LIVE_WORKER_KEY=%s\n" "https://www.onedailydrop.com" "$ODD_LIVE_WORKER_KEY" > "$HOME/.config/odd-live/worker.env"
unset ODD_LIVE_WORKER_KEY
chmod 600 "$HOME/.config/odd-live/worker.env"
echo "ODD_LIVE_CONTROLLER_FILES_READY"
'@.Trim()

$bootstrapB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($bootstrap))
$remoteScript = @'
$ErrorActionPreference = 'Stop'
$bootstrapB64 = '__BOOTSTRAP_B64__'
$bashCommand = "printf '%s' '$bootstrapB64' | base64 -d > /tmp/odd-live-bootstrap.sh && chmod 700 /tmp/odd-live-bootstrap.sh && bash /tmp/odd-live-bootstrap.sh"
wsl.exe -d Ubuntu -u mixtu -- bash -lc "$bashCommand"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$taskArguments = '-d Ubuntu -u mixtu -- bash -lc "cd ~/odd-ai-humans && set -a && source ~/.config/odd-live/worker.env && set +a && conda run -n odd-ai-test python -u gpu-worker/odd_live_supervisor.py"'
$action = New-ScheduledTaskAction -Execute 'wsl.exe' -Argument $taskArguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'ODD Live Button Control' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'ODD Live Button Control'
Write-Output 'ODD Live button controller installed and started on Diana.'
'@
$remoteScript = $remoteScript.Replace('__BOOTSTRAP_B64__', $bootstrapB64)

$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($remoteScript))
Write-Host "Connecting to Diana. Enter the SSH key passphrase when prompted."
& ssh.exe -tt -i $SshKey $target "powershell.exe -NoProfile -EncodedCommand $encoded"
if ($LASTEXITCODE -ne 0) {
  throw "Setup failed on Diana (ssh exit code $LASTEXITCODE)."
}

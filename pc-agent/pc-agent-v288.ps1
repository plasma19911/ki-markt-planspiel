param([string]$Root='E:\KI-Markt-Agent')

$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$AgentVersion='1.2.0-v28.8'
$DefaultServer='https://ki-markt-planspiel.orkimperium.workers.dev'
$BerlinTimeZone='W. Europe Standard Time'
$Closed2026=@('2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-24','2026-12-25','2026-12-31')
$script:DownloadedBytes=0L
$script:UploadedBytes=0L
$script:LastCpu=[double](Get-Process -Id $PID).CPU
$script:LastCpuAt=[DateTime]::UtcNow
$script:LastCleanupAt=$null
$script:LastError=$null

$ConfigPath=Join-Path $Root 'config.json'
$TokenPath=Join-Path $Root 'agent-token.txt'
$DataRoot=Join-Path $Root 'data'
$CacheRoot=Join-Path $DataRoot 'cache'
$LogRoot=Join-Path $DataRoot 'logs'
New-Item -ItemType Directory -Force -Path $Root,$DataRoot,$CacheRoot,$LogRoot | Out-Null

$cfg=[ordered]@{serverUrl=$DefaultServer;maxStorageGb=2.0;trimToGb=1.6;keepDays=30;pcFirstShardCount=4}
if(Test-Path $ConfigPath){try{$loaded=Get-Content $ConfigPath -Raw|ConvertFrom-Json;foreach($n in @('serverUrl','maxStorageGb','trimToGb','keepDays','pcFirstShardCount')){if($null -ne $loaded.$n){$cfg[$n]=$loaded.$n}}}catch{}}
$ServerUrl=([string]$cfg.serverUrl).TrimEnd('/')
$MaxStorageBytes=[int64]([double]$cfg.maxStorageGb*1GB)
$TrimToBytes=[int64]([double]$cfg.trimToGb*1GB)
if($TrimToBytes -ge $MaxStorageBytes){$TrimToBytes=[int64]($MaxStorageBytes*.8)}

function Write-AgentLog([string]$Text){$line="$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Text";Add-Content -Path (Join-Path $LogRoot ("agent-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))) -Value $line -Encoding UTF8}
function Get-BerlinNow(){return [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,$BerlinTimeZone)}
function Get-Session([DateTime]$d){$ymd=$d.ToString('yyyy-MM-dd');$m=$d.Hour*60+$d.Minute;$weekday=$d.DayOfWeek;$trading=($weekday-ne 'Saturday' -and $weekday-ne 'Sunday' -and $Closed2026 -notcontains $ymd);$pre=$trading -and $m -ge 445 -and $m -lt 450;$open=$trading -and $m -ge 450 -and $m -lt 1380;[pscustomobject]@{trading=$trading;preopen=$pre;open=$open;phase=if($open){'OPEN'}elseif($pre){'PREOPEN'}elseif($trading){'CLOSED'}else{'NON_TRADING_DAY'};minute=$m;localDate=$ymd}}
function Get-DataBytes(){$sum=0L;Get-ChildItem $DataRoot -File -Recurse -ErrorAction SilentlyContinue|ForEach-Object{$sum+=$_.Length};return $sum}
function Invoke-LocalCleanup(){$cut=(Get-Date).AddDays(-[double]$cfg.keepDays);Get-ChildItem $DataRoot -File -Recurse -ErrorAction SilentlyContinue|Where-Object{$_.LastWriteTime-lt $cut}|Remove-Item -Force -ErrorAction SilentlyContinue;$size=Get-DataBytes;if($size -gt $MaxStorageBytes){foreach($f in @(Get-ChildItem $DataRoot -File -Recurse -ErrorAction SilentlyContinue|Sort-Object LastWriteTime)){if($size -le $TrimToBytes){break};$len=$f.Length;Remove-Item $f.FullName -Force -ErrorAction SilentlyContinue;if(-not(Test-Path $f.FullName)){$size-=$len}}};$script:LastCleanupAt=[DateTime]::UtcNow}
function Get-CpuPercent(){$p=Get-Process -Id $PID;$now=[DateTime]::UtcNow;$elapsed=($now-$script:LastCpuAt).TotalSeconds;$delta=[double]$p.CPU-$script:LastCpu;$cores=[Math]::Max(1,[Environment]::ProcessorCount);$pct=if($elapsed-gt 0){100*$delta/$elapsed/$cores}else{0};$script:LastCpu=[double]$p.CPU;$script:LastCpuAt=$now;return [Math]::Max(0,[Math]::Min(100,$pct))}
function Get-Metrics([string]$Phase){$p=Get-Process -Id $PID;return [ordered]@{version=$AgentVersion;hostName=$env:COMPUTERNAME;storagePath=$Root;storageBytes=(Get-DataBytes);maxStorageBytes=$MaxStorageBytes;cpuPct=[Math]::Round((Get-CpuPercent),2);ramMb=[Math]::Round($p.WorkingSet64/1MB,1);downloadedBytes=$script:DownloadedBytes;uploadedBytes=$script:UploadedBytes;localPhase=$Phase;agentMode='PC_FIRST_FULL_UNIVERSE_V288';lastLocalCleanupAt=if($script:LastCleanupAt){$script:LastCleanupAt.ToString('o')}else{$null};lastError=$script:LastError}}
function Invoke-TrackedGet([string]$Url){$r=Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 8 -Headers @{'User-Agent'='Mozilla/5.0 (Windows NT 10.0; Win64; x64) KI-Markt-Agent/1.2';'Accept'='application/json,text/html'};$text=[string]$r.Content;$script:DownloadedBytes+=[Text.Encoding]::UTF8.GetByteCount($text);return $text}
function Invoke-AgentPost([string]$Path,$Body){$token=(Get-Content $TokenPath -Raw).Trim();if(-not $token){throw 'agent-token.txt ist leer.'};$json=$Body|ConvertTo-Json -Depth 12 -Compress;$script:UploadedBytes+=[Text.Encoding]::UTF8.GetByteCount($json);return Invoke-RestMethod -Uri ($ServerUrl+$Path) -Method Post -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body $json -TimeoutSec 60}
function Save-PcPrefetch($obj){try{$obj|ConvertTo-Json -Depth 12|Set-Content (Join-Path $CacheRoot 'pc-first-latest.json') -Encoding UTF8}catch{}}

$module=Join-Path $Root 'pc-first-scanner.ps1'
if(-not(Test-Path $module)){throw "$module fehlt. PC-Agent V28.8 erneut installieren."}
. $module
if([int]$cfg.pcFirstShardCount -ge 2 -and [int]$cfg.pcFirstShardCount -le 12){$script:PcFirstShardCount=[int]$cfg.pcFirstShardCount}
if(-not(Test-Path $TokenPath)){Write-AgentLog 'agent-token.txt fehlt. Setup erneut ausführen.';exit 2}
Write-AgentLog "KI-Markt-Agent $AgentVersion gestartet · PC-FIRST Voll-Master · Zielzyklus $script:PcFirstShardCount Minuten."

while($true){
  try{$now=Get-BerlinNow;$session=Get-Session $now;if(-not $session.trading -or $session.minute -lt 440 -or $session.minute -ge 1385){Start-Sleep -Seconds 60;continue};$metrics=Get-Metrics $session.phase
    if($session.preopen){if($session.minute -eq 445){try{Update-PcFirstUniverse -Force|Out-Null}catch{}};Invoke-AgentPost '/api/agent/heartbeat' $metrics|Out-Null}
    elseif($session.open){$pc=$null;try{$pc=Invoke-PcFirstPipeline;$prefetch=[ordered]@{leaderUpdatedAt=[DateTime]::UtcNow.ToString('o');leaderEntries=$pc.leaderEntries;pcFirstScan=$pc.summary;metrics=$metrics};Invoke-AgentPost '/api/agent/prefetch' $prefetch|Out-Null;Save-PcPrefetch $prefetch;Write-AgentLog ("PC-FIRST: Master {0} · Vorscan {1} ({2}%) · Stage2 {3} · Deep {4} · Final {5} · Batchfehler {6}" -f $pc.summary.masterUniverseCount,$pc.summary.prescannedCount,$pc.summary.fullCycleCoveragePct,$pc.summary.stage2Count,$pc.summary.deepCount,$pc.summary.finalistCount,$pc.summary.batchErrors)}catch{Write-AgentLog "PC-FIRST Pipeline fehlgeschlagen, Cloudflare-Fallback bleibt aktiv: $($_.Exception.Message)"};$scanMetrics=Get-Metrics $session.phase;if($pc){$scanMetrics.pcFirstVersion=28.8;$scanMetrics.pcFirstUpdatedAt=$pc.summary.updatedAt;$scanMetrics.pcFirstCoveragePct=$pc.summary.fullCycleCoveragePct;$scanMetrics.pcFirstFinalists=$pc.summary.finalistCount};$r=Invoke-AgentPost '/api/agent/scan' $scanMetrics;Write-AgentLog "Finalscan: $($r.scanSource) · $($r.ok)"}
    if(-not $script:LastCleanupAt -or ([DateTime]::UtcNow-$script:LastCleanupAt).TotalMinutes -ge 30){Invoke-LocalCleanup};$script:LastError=$null
  }catch{$script:LastError=$_.Exception.Message;Write-AgentLog "FEHLER: $script:LastError";try{Invoke-AgentPost '/api/agent/heartbeat' (Get-Metrics 'ERROR')|Out-Null}catch{};try{Invoke-LocalCleanup}catch{}}
  $sec=60-(Get-Date).Second;if($sec-lt 5){$sec+=60};Start-Sleep -Seconds $sec
}

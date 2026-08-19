param(
  [string]$Root='E:\KI-Markt-Agent',
  [int]$NormalBatchesPerMinute=40,
  [int]$NormalParallelRequests=8,
  [int]$BatchSize=48
)

$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$RadarVersion='1.1.3'
$Source='WINDOWS_PC_FAST_RADAR'
$UniverseRefreshMinutes=20
$CoreTarget=1800
$NormalCoreBatches=8
$BackoffBatches=18
$BackoffParallel=4
$BackoffMinutes=3
$SendLimit=700
$LoopSecond=32

$dataDir=Join-Path $Root 'data'
$cacheDir=Join-Path $dataDir 'cache'
$logDir=Join-Path $dataDir 'logs'
$statePath=Join-Path $cacheDir 'fast-wide-radar-state.json'
$universePath=Join-Path $cacheDir 'fast-wide-radar-universe.json'
$logPath=Join-Path $logDir 'fast-wide-radar.log'
$configPath=Join-Path $Root 'config.json'
$tokenPath=Join-Path $Root 'agent-token.txt'
New-Item -ItemType Directory -Force -Path $dataDir,$cacheDir,$logDir | Out-Null

function Write-RadarLog([string]$Message){
  $line="[$((Get-Date).ToString('s'))] $Message"
  Add-Content -Path $logPath -Value $line -Encoding UTF8
  try{if((Get-Item $logPath).Length -gt 5MB){Get-Content $logPath -Tail 1800 | Set-Content $logPath -Encoding UTF8}}catch{}
}
function Read-JsonFile([string]$Path){if(-not (Test-Path $Path)){return $null};try{return Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json}catch{return $null}}
function Save-JsonFile([string]$Path,$Value){$tmp="$Path.tmp";$Value | ConvertTo-Json -Depth 12 -Compress | Set-Content $tmp -Encoding UTF8;Move-Item $tmp $Path -Force}
function Num($Value,[double]$Fallback=0){if($null -eq $Value){return $Fallback};try{$n=[double]$Value;if([double]::IsNaN($n) -or [double]::IsInfinity($n)){return $Fallback};return $n}catch{return $Fallback}}
function UrlEncode([string]$Text){return [Uri]::EscapeDataString($Text)}
function Get-ConfigValue($Config,[string]$Name,$Fallback){if($null -ne $Config -and $null -ne $Config.PSObject.Properties[$Name] -and $null -ne $Config.$Name){return $Config.$Name};return $Fallback}
# Das fuehrende Komma ist wichtig: PowerShell entpackt leere Collections sonst zu $null.
function New-ObjList{return ,(New-Object System.Collections.ArrayList)}

$config=Read-JsonFile $configPath
$serverUrl=([string](Get-ConfigValue $config 'serverUrl' 'https://ki-markt-planspiel.orkimperium.workers.dev')).TrimEnd('/')
if(-not (Test-Path $tokenPath)){throw "Agent-Token fehlt: $tokenPath"}
$token=(Get-Content $tokenPath -Raw -Encoding ASCII).Trim()
if(-not $token){throw 'Agent-Token ist leer.'}
$authHeaders=@{Authorization="Bearer $token";Accept='application/json';'User-Agent'="KI-Markt-Fast-Radar/$RadarVersion"}

Add-Type -AssemblyName System.Net.Http
$http=[System.Net.Http.HttpClient]::new()
$http.Timeout=[TimeSpan]::FromSeconds(18)
$http.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; KI-Markt-Fast-Radar/$RadarVersion)")
$http.DefaultRequestHeaders.Accept.ParseAdd('application/json')

function Invoke-AgentPost([string]$Path,$Body){$json=$Body | ConvertTo-Json -Depth 12 -Compress;return Invoke-RestMethod -Uri ($serverUrl+$Path) -Method Post -Headers $authHeaders -ContentType 'application/json; charset=utf-8' -Body $json -TimeoutSec 35}
function Send-StartupProbe([string]$ErrorText=''){
  $meta=[ordered]@{profile='FAST_RADAR_TURBO_V5';fastHelper=$true;masterCount=0;scannedCount=0;cycleMinutes=5;batchCount=0;coreCount=1800;coreCycleMinutes=5;tailCount=0;tailCycleMinutes=5;fullMasterCycleMinutes=5;maxCoverageMinutesTarget=6;tailBatchesPerMinute=28;hotEveryMinutes=1;warmEveryMinutes=1;quietCoreEveryMinutes=5;parallelRequests=$NormalParallelRequests;batchesPerMinute=$NormalBatchesPerMinute;targetRowsPerMinute=($NormalBatchesPerMinute*$BatchSize);adaptiveConcurrency=$true;sourceBackoff=$false;throttleCount=0;pausedUntil=$null;lastError=if($ErrorText){$ErrorText}else{$null};elapsedSeconds=0;radarVersion=$RadarVersion;startupProbe=$true}
  Invoke-AgentPost '/api/agent/prefetch' ([ordered]@{wideSweepOnly=$true;wideSweepEntries=@();wideSweepMeta=$meta}) | Out-Null
}
function Get-Universe([switch]$Force){
  $cached=Read-JsonFile $universePath;$ageMinutes=9999
  if($cached -and $cached.updatedAt){try{$ageMinutes=((Get-Date).ToUniversalTime()-[datetime]::Parse([string]$cached.updatedAt).ToUniversalTime()).TotalMinutes}catch{}}
  if(-not $Force -and $cached -and @($cached.equities).Count -gt 500 -and $ageMinutes -lt $UniverseRefreshMinutes){return $cached}
  $remote=Invoke-AgentPost '/api/agent/universe' @{}
  if(-not $remote.ok -or @($remote.equities).Count -lt 100){throw 'Broker-Master konnte nicht geladen werden.'}
  $snapshot=[ordered]@{updatedAt=(Get-Date).ToUniversalTime().ToString('o');generatedAt=$remote.generatedAt;count=@($remote.equities).Count;equities=@($remote.equities)}
  Save-JsonFile $universePath $snapshot;Write-RadarLog "Master aktualisiert: $($snapshot.count) Aktien.";return [pscustomobject]$snapshot
}
function Get-RotatingSlice($Rows,[int]$Start,[int]$Count){$a=@($Rows);if($a.Count -eq 0 -or $Count -le 0){return @()};$out=New-ObjList;for($i=0;$i -lt [Math]::Min($Count,$a.Count);$i++){$null=$out.Add($a[(($Start+$i)%$a.Count)])};return @($out.ToArray())}
function Add-UniqueRows($Target,$Seen,$Rows,[int]$Limit=999999){foreach($r in @($Rows)){if($Target.Count -ge $Limit){break};$s=([string]$r.symbol).ToUpperInvariant().Trim();if(-not $s -or $Seen.ContainsKey($s)){continue};$Seen[$s]=$true;$null=$Target.Add($r)}}
function Split-Batches($Rows,[int]$Size){$a=@($Rows);$out=New-ObjList;for($i=0;$i -lt $a.Count;$i+=$Size){$end=[Math]::Min($a.Count-1,$i+$Size-1);$null=$out.Add([pscustomobject]@{rows=@($a[$i..$end])})};return @($out.ToArray())}
function SparkUrl([string]$FinanceHost,$BatchRows){$symbols=(@($BatchRows) | ForEach-Object{[string]$_.symbol}) -join ',';return "https://$FinanceHost/v7/finance/spark?symbols=$(UrlEncode $symbols)&range=1d&interval=5m&indicators=close&includePrePost=false"}
function Read-SparkBatch($BatchRows,[string]$Text){
  $lookup=@{};foreach($r in @($BatchRows)){$lookup[([string]$r.symbol).ToUpperInvariant()]=$r}
  try{$j=$Text | ConvertFrom-Json}catch{return @()};$rows=New-ObjList
  foreach($item in @($j.spark.result)){
    $res=@($item.response)[0];if($null -eq $res){continue};$meta=$res.meta;$rawSymbol=if($item.symbol){[string]$item.symbol}else{[string]$meta.symbol};$symbol=$rawSymbol.ToUpperInvariant();if(-not $lookup.ContainsKey($symbol)){continue}
    $cl=New-ObjList;foreach($v in @($res.indicators.quote[0].close)){if($null -eq $v){continue};$n=Num $v -1;if($n -gt 0){$null=$cl.Add([double]$n)}};if($cl.Count -lt 5){continue}
    $last=[double]$cl[$cl.Count-1];$prev=Num $meta.previousClose ([double]$cl[0]);if($prev -le 0){$prev=[double]$cl[0]};$m5=($last/[double]$cl[$cl.Count-2]-1)*100;$m20=($last/[double]$cl[$cl.Count-5]-1)*100;$prev5=if($cl.Count -ge 3){([double]$cl[$cl.Count-2]/[double]$cl[$cl.Count-3]-1)*100}else{0};$accel=$m5-$prev5;$session=if($prev -gt 0){($last/$prev-1)*100}else{0};$marketTime=Num $meta.regularMarketTime 0
    if($marketTime -gt 0){$age=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()-[long]$marketTime;if($age -gt 2700){continue}}
    $wide=$session*.24+$m5*1.75+$m20*.78+$accel*1.65;$dip=($session -le -.35 -and $session -ge -10 -and $m20 -le .28 -and $m20 -ge -3.5 -and $m5 -le .18 -and $m5 -ge -.95 -and $accel -ge .008);$dipScore=0
    if($dip){$dipScore=[Math]::Max(0,3.8-[Math]::Abs([Math]::Abs($session)-2.4)*.48)+[Math]::Min(3.4,[Math]::Max(0,$accel)*14)+[Math]::Max(0,1.8-[Math]::Abs($m5)*1.55)}
    $null=$rows.Add([pscustomobject]@{symbol=$symbol;wideScore=[Math]::Round($wide,4);m5Pct=[Math]::Round($m5,4);m20Pct=[Math]::Round($m20,4);accelerationPct=[Math]::Round($accel,4);sessionPct=[Math]::Round($session,4);last=[Math]::Round($last,8);observedAt=(Get-Date).ToUniversalTime().ToString('o');source=$Source;dipDiscovery=$dip;dipRankScore=[Math]::Round($dipScore,4);shockScore=[Math]::Round([Math]::Abs($m5)*1.8+[Math]::Abs($accel)*1.6+[Math]::Abs($session)*.18,4)})
  };return @($rows.ToArray())
}
function Wait-HttpTasks($TaskRows){
  foreach($x in @($TaskRows)){
    try{if($null -ne $x.task){$null=$x.task.GetAwaiter().GetResult()}}catch{}
  }
}
function Invoke-SparkWave($Batches,[int]$Parallel){
  $allRows=New-ObjList;$fail=0;$throttle=0;$requests=0;$a=@($Batches)
  for($offset=0;$offset -lt $a.Count;$offset+=$Parallel){
    $end=[Math]::Min($a.Count-1,$offset+$Parallel-1);$wave=@($a[$offset..$end]);$tasks=New-ObjList
    foreach($b in $wave){$null=$tasks.Add([pscustomobject]@{batch=$b;task=$http.GetAsync((SparkUrl 'query1.finance.yahoo.com' $b.rows))})}
    Wait-HttpTasks @($tasks.ToArray());$retry=New-ObjList
    foreach($x in @($tasks.ToArray())){$requests++;try{if(-not $x.task.IsCompleted -or $x.task.IsFaulted){$null=$retry.Add($x);continue};$resp=$x.task.GetAwaiter().GetResult();if($resp.IsSuccessStatusCode){$txt=$resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();foreach($r in @(Read-SparkBatch $x.batch.rows $txt)){$null=$allRows.Add($r)}}else{if([int]$resp.StatusCode -in @(401,403,429)){$throttle++};$null=$retry.Add($x)}}catch{$null=$retry.Add($x)}}
    if($retry.Count){
      $rTasks=New-ObjList;foreach($x in @($retry.ToArray())){$null=$rTasks.Add([pscustomobject]@{batch=$x.batch;task=$http.GetAsync((SparkUrl 'query2.finance.yahoo.com' $x.batch.rows))})}
      Wait-HttpTasks @($rTasks.ToArray())
      foreach($x in @($rTasks.ToArray())){$requests++;try{if(-not $x.task.IsCompleted -or $x.task.IsFaulted){$fail++;continue};$resp=$x.task.GetAwaiter().GetResult();if($resp.IsSuccessStatusCode){$txt=$resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();foreach($r in @(Read-SparkBatch $x.batch.rows $txt)){$null=$allRows.Add($r)}}else{$fail++;if([int]$resp.StatusCode -in @(401,403,429)){$throttle++}}}catch{$fail++}}
    }
  };return [pscustomobject]@{rows=@($allRows.ToArray());failures=$fail;throttles=$throttle;requests=$requests}
}
function Select-UploadRows($Rows){$all=@($Rows);$picked=New-ObjList;$seen=@{};$dips=@($all | Where-Object{$_.dipDiscovery} | Sort-Object dipRankScore,accelerationPct,wideScore -Descending | Select-Object -First 400);Add-UniqueRows $picked $seen $dips $SendLimit;$shocks=@($all | Sort-Object shockScore -Descending | Select-Object -First 240);Add-UniqueRows $picked $seen $shocks $SendLimit;$momentum=@($all | Sort-Object wideScore,accelerationPct,m5Pct -Descending | Select-Object -First 400);Add-UniqueRows $picked $seen $momentum $SendLimit;return @($picked.ToArray() | Select-Object -First $SendLimit | ForEach-Object{[pscustomobject]@{symbol=$_.symbol;wideScore=$_.wideScore;m5Pct=$_.m5Pct;m20Pct=$_.m20Pct;accelerationPct=$_.accelerationPct;sessionPct=$_.sessionPct;last=$_.last;observedAt=$_.observedAt;source=$_.source}})}
function Load-State(){$s=Read-JsonFile $statePath;if(-not $s){$s=[pscustomobject]@{coreCursor=0;tailCursor=0;backoffUntilUtc=$null;hot=@();lastRunAt=$null;lastError=$null;throttleCount=0}};return $s}
function Save-State($State){Save-JsonFile $statePath $State}
function In-Backoff($State){if(-not $State.backoffUntilUtc){return $false};try{return [datetime]::Parse([string]$State.backoffUntilUtc).ToUniversalTime() -gt (Get-Date).ToUniversalTime()}catch{return $false}}
function Invoke-RadarMinute{
  $state=Load-State;$universe=Get-Universe;$rows=@($universe.equities | Where-Object{$_.symbol});if($rows.Count -lt 100){throw 'Zu wenige Master-Aktien.'};$sorted=@($rows | Sort-Object @{Expression={Num $_.marketCapUSD 0};Descending=$true});$core=@($sorted | Select-Object -First ([Math]::Min($CoreTarget,$sorted.Count)));$tail=if($sorted.Count -gt $core.Count){@($sorted[$core.Count..($sorted.Count-1)])}else{@()};$backoff=In-Backoff $state;$parallel=if($backoff){$BackoffParallel}else{$NormalParallelRequests};$budget=if($backoff){$BackoffBatches}else{$NormalBatchesPerMinute};$hotBudget=[Math]::Min(4,$budget);$coreBatches=if($backoff){[Math]::Min(5,[Math]::Max(2,[Math]::Floor($budget*.33)))}else{[Math]::Min($NormalCoreBatches,[Math]::Max(0,$budget-$hotBudget))};$tailBatches=[Math]::Max(0,$budget-$hotBudget-$coreBatches)
  $bySymbol=@{};foreach($r in $rows){$bySymbol[([string]$r.symbol).ToUpperInvariant()]=$r};$hotRows=New-ObjList;foreach($h in @($state.hot)){$s=([string]$h.symbol).ToUpperInvariant();if($bySymbol.ContainsKey($s)){$null=$hotRows.Add($bySymbol[$s])}};$selected=New-ObjList;$seen=@{};Add-UniqueRows $selected $seen @($hotRows.ToArray()) ($hotBudget*$BatchSize);$coreTake=$coreBatches*$BatchSize;$tailTake=$tailBatches*$BatchSize;Add-UniqueRows $selected $seen (Get-RotatingSlice $core ([int](Num $state.coreCursor 0)) $coreTake) 999999;Add-UniqueRows $selected $seen (Get-RotatingSlice $tail ([int](Num $state.tailCursor 0)) $tailTake) 999999;$state.coreCursor=if($core.Count){(([int](Num $state.coreCursor 0)+$coreTake)%$core.Count)}else{0};$state.tailCursor=if($tail.Count){(([int](Num $state.tailCursor 0)+$tailTake)%$tail.Count)}else{0}
  $batches=@(Split-Batches @($selected.ToArray()) $BatchSize | Select-Object -First $budget);$started=Get-Date;$scan=Invoke-SparkWave $batches $parallel;$elapsed=[Math]::Max(.1,((Get-Date)-$started).TotalSeconds);$scanRows=@($scan.rows);$state.hot=@($scanRows | Where-Object{$_.dipDiscovery -or [Math]::Abs($_.m5Pct) -ge .22 -or [Math]::Abs($_.accelerationPct) -ge .05 -or [Math]::Abs($_.sessionPct) -ge 1.1} | Sort-Object dipDiscovery,shockScore,wideScore -Descending | Select-Object -First 220 | ForEach-Object{[pscustomobject]@{symbol=$_.symbol;score=$_.wideScore}});$state.lastRunAt=(Get-Date).ToUniversalTime().ToString('o');$state.lastError=$null;$state.throttleCount=[int](Num $state.throttleCount 0)+[int]$scan.throttles;$failureRatio=if($batches.Count){$scan.failures/[double]$batches.Count}else{1};if($scan.throttles -gt 0 -or $failureRatio -gt .25){$state.backoffUntilUtc=(Get-Date).ToUniversalTime().AddMinutes($BackoffMinutes).ToString('o');$state.lastError="Yahoo-Drosselung/Fehler: $($scan.failures) Fehler, $($scan.throttles) Throttle"}elseif(-not $backoff){$state.backoffUntilUtc=$null};Save-State $state
  $upload=Select-UploadRows $scanRows;$corePerMinute=[Math]::Max(1,$coreBatches*$BatchSize);$tailPerMinute=[Math]::Max(1,$tailBatches*$BatchSize);$coreCycle=if($core.Count){[Math]::Ceiling($core.Count/$corePerMinute)}else{0};$tailCycle=if($tail.Count){[Math]::Ceiling($tail.Count/$tailPerMinute)}else{0};$fullCycle=[Math]::Max($coreCycle,$tailCycle);$meta=[ordered]@{profile='FAST_RADAR_TURBO_V5';fastHelper=$true;masterCount=$rows.Count;scannedCount=$scanRows.Count;cycleMinutes=$fullCycle;batchCount=$batches.Count;coreCount=$core.Count;coreCycleMinutes=$coreCycle;tailCount=$tail.Count;tailCycleMinutes=$tailCycle;fullMasterCycleMinutes=$fullCycle;maxCoverageMinutesTarget=6;tailBatchesPerMinute=$tailBatches;hotEveryMinutes=1;warmEveryMinutes=1;quietCoreEveryMinutes=$coreCycle;parallelRequests=$parallel;batchesPerMinute=$batches.Count;targetRowsPerMinute=($batches.Count*$BatchSize);adaptiveConcurrency=$true;sourceBackoff=[bool](In-Backoff $state);throttleCount=[int](Num $state.throttleCount 0);pausedUntil=$state.backoffUntilUtc;lastError=$state.lastError;elapsedSeconds=[Math]::Round($elapsed,2);radarVersion=$RadarVersion};Invoke-AgentPost '/api/agent/prefetch' ([ordered]@{wideSweepOnly=$true;wideSweepEntries=$upload;wideSweepMeta=$meta}) | Out-Null;Write-RadarLog "FAST $($scanRows.Count)/$($selected.Count) Aktien in $([Math]::Round($elapsed,1))s | Batches $($batches.Count), parallel $parallel | Upload $($upload.Count) | Zyklus Kern ${coreCycle}m / Rest ${tailCycle}m | Backoff $([bool](In-Backoff $state))"
}
function Seconds-To-NextRun{$now=Get-Date;$target=Get-Date -Hour $now.Hour -Minute $now.Minute -Second $LoopSecond;if($target -le $now){$target=$target.AddMinutes(1)};return [Math]::Max(1,[Math]::Ceiling(($target-$now).TotalSeconds))}

Write-RadarLog "Fast Wide Radar $RadarVersion gestartet. Ziel: $NormalBatchesPerMinute Batches/min, $NormalParallelRequests parallel, Batch $BatchSize."
try{Send-StartupProbe;Write-RadarLog 'STARTUP-PROBE erfolgreich an Worker gesendet.'}catch{Write-RadarLog "STARTUP-PROBE FEHLER: $($_.Exception.Message)"}
while($true){
  try{Invoke-RadarMinute}catch{$msg=$_.Exception.Message;$where=$_.InvocationInfo.PositionMessage;Write-RadarLog "FEHLER: $msg | $where";try{Send-StartupProbe ($msg+' | '+$where)}catch{};try{$s=Load-State;$s.lastError=$msg;$s.backoffUntilUtc=(Get-Date).ToUniversalTime().AddMinutes(2).ToString('o');Save-State $s}catch{};Start-Sleep -Seconds 8}
  Start-Sleep -Seconds (Seconds-To-NextRun)
}

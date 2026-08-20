param([string]$Root='E:\KI-Markt-Agent')

$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$AgentVersion='1.0.0'
$DefaultServer='https://ki-markt-planspiel.orkimperium.workers.dev'
$BerlinTimeZone='W. Europe Standard Time'
$Closed2026=@('2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-24','2026-12-25','2026-12-31')
$script:DownloadedBytes=0L
$script:UploadedBytes=0L
$script:LastCpu=[double](Get-Process -Id $PID).CPU
$script:LastCpuAt=[DateTime]::UtcNow
$script:LastCleanupAt=$null
$script:LastError=$null
$script:LastLeaderAt=[DateTime]::MinValue
$script:LastFutureAt=[DateTime]::MinValue
$script:LeaderEntries=@()
$script:FutureWatch=$null

$ConfigPath=Join-Path $Root 'config.json'
$TokenPath=Join-Path $Root 'agent-token.txt'
$DataRoot=Join-Path $Root 'data'
$CacheRoot=Join-Path $DataRoot 'cache'
$LogRoot=Join-Path $DataRoot 'logs'
New-Item -ItemType Directory -Force -Path $Root,$DataRoot,$CacheRoot,$LogRoot | Out-Null

$cfg=[ordered]@{serverUrl=$DefaultServer;maxStorageGb=2.0;trimToGb=1.6;keepDays=30;leaderMinutes=5;futureMinutes=10}
if(Test-Path $ConfigPath){
  try{ $loaded=Get-Content $ConfigPath -Raw | ConvertFrom-Json; foreach($n in @('serverUrl','maxStorageGb','trimToGb','keepDays','leaderMinutes','futureMinutes')){if($null-ne $loaded.$n){$cfg[$n]=$loaded.$n}} }catch{}
}
$ServerUrl=([string]$cfg.serverUrl).TrimEnd('/')
$MaxStorageBytes=[int64]([double]$cfg.maxStorageGb*1GB)
$TrimToBytes=[int64]([double]$cfg.trimToGb*1GB)
if($TrimToBytes -ge $MaxStorageBytes){$TrimToBytes=[int64]($MaxStorageBytes*0.8)}

function Write-AgentLog([string]$Text){
  $line="$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $Text"
  $file=Join-Path $LogRoot ("agent-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))
  Add-Content -Path $file -Value $line -Encoding UTF8
}
function Get-BerlinNow(){return [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow,$BerlinTimeZone)}
function Get-Session([DateTime]$d){
  $ymd=$d.ToString('yyyy-MM-dd');$m=$d.Hour*60+$d.Minute;$weekday=$d.DayOfWeek
  $trading=($weekday-ne 'Saturday' -and $weekday-ne 'Sunday' -and $Closed2026 -notcontains $ymd)
  $pre=$trading -and $m -ge 445 -and $m -lt 450;$open=$trading -and $m -ge 450 -and $m -lt 1380
  $phase=if($open){'OPEN'}elseif($pre){'PREOPEN'}elseif($trading){'CLOSED'}else{'NON_TRADING_DAY'}
  [pscustomobject]@{trading=$trading;preopen=$pre;open=$open;phase=$phase;minute=$m;localDate=$ymd}
}
function Get-DataBytes(){
  $sum=0L;Get-ChildItem $DataRoot -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {$sum+=$_.Length};return $sum
}
function Invoke-LocalCleanup(){
  $cut=(Get-Date).AddDays(-[double]$cfg.keepDays)
  Get-ChildItem $DataRoot -File -Recurse -ErrorAction SilentlyContinue | Where-Object {$_.LastWriteTime -lt $cut} | Remove-Item -Force -ErrorAction SilentlyContinue
  $size=Get-DataBytes
  if($size -gt $MaxStorageBytes){
    $files=Get-ChildItem $DataRoot -File -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime
    foreach($f in $files){if($size -le $TrimToBytes){break};$len=$f.Length;Remove-Item $f.FullName -Force -ErrorAction SilentlyContinue;if(-not(Test-Path $f.FullName)){$size-=$len}}
    Write-AgentLog "Speicherbereinigung: auf $([math]::Round($size/1GB,2)) GB reduziert."
  }
  $script:LastCleanupAt=[DateTime]::UtcNow
}
function Get-CpuPercent(){
  $p=Get-Process -Id $PID;$now=[DateTime]::UtcNow;$elapsed=($now-$script:LastCpuAt).TotalSeconds;$delta=[double]$p.CPU-$script:LastCpu;$cores=[Math]::Max(1,[Environment]::ProcessorCount)
  $pct=if($elapsed-gt 0){100*$delta/$elapsed/$cores}else{0};$script:LastCpu=[double]$p.CPU;$script:LastCpuAt=$now;return [math]::Max(0,[math]::Min(100,$pct))
}
function Get-Metrics([string]$Phase){
  $p=Get-Process -Id $PID
  [ordered]@{version=$AgentVersion;hostName=$env:COMPUTERNAME;storagePath=$Root;storageBytes=(Get-DataBytes);maxStorageBytes=$MaxStorageBytes;cpuPct=(Get-CpuPercent);ramMb=[math]::Round($p.WorkingSet64/1MB,1);downloadedBytes=$script:DownloadedBytes;uploadedBytes=$script:UploadedBytes;localPhase=$Phase;agentMode='WINDOWS_HYBRID';lastLocalCleanupAt=if($script:LastCleanupAt){$script:LastCleanupAt.ToString('o')}else{$null};lastError=$script:LastError}
}
function Invoke-TrackedGet([string]$Url){
  $r=Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10 -Headers @{'User-Agent'='Mozilla/5.0 (Windows NT 10.0; Win64; x64) KI-Markt-Agent/1.0';'Accept'='text/html,application/json'}
  $text=[string]$r.Content;$script:DownloadedBytes+=[Text.Encoding]::UTF8.GetByteCount($text);return $text
}
function Invoke-AgentPost([string]$Path,$Body){
  $token=(Get-Content $TokenPath -Raw).Trim();if(-not $token){throw 'agent-token.txt ist leer.'}
  $json=$Body | ConvertTo-Json -Depth 12 -Compress;$script:UploadedBytes+=[Text.Encoding]::UTF8.GetByteCount($json)
  return Invoke-RestMethod -Uri ($ServerUrl+$Path) -Method Post -ContentType 'application/json' -Headers @{Authorization="Bearer $token"} -Body $json -TimeoutSec 45
}
function Add-LeaderEntries([System.Collections.ArrayList]$Out,[string]$Html,[string]$Kind,[string]$Source){
  $rx=if($Kind-eq 'DE'){'/symbols/(?:XETR|FWB|TRADEGATE|GETTEX|SWB|BER|HAM|DUS|MUN)-([A-Z0-9.\-]+)'}else{'/quote/([^/?#"''<>]+)'}
  $rank=0;foreach($m in [regex]::Matches($Html,$rx,[Text.RegularExpressions.RegexOptions]::IgnoreCase)){$rank++;if($rank-gt 35){break};$sym=[uri]::UnescapeDataString($m.Groups[1].Value).ToUpper();if($sym -and $sym -notmatch '[=^]'){[void]$Out.Add([ordered]@{symbol=$sym;market=if($Kind-eq 'DE'){'DE'}else{'GLOBAL'};source=$Source;rank=$rank})}}
}
function Get-Leaders(){
  $out=[System.Collections.ArrayList]::new()
  $sources=@(
    @('https://www.tradingview.com/markets/stocks-germany/market-movers-active/','DE','TradingView DE Most Active'),
    @('https://www.tradingview.com/markets/stocks-germany/market-movers-unusual-volume/','DE','TradingView DE Unusual Volume'),
    @('https://finance.yahoo.com/research-hub/screener/most_actives/','GLOBAL','Yahoo Most Active'),
    @('https://finance.yahoo.com/research-hub/screener/trending/','GLOBAL','Yahoo Trending')
  )
  foreach($src in $sources){try{Add-LeaderEntries $out (Invoke-TrackedGet $src[0]) $src[1] $src[2]}catch{Write-AgentLog "Leaderquelle fehlgeschlagen: $($src[2]) · $($_.Exception.Message)"}}
  $seen=@{};$unique=@();foreach($x in $out){$k="$($x.market):$($x.symbol):$($x.source)";if(-not $seen.ContainsKey($k)){$seen[$k]=$true;$unique+=$x}}
  return $unique
}
function Get-WorldHeadlines(){
  $q='("data center" OR "power grid" OR transformer OR uranium OR nuclear OR "defense spending" OR rearmament OR cyberattack OR ransomware OR "energy supply")'
  $url='https://api.gdeltproject.org/api/v2/doc/doc?query='+[uri]::EscapeDataString($q)+'&mode=artlist&maxrecords=40&format=json&sort=hybridrel&timespan=24h'
  try{$j=(Invoke-TrackedGet $url)|ConvertFrom-Json;return @($j.articles|Select-Object -First 40|ForEach-Object{[ordered]@{title=[string]$_.title;source=[string]$_.domain;seenAt=[string]$_.seendate}})}catch{Write-AgentLog "GDELT fehlgeschlagen: $($_.Exception.Message)";return @()}
}
function Get-FutureQuotes($Symbols){
  $map=@{};if(-not $Symbols.Count){return $map};$url='https://query1.finance.yahoo.com/v7/finance/spark?symbols='+[uri]::EscapeDataString(($Symbols -join ','))+'&range=1d&interval=5m&indicators=close&includePrePost=false'
  try{$j=(Invoke-TrackedGet $url)|ConvertFrom-Json;foreach($item in @($j.spark.result)){$res=$item.response[0];if(-not $res){continue};$sym=([string]$item.symbol).ToUpper();$cl=@($res.indicators.quote[0].close|Where-Object{$_-ne $null}|ForEach-Object{[double]$_});if(-not $cl.Count){continue};$price=[double]$res.meta.regularMarketPrice;if($price-le 0){$price=$cl[-1]};$prev=[double]$res.meta.previousClose;if($prev-le 0){$prev=$cl[0]};$back=$cl[[Math]::Max(0,$cl.Count-5)];$map[$sym]=[ordered]@{price=$price;dayPct=if($prev){100*($price/$prev-1)}else{0};momentum20Pct=if($back){100*($price/$back-1)}else{0}}}}catch{Write-AgentLog "Future-Kurse fehlgeschlagen: $($_.Exception.Message)"};return $map
}
function Build-FutureWatch(){
  $themes=@(
    [ordered]@{id='AI_POWER_GRID';label='AI-Strom / Netzengpass';keywords=@('data center','data centre','power grid','electricity demand','transformer','grid bottleneck','power shortage','stromnetz','rechenzentrum','transformator');symbols=@('GEV','ETN','VRT','PWR','HUBB','CMI','CAT')},
    [ordered]@{id='NUCLEAR_URANIUM';label='Kernenergie / Uran-Versorgung';keywords=@('uranium','nuclear fuel','nuclear power','reactor','small modular reactor','smr','uran','kernenergie','reaktor');symbols=@('CCJ','NXE','DNN','UEC','LEU')},
    [ordered]@{id='DEFENSE_SECURITY';label='Verteidigung / Sicherheitsausgaben';keywords=@('defense spending','defence spending','military spending','rearmament','missile','air defense','air defence','munition','verteidigung','aufrüstung','aufruestung');symbols=@('RHM.DE','HAG.DE','LMT','RTX','NOC','GD','LHX','SAAB-B.ST')},
    [ordered]@{id='CYBER_SECURITY';label='Cybersecurity / kritische Infrastruktur';keywords=@('cyberattack','cyber attack','ransomware','data breach','critical infrastructure','zero-day','hacking','cybersecurity','cyberangriff','datenleck');symbols=@('PANW','CRWD','FTNT','CHKP','CYBR')},
    [ordered]@{id='ENERGY_SECURITY';label='Energieversorgung / geopolitischer Engpass';keywords=@('energy supply','oil supply','gas supply','pipeline','sanctions oil','sanctions gas','lng shortage','opec','energieversorgung','gasversorgung','ölversorgung');symbols=@('XOM','CVX','SHEL','BP','TTE','EQNR','SLB')}
  )
  $headlines=Get-WorldHeadlines;$wanted=@($themes|ForEach-Object{$_.symbols}|Select-Object -Unique);$quotes=Get-FutureQuotes $wanted;$active=@();$rows=@()
  foreach($t in $themes){$hits=@();$strength=25;foreach($h in $headlines){$txt=([string]$h.title).ToLower();$matched=@($t.keywords|Where-Object{$txt.Contains(([string]$_).ToLower())});if($matched.Count){$hits+=$h;$strength+=8+[Math]::Min(8,$matched.Count*2)}};$strength=[Math]::Min(100,$strength);if(-not $hits.Count){continue};$active+=[ordered]@{id=$t.id;label=$t.label;issueStrength=[math]::Round($strength);headlineCount=$hits.Count};foreach($sym in $t.symbols){if(-not $quotes.ContainsKey($sym)){continue};$q=$quotes[$sym];$quietDay=[Math]::Abs([double]$q.dayPct);$quiet20=[Math]::Abs([double]$q.momentum20Pct);$quiet=[Math]::Max(0,[Math]::Min(100,100-$quietDay*30-$quiet20*45));$moving=($quietDay-gt 2.2 -or $quiet20-gt 1.0);$score=$strength*.52+$quiet*.32+10;if($moving){$score-=18};$score=[Math]::Round([Math]::Max(0,[Math]::Min(100,$score)));if($score-lt 52){continue};$rows+=[ordered]@{symbol=$sym;name=$sym;theme=$t.label;themeId=$t.id;watchScore=$score;issueStrength=[Math]::Round($strength);quietScore=[Math]::Round($quiet);dayPct=[Math]::Round([double]$q.dayPct,2);momentum20Pct=[Math]::Round([double]$q.momentum20Pct,2);price=[double]$q.price;preNews=$true;alreadyMoving=$moving;reason=if($moving){'Thema relevant, Kurs reagiert aber bereits deutlich'}else{'Welt-/Strukturthema ist aktiv, während der Kurs bisher nur wenig reagiert'};headlines=@($hits|Select-Object -First 3)}}}
  $rows=@($rows|Sort-Object @{Expression='alreadyMoving';Ascending=$true},@{Expression='watchScore';Descending=$true}|Select-Object -First 10)
  return [ordered]@{version=2;updatedAt=[DateTime]::UtcNow.ToString('o');candidateCount=$rows.Count;activeThemes=$active;candidates=$rows;source='Windows-PC-Agent · GDELT + Yahoo-Sammelkurse'}
}
function Save-PrefetchSnapshot($obj){
  $file=Join-Path $CacheRoot ("prefetch-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'));$obj|ConvertTo-Json -Depth 12|Set-Content $file -Encoding UTF8
}

if(-not(Test-Path $TokenPath)){Write-AgentLog 'agent-token.txt fehlt. Setup erneut ausführen.';exit 2}
Write-AgentLog "KI-Markt-Agent $AgentVersion gestartet · Speicher $Root · Limit $($cfg.maxStorageGb) GB."

while($true){
  try{
    $now=Get-BerlinNow;$session=Get-Session $now
    if(-not $session.trading -or $session.minute -lt 440 -or $session.minute -ge 1385){Start-Sleep -Seconds 60;continue}
    $metrics=Get-Metrics $session.phase
    if($session.preopen -and $session.minute-eq 445){Invoke-AgentPost '/api/agent/scan' $metrics|Out-Null;Write-AgentLog '07:25 Vorbereitungs-Scan ausgelöst.'}
    elseif($session.preopen){Invoke-AgentPost '/api/agent/heartbeat' $metrics|Out-Null}
    elseif($session.open){$r=Invoke-AgentPost '/api/agent/scan' $metrics;Write-AgentLog "Scan: $($r.scanSource) · $($r.ok)"}
    if(([DateTime]::UtcNow-$script:LastLeaderAt).TotalMinutes -ge [double]$cfg.leaderMinutes){$script:LeaderEntries=Get-Leaders;$script:LastLeaderAt=[DateTime]::UtcNow}
    if(([DateTime]::UtcNow-$script:LastFutureAt).TotalMinutes -ge [double]$cfg.futureMinutes){$script:FutureWatch=Build-FutureWatch;$script:LastFutureAt=[DateTime]::UtcNow}
    if($script:LeaderEntries.Count -or $script:FutureWatch){
      $prefetch=[ordered]@{leaderUpdatedAt=$script:LastLeaderAt.ToString('o');leaderEntries=$script:LeaderEntries;futureWatch=$script:FutureWatch;metrics=$metrics};Invoke-AgentPost '/api/agent/prefetch' $prefetch|Out-Null;Save-PrefetchSnapshot $prefetch
    }
    if(-not $script:LastCleanupAt -or ([DateTime]::UtcNow-$script:LastCleanupAt).TotalMinutes-ge 30){Invoke-LocalCleanup}
    $script:LastError=$null
  }catch{
    $script:LastError=$_.Exception.Message;Write-AgentLog "FEHLER: $script:LastError";try{Invoke-LocalCleanup}catch{}
  }
  $sec=60-(Get-Date).Second;if($sec-lt 5){$sec+=60};Start-Sleep -Seconds $sec
}

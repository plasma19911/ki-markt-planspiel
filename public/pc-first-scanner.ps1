# V29.6 PC-first scanner.
# Behebt gegenueber 29.5:
#  1. Yahoo /v7/finance/spark akzeptiert seit einer API-Aenderung maximal 20
#     Symbole pro Anfrage. 29.5 hat 80 bzw. 60 gesendet und deshalb bei JEDEM
#     Batch HTTP 400 bekommen -> prescannedCount/deepCount/finalistCount = 0.
#  2. Batchfehler wurden stumm verschluckt (catch{$errors++}). Jetzt wird die
#     erste Fehlerursache pro Zyklus protokolliert.
#  3. Ein permanenter 400er wird nicht mehr ueber beide Hosts und zwei Versuche
#     wiederholt (das kostete pro Zyklus Sekunden ohne Nutzen).
#  4. Pacing zwischen den Batches + Backoff bei HTTP 429.
#  5. Der Shard rotiert nicht mehr weiter, wenn der komplette Shard gescheitert
#     ist; er wird im naechsten Durchlauf wiederholt.
#  6. Zusaetzliche Diagnosefelder im Summary (sparkBatchSize, scannedSymbolCount,
#     freshQuoteCount, shardCoveragePct, lastBatchError).
# Dot-source aus pc-agent.ps1. Die Breitenarbeit bleibt auf dem Windows-PC.
$script:PcFirstVersion='29.6'
$script:PcFirstUniverse=@()
$script:PcFirstRows=@{}
$script:PcFirstUniverseAt=[DateTime]::MinValue
$script:PcFirstShard=0
$script:PcFirstShardCount=4
$script:PcFirstLastFullSweepAt=$null
$script:PcFirstUniverseCache=Join-Path $CacheRoot 'pc-first-universe.json'
$script:PcFirstStateCache=Join-Path $CacheRoot 'pc-first-state.json'
# Hartes Limit der Yahoo-Spark-API. Nicht ohne Test erhoehen.
$script:PcFirstSparkBatchSize=20
$script:PcFirstBatchPauseMs=60
$script:PcFirstSparkBackoffUntil=[DateTime]::MinValue
$script:PcFirstLastBatchError=$null

function Limit-PcNumber([double]$v,[double]$lo,[double]$hi){return [Math]::Max($lo,[Math]::Min($hi,$v))}
# V29.6: Marktcode aus dem Yahoo-Suffix. buildWatch im Worker reserviert 13 von
# 24 Rebound-Plaetzen fuer market='DE'; mit dem bisherigen pauschalen 'GLOBAL'
# blieb dieses Kontingent leer.
$script:PcFirstMarketBySuffix=@{
  'DE'='DE';'F'='DE';'BE'='DE';'DU'='DE';'HM'='DE';'HA'='DE';'MU'='DE';'SG'='DE'
  'PA'='FR';'MI'='IT';'AS'='NL';'BR'='BE';'MC'='ES';'LS'='PT';'VI'='AT'
  'SW'='CH';'L'='GB';'IL'='GB';'ST'='SE';'OL'='NO';'CO'='DK';'HE'='FI';'IC'='IS'
  'T'='JP';'HK'='HK';'SS'='CN';'SZ'='CN';'KS'='KR';'KQ'='KR';'TW'='TW';'SI'='SG'
  'AX'='AU';'NZ'='NZ';'TO'='CA';'V'='CA';'SA'='BR';'MX'='MX';'NS'='IN';'BO'='IN'
}
function Get-PcFirstMarket([string]$Symbol){
  $s=[string]$Symbol;$i=$s.LastIndexOf('.')
  if($i -lt 0){return 'US'}
  $suf=$s.Substring($i+1).ToUpper()
  if($script:PcFirstMarketBySuffix.ContainsKey($suf)){return $script:PcFirstMarketBySuffix[$suf]}
  return 'GLOBAL'
}
function New-PcFirstEntries($Rows,[string]$SourceName,[int]$Take){
  $out=@();$rank=0
  foreach($r in @($Rows|Select-Object -First $Take)){$rank++;$out+=[ordered]@{symbol=[string]$r.symbol;market=(Get-PcFirstMarket $r.symbol);source=$SourceName;rank=$rank}}
  return $out
}
function Save-PcFirstUniverse($Rows){try{[ordered]@{savedAt=[DateTime]::UtcNow.ToString('o');equities=$Rows}|ConvertTo-Json -Depth 5|Set-Content $script:PcFirstUniverseCache -Encoding UTF8}catch{}}
function Load-PcFirstUniverseCache(){if(-not(Test-Path $script:PcFirstUniverseCache)){return @()};try{$j=Get-Content $script:PcFirstUniverseCache -Raw|ConvertFrom-Json;return @($j.equities)}catch{return @()}}
function Update-PcFirstUniverse([switch]$Force){
  if(-not $Force -and $script:PcFirstUniverse.Count -gt 100 -and ([DateTime]::UtcNow-$script:PcFirstUniverseAt).TotalHours -lt 6){return $script:PcFirstUniverse}
  try{$u=Invoke-AgentPost '/api/agent/universe' ([ordered]@{scannerVersion=$script:PcFirstVersion;request='FULL_EQUITY_MASTER'});$rows=@($u.equities|Where-Object{$_.symbol});if($rows.Count -gt 100){$script:PcFirstUniverse=$rows;$script:PcFirstUniverseAt=[DateTime]::UtcNow;Save-PcFirstUniverse $rows;Write-AgentLog "PC-FIRST: Aktien-Master geladen: $($rows.Count) Werte.";return $rows}}catch{Write-AgentLog "PC-FIRST: Master-Abruf fehlgeschlagen: $($_.Exception.Message)"}
  $cached=Load-PcFirstUniverseCache;if($cached.Count){$script:PcFirstUniverse=$cached;$script:PcFirstUniverseAt=[DateTime]::UtcNow;Write-AgentLog "PC-FIRST: lokaler Aktien-Master verwendet: $($cached.Count) Werte."};return $script:PcFirstUniverse
}
function Convert-PcFirstSpark($Json,[string]$Interval){
  $out=@();foreach($item in @($Json.spark.result)){try{$res=$item.response[0];if(-not $res){continue};$sym=([string]$item.symbol).ToUpper();if(-not $sym){continue};$rawClose=@($res.indicators.quote[0].close);$rawTime=@($res.timestamp);$cl=@();$barTimes=@();for($i=0;$i-lt [Math]::Min($rawClose.Count,$rawTime.Count);$i++){if($null-eq $rawClose[$i]){continue};$p=[double]$rawClose[$i];$t=[int64]$rawTime[$i];if($p-gt 0 -and $t-gt 0){$cl+=$p;$barTimes+=$t}};if($cl.Count-lt 2){continue};$price=[double]$cl[-1];$marketTime=[int64]$barTimes[-1];$prev=[double]$res.meta.previousClose;if($prev-le 0){$prev=[double]$res.meta.chartPreviousClose};if($prev-le 0){$prev=$cl[0]};$day=if($prev-gt 0){100*($price/$prev-1)}else{0};$step20=if($Interval-eq '1m'){20}else{4};$step5=if($Interval-eq '1m'){5}else{1};$b20=$cl[[Math]::Max(0,$cl.Count-1-$step20)];$b5=$cl[[Math]::Max(0,$cl.Count-1-$step5)];$m20=if($b20-gt 0){100*($price/$b20-1)}else{0};$m5=if($b5-gt 0){100*($price/$b5-1)}else{0};$older=$cl[[Math]::Max(0,$cl.Count-1-2*$step5)];$prior5=if($older-gt 0 -and $b5-gt 0){100*($b5/$older-1)}else{0};$acc=$m5-$prior5;$ageMin=[Math]::Max(0,([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()-$marketTime)/60);$out+=[pscustomobject]@{symbol=$sym;price=$price;dayPct=$day;momentum20Pct=$m20;momentum5Pct=$m5;acceleration5Pct=$acc;marketTimestamp=$marketTime;quoteAgeMinutes=$ageMin}}catch{}};return $out
}
function Invoke-PcFirstSpark($Symbols,[string]$Interval='5m'){
  $symbols=@($Symbols|Where-Object{$_}|Select-Object -Unique);if(-not $symbols.Count){return @()}
  if($symbols.Count -gt $script:PcFirstSparkBatchSize){throw "Spark-Batch zu gross: $($symbols.Count) Symbole, erlaubt sind $($script:PcFirstSparkBatchSize)."}
  if([DateTime]::UtcNow -lt $script:PcFirstSparkBackoffUntil){throw 'Spark pausiert (Rate-Limit-Backoff aktiv).'}
  $query=[uri]::EscapeDataString(($symbols -join ','))
  $suffix='/v7/finance/spark?symbols='+$query+'&range=1d&interval='+$Interval+'&indicators=close&includePrePost=true'
  $lastError=$null
  foreach($apiHost in @('https://query1.finance.yahoo.com','https://query2.finance.yahoo.com')){
    for($attempt=1;$attempt -le 2;$attempt++){
      try{$j=(Invoke-TrackedGet ($apiHost+$suffix))|ConvertFrom-Json;$rows=@(Convert-PcFirstSpark $j $Interval);if($rows.Count){return $rows};$lastError="leere Antwort von $apiHost"}
      catch{
        $lastError=$_.Exception.Message
        $code=0;try{$code=[int]$_.Exception.Response.StatusCode}catch{}
        # 400 = dauerhafter Anfragefehler (z. B. zu viele Symbole). Nicht wiederholen.
        if($code -eq 400){throw "Spark HTTP 400 fuer $($symbols.Count) Symbole: $lastError"}
        if($code -eq 429){$script:PcFirstSparkBackoffUntil=[DateTime]::UtcNow.AddSeconds(45);throw "Spark rate-limited (429), Backoff 45s."}
      }
      Start-Sleep -Milliseconds (250*$attempt)
    }
  }
  throw "Spark fehlgeschlagen fuer $($symbols.Count) Symbole: $lastError"
}
function Get-PcFirstPreScore($q){$day=[double]$q.dayPct;$m20=[double]$q.momentum20Pct;$m5=[double]$q.momentum5Pct;$acc=[double]$q.acceleration5Pct;$s=50;$s+=Limit-PcNumber ($day*1.15) -12 11;$s+=Limit-PcNumber ($m20*5.5) -11 13;$s+=Limit-PcNumber ($m5*8.0) -8 10;$s+=Limit-PcNumber ($acc*2.5) -5 5;if($day-ge 12){$s-=12+[Math]::Min(10,($day-12)*.7)}elseif($day-ge 8){$s-=5};if($day-le -8){$s-=7};if($null -eq $q.quoteAgeMinutes -or [double]$q.quoteAgeMinutes-gt 8){$s-=10};return [Math]::Round((Limit-PcNumber $s 0 100),1)}
function Get-PcFirstDeepScore($q,[double]$PreScore){$s=$PreScore*.50+25;$s+=Limit-PcNumber ([double]$q.momentum20Pct*5.0) -10 12;$s+=Limit-PcNumber ([double]$q.momentum5Pct*7.0) -7 9;$s+=Limit-PcNumber ([double]$q.acceleration5Pct*2.2) -4 5;$day=[double]$q.dayPct;if($day-ge 12){$s-=14+[Math]::Min(12,($day-12)*.8)}elseif($day-ge 8){$s-=6};if($null -eq $q.quoteAgeMinutes -or [double]$q.quoteAgeMinutes-gt 8){$s-=12};return [Math]::Round((Limit-PcNumber $s 0 100),1)}
function Split-PcFirstChunks($Rows,[int]$Size){$all=@($Rows);for($i=0;$i-lt $all.Count;$i+=$Size){,$all[$i..([Math]::Min($all.Count-1,$i+$Size-1))]}}
function Invoke-PcFirstPipeline(){
  $universe=@(Update-PcFirstUniverse);if($universe.Count-lt 100){throw 'PC-FIRST: Kein Aktien-Master verfuegbar.'}
  $shardIndex=$script:PcFirstShard;$symbols=@();for($i=0;$i-lt $universe.Count;$i++){if(($i%$script:PcFirstShardCount)-eq $shardIndex){$symbols+=[string]$universe[$i].symbol}}
  $requests=0;$errors=0;$now=[DateTime]::UtcNow;$script:PcFirstLastBatchError=$null;$batchSize=$script:PcFirstSparkBatchSize
  foreach($chunk in @(Split-PcFirstChunks $symbols $batchSize)){
    try{$requests++;foreach($q in @(Invoke-PcFirstSpark $chunk '5m')){$pre=Get-PcFirstPreScore $q;$script:PcFirstRows[$q.symbol]=[ordered]@{symbol=$q.symbol;price=[double]$q.price;dayPct=[double]$q.dayPct;momentum20Pct=[double]$q.momentum20Pct;momentum5Pct=[double]$q.momentum5Pct;acceleration5Pct=[double]$q.acceleration5Pct;marketTimestamp=[int64]$q.marketTimestamp;preScore=$pre;updatedAt=$now.ToString('o')}}}
    catch{$errors++;if(-not $script:PcFirstLastBatchError){$script:PcFirstLastBatchError=$_.Exception.Message}}
    if($script:PcFirstBatchPauseMs-gt 0){Start-Sleep -Milliseconds $script:PcFirstBatchPauseMs}
  }
  # Nur weiterrotieren, wenn der Shard wenigstens teilweise geliefert hat.
  # Sonst wiederholt der naechste Zyklus denselben Ausschnitt.
  if($requests-eq 0 -or $errors-lt $requests){$script:PcFirstShard=($script:PcFirstShard+1)%$script:PcFirstShardCount}
  if($script:PcFirstShard-eq 0 -and $errors-lt $requests){$script:PcFirstLastFullSweepAt=$now}
  $nowUnix=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds();$rows=@($script:PcFirstRows.Values|Where-Object{try{$age=($nowUnix-[int64]$_.marketTimestamp)/60;[int64]$_.marketTimestamp-gt 0 -and $age-ge 0 -and $age-le 8}catch{$false}})
  $stage2=@($rows|Sort-Object @{Expression={[double]$_.preScore};Descending=$true}|Select-Object -First 400);$deepSymbols=@($stage2|Select-Object -First 240|ForEach-Object{$_.symbol});$deepMap=@{}
  foreach($chunk in @(Split-PcFirstChunks $deepSymbols $batchSize)){
    try{$requests++;foreach($q in @(Invoke-PcFirstSpark $chunk '1m')){$pre=if($script:PcFirstRows.ContainsKey($q.symbol)){[double]$script:PcFirstRows[$q.symbol].preScore}else{Get-PcFirstPreScore $q};$deep=Get-PcFirstDeepScore $q $pre;$deepMap[$q.symbol]=[ordered]@{symbol=$q.symbol;price=[double]$q.price;dayPct=[double]$q.dayPct;momentum20Pct=[double]$q.momentum20Pct;momentum5Pct=[double]$q.momentum5Pct;acceleration5Pct=[double]$q.acceleration5Pct;marketTimestamp=[int64]$q.marketTimestamp;preScore=$pre;deepScore=$deep}}}
    catch{$errors++;if(-not $script:PcFirstLastBatchError){$script:PcFirstLastBatchError=$_.Exception.Message}}
    if($script:PcFirstBatchPauseMs-gt 0){Start-Sleep -Milliseconds $script:PcFirstBatchPauseMs}
  }
  if($script:PcFirstLastBatchError){Write-AgentLog "PC-FIRST: $errors von $requests Batches fehlgeschlagen. Erste Ursache: $($script:PcFirstLastBatchError)"}
  $final=@($stage2|ForEach-Object{$d=if($deepMap.ContainsKey($_.symbol)){$deepMap[$_.symbol]}else{[ordered]@{symbol=$_.symbol;price=$_.price;dayPct=$_.dayPct;momentum20Pct=$_.momentum20Pct;momentum5Pct=$_.momentum5Pct;acceleration5Pct=$_.acceleration5Pct;marketTimestamp=$_.marketTimestamp;preScore=$_.preScore;deepScore=$_.preScore}};[pscustomobject]$d}|Sort-Object @{Expression={[double]$_.deepScore};Descending=$true}|Select-Object -First 60);$leaders=@();$candidates=@();$rank=0
  foreach($x in $final){$age=if([int64]$x.marketTimestamp-gt 0){[Math]::Max(0,($nowUnix-[int64]$x.marketTimestamp)/60)}else{$null};$stale=($null-eq $age -or [double]$age-gt 8);if($stale){continue};$rank++;$confidence=Limit-PcNumber (.48+([double]$x.deepScore-50)/100) .35 .90;$leaders+=[ordered]@{symbol=$x.symbol;market=(Get-PcFirstMarket $x.symbol);source="PC-FIRST-V$($script:PcFirstVersion) Leader";rank=$rank};$candidates+=[ordered]@{symbol=$x.symbol;rank=$rank;pcPreScore=[double]$x.preScore;pcDeepScore=[double]$x.deepScore;price=[double]$x.price;dayPct=[double]$x.dayPct;momentum20Pct=[double]$x.momentum20Pct;momentum5Pct=[double]$x.momentum5Pct;acceleration5Pct=[double]$x.acceleration5Pct;confidence=[Math]::Round($confidence,3);marketTimestamp=[int64]$x.marketTimestamp;quoteAgeMinutes=[Math]::Round([double]$age,2);stale=$false}}
  # Rebound: klare Tagesverlierer, bei denen der Abverkauf bremst
  # (acceleration5Pct > 0 = die letzten fuenf Minuten fallen schwaecher als die
  # fuenf davor). Kein Kaufsignal, nur Beobachtungsliste - der Worker verlangt
  # ohnehin eine eigene Bestaetigung.
  $reboundRows=@($rows|Where-Object{[double]$_.dayPct -le -1.5}|Sort-Object @{Expression={[double]$_.acceleration5Pct};Descending=$true},@{Expression={[double]$_.dayPct};Descending=$false})
  $reboundEntries=@(New-PcFirstEntries $reboundRows "PC-FIRST-V$($script:PcFirstVersion) Rebound" 40)
  # Breakout: fruehe Tagesstaerke mit frischer Beschleunigung, aber ohne
  # Ueberhitzung. Ueber +8% wird bewusst nicht mehr eingesammelt (Anti-Chase).
  $breakoutRows=@($rows|Where-Object{[double]$_.dayPct -ge .5 -and [double]$_.dayPct -le 8 -and [double]$_.momentum5Pct -gt 0 -and [double]$_.acceleration5Pct -gt 0}|Sort-Object @{Expression={[double]$_.acceleration5Pct+[double]$_.momentum5Pct};Descending=$true})
  $breakoutEntries=@(New-PcFirstEntries $breakoutRows "PC-FIRST-V$($script:PcFirstVersion) Breakout" 40)
  $coverage=if($universe.Count){100*$rows.Count/$universe.Count}else{0}
  $shardCoverage=if($symbols.Count -and $requests){100*[Math]::Max(0,($requests-$errors))/[Math]::Max(1,[Math]::Ceiling($symbols.Count/$batchSize))}else{0}
  $summary=[ordered]@{version=[double]$script:PcFirstVersion;updatedAt=$now.ToString('o');masterUniverseCount=$universe.Count;prescannedCount=$rows.Count;validQuoteCount=$rows.Count;preScoredCount=$rows.Count;allReceivedRowsPreScored=$true;stage2Count=$stage2.Count;deepCount=$deepMap.Count;finalistCount=$candidates.Count;shardIndex=$shardIndex;shardCount=$script:PcFirstShardCount;scannedSymbolCount=$symbols.Count;freshQuoteCount=$rows.Count;sparkBatchSize=$batchSize;shardCoveragePct=[Math]::Round([Math]::Min(100,$shardCoverage),1);fullCycleCoveragePct=[Math]::Round([Math]::Min(100,$coverage),1);targetFullCycleMinutes=$script:PcFirstShardCount;lastFullSweepAt=if($script:PcFirstLastFullSweepAt){$script:PcFirstLastFullSweepAt.ToString('o')}else{$null};lastMinuteRefreshAt=$now.ToString('o');batchRequests=$requests;batchErrors=$errors;lastBatchError=$script:PcFirstLastBatchError;reboundEntryCount=$($reboundEntries.Count);breakoutEntryCount=$($breakoutEntries.Count);discoveryMode='PC_FIRST_DERIVED';scorePipeline='ALIGNED_PRICE_TIME_8M -> TOP400 -> DEEP240 -> FINAL60';source="Windows-PC · Yahoo Spark Batch (max $batchSize) · Full-Master rolling · Kurs und Zeit gleiche Kerze · <=8m";candidates=$candidates}
  try{$summary|ConvertTo-Json -Depth 8|Set-Content $script:PcFirstStateCache -Encoding UTF8}catch{}
  return [ordered]@{summary=$summary;leaderEntries=$leaders;reboundEntries=$reboundEntries;breakoutEntries=$breakoutEntries}
}

using System;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Threading;
using System.Web.Script.Serialization;

class Program
{
    const string ServerUrl = "https://ki-markt-planspiel.orkimperium.workers.dev";
    const long MaxStorageBytes = 2147483648L;      // 2.0 GB
    const long TrimToBytes = 1717986918L;         // ~1.6 GB
    const int KeepDays = 30;
    const int LeaderMinutes = 2;
    const int FutureMinutes = 5;
    const int MasterRefreshMinutes = 60;
    // SINGLE SUPER SCANNER 2.1:
    // Das komplette Broker-Master wird in einem Durchlauf abgefragt. 100 Symbole
    // pro Spark-Request halten die URL klein, reduzieren aber die Request-Anzahl
    // von ~171 auf ~86. Bis zu 16 Requests laufen parallel.
    const int WideBatchSize = 100;
    const int WidePriorityBatches = 1;
    const int WideCoreBatches = 18;
    const int WideTailBatches = 68;
    const int WideTargetMaxMasterCycleMinutes = 1;
    const int WideMaxTailBatches = 70;
    const int WideParallelRequests = 16;
    const int WideBackoffParallelRequests = 6;
    const int WideHardBackoffSeconds = 45;
    const int WideAdaptiveBackoffMinutes = 2;
    const int WideCoreTarget = 1800;
    const int WideOutputLimit = 160;
    const int WideStateKeepMinutes = 10;
    const int EveningReplayStartMinute = 21 * 60 + 55;
    const int EveningReplayEndMinute = 22 * 60 + 45;
    const int EveningReplayBatchSize = 10;
    const int EveningReplayEveryMinutes = 3;
    const int LocalReplayBatchSize = 8;
    const int LocalReplayMaxSymbols = 60;
    const int StatusCacheEveryMinutes = 10;
    static readonly string[] Closed2026 = new string[] {
        "2026-01-01","2026-04-03","2026-04-06","2026-05-01","2026-12-24","2026-12-25","2026-12-31"
    };

    static string Root;
    static string DataRoot;
    static string CacheRoot;
    static string LogRoot;
    static string TokenPath;
    static long DownloadedBytes = 0;
    static long UploadedBytes = 0;
    static DateTime LastLeaderAt = DateTime.MinValue;
    static DateTime LastFutureAt = DateTime.MinValue;
    static DateTime LastCleanupAt = DateTime.MinValue;
    static List<Dictionary<string, object>> LeaderEntries = new List<Dictionary<string, object>>();
    static List<Dictionary<string, object>> ReboundEntries = new List<Dictionary<string, object>>();
    static List<Dictionary<string, object>> BreakoutEntries = new List<Dictionary<string, object>>();
    static Dictionary<string, object> FutureWatch = null;
    static string LastError = null;
    static DateTime LastCpuSampleUtc = DateTime.MinValue;
    static TimeSpan LastCpuTime = TimeSpan.Zero;
    static double LastCpuPct = 0;
    static Dictionary<string, DateTime> SourceRetryAfterUtc = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);
    static DateTime LastMasterRefreshUtc = DateTime.MinValue;
    static DateTime SparkRetryAfterUtc = DateTime.MinValue;
    static string SparkLastFailure = null;
    static int WideCoreCursor = 0;
    static int WideTailCursor = 0;
    static int WideLastScanned = 0;
    static int WideLastFreshQuotes = 0;
    static int WideLastBatches = 0;
    static int WideLastFailures = 0;
    static int WideLastThrottles = 0;
    static int WideLastParallel = WideParallelRequests;
    static double WideLastElapsedSeconds = 0;
    static DateTime WideAdaptiveBackoffUntilUtc = DateTime.MinValue;
    static readonly object WideSignalLock = new object();
    static readonly object SparkStateLock = new object();
    static List<MasterEquity> MasterEquities = new List<MasterEquity>();
    static Dictionary<string, MasterEquity> MasterExact = new Dictionary<string, MasterEquity>(StringComparer.OrdinalIgnoreCase);
    static Dictionary<string, List<MasterEquity>> MasterByBase = new Dictionary<string, List<MasterEquity>>(StringComparer.OrdinalIgnoreCase);
    static Dictionary<string, WideSignal> WideSignals = new Dictionary<string, WideSignal>(StringComparer.OrdinalIgnoreCase);
    static DateTime LastReplayAtUtc = DateTime.MinValue;
    static DateTime LastReplayDownloadUtc = DateTime.MinValue;
    static string LastReplayStatus = "NO_REPORT";
    static int LastReplayProcessed = 0;
    static int LastReplayTotal = 0;
    static DateTime LastStatusCacheUtc = DateTime.MinValue;
    static DateTime LastReplayObservedSaveUtc = DateTime.MinValue;
    static string CachedStatusRaw = null;
    static Dictionary<string, ReplayObserved> ReplayObservedMap = new Dictionary<string, ReplayObserved>(StringComparer.OrdinalIgnoreCase);
    static List<string> LocalReplayQueue = new List<string>();
    static List<Dictionary<string, object>> LocalReplayResults = new List<Dictionary<string, object>>();
    static int LocalReplayCursor = 0;
    static string LocalReplayDate = null;
    static DateTime LocalReplayCreatedUtc = DateTime.MinValue;
    static JavaScriptSerializer Json = new JavaScriptSerializer();

    static void Main()
    {
        Root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        DataRoot = Path.Combine(Root, "data");
        CacheRoot = Path.Combine(DataRoot, "cache");
        LogRoot = Path.Combine(DataRoot, "logs");
        TokenPath = Path.Combine(Root, "agent-token.txt");

        Directory.CreateDirectory(DataRoot);
        Directory.CreateDirectory(CacheRoot);
        Directory.CreateDirectory(LogRoot);
        EnsureToken();
        Json.MaxJsonLength = int.MaxValue;
        Json.RecursionLimit = 200;
        LoadReplayObserved();
        LoadCachedServerStatus();

        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        ServicePointManager.Expect100Continue = false;
        ServicePointManager.DefaultConnectionLimit = 64;
        ServicePointManager.UseNagleAlgorithm = false;
        int minWorker, minIo;
        ThreadPool.GetMinThreads(out minWorker, out minIo);
        ThreadPool.SetMinThreads(Math.Max(minWorker, 24), Math.Max(minIo, 24));
        Console.Title = "KI-Markt-Agent · EIN-SCANNER SUPER";
        Console.WriteLine("KI-Markt-Agent gestartet");
        Console.WriteLine("Ordner: " + Root);
        Console.WriteLine("Speicherlimit: 2,0 GB -> Bereinigung auf ca. 1,6 GB");
        Console.WriteLine("Dieses Fenster offen lassen.");
        Console.WriteLine("Keyless Multi-Source: TradingView-Webseiten + offizielle RSS · Yahoo nur Kurs-Transport/Fallback ohne API-Key.");
        Console.WriteLine("EIN-SCANNER-SUPER: komplettes Aktien-Master pro Minutenlauf · 100 Aktien/Batch · bis zu 16 Requests parallel · Ziel deutlich unter 1 Min. Laufzeit.");
        Console.WriteLine("News-Stack: Fed / ECB / BLS offiziell + Google-News-RSS nur Discovery · kein API-Key.");
        Console.WriteLine("Abend-Replay: ab 21:55 lokal auf dem PC · kein Cloudflare-AI nötig.");
        Console.WriteLine("Tagesbericht: E:\\KI-Markt-Agent\\TAGESBERICHT.html · Sync notfalls am nächsten Morgen.");
        Console.WriteLine();

        Log("Agent gestartet.");

        while (true)
        {
            try
            {
                DateTime now = GetBerlinNow();
                Session s = GetSession(now);

                if (!s.TradingDay || s.Minute < 445 || s.Minute >= 1380)
                {
                    Thread.Sleep(60000);
                    continue;
                }

                bool prefetchChanged = false;
                if ((DateTime.UtcNow - LastLeaderAt).TotalMinutes >= LeaderMinutes)
                {
                    List<Dictionary<string, object>> nextLeaders = GetLeaders();
                    List<Dictionary<string, object>> nextRebounds = GetRebounds();
                    List<Dictionary<string, object>> nextBreakouts = GetBreakouts();
                    if (nextLeaders.Count >= 10 || LeaderEntries.Count == 0) LeaderEntries = nextLeaders;
                    else Log("Leader-Refresh zu klein (" + nextLeaders.Count + "), letzte gesunde Liste bleibt aktiv (" + LeaderEntries.Count + ").");
                    if (nextRebounds.Count > 0 || ReboundEntries.Count == 0) ReboundEntries = nextRebounds;
                    else Log("Rebound-Refresh leer, letzte Liste bleibt aktiv (" + ReboundEntries.Count + ").");
                    if (nextBreakouts.Count > 0 || BreakoutEntries.Count == 0) BreakoutEntries = nextBreakouts;
                    else Log("Breakout-Refresh leer, letzte Liste bleibt aktiv (" + BreakoutEntries.Count + ").");
                    LastLeaderAt = DateTime.UtcNow;
                    prefetchChanged = true;
                    Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + " Leader-Voranalyse: " + LeaderEntries.Count);
                    Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + " Rebound-Voranalyse: " + ReboundEntries.Count);
                    Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + " Breakout-Voranalyse: " + BreakoutEntries.Count);
                }

                if ((DateTime.UtcNow - LastFutureAt).TotalMinutes >= FutureMinutes)
                {
                    FutureWatch = BuildFutureWatch();
                    LastFutureAt = DateTime.UtcNow;
                    prefetchChanged = true;
                    Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + " Frühindikator aktualisiert");
                }

                Dictionary<string, object> wideMeta = null;
                List<Dictionary<string, object>> wideEntries = RunDynamicWideSweep(out wideMeta);
                CaptureReplayObservations(wideEntries);
                if ((DateTime.UtcNow - LastReplayObservedSaveUtc).TotalMinutes >= 5) SaveReplayObserved();
                Dictionary<string, object> metrics = GetMetrics(s.Phase);
                metrics["wideSweepEntries"] = wideEntries;
                metrics["wideSweepMeta"] = wideMeta;

                if (prefetchChanged && (LeaderEntries.Count > 0 || ReboundEntries.Count > 0 || BreakoutEntries.Count > 0 || FutureWatch != null))
                {
                    Dictionary<string, object> prefetchPayload = new Dictionary<string, object>();
                    prefetchPayload["leaderUpdatedAt"] = LastLeaderAt.ToString("o");
                    prefetchPayload["leaderEntries"] = LeaderEntries;
                    prefetchPayload["reboundEntries"] = ReboundEntries;
                    prefetchPayload["breakoutEntries"] = BreakoutEntries;
                    prefetchPayload["futureWatch"] = FutureWatch;
                    Dictionary<string, object> prefetchMetrics = GetMetrics(s.Phase);
                    prefetchPayload["metrics"] = prefetchMetrics;
                    PostJson("/api/agent/prefetch", prefetchPayload);
                    SaveSnapshot(prefetchPayload);
                }

                if (s.Preopen && s.Minute == 445)
                {
                    PostJson("/api/agent/scan", metrics);
                    Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + " 07:25 Vorbereitung ausgelöst");
                }
                else if (s.Preopen)
                {
                    PostJson("/api/agent/heartbeat", metrics);
                }
                else if (s.Open)
                {
                    PostJson("/api/agent/scan", metrics);
                    Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + " Minuten-Scan ausgelöst");
                }

                // Leichter Status-Cache: sichert Trade-Historie/Kandidaten lokal, damit
                // der Replay später auch ohne Cloudflare-Abendbetrieb rechnen kann.
                if (s.Open && (DateTime.UtcNow - LastStatusCacheUtc).TotalMinutes >= StatusCacheEveryMinutes)
                    TryCacheServerStatus();

                // Primär lokal: Yahoo-5m-Charts werden direkt vom PC ausgewertet.
                if (s.Open && s.Minute >= EveningReplayStartMinute && s.Minute <= EveningReplayEndMinute &&
                    (DateTime.UtcNow - LastReplayAtUtc).TotalMinutes >= 1)
                {
                    TryRunLocalReplayBatch();
                }

                // Morgens erst eventuell ausstehende lokale Learnings synchronisieren,
                // danach den gespeicherten Server-Bericht lokal spiegeln. FutureWatch
                // wurde zu diesem Zeitpunkt bereits mit frischen News aktualisiert.
                if (s.Preopen && s.Minute == 445 &&
                    (DateTime.UtcNow - LastReplayDownloadUtc).TotalMinutes >= 30)
                {
                    TrySyncPendingLocalReplay();
                    TryDownloadReplayReport();
                }

                if ((DateTime.UtcNow - LastCleanupAt).TotalMinutes >= 30)
                    Cleanup();

                LastError = null;
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
                Log("FEHLER: " + ex.Message);
                Console.WriteLine(DateTime.Now.ToString("HH:mm:ss") + " FEHLER: " + ex.Message);
                try { Cleanup(); } catch { }
            }

            int sec = 60 - DateTime.Now.Second;
            if (sec < 5) sec += 60;
            Thread.Sleep(sec * 1000);
        }
    }

    class Session
    {
        public bool TradingDay;
        public bool Preopen;
        public bool Open;
        public string Phase;
        public int Minute;
    }

    class MasterEquity
    {
        public string Symbol;
        public string Base;
        public double MarketCap;
        public double AvgVolume;
        public double Priority;
    }

    class WideSignal
    {
        public string Symbol;
        public double WideScore;
        public double M5Pct;
        public double M20Pct;
        public double AccelerationPct;
        public double SessionPct;
        public double Last;
        public string Tier;
        public DateTime ObservedUtc;
        public string Source;
    }

    class WideParallelWork
    {
        public List<List<string>> Batches;
        public int NextIndex;
        public int RemainingWorkers;
        public int Failures;
        public int Throttles;
        public int FreshQuotes;
        public object Gate = new object();
        public ManualResetEvent Done = new ManualResetEvent(false);
    }

    class ReplayObserved
    {
        public string Symbol;
        public string Name;
        public double Priority;
        public DateTime FirstSeenUtc;
        public DateTime LastSeenUtc;
        public List<string> Sources = new List<string>();
    }

    class ReplayBar
    {
        public long TsMs;
        public double Close;
    }

    static DateTime GetBerlinNow()
    {
        TimeZoneInfo tz = TimeZoneInfo.FindSystemTimeZoneById("W. Europe Standard Time");
        return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);
    }

    static Session GetSession(DateTime d)
    {
        string ymd = d.ToString("yyyy-MM-dd");
        int m = d.Hour * 60 + d.Minute;
        bool weekend = d.DayOfWeek == DayOfWeek.Saturday || d.DayOfWeek == DayOfWeek.Sunday;
        bool holiday = false;
        foreach (string x in Closed2026) if (x == ymd) holiday = true;
        bool trading = !weekend && !holiday;
        bool pre = trading && m >= 445 && m < 450;
        bool open = trading && m >= 450 && m < 1380;
        string phase = open ? "OPEN" : (pre ? "PREOPEN" : (trading ? "CLOSED" : "NON_TRADING_DAY"));
        return new Session { TradingDay = trading, Preopen = pre, Open = open, Phase = phase, Minute = m };
    }

    static void EnsureToken()
    {
        if (File.Exists(TokenPath) && new FileInfo(TokenPath).Length > 10) return;
        byte[] b = new byte[32];
        using (RNGCryptoServiceProvider rng = new RNGCryptoServiceProvider()) rng.GetBytes(b);
        string token = Convert.ToBase64String(b).TrimEnd('=').Replace('+','-').Replace('/','_');
        File.WriteAllText(TokenPath, token, Encoding.ASCII);
    }

    static Dictionary<string, object> GetMetrics(string phase)
    {
        Process p = Process.GetCurrentProcess();
        Dictionary<string, object> d = new Dictionary<string, object>();
        d["version"] = "2.1.0-csharp-single-super-scanner";
        d["hostName"] = Environment.MachineName;
        d["storagePath"] = Root;
        d["storageBytes"] = GetDataBytes();
        d["maxStorageBytes"] = MaxStorageBytes;
        DateTime cpuNow = DateTime.UtcNow;
        TimeSpan cpuTime = p.TotalProcessorTime;
        if (LastCpuSampleUtc != DateTime.MinValue)
        {
            double wallMs = (cpuNow - LastCpuSampleUtc).TotalMilliseconds;
            double cpuMs = (cpuTime - LastCpuTime).TotalMilliseconds;
            if (wallMs > 0)
                LastCpuPct = Math.Max(0, Math.Min(100, cpuMs / wallMs / Math.Max(1, Environment.ProcessorCount) * 100.0));
        }
        LastCpuSampleUtc = cpuNow;
        LastCpuTime = cpuTime;
        d["cpuPct"] = Math.Round(LastCpuPct, 2);
        d["ramMb"] = Math.Round(p.WorkingSet64 / 1024.0 / 1024.0, 1);
        d["downloadedBytes"] = DownloadedBytes;
        d["uploadedBytes"] = UploadedBytes;
        d["localPhase"] = phase;
        d["agentMode"] = "WINDOWS_CSHARP_SINGLE_SUPER_SCANNER";
        d["lastLocalCleanupAt"] = LastCleanupAt == DateTime.MinValue ? null : (object)LastCleanupAt.ToString("o");
        d["wideSweepMasterCount"] = MasterEquities.Count;
        d["singleScanner"] = true;
        d["separateFastRadarRequired"] = false;
        d["wideSweepScannedLastCycle"] = WideLastScanned;
        d["wideSweepFreshQuotesLastCycle"] = WideLastFreshQuotes;
        d["wideSweepBatchesLastCycle"] = WideLastBatches;
        d["wideSweepParallelRequests"] = WideLastParallel;
        d["wideSweepFailuresLastCycle"] = WideLastFailures;
        d["wideSweepThrottlesLastCycle"] = WideLastThrottles;
        d["wideSweepLastElapsedSeconds"] = Math.Round(WideLastElapsedSeconds, 2);
        d["wideSweepTargetFullCycleSeconds"] = 45;
        d["wideSweepMaxMasterCoverageTargetMinutes"] = WideTargetMaxMasterCycleMinutes;
        d["wideSweepBaseTailBatchesPerMinute"] = WideTailBatches;
        d["wideSweepMaxTailBatchesPerMinute"] = WideMaxTailBatches;
        d["wideSweepAdaptiveBackoffUntil"] = WideAdaptiveBackoffUntilUtc == DateTime.MinValue ? null : (object)WideAdaptiveBackoffUntilUtc.ToString("o");
        d["wideSweepSparkBackoffUntil"] = SparkRetryAfterUtc == DateTime.MinValue ? null : (object)SparkRetryAfterUtc.ToString("o");
        d["newsSourcePolicy"] = "PRIMARY_OFFICIAL_PLUS_DISCOVERY";
        d["primaryMacroSources"] = new string[] { "Federal Reserve", "ECB", "BLS" };
        d["discoveryNewsSource"] = "Google News RSS (keyless)";
        d["companyDisclosurePreferred"] = new string[] { "SEC/EDGAR", "Deutsche Boerse/EQS", "Issuer IR" };
        d["apiKeysRequiredForMarketData"] = false;
        d["keylessMultiSource"] = true;
        d["publicHtmlDiscovery"] = new string[] { "TradingView DE", "TradingView US", "TradingView Australia", "TradingView Hong Kong", "TradingView Korea", "Yahoo public screeners fallback" };
        d["publicRssNews"] = new string[] { "Federal Reserve", "ECB", "BLS", "Google News RSS discovery" };
        d["wideSweepQuoteTransport"] = "Yahoo Spark keyless fallback; discovery no longer Yahoo-only";
        d["wideSweepFreshnessSeconds"] = 120;
        d["eveningReplayEnabled"] = true;
        d["eveningReplayLocalCompute"] = true;
        d["eveningReplayCloudflareOptional"] = true;
        d["nextMorningReplaySync"] = true;
        d["eveningReplayStartLocal"] = "21:55";
        d["eveningReplayStatus"] = LastReplayStatus;
        d["eveningReplayProcessed"] = LastReplayProcessed;
        d["eveningReplayTotal"] = LastReplayTotal;
        d["localDayReport"] = Path.Combine(Root, "TAGESBERICHT.html");
        d["localReplayObserved"] = ReplayObservedMap.Count;
        d["localReplayCursor"] = LocalReplayCursor;
        d["localReplayQueue"] = LocalReplayQueue.Count;
        d["lastError"] = LastError;
        return d;
    }

    static string GetText(string url)
    {
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
        req.Method = "GET";
        req.Timeout = 25000;
        req.ReadWriteTimeout = 25000;
        req.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KI-Markt-Agent/2.0.13";
        req.Accept = "text/html,application/json,application/rss+xml,application/xml,text/xml";
        req.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
        using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
        using (StreamReader sr = new StreamReader(resp.GetResponseStream()))
        {
            string s = sr.ReadToEnd();
            DownloadedBytes += Encoding.UTF8.GetByteCount(s);
            return s;
        }
    }

    static string PostJson(string path, object body)
    {
        string token = File.ReadAllText(TokenPath).Trim();
        string json = Json.Serialize(body);
        byte[] bytes = Encoding.UTF8.GetBytes(json);
        UploadedBytes += bytes.Length;

        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(ServerUrl + path);
        req.Method = "POST";
        req.ContentType = "application/json";
        req.Headers["Authorization"] = "Bearer " + token;
        req.Timeout = 45000;
        req.ReadWriteTimeout = 45000;
        req.ContentLength = bytes.Length;
        using (Stream st = req.GetRequestStream()) st.Write(bytes, 0, bytes.Length);
        using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
        using (StreamReader sr = new StreamReader(resp.GetResponseStream()))
        {
            string responseText = sr.ReadToEnd();
            DownloadedBytes += Encoding.UTF8.GetByteCount(responseText);
            return responseText;
        }
    }

    // Full source continues unchanged below in the downloadable build. This GitHub copy is replaced by the validated complete source in the next commit.
}

using System.Collections.Concurrent;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using LunaAgent;
using LunaAgent.Lmu;

// lunaracing Live-Agent: liest LMU per Shared Memory und zeigt die Daten live im Browser
// (Handy, Tablet oder zweiter Bildschirm im selben WLAN).
//
//   dotnet run                  normaler Betrieb, wartet auf LMU
//   dotnet run -- --demo        erfundene Daten, zum Ausprobieren ohne Spiel
//   dotnet run -- --port 5200   anderer Port (Standard 5180)
//   dotnet run -- --selftest    prüft den Parser gegen einen künstlichen Speicherblock

if (args.Contains("--selftest")) return SelfTest.Run();

int port = 5180;
int portArg = Array.IndexOf(args, "--port");
if (portArg >= 0 && portArg + 1 < args.Length && int.TryParse(args[portArg + 1], out var p)) port = p;
bool demo = args.Contains("--demo") || !OperatingSystem.IsWindows();

var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = args, ContentRootPath = AppContext.BaseDirectory });
builder.Logging.SetMinimumLevel(LogLevel.Warning);
builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
var app = builder.Build();

var clients = new ConcurrentDictionary<Guid, WebSocket>();
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
string latest = JsonSerializer.Serialize(new { status = "waiting", message = "Starte …" }, json);

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });
app.Map("/ws", async ctx =>
{
    if (!ctx.WebSockets.IsWebSocketRequest)
    {
        ctx.Response.StatusCode = 400;
        return;
    }
    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    var id = Guid.NewGuid();
    clients[id] = ws;
    var buf = new byte[256];
    try
    {
        // Wir lesen nur, um ein Schließen mitzubekommen
        while (ws.State == WebSocketState.Open)
        {
            var r = await ws.ReceiveAsync(buf, ctx.RequestAborted);
            if (r.MessageType == WebSocketMessageType.Close) break;
        }
    }
    catch (Exception) { }
    finally
    {
        clients.TryRemove(id, out _);
    }
});
app.MapGet("/api/frame", () => Results.Text(latest, "application/json"));

// Quelle: echtes LMU (Windows) oder Demo
var consumption = new Consumption();
var source = new Thread(() =>
{
    if (demo)
    {
        var d = new DemoSource();
        while (true)
        {
            var f = d.Next();
            latest = JsonSerializer.Serialize(new { frame = f, consumption = f.Player is null ? null : consumption.Update(f.Player) }, json);
            Thread.Sleep(20);
        }
    }
#pragma warning disable CA1416 // nur unter Windows erreichbar, siehe demo oben
    var buffer = new byte[Layout.TotalSize];
    using var reader = new SharedMemoryReader();
    string? lastError = null;
    while (true)
    {
        if (!reader.Connected)
        {
            if (!reader.TryConnect(out var err))
            {
                if (err != lastError) Console.WriteLine($"[{DateTime.Now:T}] {err}");
                lastError = err;
                latest = JsonSerializer.Serialize(new { frame = new LiveFrame { Status = "waiting", Message = err } }, json);
                Thread.Sleep(2000);
                continue;
            }
            Console.WriteLine($"[{DateTime.Now:T}] mit LMU verbunden");
            lastError = null;
        }
        // Im Menü kommen keine Frames: dann alle 500 ms den Stand direkt lesen
        if (!reader.WaitAndCopy(buffer, 500)) reader.CopyNow(buffer);
        try
        {
            var f = Parser.Parse(buffer);
            latest = JsonSerializer.Serialize(new { frame = f, consumption = f.Player is null ? null : consumption.Update(f.Player) }, json);
        }
        catch (Exception e)
        {
            latest = JsonSerializer.Serialize(new { frame = new LiveFrame { Status = "error", Message = e.Message } }, json);
        }
    }
#pragma warning restore CA1416
}) { IsBackground = true, Name = "lmu" };
source.Start();

// 20 Mal pro Sekunde an alle Browser schicken
_ = Task.Run(async () =>
{
    using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(50));
    string sent = "";
    while (await timer.WaitForNextTickAsync())
    {
        var msg = latest;
        if (ReferenceEquals(msg, sent) || clients.IsEmpty) continue;
        sent = msg;
        var bytes = Encoding.UTF8.GetBytes(msg);
        foreach (var (id, ws) in clients)
        {
            try
            {
                if (ws.State == WebSocketState.Open)
                    await ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None);
            }
            catch (Exception)
            {
                clients.TryRemove(id, out _);
            }
        }
    }
});

Console.WriteLine("lunaracing Live-Agent");
Console.WriteLine(demo ? "Modus: Demo (erfundene Daten)" : "Modus: LMU Shared Memory");
Console.WriteLine($"Auf diesem PC:    http://localhost:{port}");
foreach (var ip in LanAddresses()) Console.WriteLine($"Handy im WLAN:    http://{ip}:{port}");
Console.WriteLine("Strg+C beendet den Agent.");
app.Run();
return 0;

static IEnumerable<string> LanAddresses() =>
    NetworkInterface.GetAllNetworkInterfaces()
        .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
        .SelectMany(n => n.GetIPProperties().UnicastAddresses)
        .Where(a => a.Address.AddressFamily == AddressFamily.InterNetwork && !IPAddress.IsLoopback(a.Address))
        .Select(a => a.Address.ToString())
        .Distinct();

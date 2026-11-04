using System.IO.MemoryMappedFiles;
using System.Runtime.Versioning;

namespace LunaAgent.Lmu;

/// <summary>
/// Verbindet sich mit dem Shared Memory von LMU und kopiert pro Frame den ganzen Block.
/// Ablauf wie im SDK beschrieben: auf Hold- und Data-Event warten, dann unter dem
/// LMU-Lock kopieren. LMU muss laufen; bis dahin wird alle 2 Sekunden neu versucht.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed unsafe class SharedMemoryReader : IDisposable
{
    MemoryMappedFile? _map;
    MemoryMappedViewAccessor? _view;
    EventWaitHandle? _hold;
    EventWaitHandle? _data;
    MemoryMappedFile? _lockMap;
    MemoryMappedViewAccessor? _lockView;
    EventWaitHandle? _lockEvent;
    byte* _lockPtr;
    byte* _dataPtr;

    public bool Connected => _view is not null;

    /// <summary>Öffnet alles, was LMU anlegt. false, wenn LMU (noch) nicht läuft.</summary>
    public bool TryConnect(out string? error)
    {
        error = null;
        try
        {
            _map = MemoryMappedFile.OpenExisting(Layout.MapName, MemoryMappedFileRights.Read);
            _view = _map.CreateViewAccessor(0, Layout.TotalSize, MemoryMappedFileAccess.Read);
            _view.SafeMemoryMappedViewHandle.AcquirePointer(ref _dataPtr);
            _dataPtr += _view.PointerOffset;
            _hold = EventWaitHandle.OpenExisting(Layout.HoldEvent);
            _data = EventWaitHandle.OpenExisting(Layout.DataEvent);

            // Lock wie SharedMemoryLock im SDK: LockData { waiters; busy } plus Auto-Reset-Event
            _lockMap = MemoryMappedFile.CreateOrOpen(Layout.LockMapName, 8);
            _lockView = _lockMap.CreateViewAccessor(0, 8);
            _lockView.SafeMemoryMappedViewHandle.AcquirePointer(ref _lockPtr);
            _lockPtr += _lockView.PointerOffset;
            _lockEvent = new EventWaitHandle(false, EventResetMode.AutoReset, Layout.LockEvent);
            return true;
        }
        catch (FileNotFoundException)
        {
            error = "LMU läuft nicht (kein Shared Memory gefunden).";
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            error = "LMU läuft, aber ohne Shared-Memory-Events. Ist die LMU-Version zu alt?";
        }
        catch (Exception e)
        {
            error = $"Verbindung fehlgeschlagen: {e.Message}";
        }
        Dispose();
        return false;
    }

    /// <summary>
    /// Wartet bis zu timeoutMs auf den nächsten Frame und kopiert ihn nach target.
    /// false bei Timeout (kein neuer Frame, z. B. im Menü).
    /// </summary>
    public bool WaitAndCopy(byte[] target, int timeoutMs)
    {
        if (_view is null || _hold is null || _data is null) return false;
        if (!_hold.WaitOne(timeoutMs) || !_data.WaitOne(timeoutMs)) return false;
        bool locked = Lock(timeoutMs);
        try
        {
            fixed (byte* dst = target)
            {
                Buffer.MemoryCopy(_dataPtr, dst, target.Length, Layout.TotalSize);
            }
        }
        finally
        {
            if (locked) Unlock();
        }
        return true;
    }

    /// <summary>Liest den Block ohne auf ein Event zu warten (für den Menü-Zustand).</summary>
    public void CopyNow(byte[] target)
    {
        if (_view is null) return;
        bool locked = Lock(50);
        try
        {
            fixed (byte* dst = target)
            {
                Buffer.MemoryCopy(_dataPtr, dst, target.Length, Layout.TotalSize);
            }
        }
        finally
        {
            if (locked) Unlock();
        }
    }

    int* Waiters => (int*)_lockPtr;
    int* Busy => (int*)(_lockPtr + 4);

    bool Lock(int timeoutMs)
    {
        if (_lockPtr == null) return false;
        for (int spins = 0; spins < 4000; spins++)
        {
            if (Interlocked.CompareExchange(ref *Busy, 1, 0) == 0) return true;
            Thread.SpinWait(1);
        }
        Interlocked.Increment(ref *Waiters);
        bool acquired = false;
        while (true)
        {
            if (Interlocked.CompareExchange(ref *Busy, 1, 0) == 0)
            {
                acquired = true;
                break;
            }
            if (!_lockEvent!.WaitOne(timeoutMs)) break;
        }
        Interlocked.Decrement(ref *Waiters);
        return acquired;
    }

    void Unlock()
    {
        Interlocked.Exchange(ref *Busy, 0);
        if (Volatile.Read(ref *Waiters) > 0) _lockEvent!.Set();
    }

    public void Dispose()
    {
        if (_dataPtr != null) _view?.SafeMemoryMappedViewHandle.ReleasePointer();
        if (_lockPtr != null) _lockView?.SafeMemoryMappedViewHandle.ReleasePointer();
        _dataPtr = null;
        _lockPtr = null;
        _view?.Dispose();
        _map?.Dispose();
        _hold?.Dispose();
        _data?.Dispose();
        _lockView?.Dispose();
        _lockMap?.Dispose();
        _lockEvent?.Dispose();
        _view = null;
        _map = null;
        _hold = _data = _lockEvent = null;
        _lockView = null;
        _lockMap = null;
    }
}

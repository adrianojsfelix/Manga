// The PC at a glance: CPU, memory, the graphics card (busy and its memory),
// the network down and up, the system disk, how long it has been on.

use serde::Serialize;

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SysInfo {
    /// 0–100.
    pub cpu: f32,
    pub ram_used: u64,
    pub ram_total: u64,
    /// 0–100, or -1 when Windows does not tell.
    pub gpu: f32,
    pub vram_used: u64,
    pub vram_total: u64,
    /// Bytes a second.
    pub down: u64,
    pub up: u64,
    pub disk_used: u64,
    pub disk_total: u64,
    /// Seconds.
    pub uptime: u64,
}

#[tauri::command]
pub async fn sysinfo() -> SysInfo {
    tauri::async_runtime::spawn_blocking(imp::read).await.unwrap_or_default()
}

#[cfg(not(windows))]
mod imp {
    pub fn read() -> super::SysInfo {
        super::SysInfo { gpu: -1.0, ..Default::default() }
    }
}

#[cfg(windows)]
mod imp {
    use super::SysInfo;
    use manga_core::sysinfo::{cpu_percent, rate};
    use std::sync::Mutex;
    use std::time::Instant;
    use windows::core::w;
    use windows::Win32::Foundation::FILETIME;
    use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE};
    use windows::Win32::NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2};
    use windows::Win32::NetworkManagement::Ndis::IfOperStatusUp;
    use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    use windows::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY,
        PDH_MORE_DATA,
    };
    use windows::Win32::System::SystemInformation::{GetTickCount64, GlobalMemoryStatusEx, MEMORYSTATUSEX};
    use windows::Win32::System::Threading::GetSystemTimes;

    struct Prev {
        cpu: (u64, u64, u64),
        net: (u64, u64),
        at: Instant,
    }

    struct Gpu {
        query: isize,
        busy: isize,
        mem: isize,
    }

    static PREV: Mutex<Option<Prev>> = Mutex::new(None);
    static GPU: Mutex<Option<Option<Gpu>>> = Mutex::new(None);
    static VRAM: Mutex<Option<u64>> = Mutex::new(None);

    fn ft(f: FILETIME) -> u64 {
        (f.dwHighDateTime as u64) << 32 | f.dwLowDateTime as u64
    }

    fn cpu_times() -> (u64, u64, u64) {
        let (mut i, mut k, mut u) = (FILETIME::default(), FILETIME::default(), FILETIME::default());
        unsafe {
            let _ = GetSystemTimes(Some(&mut i), Some(&mut k), Some(&mut u));
        }
        (ft(i), ft(k), ft(u))
    }

    fn net() -> (u64, u64) {
        let (mut down, mut up) = (0u64, 0u64);
        unsafe {
            let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
            if GetIfTable2(&mut table).is_err() || table.is_null() {
                return (0, 0);
            }
            let n = (*table).NumEntries as usize;
            let rows = std::slice::from_raw_parts((*table).Table.as_ptr(), n);
            for r in rows {
                let hardware = r.InterfaceAndOperStatusFlags._bitfield & 1 != 0;
                let filter = r.InterfaceAndOperStatusFlags._bitfield & 2 != 0;
                if r.Type == 24 || !hardware || filter || r.OperStatus != IfOperStatusUp {
                    continue;
                }
                down += r.InOctets;
                up += r.OutOctets;
            }
            FreeMibTable(table as *const _);
        }
        (down, up)
    }

    fn vram_total() -> u64 {
        let mut cached = VRAM.lock().unwrap();
        if let Some(v) = *cached {
            return v;
        }
        let mut best = 0u64;
        unsafe {
            if let Ok(f) = CreateDXGIFactory1::<IDXGIFactory1>() {
                let mut i = 0;
                while let Ok(a) = f.EnumAdapters1(i) {
                    if let Ok(d) = a.GetDesc1() {
                        if d.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 == 0 {
                            best = best.max(d.DedicatedVideoMemory as u64);
                        }
                    }
                    i += 1;
                }
            }
        }
        *cached = Some(best);
        best
    }

    fn gpu_open() -> Option<Gpu> {
        unsafe {
            let mut q = PDH_HQUERY::default();
            if PdhOpenQueryW(None, 0, &mut q) != 0 {
                return None;
            }
            let mut busy = PDH_HCOUNTER::default();
            let mut mem = PDH_HCOUNTER::default();
            let a = PdhAddEnglishCounterW(q, w!("\\GPU Engine(*engtype_3D)\\Utilization Percentage"), 0, &mut busy);
            let b = PdhAddEnglishCounterW(q, w!("\\GPU Adapter Memory(*)\\Dedicated Usage"), 0, &mut mem);
            if a != 0 && b != 0 {
                return None;
            }
            let _ = PdhCollectQueryData(q);
            Some(Gpu { query: q.0 as isize, busy: if a == 0 { busy.0 as isize } else { 0 }, mem: if b == 0 { mem.0 as isize } else { 0 } })
        }
    }

    fn sum(counter: isize) -> Option<f64> {
        if counter == 0 {
            return None;
        }
        unsafe {
            let h = PDH_HCOUNTER(counter as _);
            let (mut size, mut count) = (0u32, 0u32);
            if PdhGetFormattedCounterArrayW(h, PDH_FMT_DOUBLE, &mut size, &mut count, None) != PDH_MORE_DATA {
                return None;
            }
            let items = (size as usize).div_ceil(std::mem::size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>()).max(1);
            let mut buf = vec![PDH_FMT_COUNTERVALUE_ITEM_W::default(); items];
            if PdhGetFormattedCounterArrayW(h, PDH_FMT_DOUBLE, &mut size, &mut count, Some(buf.as_mut_ptr())) != 0 {
                return None;
            }
            Some(buf[..count as usize].iter().filter(|i| i.FmtValue.CStatus == 0).map(|i| i.FmtValue.Anonymous.doubleValue).sum())
        }
    }

    pub fn read() -> SysInfo {
        let mut s = SysInfo { gpu: -1.0, ..Default::default() };
        unsafe {
            let mut m = MEMORYSTATUSEX { dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
            if GlobalMemoryStatusEx(&mut m).is_ok() {
                s.ram_total = m.ullTotalPhys;
                s.ram_used = m.ullTotalPhys - m.ullAvailPhys;
            }
            let (mut free, mut total) = (0u64, 0u64);
            if GetDiskFreeSpaceExW(w!("C:\\"), Some(&mut free), Some(&mut total), None).is_ok() {
                s.disk_total = total;
                s.disk_used = total.saturating_sub(free);
            }
            s.uptime = GetTickCount64() / 1000;
        }

        let now = Prev { cpu: cpu_times(), net: net(), at: Instant::now() };
        let mut prev = PREV.lock().unwrap();
        if let Some(p) = prev.as_ref() {
            let ms = p.at.elapsed().as_millis() as u64;
            s.cpu = cpu_percent(p.cpu, now.cpu);
            s.down = rate(p.net.0, now.net.0, ms);
            s.up = rate(p.net.1, now.net.1, ms);
        }
        *prev = Some(now);

        s.vram_total = vram_total();
        let mut gpu = GPU.lock().unwrap();
        if gpu.is_none() {
            *gpu = Some(gpu_open());
        }
        if let Some(Some(g)) = gpu.as_ref() {
            unsafe {
                let _ = PdhCollectQueryData(PDH_HQUERY(g.query as _));
            }
            if let Some(b) = sum(g.busy) {
                s.gpu = b.clamp(0.0, 100.0) as f32;
            }
            if let Some(m) = sum(g.mem) {
                s.vram_used = m as u64;
            }
        }
        s
    }
}

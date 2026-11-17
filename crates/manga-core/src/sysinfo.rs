//! The PC's numbers between two readings: CPU busy, bytes a second.

/// CPU busy 0–100 from two readings of (idle, kernel, user) times; the
/// kernel time includes the idle time, as Windows counts it.
pub fn cpu_percent(before: (u64, u64, u64), now: (u64, u64, u64)) -> f32 {
    let idle = now.0.saturating_sub(before.0);
    let total = now.1.saturating_sub(before.1) + now.2.saturating_sub(before.2);
    if total == 0 {
        return 0.0;
    }
    ((total.saturating_sub(idle)) as f64 * 100.0 / total as f64).clamp(0.0, 100.0) as f32
}

/// Bytes a second between two counters `ms` apart (a reset counts as 0).
pub fn rate(before: u64, now: u64, ms: u64) -> u64 {
    if ms == 0 || now < before {
        return 0;
    }
    (now - before) * 1000 / ms
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpu_busy_is_what_was_not_idle() {
        // 100 ticks passed (kernel 60 incl. 50 idle, user 40): 50 busy.
        assert_eq!(cpu_percent((0, 0, 0), (50, 60, 40)), 50.0);
        assert_eq!(cpu_percent((10, 10, 10), (10, 10, 10)), 0.0);
        assert_eq!(cpu_percent((0, 0, 0), (0, 30, 70)), 100.0);
    }

    #[test]
    fn rates_per_second() {
        assert_eq!(rate(1000, 3000, 500), 4000);
        assert_eq!(rate(3000, 1000, 500), 0);
        assert_eq!(rate(1, 2, 0), 0);
    }
}

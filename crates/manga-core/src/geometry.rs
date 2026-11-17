//! Where the island's window goes.

/// Where a window `width` wide goes on a monitor (logical px): centred, at the top.
pub fn top_centre(monitor_x: f64, monitor_y: f64, monitor_width: f64, width: f64) -> (f64, f64) {
    ((monitor_x + (monitor_width - width) / 2.0).round(), monitor_y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_window_sits_at_the_top_centre_of_its_monitor() {
        assert_eq!(top_centre(0.0, 0.0, 1920.0, 246.0), (837.0, 0.0));
        assert_eq!(top_centre(1920.0, 0.0, 2560.0, 456.0), (2972.0, 0.0));
        assert_eq!(top_centre(-1280.0, 120.0, 1280.0, 280.0), (-780.0, 120.0));
    }
}

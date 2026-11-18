//! Where the island's window goes.

/// Where a window `width` wide goes on a monitor (logical px): centred, at the top.
pub fn top_centre(monitor_x: f64, monitor_y: f64, monitor_width: f64, width: f64) -> (f64, f64) {
    ((monitor_x + (monitor_width - width) / 2.0).round(), monitor_y)
}

/// Whether a window covers its whole monitor (a game, a video in full
/// screen, a presentation). Rectangles: (left, top, right, bottom).
pub fn covers(window: (i32, i32, i32, i32), monitor: (i32, i32, i32, i32)) -> bool {
    window.0 <= monitor.0 && window.1 <= monitor.1 && window.2 >= monitor.2 && window.3 >= monitor.3
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_screen_is_the_whole_monitor() {
        let m = (0, 0, 1920, 1080);
        assert!(covers((0, 0, 1920, 1080), m));
        assert!(covers((-8, -8, 1928, 1088), m), "a maximised-borderless overhang still counts");
        assert!(!covers((0, 0, 1920, 1040), m), "a maximised window leaves the taskbar");
        assert!(!covers((1920, 0, 3840, 1080), m));
    }

    #[test]
    fn the_window_sits_at_the_top_centre_of_its_monitor() {
        assert_eq!(top_centre(0.0, 0.0, 1920.0, 246.0), (837.0, 0.0));
        assert_eq!(top_centre(1920.0, 0.0, 2560.0, 456.0), (2972.0, 0.0));
        assert_eq!(top_centre(-1280.0, 120.0, 1280.0, 280.0), (-780.0, 120.0));
    }
}

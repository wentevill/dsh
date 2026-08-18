use dsh_desktop::window::{DEFAULT_WINDOW_SPEC, WindowSpec, fit_window_to_work_area};

#[test]
fn default_window_is_large_but_not_full_screen() {
    assert_eq!(
        DEFAULT_WINDOW_SPEC,
        WindowSpec {
            width: 1152.0,
            height: 720.0,
        }
    );
}

#[test]
fn startup_window_fits_the_available_work_area() {
    assert_eq!(
        fit_window_to_work_area(
            DEFAULT_WINDOW_SPEC,
            WindowSpec {
                width: 1024.0,
                height: 680.0,
            },
        ),
        WindowSpec {
            width: 1024.0,
            height: 680.0,
        }
    );
}

#[test]
fn larger_work_area_preserves_the_default_window_size() {
    assert_eq!(
        fit_window_to_work_area(
            DEFAULT_WINDOW_SPEC,
            WindowSpec {
                width: 1440.0,
                height: 900.0,
            },
        ),
        DEFAULT_WINDOW_SPEC
    );
}

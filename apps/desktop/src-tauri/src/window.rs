#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindowSpec {
    pub width: f64,
    pub height: f64,
}

pub const DEFAULT_WINDOW_SPEC: WindowSpec = WindowSpec {
    width: 1152.0,
    height: 720.0,
};

pub fn fit_window_to_work_area(spec: WindowSpec, available: WindowSpec) -> WindowSpec {
    WindowSpec {
        width: spec.width.min(available.width),
        height: spec.height.min(available.height),
    }
}

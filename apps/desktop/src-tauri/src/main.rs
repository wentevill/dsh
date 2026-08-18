use dsh_desktop::lifecycle::{ServerProcess, StartSpec, tcp_readiness_probe};
use dsh_desktop::resources::RuntimePaths;
use std::error::Error;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct DesktopServer(Mutex<Option<ServerProcess>>);

fn main() {
    let app = tauri::Builder::default()
        .setup(setup)
        .build(tauri::generate_context!())
        .expect("failed to build DeepSeek Harness Desktop");

    app.run(|handle, event| {
        if let RunEvent::ExitRequested { .. } = event
            && let Some(state) = handle.try_state::<DesktopServer>()
            && let Ok(mut server) = state.0.lock()
            && let Some(mut server) = server.take()
        {
            let _ = server.shutdown();
        }
    });
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn Error>> {
    let resources = RuntimePaths::from_resource_root(&app.path().resource_dir()?)?;
    let dsh_home = app.path().app_data_dir()?.join("harness");
    std::fs::create_dir_all(&dsh_home)?;
    let server = ServerProcess::start(StartSpec {
        node: resources.node,
        cli: resources.cli,
        package_bin: resources.package_bin,
        dsh_home,
        ready_timeout: Duration::from_secs(30),
        shutdown_grace: Duration::from_secs(5),
        readiness_probe: tcp_readiness_probe,
    })?;
    let origin = tauri::Url::parse(server.origin())?;
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(origin))
        .title("DeepSeek Harness")
        .visible(false)
        .build()?;
    app.manage(DesktopServer(Mutex::new(Some(server))));
    window.show()?;
    Ok(())
}

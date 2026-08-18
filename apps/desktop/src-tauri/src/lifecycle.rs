use std::fmt::{Debug, Display, Formatter};
use std::io::{BufRead, BufReader, Read};
use std::net::{SocketAddr, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const WEB_URL_PREFIX: &str = "dsh web: http://127.0.0.1:";

#[derive(Debug, Eq, PartialEq)]
pub struct WebUrlError;

impl Display for WebUrlError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Harness did not report a valid loopback Web URL")
    }
}

impl std::error::Error for WebUrlError {}

pub fn parse_web_url(output: &str) -> Result<String, WebUrlError> {
    let line = output
        .lines()
        .find_map(|line| line.strip_prefix(WEB_URL_PREFIX))
        .ok_or(WebUrlError)?;
    let port = line.parse::<u16>().map_err(|_| WebUrlError)?;
    if port == 0 {
        return Err(WebUrlError);
    }
    Ok(format!("http://127.0.0.1:{port}"))
}

const STDERR_LIMIT: u64 = 32 * 1024;
const SIGTERM: i32 = 15;
const SIGKILL: i32 = 9;

unsafe extern "C" {
    fn kill(pid: i32, signal: i32) -> i32;
    fn setpgid(pid: i32, process_group: i32) -> i32;
}

#[derive(Clone, Debug)]
pub struct StartSpec {
    pub node: PathBuf,
    pub cli: PathBuf,
    pub dsh_home: PathBuf,
    pub ready_timeout: Duration,
    pub shutdown_grace: Duration,
    pub readiness_probe: fn(&SocketAddr) -> bool,
}

#[derive(Debug)]
pub enum StartError {
    Spawn(std::io::Error),
    EarlyExit { code: Option<i32>, stderr: String },
    ReadyTimeout { stderr: String },
    Output(std::io::Error),
}

impl Display for StartError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Spawn(error) => write!(
                formatter,
                "failed to start bundled Harness runtime: {error}"
            ),
            Self::EarlyExit { code, stderr } => {
                write!(
                    formatter,
                    "Harness exited before readiness (code {code:?}): {stderr}"
                )
            }
            Self::ReadyTimeout { stderr } => {
                write!(formatter, "Harness readiness timed out: {stderr}")
            }
            Self::Output(error) => {
                write!(formatter, "failed to read Harness startup output: {error}")
            }
        }
    }
}

impl std::error::Error for StartError {}

pub struct ServerProcess {
    child: Child,
    origin: String,
    shutdown_grace: Duration,
    stderr: Option<JoinHandle<String>>,
    exited: bool,
}

impl Debug for ServerProcess {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ServerProcess")
            .field("pid", &self.child.id())
            .field("origin", &self.origin)
            .field("exited", &self.exited)
            .finish()
    }
}

impl ServerProcess {
    pub fn start(spec: StartSpec) -> Result<Self, StartError> {
        let mut command = Command::new(&spec.node);
        command
            .arg(&spec.cli)
            .args(["--profile", "web", "--port", "0"])
            .env("DSH_HOME", &spec.dsh_home)
            .env_remove("NODE_OPTIONS")
            .env_remove("NODE_PATH")
            .env_remove("NODE_EXTRA_CA_CERTS")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        unsafe {
            command.pre_exec(|| {
                if setpgid(0, 0) == 0 {
                    Ok(())
                } else {
                    Err(std::io::Error::last_os_error())
                }
            });
        }
        let mut child = command.spawn().map_err(StartError::Spawn)?;
        let stdout = child.stdout.take().ok_or_else(|| {
            StartError::Output(std::io::Error::other("Harness stdout pipe is unavailable"))
        })?;
        let stderr = child.stderr.take().ok_or_else(|| {
            StartError::Output(std::io::Error::other("Harness stderr pipe is unavailable"))
        })?;
        let stderr_thread = thread::spawn(move || {
            let mut bytes = Vec::new();
            let _ = stderr.take(STDERR_LIMIT).read_to_end(&mut bytes);
            String::from_utf8_lossy(&bytes).into_owned()
        });
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                if sender.send(line).is_err() {
                    break;
                }
            }
        });

        let deadline = Instant::now() + spec.ready_timeout;
        let mut candidate: Option<(String, SocketAddr)> = None;
        loop {
            if let Some(status) = child.try_wait().map_err(StartError::Output)? {
                return Err(early_exit(status, stderr_thread));
            }
            if let Some((origin, address)) = &candidate
                && (spec.readiness_probe)(address)
            {
                return Ok(Self {
                    child,
                    origin: origin.clone(),
                    shutdown_grace: spec.shutdown_grace,
                    stderr: Some(stderr_thread),
                    exited: false,
                });
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                terminate_group(&mut child, SIGTERM);
                let _ = child.wait();
                return Err(StartError::ReadyTimeout {
                    stderr: join_stderr(stderr_thread),
                });
            }
            match receiver.recv_timeout(remaining.min(Duration::from_millis(20))) {
                Ok(Ok(line)) => {
                    if let Ok(origin) = parse_web_url(&line) {
                        let port = origin
                            .rsplit_once(':')
                            .and_then(|(_, port)| port.parse::<u16>().ok())
                            .ok_or_else(|| {
                                StartError::Output(std::io::Error::other("invalid Harness port"))
                            })?;
                        candidate = Some((origin, SocketAddr::from(([127, 0, 0, 1], port))));
                    }
                }
                Ok(Err(error)) => return Err(StartError::Output(error)),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => thread::yield_now(),
            }
        }
    }

    pub fn origin(&self) -> &str {
        &self.origin
    }

    pub fn has_exited(&self) -> bool {
        self.exited
    }

    pub fn shutdown(&mut self) -> std::io::Result<()> {
        if self.exited {
            return Ok(());
        }
        terminate_group(&mut self.child, SIGTERM);
        let deadline = Instant::now() + self.shutdown_grace;
        while Instant::now() < deadline {
            if self.child.try_wait()?.is_some() {
                self.exited = true;
                self.join_stderr();
                return Ok(());
            }
            thread::sleep(Duration::from_millis(10));
        }
        terminate_group(&mut self.child, SIGKILL);
        self.child.wait()?;
        self.exited = true;
        self.join_stderr();
        Ok(())
    }

    fn join_stderr(&mut self) {
        if let Some(stderr) = self.stderr.take() {
            let _ = stderr.join();
        }
    }
}

pub fn tcp_readiness_probe(address: &SocketAddr) -> bool {
    TcpStream::connect_timeout(address, Duration::from_millis(20)).is_ok()
}

impl Drop for ServerProcess {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

fn early_exit(status: ExitStatus, stderr: JoinHandle<String>) -> StartError {
    StartError::EarlyExit {
        code: status.code(),
        stderr: join_stderr(stderr),
    }
}

fn join_stderr(stderr: JoinHandle<String>) -> String {
    stderr
        .join()
        .unwrap_or_else(|_| "failed to collect Harness stderr".to_owned())
}

fn terminate_group(child: &mut Child, signal: i32) {
    let pid = child.id() as i32;
    unsafe {
        kill(-pid, signal);
    }
}

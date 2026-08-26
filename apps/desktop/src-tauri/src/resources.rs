use std::fmt::{Display, Formatter};
use std::path::{Path, PathBuf};

#[derive(Debug, Eq, PartialEq)]
pub struct RuntimePaths {
    pub node: PathBuf,
    pub cli: PathBuf,
    pub package_bin: PathBuf,
    pub manager_bootstrap: PathBuf,
    pub manager_archive: PathBuf,
}

#[derive(Debug, Eq, PartialEq)]
pub struct MissingResource(PathBuf);

impl Display for MissingResource {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "Desktop runtime resource is missing: {}",
            self.0.display()
        )
    }
}

impl std::error::Error for MissingResource {}

impl RuntimePaths {
    pub fn from_resource_root(root: &Path) -> Result<Self, MissingResource> {
        let node = root.join("runtime/node/bin/node");
        require_file(root, &node)?;
        let cli = root.join("runtime/app/node_modules/@deepseek-ai/dsh/lib/bin.js");
        require_file(root, &cli)?;
        let package_bin = root.join("runtime/app/node_modules/.bin");
        require_directory(root, &package_bin)?;
        let manager_bootstrap = root.join("runtime/app/ensure-plugin-manager.mjs");
        require_file(root, &manager_bootstrap)?;
        let manager_archive = root.join("runtime/plugins/dsh-plugin-manager.tgz");
        require_file(root, &manager_archive)?;
        Ok(Self {
            node,
            cli,
            package_bin,
            manager_bootstrap,
            manager_archive,
        })
    }
}

fn require_directory(root: &Path, path: &Path) -> Result<(), MissingResource> {
    if path.is_dir() {
        return Ok(());
    }
    Err(MissingResource(
        path.strip_prefix(root).unwrap_or(path).to_path_buf(),
    ))
}

fn require_file(root: &Path, path: &Path) -> Result<(), MissingResource> {
    if path.is_file() {
        return Ok(());
    }
    Err(MissingResource(
        path.strip_prefix(root).unwrap_or(path).to_path_buf(),
    ))
}

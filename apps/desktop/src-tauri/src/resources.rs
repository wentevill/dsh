use std::fmt::{Display, Formatter};
use std::path::{Path, PathBuf};

#[derive(Debug, Eq, PartialEq)]
pub struct RuntimePaths {
    pub node: PathBuf,
    pub cli: PathBuf,
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
        Ok(Self { node, cli })
    }
}

fn require_file(root: &Path, path: &Path) -> Result<(), MissingResource> {
    if path.is_file() {
        return Ok(());
    }
    Err(MissingResource(
        path.strip_prefix(root).unwrap_or(path).to_path_buf(),
    ))
}

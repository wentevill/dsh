use dsh_desktop::resources::RuntimePaths;
use std::fs::{create_dir_all, write};

#[test]
fn resolves_bundled_node_and_existing_built_cli_from_the_resource_root() {
    let root = std::env::temp_dir().join(format!("dsh-desktop-resources-{}", std::process::id()));
    let node = root.join("runtime/node/bin/node");
    let cli = root.join("runtime/app/node_modules/@deepseek-ai/dsh/lib/bin.js");
    let package_bin = root.join("runtime/app/node_modules/.bin");
    create_dir_all(node.parent().unwrap()).unwrap();
    create_dir_all(cli.parent().unwrap()).unwrap();
    create_dir_all(&package_bin).unwrap();
    write(&node, "node").unwrap();
    write(&cli, "cli").unwrap();

    let paths = RuntimePaths::from_resource_root(&root).unwrap();
    assert_eq!(paths.node, node);
    assert_eq!(paths.cli, cli);
    assert_eq!(paths.package_bin, package_bin);
}

#[test]
fn rejects_an_incomplete_runtime_without_searching_the_host() {
    let root = std::env::temp_dir().join(format!("dsh-desktop-missing-{}", std::process::id()));
    create_dir_all(&root).unwrap();
    let error = RuntimePaths::from_resource_root(&root).unwrap_err();
    assert!(error.to_string().contains("runtime/node/bin/node"));
}

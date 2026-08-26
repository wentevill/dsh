use dsh_desktop::resources::RuntimePaths;
use std::fs::{create_dir_all, write};

#[test]
fn resolves_bundled_node_and_existing_built_cli_from_the_resource_root() {
    let root = std::env::temp_dir().join(format!("dsh-desktop-resources-{}", std::process::id()));
    let node = root.join("runtime/node/bin/node");
    let cli = root.join("runtime/app/node_modules/@deepseek-ai/dsh/lib/bin.js");
    let package_bin = root.join("runtime/app/node_modules/.bin");
    let manager_bootstrap = root.join("runtime/app/ensure-plugin-manager.mjs");
    let manager_archive = root.join("runtime/plugins/dsh-plugin-manager.tgz");
    create_dir_all(node.parent().unwrap()).unwrap();
    create_dir_all(cli.parent().unwrap()).unwrap();
    create_dir_all(&package_bin).unwrap();
    create_dir_all(manager_archive.parent().unwrap()).unwrap();
    write(&node, "node").unwrap();
    write(&cli, "cli").unwrap();
    write(&manager_bootstrap, "bootstrap").unwrap();
    write(&manager_archive, "archive").unwrap();

    let paths = RuntimePaths::from_resource_root(&root).unwrap();
    assert_eq!(paths.node, node);
    assert_eq!(paths.cli, cli);
    assert_eq!(paths.package_bin, package_bin);
    assert_eq!(paths.manager_bootstrap, manager_bootstrap);
    assert_eq!(paths.manager_archive, manager_archive);
}

#[test]
fn rejects_an_incomplete_runtime_without_searching_the_host() {
    let root = std::env::temp_dir().join(format!("dsh-desktop-missing-{}", std::process::id()));
    create_dir_all(&root).unwrap();
    let error = RuntimePaths::from_resource_root(&root).unwrap_err();
    assert!(error.to_string().contains("runtime/node/bin/node"));
}

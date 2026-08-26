export type InstallAction = 'install' | 'upgrade' | 'reinstall' | 'downgrade';
export declare function classifyInstallAction(installedVersion: string | undefined, candidateVersion: string): InstallAction;

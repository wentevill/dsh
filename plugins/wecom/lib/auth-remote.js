/** Transport-neutral facade. Connect returns immediately so the UI can poll for the QR. */
export function createAuthRemoteApi(controller) {
    return {
        status: () => controller.snapshot(),
        connect() {
            void controller.connect();
            return controller.snapshot();
        },
        cancel() {
            controller.cancel();
            return controller.snapshot();
        },
        async refresh() {
            await controller.refresh();
            return controller.snapshot();
        },
        async deleteAuthorization(confirmed) {
            await controller.deleteAuthorization(confirmed);
            return controller.snapshot();
        },
    };
}

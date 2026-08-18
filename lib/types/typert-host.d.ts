/**
 * Host-facing Typert contribution for @beihaizb/dsh-envsel.
 *
 * Registers the `envsel` Remote endpoints with the Host gateway's strict
 * registry (`ctx.typert.local`) through the deployment's typert-loader, which
 * auto-discovers packages that export `./typert`. Without this artifact the
 * `/api/envsel/*` endpoints fall back to the gateway's SRC claims, which are
 * cached before this plugin registers and so never pick it up — the header
 * dropdown then reports a transport ("network") error. The descriptors are
 * shared with the client contribution (`./typert-remote`), so the wire
 * contract stays single-source.
 * @module @beihaizb/dsh-envsel/typert
 */
/** The Host-facing Typert manifest consumed by @deepseek-ai/dsh-typert-loader. */
export declare const TYPERT: {
    package: string;
    face: string;
    schemas: never[];
    invocations: readonly import("@deepseek-ai/dsh-typert-protocol").InvocationDescriptor[];
    model: {
        services: never[];
        events: never[];
        objects: never[];
    };
};
export default TYPERT;
//# sourceMappingURL=typert-host.d.ts.map
/**
 * Session environment selector, browser half: one header utility that opens
 * per-language (Python / R / CLI tools) dropdowns over the generated `envsel`
 * Remote. The selection is session-owned and shared with the `/env` command,
 * the `session_env` tool, and the DSH_ENV_* shell facts.
 * @module @beihzb/dsh-envsel/client
 */
// The generated Host-for-Client Remote contribution this package owns (the
// official api-remotes assembly does not know a downstream plugin, so this
// package mounts its own `envsel` namespace).
import envselContribution from "../typert-remote/index.js";
import { EnvselHeaderButton } from "./EnvselHeaderButton.js";
import { en, NS, zh } from "./locales.js";
/** Required services: the slot registry, the Remote service, and the copy. */
export const inject = ['slots', 'locale', 'remote'];
/** Rejected outcome built from a transport throw. */
function transportFailure(error) {
    return {
        ok: false,
        error: {
            code: 'transport',
            message: error instanceof Error ? error.message : 'envsel request failed',
        },
    };
}
/**
 * Client plugin body: mount the envsel Remote, register the dictionaries and
 * the header utility.
 * @param ctx - client root context.
 */
export async function apply(ctx) {
    // Mount the `envsel` namespace on the Remote service so ctx.remote.envsel
    // resolves; the contribution's descriptors were generated from the host
    // EnvselRemoteService and travel inlined in this package's client bundle.
    await ctx.remote.$mount(envselContribution);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-envsel: dictionaries');
    const injected = () => ({
        listCatalog: async () => {
            try {
                const carried = await ctx.remote.envsel.list();
                if (!carried.ok)
                    return { ok: false, error: carried.error };
                return { ok: true, value: carried.value };
            }
            catch (error) {
                return transportFailure(error);
            }
        },
        getSelection: async (id) => {
            try {
                const carried = await ctx.remote.envsel.get({ sessionId: id });
                if (!carried.ok)
                    return { ok: false, error: carried.error };
                const business = carried.value;
                return business.ok
                    ? { ok: true, value: business.value }
                    : { ok: false, error: { code: business.error.code, message: business.error.code } };
            }
            catch (error) {
                return transportFailure(error);
            }
        },
        setSelection: async (id, slot, address) => {
            try {
                const carried = await ctx.remote.envsel.set({ sessionId: id, slot, address });
                if (!carried.ok)
                    return { ok: false, error: carried.error };
                const business = carried.value;
                return business.ok
                    ? { ok: true, value: business.value }
                    : { ok: false, error: { code: business.error.code, message: business.error.code } };
            }
            catch (error) {
                return transportFailure(error);
            }
        },
        pinPath: async (path) => {
            try {
                const carried = await ctx.remote.envsel.pin({ path });
                if (!carried.ok)
                    return { ok: false, error: carried.error };
                const business = carried.value;
                return business.ok
                    ? { ok: true, value: business.value }
                    : { ok: false, error: { code: business.error.code, message: business.error.code } };
            }
            catch (error) {
                return transportFailure(error);
            }
        },
        unpinPath: async (address) => {
            try {
                const carried = await ctx.remote.envsel.unpin({ address });
                if (!carried.ok)
                    return { ok: false, error: carried.error };
                const business = carried.value;
                return business.ok
                    ? { ok: true, value: business.value }
                    : { ok: false, error: { code: business.error.code, message: business.error.code } };
            }
            catch (error) {
                return transportFailure(error);
            }
        },
    });
    ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
        name: 'conversation.session.header.utilities',
        id: 'envsel',
        order: 10,
        locale: NS,
        inject: injected,
    }, EnvselHeaderButton));
}
//# sourceMappingURL=index.js.map
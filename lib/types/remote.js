/**
 * Browser gateway for envsel. The instance is created inside the envsel plugin
 * body and provided as the `envsel` service, so its handlers share the
 * plugin's catalog cache and per-session selection state instead of owning a
 * second copy. The `@Remote` decorator markers are discovered at runtime by the
 * api gateway through the service's typert binding; the client half mounts the
 * matching generated contribution (`./typert-remote`) in this package's
 * browser bundle.
 *
 * @module @beihzb/dsh-envsel/remote
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
/** Typert Remote service exposing the envsel catalog and session selection. */
let EnvselRemoteService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _get_decorators;
    let _set_decorators;
    let _pin_decorators;
    let _unpin_decorators;
    return class EnvselRemoteService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote('list')];
            _get_decorators = [Remote('get')];
            _set_decorators = [Remote('set')];
            _pin_decorators = [Remote('pin')];
            _unpin_decorators = [Remote('unpin')];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _get_decorators, { kind: "method", name: "get", static: false, private: false, access: { has: obj => "get" in obj, get: obj => obj.get }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _set_decorators, { kind: "method", name: "set", static: false, private: false, access: { has: obj => "set" in obj, get: obj => obj.set }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _pin_decorators, { kind: "method", name: "pin", static: false, private: false, access: { has: obj => "pin" in obj, get: obj => obj.pin }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _unpin_decorators, { kind: "method", name: "unpin", static: false, private: false, access: { has: obj => "unpin" in obj, get: obj => obj.unpin }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        handlers = __runInitializers(this, _instanceExtraInitializers);
        /**
         * @param ctx - owning Host Context.
         * @param handlers - plugin-backed operations shared with the command/tool paths.
         */
        constructor(ctx, handlers) {
            super(ctx, 'envsel');
            this.handlers = handlers;
        }
        /** Full environment catalog for the browser dropdowns. */
        list() {
            return this.handlers.list();
        }
        /** Current folded selection of the addressed session. */
        get(request) {
            return this.handlers.get(request.sessionId);
        }
        /** Assign one slot of the addressed session. */
        set(request) {
            return this.handlers.set(request.sessionId, request.slot, request.address);
        }
        /**
         * Remember one host path and return the refreshed catalog.
         * @param request - absolute interpreter or install path.
         * @returns the catalog after the pin, or an explicit probe failure.
         */
        pin(request) {
            return this.handlers.pin(request.path);
        }
        /**
         * Forget one remembered path and return the refreshed catalog.
         * @param request - `custom:<name>` address or the original host path.
         * @returns the catalog after the unpin, or an explicit missing-entry failure.
         */
        unpin(request) {
            return this.handlers.unpin(request.address);
        }
    };
})();
export { EnvselRemoteService };
export default EnvselRemoteService;
//# sourceMappingURL=remote.js.map
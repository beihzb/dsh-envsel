import { z } from "zod";
//#region lib/types/strict-codec.js
/**
* Strict-codec emission for this package's generated Typert artifacts.
*
* ## Contract
*
* A strict `TypertCodec` carries the runtime schema for one invocation
* parameter or result. From DSH **0.1.7-rc.1** both `dsh-typert-loader` and
* `dsh-typert-registry` (host and browser side) require a `create()` factory:
*
* ```ts
* if (typeof codec.create !== 'function') throw new Error('... has no create() factory')
* ```
*
* and the registry materialises the schema lazily through it
* (`const schema = record.value ??= record.create()`). That replaced the eager
* `schema` instance which 0.1.0-rc.x loaders validated and 0.1.7-rc.1 removed,
* so a codec carrying only `schema` no longer loads.
*
* Emitting codecs from a function keeps the generated artifact's object
* literals out of excess-property checking and gives the wire contract one
* place to change.
*
* ## Version policy
*
* This release targets **DSH 0.1.7-rc.1 and newer** only; the package's peers
* are `^0.1.7-rc.1`. DSH 0.1.0-rc.7 through 0.1.5-rc.x validate the eager
* `schema` field instead and must stay on `@beihaizb/dsh-envsel@0.1.4`.
*
* @module @beihaizb/dsh-envsel/strict-codec
*/
/**
* Build one strict codec for a generated parameter or result schema.
* @param typeSymbol - canonical type symbol the schema was generated from.
* @param schema - the generated zod schema for this parameter or result.
* @returns a codec whose `create()` factory yields that schema.
*/
function strictCodec(typeSymbol, schema) {
	return {
		mode: "strict",
		typeSymbol,
		create: () => schema
	};
}
//#endregion
//#region lib/types/typert-remote/index.js
const _deepseek_ai_dsh_envsel_envsel_get_parameter_0$schema = z.object({ "sessionId": z.intersection(z.string(), z.unknown()).readonly() });
const _deepseek_ai_dsh_envsel_envsel_get_result$schema = z.union([z.object({
	"ok": z.literal(true).readonly(),
	"value": z.object({ "selection": z.object({
		"r": z.object({
			"kind": z.union([
				z.literal("conda"),
				z.literal("r"),
				z.literal("wsl"),
				z.literal("custom")
			]).readonly(),
			"name": z.string().readonly(),
			"prefix": z.string().readonly(),
			"python": z.union([z.literal(null), z.string()]).readonly(),
			"rscript": z.union([z.literal(null), z.string()]).readonly(),
			"distro": z.string().readonly().optional(),
			"pythonCommand": z.string().readonly().optional(),
			"rscriptCommand": z.string().readonly().optional()
		}).optional(),
		"python": z.object({
			"kind": z.union([
				z.literal("conda"),
				z.literal("r"),
				z.literal("wsl"),
				z.literal("custom")
			]).readonly(),
			"name": z.string().readonly(),
			"prefix": z.string().readonly(),
			"python": z.union([z.literal(null), z.string()]).readonly(),
			"rscript": z.union([z.literal(null), z.string()]).readonly(),
			"distro": z.string().readonly().optional(),
			"pythonCommand": z.string().readonly().optional(),
			"rscriptCommand": z.string().readonly().optional()
		}).optional(),
		"cli": z.object({
			"kind": z.union([
				z.literal("conda"),
				z.literal("r"),
				z.literal("wsl"),
				z.literal("custom")
			]).readonly(),
			"name": z.string().readonly(),
			"prefix": z.string().readonly(),
			"python": z.union([z.literal(null), z.string()]).readonly(),
			"rscript": z.union([z.literal(null), z.string()]).readonly(),
			"distro": z.string().readonly().optional(),
			"pythonCommand": z.string().readonly().optional(),
			"rscriptCommand": z.string().readonly().optional()
		}).optional()
	}).readonly() }).readonly()
}), z.object({
	"ok": z.literal(false).readonly(),
	"error": z.object({
		"code": z.literal("session-not-found").readonly(),
		"sessionId": z.intersection(z.string(), z.unknown()).readonly()
	}).readonly()
})]);
const _deepseek_ai_dsh_envsel_envsel_list_result$schema = z.object({
	"entries": z.array(z.object({
		"kind": z.union([
			z.literal("conda"),
			z.literal("r"),
			z.literal("wsl"),
			z.literal("custom")
		]).readonly(),
		"name": z.string().readonly(),
		"prefix": z.string().readonly(),
		"python": z.union([z.literal(null), z.string()]).readonly(),
		"rscript": z.union([z.literal(null), z.string()]).readonly(),
		"distro": z.string().readonly().optional(),
		"pythonCommand": z.string().readonly().optional(),
		"rscriptCommand": z.string().readonly().optional()
	})).readonly(),
	"warnings": z.array(z.string()).readonly()
});
const _deepseek_ai_dsh_envsel_envsel_pin_parameter_0$schema = z.object({ "path": z.string().readonly() });
const _deepseek_ai_dsh_envsel_envsel_pin_result$schema = z.union([z.object({
	"ok": z.literal(true).readonly(),
	"value": z.object({
		"entries": z.array(z.object({
			"kind": z.union([
				z.literal("conda"),
				z.literal("r"),
				z.literal("wsl"),
				z.literal("custom")
			]).readonly(),
			"name": z.string().readonly(),
			"prefix": z.string().readonly(),
			"python": z.union([z.literal(null), z.string()]).readonly(),
			"rscript": z.union([z.literal(null), z.string()]).readonly(),
			"distro": z.string().readonly().optional(),
			"pythonCommand": z.string().readonly().optional(),
			"rscriptCommand": z.string().readonly().optional()
		})).readonly(),
		"warnings": z.array(z.string()).readonly()
	}).readonly()
}), z.object({
	"ok": z.literal(false).readonly(),
	"error": z.union([
		z.object({
			"code": z.literal("invalid-path").readonly(),
			"path": z.string().readonly()
		}),
		z.object({
			"code": z.literal("not-found").readonly(),
			"path": z.string().readonly()
		}),
		z.object({
			"code": z.literal("no-interpreter").readonly(),
			"path": z.string().readonly()
		})
	]).readonly()
})]);
const _deepseek_ai_dsh_envsel_envsel_set_parameter_0$schema = z.object({
	"sessionId": z.intersection(z.string(), z.unknown()).readonly(),
	"slot": z.union([
		z.literal("r"),
		z.literal("python"),
		z.literal("cli")
	]).readonly(),
	"address": z.string().readonly()
});
const _deepseek_ai_dsh_envsel_envsel_set_result$schema = z.union([z.object({
	"ok": z.literal(true).readonly(),
	"value": z.object({ "selection": z.object({
		"r": z.object({
			"kind": z.union([
				z.literal("conda"),
				z.literal("r"),
				z.literal("wsl"),
				z.literal("custom")
			]).readonly(),
			"name": z.string().readonly(),
			"prefix": z.string().readonly(),
			"python": z.union([z.literal(null), z.string()]).readonly(),
			"rscript": z.union([z.literal(null), z.string()]).readonly(),
			"distro": z.string().readonly().optional(),
			"pythonCommand": z.string().readonly().optional(),
			"rscriptCommand": z.string().readonly().optional()
		}).optional(),
		"python": z.object({
			"kind": z.union([
				z.literal("conda"),
				z.literal("r"),
				z.literal("wsl"),
				z.literal("custom")
			]).readonly(),
			"name": z.string().readonly(),
			"prefix": z.string().readonly(),
			"python": z.union([z.literal(null), z.string()]).readonly(),
			"rscript": z.union([z.literal(null), z.string()]).readonly(),
			"distro": z.string().readonly().optional(),
			"pythonCommand": z.string().readonly().optional(),
			"rscriptCommand": z.string().readonly().optional()
		}).optional(),
		"cli": z.object({
			"kind": z.union([
				z.literal("conda"),
				z.literal("r"),
				z.literal("wsl"),
				z.literal("custom")
			]).readonly(),
			"name": z.string().readonly(),
			"prefix": z.string().readonly(),
			"python": z.union([z.literal(null), z.string()]).readonly(),
			"rscript": z.union([z.literal(null), z.string()]).readonly(),
			"distro": z.string().readonly().optional(),
			"pythonCommand": z.string().readonly().optional(),
			"rscriptCommand": z.string().readonly().optional()
		}).optional()
	}).readonly() }).readonly()
}), z.object({
	"ok": z.literal(false).readonly(),
	"error": z.union([
		z.object({
			"code": z.literal("session-not-found").readonly(),
			"sessionId": z.intersection(z.string(), z.unknown()).readonly()
		}),
		z.object({
			"code": z.literal("unknown-slot").readonly(),
			"sessionId": z.intersection(z.string(), z.unknown()).readonly(),
			"slot": z.string().readonly()
		}),
		z.object({
			"code": z.literal("entry-not-found").readonly(),
			"sessionId": z.intersection(z.string(), z.unknown()).readonly(),
			"slot": z.union([
				z.literal("r"),
				z.literal("python"),
				z.literal("cli")
			]).readonly(),
			"address": z.string().readonly()
		}),
		z.object({
			"code": z.literal("incompatible").readonly(),
			"sessionId": z.intersection(z.string(), z.unknown()).readonly(),
			"slot": z.union([
				z.literal("r"),
				z.literal("python"),
				z.literal("cli")
			]).readonly(),
			"address": z.string().readonly()
		})
	]).readonly()
})]);
const _deepseek_ai_dsh_envsel_envsel_unpin_parameter_0$schema = z.object({ "address": z.string().readonly() });
const _deepseek_ai_dsh_envsel_envsel_unpin_result$schema = z.union([z.object({
	"ok": z.literal(true).readonly(),
	"value": z.object({
		"entries": z.array(z.object({
			"kind": z.union([
				z.literal("conda"),
				z.literal("r"),
				z.literal("wsl"),
				z.literal("custom")
			]).readonly(),
			"name": z.string().readonly(),
			"prefix": z.string().readonly(),
			"python": z.union([z.literal(null), z.string()]).readonly(),
			"rscript": z.union([z.literal(null), z.string()]).readonly(),
			"distro": z.string().readonly().optional(),
			"pythonCommand": z.string().readonly().optional(),
			"rscriptCommand": z.string().readonly().optional()
		})).readonly(),
		"warnings": z.array(z.string()).readonly()
	}).readonly()
}), z.object({
	"ok": z.literal(false).readonly(),
	"error": z.object({
		"code": z.literal("entry-not-found").readonly(),
		"address": z.string().readonly()
	}).readonly()
})]);
//#endregion
//#region lib/types/typert-host.js
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
const TYPERT = {
	package: "@beihaizb/dsh-envsel",
	face: "host",
	schemas: [],
	invocations: {
		package: "@beihaizb/dsh-envsel",
		descriptors: [
			{
				id: "@beihaizb/dsh-envsel#envsel/get",
				service: "envsel",
				namespace: "envsel",
				method: "get",
				invocation: { kind: "direct" },
				parameters: [{
					name: "request",
					wire: "request",
					source: "json",
					codec: strictCodec("@beihaizb/dsh-envsel/types#EnvselGetRequest", _deepseek_ai_dsh_envsel_envsel_get_parameter_0$schema)
				}],
				result: strictCodec("@beihaizb/dsh-envsel/types#EnvselGetResult", _deepseek_ai_dsh_envsel_envsel_get_result$schema),
				sourceLocation: {
					"file": "packages/shell/envsel/src/remote.ts",
					"line": 59,
					"column": 3
				}
			},
			{
				id: "@beihaizb/dsh-envsel#envsel/list",
				service: "envsel",
				namespace: "envsel",
				method: "list",
				invocation: { kind: "direct" },
				parameters: [],
				result: strictCodec("@beihaizb/dsh-envsel/types#EnvselCatalogValue", _deepseek_ai_dsh_envsel_envsel_list_result$schema),
				sourceLocation: {
					"file": "packages/shell/envsel/src/remote.ts",
					"line": 53,
					"column": 3
				}
			},
			{
				id: "@beihaizb/dsh-envsel#envsel/pin",
				service: "envsel",
				namespace: "envsel",
				method: "pin",
				invocation: { kind: "direct" },
				parameters: [{
					name: "request",
					wire: "request",
					source: "json",
					codec: strictCodec("@beihaizb/dsh-envsel/types#EnvselPinRequest", _deepseek_ai_dsh_envsel_envsel_pin_parameter_0$schema)
				}],
				result: strictCodec("@beihaizb/dsh-envsel/types#EnvselPinResult", _deepseek_ai_dsh_envsel_envsel_pin_result$schema),
				sourceLocation: {
					"file": "packages/shell/envsel/src/remote.ts",
					"line": 75,
					"column": 3
				}
			},
			{
				id: "@beihaizb/dsh-envsel#envsel/set",
				service: "envsel",
				namespace: "envsel",
				method: "set",
				invocation: { kind: "direct" },
				parameters: [{
					name: "request",
					wire: "request",
					source: "json",
					codec: strictCodec("@beihaizb/dsh-envsel/types#EnvselSetRequest", _deepseek_ai_dsh_envsel_envsel_set_parameter_0$schema)
				}],
				result: strictCodec("@beihaizb/dsh-envsel/types#EnvselSetResult", _deepseek_ai_dsh_envsel_envsel_set_result$schema),
				sourceLocation: {
					"file": "packages/shell/envsel/src/remote.ts",
					"line": 65,
					"column": 3
				}
			},
			{
				id: "@beihaizb/dsh-envsel#envsel/unpin",
				service: "envsel",
				namespace: "envsel",
				method: "unpin",
				invocation: { kind: "direct" },
				parameters: [{
					name: "request",
					wire: "request",
					source: "json",
					codec: strictCodec("@beihaizb/dsh-envsel/types#EnvselUnpinRequest", _deepseek_ai_dsh_envsel_envsel_unpin_parameter_0$schema)
				}],
				result: strictCodec("@beihaizb/dsh-envsel/types#EnvselUnpinResult", _deepseek_ai_dsh_envsel_envsel_unpin_result$schema),
				sourceLocation: {
					"file": "packages/shell/envsel/src/remote.ts",
					"line": 85,
					"column": 3
				}
			}
		]
	}.descriptors,
	model: {
		services: [],
		events: [],
		objects: []
	}
};
//#endregion
export { TYPERT, TYPERT as default };

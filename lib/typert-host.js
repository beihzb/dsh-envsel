import { z } from "zod";
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
					codec: {
						mode: "strict",
						typeSymbol: "@beihaizb/dsh-envsel/types#EnvselGetRequest",
						schema: _deepseek_ai_dsh_envsel_envsel_get_parameter_0$schema
					}
				}],
				result: {
					mode: "strict",
					typeSymbol: "@beihaizb/dsh-envsel/types#EnvselGetResult",
					schema: _deepseek_ai_dsh_envsel_envsel_get_result$schema
				},
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
				result: {
					mode: "strict",
					typeSymbol: "@beihaizb/dsh-envsel/types#EnvselCatalogValue",
					schema: _deepseek_ai_dsh_envsel_envsel_list_result$schema
				},
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
					codec: {
						mode: "strict",
						typeSymbol: "@beihaizb/dsh-envsel/types#EnvselPinRequest",
						schema: _deepseek_ai_dsh_envsel_envsel_pin_parameter_0$schema
					}
				}],
				result: {
					mode: "strict",
					typeSymbol: "@beihaizb/dsh-envsel/types#EnvselPinResult",
					schema: _deepseek_ai_dsh_envsel_envsel_pin_result$schema
				},
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
					codec: {
						mode: "strict",
						typeSymbol: "@beihaizb/dsh-envsel/types#EnvselSetRequest",
						schema: _deepseek_ai_dsh_envsel_envsel_set_parameter_0$schema
					}
				}],
				result: {
					mode: "strict",
					typeSymbol: "@beihaizb/dsh-envsel/types#EnvselSetResult",
					schema: _deepseek_ai_dsh_envsel_envsel_set_result$schema
				},
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
					codec: {
						mode: "strict",
						typeSymbol: "@beihaizb/dsh-envsel/types#EnvselUnpinRequest",
						schema: _deepseek_ai_dsh_envsel_envsel_unpin_parameter_0$schema
					}
				}],
				result: {
					mode: "strict",
					typeSymbol: "@beihaizb/dsh-envsel/types#EnvselUnpinResult",
					schema: _deepseek_ai_dsh_envsel_envsel_unpin_result$schema
				},
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

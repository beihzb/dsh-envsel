import { defineTool } from "@deepseek-ai/dsh-tools";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/discover.js
/**
* Environment discovery for envsel: conda environments, standalone R
* installations, and WSL distributions. All discovery goes through the
* injected `subprocess` and `fs` services — never node:child_process — so the
* package stays on the harness's process-sandbox seam and its spawns are
* tree-scoped and observable.
*
* @module @deepseek-ai/@beihaizb/dsh-envsel/discover
*/
/** Base conda install root reported first by `conda env list`. */
function isBaseRoot(index) {
	return index === 0;
}
/** Last path segment of a Windows or POSIX path. */
function baseName(path) {
	const parts = path.split(/[\\/]+/).filter((part) => part.length > 0);
	return parts.length > 0 ? parts[parts.length - 1] ?? path : path;
}
/**
* True when the host is Windows (WSL and Program Files live here only).
* @param platform - Node platform string; defaults to `process.platform`.
* @returns whether the platform is `win32`.
*/
function isWindowsHost(platform = process.platform) {
	return platform === "win32";
}
/**
* Join one parent and one child using the host's path separator.
* @param parent - existing prefix; a trailing slash is stripped.
* @param child - single path segment to append.
* @param platform - Node platform string; defaults to `process.platform`.
* @returns `parent` + separator + `child`.
*/
function joinPath(parent, child, platform = process.platform) {
	const sep = isWindowsHost(platform) ? "\\" : "/";
	if (parent.length === 0) return child;
	return `${parent.replace(/[\\/]+$/u, "")}${sep}${child}`;
}
/**
* Reconstruct an install prefix from an absolute Rscript path, keeping the
* original separator and a POSIX leading slash.
* @param rscript - absolute interpreter path (python or Rscript).
* @returns the install prefix above `bin` / `Scripts` / `Resources`.
*/
function prefixFromRscript(rscript) {
	const posix = rscript.includes("/") && !rscript.includes("\\");
	const sep = posix ? "/" : "\\";
	const absolute = posix && rscript.startsWith("/");
	const parts = rscript.split(/[\\/]+/).filter((part) => part.length > 0);
	let index = parts.length - 1;
	while (index > 0) {
		const segment = parts[index].toLowerCase();
		if (segment === "rscript.exe" || segment === "rscript" || segment === "python.exe" || segment === "python" || segment === "python3" || segment === "bin" || segment === "x64" || segment === "scripts" || segment === "resources") {
			index -= 1;
			continue;
		}
		break;
	}
	const joined = parts.slice(0, index + 1).join(sep);
	return absolute ? `/${joined}` : joined;
}
/**
* Default standalone-R scan roots for the host platform (missing roots are skipped).
* @param platform - Node platform string; defaults to `process.platform`.
* @returns the platform's well-known R install roots.
*/
function defaultStandaloneRRoots(platform = process.platform) {
	if (platform === "win32") return ["C:\\Program Files\\R", "C:\\Program Files (x86)\\R"];
	if (platform === "darwin") return [
		"/Library/Frameworks/R.framework/Versions",
		"/opt/homebrew/opt/r",
		"/usr/local/opt/r"
	];
	return [
		"/opt/R",
		"/usr/local",
		"/usr"
	];
}
/**
* Spawn one argv and collect bounded stdout/stderr, terminating after
* `timeoutMs`. Returns `{ exitCode, stdout, stderr }`.
*/
async function runProbe(ctx, argv, timeoutMs) {
	const timer = ctx.get("timer");
	const handle = ctx.subprocess.spawn({
		argv: [...argv],
		cwd: process.cwd(),
		stdio: {
			stdin: "ignore",
			stdout: { maxBytes: 1 << 20 },
			stderr: { maxBytes: 65536 }
		},
		graceMs: 5e3
	});
	const stopWatchdog = timer !== void 0 ? timer.timeout(() => {
		try {
			handle.terminate();
		} catch (_terminateFailure) {}
	}, timeoutMs) : () => {};
	try {
		const outcome = await handle.done;
		const stdout = handle.collected.stdout?.readFrom(0).text ?? "";
		const stderr = handle.collected.stderr?.readFrom(0).text ?? "";
		return {
			exitCode: outcome.exitCode,
			stdout,
			stderr
		};
	} finally {
		stopWatchdog();
	}
}
/** Probe `ctx.fs` for the first existing candidate path, or null. */
async function firstExisting(ctx, candidates) {
	for (const candidate of candidates) try {
		const target = await ctx.fs.resolve(candidate);
		if (await ctx.fs.stat(target) !== void 0) return candidate;
	} catch (_statFailure) {}
	return null;
}
/** Build a conda entry with its probed interpreters. */
async function condaEntry(ctx, index, prefix) {
	const python = await firstExisting(ctx, [
		prefix + "\\python.exe",
		prefix + "/python.exe",
		prefix + "/bin/python"
	]);
	const rscript = await firstExisting(ctx, [
		prefix + "\\Library\\bin\\Rscript.exe",
		prefix + "\\Scripts\\Rscript.exe",
		prefix + "/bin/Rscript"
	]);
	return {
		kind: "conda",
		name: isBaseRoot(index) ? "base" : baseName(prefix),
		prefix,
		python,
		rscript,
		...python !== null ? { pythonCommand: python } : {},
		...rscript !== null ? { rscriptCommand: rscript } : {}
	};
}
/** Discover conda environments via `conda env list --json`. */
async function discoverConda(ctx, config) {
	let condaExe = null;
	try {
		condaExe = await ctx.subprocess.resolveExecutable(config.condaCommand);
	} catch (_resolveFailure) {
		condaExe = null;
	}
	const argv = condaExe !== null && !/\.(bat|cmd)$/i.test(condaExe) ? [
		condaExe,
		"env",
		"list",
		"--json"
	] : process.platform === "win32" ? [
		"cmd.exe",
		"/d",
		"/c",
		config.condaCommand,
		"env",
		"list",
		"--json"
	] : [
		config.condaCommand,
		"env",
		"list",
		"--json"
	];
	let probe;
	try {
		probe = await runProbe(ctx, argv, config.probeTimeoutMs);
	} catch (error) {
		return {
			entries: [],
			error: `conda 环境列举失败（需要 ${config.condaCommand} 在 PATH 上）: ${String(error)}`
		};
	}
	if (probe.exitCode !== 0) {
		const detail = probe.stderr.trim().slice(0, 300);
		return {
			entries: [],
			error: `conda env list 退出码 ${String(probe.exitCode)}${detail.length > 0 ? ` - ${detail}` : ""}`
		};
	}
	let parsed;
	try {
		parsed = JSON.parse(probe.stdout);
	} catch (error) {
		return {
			entries: [],
			error: `conda env list 输出无法解析: ${String(error)}`
		};
	}
	if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.envs)) return {
		entries: [],
		error: "conda env list 输出结构异常（缺少 envs 数组）"
	};
	const prefixes = parsed.envs.filter((item) => typeof item === "string" && item.length > 0);
	return { entries: await Promise.all(prefixes.map((prefix, index) => condaEntry(ctx, index, prefix))) };
}
/** Rscript candidates under one install prefix (Windows and POSIX layouts). */
function rscriptCandidates(prefix) {
	return [
		`${prefix}\\bin\\Rscript.exe`,
		`${prefix}\\bin\\x64\\Rscript.exe`,
		`${prefix}/bin/Rscript`,
		`${prefix}/Resources/bin/Rscript`
	];
}
/** Python candidates under one install prefix (Windows and POSIX layouts). */
function pythonCandidates(prefix) {
	return [
		`${prefix}\\python.exe`,
		`${prefix}/python.exe`,
		`${prefix}/bin/python`,
		`${prefix}/bin/python3`
	];
}
/** Build a standalone-R entry from an install root. */
async function makeRInstall(ctx, prefix) {
	const rscript = await firstExisting(ctx, rscriptCandidates(prefix));
	if (rscript === null) return null;
	return {
		kind: "r",
		name: standaloneRName(prefix),
		prefix,
		python: null,
		rscript,
		rscriptCommand: rscript
	};
}
/** Display name for a standalone R prefix (`R-4.5.1`, `4.4-arm64`, `usr`). */
function standaloneRName(prefix) {
	const leaf = baseName(prefix);
	if (leaf.length === 0 || leaf === "Current" || leaf === "Resources") return baseName(prefix.replace(/[\\/]+(?:Current|Resources)$/u, "")) || leaf || "R";
	return leaf;
}
/** Whether a child directory name looks like an R version install. */
function looksLikeRVersionDir(name) {
	return /^R-\d/i.test(name) || /^\d+\.\d/u.test(name);
}
/**
* Whether a root is a version container (`…/R`, `…/Versions`) rather than a
* single prefix such as `/usr`. Containers are listed; prefixes are probed
* in place so a Linux catalog does not walk all of `/usr`.
*/
function isRVersionContainer(root) {
	const leaf = baseName(root);
	return /^R$/i.test(leaf) || /^versions$/i.test(leaf);
}
/** Scan one directory for versioned R installs, or treat the directory itself as one. */
async function scanRRoot(ctx, root) {
	const self = await makeRInstall(ctx, root);
	if (!isRVersionContainer(root)) return self !== null ? [self] : [];
	let children = [];
	try {
		const target = await ctx.fs.resolve(root);
		children = (await ctx.fs.listDir(target)).map((entry) => ({
			name: entry.name,
			type: entry.type
		}));
	} catch (_listFailure) {
		return self !== null ? [self] : [];
	}
	const found = [];
	for (const child of children) {
		if (child.type !== "directory") continue;
		if (looksLikeRVersionDir(child.name)) {
			const install = await makeRInstall(ctx, joinPath(root, child.name));
			if (install !== null) found.push(install);
		}
	}
	if (found.length === 0 && self !== null) found.push(self);
	return found;
}
/** Discover standalone R installations: platform defaults, PATH, and configured roots. */
async function discoverStandaloneR(ctx, config) {
	const found = [];
	const seen = /* @__PURE__ */ new Set();
	const roots = [...defaultStandaloneRRoots(), ...config.standaloneRRoots];
	for (const root of roots) for (const install of await scanRRoot(ctx, root)) {
		const key = install.prefix.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		found.push(install);
	}
	let onPath = null;
	try {
		onPath = await ctx.subprocess.resolveExecutable("Rscript");
	} catch (_resolveFailure) {
		onPath = null;
	}
	if (onPath !== null) {
		const lower = onPath.toLowerCase();
		const isConda = lower.includes("\\envs\\") || lower.includes("/envs/");
		const known = [...seen].some((prefix) => onPath.toLowerCase().startsWith(prefix));
		if (!isConda && !known) {
			const install = await makeRInstall(ctx, prefixFromRscript(onPath));
			if (install !== null && !seen.has(install.prefix.toLowerCase())) {
				seen.add(install.prefix.toLowerCase());
				found.push(install);
			}
		}
	}
	return found;
}
/**
* List WSL distributions via `wsl.exe --list --quiet`. WSL writes UTF-16LE to
* stdout on Windows; decode accordingly. A non-zero exit or empty list means
* WSL is unavailable.
*/
async function wslDistros(ctx, config) {
	if (!config.wslEnabled || !isWindowsHost()) return { distros: [] };
	let probe;
	try {
		probe = await runProbe(ctx, [
			"wsl.exe",
			"--list",
			"--quiet"
		], config.probeTimeoutMs);
	} catch (error) {
		return {
			distros: [],
			error: `WSL 不可用: ${String(error)}`
		};
	}
	if (probe.exitCode !== 0) {
		const detail = probe.stderr.trim().slice(0, 300);
		return {
			distros: [],
			error: `wsl --list 退出码 ${String(probe.exitCode)}${detail.length > 0 ? ` - ${detail}` : ""}`
		};
	}
	let text = probe.stdout;
	if (process.platform === "win32") try {
		const decoder = new TextDecoder("utf-16le", { fatal: true });
		const bytes = Buffer.from(text, "binary");
		text = decoder.decode(bytes);
	} catch {}
	return { distros: text.replace(/\u0000/g, "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !/^[*\s]*$/.test(line)) };
}
/** Probe one WSL distribution for conda environments and system interpreters. */
async function discoverWslDistro(ctx, config, distro) {
	const script = "command -v conda >/dev/null 2>&1 && conda env list --json || printf \"__NO_CONDA__\"";
	let probe;
	try {
		probe = await runProbe(ctx, [
			"wsl.exe",
			"-d",
			distro,
			"--",
			"sh",
			"-lc",
			script
		], config.probeTimeoutMs);
	} catch (error) {
		return {
			entries: [],
			error: `${distro}: WSL 探测失败: ${String(error)}`
		};
	}
	if (probe.exitCode !== 0) return {
		entries: [],
		error: `${distro}: 探测退出码 ${String(probe.exitCode)}: ${probe.stderr.trim().slice(0, 300)}`
	};
	const stdout = probe.stdout.trim();
	if (stdout === "__NO_CONDA__") return { entries: await probeDistroSystem(ctx, config, distro) };
	let parsed;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		return {
			entries: [],
			error: `${distro}: conda env list 输出无法解析: ${String(error)}`
		};
	}
	if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.envs)) return {
		entries: [],
		error: `${distro}: 输出结构异常`
	};
	const prefixes = parsed.envs.filter((item) => typeof item === "string" && item.length > 0);
	const entries = [];
	for (const [index, prefix] of prefixes.entries()) {
		const entry = await probeWslEntry(ctx, config, distro, index, prefix);
		if (entry !== null) entries.push(entry);
	}
	return { entries };
}
/** Probe one Linux prefix for python/Rscript via a single sh -lc. */
async function probeWslEntry(ctx, config, distro, index, prefix) {
	const script = [
		"for p in",
		`${JSON.stringify(prefix + "/bin/python")}`,
		`${JSON.stringify(prefix + "/bin/Rscript")}`,
		"; do test -x \"$p\" && printf \"%s\\n\" \"$p\"; done"
	].join(" ");
	let probe;
	try {
		probe = await runProbe(ctx, [
			"wsl.exe",
			"-d",
			distro,
			"--",
			"sh",
			"-lc",
			script
		], config.probeTimeoutMs);
	} catch (_probeFailure) {
		return null;
	}
	if (probe.exitCode !== 0) return null;
	const present = new Set(probe.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0));
	const python = present.has(prefix + "/bin/python") ? prefix + "/bin/python" : null;
	const rscript = present.has(prefix + "/bin/Rscript") ? prefix + "/bin/Rscript" : null;
	if (python === null && rscript === null) return null;
	return {
		kind: "wsl",
		name: isBaseRoot(index) ? "base" : baseName(prefix),
		prefix,
		python,
		rscript,
		distro,
		...python !== null ? { pythonCommand: `wsl.exe -d ${distro} -- ${python}` } : {},
		...rscript !== null ? { rscriptCommand: `wsl.exe -d ${distro} -- ${rscript}` } : {}
	};
}
/** Offer the distro's system python3/Rscript when conda is absent. */
async function probeDistroSystem(ctx, config, distro) {
	const script = ["for p in /usr/bin/python3 /usr/bin/Rscript; do test -x \"$p\" && printf \"%s\\n\" \"$p\"; done"].join(" ");
	let probe;
	try {
		probe = await runProbe(ctx, [
			"wsl.exe",
			"-d",
			distro,
			"--",
			"sh",
			"-lc",
			script
		], config.probeTimeoutMs);
	} catch (_probeFailure) {
		return [];
	}
	if (probe.exitCode !== 0) return [];
	const present = probe.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
	if (present.length === 0) return [];
	const python = present.includes("/usr/bin/python3") ? "/usr/bin/python3" : null;
	const rscript = present.includes("/usr/bin/Rscript") ? "/usr/bin/Rscript" : null;
	if (python === null && rscript === null) return [];
	return [{
		kind: "wsl",
		name: "system",
		prefix: "/usr",
		python,
		rscript,
		distro,
		...python !== null ? { pythonCommand: `wsl.exe -d ${distro} -- ${python}` } : {},
		...rscript !== null ? { rscriptCommand: `wsl.exe -d ${distro} -- ${rscript}` } : {}
	}];
}
/** Full discovery pass used by the catalog cache. */
async function discoverAll(ctx, config) {
	const warnings = [];
	const entries = [];
	const conda = await discoverConda(ctx, config);
	if (conda.error !== void 0) warnings.push(conda.error);
	entries.push(...conda.entries);
	const standalone = await discoverStandaloneR(ctx, config);
	entries.push(...standalone);
	if (config.wslEnabled && isWindowsHost()) {
		const distros = await wslDistros(ctx, config);
		if (distros.error !== void 0) warnings.push(distros.error);
		else for (const distro of distros.distros) {
			const result = await discoverWslDistro(ctx, config, distro);
			if (result.error !== void 0) warnings.push(result.error);
			entries.push(...result.entries);
		}
	}
	const seen = /* @__PURE__ */ new Set();
	const deduped = [];
	for (const entry of entries) {
		const key = `${entry.kind}|${entry.distro ?? ""}|${entry.name}|${entry.prefix}`;
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(entry);
	}
	return {
		entries: deduped,
		warnings
	};
}
/** True when the last path segment names a python or Rscript executable. */
function isInterpreterFileName(name) {
	const lower = name.toLowerCase();
	return lower === "python" || lower === "python.exe" || lower === "python3" || lower === "rscript" || lower === "rscript.exe";
}
/**
* Probe one user-supplied path (interpreter file or install directory) and
* build a `custom` catalog entry when a python or Rscript is present.
* @param ctx - host context carrying `fs`.
* @param rawPath - path the user typed; leading/trailing whitespace is ignored.
* @returns the entry, or a structured reason the path cannot be pinned.
*/
async function probeCustomPath(ctx, rawPath) {
	const path = rawPath.trim();
	if (path.length === 0) return {
		ok: false,
		code: "invalid-path"
	};
	let info;
	try {
		const target = await ctx.fs.resolve(path);
		info = await ctx.fs.stat(target);
	} catch (_statFailure) {
		return {
			ok: false,
			code: "not-found"
		};
	}
	if (info === void 0) return {
		ok: false,
		code: "not-found"
	};
	let prefix = path;
	let python = null;
	let rscript = null;
	if (info.type === "file") {
		if (!isInterpreterFileName(baseName(path))) return {
			ok: false,
			code: "no-interpreter"
		};
		prefix = prefixFromRscript(path);
		if (baseName(path).toLowerCase().startsWith("python")) python = path;
		else rscript = path;
		if (python === null) python = await firstExisting(ctx, pythonCandidates(prefix));
		if (rscript === null) rscript = await firstExisting(ctx, rscriptCandidates(prefix));
	} else if (info.type === "directory") {
		prefix = path;
		python = await firstExisting(ctx, pythonCandidates(prefix));
		rscript = await firstExisting(ctx, rscriptCandidates(prefix));
	} else return {
		ok: false,
		code: "no-interpreter"
	};
	if (python === null && rscript === null) return {
		ok: false,
		code: "no-interpreter"
	};
	return {
		ok: true,
		entry: {
			kind: "custom",
			name: standaloneRName(prefix),
			prefix,
			python,
			rscript,
			...python !== null ? { pythonCommand: python } : {},
			...rscript !== null ? { rscriptCommand: rscript } : {}
		}
	};
}
//#endregion
//#region lib/types/pin-cache.js
/**
* Machine-local cache of user-pinned interpreter / install paths. The file
* lives at `$DSH_HOME/envsel-pinned.json` and is shared across sessions; each
* session still chooses independently from the resulting catalog entries.
*
* @module @deepseek-ai/@beihaizb/dsh-envsel/pin-cache
*/
/** On-disk file name of the machine-local pin cache under the harness home. */
const PINNED_FILE_NAME = "envsel-pinned.json";
/**
* Resolved pin-cache file under the current harness home.
* @returns the absolute `$DSH_HOME/envsel-pinned.json` path.
*/
function pinnedCachePath() {
	return dshHomePath(PINNED_FILE_NAME);
}
/**
* Parse the on-disk document into a de-duplicated path list.
* @param raw - file contents; invalid JSON becomes an empty list.
* @returns remembered paths in document order.
*/
function parsePinnedDocument(raw) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (_parseFailure) {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const seen = /* @__PURE__ */ new Set();
	const out = [];
	for (const item of parsed) {
		const path = typeof item === "string" ? item.trim() : item !== null && typeof item === "object" && typeof item.path === "string" ? item.path.trim() : "";
		if (path.length === 0) continue;
		const key = path.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ path });
	}
	return out;
}
/**
* Serialize remembered paths as a stable JSON array.
* @param pins - paths to persist.
* @returns UTF-8 document with a trailing newline.
*/
function serializePinnedDocument(pins) {
	return `${JSON.stringify(pins.map((pin) => ({ path: pin.path })), null, 2)}\n`;
}
/**
* Read the pin file; a missing or unreadable file is an empty list.
* @param ctx - host context carrying `fs`.
* @returns remembered paths, or `[]` when the file is absent.
*/
async function readPinnedPaths(ctx) {
	try {
		const target = await ctx.fs.resolve(pinnedCachePath());
		return parsePinnedDocument(await ctx.fs.readText(target));
	} catch (_readFailure) {
		return [];
	}
}
/**
* Replace the pin file with the given list (empty list still writes).
* @param ctx - host context carrying `fs`.
* @param pins - complete replacement list.
*/
async function writePinnedPaths(ctx, pins) {
	const target = await ctx.fs.resolve(pinnedCachePath());
	await ctx.fs.writeText(target, serializePinnedDocument(pins));
}
/**
* Probe every remembered path. A vanished path stays on disk (the user can
* unpin it) and becomes a catalog warning so the dropdown still explains it.
* @param ctx - host context carrying `fs`.
* @returns catalog entries plus one warning per unusable pin.
*/
async function resolvePinnedEntries(ctx) {
	const pins = await readPinnedPaths(ctx);
	const entries = [];
	const warnings = [];
	const seen = /* @__PURE__ */ new Set();
	for (const pin of pins) {
		const probed = await probeCustomPath(ctx, pin.path);
		if (!probed.ok) {
			warnings.push(`手动路径不可用（${probed.code}）: ${pin.path}`);
			continue;
		}
		const key = `${probed.entry.kind}|${probed.entry.name}|${probed.entry.prefix}`.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		entries.push(probed.entry);
	}
	return {
		entries,
		warnings
	};
}
/**
* Append a path to the cache if it is not already present.
* @param ctx - host context carrying `fs`.
* @param path - absolute interpreter or install path to remember.
*/
async function appendPinnedPath(ctx, path) {
	const pins = await readPinnedPaths(ctx);
	const key = path.trim().toLowerCase();
	if (pins.some((pin) => pin.path.toLowerCase() === key)) return;
	await writePinnedPaths(ctx, [...pins, { path: path.trim() }]);
}
/**
* Remove a remembered path (by original path or by `custom:<name>` address).
* @param ctx - host context carrying `fs`.
* @param addressOrPath - `custom:<name>`, the display name, or the original path.
* @param entries - current catalog used to resolve a `custom:` address.
* @returns whether a row was removed.
*/
async function removePinnedPath(ctx, addressOrPath, entries) {
	const pins = await readPinnedPaths(ctx);
	const needle = addressOrPath.trim();
	if (needle.length === 0) return false;
	const next = pins.filter((pin) => {
		if (pin.path === needle || pin.path.toLowerCase() === needle.toLowerCase()) return false;
		const match = entries.find((entry) => entry.kind === "custom" && (entry.prefix === pin.path || entry.python === pin.path || entry.rscript === pin.path));
		if (match === void 0) return true;
		return `custom:${match.name}` !== needle && match.name !== needle;
	});
	if (next.length === pins.length) return false;
	await writePinnedPaths(ctx, next);
	return true;
}
//#endregion
//#region lib/types/remote.js
/**
* Browser gateway for envsel. The instance is created inside the envsel plugin
* body and provided as the `envsel` service, so its handlers share the
* plugin's catalog cache and per-session selection state instead of owning a
* second copy. The `@Remote` decorator markers are discovered at runtime by the
* api gateway through the service's typert binding; the client half mounts the
* matching generated contribution (`./typert-remote`) in this package's
* browser bundle.
*
* @module @beihaizb/dsh-envsel/remote
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) {
			if (kind === "field") initializers.unshift(_);
			else descriptor[key] = _;
		}
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
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
			_list_decorators = [Remote("list")];
			_get_decorators = [Remote("get")];
			_set_decorators = [Remote("set")];
			_pin_decorators = [Remote("pin")];
			_unpin_decorators = [Remote("unpin")];
			__esDecorate(this, null, _list_decorators, {
				kind: "method",
				name: "list",
				static: false,
				private: false,
				access: {
					has: (obj) => "list" in obj,
					get: (obj) => obj.list
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _get_decorators, {
				kind: "method",
				name: "get",
				static: false,
				private: false,
				access: {
					has: (obj) => "get" in obj,
					get: (obj) => obj.get
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _set_decorators, {
				kind: "method",
				name: "set",
				static: false,
				private: false,
				access: {
					has: (obj) => "set" in obj,
					get: (obj) => obj.set
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _pin_decorators, {
				kind: "method",
				name: "pin",
				static: false,
				private: false,
				access: {
					has: (obj) => "pin" in obj,
					get: (obj) => obj.pin
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _unpin_decorators, {
				kind: "method",
				name: "unpin",
				static: false,
				private: false,
				access: {
					has: (obj) => "unpin" in obj,
					get: (obj) => obj.unpin
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		handlers = __runInitializers(this, _instanceExtraInitializers);
		/**
		* @param ctx - owning Host Context.
		* @param handlers - plugin-backed operations shared with the command/tool paths.
		*/
		constructor(ctx, handlers) {
			super(ctx, "envsel");
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
//#endregion
//#region lib/types/state.js
/**
* Standalone per-session selection store for envsel. Selections live in a
* machine-local JSON file (`$DSH_HOME/envsel-state.json`) keyed by session id,
* NOT in the session event log: a downstream plugin's event type is unknown to
* the harness's session-persistence reader, which refuses a log containing an
* unrecognized non-ignorable event. Writing selection changes into the log
* would therefore make the owning session unreadable after a restart, so the
* plugin owns its own durable state instead.
*
* @module @beihaizb/dsh-envsel/state
*/
/** On-disk file name of the selection store under the harness home. */
const STATE_FILE_NAME = "envsel-state.json";
/**
* Resolved selection-store path under the current harness home.
* @returns the absolute `$DSH_HOME/envsel-state.json` path.
*/
function statePath() {
	return dshHomePath(STATE_FILE_NAME);
}
/**
* Parse the on-disk document into a session→selection map.
* @param raw - file contents; invalid or version-mismatched JSON becomes an empty map.
* @returns selections keyed by session id.
*/
function parseStateDocument(raw) {
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (_parseFailure) {
		return {};
	}
	if (parsed === null || typeof parsed !== "object") return {};
	const doc = parsed;
	if (doc.version !== 1) return {};
	const selections = doc.selections;
	if (selections === null || typeof selections !== "object" || Array.isArray(selections)) return {};
	const out = {};
	for (const [key, value] of Object.entries(selections)) if (value !== null && typeof value === "object") out[key] = value;
	return out;
}
/**
* Serialize the selection map as a stable versioned document.
* @param selections - selections to persist.
* @returns UTF-8 document with a trailing newline.
*/
function serializeStateDocument(selections) {
	return `${JSON.stringify({
		version: 1,
		selections
	}, null, 2)}\n`;
}
/**
* Read the whole selection map; a missing or unreadable file is empty.
* @param ctx - host context carrying `fs`.
* @returns selections keyed by session id.
*/
async function readAllSelections(ctx) {
	try {
		const target = await ctx.fs.resolve(statePath());
		return parseStateDocument(await ctx.fs.readText(target));
	} catch (_readFailure) {
		return {};
	}
}
/**
* Replace the whole selection map (an empty map still writes).
* @param ctx - host context carrying `fs`.
* @param selections - complete replacement map.
*/
async function writeAllSelections(ctx, selections) {
	const target = await ctx.fs.resolve(statePath());
	await ctx.fs.writeText(target, serializeStateDocument(selections));
}
/**
* Persist one session's selection, replacing its previous value.
* @param ctx - host context carrying `fs`.
* @param sessionId - the addressed session.
* @param selection - the new selection (empty object clears the session).
*/
async function writeSessionSelection(ctx, sessionId, selection) {
	const all = await readAllSelections(ctx);
	const key = String(sessionId);
	if (selection === null || Object.keys(selection).length === 0) delete all[key];
	else all[key] = selection;
	await writeAllSelections(ctx, all);
}
//#endregion
//#region lib/types/types.js
/**
* Shared envsel vocabulary: environment entry shapes and language slots.
* Client-safe — nothing here reaches a Host-only symbol.
*
* @module @beihaizb/dsh-envsel/types
*/
/** Every supported slot, in canonical display order. */
const ENV_SLOTS = [
	"python",
	"r",
	"cli"
];
/** Human-readable slot labels (product copy is Chinese). */
const ENV_SLOT_LABELS = {
	python: "Python",
	r: "R",
	cli: "CLI 工具"
};
/** True when the selection contains no slot assignments. */
function isEmptySelection(selection) {
	return ENV_SLOTS.every((slot) => selection[slot] === void 0);
}
//#endregion
//#region lib/types/index.js
/**
* envsel — session environment selector for DeepSeek Harness. Per-language
* slots (`python`, `r`, `cli`) each hold one first-priority environment drawn
* from conda, standalone R installs, WSL distributions, or user-pinned custom
* paths. Selections persist in a machine-local JSON store keyed by session id
* (never the session event log — see state.ts), are injected into every shell
* call as `DSH_ENV_*` facts, and are changed from the browser via the `/env`
* command, the `session_env` model tool, or the `envsel` Typert Remote that
* backs the header dropdown.
*
* @module @beihaizb/dsh-envsel
*/
const name = "envsel";
/** Hard dependencies: every service ships in the official DSH host plane. */
const inject = [
	"subprocess",
	"fs",
	"shellEnv",
	"commands",
	"tools",
	"timer",
	"sessions"
];
/** Default catalog cache TTL in milliseconds. */
const LIST_TTL_MS_DEFAULT = 3e5;
/** Default conda executable name. */
const CONDA_COMMAND_DEFAULT = "conda";
/** Default per-probe watchdog timeout in milliseconds. */
const PROBE_TIMEOUT_MS_DEFAULT = 2e4;
/** Apply defaults and validate deployment values at the configuration boundary. */
function resolveConfig(input = {}) {
	const listTtlMs = input.listTtlMs ?? 3e5;
	const probeTimeoutMs = input.probeTimeoutMs ?? 2e4;
	const condaCommand = input.condaCommand ?? "conda";
	if (!Number.isFinite(listTtlMs) || listTtlMs <= 0) throw new TypeError(`envsel: listTtlMs must be a positive finite number, got ${String(listTtlMs)}`);
	if (!Number.isFinite(probeTimeoutMs) || probeTimeoutMs <= 0) throw new TypeError(`envsel: probeTimeoutMs must be a positive finite number, got ${String(probeTimeoutMs)}`);
	if (condaCommand.trim().length === 0) throw new TypeError("envsel: condaCommand must be non-empty");
	return {
		listTtlMs,
		condaCommand: condaCommand.trim(),
		standaloneRRoots: [...input.standaloneRRoots ?? []],
		wslEnabled: input.wslEnabled ?? true,
		registerTool: input.registerTool ?? true,
		probeTimeoutMs
	};
}
const ASSIGNMENT = /^([a-z]+)=(.*)$/u;
/** Parse the raw input of a `/env` invocation into an action. */
function parseEnvLine(rawInput) {
	const tokens = rawInput.trim().split(/\s+/u).filter((token) => token.length > 0);
	if (tokens.length === 0) return { kind: "show" };
	const first = tokens[0];
	if (first === "help") return { kind: "help" };
	if (first === "clear") return { kind: "clear" };
	if (first === "wsl") return { kind: "wsl" };
	if (first === "add") {
		const path = tokens.slice(1).join(" ").trim();
		if (path.length === 0) return {
			kind: "error",
			text: "用法: /env add <解释器或安装目录的绝对路径>"
		};
		return {
			kind: "add",
			path
		};
	}
	if (first === "unpin") {
		const address = tokens.slice(1).join(" ").trim();
		if (address.length === 0) return {
			kind: "error",
			text: "用法: /env unpin custom:<名> 或 /env unpin <路径>"
		};
		return {
			kind: "unpin",
			address
		};
	}
	if (first === "list") return {
		kind: "list",
		filter: tokens.slice(1).join(" ").trim()
	};
	const assignments = [];
	for (const token of tokens) {
		const match = ASSIGNMENT.exec(token);
		if (match === null) return {
			kind: "error",
			text: `无法识别的参数 "${token}"（应为 slot=值，如 python=scRNAv2）`
		};
		const slot = match[1];
		const value = match[2] ?? "";
		if (!ENV_SLOTS.includes(slot)) return {
			kind: "error",
			text: `未知槽位 "${slot}"（可用: ${ENV_SLOTS.join(" / ")}）`
		};
		assignments.push({
			slot,
			value
		});
	}
	return {
		kind: "assign",
		assignments
	};
}
/** Resolve a value into an entry reference against one catalog. */
function resolveEntry(catalog, value) {
	if (value.length === 0) return null;
	if (value.includes(":")) {
		const parts = value.split(":");
		if (parts.length === 2) {
			const [kind, name] = parts;
			return catalog.find((entry) => entry.kind === kind && entry.name === name) ?? null;
		}
		if (parts.length === 3 && parts[0] === "wsl") {
			const [, distro, name] = parts;
			return catalog.find((entry) => entry.kind === "wsl" && entry.distro === distro && entry.name === name) ?? null;
		}
		return null;
	}
	const matches = catalog.filter((entry) => entry.name === value);
	if (matches.length === 1) return matches[0];
	return null;
}
/** Whether an entry can serve a slot (its language must be present). */
function slotCompatible(slot, entry) {
	if (slot === "python") return entry.python !== null;
	if (slot === "r") return entry.rscript !== null;
	return true;
}
/** Human-readable one-line summary of an entry. */
function describeEntry(entry) {
	const badges = [entry.python !== null ? "python" : null, entry.rscript !== null ? "R" : null].filter((badge) => badge !== null);
	return `${entry.kind === "wsl" ? `wsl:${entry.distro}:${entry.name}` : `${entry.kind}:${entry.name}`} — ${entry.prefix}${badges.length > 0 ? ` (${badges.join(", ")})` : ""}`;
}
/** Render the runtime-context block for one selection. */
function selectionContext(selection) {
	const blocks = [];
	const python = selection.python;
	if (python !== void 0) {
		const run = python.pythonCommand ?? python.python ?? `python from ${python.prefix}`;
		const lines = [
			`Session Python env (user-selected): ${python.name} (${python.kind}).`,
			`- python: ${run}`,
			`Use it for all Python work in this session: ${run} script.py (absolute path, no activation needed).`
		];
		if (python.kind === "wsl") lines.push("- WSL: pass Windows paths as /mnt/c/<drive>/<path>.");
		blocks.push(lines.join("\n"));
	}
	const r = selection.r;
	if (r !== void 0) {
		const run = r.rscriptCommand ?? r.rscript ?? `Rscript from ${r.prefix}`;
		const lines = [
			`Session R env (user-selected): ${r.name} (${r.kind}).`,
			`- Rscript: ${run}`,
			`Use it for all R work in this session: ${run} -e / -f file.R.`
		];
		if (r.kind === "wsl") lines.push("- WSL: pass Windows paths as /mnt/c/<drive>/<path>.");
		blocks.push(lines.join("\n"));
	}
	const cli = selection.cli;
	if (cli !== void 0) {
		const lines = [`Session CLI env (user-selected): ${cli.name} (${cli.kind}) — prepend its dirs to PATH for shell tools:`, cliPathGuidance(cli)];
		blocks.push(lines.join("\n"));
	}
	return blocks.join("\n\n");
}
/** Usage text for the /env command. */
function envHelpText() {
	return [
		"/env 会话环境选择器（conda / 独立 R / WSL / 手动路径）",
		"  /env                     查看当前选择",
		"  /env help                显示本帮助",
		"  /env python=scRNAv2      设置 Python 槽位（conda 名 / 独立R名 / wsl:发行版:名 / custom:名）",
		"  /env r=R-4.4.1           设置 R 槽位",
		"  /env cli=base            设置 CLI 槽位（PATH 前缀）",
		"  /env python= /env r= /env cli=   清空对应槽位",
		"  /env list [关键词]        列出全部可用环境",
		"  /env add <路径>           把解释器或安装目录记入本机缓存",
		"  /env unpin custom:<名>    从本机缓存移除一条手动路径",
		"  /env clear               清空全部选择",
		"  /env wsl                 重新扫描 WSL（仅 Windows；可能较慢，含发行版冷启动）"
	].join("\n");
}
/** Display path of the machine-local pin cache. */
function pinnedCacheHint() {
	return `~/.dsh/${PINNED_FILE_NAME}`;
}
/**
* PATH-prefix guidance for the CLI slot, matching the host shell family.
* @param entry - selected CLI environment.
* @param platform - Node platform string; defaults to `process.platform`.
* @returns one copy-pasteable PATH line for the model snapshot.
*/
function cliPathGuidance(entry, platform = process.platform) {
	if (entry.kind === "wsl") return `- wsl.exe -d ${entry.distro} -- bash -lc 'export PATH="${entry.prefix}/bin:$PATH"'`;
	if (isWindowsHost(platform)) return `- pwsh: $env:PATH = "${entry.prefix};${entry.prefix}\\Scripts;${entry.prefix}\\Library\\bin;" + $env:PATH`;
	return `- bash: export PATH="${entry.prefix}/bin:${entry.prefix}:$PATH"`;
}
/** The registered `session_env` tool name. */
const SESSION_ENV_TOOL = "session_env";
/** Build one successful Remote reply branch. */
function success(value) {
	return Object.freeze({
		ok: true,
		value
	});
}
/** Build one rejected Remote reply branch. */
function rejected(error) {
	return Object.freeze({
		ok: false,
		error: Object.freeze(error)
	});
}
/**
* Install the envsel command, prompt context, shell facts, and model tool.
* @param ctx - registrant context carrying every injected service.
* @param config - deployment's explicit envsel policy.
*/
async function apply(ctx, config) {
	const resolved = resolveConfig(config);
	const discoverConfig = {
		condaCommand: resolved.condaCommand,
		standaloneRRoots: resolved.standaloneRRoots,
		wslEnabled: resolved.wslEnabled,
		probeTimeoutMs: resolved.probeTimeoutMs
	};
	let catalog = null;
	let catalogPending = null;
	async function loadCatalog() {
		const discovered = await discoverAll(ctx, discoverConfig);
		const pinned = await resolvePinnedEntries(ctx);
		const seen = new Set(discovered.entries.map((entry) => `${entry.kind}|${entry.distro ?? ""}|${entry.name}|${entry.prefix}`));
		const entries = [...discovered.entries];
		for (const entry of pinned.entries) {
			const key = `${entry.kind}|${entry.distro ?? ""}|${entry.name}|${entry.prefix}`;
			if (seen.has(key)) continue;
			seen.add(key);
			entries.push(entry);
		}
		return {
			entries,
			warnings: [...discovered.warnings, ...pinned.warnings]
		};
	}
	function getCatalog(force) {
		if (catalogPending !== null) return catalogPending;
		if (!force && catalog !== null && Date.now() - catalog.at < resolved.listTtlMs) return Promise.resolve({
			entries: catalog.entries,
			warnings: catalog.warnings
		});
		catalogPending = loadCatalog().then((result) => {
			catalog = {
				at: Date.now(),
				entries: result.entries,
				warnings: result.warnings
			};
			return {
				entries: result.entries,
				warnings: result.warnings
			};
		}).finally(() => {
			catalogPending = null;
		});
		return catalogPending;
	}
	async function pinPath(path) {
		const probed = await probeCustomPath(ctx, path);
		if (!probed.ok) return rejected({
			code: probed.code,
			path: path.trim()
		});
		await appendPinnedPath(ctx, path);
		const result = await getCatalog(true);
		return success({
			entries: result.entries,
			warnings: result.warnings
		});
	}
	async function unpinPath(address) {
		if (!await removePinnedPath(ctx, address, (await getCatalog(false)).entries)) return rejected({
			code: "entry-not-found",
			address
		});
		const result = await getCatalog(true);
		return success({
			entries: result.entries,
			warnings: result.warnings
		});
	}
	const selections = /* @__PURE__ */ new Map();
	function liveSession(sessionId) {
		return ctx.sessions.get(sessionId);
	}
	function selectionOfSession(sessionId) {
		return selections.get(String(sessionId)) ?? {};
	}
	function selectionOf(agent) {
		return selectionOfSession(agent.session.header.id);
	}
	async function setSelectionForSession(sessionId, next) {
		if (isEmptySelection(next)) selections.delete(String(sessionId));
		else selections.set(String(sessionId), next);
		await writeSessionSelection(ctx, sessionId, next);
	}
	async function setSelection(agent, next) {
		await setSelectionForSession(agent.session.header.id, next);
	}
	function copySelection(agent) {
		return { ...selectionOf(agent) };
	}
	{
		const stored = await readAllSelections(ctx);
		for (const [key, value] of Object.entries(stored)) selections.set(key, value);
	}
	new EnvselRemoteService(ctx, {
		list: async () => {
			const result = await getCatalog(false);
			return {
				entries: result.entries,
				warnings: result.warnings
			};
		},
		get: (sessionId) => {
			if (liveSession(sessionId) === void 0) return rejected({
				code: "session-not-found",
				sessionId
			});
			return success({ selection: selectionOfSession(sessionId) });
		},
		pin: (path) => pinPath(path),
		unpin: (address) => unpinPath(address),
		set: async (sessionId, slot, address) => {
			if (liveSession(sessionId) === void 0) return rejected({
				code: "session-not-found",
				sessionId
			});
			if (!ENV_SLOTS.includes(slot)) return rejected({
				code: "unknown-slot",
				sessionId,
				slot
			});
			const next = { ...selectionOfSession(sessionId) };
			if (address.length === 0) delete next[slot];
			else {
				const entry = resolveEntry((await getCatalog(false)).entries, address);
				if (entry === null) return rejected({
					code: "entry-not-found",
					sessionId,
					slot,
					address
				});
				if (!slotCompatible(slot, entry)) return rejected({
					code: "incompatible",
					sessionId,
					slot,
					address
				});
				next[slot] = entry;
			}
			await setSelectionForSession(sessionId, next);
			return success({ selection: next });
		}
	});
	ctx.effect(() => ctx.commands.register({
		name: "env",
		description: "选择本会话的 conda / 独立 R / WSL / 手动路径环境（如 /env python=scRNAv2 r=R-4.4.1）",
		input: { hint: "python=scRNAv2 r=R-4.4.1 | list [过滤] | add <路径> | unpin custom:<名> | clear | wsl | help" },
		handler: (invocation) => handleEnvLine(invocation)
	}), "envsel: /env command");
	async function handleEnvLine(invocation) {
		const action = parseEnvLine(invocation.rawInput);
		try {
			switch (action.kind) {
				case "error": return {
					kind: "error",
					text: action.text
				};
				case "help": return {
					kind: "success",
					text: envHelpText()
				};
				case "show": return {
					kind: "success",
					text: renderSelection(selectionOf(invocation.agent))
				};
				case "clear":
					await setSelection(invocation.agent, {});
					return {
						kind: "success",
						text: "已清空全部环境选择。"
					};
				case "wsl": {
					if (!isWindowsHost()) return {
						kind: "success",
						text: "当前宿主不是 Windows，已跳过 WSL 扫描。可用 /env add <路径> 手动添加环境。"
					};
					const result = await getCatalog(true);
					const wslEntries = result.entries.filter((entry) => entry.kind === "wsl");
					return {
						kind: "success",
						text: [
							`WSL 扫描完成（${wslEntries.length} 个条目）:`,
							...wslEntries.map((entry) => `  ${describeEntry(entry)}`),
							...wslEntries.length === 0 ? ["  （未发现 WSL 环境）"] : [],
							...result.warnings.map((warning) => `  ⚠ ${warning}`)
						].join("\n")
					};
				}
				case "add": {
					const pinned = await pinPath(action.path);
					if (!pinned.ok) {
						const reason = pinned.error.code === "invalid-path" ? "路径为空" : pinned.error.code === "not-found" ? "路径不存在" : "未找到 python / Rscript";
						return {
							kind: "error",
							text: `无法添加 "${action.path}"：${reason}`
						};
					}
					const added = pinned.value.entries.filter((entry) => entry.kind === "custom");
					return {
						kind: "success",
						text: [`已记入本机缓存（${pinnedCacheHint()}）:`, ...added.map((entry) => `  ${describeEntry(entry)}`)].join("\n")
					};
				}
				case "unpin":
					if (!(await unpinPath(action.address)).ok) return {
						kind: "error",
						text: `未找到手动路径 "${action.address}"`
					};
					return {
						kind: "success",
						text: `已从本机缓存移除 ${action.address}`
					};
				case "list": {
					const result = await getCatalog(false);
					const filter = action.filter.toLowerCase();
					const entries = filter.length === 0 ? result.entries : result.entries.filter((entry) => entry.name.toLowerCase().includes(filter) || entry.prefix.toLowerCase().includes(filter));
					return {
						kind: "success",
						text: [
							`可用环境（${entries.length} 个${filter.length > 0 ? `，过滤 "${action.filter}"` : ""}）:`,
							...entries.map((entry) => `  ${describeEntry(entry)}`),
							...result.warnings.map((warning) => `  ⚠ ${warning}`)
						].join("\n")
					};
				}
				case "assign": {
					const result = await getCatalog(false);
					const next = copySelection(invocation.agent);
					const applied = [];
					for (const assignment of action.assignments) {
						if (assignment.value.length === 0) {
							delete next[assignment.slot];
							applied.push(`${ENV_SLOT_LABELS[assignment.slot]} → 未设置`);
							continue;
						}
						const entry = resolveEntry(result.entries, assignment.value);
						if (entry === null) {
							const candidates = result.entries.filter((candidate) => candidate.name === assignment.value);
							const hint = candidates.length > 0 ? `名称有歧义，请用完整地址: ${candidates.map(describeEntry).join("；")}` : `未找到 "${assignment.value}"，可用 /env list 查看`;
							return {
								kind: "error",
								text: `${ENV_SLOT_LABELS[assignment.slot]} 槽位设置失败: ${hint}`
							};
						}
						if (!slotCompatible(assignment.slot, entry)) return {
							kind: "error",
							text: `${ENV_SLOT_LABELS[assignment.slot]} 槽位不能使用 ${describeEntry(entry)}（缺少该语言解释器）`
						};
						next[assignment.slot] = entry;
						applied.push(`${ENV_SLOT_LABELS[assignment.slot]} → ${entry.name} (${entry.kind})`);
					}
					await setSelection(invocation.agent, next);
					return {
						kind: "success",
						text: `已更新:\n${applied.map((line) => `  ${line}`).join("\n")}`
					};
				}
			}
		} catch (error) {
			return {
				kind: "error",
				text: `envsel: ${error instanceof Error ? error.message : String(error)}`
			};
		}
	}
	/** Render the current selection as command text. */
	function renderSelection(selection) {
		if (isEmptySelection(selection)) return ["当前未选择任何环境。", "用法: /env python=scRNAv2 r=R-4.4.1 cli=base，/env list 查看全部可用环境。"].join("\n");
		const lines = ["当前会话环境:"];
		for (const slot of ENV_SLOTS) {
			const entry = selection[slot];
			lines.push(entry === void 0 ? `  ${ENV_SLOT_LABELS[slot]} → （未设置）` : `  ${ENV_SLOT_LABELS[slot]} → ${describeEntry(entry)}`);
		}
		lines.push("用法: /env help");
		return lines.join("\n");
	}
	const DSH_ENV_PYTHON = "DSH_ENV_PYTHON";
	const DSH_ENV_RSCRIPT = "DSH_ENV_RSCRIPT";
	const DSH_ENV_CLI_PREFIX = "DSH_ENV_CLI_PREFIX";
	const contributor = {
		name: "envsel",
		variables: {
			[DSH_ENV_PYTHON]: { description: "Absolute python invocation of the session's selected Python environment." },
			[DSH_ENV_RSCRIPT]: { description: "Absolute Rscript invocation of the session's selected R environment." },
			[DSH_ENV_CLI_PREFIX]: { description: "Install prefix of the session's selected CLI environment (wsl:distro:prefix for WSL)." }
		},
		resolve(execution) {
			const agent = execution?.agent;
			if (agent === void 0) return {};
			const selection = selectionOf(agent);
			const out = {};
			const python = selection.python;
			if (python?.pythonCommand !== void 0 && python.pythonCommand !== null) out[DSH_ENV_PYTHON] = python.pythonCommand;
			const r = selection.r;
			if (r?.rscriptCommand !== void 0 && r.rscriptCommand !== null) out[DSH_ENV_RSCRIPT] = r.rscriptCommand;
			const cli = selection.cli;
			if (cli !== void 0) out[DSH_ENV_CLI_PREFIX] = cli.kind === "wsl" ? `wsl:${cli.distro}:${cli.prefix}` : cli.prefix;
			return out;
		}
	};
	ctx.effect(() => ctx.shellEnv.register(contributor), "envsel: shell facts");
	if (resolved.registerTool) ctx.tools.register(defineTool({
		name: SESSION_ENV_TOOL,
		description: "Manage the environments selected for the current session (Jupyter-kernel-style): per-language slots python/r/cli, each holding one conda, standalone R, WSL, or user-pinned custom entry. action=list enumerates all entries; action=get returns the current selection; action=set assigns one slot (slot required, name=\"\" clears that slot; kind is an optional disambiguation hint); action=pin remembers a host interpreter/install path in the machine-local cache (name = path); action=unpin forgets a cached path (name = custom:<name> or the original path). Takes effect from the next model turn via DSH_ENV_* shell variables.",
		parameters: {
			action: {
				type: "string",
				required: true,
				enum: [
					"list",
					"get",
					"set",
					"pin",
					"unpin"
				],
				description: "Operation to perform."
			},
			slot: {
				type: "string",
				enum: [
					"python",
					"r",
					"cli"
				],
				description: "Slot to assign for action=set."
			},
			kind: {
				type: "string",
				enum: [
					"conda",
					"r",
					"wsl",
					"custom"
				],
				description: "Entry-kind disambiguation hint for action=set."
			},
			name: {
				type: "string",
				description: "Entry name for action=set (empty clears); host path for action=pin; custom:<name> or path for action=unpin."
			}
		},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		async execute(args, exec) {
			const action = args.action;
			if (action === "list") {
				const result = await getCatalog(false);
				return {
					entries: [...result.entries],
					warnings: [...result.warnings]
				};
			}
			if (action === "pin") {
				const path = typeof args.name === "string" ? args.name.trim() : "";
				const pinned = await pinPath(path);
				if (!pinned.ok) throw new Error(`session_env: 无法添加路径 ${JSON.stringify(path)}（${pinned.error.code}）`);
				return {
					entries: [...pinned.value.entries],
					warnings: [...pinned.value.warnings]
				};
			}
			if (action === "unpin") {
				const address = typeof args.name === "string" ? args.name.trim() : "";
				const removed = await unpinPath(address);
				if (!removed.ok) throw new Error(`session_env: 未找到手动路径 ${JSON.stringify(address)}`);
				return {
					entries: [...removed.value.entries],
					warnings: [...removed.value.warnings]
				};
			}
			if (exec.agent === void 0) throw new Error("session_env requires an owning agent session");
			const agent = exec.agent;
			if (action === "get") return { selection: selectionOf(agent) };
			if (action === "set") {
				const slot = args.slot;
				if (slot === void 0 || !ENV_SLOTS.includes(slot)) throw new Error(`session_env: unknown slot ${JSON.stringify(slot)} (use python | r | cli)`);
				const name = typeof args.name === "string" ? args.name.trim() : "";
				const next = copySelection(agent);
				if (name.length === 0) delete next[slot];
				else {
					const result = await getCatalog(false);
					const kindHint = args.kind;
					const entry = typeof kindHint === "string" && kindHint.length > 0 ? result.entries.find((candidate) => candidate.kind === kindHint && candidate.name === name) ?? null : resolveEntry(result.entries, name);
					if (entry === null) throw new Error(`session_env: 未找到环境 ${JSON.stringify(name)}（可用 /env list 或 session_env list 查看）`);
					if (!slotCompatible(slot, entry)) throw new Error(`session_env: ${slot} 槽位不能使用 ${describeEntry(entry)}（缺少该语言解释器）`);
					next[slot] = entry;
				}
				await setSelection(agent, next);
				return { selection: next };
			}
			throw new Error(`session_env: unknown action ${JSON.stringify(action)}`);
		},
		presentCall: (args) => ({
			card: "generic",
			title: "Session environment",
			kind: "other",
			rawInput: args.action === "set" || args.action === "pin" || args.action === "unpin" ? `${String(args.action)} ${String(args.slot ?? "")} ${String(args.name ?? "")}`.trim() : String(args.action)
		})
	}));
}
//#endregion
export { CONDA_COMMAND_DEFAULT, EnvselRemoteService, LIST_TTL_MS_DEFAULT, PINNED_FILE_NAME, PROBE_TIMEOUT_MS_DEFAULT, SESSION_ENV_TOOL, STATE_FILE_NAME, apply, cliPathGuidance, defaultStandaloneRRoots, describeEntry, envHelpText, inject, isWindowsHost, joinPath, name, parseEnvLine, parsePinnedDocument, parseStateDocument, prefixFromRscript, probeCustomPath, selectionContext, serializePinnedDocument, serializeStateDocument, slotCompatible };

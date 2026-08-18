/**
 * Home-directory file writes for a downstream plugin. The sandbox's
 * `workspace-write` policy confines every `ctx.fs` mutation to the session
 * workspace root plus the platform temp areas, which does not cover the DSH
 * home (`~/.dsh`) where this plugin keeps its own durable state. Passing an
 * explicit policy rooted at the DSH home keeps the write policy-enforced
 * (containment under `~/.dsh`) while letting the plugin persist its own files.
 *
 * @module @beihaizb/dsh-envsel/home-io
 */
import { dshHomePath } from '@deepseek-ai/dsh-home-paths';
/**
 * Write one file under the harness home with a `workspace-write` policy
 * confined to the DSH home root.
 * @param ctx - host context carrying the sandboxed `fs` service.
 * @param target - resolved target (must live under the harness home).
 * @param content - the full new file content.
 */
export async function writeHomeFile(ctx, target, content) {
    await ctx.fs.writeText(target, content, undefined, undefined, {
        mode: 'workspace-write',
        workspaceRoot: dshHomePath(),
    });
}
//# sourceMappingURL=home-io.js.map
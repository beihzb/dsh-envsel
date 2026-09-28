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
import type { z } from 'zod';
/** The strict-codec shape DSH 0.1.7-rc.1 and newer consume. */
export interface StrictCodec<Schema extends z.ZodType> {
    /** Strict-codec discriminator. */
    readonly mode: 'strict';
    /** Canonical type symbol the schema was generated from. */
    readonly typeSymbol: string;
    /** Schema factory, materialised lazily by the typert registry. */
    readonly create: () => Schema;
}
/**
 * Build one strict codec for a generated parameter or result schema.
 * @param typeSymbol - canonical type symbol the schema was generated from.
 * @param schema - the generated zod schema for this parameter or result.
 * @returns a codec whose `create()` factory yields that schema.
 */
export declare function strictCodec<Schema extends z.ZodType>(typeSymbol: string, schema: Schema): StrictCodec<Schema>;
//# sourceMappingURL=strict-codec.d.ts.map
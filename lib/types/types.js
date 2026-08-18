/**
 * Shared envsel vocabulary: environment entry shapes and language slots.
 * Client-safe — nothing here reaches a Host-only symbol.
 *
 * @module dsh-envsel/types
 */
/** Every supported slot, in canonical display order. */
export const ENV_SLOTS = ['python', 'r', 'cli'];
/** Human-readable slot labels (product copy is Chinese). */
export const ENV_SLOT_LABELS = {
    python: 'Python',
    r: 'R',
    cli: 'CLI 工具',
};
/** True when the selection contains no slot assignments. */
export function isEmptySelection(selection) {
    return ENV_SLOTS.every(slot => selection[slot] === undefined);
}
/** Stable reference string of an entry, used for display and matching. */
export function entryAddress(entry) {
    return entry.kind === 'wsl'
        ? `wsl:${String(entry.distro)}:${entry.name}`
        : `${entry.kind}:${entry.name}`;
}
/** Whether a reference matches an entry (name-only or exact address). */
export function refMatchesEntry(ref, entry) {
    if (ref.kind !== entry.kind || ref.name !== entry.name)
        return false;
    if (ref.kind !== 'wsl')
        return true;
    return ref.distro === entry.distro;
}
//# sourceMappingURL=types.js.map
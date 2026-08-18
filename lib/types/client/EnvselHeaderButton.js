import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The session header's environment selector: one button that opens a panel of
 * per-language dropdowns (Python / R / CLI tools) over the `envsel` Remote.
 * Each slot holds one first-priority environment; the selection persists in
 * the machine-local envsel store and is shared with the `/env` command, the
 * `session_env` tool, and the DSH_ENV_* shell facts, so switching here is
 * exactly switching anywhere else.
 *
 * The catalog is only fetched when the panel first opens: probing conda and
 * WSL takes seconds, and a closed header must not pay that cost for every
 * session.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconCheckOutline14, IconChevronDownOutline14, IconCloseFill14 } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './EnvselHeaderButton.module.css';
/** Canonical slot display order. */
const SLOT_ORDER = ['python', 'r', 'cli'];
/** Slot label locale keys, keyed by slot. */
const SLOT_LABEL_KEYS = {
    python: 'slotPython',
    r: 'slotR',
    cli: 'slotCli',
};
/** Whether an entry can serve a slot (its language must be present). */
function slotCompatible(slot, entry) {
    if (slot === 'python')
        return entry.python !== null;
    if (slot === 'r')
        return entry.rscript !== null;
    return true;
}
/** Stable entry address, mirroring the host's `entryAddress`. */
function entryAddress(entry) {
    return entry.kind === 'wsl'
        ? `wsl:${String(entry.distro)}:${entry.name}`
        : `${entry.kind}:${entry.name}`;
}
/** Compact kind/distro badge for one entry. */
function kindLabel(entry, t) {
    if (entry.kind === 'wsl')
        return `${t('kindWsl')} · ${String(entry.distro)}`;
    if (entry.kind === 'custom')
        return t('kindCustom');
    return entry.kind === 'r' ? t('kindR') : t('kindConda');
}
/** Localized human message for one business failure code. */
function messageOf(code, t) {
    switch (code) {
        case 'session-not-found': return t('errorSession');
        case 'entry-not-found': return t('errorEntry');
        case 'incompatible': return t('errorIncompatible');
        case 'unknown-slot': return t('errorUnknownSlot');
        case 'invalid-path': return t('errorInvalidPath');
        case 'not-found': return t('errorNotFound');
        case 'no-interpreter': return t('errorNoInterpreter');
        default: return t('errorTransport');
    }
}
/**
 * Render this session's environment selector.
 * @param props - runtime slot currency, the translator, and the Remote face.
 * @returns the trigger button and its per-language panel.
 */
export function EnvselHeaderButton({ sessionId, t, listCatalog, getSelection, setSelection, pinPath, unpinPath, }) {
    const [selection, setSelectionState] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [open, setOpen] = useState(false);
    const [catalog, setCatalog] = useState(null);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState(null);
    const [busySlot, setBusySlot] = useState(null);
    const [actionError, setActionError] = useState(null);
    const [draftPath, setDraftPath] = useState('');
    const [pinBusy, setPinBusy] = useState(false);
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    // Seed the summary from the folded session selection; a failed read stays
    // retryable from the panel.
    useEffect(() => {
        let current = true;
        void getSelection(sessionId).then((result) => {
            if (!current)
                return;
            if (result.ok) {
                setSelectionState(result.value.selection);
                setLoadError(null);
            }
            else {
                setLoadError(messageOf(result.error.code, t));
            }
        });
        return () => { current = false; };
    }, [getSelection, sessionId, t]);
    // Close on outside pointerdown and Escape, like the other header popovers.
    useEffect(() => {
        if (!open)
            return;
        const closeOutside = (event) => {
            if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => { document.removeEventListener('pointerdown', closeOutside); };
    }, [open]);
    const loadCatalog = () => {
        if (catalogLoading)
            return;
        setCatalogLoading(true);
        setCatalogError(null);
        void listCatalog().then((result) => {
            setCatalogLoading(false);
            if (result.ok)
                setCatalog(result.value);
            else
                setCatalogError(messageOf(result.error.code, t));
        });
    };
    const reloadSelection = () => {
        setLoadError(null);
        void getSelection(sessionId).then((result) => {
            if (result.ok)
                setSelectionState(result.value.selection);
            else
                setLoadError(messageOf(result.error.code, t));
        });
    };
    const onToggle = () => {
        const next = !open;
        setOpen(next);
        if (next && catalog === null)
            loadCatalog();
    };
    const submitPin = () => {
        const path = draftPath.trim();
        if (path.length === 0 || pinBusy)
            return;
        setPinBusy(true);
        setActionError(null);
        void pinPath(path).then((result) => {
            setPinBusy(false);
            if (result.ok) {
                setCatalog(result.value);
                setDraftPath('');
            }
            else {
                setActionError(messageOf(result.error.code, t));
            }
        });
    };
    const forget = (address) => {
        if (pinBusy)
            return;
        setPinBusy(true);
        setActionError(null);
        void unpinPath(address).then((result) => {
            setPinBusy(false);
            if (result.ok)
                setCatalog(result.value);
            else
                setActionError(messageOf(result.error.code, t));
        });
    };
    const choose = (slot, address) => {
        if (busySlot !== null)
            return;
        setBusySlot(slot);
        setActionError(null);
        void setSelection(sessionId, slot, address).then((result) => {
            setBusySlot(null);
            if (result.ok)
                setSelectionState(result.value.selection);
            else
                setActionError(messageOf(result.error.code, t));
        });
    };
    const onKeyDown = (event) => {
        if (event.key !== 'Escape' || !open)
            return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
    };
    const summary = useMemo(() => {
        if (selection === null)
            return t('summaryNone');
        const parts = SLOT_ORDER
            .filter(slot => selection[slot] !== undefined)
            .map(slot => `${t(SLOT_LABEL_KEYS[slot])}: ${selection[slot].name}`);
        return parts.length === 0 ? t('summaryNone') : parts.join(' · ');
    }, [selection, t]);
    return (_jsxs("div", { ref: rootRef, className: css.root, onKeyDown: onKeyDown, children: [_jsxs("button", { ref: triggerRef, type: "button", className: css.trigger, "aria-expanded": open, onClick: onToggle, children: [_jsx("span", { className: css.triggerLabel, children: t('trigger') }), _jsx("span", { className: loadError === null ? css.summary : css.summaryError, title: loadError ?? summary, children: loadError ?? summary }), _jsx(IconChevronDownOutline14, { className: open ? css.chevronOpen : undefined, "aria-hidden": "true" })] }), open ? (_jsxs("div", { className: css.panel, role: "group", "aria-label": t('panelAria'), children: [loadError !== null ? (_jsxs("div", { className: css.banner, role: "alert", children: [_jsx("span", { children: loadError }), _jsx("button", { type: "button", className: css.retry, onClick: reloadSelection, children: t('retry') })] })) : null, actionError !== null ? _jsx("p", { className: css.banner, role: "alert", children: t('actionError', { message: actionError }) }) : null, catalogLoading ? _jsx("p", { className: css.status, children: t('catalogLoading') }) : null, catalogError !== null ? _jsx("p", { className: css.status, role: "alert", children: catalogError }) : null, _jsxs("form", { className: css.addForm, onSubmit: (event) => {
                            event.preventDefault();
                            submitPin();
                        }, children: [_jsx("label", { className: css.addLabel, htmlFor: "envsel-add-path", children: t('addPathLabel') }), _jsxs("div", { className: css.addRow, children: [_jsx("input", { id: "envsel-add-path", className: css.addInput, type: "text", value: draftPath, placeholder: t('addPathPlaceholder'), "aria-label": t('addPathAria'), disabled: pinBusy, onChange: (event) => setDraftPath(event.target.value) }), _jsx("button", { type: "submit", className: css.addSubmit, disabled: pinBusy || draftPath.trim().length === 0, children: t('addPathSubmit') })] })] }), SLOT_ORDER.map((slot) => {
                        const current = selection?.[slot];
                        return (_jsxs("section", { className: css.slot, "data-slot": slot, children: [_jsxs("div", { className: css.slotHeading, children: [_jsx("h4", { className: css.slotTitle, children: t(SLOT_LABEL_KEYS[slot]) }), current !== undefined ? (_jsxs("button", { type: "button", className: css.clear, "aria-label": t('clearSlotAria', { slot: t(SLOT_LABEL_KEYS[slot]) }), disabled: busySlot === slot, onClick: () => choose(slot, ''), children: [_jsx(IconCloseFill14, { "aria-hidden": "true" }), _jsxs("span", { children: [t('clear'), " ", current.name] })] })) : null] }), current === undefined && catalog !== null ? (_jsx("p", { className: css.emptySlot, children: t('emptySlot') })) : null, catalog !== null
                                    ? (_jsx("ul", { className: css.entries, children: catalog.entries.filter(entry => slotCompatible(slot, entry)).map((entry) => {
                                            const address = entryAddress(entry);
                                            const selected = current !== undefined && entryAddress(current) === address;
                                            return (_jsxs("li", { className: css.entryRow, children: [_jsxs("button", { type: "button", className: selected ? `${css.entry} ${css.entrySelected}` : css.entry, "aria-pressed": selected, "aria-label": t('entryAria', { slot: t(SLOT_LABEL_KEYS[slot]), name: entry.name }), disabled: busySlot === slot, onClick: () => choose(slot, address), children: [_jsx(IconCheckOutline14, { className: selected ? css.check : css.checkHidden, "aria-hidden": "true" }), _jsx("span", { className: css.entryName, children: entry.name }), _jsx("span", { className: css.entryKind, children: kindLabel(entry, t) })] }), entry.kind === 'custom' && slot === 'cli' ? (_jsx("button", { type: "button", className: css.unpin, "aria-label": t('unpinAria', { name: entry.name }), disabled: pinBusy, onClick: () => forget(address), children: t('clear') })) : null] }, address));
                                        }) }))
                                    : null] }, slot));
                    })] })) : null] }));
}
//# sourceMappingURL=EnvselHeaderButton.js.map
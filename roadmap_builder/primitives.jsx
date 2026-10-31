/* global React, ReactDOM */

// Small reusable bits used across screens.

function Icon({ name, size = 16, ...rest }) {
  const stroke = "currentColor";
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", ...rest };
  switch (name) {
    case "plus":     return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case "check":    return <svg {...props}><path d="M5 12l4 4L19 7"/></svg>;
    case "x":        return <svg {...props}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case "arrow-right": return <svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case "arrow-left":  return <svg {...props}><path d="M19 12H5M11 5l-7 7 7 7"/></svg>;
    case "chevron-right": return <svg {...props}><path d="M9 6l6 6-6 6"/></svg>;
    case "chevron-down":  return <svg {...props}><path d="M6 9l6 6 6-6"/></svg>;
    case "sparkles": return <svg {...props}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 14l.7 2.1L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-.9z"/></svg>;
    case "book":     return <svg {...props}><path d="M4 5a2 2 0 012-2h12v17H6a2 2 0 01-2-2z"/><path d="M4 18a2 2 0 002 2h12"/><path d="M8 7h7M8 11h7"/></svg>;
    case "blank":    return <svg {...props}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M9 4v16"/></svg>;
    case "import":   return <svg {...props}><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>;
    case "upload":   return <svg {...props}><path d="M12 21V9"/><path d="M7 14l5-5 5 5"/><path d="M5 3h14"/></svg>;
    case "download": return <svg {...props}><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>;
    case "edit":     return <svg {...props}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z"/></svg>;
    case "trash":    return <svg {...props}><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>;
    case "info":     return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 8v0M12 11v5"/></svg>;
    case "help":     return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 4M12 17v0"/></svg>;
    case "grid":     return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    case "search":   return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
    case "filter":   return <svg {...props}><path d="M3 5h18M6 12h12M10 19h4"/></svg>;
    case "save":     return <svg {...props}><path d="M5 3h11l3 3v15a0 0 0 010 0H5a0 0 0 010 0V3z"/><path d="M7 3v6h9V3"/><path d="M7 21v-7h10v7"/></svg>;
    case "undo":     return <svg {...props}><path d="M9 14l-5-5 5-5"/><path d="M4 9h11a5 5 0 010 10h-2"/></svg>;
    case "redo":     return <svg {...props}><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h2"/></svg>;
    case "share":    return <svg {...props}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>;
    case "lightbulb":return <svg {...props}><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 00-3 11c.6.5 1 1.2 1 2v1h4v-1c0-.8.4-1.5 1-2a6 6 0 00-3-11z"/></svg>;
    case "wand":     return <svg {...props}><path d="M3 21l8-8"/><path d="M14 5l3 3"/><path d="M19 3v3M21 5h-3"/><path d="M11 13l4-4 5 5-4 4z"/></svg>;
    case "star":     return <svg {...props}><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>;
    case "tag":      return <svg {...props}><path d="M20 12V4h-8L3 13l8 8 9-9z"/><circle cx="15" cy="9" r="1.5"/></svg>;
    case "rows":     return <svg {...props}><rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="11" width="18" height="5" rx="1"/></svg>;
    case "cols":     return <svg {...props}><rect x="4" y="3" width="5" height="18" rx="1"/><rect x="11" y="3" width="5" height="18" rx="1"/><rect x="18" y="3" width="3" height="18" rx="1"/></svg>;
    case "alert-triangle": return <svg {...props}><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18v0"/></svg>;
    case "pencil":   return <svg {...props}><path d="M14 4l6 6"/><path d="M3 21l4-1L20 7l-3-3L4 17z"/></svg>;
    case "settings": return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>;
    // Lucide icons (ISC licence): sliders-horizontal, notebook-pen, lightbulb, file-text
    case "sliders-horizontal": return <svg {...props}><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/></svg>;
    case "notebook-pen": return <svg {...props}><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4M2 10h4M2 14h4M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>;
    case "lightbulb-lucide": return <svg {...props}><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/></svg>;
    case "file-text": return <svg {...props}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/></svg>;
    case "clock":    return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "keyboard": return <svg {...props}><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M6 10h0M10 10h0M14 10h0M18 10h0M6 14h0M18 14h0M10 14h4"/></svg>;
    case "compass":  return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>;
    case "minus":    return <svg {...props}><path d="M6 12h12"/></svg>;
    case "chevron-left": return <svg {...props}><path d="M15 6l-6 6 6 6"/></svg>;
    case "type":     return <svg {...props}><path d="M5 6h14M12 6v13M9 19h6"/></svg>;
    case "flag":     return <svg {...props}><path d="M6 21V4M6 4.5h11l-2 3.5 2 3.5H6"/></svg>;
    case "span":     return <svg {...props}><path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/></svg>;
    case "shield":   return <svg {...props}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>;
    case "folder":   return <svg {...props}><path d="M3 6.5V19h18V8.5h-9L10 6.5z"/></svg>;
    case "layers":   return <svg {...props}><path d="M12 3.5l9 4.5-9 4.5L3 8z"/><path d="M3 12.5l9 4.5 9-4.5"/></svg>;
    case "inbox":    return <svg {...props}><path d="M3 13l2.5-8h13L21 13v6H3z"/><path d="M3 13h5l1.5 2h5L16 13h5"/></svg>;
    case "eye":      return <svg {...props}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case "quote":    return <svg {...props}><path d="M5 9h5v5c0 2-1.5 3.5-3.5 3.5M14 9h5v5c0 2-1.5 3.5-3.5 3.5"/></svg>;
    case "lock":     return <svg {...props}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>;
    case "more":     return <svg {...props}><path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={2.6}/></svg>;
    case "copy":     return <svg {...props}><path d="M9 9h11v11H9zM5 15H4V4h11v1"/></svg>;
    case "list":     return <svg {...props}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>;
    case "move":     return <svg {...props}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM10 13h6M13 10l3 3-3 3"/></svg>;
    case "open":     return <svg {...props}><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>;
    case "history":  return <svg {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/></svg>;
    case "db":       return <svg {...props}><path d="M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg>;
    case "item":     return <svg {...props}><path d="M4 6h16M4 12h10M4 18h7"/></svg>;
    case "offline":  return <svg {...props}><path d="M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.5a10 10 0 0 1 4-2.2M16.5 10.9a10 10 0 0 1 2.5 1.6M8.5 16a5 5 0 0 1 7 0M12 19.5v0M3 3l18 18"/></svg>;
    default: return null;
  }
}

// Help icon: hover previews the explanation, click (or Enter/Space) pins it, Escape or a click elsewhere closes it.
// The popover is portalled so modals and scrolling panes never clip it.
function InfoDot({ tip, title, label = "More information" }) {
  const [open, setOpen] = React.useState(false); // false | "hover" | "pinned"
  const [pos, setPos] = React.useState(null);
  const btn = React.useRef(null), pop = React.useRef(null);
  const id = React.useId();
  const show = mode => {
    const r = btn.current.getBoundingClientRect(), width = Math.min(340, window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - width / 2), window.innerWidth - width - 8);
    const below = window.innerHeight - r.bottom > 260 || r.top < window.innerHeight - r.bottom;
    // The arrow points at the icon even when the popover is shifted to stay on screen.
    setPos({ left, width, arrow: r.left + r.width / 2 - left, below, ...(below ? { top: r.bottom + 10 } : { bottom: window.innerHeight - r.top + 10 }) });
    setOpen(mode);
  };
  React.useEffect(() => {
    if (!open) return;
    // Capture phase, so Escape closes only the popover and not the dialog around it.
    const esc = e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    const outside = e => { if (!btn.current?.contains(e.target) && !pop.current?.contains(e.target)) setOpen(false); };
    const scroll = e => { if (!pop.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("keydown", esc, true); document.addEventListener("mousedown", outside); window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("keydown", esc, true); document.removeEventListener("mousedown", outside); window.removeEventListener("scroll", scroll, true); };
  }, [open]);
  return <>
    <button ref={btn} type="button" className="info-dot" aria-label={label} aria-expanded={!!open} aria-describedby={open ? id : undefined}
      onClick={e => { e.preventDefault(); open === "pinned" ? setOpen(false) : show("pinned"); }}
      onMouseEnter={() => { if (!open) show("hover"); }} onMouseLeave={() => { if (open === "hover") setOpen(false); }}
      onBlur={() => { if (open === "hover") setOpen(false); }}>?</button>
    {open && ReactDOM.createPortal(
      <div ref={pop} id={id} role="tooltip" className={`popover ${pos.below ? "below" : "above"}`}
        style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}>
        {title && <div className="popover-title">{title}</div>}
        <div className="popover-body">{tip}</div>
        <span className="popover-arrow" style={{ left: pos.arrow }} aria-hidden="true" />
      </div>, document.body)}
  </>;
}

function GlossaryCard({ entry }) {
  return (
    <div className="glossary">
      <div className="glossary-term">
        {entry.term}
        <span className="pill">{entry.pill}</span>
      </div>
      <div className="glossary-def" dangerouslySetInnerHTML={{ __html: entry.def }} />
    </div>
  );
}

function Toast({ message, on, tone, action }) {
  return (
    <div className={`toast ${on ? "on" : ""} ${tone === "error" ? "toast-error" : ""}`} role="status" aria-live="polite">
      {message && <Icon name={tone === "error" ? "alert-triangle" : "check"} size={14} />} {message}
      {on && action && <button className="toast-action" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

// Square tick box used in lists. state: "" | "on" | "mixed". Clicks never reach the row behind it.
function Check({ state = "", onClick, label, disabled, className = "" }) {
  return <button type="button" className={`chk ${state} ${className}`} role="checkbox" aria-checked={state === "on" ? true : state === "mixed" ? "mixed" : false}
    aria-label={label} disabled={disabled} onClick={e => { e.stopPropagation(); onClick?.(); }}>
    {state === "on" ? <Icon name="check" size={11} strokeWidth={2.4} /> : state === "mixed" ? <Icon name="minus" size={11} strokeWidth={2.4} /> : null}
  </button>;
}

const FOCUSABLE ='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Shared modal shell: dialog semantics, focus moved in and trapped, Escape / backdrop call onClose, focus restored.
function Dialog({ onClose, label, className = "", children }) {
  const ref = React.useRef(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    const node = ref.current, previous = document.activeElement;
    if (!node.contains(document.activeElement)) node.focus();
    const onKey = e => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const items = [...node.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    node.addEventListener("keydown", onKey);
    return () => { node.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus(); };
  }, []);
  return (
    <div className="backdrop on" onMouseDown={e => { if (e.target === e.currentTarget) closeRef.current(); }}>
      <div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}

// The one delete confirmation: centred, with the bin icon.
function LibConfirm({ title, body, names = [], confirmLabel, onConfirm, onClose }) {
  return (
    <Dialog onClose={onClose} label={title} className="lib-confirm">
      <div className="cb">
        <div className="wi"><Icon name="trash" size={18} strokeWidth={2} /></div>
        <div>
          <h3>{title}</h3>
          <p>{body}</p>
          {names.length > 0 && <ul>
            {names.slice(0, 3).map((n, i) => <li key={i}><Icon name="grid" size={13} /><span>{n}</span></li>)}
            {names.length > 3 && <li className="more">and {names.length - 3} more</li>}
          </ul>}
        </div>
      </div>
      <div className="cf">
        <button className="btn" onClick={onClose} autoFocus>Cancel</button>
        <button className="btn btn-destroy" onClick={() => { onConfirm(); onClose(); }}><Icon name="trash" size={13} />{confirmLabel}</button>
      </div>
    </Dialog>
  );
}

// Same dialog for code without a place to render it. Resolves true when confirmed; a second call while one is open is refused.
let deletionOpen = false;
function confirmDeletion(props) {
  if (deletionOpen) return Promise.resolve(false);
  deletionOpen = true;
  return new Promise(resolve => {
    const host = document.body.appendChild(document.createElement("div"));
    const root = ReactDOM.createRoot(host);
    let ok = false;
    root.render(<LibConfirm {...props} onConfirm={() => { ok = true; }} onClose={() => { deletionOpen = false; root.unmount(); host.remove(); resolve(ok); }} />);
  });
}

// Styled replacement for <select> (ARIA select-only combobox). options: [[value, label], ...].
// `wrap` lets long labels wrap instead of truncating, with the list as wide as the button.
// Focus stays on the button; the list is portalled so scrolling panes and modals never clip it.
function Select({ value, options, onChange, placeholder = "Select…", disabled, className = "", wrap, id, ...aria }) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [pos, setPos] = React.useState(null);
  const btn = React.useRef(null), list = React.useRef(null);
  const listId = React.useId();
  const index = options.findIndex(([v]) => v === value);
  const show = () => {
    const r = btn.current.getBoundingClientRect(), height = Math.min(260, options.length * 32 + 8);
    const up = window.innerHeight - r.bottom < height + 8 && r.top > window.innerHeight - r.bottom;
    setPos({ left: r.left, [wrap ? "width" : "minWidth"]: r.width, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) });
    setActive(Math.max(index, 0)); setOpen(true);
  };
  const pick = i => { setOpen(false); if (options[i] && options[i][0] !== value) onChange(options[i][0]); };
  React.useEffect(() => {
    if (!open) return;
    const outside = e => { if (!btn.current?.contains(e.target) && !list.current?.contains(e.target)) setOpen(false); };
    const scroll = e => { if (!list.current?.contains(e.target)) setOpen(false); };
    // Native listener so Escape closes only the list, not the dialog around it (Dialog listens natively too).
    const esc = e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    const node = btn.current;
    document.addEventListener("mousedown", outside); window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", () => setOpen(false), { once: true }); node.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", outside); window.removeEventListener("scroll", scroll, true); node.removeEventListener("keydown", esc); };
  }, [open]);
  React.useEffect(() => { if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" }); }, [open, active]);
  const onKey = e => {
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    const move = { ArrowDown: Math.min(active + 1, last), ArrowUp: Math.max(active - 1, 0), Home: 0, End: last, PageDown: Math.min(active + 8, last), PageUp: Math.max(active - 8, 0) }[e.key];
    if (move !== undefined) { e.preventDefault(); setActive(move); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); }
    else if (e.key === "Tab") setOpen(false);
    else if (e.key.length === 1) {
      // Type-ahead: jump to the next option starting with the typed letter.
      const ch = e.key.toLowerCase(), order = options.map((_, i) => (active + 1 + i) % options.length);
      const hit = order.find(i => String(options[i][1]).toLowerCase().startsWith(ch));
      if (hit !== undefined) setActive(hit);
    }
  };
  return <>
    <button ref={btn} id={id} type="button" role="combobox" className={`select ${open ? "open" : ""} ${wrap ? "select-wrap" : ""} ${className}`} disabled={disabled}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-activedescendant={open ? `${listId}-${active}` : undefined}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={onKey} {...aria}>
      <span className={index < 0 ? "select-placeholder" : ""}>{index < 0 ? placeholder : options[index][1]}</span>
      <Icon name="chevron-down" size={14} aria-hidden="true" />
    </button>
    {open && ReactDOM.createPortal(
      <ul ref={list} id={listId} role="listbox" className={`select-list ${wrap ? "select-wrap" : ""}`} style={pos} tabIndex={-1}>
        {options.map(([v, label], i) => (
          <li key={String(v)} id={`${listId}-${i}`} role="option" aria-selected={v === value}
            className={`${i === active ? "active" : ""} ${v === value ? "selected" : ""}`}
            onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(i)}>
            <span>{label}</span>{v === value && <Icon name="check" size={13} aria-hidden="true" />}
          </li>
        ))}
      </ul>, document.body)}
  </>;
}

// Brand mark: three roadmap bars that shift on hover, with sparks when sparks is set.
const LOGO_SPARKS = [[-20, -18, 0, 7, "oklch(82% 0.14 85)"], [22, -16, 60, 6, "#fff"], [-24, 10, 120, 5, "oklch(78% 0.12 225)"], [20, 16, 40, 8, "oklch(82% 0.14 85)"], [2, -26, 90, 5, "oklch(78% 0.12 225)"], [-4, 24, 150, 6, "#fff"]];
function Logo({ size = 28, sparks }) {
  return (
    <div className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 16 16">
        <rect className="b b1" x="1" y="2" width="9" height="3" rx="1.5" fill="#fff" />
        <rect className="b b2" x="5" y="6.5" width="10" height="3" rx="1.5" fill="#fff" opacity=".75" />
        <rect className="b b3" x="3" y="11" width="6" height="3" rx="1.5" fill="#fff" opacity=".55" />
      </svg>
      {sparks && LOGO_SPARKS.map(([x, y, d, s, c]) => <i key={x} className="logo-spark" style={{ "--x": `${x}px`, "--y": `${y}px`, "--d": `${d}ms`, "--s": `${s}px`, "--c": c }} />)}
    </div>
  );
}

Object.assign(window, { Icon, Logo, InfoDot, GlossaryCard, Toast, Dialog, LibConfirm, confirmDeletion, Select, Check });

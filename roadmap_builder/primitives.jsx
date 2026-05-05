/* global React */

// Small reusable bits used across screens.

function Icon({ name, size = 16, ...rest }) {
  const stroke = "currentColor";
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", ...rest };
  switch (name) {
    case "plus":     return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case "check":    return <svg {...props}><path d="M5 12l4 4L19 7"/></svg>;
    case "x":        return <svg {...props}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case "arrow-right": return <svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
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
    default: return null;
  }
}

function InfoDot({ tip }) {
  return <span className="info-dot" data-tip={tip}>?</span>;
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

function Toast({ message, on }) {
  return (
    <div className={`toast ${on ? "on" : ""}`}>
      <Icon name="check" size={14} /> {message}
    </div>
  );
}

Object.assign(window, { Icon, InfoDot, GlossaryCard, Toast });

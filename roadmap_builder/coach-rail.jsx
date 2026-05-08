/* global React, Icon, InfoDot, GlossaryCard, GLOSSARY */

// ─── Coach Rail ──────────────────────────────────────────────
// Persistent left-rail checklist of what to do next + glossary.
// Removes the "empty grid with no guidance" + "jargon" frustrations.

function CoachRail({ state, currentStep, onJump, onShowGlossary }) {
  const totalItems = state.items.length;
  const cats = state.categories.length;
  const bands = state.bands.length;

  const filledCells = new Set(
    state.items.flatMap(i => i.bands.map(b => `${i.catId}|${b}`))
  ).size;
  const totalCells = cats * bands;
  const coverage = totalCells ? Math.round((filledCells / totalCells) * 100) : 0;

  const steps = [
    {
      id: "name",
      title: "Name your roadmap",
      hint: "Give it a memorable title up top.",
      done: !!state.title && state.title !== "Untitled Roadmap"
    },
    {
      id: "structure",
      title: "Confirm layers & time bands",
      hint: `${cats} layers × ${bands} bands. Edit if needed.`,
      done: cats >= 2 && bands >= 2
    },
    {
      id: "first-item",
      title: "Add your first item",
      hint: "Click a cell, or use ⌘N. We'll explain the fields.",
      done: totalItems >= 1
    },
    {
      id: "all-layers",
      title: "Cover every layer",
      hint: "Aim for at least one item per row.",
      done: state.categories.every(c => state.items.some(i => i.catId === c.id))
    },
    {
      id: "span",
      title: "Try a multi-band item",
      hint: "Items can span time — toggle two bands when adding.",
      done: state.items.some(i => i.bands.length > 1)
    },
    {
      id: "tag",
      title: "Tag with PESTLE (optional)",
      hint: "Shows what kind of force each item is.",
      done: state.items.some(i => (i.pestle || []).length > 0)
    },
    {
      id: "export",
      title: "Export or share",
      hint: "Save as JSON, print, or copy as text.",
      done: false
    }
  ];

  const completed = steps.filter(s => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <aside className="rail">
      <div className="rail-header">
        <div className="rail-eyebrow">Roadmap Coach</div>
        <div className="rail-title">Build with <em>confidence</em>.</div>
        <div className="rail-progress">
          <div className="rail-progress-bar">
            <div className="rail-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="rail-progress-meta">
            <span>{completed} of {steps.length} done</span>
            <span>{coverage}% grid covered</span>
          </div>
        </div>
      </div>

      <div className="rail-section">
        <div className="rail-section-title">What to do next</div>
        <div className="checklist">
          {steps.map(s => (
            <div
              key={s.id}
              className={`check-item ${s.done ? "done" : ""} ${currentStep === s.id ? "active" : ""}`}
              onClick={() => onJump(s.id)}
            >
              <div className="check-bullet">
                {s.done && <Icon name="check" size={11} />}
              </div>
              <div className="check-body">
                <div className="check-item-title">{s.title}</div>
                <div className="check-item-hint">{s.hint}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rail-section">
        <div className="rail-section-title row" style={{ justifyContent: "space-between" }}>
          <span>Concept primer</span>
          <button className="btn btn-ghost btn-sm" style={{ padding: "2px 6px" }} onClick={onShowGlossary}>
            All terms <Icon name="chevron-right" size={11} />
          </button>
        </div>
        <div className="col" style={{ gap: 8 }}>
          <GlossaryCard entry={GLOSSARY.ddrm} />
          <GlossaryCard entry={GLOSSARY.layer} />
          <GlossaryCard entry={GLOSSARY.band} />
        </div>
      </div>

      <div className="rail-section" style={{ paddingBottom: 28 }}>
        <div className="rail-section-title">Tips</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-muted)", lineHeight: 1.6 }}>
          <p>· Click any empty cell to add an item there.</p>
          <p>· Drag a chip to a different cell to move it.</p>
          <p>· Hover any <span className="info-dot" data-tip="Like this — every jargon term has a hover explanation.">?</span> for an instant explanation.</p>
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { CoachRail });

/* global React, Icon, InfoDot, PESTLE */
// ─── Roadmap Grid ──────────────────────────────────────────
// Single unified grid: layers (rows) × bands (cols). Items are chips.
// Items with multi-band spans render as wide cards spanning columns.

const CHIP_DESC_PREVIEW = 80;

// Mix `color` with white at the given percentage. Returns a CSS color-mix()
// expression that browsers resolve at paint time — works with var(--…) and oklch().
function mix(color, pct) {
  return `color-mix(in oklch, ${color} ${pct}%, white)`;
}

function Chip({ item, cat, bands, onEdit, onDragStart, onDragEnd, dragging, selected, onToggleSelect }) {
  const isSpan = item.bands.length > 1;
  const cls = isSpan ? "chip span" : "chip";
  const bg = mix(cat.color, 8);
  const border = mix(cat.color, 35);
  const labels = item.bands.map(bid => bands.find(b => b.id === bid)?.label).filter(Boolean);
  return (
    <div
      className={`${cls} ${dragging ? "dragging" : ""} ${selected ? "selected" : ""}`}
      style={{ borderColor: border, background: bg }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        // If selection is already active OR shift/ctrl held → toggle select.
        // Otherwise → open editor.
        if (e.shiftKey || e.metaKey || e.ctrlKey) {
          onToggleSelect(item.id);
        } else {
          onEdit(item.id);
        }
      }}
    >
      <div
        className={`chip-check ${selected ? "on" : ""}`}
        title="Select item"
        onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
      >
        {selected && <Icon name="check" size={10} />}
      </div>
      <div className="chip-text">
        {item.name}
        {item.description && (
          <small>
            {item.description.slice(0, CHIP_DESC_PREVIEW)}
            {item.description.length > CHIP_DESC_PREVIEW ? "…" : ""}
          </small>
        )}
      </div>
      {item.pestle && item.pestle.length > 0 && (
        <div className="chip-tags">
          {item.pestle.map(k => {
            const p = PESTLE.find(x => x.key === k);
            if (!p) return null;
            return (
              <span key={k} className="chip-tag" style={{
                background: mix(p.color, 18),
                color: `color-mix(in oklch, ${p.color} 85%, var(--ink))`
              }}>{k}</span>
            );
          })}
        </div>
      )}
      {item.notes && (
        <div className="chip-note" title={item.notes.slice(0, 100)} style={{
          background: mix(cat.color, 15),
          color: `color-mix(in oklch, ${cat.color} 70%, var(--ink))`
        }}>
          <Icon name="edit" size={9} />
        </div>
      )}
      {isSpan && labels.length > 0 && (
        <span className="chip-span-meta" style={{ color: cat.color }}>
          ↔ {labels[0]}…{labels[labels.length-1]}
        </span>
      )}
    </div>
  );
}

function RoadmapGrid({ state, onEditItem, onAddItem, onMoveItem, currentStep, selected, onToggleSelect }) {
  const [dragId, setDragId] = React.useState(null);
  const [dragOver, setDragOver] = React.useState(null);

  const cats = state.categories;
  const bands = state.bands;
  const tpl = `190px repeat(${bands.length}, minmax(190px, 1fr))`;

  // Find the first empty cell in the first layer for "first-item" coaching pulse
  let pulseKey = null;
  if (currentStep === "first-item" && state.items.length === 0 && cats[0] && bands[0]) {
    pulseKey = `${cats[0].id}|${bands[0].id}`;
  }

  const handleDrop = (catId, bandId) => {
    if (!dragId) return;
    onMoveItem(dragId, catId, bandId);
    setDragId(null);
    setDragOver(null);
  };

  return (
    <div className="roadmap" role="grid">
      {/* Header */}
      <div className="rm-head" style={{ gridTemplateColumns: tpl }}>
        <div className="rm-head-cell">
          <div className="row" style={{ gap: 5 }}>
            Layer
            <InfoDot tip="Rows of the roadmap. Each layer groups one kind of thing — drivers, products, infrastructure, etc." />
          </div>
        </div>
        {bands.map(b => (
          <div key={b.id} className="rm-head-band">
            <div className="rm-head-band-period">{b.label}</div>
            <div className="rm-head-band-tag">{b.tag || "Time band"}</div>
            <div className="rm-head-band-bar" style={{ background: b.color }} />
          </div>
        ))}
      </div>

      {/* Body */}
      {cats.map(cat => {
        const catItems = state.items.filter(i => i.catId === cat.id);
        const singles = catItems.filter(i => i.bands.length === 1);
        const spans   = catItems.filter(i => i.bands.length > 1);

        return (
          <React.Fragment key={cat.id}>
            {/* singles row */}
            <div className="rm-row" style={{ gridTemplateColumns: tpl }}>
              <div className="rm-row-label">
                <div className="rm-row-label-bar" style={{ background: cat.color }} />
                <div className="rm-row-label-name">{cat.label}</div>
                {cat.sub && <div className="rm-row-label-sub">{cat.sub}</div>}
                {cat.help && <div className="rm-row-label-help">{cat.help}</div>}
              </div>
              {bands.map(band => {
                const here = singles.filter(i => i.bands[0] === band.id);
                const k = `${cat.id}|${band.id}`;
                const isPulse = pulseKey === k;
                const isDrag = dragOver === k;
                return (
                  <div
                    key={k}
                    className={`rm-cell ${isDrag ? "drag-over" : ""}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(k); }}
                    onDragLeave={() => setDragOver(prev => prev === k ? null : prev)}
                    onDrop={() => handleDrop(cat.id, band.id)}
                  >
                    {here.length === 0 && !isPulse && (
                      <div className="rm-empty-hint">— empty —</div>
                    )}
                    {here.map(item => (
                      <Chip
                        key={item.id}
                        item={item}
                        cat={cat}
                        bands={bands}
                        onEdit={onEditItem}
                        onDragStart={() => setDragId(item.id)}
                        onDragEnd={() => { setDragId(null); setDragOver(null); }}
                        dragging={dragId === item.id}
                        selected={selected?.has(item.id)}
                        onToggleSelect={onToggleSelect}
                      />
                    ))}
                    <button className="rm-cell-add" onClick={() => onAddItem(cat.id, band.id)}>
                      <Icon name="plus" size={11} /> add item
                    </button>
                    {isPulse && <div className="coach-pulse" />}
                  </div>
                );
              })}
            </div>

            {/* spans — one row per spanning item, full-width across band cols */}
            {spans.map(item => {
              // figure out start & end col indices in the bands array
              const idxs = item.bands.map(bid => bands.findIndex(b => b.id === bid)).filter(x => x >= 0).sort((a,b) => a-b);
              if (idxs.length < 2) return null;
              const start = idxs[0];
              const end   = idxs[idxs.length-1];
              const span  = end - start + 1;
              return (
                <div key={`span-${item.id}`} className="rm-row" style={{ gridTemplateColumns: tpl, minHeight: 50 }}>
                  <div className="rm-row-label" style={{ paddingTop: 8, paddingBottom: 8 }}>
                    <div className="rm-row-label-bar" style={{ background: cat.color, opacity: 0.5 }} />
                    <div className="rm-row-label-sub" style={{ paddingLeft: 8 }}>↳ spans</div>
                  </div>
                  {/* leading empty cells */}
                  {Array.from({ length: start }).map((_, i) => (
                    <div key={`lead-${i}`} className="rm-cell" style={{ minHeight: 0 }} />
                  ))}
                  {/* the span itself */}
                  <div className="rm-cell" style={{ gridColumn: `span ${span}`, minHeight: 0, padding: 8 }}>
                    <Chip
                      item={item}
                      cat={cat}
                      bands={bands}
                      onEdit={onEditItem}
                      onDragStart={() => setDragId(item.id)}
                      onDragEnd={() => { setDragId(null); setDragOver(null); }}
                      dragging={dragId === item.id}
                      selected={selected?.has(item.id)}
                      onToggleSelect={onToggleSelect}
                    />
                  </div>
                  {/* trailing empty cells */}
                  {Array.from({ length: bands.length - end - 1 }).map((_, i) => (
                    <div key={`tr-${i}`} className="rm-cell" style={{ minHeight: 0 }} />
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}

Object.assign(window, { RoadmapGrid });

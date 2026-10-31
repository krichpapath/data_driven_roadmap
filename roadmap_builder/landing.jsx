/* global React, Logo, downloadFile */
// landing.jsx — public home page shown at "#/" before the roadmap library.
// Content mirrors the CS403 report and the DDRM paper; no scoring details on purpose.
// Everything inside the demos is an illustration with example sources, and says so on the page.

const LP_BANDS = ["2024 – 2026", "2027 – 2030", "Beyond 2030"];

// Industrial Digital template items. span = [first band, last band], 1-based.
const LP_LANES = [
  { label: "Business Drivers", color: "var(--c-blue)", items: [
    { name: "Growth of Generative AI", span: [1, 1] },
    { name: "Geopolitical Ecosystem", span: [2, 3] },
  ] },
  { label: "Strategic Targets", color: "var(--c-teal)", items: [
    { name: "Cross-Industries Adoption of AI", span: [1, 2] },
    { name: "Cross-Regional AI Platform", span: [3, 3] },
  ] },
  { label: "R&D Programs", color: "var(--c-amber)", items: [
    { name: "Security — Blockchain, Cybersecurity", span: [1, 3] },
  ] },
  { label: "Resources", color: "var(--c-slate)", items: [
    { name: "Fair-Access Data Lake", span: [1, 3] },
  ] },
];

const LP_PESTLE = {
  Political: "oklch(58% 0.17 25)", Economic: "oklch(62% 0.15 65)", Social: "oklch(60% 0.14 330)",
  Technological: "oklch(55% 0.17 258)", Legal: "oklch(50% 0.12 290)", Environmental: "oklch(56% 0.14 158)",
};

const LP_SCENARIOS = [
  { key: "maintain", label: "Maintain", pill: "Maintain", text: "The plan still holds. Keep going.", tag: "Economic",
    title: "Demand for AI services stays on forecast", kind: "Industry report",
    mark: "Demand for AI services is growing in line with earlier forecasts", rest: ", the report found.", hits: [] },
  { key: "adjust", label: "Adjust", pill: "Adjust, 2 items to review", text: "Some items need a fresh look at scope, timing or priority.", tag: "Legal",
    title: "Regional rules tighten on cross-border data", kind: "News article",
    mark: "Sensitive data must be stored inside the country from next year", rest: ", regulators said on Monday.",
    hits: ["Security — Blockchain, Cybersecurity", "Fair-Access Data Lake"] },
  { key: "revise", label: "Revise", pill: "Revise, 3 items to review", text: "Core assumptions are challenged. Plan a formal review.", tag: "Political",
    title: "Trade bloc restricts shared AI platforms", kind: "Policy update",
    mark: "Cross-regional AI platforms will need separate approval in each member state", rest: ", ministers agreed.",
    hits: ["Geopolitical Ecosystem", "Cross-Industries Adoption of AI", "Cross-Regional AI Platform"] },
];

const LP_TICKER = [
  ["Legal", "Regional rules tighten on cross-border data"], ["Technological", "Open AI models close the gap on larger systems"],
  ["Economic", "Demand for AI services stays on forecast"], ["Political", "Trade bloc restricts shared AI platforms"],
  ["Social", "Firms report a shortage of data engineers"], ["Environmental", "Data centres face new energy reporting rules"],
  ["Technological", "Post-quantum security standards reach final draft"], ["Economic", "Foreign investment in digital industry rises"],
];

const LP_TRACES = [
  ["Political", "Geopolitical Ecosystem", "Cross-regional AI platforms will need separate approval in each member state"],
  ["Economic", "Cross-Industries Adoption of AI", "Demand for AI services is growing in line with earlier forecasts"],
  ["Social", "Cross-Industries Adoption of AI", "Firms report that a shortage of data engineers is slowing adoption"],
  ["Technological", "Security — Blockchain, Cybersecurity", "Post-quantum security standards have reached their final draft"],
  ["Legal", "Fair-Access Data Lake", "Sensitive data must be stored inside the country from next year"],
  ["Environmental", "Fair-Access Data Lake", "Large data centres must report their energy use from next year"],
];

// Snapshot board: years 2022–2030. row counts from 2 (row 1 holds the years). kind: orig, ghost or new.
const LP_SNAP_YEARS = [2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
const LP_SNAP_LANES = [
  { label: "Drivers", row: 2, color: "var(--c-blue)" }, { label: "Targets", row: 5, color: "var(--c-teal)" },
  { label: "R&D", row: 7, color: "var(--c-amber)" }, { label: "Resources", row: 8, color: "var(--c-slate)" },
];
const LP_SNAP_BARS = [
  { kind: "orig", row: 2, from: 2022, to: 2027, name: "Digital economy growth", color: "var(--c-blue)" },
  { kind: "ghost", row: 3, from: 2023, to: 2027, name: "Not on the plan", after: "Generative AI", tag: "Missed", tagAfter: "Added", color: "var(--c-blue)" },
  { kind: "new", row: 4, from: 2024, to: 2028, name: "Foreign investment", color: "var(--c-blue)" },
  { kind: "orig", row: 5, from: 2022, to: 2030, name: "Digital platforms for industry", color: "var(--c-teal)" },
  { kind: "new", row: 6, from: 2024, to: 2030, name: "AI across industries", color: "var(--c-teal)" },
  { kind: "orig", row: 7, from: 2022, to: 2030, name: "Cloud and IoT programmes", color: "var(--c-amber)" },
  { kind: "orig", row: 8, from: 2022, to: 2023, name: "Digital talent", color: "var(--c-slate)" },
  { kind: "new", row: 8, from: 2024, to: 2030, name: "Workforce planning", color: "var(--c-slate)" },
  { kind: "new", row: 9, from: 2024, to: 2030, name: "National data management", color: "var(--c-slate)" },
];
const LP_SNAP_STATUS = ["As written, 2022", "Out of date, 2023", "Reviewed, 2024"];
const LP_SNAP_CARDS = [
  { year: 2022, dot: "", picture: "The 2022 roadmap", text: "Thailand publishes its Digital Industry R&D roadmap, planned through 2030." },
  { year: 2023, dot: "revise", picture: "Generative AI in the news", text: "Generative AI spreads far faster than the roadmap expected." },
  { year: 2024, dot: "maintain", picture: "The 2024 review", text: "A formal review adds new drivers: foreign investment, national data management, AI across industries and workforce planning." },
];

const LP_PARTS = [
  { mode: "bands", title: "Time bands", text: "Short, mid and long term, read from left to right." },
  { mode: "layers", title: "Layers", text: "From outside drivers at the top to people and infrastructure at the bottom." },
  { mode: "items", title: "Items", text: "The trends, goals, products and programmes placed where they belong." },
];

const LP_ROLES = [
  { name: "Strategy and planning analysts", text: "who keep roadmaps up to date between workshops", short: "Strategy analyst", color: "var(--accent)" },
  { name: "R&D and innovation managers", text: "deciding which programmes to speed up or pause", short: "R&D manager", color: "var(--c-green)" },
  { name: "Policy and innovation agencies", text: "tracking national or sector roadmaps", short: "Policy agency", color: "var(--c-amber)" },
  { name: "Risk and governance teams", text: "who need a record of why a plan changed", short: "Governance lead", color: "oklch(70% 0.02 60)" },
];
const LP_WALL = [[0, 1, 2, 3, 0], [2, 3, 0, 1, 2], [0, 1, 2, 3, 0]];

const LP_STEPS = [
  { title: "Build your roadmap", text: "Start from a template or a blank canvas. Add layers, time bands and items in a few clicks." },
  { title: "Add your sources", text: "Bring in websites, PDFs, images, text files or pasted text. Each source belongs to one roadmap." },
  { title: "Check the impact", text: "Pick sources and run News Impact. You get one status for the roadmap, the items affected, and the sentences that led to it." },
];
const LP_DEMO_SOURCES = [
  ["WEB", "Regional rules tighten on cross-border data", "News article"], ["PDF", "National data policy brief", "Policy brief"],
  ["IMG", "Scanned sector report", "Text read from the image"], ["TXT", "Workshop notes", "Pasted text"],
];

const LP_STATUSES = [
  { key: "maintain", label: "Maintain", hint: "Hover: nothing moves", text: "The plan still holds. Keep going." },
  { key: "adjust", label: "Adjust", hint: "Hover: one item shifts", text: "Some items need a fresh look at scope, timing or priority." },
  { key: "revise", label: "Revise", hint: "Hover: the plan breaks apart", text: "Core assumptions are challenged. Plan a formal review." },
];

const LP_IEEE = "https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=17";

const lpReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function lpScrollTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: lpReduced() ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

// Rotates through count options until someone picks one (or asks for reduced motion).
function useCycle(count, ms, initial = 0) {
  const [index, setIndex] = React.useState(initial);
  const [auto, setAuto] = React.useState(() => !lpReduced());
  React.useEffect(() => {
    if (!auto) return undefined;
    const id = setInterval(() => setIndex(i => (i + 1) % count), ms);
    return () => clearInterval(id);
  }, [auto, count, ms]);
  return [index, n => { setAuto(false); setIndex(n); }, auto];
}

function HeroCells() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (lpReduced()) return undefined;
    const id = setInterval(() => {
      const box = ref.current;
      if (!box || box.children.length > 10) return;
      const cell = document.createElement("i");
      cell.style.left = `${1 + 56 * Math.floor(Math.random() * Math.ceil(box.offsetWidth / 56))}px`;
      cell.style.top = `${1 + 56 * Math.floor(Math.random() * 10)}px`;
      cell.addEventListener("animationend", () => cell.remove());
      box.appendChild(cell);
    }, 450);
    return () => clearInterval(id);
  }, []);
  return <div className="hero-cells" ref={ref} />;
}

function HeroBoard() {
  const [index, pick, auto] = useCycle(LP_SCENARIOS.length, 6500, 1);
  const scenario = LP_SCENARIOS[index];
  const [stage, setStage] = React.useState(() => (lpReduced() ? 3 : 0));
  const [lines, setLines] = React.useState([]);
  const boardRef = React.useRef(null);
  const srcRef = React.useRef(null);

  React.useEffect(() => {
    if (lpReduced()) return undefined;
    setStage(0);
    const timers = [[250, 1], [1300, 2], [2300, 3]].map(([ms, s]) => setTimeout(() => setStage(s), ms));
    return () => timers.forEach(clearTimeout);
  }, [index]);

  // Connect the source card to each flagged item; drawn from the page's real positions.
  React.useLayoutEffect(() => {
    const draw = () => {
      if (stage < 3 || !boardRef.current || !srcRef.current) { setLines([]); return; }
      const box = boardRef.current.getBoundingClientRect();
      const src = srcRef.current.getBoundingClientRect();
      const x1 = src.left - box.left, y1 = src.top - box.top + src.height / 2;
      setLines(scenario.hits.map(name => {
        const el = boardRef.current.querySelector(`[data-item="${CSS.escape(name)}"]`);
        const r = el.getBoundingClientRect();
        const x2 = r.right - box.left, y2 = r.top - box.top + r.height / 2;
        return { x2, y2, d: `M${x1} ${y1}C${x1 - 40} ${y1} ${x2 + 40} ${y2} ${x2} ${y2}` };
      }));
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [stage, scenario]);

  const stageClass = [1, 2, 3].filter(s => stage >= s).map(s => ` s${s}`).join("");
  const done = stage >= 3;
  const stroke = scenario.key === "revise" ? "var(--c-red)" : "var(--c-amber)";
  return (
    <div className={`hb${stageClass}${done && scenario.hits.length ? " any" : ""}${done && !scenario.hits.length ? " ok" : ""}`} ref={boardRef}>
      <div className="hb-bar"><i /><i /><i /><b>Industrial Digital roadmap</b><span className="sp" /><span className="hb-scan"><i /></span>
        <span className={`hb-pill ${done ? scenario.key : ""}`} aria-live={auto ? "off" : "polite"}><i className="dot" />{done ? scenario.pill : "Checking source"}</span>
      </div>
      <div className="hb-map" aria-hidden="true">
        {LP_BANDS.map((b, i) => <span key={b} className="hb-h" style={{ gridColumn: i + 2 }}>{b}</span>)}
        {LP_LANES.map((lane, row) => (
          <React.Fragment key={lane.label}>
            <span className="hb-l" style={{ gridRow: row + 2, "--lane": lane.color }}>{lane.label}</span>
            {lane.items.map(item => {
              const hit = done && scenario.hits.includes(item.name);
              return (
                <span key={item.name} data-item={item.name} className={`hb-it${hit ? ` hit ${scenario.key}` : " nochip"}`}
                  style={{ gridRow: row + 2, gridColumn: `${item.span[0] + 1} / ${item.span[1] + 2}`, "--lane": lane.color }}>
                  <span>{item.name}</span><em>{scenario.label}</em>
                </span>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div className="hb-side">
        <div className="hb-k">Incoming source</div>
        <div className="hb-src" ref={srcRef}>
          <em className="tg" style={{ "--p": LP_PESTLE[scenario.tag] }}>{scenario.tag}</em>
          <strong>{scenario.title}</strong><small>{scenario.kind}</small>
          <p><mark>{scenario.mark}</mark>{scenario.rest}</p>
        </div>
        <div className="hb-k" style={{ marginTop: 6 }}>Result</div>
        <div className="hb-res"><b className={scenario.key}><i className={`dot ${scenario.key}`} />{scenario.label}</b><p>{scenario.text}</p></div>
        <div className="hb-tabs">
          {LP_SCENARIOS.map((s, i) => <button type="button" key={s.key} className={i === index ? "on" : ""} aria-pressed={i === index} onClick={() => pick(i)}>{s.label}</button>)}
        </div>
      </div>
      <svg className="hb-lines" aria-hidden="true">
        {lines.map((l, i) => <React.Fragment key={`${scenario.key}${i}`}><path d={l.d} pathLength="1" stroke={stroke} /><circle cx={l.x2} cy={l.y2} r="3" fill={stroke} /></React.Fragment>)}
      </svg>
    </div>
  );
}

function Snapshot() {
  const [f, setF] = React.useState(0.03);
  const [ready, setReady] = React.useState(false);
  const snapRef = React.useRef(null);
  const gridRef = React.useRef(null);
  const tween = React.useRef(0);
  const year = Math.min(2030, 2022 + Math.floor(f * 9));
  const phase = Math.min(2, year - 2022);

  // Play 2022 → 2024 once when the board comes into view, then hand it to the user.
  React.useEffect(() => {
    if (lpReduced()) { setF(0.28); setReady(true); return undefined; }
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      seen.disconnect();
      const t0 = performance.now();
      const step = now => {
        const p = Math.min(1, (now - t0) / 3500);
        setF(0.03 + 0.25 * p);
        if (p < 1) tween.current = requestAnimationFrame(step); else setReady(true);
      };
      tween.current = requestAnimationFrame(step);
    }, { threshold: 0.4 });
    seen.observe(snapRef.current);
    return () => { seen.disconnect(); cancelAnimationFrame(tween.current); };
  }, []);

  const seek = next => { cancelAnimationFrame(tween.current); setReady(true); setF(next); };
  const fromPointer = e => {
    const r = gridRef.current.getBoundingClientRect();
    const label = gridRef.current.firstElementChild.getBoundingClientRect().left - r.left;
    seek(Math.max(0, Math.min(0.999, (e.clientX - r.left - label) / (r.width - label))));
  };

  return (
    <>
      <div className={`snap${ready ? " ready" : ""}${phase ? ` s${phase}` : ""}`} ref={snapRef}>
        <div className="snap-bar"><i /><i /><i /><b>Digital Industry R&amp;D roadmap</b><small>2022 – 2030</small><span className="sp" />
          <span className={`snap-st${phase ? ` s${phase}` : ""}`} aria-live="off"><i className="dot" />{LP_SNAP_STATUS[phase]}</span>
        </div>
        <div className="snap-body" aria-hidden="true">
          <div className="snap-grid" ref={gridRef}
            onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
            onPointerMove={e => { if (e.buttons) fromPointer(e); }}>
            {LP_SNAP_YEARS.map((y, i) => <span key={y} className={`sy${y <= year ? " past" : ""}`} style={{ gridColumn: i + 2 }}>{y}</span>)}
            {LP_SNAP_LANES.map((lane, i) => (
              <React.Fragment key={lane.label}>
                {i > 0 && <span className="ssep" style={{ gridRow: lane.row }} />}
                <span className="sl" style={{ gridRow: lane.row, "--lane": lane.color }}>{lane.label}</span>
              </React.Fragment>
            ))}
            {LP_SNAP_BARS.map(bar => (
              <span key={bar.name} className={`sbar ${bar.kind}`} style={{ gridRow: bar.row, gridColumn: `${bar.from - 2020} / ${bar.to - 2019}`, "--lane": bar.color }}>
                {bar.kind === "ghost"
                  ? <><span className="a">{bar.name}</span><span className="b">{bar.after}</span><em>{phase === 2 ? bar.tagAfter : bar.tag}</em></>
                  : <span>{bar.name}</span>}
                {bar.kind === "new" && <em>New</em>}
              </span>
            ))}
            <span className={`sev${phase >= 1 ? " on" : ""}`} style={{ "--f": 1 / 9, "--c": "var(--c-red)" }} />
            <span className={`sev${phase >= 2 ? " on" : ""}`} style={{ "--f": 2 / 9, "--c": "var(--c-green)" }} />
            <span className="snow" style={{ "--f": f }}><b>Today · {year}</b></span>
          </div>
        </div>
        <div className="snap-note"><span className="snap-hint">Drag across the timeline or pick a year below</span><span>Simplified illustration</span></div>
      </div>
      <ol className="snap-cards">
        {LP_SNAP_CARDS.map((c, i) => (
          <li key={c.year} className={`scard${phase === i ? " on" : ""}`}>
            <button type="button" className="scard-btn" aria-pressed={phase === i} onClick={() => seek((c.year - 2022 + 0.28) / 9)}>
              {/* Placeholder art stays hidden until a real picture is supplied (c.image). */}
              {c.image && <img className="ph" src={c.image} alt={c.picture} />}
              <div className="tx"><div className="yr"><i className={`dot ${c.dot}`} style={c.dot ? undefined : { background: "var(--ink)" }} />{c.year}</div><p>{c.text}</p></div>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

function Anatomy() {
  const [index, pick, auto] = useCycle(LP_PARTS.length, 1800, 0);
  const mode = LP_PARTS[index].mode;
  const cell = (slab, col) => <div key={col} className={`cell c${col}`}>{slab === col && <i className="atile" style={{ "--lane": ["var(--c-blue)", "var(--c-teal)", "var(--c-amber)"][slab] }} />}</div>;
  return (
    <>
      <div>
        <div className="eyebrow">The basics</div>
        <h2 id="what-title">What is a roadmap?</h2>
        <p className="body">A technology roadmap is a one-page plan. It connects why an organisation must change, what it wants to achieve, and the technology and resources that will get it there, laid out over time.</p>
        <div className="parts">
          {LP_PARTS.map((p, i) => (
            <button type="button" key={p.mode} className={`part${i === index ? ` on ${auto ? "auto" : "done"}` : ""}`} aria-pressed={i === index} onClick={() => pick(i)}>
              <span className="n">0{i + 1}</span><b>{p.title}</b><span>{p.text}</span><div className="bar"><i /></div>
            </button>
          ))}
        </div>
        <p className="body">Teams use one to get leaders and engineers looking at the same picture, to spot dependencies early, and to agree where to invest first.</p>
      </div>
      <div className={`anat-stage ${mode}`} aria-hidden="true">
        <div className={`anat ${mode}`}><div className="iso">
          {[0, 1, 2].map(slab => <div key={slab} className="slab">{[0, 1, 2].map(col => cell(slab, col))}</div>)}
        </div></div>
        <div className="alabels">
          {[["Why", "drivers", "22%"], ["What", "goals", "43%"], ["How", "resources", "64%"]].map(([a, b, top]) => <span key={a} className="alabel" style={{ top }}>{a} <small>{b}</small></span>)}
        </div>
        <div className="blabels"><span>Short term</span><span>Mid term</span><span>Long term</span></div>
        <div className="ilabels">
          {[["Market trend", "--c-blue"], ["New platform", "--c-teal"], ["R&D programme", "--c-amber"]].map(([t, c]) => <span key={t}><i style={{ "--lane": `var(${c})` }} />{t}</span>)}
        </div>
      </div>
    </>
  );
}

function HowDemo({ step }) {
  return (
    <div className="demo" aria-hidden="true">
      <div className="demo-top"><i /><i /><i /><b>Industrial Digital roadmap</b></div>
      <div className={`scene${step === 0 ? " on" : ""}`}>
        <div className="tpl-row s-in"><span className="tpl on">Industrial Digital</span><span className="tpl">SaaS Product</span><span className="tpl">Research Programme</span><span className="tpl">Blank canvas</span></div>
        <div className="mini">
          <span /><span className="h">{LP_BANDS[0]}</span><span className="h">{LP_BANDS[1]}</span><span className="h">{LP_BANDS[2]}</span>
          {LP_LANES.slice(0, 3).map((lane, r) => (
            <React.Fragment key={lane.label}>
              <span className="l" style={{ "--lane": lane.color }}>{lane.label}</span>
              <span className="it s-in" style={{ "--lane": lane.color, transitionDelay: `${0.1 + r * 0.12}s`, gridColumn: `span ${r === 2 ? 2 : 1}` }}>{lane.items[0].name}</span>
              {r < 2 && <span className="add">+</span>}
              <span className="add">+</span>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className={`scene${step === 1 ? " on" : ""}`}>
        <div className="s-in" style={{ fontSize: 13, color: "var(--ink-muted)" }}>Sources for this roadmap</div>
        <div className="srcs">
          {LP_DEMO_SOURCES.map(([type, name, note], i) => (
            <div key={type} className="src s-in" style={{ transitionDelay: `${0.1 + i * 0.12}s` }}><span className="ftype">{type}</span><div><b>{name}</b><small>{note}</small></div><span className="ok">Ready</span></div>
          ))}
        </div>
        <div className="drop s-in" style={{ transitionDelay: ".7s" }}>Drop websites, PDFs, images or text here</div>
      </div>
      <div className={`scene${step === 2 ? " on" : ""}`}>
        <div className="run s-in"><span className="btn btn-accent btn-sm">Run News Impact</span><div className="scan"><i /></div><span style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>4 sources</span></div>
        <div className="result">
          <div className="rcard"><small>Roadmap status</small><div className="status-big"><i className="dot adjust" />Adjust</div>
            <div className="affected"><span><i className="dot adjust" />Security — Blockchain, Cybersecurity</span><span><i className="dot adjust" />Fair-Access Data Lake</span></div></div>
          <div className="rcard"><small>Evidence</small><blockquote>“<mark>Sensitive data must be stored inside the country from next year</mark>, regulators said on Monday.”</blockquote><cite>Regional rules tighten on cross-border data · Legal driver</cite></div>
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const ref = React.useRef(null);
  const [step, setStep] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const last = LP_STEPS.length - 1;

  // Plays through the steps once each time the section comes into view.
  React.useEffect(() => {
    if (lpReduced()) return undefined;
    const seen = new IntersectionObserver(([entry]) => {
      setPlaying(entry.isIntersecting);
      if (entry.isIntersecting) setStep(0);
    }, { threshold: 0.3 });
    seen.observe(ref.current);
    return () => seen.disconnect();
  }, []);
  React.useEffect(() => {
    if (!playing || step === last) return undefined;
    const id = setTimeout(() => setStep(step + 1), 2800);
    return () => clearTimeout(id);
  }, [playing, step, last]);

  // A click plays on from the chosen step.
  const choose = i => { setStep(i); setPlaying(!lpReduced()); };

  return (
    <div className="wrap" ref={ref}>
      <div className="sec-head"><div className="eyebrow">How it works</div><h2 id="how-title">Three steps, no setup</h2><p>Nothing to configure beyond the roadmap you already have.</p></div>
      <div className="how">
        <div className="steps">
          {LP_STEPS.map((s, i) => (
            <button type="button" key={s.title} className={`step${i === step ? " on" : ""}${i === step && playing && step < last ? " auto" : ""}`} aria-pressed={i === step} onClick={() => choose(i)}>
              <span className="num">{i + 1}</span><h3>{s.title}</h3><p>{s.text}</p><div className="bar"><i /></div>
            </button>
          ))}
        </div>
        <HowDemo step={step} />
      </div>
    </div>
  );
}

function ImpactTrace() {
  const [index, pick] = useCycle(LP_TRACES.length, 3200, 4);
  const [, item, quote] = LP_TRACES[index];
  return (
    <div className="viz">
      <div className="pestle">
        {LP_TRACES.map(([name], i) => <button type="button" key={name} className={i === index ? "on" : ""} aria-pressed={i === index} onClick={() => pick(i)}>{name}</button>)}
      </div>
      <div className="trace"><b>{item}</b><q>{quote}</q></div>
    </div>
  );
}

// The landing page has no roadmap open, so these download the example shown on the page.
const LP_EXAMPLE_ROWS = LP_LANES.flatMap(lane => lane.items.map(item => ({ layer: lane.label, item: item.name, from: LP_BANDS[item.span[0] - 1], to: LP_BANDS[item.span[1] - 1] })));
const LP_EXAMPLE_FILES = {
  JSON: ["example-roadmap.json", "application/json", () => JSON.stringify({ title: "Industrial Digital roadmap (example)", items: LP_EXAMPLE_ROWS }, null, 2)],
  CSV: ["example-roadmap.csv", "text/csv", () => ["Layer,Item,From,To", ...LP_EXAMPLE_ROWS.map(r => [r.layer, r.item, r.from, r.to].map(v => `"${v}"`).join(","))].join("\n")],
};

function ExportButton({ format }) {
  const [saved, setSaved] = React.useState(false);
  const timer = React.useRef(0);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const save = () => {
    const [name, mime, build] = LP_EXAMPLE_FILES[format];
    downloadFile(name, build(), mime);
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1800);
  };
  return <button type="button" className={`exp${saved ? " done" : ""}`} aria-label={`Download an example roadmap as ${format}`} onClick={save}>{saved ? "Saved ✓" : format}</button>;
}

function Landing({ savedCount }) {
  const [scrolled, setScrolled] = React.useState(false);
  const tiltRef = React.useRef(null);

  React.useEffect(() => { window.scrollTo(0, 0); }, []);
  React.useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      if (lpReduced() || !tiltRef.current) return;
      const top = tiltRef.current.getBoundingClientRect().top;
      const tilt = Math.max(0, Math.min(1, (top - 100) / (window.innerHeight * 0.6))) * 16;
      tiltRef.current.firstElementChild.style.setProperty("--tilt", `${tilt}deg`);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = id => e => { e.preventDefault(); lpScrollTo(id); };
  const sectionButtons = [["what", "What is a roadmap?"], ["how", "How it works"], ["features", "Features"], ["research", "Research"]];
  const create = <a className="btn btn-accent" href="#/roadmaps/new">Create a roadmap</a>;
  const brand = (
    <a className="brand" href="#/" aria-label="Data Driven Roadmap home">
      <Logo sparks />
      <div className="brand-name">Data Driven <em>Roadmap</em></div>
    </a>
  );

  return (
    <div className="lp">
      <a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className={`nav${scrolled ? " scrolled" : ""}`}>
        <div className="wrap">
          {brand}
          <nav className="nav-links" aria-label="Page sections">
            {sectionButtons.map(([id, label]) => <button type="button" key={id} onClick={() => lpScrollTo(id)}>{label}</button>)}
          </nav>
          <div className="nav-actions">
            <a className="btn btn-ghost btn-sm" href="#/roadmaps">My roadmaps</a>
            <a className="btn btn-accent btn-sm" href="#/roadmaps/new">Create a roadmap</a>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-grid" />
          <HeroCells />
          <div className="wrap hero-top">
            <div className="live"><em>Demo</em>See a sample roadmap check</div>
            <h1 id="hero-title">The world moved. <span>Does your roadmap know?</span></h1>
            <p className="lede">Data Driven Roadmap checks the news, reports and policy updates you collect against your technology roadmap. It tells you whether to maintain, adjust or revise the plan, and shows the sentences behind every result.</p>
            <div className="actions">
              {create}
              <button type="button" className="btn" onClick={() => lpScrollTo("how")}>See how it works</button>
            </div>
            <p className="fine"><i />A research prototype from Thammasat University. Your roadmaps stay on your computer.</p>
          </div>
          <div className="ticker" aria-hidden="true">
            <div className="ticker-row">
              {[...LP_TICKER, ...LP_TICKER].map(([tag, text], i) => <span key={i} className="tk"><em style={{ "--p": LP_PESTLE[tag] }}>{tag}</em>{text}</span>)}
            </div>
          </div>
          <div className="wrap hb-wrap" ref={tiltRef}>
            <HeroBoard />
            <p className="hb-note">Illustration with example sources. The highlighted sentence is the evidence behind the result.</p>
          </div>
        </section>

        <section className="sec" id="snapshot" aria-labelledby="snapshot-title">
          <div className="wrap">
            <div className="sec-head"><div className="eyebrow">The problem</div><h2 id="snapshot-title">A roadmap is a snapshot</h2>
              <p>It records what an organisation believes on the day it is written: which forces matter, which goals to chase, which technology to build. The world keeps moving after the workshop ends.</p></div>
            <Snapshot />
            <p className="close-line">The change was caught at the next scheduled review. <span>Data Driven Roadmap is built to notice it sooner.</span></p>
          </div>
        </section>

        <section className="sec" id="what" tabIndex={-1} aria-labelledby="what-title">
          <div className="what-track"><div className="wrap split"><Anatomy /></div></div>
        </section>

        <section className="sec who-dark" id="who" aria-labelledby="who-title">
          <div className="wrap who-grid">
            <div className="who-copy">
              <div className="eyebrow">Who it's for</div>
              <h2 id="who-title">Made for the people who look after the plan</h2>
              <p className="body">Data Driven Roadmap is a web app for building a roadmap and keeping it current. You collect the sources you already read, and it points to the parts of the plan they affect.</p>
              <ul className="roles">
                {LP_ROLES.map(r => <li key={r.name}><i style={{ background: r.color }} /><div><b>{r.name}</b><p>{r.text}</p></div></li>)}
              </ul>
              <div className="decide-line">
                <p><b>It prepares the review.</b> <span>People decide.</span> Every result is advice you can accept, edit or ignore, with its evidence attached.</p>
                <div className="acts"><span>Accept</span><span>Edit</span><span>Ignore</span></div>
              </div>
            </div>
            <div className="wall-wrap" aria-hidden="true"><div className="wall">
              {LP_WALL.map((col, c) => (
                <div key={c} className={`wcol c${c + 1}`}>
                  {col.map((r, i) => <figure key={i} className="wc"><figcaption><i style={{ background: LP_ROLES[r].color }} />{LP_ROLES[r].short}</figcaption></figure>)}
                </div>
              ))}
            </div></div>
          </div>
        </section>

        <section className="sec" id="how" tabIndex={-1} aria-labelledby="how-title">
          <HowItWorks />
          <div className="wrap">
            <div className="statuses">
              {LP_STATUSES.map(s => (
                <div key={s.key} className={`status ${s.key}`}>
                  <div className="mini" aria-hidden="true">
                    {["b1", "b2", "b3"].map(b => <div key={b} className="mrow"><i className="g" /><i className={`bar ${b}`} /></div>)}
                    <em className="now" /><small>{s.hint}</small>
                  </div>
                  <b><i className={`dot ${s.key}`} />{s.label}</b><span>{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" id="features" tabIndex={-1} aria-labelledby="features-title">
          <div className="wrap">
            <div className="sec-head"><div className="eyebrow">Features</div><h2 id="features-title">What you can do with it</h2></div>
            <div className="bento">
              <div className="card w4"><ImpactTrace /><h3>Impact you can trace</h3><p>See which items a source affects, grouped into political, economic, social, technological, legal and environmental drivers, with the sentences quoted.</p></div>
              <div className="card"><div className="viz" aria-hidden="true"><div className="fan"><span style={{ "--lane": "var(--c-blue)" }}>Industrial Digital</span><span style={{ "--lane": "var(--c-teal)" }}>SaaS Product</span><span style={{ "--lane": "var(--c-amber)" }}>Research Programme</span><span>Blank canvas</span></div></div><h3>Ready-made templates</h3><p>Start from Industrial Digital, SaaS Product or Research Programme, or begin on a blank canvas.</p></div>
              <div className="card"><div className="viz" aria-hidden="true"><div className="files"><span><em>WEB</em>News article</span><span><em>PDF</em>Policy brief</span><span><em>IMG</em>Scanned report</span><span><em>TXT</em>Notes</span></div><div className="ocr">Text in scanned pages is read for you</div></div><h3>One library for your evidence</h3><p>Keep websites, PDFs, images and notes together. Text in scanned pages is read for you.</p></div>
              <div className="card"><div className="viz" aria-hidden="true"><div className="gloss">Each row in a roadmap sits inside a <u>layer</u>, and each column is a time band.<div className="tip"><b>Layer</b> · A horizontal level of the roadmap, from outside drivers at the top to resources at the bottom.</div></div></div><h3>Guidance as you build</h3><p>Plain-language tips and a built-in glossary explain each part of the roadmap while you work.</p></div>
              <div className="card"><div className="viz" aria-hidden="true"><div className="pin"><div className="it">Fair-Access Data Lake</div><div className="note"><b>Evidence attached</b>Adjust · data rules from next year</div></div></div><h3>Advice on the roadmap itself</h3><p>Attach a result to the items it concerns, so the next review starts with the evidence in place.</p></div>
              <div className="card w4 keep">
                <div className="viz"><div className="local"><i />Stored on this computer</div><ExportButton format="JSON" /><ExportButton format="CSV" /></div>
                <div><h3>Yours to keep</h3><p>Roadmaps and sources stay on your computer. Export to JSON or CSV whenever you need them elsewhere. Try it with an example file.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="sec" id="research" tabIndex={-1} aria-labelledby="research-title">
          <div className="wrap proof">
            <div>
              <div className="eyebrow">Research</div>
              <h2 id="research-title" style={{ fontSize: "clamp(34px,3.8vw,48px)", fontWeight: 700, margin: "14px 0 0" }}>Grounded in published research</h2>
            </div>
            <ul className="proof-list">
              <li><span>Method</span><p>Built on the data-driven roadmapping (DDRM) approach published in <a href={LP_IEEE} target="_blank" rel="noopener noreferrer"><cite>IEEE Transactions on Engineering Management</cite></a> in 2022.</p></li>
              <li><span>Origin</span><p>Developed and tested in Computer Science at <a href="https://tu.ac.th" target="_blank" rel="noopener noreferrer">Thammasat University</a>.</p></li>
              <li><span>Testing</span><p>Gave the expected status in <b>all test scenarios</b> based on Thailand's Digital Industry roadmap, and was reviewed by a roadmapping expert.</p></li>
            </ul>
            <ol className="rtl in">
              <li><span className="rtl-y">2022</span><b>Method published</b><p>DDRM paper in IEEE TEM</p><a href={LP_IEEE} target="_blank" rel="noopener noreferrer">Read the journal ↗</a></li>
              <li><span className="rtl-y">Build</span><b>Developed</b><p>Computer Science, Thammasat University</p><a href="https://tu.ac.th" target="_blank" rel="noopener noreferrer">Thammasat University ↗</a></li>
              <li><span className="rtl-y">Test</span><b>Tested on a real roadmap</b><p>Thailand's Digital Industry roadmap, all scenarios passed</p><a href="#/" onClick={go("how")}>See how it works</a></li>
              <li className="now"><span className="rtl-y">Now</span><b>Available as a web app</b><p>Build a roadmap and add your first source</p><a href="#/roadmaps/new">Create a roadmap →</a></li>
            </ol>
          </div>
        </section>

        <section className="cta" aria-labelledby="cta-title">
          <div className="wrap">
            <h2 id="cta-title">Your roadmap was right when you wrote it. <span>Keep it that way.</span></h2>
            <p>Pick a template, shape it to your plan, and add your first source in a few minutes.</p>
            <div className="actions">
              {create}
              {savedCount > 0 && <a className="btn" href="#/roadmaps">Continue where you left off</a>}
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="f-grid">
            <div className="f-about">{brand}<p>A web app for building a technology roadmap and keeping it current with the sources you already read.</p></div>
            <div><h4>Product</h4><ul>
              <li><a href="#/roadmaps/new">Create a roadmap</a></li>
              <li><a href="#/roadmaps">My roadmaps</a></li>
            </ul></div>
            <div><h4>On this page</h4><ul>
              {sectionButtons.map(([id, label]) => <li key={id}><button type="button" onClick={() => lpScrollTo(id)}>{label}</button></li>)}
            </ul></div>
            <div><h4>Project</h4><ul><li><span style={{ color: "#d9d4cd" }}>Computer Science, Thammasat University</span></li><li><span style={{ color: "#d9d4cd" }}>Research prototype, 2025</span></li></ul></div>
          </div>
          <div className="f-cite"><b>Data Driven Roadmap</b> is a research prototype by Krichpapath Lertprasertphakorn, advised by Dr. Nawarerk Chalarak, Computer Science, Thammasat University, 2025.<br />Research basis: Pora, Gerdsri, Thawesaengskulthai and Triukose, “Data-Driven Roadmapping (DDRM): Approach and Case Demonstration,” <cite>IEEE Transactions on Engineering Management</cite>, 2022.</div>
          <div className="f-bottom"><span>© 2025 Data Driven Roadmap</span><span><i />Your roadmaps and sources stay on your computer.</span></div>
        </div>
      </footer>
    </div>
  );
}

Object.assign(window, { Landing });

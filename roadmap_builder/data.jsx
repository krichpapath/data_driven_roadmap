/* global React */
// ─── Constants ────────────────────────────────────────────
const PESTLE = [
  { key: "P",  label: "Political",      color: "var(--c-rose)",   def: "Government policy, regulations, political stability" },
  { key: "E",  label: "Economic",       color: "var(--c-blue)",   def: "Markets, funding, GDP, trade dynamics" },
  { key: "S",  label: "Social",         color: "var(--c-teal)",   def: "Demographics, culture, workforce attitudes" },
  { key: "T",  label: "Technological",  color: "var(--c-violet)", def: "Innovation pace, R&D, infrastructure" },
  { key: "L",  label: "Legal",          color: "var(--c-amber)",  def: "Compliance, IP, data privacy laws" },
  { key: "En", label: "Environmental",  color: "var(--c-green)",  def: "Sustainability, climate, resource use" },
];

const PALETTE = [
  "var(--c-blue)", "var(--c-teal)", "var(--c-violet)",
  "var(--c-rose)", "var(--c-amber)", "var(--c-green)", "var(--c-slate)"
];

// ─── Templates ────────────────────────────────────────────
// The Industrial Digital template mirrors the structure in the
// "อุตสาหกรรมดิจิทัล" review document so a non-dev creating that
// roadmap can start 80% done and only edit/refine.
const TEMPLATES = [
  {
    id: "industrial-digital",
    name: "Industrial Digital",
    group: "Industry",
    tagline: "Tech roadmap for digital industry sectors (matches the อุตสาหกรรมดิจิทัล review doc)",
    layers: 7,
    bands: 3,
    items: 22,
    pestle: ["P","E","S","T","L"],
    bands_data: [
      { id: "b1", label: "2024 – 2026",  tag: "Short term",  color: "var(--c-amber)" },
      { id: "b2", label: "2027 – 2030",  tag: "Mid term",    color: "var(--c-rose)" },
      { id: "b3", label: "Beyond 2030",  tag: "Long term",   color: "var(--c-violet)" },
    ],
    categories: [
      { id: "bd",  label: "Business Drivers",   sub: "External forces shaping the industry",   color: "var(--c-blue)",   help: "Market, policy, and tech trends pushing change." },
      { id: "st",  label: "Strategic Targets",  sub: "What we want to achieve",                 color: "var(--c-teal)",   help: "High-level outcomes the roadmap must deliver." },
      { id: "dp",  label: "Products",           sub: "Things we ship",                          color: "var(--c-violet)", help: "Concrete digital products & platforms to build." },
      { id: "dpr", label: "Process",            sub: "How we work",                             color: "var(--c-rose)",   help: "New ways of operating & delivering value." },
      { id: "rd",  label: "R&D Programs",       sub: "What we research",                        color: "var(--c-amber)",  help: "Investigations needed before products ship." },
      { id: "inf", label: "Infrastructure",     sub: "Underlying capability",                   color: "var(--c-green)",  help: "Compute, storage, networks & platforms." },
      { id: "res", label: "Resources",          sub: "People, data, skills",                    color: "var(--c-slate)",  help: "Human capital and data assets." },
    ],
    items: [
      { name: "Growth of Generative AI",                      catId: "bd",  bands: ["b1"],            pestle: ["T"] },
      { name: "Foreign Direct Investment in ASEAN",           catId: "bd",  bands: ["b1"],            pestle: ["E"] },
      { name: "Data Complexity",                              catId: "bd",  bands: ["b1"],            pestle: ["T"] },
      { name: "Geopolitical Ecosystem",                       catId: "bd",  bands: ["b1","b2"],       pestle: ["P","E"] },
      { name: "Human vs AI Ecosystem",                        catId: "bd",  bands: ["b2","b3"],       pestle: ["T","S"] },
      { name: "Robust Data Management",                       catId: "st",  bands: ["b1"],            pestle: ["T"] },
      { name: "Become Regional Key Player in ASEAN",          catId: "st",  bands: ["b1"],            pestle: ["E","P"] },
      { name: "Cross-Industries Adoption of AI",              catId: "st",  bands: ["b1","b2"],       pestle: ["T","E"] },
      { name: "Cross-Regional AI Platform",                   catId: "st",  bands: ["b2"],            pestle: ["T"] },
      { name: "Human + AI Work Distribution",                 catId: "st",  bands: ["b3"],            pestle: ["S","T"] },
      { name: "Thai Digital Platforms (NLP, CV, Big Data)",   catId: "dp",  bands: ["b1","b2","b3"],  pestle: ["T"] },
      { name: "CLMV Digital Services",                        catId: "dp",  bands: ["b2","b3"],       pestle: ["T","E"] },
      { name: "ASEAN Platforms & Services",                   catId: "dp",  bands: ["b3"],            pestle: ["T","E"] },
      { name: "Open Innovation Process",                      catId: "dpr", bands: ["b1","b2"],       pestle: ["S","E"] },
      { name: "Digital Sandbox & Digital Twins",              catId: "rd",  bands: ["b1","b2","b3"],  pestle: ["T"] },
      { name: "AI · NLP · Computer Vision · IoT · Smart City",catId: "rd",  bands: ["b1","b2","b3"],  pestle: ["T"] },
      { name: "Security: Blockchain, Cybersecurity",         catId: "rd",  bands: ["b1","b2","b3"],  pestle: ["T","L"] },
      { name: "High-Performance Compute Cluster",             catId: "inf", bands: ["b1","b2","b3"],  pestle: ["T"] },
      { name: "High-Performance Storage",                     catId: "inf", bands: ["b1","b2","b3"],  pestle: ["T"] },
      { name: "Managed ML Services",                          catId: "inf", bands: ["b1","b2","b3"],  pestle: ["T"] },
      { name: "Fair-Access Data Lake",                        catId: "res", bands: ["b1","b2","b3"],  pestle: ["T","L"] },
      { name: "Specialist Training (DE / DS / DA)",           catId: "res", bands: ["b1","b2","b3"],  pestle: ["S"] },
    ]
  },
  {
    id: "saas-product",
    name: "SaaS Product",
    group: "Product",
    tagline: "Quarterly product roadmap with themes, releases and dependencies",
    layers: 5,
    bands: 4,
    items: 0,
    pestle: ["E","S","T"],
    bands_data: [
      { id: "q1", label: "Q1 2026", tag: "Now",       color: "var(--c-blue)" },
      { id: "q2", label: "Q2 2026", tag: "Next",      color: "var(--c-teal)" },
      { id: "q3", label: "Q3 2026", tag: "Later",     color: "var(--c-violet)" },
      { id: "q4", label: "Q4 2026", tag: "Future",    color: "var(--c-slate)" },
    ],
    categories: [
      { id: "th", label: "Themes",        sub: "Strategic bets",        color: "var(--c-blue)",   help: "Big areas of investment for the year." },
      { id: "ep", label: "Epics",         sub: "Multi-quarter work",    color: "var(--c-teal)",   help: "Major efforts under each theme." },
      { id: "sh", label: "Ships",         sub: "Customer-visible",      color: "var(--c-violet)", help: "Releases users will actually see." },
      { id: "pl", label: "Platform",      sub: "Foundational",          color: "var(--c-amber)",  help: "Infra & platform improvements." },
      { id: "rs", label: "Research",      sub: "Discovery",             color: "var(--c-slate)",  help: "User research & spikes." },
    ],
    items: []
  },
  {
    id: "research-program",
    name: "Research Program",
    group: "Research",
    tagline: "Phased academic / R&D roadmap from hypothesis to publication",
    layers: 5,
    bands: 3,
    items: 0,
    pestle: ["S","T","En"],
    bands_data: [
      { id: "y1", label: "Year 1", tag: "Foundation",   color: "var(--c-teal)" },
      { id: "y2", label: "Year 2", tag: "Investigation",color: "var(--c-violet)" },
      { id: "y3", label: "Year 3", tag: "Synthesis",    color: "var(--c-amber)" },
    ],
    categories: [
      { id: "qq", label: "Questions",     sub: "What we want to know",  color: "var(--c-blue)",   help: "Open research questions to answer." },
      { id: "mt", label: "Methods",       sub: "How we'll find out",    color: "var(--c-teal)",   help: "Approaches, datasets, instruments." },
      { id: "ms", label: "Milestones",    sub: "Things to deliver",     color: "var(--c-violet)", help: "Papers, prototypes, datasets." },
      { id: "co", label: "Collaborators", sub: "Who we work with",      color: "var(--c-amber)",  help: "Partner labs, agencies, industry." },
      { id: "out",label: "Outcomes",      sub: "Real-world impact",     color: "var(--c-green)",  help: "What changes if this works." },
    ],
    items: []
  },
  {
    id: "blank",
    name: "Blank",
    group: "Basic",
    tagline: "Start from scratch. Define every layer and time band yourself.",
    layers: 3,
    bands: 3,
    items: 0,
    pestle: [],
    bands_data: [
      { id: "b1", label: "Now",      tag: "0–6 mo",   color: "var(--c-blue)" },
      { id: "b2", label: "Next",     tag: "6–18 mo",  color: "var(--c-teal)" },
      { id: "b3", label: "Later",    tag: "18+ mo",   color: "var(--c-violet)" },
    ],
    categories: [
      { id: "l1", label: "Layer 1", sub: "Rename me", color: "var(--c-blue)",   help: "" },
      { id: "l2", label: "Layer 2", sub: "Rename me", color: "var(--c-teal)",   help: "" },
      { id: "l3", label: "Layer 3", sub: "Rename me", color: "var(--c-violet)", help: "" },
    ],
    items: []
  }
];

// expand template into full state
function buildFromTemplate(tplId) {
  const tpl = TEMPLATES.find(t => t.id === tplId) || TEMPLATES[0];
  return {
    title: tpl.id === "industrial-digital"
      ? "Digital Industry: Technology Roadmap"
      : tpl.id === "blank"
      ? "Untitled Roadmap"
      : `${tpl.name} Roadmap`,
    bands: tpl.bands_data.map(b => ({ ...b })),
    categories: tpl.categories.map(c => ({ ...c })),
    items: tpl.items.map((it, i) => ({
      id: `i_${Date.now()}_${i}`,
      ...it,
      description: ""
    })),
    templateId: tpl.id
  };
}

// ─── Glossary ────────────────────────────────────────────
const GLOSSARY = {
  ddrm: {
    term: "DDRM",
    pill: "Concept",
    def: "<b>Data-Driven Roadmap.</b> A strategic plan, organized as a grid: <b>layers</b> (rows like Drivers, Products, Infra) crossed with <b>time bands</b> (columns like Now, Next, Later). Items live in cells."
  },
  layer: {
    term: "Layer",
    pill: "Row",
    def: "A horizontal row in the roadmap that groups items of the same kind, e.g. <b>Business Drivers</b>, <b>Products</b>, <b>R&D</b>. Stack layers from <b>why</b> at the top to <b>how</b> at the bottom."
  },
  band: {
    term: "Time band",
    pill: "Column",
    def: "A vertical column representing a horizon of time. Common patterns: Now / Next / Later, or 2024–26 / 2027–30 / Beyond 2030."
  },
  pestle: {
    term: "PESTLE",
    pill: "Tag",
    def: "Six-letter checklist for what kind of force an item is: <b>P</b>olitical, <b>E</b>conomic, <b>S</b>ocial, <b>T</b>echnological, <b>L</b>egal, <b>En</b>vironmental. Optional but useful for filtering."
  },
  item: {
    term: "Item",
    pill: "Card",
    def: "A single thing on your roadmap, such as a driver, a product or a milestone. Belongs to <b>one layer</b> and <b>one or more time bands</b>."
  }
};

window.PESTLE = PESTLE;
window.PALETTE = PALETTE;
window.TEMPLATES = TEMPLATES;
window.GLOSSARY = GLOSSARY;
window.buildFromTemplate = buildFromTemplate;

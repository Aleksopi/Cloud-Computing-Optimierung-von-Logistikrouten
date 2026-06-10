const pptxgen = require("pptxgenjs");
const p = new pptxgen();
p.defineLayout({ name: "W", width: 13.333, height: 7.5 });
p.layout = "W";
p.author = "Pharma Logistics CH";
p.title = "Optimierung von Logistikrouten";

// ── Palette (matches the embedded diagrams) ──────────────────────────────────
const NAVY = "1F3A5F", BLUE = "2E6DA4", TEAL = "2A9D8F", GREEN = "3A7D44",
      AMBER = "E09F3E", LIGHT = "F4F7FA", INK = "1C2733", SLATE = "52677D",
      WHITE = "FFFFFF", CARD = "FFFFFF", BORDER = "D8E0E8";
const HF = "Trebuchet MS", BF = "Calibri";
const A = "assets";

// Diagram aspect ratios (height / width)
const R = { architecture: 0.6145, optimization: 0.4524, pipeline: 0.3414, supplychain: 0.3921 };

// ── Helpers ──────────────────────────────────────────────────────────────────
function footer(s, n) {
  s.addText("Pharma Logistics CH · Optimierung von Logistikrouten", {
    x: 0.6, y: 7.06, w: 8, h: 0.3, fontFace: BF, fontSize: 9, color: "9AA7B4", align: "left",
  });
  s.addText(String(n), { x: 12.4, y: 7.06, w: 0.5, h: 0.3, fontFace: BF, fontSize: 9, color: "9AA7B4", align: "right" });
}

function title(s, t, sub) {
  s.addShape(p.ShapeType.rect, { x: 0.6, y: 0.52, w: 0.16, h: 0.42, fill: { color: AMBER } });
  s.addText(t, { x: 0.85, y: 0.42, w: 11.8, h: 0.62, fontFace: HF, fontSize: 30, bold: true, color: NAVY, align: "left" });
  if (sub) s.addText(sub, { x: 0.86, y: 1.04, w: 11.8, h: 0.4, fontFace: BF, fontSize: 14, italic: true, color: SLATE, align: "left" });
}

function content() {
  const s = p.addSlide();
  s.background = { color: LIGHT };
  return s;
}

// Rounded card with optional top color bar
function card(s, x, y, w, h, opts = {}) {
  s.addShape(p.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08,
    fill: { color: opts.fill || CARD }, line: { color: opts.line || BORDER, width: 1 },
    shadow: opts.shadow === false ? undefined : { type: "outer", blur: 6, offset: 2, angle: 90, color: "BBC6D2", opacity: 0.4 },
  });
}

function bullets(s, items, x, y, w, h, opts = {}) {
  s.addText(items.map((it) => ({
    text: it, options: { bullet: { code: "2022", indent: 14 }, color: opts.color || INK,
      fontSize: opts.fontSize || 15, fontFace: BF, paraSpaceAfter: opts.gap ?? 8, breakLine: true },
  })), { x, y, w, h, valign: "top", align: "left" });
}

function img(s, name, x, y, w) {
  s.addImage({ path: `${A}/${name}.png`, x, y, w, h: w * R[name] });
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 1 — Title (dark)
// ════════════════════════════════════════════════════════════════════════════
{
  const s = p.addSlide();
  s.background = { color: NAVY };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.18, fill: { color: AMBER } });
  s.addShape(p.ShapeType.rect, { x: 0.9, y: 2.25, w: 0.7, h: 0.16, fill: { color: AMBER } });
  s.addText("DHBW · CLOUD COMPUTING · 4. SEMESTER", { x: 0.9, y: 1.7, w: 11, h: 0.4, fontFace: BF, fontSize: 14, color: "9DB4D4", charSpacing: 2 });
  s.addText("Optimierung von Logistikrouten", { x: 0.85, y: 2.5, w: 11.6, h: 1.3, fontFace: HF, fontSize: 50, bold: true, color: WHITE });
  s.addText("Cloudbasierte Optimierung der Schweizer Apothekenlogistik nach Kosten, Zeit und Umweltauswirkungen",
    { x: 0.9, y: 3.95, w: 10.8, h: 0.8, fontFace: BF, fontSize: 19, italic: true, color: "CADCFC" });
  s.addText([
    { text: "Prototyp „Pharma Logistics CH“", options: { bold: true, color: WHITE } },
    { text: "    ·    Prototypische Anwendungslösung", options: { color: "9DB4D4" } },
  ], { x: 0.9, y: 5.7, w: 11, h: 0.4, fontFace: BF, fontSize: 15 });
  s.addText("Verfasser/in: [Name]   ·   Matrikelnr.: [____]   ·   [Datum]",
    { x: 0.9, y: 6.15, w: 11, h: 0.4, fontFace: BF, fontSize: 12, color: "7E93B0" });
  s.addNotes("Begrüßung. Thema: Optimierung von Logistikrouten am realen Anwendungsfall der Schweizer Apothekenlogistik. Ziel des Vortrags: zeigen, wie ein lauffähiger, cloudbasierter Prototyp Transportrouten gleichzeitig nach Kosten, Zeit und Umwelt optimiert — auf Basis echter Straßen- und Bevölkerungsdaten. Dauer ca. 10 Minuten.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 2 — Problem & Motivation
// ════════════════════════════════════════════════════════════════════════════
{
  const s = content();
  title(s, "Problem & Motivation", "Warum Logistikoptimierung wirtschaftlich und ökologisch zählt");
  const cw = 3.85, gap = 0.34, x0 = 0.6, y = 2.1, h = 3.3;
  const items = [
    [BLUE, "Kosten", "Transport ist ein zentraler Kostenblock jeder Lieferkette. Strecke, Fahrzeit und Fahrerlohn bestimmen die Betriebskosten."],
    [GREEN, "Umwelt", "Jeder gefahrene Kilometer verursacht CO₂. Kürzere, konsolidierte Touren senken die Emissionen unmittelbar."],
    [AMBER, "Komplexität", "Viele Stopps, begrenzte Fahrzeuge, Kapazitäten, Reichweiten und Öffnungszeiten — manuelle Planung stößt an Grenzen."],
  ];
  items.forEach(([c, head, body], i) => {
    const x = x0 + i * (cw + gap);
    card(s, x, y, cw, h);
    s.addShape(p.ShapeType.rect, { x, y, w: cw, h: 0.12, fill: { color: c } });
    s.addText(head, { x: x + 0.3, y: y + 0.4, w: cw - 0.6, h: 0.6, fontFace: HF, fontSize: 22, bold: true, color: c });
    s.addText(body, { x: x + 0.3, y: y + 1.15, w: cw - 0.6, h: 1.9, fontFace: BF, fontSize: 15, color: INK, valign: "top" });
  });
  s.addText("Schon kleine Effizienzgewinne pro Fahrt summieren sich über Flotte und Lieferzyklus zu erheblichen Einsparungen.",
    { x: 0.6, y: 5.75, w: 12.1, h: 0.5, fontFace: BF, fontSize: 15, italic: true, color: SLATE, align: "center" });
  footer(s, 2);
  s.addNotes("Logistik ist Kostentreiber und CO₂-Quelle zugleich. Gleichzeitig ist die Planung komplex: viele Stopps, begrenzte Fahrzeuge, Kapazitäten, Reichweiten, Öffnungszeiten. Genau hier setzt die algorithmische Optimierung an — kleine Effizienzgewinne pro Fahrt summieren sich über die gesamte Flotte zu erheblichen wirtschaftlichen und ökologischen Vorteilen.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 3 — Aufgabenstellung
// ════════════════════════════════════════════════════════════════════════════
{
  const s = content();
  title(s, "Aufgabenstellung");
  card(s, 0.6, 1.7, 12.1, 1.95, { fill: "EAF1F8", line: BLUE });
  s.addText([{ text: "„", options: { fontSize: 40, color: BLUE, bold: true } }],
    { x: 0.75, y: 1.7, w: 0.6, h: 0.8, fontFace: HF });
  s.addText("Transportrouten optimieren, um Kosten, Zeit und Umweltauswirkungen zu reduzieren — mit Graphenalgorithmen die effizientesten Wege zwischen Standorten finden, unter Berücksichtigung von Entfernung, Verkehr und Transportkapazität.",
    { x: 1.3, y: 1.9, w: 11.1, h: 1.5, fontFace: BF, fontSize: 19, italic: true, color: INK, valign: "middle" });
  const chips = [
    [BLUE, "Ziele", "Kosten · Zeit · Umwelt"],
    [TEAL, "Methodik", "Graphenalgorithmen"],
    [AMBER, "Faktoren", "Entfernung · Verkehr · Kapazität"],
  ];
  const cw = 3.85, gap = 0.34;
  chips.forEach(([c, head, body], i) => {
    const x = 0.6 + i * (cw + gap), y = 4.2, h = 1.7;
    card(s, x, y, cw, h);
    s.addShape(p.ShapeType.ellipse, { x: x + 0.3, y: y + 0.35, w: 0.5, h: 0.5, fill: { color: c } });
    s.addText(head, { x: x + 1.0, y: y + 0.32, w: cw - 1.2, h: 0.55, fontFace: HF, fontSize: 18, bold: true, color: NAVY, valign: "middle" });
    s.addText(body, { x: x + 0.3, y: y + 1.0, w: cw - 0.6, h: 0.55, fontFace: BF, fontSize: 15, color: SLATE, valign: "middle" });
  });
  footer(s, 3);
  s.addNotes("Die Aufgabenstellung verlangt dreierlei: erstens Routen nach Kosten, Zeit und Umwelt optimieren; zweitens graphbasierte Algorithmen einsetzen; drittens die Faktoren Entfernung, Verkehr und Transportkapazität wirksam einbeziehen — nicht nur erwähnen. Genau diese drei Anforderungen strukturieren den weiteren Vortrag.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 4 — Analyse & Zielsetzung
// ════════════════════════════════════════════════════════════════════════════
{
  const s = content();
  title(s, "Analyse & Zielsetzung", "Ein zusammengesetztes, NP-schweres Optimierungsproblem");
  const cw = 5.95, gap = 0.3, y = 1.95, h = 2.35;
  const two = [
    [BLUE, "Standortproblem (p-Median)", "Wo Verteilzentren platzieren, sodass die nachfragegewichtete Distanz zu den Apotheken minimal ist?"],
    [TEAL, "Tourenplanung (VRP)", "Wie Fahrzeuge über die Stopps führen, sodass Kosten, Zeit und CO₂ unter allen Restriktionen minimal sind?"],
  ];
  two.forEach(([c, head, body], i) => {
    const x = 0.6 + i * (cw + gap);
    card(s, x, y, cw, h);
    s.addShape(p.ShapeType.rect, { x, y, w: 0.12, h, fill: { color: c } });
    s.addText(head, { x: x + 0.35, y: y + 0.3, w: cw - 0.6, h: 0.6, fontFace: HF, fontSize: 19, bold: true, color: c });
    s.addText(body, { x: x + 0.35, y: y + 1.0, w: cw - 0.65, h: 1.2, fontFace: BF, fontSize: 15, color: INK, valign: "top" });
  });
  card(s, 0.6, 4.55, 12.1, 1.0, { fill: NAVY, line: NAVY });
  s.addText("Mehrzielkonflikt: die schnellste Route ist nicht zwingend die günstigste oder emissionsärmste → die Gewichtung muss explizit steuerbar sein.",
    { x: 0.9, y: 4.55, w: 11.5, h: 1.0, fontFace: BF, fontSize: 16, color: WHITE, valign: "middle", bold: true });
  s.addText("Ziel: ein lauffähiger Prototyp, der diese Teilprobleme graphbasiert löst und den Optimierungsnutzen quantitativ nachweist.",
    { x: 0.6, y: 5.75, w: 12.1, h: 0.5, fontFace: BF, fontSize: 15, italic: true, color: SLATE, align: "center" });
  footer(s, 4);
  s.addNotes("Die Aufgabe zerfällt in zwei klassische, je NP-schwere Teilprobleme: die Standortwahl als p-Median und die Tourenplanung als Vehicle Routing Problem. Erschwerend kommt der Mehrzielkonflikt hinzu — schnell, günstig und sauber sind nicht dasselbe. Ziel ist ein Prototyp, der beides graphbasiert löst und den Nutzen messbar macht.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 5 — Lösungsidee: Pipeline
// ════════════════════════════════════════════════════════════════════════════
{
  const s = content();
  title(s, "Fachliche Idee der Lösung", "Vierstufige Berechnungs-Pipeline — Bedarf zuerst, dann Standort, Zuordnung, Route");
  img(s, "pipeline", 1.07, 2.35, 11.2);
  footer(s, 5);
  s.addNotes("Die Lösung ist eine vierstufige Pipeline. Bewusst beginnt sie mit dem Warenbedarf, damit Standortwahl und Zuordnung auf echten Bedarfszahlen beruhen. Schritt 2 platziert die Hubs per p-Median, Schritt 3 ordnet Apotheken kapazitätsbewusst nach Fahrzeit zu, Schritt 4 optimiert die Fahrzeugrouten. Jeder Schritt baut auf dem vorherigen auf und läuft asynchron im Hintergrund.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 6 — Systemarchitektur
// ════════════════════════════════════════════════════════════════════════════
{
  const s = content();
  title(s, "Systemarchitektur", "Sechs containerisierte Dienste, über Docker Compose orchestriert");
  img(s, "architecture", 0.6, 1.75, 7.5);
  const tx = 8.5, tw = 4.25;
  bullets(s, [
    "Frontend: React + MapLibre GL (interaktive Karte, Dashboard)",
    "Backend: FastAPI (REST-API, GeoJSON, Orchestrierung)",
    "Worker: Celery + Redis (asynchrone Pipeline)",
    "Datenbank: PostgreSQL + PostGIS (Persistenz)",
    "Routing: OSRM (reale Distanz + Fahrzeit)",
  ], tx, 2.4, tw, 3.6, { fontSize: 14.5, gap: 12 });
  footer(s, 6);
  s.addNotes("Die Architektur trennt Präsentation, Anwendung und Daten in sechs Container. Nginx leitet weiter, das FastAPI-Backend stößt die Pipeline an, die rechenintensive Arbeit läuft im Celery-Worker mit Redis als Broker. PostgreSQL mit PostGIS persistiert alles, OSRM liefert echte Straßendistanzen und Fahrzeiten. Damit sind Cloud-Betrieb, Asynchronität und Persistenz erfüllt.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 7 — Datenquellen
// ════════════════════════════════════════════════════════════════════════════
{
  const s = content();
  title(s, "Datenquellen", "Ausschließlich reale, frei verfügbare Daten");
  const data = [
    [BLUE, "OSM", "Apothekenstandorte", "≈ 400 Schweizer Apotheken aus OpenStreetMap / Overpass — Koordinaten und Metadaten."],
    [GREEN, "EU", "Bevölkerungsraster", "Eurostat Census Grid 2021 — 1-km²-Zellen als Proxy für den Warenbedarf je Apotheke."],
    [TEAL, "OSRM", "Straßennetz", "Schweizer OSM-Straßennetz (Geofabrik) — reale Distanzen und Fahrzeiten."],
  ];
  const cw = 3.85, gap = 0.34, y = 2.1, h = 3.4;
  data.forEach(([c, tag, head, body], i) => {
    const x = 0.6 + i * (cw + gap);
    card(s, x, y, cw, h);
    s.addShape(p.ShapeType.ellipse, { x: x + cw / 2 - 0.55, y: y + 0.4, w: 1.1, h: 1.1, fill: { color: c } });
    s.addText(tag, { x: x + cw / 2 - 0.55, y: y + 0.4, w: 1.1, h: 1.1, fontFace: HF, fontSize: 18, bold: true, color: WHITE, align: "center", valign: "middle" });
    s.addText(head, { x: x + 0.25, y: y + 1.7, w: cw - 0.5, h: 0.5, fontFace: HF, fontSize: 19, bold: true, color: NAVY, align: "center" });
    s.addText(body, { x: x + 0.3, y: y + 2.25, w: cw - 0.6, h: 1.0, fontFace: BF, fontSize: 14.5, color: INK, align: "center", valign: "top" });
  });
  footer(s, 7);
  s.addNotes("Alle Berechnungen beruhen auf realen, frei verfügbaren Daten: rund 400 Apothekenstandorte aus OpenStreetMap, das Eurostat-Bevölkerungsraster als Bedarfs-Proxy und das Schweizer Straßennetz für OSRM. Damit sind Distanzen und Fahrzeiten realistisch — keine Luftlinien, keine erfundenen Werte.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 8 — Optimierungslogik
// ════════════════════════════════════════════════════════════════════════════
{
  const s = content();
  title(s, "Optimierungslogik", "Verallgemeinerte Kosten — jede Zielgröße in ihrer echten Einheit");
  img(s, "optimization", 1.67, 1.85, 10.0);
  s.addText("Min-Max-normiert und gewichtet (Standard 0,40 / 0,35 / 0,25) — kleinster Score gewinnt; Gewichte steuern zusätzlich die Fahrzeugwahl.",
    { x: 0.6, y: 6.65, w: 12.1, h: 0.4, fontFace: BF, fontSize: 13.5, italic: true, color: SLATE, align: "center" });
  footer(s, 8);
  s.addNotes("Kern ist die Routenentscheidung nach verallgemeinerten Kosten. Für jeden möglichen nächsten Stopp werden die echten Grenzkosten gebildet: Kosten in CHF aus Distanz und Fahrerlohn, Zeit in Stunden, Umwelt in kg CO₂. Diese drei werden normiert, gewichtet und summiert — der Stopp mit dem kleinsten Score gewinnt. Entscheidend: die Zeit stammt aus echten Straßenfahrzeiten.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 9 — Entfernung, Verkehr, Kapazität
// ════════════════════════════════════════════════════════════════════════════
{
  const s = content();
  title(s, "Entfernung, Verkehr & Kapazität", "Wie die drei Faktoren wirksam in die Entscheidung eingehen");
  const cols = [
    [BLUE, "Entfernung", ["Reale OSRM-Straßendistanz", "Bestimmt Strecke, Kosten und CO₂", "Keine Luftlinie"]],
    [AMBER, "Verkehr", ["Echte OSRM-Fahrzeiten: Stadt ≠ Autobahn", "Zeit ≠ Distanz → eigene, schnellere Route", "+ Tageszeit-Simulation / TomTom Live"]],
    [TEAL, "Kapazität", ["Ladekapazität je Fahrzeug", "Lagerkapazität je Hub", "Harte Restriktion + Reichweite/Schicht"]],
  ];
  const cw = 3.85, gap = 0.34, y = 1.95, h = 3.95;
  cols.forEach(([c, head, lines], i) => {
    const x = 0.6 + i * (cw + gap);
    card(s, x, y, cw, h);
    s.addShape(p.ShapeType.rect, { x, y, w: cw, h: 0.7, fill: { color: c } });
    s.addText(head, { x: x + 0.3, y: y, w: cw - 0.6, h: 0.7, fontFace: HF, fontSize: 20, bold: true, color: (c === AMBER ? INK : WHITE), valign: "middle" });
    bullets(s, lines, x + 0.32, y + 0.95, cw - 0.6, 2.8, { fontSize: 15, gap: 12 });
  });
  s.addText("Weil die Fahrzeit aus echten Straßenzeiten kommt, verändert die Zeit-Gewichtung die Route real — auch ohne Live-Verkehr.",
    { x: 0.6, y: 6.15, w: 12.1, h: 0.5, fontFace: BF, fontSize: 14.5, italic: true, color: SLATE, align: "center" });
  footer(s, 9);
  s.addNotes("Die drei geforderten Faktoren gehen wirksam ein. Entfernung als reale Straßendistanz. Verkehr über echte OSRM-Fahrzeiten — ein Stadtkilometer dauert länger als ein Autobahnkilometer, deshalb ist Zeit nicht proportional zur Distanz; zusätzlich gibt es ein Tageszeit-Modell und optional TomTom-Echtzeit. Kapazität als harte Restriktion je Fahrzeug und je Hub, ergänzt um Reichweite und Schicht.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 10 — Algorithmen & Lieferkette
// ════════════════════════════════════════════════════════════════════════════
{
  const s = content();
  title(s, "Algorithmen & Lieferkette", "Graphbasiert auf dem realen OSRM-Straßennetz");
  img(s, "supplychain", 0.6, 2.0, 7.4);
  bullets(s, [
    "Kürzeste Wege: OSRM (Distanz + Fahrzeit)",
    "Standort: nachfragegewichteter Greedy-p-Median",
    "Touren: Greedy-Mehrziel-VRP (Insertion)",
    "Restriktionen: Kapazität, Reichweite, Schicht, Öffnungszeiten",
    "NP-schwer → Heuristik: gute Lösung in Sekunden",
  ], 8.25, 2.3, 4.5, 3.6, { fontSize: 14.5, gap: 12 });
  footer(s, 10);
  s.addNotes("Das System ist durchgehend graphbasiert: Standorte sind Knoten, Straßen sind Kanten. OSRM liefert kürzeste Wege, ein nachfragegewichteter p-Median platziert das mehrstufige Netz HQ–VZ–mVZ, und ein Greedy-Mehrziel-VRP konstruiert die Touren unter allen Restriktionen. Da beide Probleme NP-schwer sind, liefern die Heuristiken reproduzierbar in Sekunden praxistaugliche Lösungen.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 11 — Ergebnisse & Visualisierung
// ════════════════════════════════════════════════════════════════════════════
{
  const s = content();
  title(s, "Ergebnisse & Visualisierung", "Optimierungsgewinn gegenüber unkonsolidierten Einzelfahrten");
  const dims = [["Strecke", BLUE], ["Kosten", NAVY], ["Fahrzeit", AMBER], ["CO₂", GREEN]];
  const cw = 2.85, gap = 0.3, y = 2.0, h = 2.0;
  dims.forEach(([lab, c], i) => {
    const x = 0.6 + i * (cw + gap);
    card(s, x, y, cw, h, { fill: c, line: c });
    s.addText("▼", { x, y: y + 0.3, w: cw, h: 0.7, fontFace: BF, fontSize: 30, bold: true, color: (c === AMBER ? INK : WHITE), align: "center" });
    s.addText(lab, { x, y: y + 1.05, w: cw, h: 0.5, fontFace: HF, fontSize: 19, bold: true, color: (c === AMBER ? INK : WHITE), align: "center" });
    s.addText("gespart", { x, y: y + 1.5, w: cw, h: 0.4, fontFace: BF, fontSize: 13, color: (c === AMBER ? "5A4A2A" : "CADCFC"), align: "center" });
  });
  card(s, 0.6, 4.35, 12.1, 1.55, { fill: "EAF1F8", line: BLUE });
  s.addText([
    { text: "Quantifizierter Nachweis:  ", options: { bold: true, color: NAVY } },
    { text: "Das Dashboard beziffert die Einsparung der Mehrstopp-Optimierung gegenüber Einzelfahrten (je Apotheke eine Hin-/Rückfahrt) in km, CHF, Stunden und kg CO₂ — absolut und in Prozent.", options: { color: INK } },
  ], { x: 0.95, y: 4.5, w: 11.4, h: 0.9, fontFace: BF, fontSize: 15, valign: "middle" });
  s.addText("Sieben Analyse-Reiter (Übersicht · Last Mile · Hauptlauf · Hubs · Belieferung · Verkehr · CO₂) + interaktive Karte mit Lieferketten-Highlighting.",
    { x: 0.95, y: 5.35, w: 11.4, h: 0.5, fontFace: BF, fontSize: 13.5, italic: true, color: SLATE, valign: "middle" });
  footer(s, 11);
  s.addNotes("Den Nutzen weist der Prototyp quantitativ aus: Er vergleicht die konsolidierten Mehrstopp-Routen mit einer naiven Referenz aus Einzelfahrten und beziffert die Einsparung in Strecke, Kosten, Fahrzeit und CO₂ — absolut und prozentual, prominent im Dashboard. Sieben Analyse-Reiter und eine interaktive Karte machen jedes Ergebnis nachvollziehbar. Die konkreten Zahlen hängen von der Konfiguration ab.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 12 — Nutzen für Unternehmen & Umwelt
// ════════════════════════════════════════════════════════════════════════════
{
  const s = content();
  title(s, "Nutzen für Unternehmen & Umwelt");
  const cols = [
    [BLUE, "Wirtschaftlich", ["Geringere Transportkosten je Lieferzyklus", "Höhere Fahrzeug- und Lagerauslastung", "Konfigurierbar: Flotte, Gewichte, Parameter", "Reproduzierbare, datengetriebene Planung"]],
    [GREEN, "Ökologisch", ["Weniger gefahrene Kilometer → weniger CO₂", "Konsolidierte statt einzelner Touren", "CO₂ als gleichwertige Zielgröße im Score", "Transparenter Emissions-Ausweis je Fahrzeug"]],
  ];
  const cw = 5.95, gap = 0.3, y = 1.95, h = 4.0;
  cols.forEach(([c, head, lines], i) => {
    const x = 0.6 + i * (cw + gap);
    card(s, x, y, cw, h);
    s.addShape(p.ShapeType.rect, { x, y, w: cw, h: 0.75, fill: { color: c } });
    s.addText(head, { x: x + 0.35, y, w: cw - 0.6, h: 0.75, fontFace: HF, fontSize: 22, bold: true, color: WHITE, valign: "middle" });
    bullets(s, lines, x + 0.4, y + 1.05, cw - 0.75, 2.7, { fontSize: 16, gap: 14 });
  });
  footer(s, 12);
  s.addNotes("Der Nutzen ist doppelt. Wirtschaftlich: geringere Transportkosten, höhere Auslastung, eine reproduzierbare, konfigurierbare Planung statt manueller Schätzung. Ökologisch: weniger Kilometer bedeuten direkt weniger CO₂, weil Emissionen als gleichwertige Zielgröße in die Optimierung eingehen und der Ausweis je Fahrzeug transparent ist. Genau das fordert die Aufgabenstellung.");
}

// ════════════════════════════════════════════════════════════════════════════
// Slide 13 — Fazit & Ausblick (dark)
// ════════════════════════════════════════════════════════════════════════════
{
  const s = p.addSlide();
  s.background = { color: NAVY };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.18, fill: { color: AMBER } });
  s.addShape(p.ShapeType.rect, { x: 0.9, y: 0.95, w: 0.7, h: 0.16, fill: { color: AMBER } });
  s.addText("Fazit & Ausblick", { x: 0.85, y: 1.2, w: 11.6, h: 0.9, fontFace: HF, fontSize: 36, bold: true, color: WHITE });
  s.addText([
    { text: "Die Aufgabenstellung ist vollständig erfüllt: ", options: { bold: true, color: WHITE } },
    { text: "Ein lauffähiger, cloudbasierter Prototyp optimiert Logistikrouten graphbasiert nach Kosten, Zeit und Umwelt und bindet Entfernung, Verkehr und Kapazität wirksam ein — der Optimierungsgewinn wird quantitativ belegt.", options: { color: "CADCFC" } },
  ], { x: 0.9, y: 2.25, w: 11.4, h: 1.4, fontFace: BF, fontSize: 18, valign: "top" });
  s.addText("Ausblick", { x: 0.9, y: 3.95, w: 11, h: 0.5, fontFace: HF, fontSize: 18, bold: true, color: AMBER });
  bullets(s, [
    "Lokale Nachoptimierung (2-opt) bzw. Solver (OR-Tools) für noch bessere Touren",
    "Zeitabhängiges VRP mit echten Verkehrsprofilen",
    "Dynamische Re-Optimierung bei Störungen, mehrtägige Tourenplanung",
  ], 0.95, 4.5, 11.4, 1.7, { color: "E6EEF8", fontSize: 16, gap: 12 });
  s.addText("Vielen Dank — Fragen?", { x: 0.9, y: 6.45, w: 11, h: 0.5, fontFace: HF, fontSize: 18, italic: true, bold: true, color: WHITE });
  s.addNotes("Zusammenfassung: Der Prototyp erfüllt die Aufgabenstellung vollständig — autonome Bearbeitung von der Analyse bis zur lauffähigen Lösung, graphbasierte Optimierung nach Kosten, Zeit und Umwelt, wirksame Einbindung von Entfernung, Verkehr und Kapazität, plus quantitativer Einsparungsnachweis. Ausblick: Solver-basierte Touren, zeitabhängiges VRP, dynamische Re-Optimierung. Danke — gerne Fragen.");
}

p.writeFile({ fileName: "../Praesentation_Logistikrouten.pptx" }).then((f) => console.log("PPTX written:", f));

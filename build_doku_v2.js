// Build script v2: Projektausarbeitung "Pharma Logistics CH" als Word-Dokument (.docx)
// Überarbeitete Fassung – mit eingebetteten Abbildungen, Parameterbegründung,
// Datenfluss-Diagramm und einem auf Kapitel 9 bezogenen Fazit.
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak, ExternalHyperlink, TabStopType, LeaderType,
} = require("docx");

// ── A4 geometry ──────────────────────────────────────────────────────────────
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1440;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9026 DXA ≈ 602 px

// ── Colours ──────────────────────────────────────────────────────────────────
const C_PRIMARY = "1F4E79";   // dark blue
const C_ACCENT  = "2E75B6";   // medium blue
const C_HEADBG  = "D9E6F2";   // table header fill
const C_ROWALT  = "F2F6FB";   // zebra row
const C_GREY    = "555555";

// ── Helpers ──────────────────────────────────────────────────────────────────
function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] }); }
function h3(text) { return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] }); }

function p(content, opts = {}) {
  const runs = typeof content === "string" ? [new TextRun(content)] : content;
  return new Paragraph({
    children: runs,
    spacing: { after: opts.after ?? 120, line: 276 },
    alignment: opts.align ?? AlignmentType.JUSTIFIED,
    ...opts.extra,
  });
}
const t  = (s, o = {}) => new TextRun({ text: s, ...o });
const tb = (s) => new TextRun({ text: s, bold: true });
const tt = (s) => [new TextRun({ text: s, size: 18 })];

function bullet(content, level = 0) {
  const runs = typeof content === "string" ? [new TextRun(content)] : content;
  return new Paragraph({ numbering: { reference: "bullets", level }, children: runs,
    spacing: { after: 60, line: 270 }, alignment: AlignmentType.LEFT });
}
function numbered(content, ref) {
  const runs = typeof content === "string" ? [new TextRun(content)] : content;
  return new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs,
    spacing: { after: 60, line: 270 }, alignment: AlignmentType.LEFT });
}

// Figure: centred embedded image + italic caption ("Abbildung N: …")
const FIGDIR = "doku_assets/";
function figure(children, file, natW, natH, targetW, n, caption) {
  const data = fs.readFileSync(FIGDIR + file);
  const height = Math.round((targetW * natH) / natW);
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { before: 100, after: 40 },
    children: [new ImageRun({ data, type: "png", transformation: { width: targetW, height } })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: 180 },
    children: [
      new TextRun({ text: "Abbildung " + n + ": ", italics: true, bold: true, size: 17, color: C_GREY }),
      new TextRun({ text: caption, italics: true, size: 17, color: C_GREY }),
    ],
  }));
}

function makeTable(headers, rows, widths) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" };
  const borders = { top: border, left: border, bottom: border, right: border,
    insideHorizontal: border, insideVertical: border };
  const cellMargins = { top: 60, bottom: 60, left: 110, right: 110 };
  const headerRow = new TableRow({ tableHeader: true,
    children: headers.map((htext, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: C_HEADBG }, margins: cellMargins,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: htext, bold: true, color: C_PRIMARY, size: 18 })] })],
    })) });
  const bodyRows = rows.map((cells, r) => new TableRow({
    children: cells.map((cell, i) => {
      const runs = Array.isArray(cell) ? cell : [new TextRun({ text: String(cell), size: 18 })];
      return new TableCell({ width: { size: widths[i], type: WidthType.DXA },
        shading: r % 2 === 1 ? { type: ShadingType.CLEAR, fill: C_ROWALT } : undefined,
        margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: runs })] });
    }),
  }));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths,
    borders, rows: [headerRow, ...bodyRows] });
}

function link(text, url) {
  return new ExternalHyperlink({ link: url,
    children: [new TextRun({ text, style: "Hyperlink", size: 18 })] });
}

// ── Document body ────────────────────────────────────────────────────────────
const children = [];

// ===== TITLE PAGE =====
children.push(
  new Paragraph({ spacing: { before: 1900 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: "Cloud Computing & Big Data", bold: true, size: 32, color: C_ACCENT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 380 },
    children: [new TextRun({ text: "Optimierung von Logistikrouten", bold: true, size: 56, color: C_PRIMARY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
    children: [new TextRun({ text: "Prototyp", italics: true, size: 24, color: C_GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 560 },
    children: [new TextRun({ text: "„Pharma Logistics CH“", bold: true, size: 40, color: C_PRIMARY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 1200 },
    children: [new TextRun({ text: "Optimierung der Schweizer Apothekenversorgung", size: 26, color: C_GREY })] }),
);
children.push(new Table({
  width: { size: 6400, type: WidthType.DXA }, columnWidths: [2500, 3900], alignment: AlignmentType.CENTER,
  borders: { top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
  rows: [
    ["Modul:", "Cloud Computing & Big Data (4. Semester)"],
    ["Gruppe:", "A. Ferro, J. Haar, H. Schäfer"],
    ["Projekt:", "Optimierung von Logistikrouten"],
    ["Dokumenttyp:", "Projektausarbeitung"],
  ].map(([k, v]) => new TableRow({ children: [
    new TableCell({ width: { size: 2500, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 0, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, color: C_PRIMARY })] })] }),
    new TableCell({ width: { size: 3900, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 0, right: 0 },
      children: [new Paragraph({ children: [new TextRun({ text: v })] })] }),
  ] })),
}));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== TOC (static, dot leaders) – page numbers calibrated after PDF render =====
children.push(new Paragraph({ spacing: { after: 240 },
  children: [new TextRun({ text: "Inhaltsverzeichnis", bold: true, size: 32, color: C_PRIMARY })] }));
function tocLine(label, page, { sub = false } = {}) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 9000, leader: LeaderType.DOT }],
    spacing: { after: sub ? 40 : 80, line: 288 }, indent: sub ? { left: 480 } : undefined,
    children: [
      new TextRun({ text: label, bold: !sub, size: sub ? 20 : 22, color: sub ? "333333" : C_PRIMARY }),
      new TextRun({ text: "\t" + page, bold: !sub, size: sub ? 20 : 22, color: sub ? "333333" : C_PRIMARY }),
    ],
  });
}
const TOC = [
  ["1  Allgemeine Zielsetzung", "3"],
  ["2  Wahl des Anwendungsfalls: Schweizer Apothekenversorgung", "3"],
  ["3  Projektüberblick", "4"],
  ["4  Voranalyse / Analyse", "4"],
  ["5  Recherche", "5"],
  ["6  Grobkonzeption", "6"],
  ["7  Feinkonzeption der Optimierungspipeline", "7"],
  ["7.1  Schritt 1 – Warenbedarf berechnen", "8", true],
  ["7.2  Schritt 2 – Hub Placement", "8", true],
  ["7.3  Schritt 3 – Einzugsgebiete / Hub-Zuweisung", "9", true],
  ["7.4  Schritt 4 – Routenoptimierung", "10", true],
  ["7.5  Optimierungsmodell – verallgemeinerte Kosten", "10", true],
  ["7.6  Begründung der gewählten Parameter", "11", true],
  ["8  Umsetzung des Prototyps", "11"],
  ["9  Tests und Ergebnisse", "12"],
  ["10  Reflexion des eigenen Beitrags", "13"],
  ["11  Fazit", "14"],
  ["12  Quellen", "14"],
];
TOC.forEach(([label, page, sub]) => children.push(tocLine(label, page, { sub })));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== 1. Allgemeine Zielsetzung =====
children.push(h1("1  Allgemeine Zielsetzung"));
children.push(p([tb("Aufgabenstellung: "), t("Transportrouten sollen so optimiert werden, dass Kosten, Zeit und Umweltauswirkungen sinken. Über Graphenalgorithmen werden die effizientesten Wege zwischen den Standorten bestimmt – unter Berücksichtigung von Entfernung, Verkehr und Transportkapazität. Für Unternehmen mit Lieferketten ist Logistikoptimierung von hoher Bedeutung, weil sie erhebliche wirtschaftliche und ökologische Einsparungen ermöglicht.")]));
children.push(p("Das Projekt betrachtet Lieferungen nicht als isolierte Einzelfahrten, sondern als zusammenhängendes Netzwerk: Standorte (Zentrallager, Umschlagpunkte und zu beliefernde Apotheken) bilden die Knoten, die Straßenverbindungen die Kanten eines gewichteten Graphen. Auf diesem Graphen bestimmen Routing-Verfahren die jeweils günstigste Verbindung – wobei „günstig“ je nach Zielsetzung unterschiedlich definiert ist."));
children.push(p([
  t("Im Mittelpunkt stehen sechs Optimierungsfaktoren: "),
  tb("Kosten"), t(" (je Kilometer und Stunde), "), tb("Zeit"), t(" (reale Straßenfahrzeit), "),
  tb("Umweltauswirkungen"), t(" (CO₂-Emissionen), "), tb("Entfernung"), t(", "), tb("Verkehr"),
  t(" und "), tb("Transportkapazität"),
  t(". Diese Faktoren stehen häufig in Konflikt: Die kürzeste Strecke ist nicht zwangsläufig die schnellste, und die schnellste Route nicht die günstigste oder emissionsärmste. Eine gute Optimierung wägt diese Zielkonflikte bewusst gegeneinander ab. Schon kleine Verbesserungen bei Streckenführung und Fahrzeugauslastung summieren sich über viele Touren zu spürbaren Einsparungen – wirtschaftlich wie ökologisch."),
]));

// ===== 2. Anwendungsfall =====
children.push(h1("2  Wahl des Anwendungsfalls: Schweizer Apothekenversorgung"));
children.push(p("Als Anwendungsfall wurde die Versorgung der Apotheken in der Schweiz gewählt. Sie verbindet die Anforderungen eines lauffähigen Prototyps mit einem realistischen, aber überschaubaren Optimierungsproblem:"));
children.push(bullet([tb("Geografisch kompakt: "), t("Die Schweiz ist klein genug, dass sich das gesamte Straßennetz lokal verarbeiten lässt und die Rechenzeiten überschaubar bleiben.")]));
children.push(bullet([tb("Ausreichend große Datenbasis: "), t("Rund 400 Apotheken ergeben ein realistisches Verteil- und Tourenproblem – nicht trivial klein, aber beherrschbar.")]));
children.push(bullet([tb("Heterogene Verteilung: "), t("Die Apotheken sind landesweit verteilt, konzentrieren sich aber unterschiedlich stark in Städten und Ballungsräumen. So lassen sich Flächenverteilung und lokale Ballung zugleich analysieren.")]));
children.push(bullet([tb("Anspruchsvolle Topografie: "), t("Städte, ländliche Regionen, Seen und Gebirge lassen kürzeste und schnellste Strecke spürbar auseinanderfallen.")]));
children.push(bullet([tb("Gute Eignung für Visualisierung: "), t("Standorte, Hubs, Einzugsgebiete und Routen lassen sich auf einer Landkarte anschaulich darstellen – ideal für Hub-Planung und Routenoptimierung.")]));
figure(children, "fig1_uebersichtskarte.png", 1036, 703, 470, 1,
  "Übersichtskarte der Schweiz mit allen Apothekenstandorten – Screenshot aus dem Prototyp");

// ===== 3. Projektüberblick =====
children.push(h1("3  Projektüberblick"));
children.push(p([
  t("Der Prototyp trägt den Namen "), tb("„Pharma Logistics CH“"),
  t(" und ist eine vollständige Web-Anwendung, die für die rund 400 Schweizer Apotheken eine effiziente Lieferstruktur berechnet. Ausgehend von den Apothekenstandorten und der regionalen Bevölkerungsverteilung ermittelt das System, wo Lager und Umschlagpunkte am sinnvollsten liegen, welche Apotheke von welchem Standort beliefert wird und mit welchen Fahrzeugen und auf welchen Routen die Auslieferung erfolgt."),
]));
children.push(p("Konkret berechnet der Prototyp eine mehrstufige Lieferkette aus vier Ebenen:"));
children.push(bullet([tb("Hauptquartier (HQ): "), t("zentrales Lager (im Prototyp in Bern), durch das alle Waren laufen.")]));
children.push(bullet([tb("Verteilzentren (VZ): "), t("regionale Lager mit größerer Kapazität.")]));
children.push(bullet([tb("Mini-Verteilzentren (mVZ): "), t("lokale Umschlagpunkte mit kleinerer Kapazität.")]));
children.push(bullet([tb("Fahrzeugrouten: "), t("konkrete Touren von den Hubs zu den Apotheken (letzte Meile) sowie zwischen den Hubs (Hauptlauf/Backbone).")]));
children.push(p([t("Alle Berechnungen basieren auf "), tb("echten Daten"), t(":")]));
children.push(makeTable(
  ["Datenbasis", "Quelle", "Verwendung im Prototyp"],
  [
    ["Apothekenstandorte (≈ 400)", "OpenStreetMap / Overpass", "Knoten des Liefernetzes (Koordinaten, Stadt, Metadaten)"],
    ["Bevölkerungsraster (1 km²)", "Eurostat Census Grid", "Schätzung des Warenbedarfs je Apotheke (≈ 58.000 Zellen)"],
    ["Straßennetz Schweiz", "OpenStreetMap / Geofabrik via OSRM", "echte Straßendistanzen und Fahrzeiten für Zuweisung und Routing"],
  ],
  [2600, 2600, 3826],
));

// ===== 4. Voranalyse / Analyse =====
children.push(h1("4  Voranalyse / Analyse"));
children.push(p("Das Logistikproblem wird als Graph modelliert. Diese Sichtweise erlaubt es, die Aufgabe mit etablierten Graphen- und Routing-Verfahren zu lösen."));
children.push(h3("Knoten und Kanten"));
children.push(bullet([tb("Knoten: "), t("Apotheken, das Hauptquartier (HQ), die Verteilzentren (VZ) und die Mini-Verteilzentren (mVZ).")]));
children.push(bullet([tb("Kanten: "), t("Straßenverbindungen zwischen diesen Knoten, gewichtet mit der realen Straßendistanz (km) und der Fahrzeit (h).")]));
children.push(p([
  t("Entscheidend ist, dass Distanz und Fahrzeit "), tb("getrennt"),
  t(" modelliert werden und beide aus echten Straßendaten stammen. Ein 10-km-Abschnitt in der Stadt dauert länger als auf der Autobahn – die Fahrzeit ist also nicht proportional zur Entfernung. Genau dadurch unterscheiden sich eine zeit- und eine distanz-optimale Route, und der Faktor „Verkehr“ wird bereits ohne Live-Daten greifbar."),
]));
children.push(h3("Relevante Faktoren"));
children.push(p([
  t("In die Optimierung fließen ein: "), tb("Entfernung"), t(", "), tb("Fahrzeit"), t(", "), tb("Verkehr"),
  t(", "), tb("Nachfrage"), t(" (Warenbedarf je Apotheke), "), tb("Fahrzeugkapazität"), t(", "), tb("Kosten"),
  t(" (CHF/km und Fahrerlohn), "), tb("CO₂-Emissionen"), t(" sowie "), tb("Öffnungszeiten"),
  t(" von Apotheken und Hubs."),
]));
children.push(h3("Abgrenzung des Prototyps"));
children.push(p("Der Prototyp bildet die strategische und operative Planung einer Lieferstruktur ab (Bedarf, Standorte, Zuweisung, Touren), nicht jedoch eine vollständige Echtzeit-Disposition. Bestands- und Lagerhaltung sind über Kapazitäten vereinfacht, nicht als dynamische Bestandsführung. Live-Verkehr ist optional anbindbar (TomTom); Standard ist ein nachvollziehbares, deterministisches Modell auf Basis echter Straßenfahrzeiten."));

// ===== 5. Recherche =====
children.push(h1("5  Recherche"));
children.push(p("Vor der Konzeption wurden die fachlichen Grundlagen recherchiert. Die folgenden Themenfelder bilden das methodische Fundament des Prototyps."));
children.push(h3("Logistikoptimierung"));
children.push(p("Logistikoptimierung gestaltet Transport-, Lager- und Verteilprozesse so, dass vorgegebene Ziele (Kosten, Zeit, Service, Umwelt) bestmöglich erfüllt werden. Klassische Teilprobleme sind die Standortplanung (wo werden Lager errichtet?) und die Tourenplanung (in welcher Reihenfolge wird beliefert?)."));
children.push(h3("Graphenalgorithmen und Routing"));
children.push(p("Straßennetze werden als gewichtete Graphen dargestellt; kürzeste-Wege-Verfahren (z. B. nach Dijkstra) bestimmen die günstigste Verbindung zwischen zwei Punkten. Im Prototyp übernimmt dies die Open-Source-Routing-Engine OSRM, die auf dem realen OpenStreetMap-Straßennetz vorberechnete Wege sowie Distanz- und Zeitmatrizen liefert."));
children.push(h3("p-Median (Standortoptimierung)"));
children.push(p("Das p-Median-Problem sucht p Standorte so, dass die nachfragegewichtete Summe der Distanzen aller Nachfragepunkte zum jeweils nächsten Standort minimal wird. Es eignet sich daher gut für die Platzierung der Verteilzentren: Hubs werden dorthin gezogen, wo viel Bedarf besteht. Da die exakte Lösung NP-schwer ist, kommt ein Greedy-Verfahren zum Einsatz, das in jedem Schritt den Standort mit dem größten zusätzlichen Erreichbarkeitsgewinn wählt."));
children.push(h3("Vehicle Routing Problem (Tourenplanung)"));
children.push(p("Das Vehicle Routing Problem (VRP) verallgemeinert das Problem des Handlungsreisenden (TSP) um mehrere Fahrzeuge und Nebenbedingungen wie Kapazität, Reichweite und Zeitfenster. Auch das VRP ist NP-schwer; in der Praxis kommen Heuristiken zum Einsatz. Der Prototyp nutzt eine Greedy-Heuristik, die in jedem Schritt den nächsten Stopp mit den geringsten gewichteten Grenzkosten anhängt."));
children.push(h3("Cloud Computing, Containerisierung und Microservices"));
children.push(p("Containerisierung (Docker) verpackt jede Komponente mit ihren Abhängigkeiten in ein reproduzierbares Image; mehrere Container werden über Docker Compose orchestriert. Die Anwendung ist nach dem Microservice-Gedanken in getrennte Dienste (Frontend, Backend, Datenbank, Cache, Worker, Routing-Engine) zerlegt, die unabhängig betrieben und skaliert werden können. Die eingesetzten Werkzeuge sind in Kapitel 12 belegt."));

// ===== 6. Grobkonzeption =====
children.push(h1("6  Grobkonzeption"));
children.push(p("Eine Web-App nimmt die Standort- und Bevölkerungsdaten entgegen, führt darauf eine vierstufige Optimierungspipeline aus und visualisiert das Ergebnis interaktiv auf einer Karte mit zugehörigem Analyse-Dashboard. Die rechenintensive Pipeline läuft asynchron im Hintergrund, damit die Oberfläche jederzeit bedienbar bleibt."));
children.push(h3("Systemarchitektur"));
children.push(p("Das System ist als Verbund mehrerer containerisierter Dienste aufgebaut:"));
children.push(makeTable(
  ["Komponente", "Technologie", "Aufgabe"],
  [
    ["Frontend", "React + MapLibre GL + Vite", "Interaktive Karte, Pipeline-Steuerung, Analyse-Dashboard, Einstellungen"],
    ["Backend", "FastAPI (Python)", "REST-API, Orchestrierung der Pipeline"],
    ["Datenbank", "PostgreSQL + PostGIS", "Apotheken, Hubs, Zuweisungen, Routen, Konfiguration (georäumlich)"],
    ["Cache / Broker", "Redis", "Nachrichten-Broker für asynchrone Aufgaben"],
    ["Worker", "Celery", "Asynchrone Ausführung der Pipeline-Schritte"],
    ["Routing-Engine", "OSRM", "Echte Straßendistanzen und Fahrzeiten (Schweizer Straßennetz)"],
    ["Reverse Proxy", "Nginx", "Bündelt Frontend und API unter einer Adresse (Produktion)"],
    ["Orchestrierung", "Docker Compose", "Definiert und startet alle Dienste reproduzierbar"],
  ],
  [2100, 2700, 4226],
));
children.push(h3("Cloud-Bezug"));
children.push(bullet([tb("Containerisierung & reproduzierbare Umgebung: "), t("Jeder Dienst läuft in einem eigenen Docker-Container – identisch auf Entwicklungsrechner und Server; ein einziger Befehl (docker-compose up) startet die komplette Anwendung samt Datenbank und Routing-Engine.")]));
children.push(bullet([tb("Getrennte Services: "), t("Frontend, Backend, Datenbank, Cache, Worker und Routing sind entkoppelt und einzeln austausch- bzw. skalierbar.")]));
children.push(bullet([tb("Asynchrone Verarbeitung: "), t("Lang laufende Berechnungen werden über Redis und Celery in den Hintergrund verlagert, sodass die API antwortbereit bleibt.")]));
figure(children, "fig2_architektur.png", 2420, 1816, 462, 2,
  "Container- und Systemarchitektur der Anwendung – Eigene Darstellung, erstellt mit einer cloudbasierten Diagrammsoftware");

// ===== 7. Feinkonzeption der Optimierungspipeline =====
children.push(h1("7  Feinkonzeption der Optimierungspipeline"));
children.push(p("Den Kern des Prototyps bildet eine vierstufige Pipeline. Die Reihenfolge ist bewusst gewählt: Erst wird der Bedarf bestimmt, damit Standortwahl und Zuweisung auf echten Bedarfszahlen beruhen. Jeder Schritt schreibt sein Ergebnis in die Datenbank und ist Grundlage des nächsten."));
children.push(p([
  t("Abbildung 3 ordnet die Pipeline in den Gesamt-Datenfluss ein. Dieser gliedert sich in vier Phasen: "),
  tb("(1) Datenquellen"), t(" – Apothekenstandorte, Hub-Standorte, Bedarfswerte, Geodaten und das Straßennetz; "),
  tb("(2) Datenaufbereitung"), t(" – Bereinigung, Geokodierung, Normalisierung und Zuordnung der Standorte; "),
  tb("(3) Optimierung"), t(" – Distanz- und Fahrzeitberechnung, Zuweisung zu Hubs, Kapazitätsprüfung und Routenbildung; "),
  tb("(4) Ausgabe"), t(" – Kartenvisualisierung, Routenübersicht, Kennzahlen und Bewertung der Ergebnisse. Jede Phase übergibt ihr Ergebnis persistent an die nächste; die vier Optimierungsschritte unten bilden den Kern von Phase 3."),
]));
figure(children, "fig3_datenfluss.png", 2360, 860, 558, 3,
  "Datenfluss der Optimierungspipeline – von den Datenquellen über Aufbereitung und Optimierung bis zur Ausgabe (Eigene Darstellung)");
children.push(makeTable(
  ["Schritt", "Pipeline-Schritt", "Kurzbeschreibung", "Dauer"],
  [
    [tt("1"), tt("Warenbedarf"), [t("Bedarf je Apotheke aus Bevölkerung schätzen", { size: 18 })], tt("~1–2 min")],
    [tt("2"), tt("Hub Placement"), [t("Standorte für HQ, VZ und mVZ bestimmen", { size: 18 })], tt("~5–10 s")],
    [tt("3"), tt("Einzugsgebiete"), [t("Apotheken den Hubs nach Straßenfahrzeit zuweisen", { size: 18 })], tt("~2–3 min")],
    [tt("4"), tt("Routenoptimierung"), [t("Fahrzeugtouren nach Kosten/Zeit/CO₂ berechnen", { size: 18 })], tt("~1–2 min")],
  ],
  [900, 2100, 4626, 1400],
));

children.push(h2("7.1  Schritt 1 – Warenbedarf berechnen"));
children.push(p([t("Geschätzt wird, wie viele Wareneinheiten jede Apotheke pro Lieferzyklus benötigt. Grundlage ist das "), tb("Eurostat-Bevölkerungsraster"), t(" (1 km²-Zellen); der Bedarf richtet sich nach der Bevölkerung im Einzugsgebiet der Apotheke (geometrisches Catchment-Modell).")]));
children.push(numbered([t("Einzugsradius: "), tb("radius = min(⅔ × Distanz zur nächsten Konkurrenz-Apotheke, max_catchment_km)"), t(". Liegen Apotheken dicht beieinander, fällt das Einzugsgebiet kleiner aus.")], "s1"));
children.push(numbered([t("Alle Bevölkerungszellen innerhalb des Radius werden aufsummiert (vektorisiert über die Haversine-Distanz).")], "s1"));
children.push(numbered([t("Bedarf "), tb("= max(1, aufrunden(Bevölkerung / population_per_item))"), t(" – standardmäßig eine Einheit je 12.000 Einwohner.")], "s1"));
children.push(p([t("Ergebnis: Jede Apotheke erhält einen ganzzahligen "), tb("demand"), t("-Wert (typisch 1–15), der zugleich die Kreisgröße auf der Karte bestimmt.")]));
figure(children, "fig4_apotheken_bedarf.png", 971, 673, 466, 4,
  "Darstellung der Apothekenstandorte mit Bedarfsradius – Screenshot aus dem Prototyp");

children.push(h2("7.2  Schritt 2 – Hub Placement"));
children.push(p([t("Schritt 2 platziert das Verteilnetz: "), tb("1 HQ"), t(" (fest, z. B. Bern), eine bedarfsabhängige Zahl "), tb("VZ"), t(" (4–6) und darunter "), tb("mVZ"), t(". Verwendet wird ein "), tb("nachfragegewichteter Greedy-p-Median-Algorithmus"), t(".")]));
children.push(numbered([t("Aufbau einer vollständigen Haversine-Distanzmatrix über HQ und alle Apotheken.")], "s2"));
children.push(numbered([t("Jede Apotheke erhält ein Nachfragegewicht ("), tb("weight = demand / Mittelwert(demand)"), t("), damit Hubs zu nachfragestarken Regionen gezogen werden.")], "s2"));
children.push(numbered([t("Die VZ werden iterativ dort platziert, wo der gewichtete Erreichbarkeitsgewinn am größten ist. Nebenbedingungen: ≥ 40 km Abstand untereinander, ≥ 25 km vom HQ; dicht besiedelte (teure) Lagen werden über einen Lagerkosten-Term leicht bestraft.")], "s2"));
children.push(numbered([t("mVZ-Kandidaten werden analog platziert (engere Abstände, ≥ 18 km); ihre Zahl wird aus dem Gesamtbedarf abgeleitet.")], "s2"));
children.push(numbered([tb("Mindestauslastung: "), t("Nach einer kapazitätsbewussten Probe-Zuweisung werden Hubs unter 10 % Lagerauslastung entfernt und die Apotheken neu zugewiesen – solange, bis jeder verbleibende VZ/mVZ die Schwelle erreicht. Bedarf und Auslastung bestimmen so die endgültige Anzahl und Lage der Hubs.")], "s2"));
children.push(numbered([t("Jedem mVZ wird das nächstgelegene VZ als übergeordneter Hub zugeordnet; die HQ-Kapazität wird auf 130 % des Gesamtbedarfs gesetzt (Bedarf + 30 % Reserve). Außerdem werden Öffnungszeiten gesetzt (HQ 06–22, VZ 07–20, mVZ 08–18 Uhr).")], "s2"));
children.push(p([t("Ergebnis: 1 HQ + 4–6 VZ + bedarfsabhängig viele mVZ mit Koordinaten, Kapazitäten und Öffnungszeiten. Die zugrunde liegenden Parameter werden in Abschnitt 7.6 begründet.")]));
figure(children, "fig5_hubs.png", 1011, 712, 470, 5,
  "Darstellung der Hub-Standorte – Screenshot aus dem Prototyp");

children.push(h2("7.3  Schritt 3 – Einzugsgebiete / Hub-Zuweisung"));
children.push(p([t("Schritt 3 entscheidet, "), tb("welcher Hub welche Apotheke beliefert"), t(" – auf Basis "), tb("echter OSRM-Straßenfahrzeiten"), t(", nicht der Luftlinie.")]));
children.push(numbered([t("Mit einem einzigen OSRM-/table-Aufruf wird eine vollständige Distanz- und Zeitmatrix zwischen allen Apotheken und Hubs abgerufen.")], "s3"));
children.push(numbered([tb("HQ-Direktlieferung: "), t("Das HQ kann Apotheken innerhalb eines konfigurierbaren Radius (Standard 20 km Straßendistanz) direkt beliefern; außerhalb wird es als Kandidat ausgeschlossen.")], "s3"));
children.push(numbered([tb("Kapazitätsbewusste Zuweisung: "), t("Apotheken werden nach bester Fahrzeit sortiert (kürzeste zuerst) und dem nächstgelegenen Hub mit freier Kapazität zugewiesen. Sind alle Hubs voll, erfolgt eine protokollierte Überlauf-Zuweisung.")], "s3"));
children.push(numbered([t("Parallel (8 Threads) werden die echten Straßengeometrien von OSRM geladen, damit die Verbindungslinien dem realen Straßenverlauf folgen.")], "s3"));

children.push(h2("7.4  Schritt 4 – Routenoptimierung"));
children.push(p([t("Im letzten Schritt werden konkrete "), tb("Fahrzeugrouten"), t(" berechnet – für die letzte Meile (Hub → Apotheken) und den Hauptlauf/Backbone (HQ → VZ → mVZ). Eingesetzt wird ein "), tb("Greedy-Multi-Objektiv-VRP"), t(", das Kosten, Zeit und CO₂ gleichzeitig berücksichtigt.")]));
children.push(p([t("Die Optimierungsgewichte bestimmen zuerst die "), tb("Fahrzeugreihenfolge"), t(" pro Hub (Kostenfokus → günstigstes, Zeitfokus → schnellstes, Ökofokus → emissionsärmstes Fahrzeug) und steuern dann die "), tb("Stopp-Auswahl"), t(": angehängt wird der zulässige Stopp mit den geringsten gewichteten Grenzkosten. Pro Kandidat werden geprüft: Kapazität (Bedarf ≤ geladene Einheiten), Reichweite (gefahrene km + Rückweg ≤ Fahrzeugreichweite), Schichtzeit (Fahr- + Servicezeit ≤ Schichtlänge) und Öffnungszeiten der Apotheke.")]));
children.push(p([t("Ist kein zulässiger Stopp mehr möglich, kehrt das Fahrzeug zum Depot zurück und das nächste beginnt. Vordefiniert sind vier Fahrzeugtypen: "), tb("Sprinter"), t(" und "), tb("Klein-LKW"), t(" für die letzte Meile, "), tb("LKW"), t(" und "), tb("Zug"), t(" für den Hauptlauf. Optional erzwingt die Einstellung "), tb("„Alle Apotheken beliefern“"), t(" einen abschließenden Zwangslieferungs-Pass. Alle Routenlinien werden als echte OSRM-Straßengeometrien gezeichnet.")]));
figure(children, "fig6_routen.png", 1053, 734, 470, 6,
  "Visualisierung der berechneten Routen – Screenshot aus dem Prototyp");

children.push(h2("7.5  Optimierungsmodell – verallgemeinerte Kosten"));
children.push(p("Die Auswahl des jeweils nächsten Stopps erfolgt über einen gewichteten, normierten Multi-Objektiv-Score. Jedes Ziel minimiert die echte Grenzgröße des Stopps in seiner natürlichen Einheit:"));
children.push(bullet([tb("Kosten (CHF) "), t("= zusätzliche Strecke × CHF/km + zusätzliche Fahrzeit × Fahrerlohn.")]));
children.push(bullet([tb("Zeit (h) "), t("= zusätzliche, aus echten Straßendaten stammende Fahrzeit.")]));
children.push(bullet([tb("Umwelt (kg CO₂) "), t("= zusätzliche Strecke × CO₂ je km.")]));
children.push(p([t("Die drei Größen werden per Min-Max-Normierung vergleichbar gemacht und gewichtet summiert (Standard: "), tb("40 % Kosten, 35 % Zeit, 25 % Umwelt"), t("). Da die Zeit auf echten Straßenfahrzeiten beruht, erzeugt die Zeit-Minimierung nachweislich eine andere (schnellere) Route als die reine Distanz-Minimierung – der Faktor Verkehr wirkt bereits ohne Live-Daten; ein optionaler Traffic-Faktor bzw. die TomTom-Live-Matrix verschärfen den Effekt. Zum Nachweis des Nutzens berechnet Schritt 4 zusätzlich eine "), tb("Baseline"), t(" (jede Apotheke per Einzelfahrt ab ihrem Hub, ohne Konsolidierung); die Einsparung der konsolidierten Touren wird in km, CHF, Stunden und kg CO₂ ausgewiesen.")]));

children.push(h2("7.6  Begründung der gewählten Parameter"));
children.push(p("Die Modell- und Optimierungsparameter sind für den Prototyp bewusst vereinfacht, aber plausibel gewählt. Tabelle 1 fasst die wichtigsten Werte und ihre Begründung zusammen."));
children.push(makeTable(
  ["Parameter", "Wert (Prototyp)", "Begründung"],
  [
    ["Anzahl VZ (n_vz)", "4–6", "Für ~400 Apotheken genügen wenige regionale Lager; die Untergrenze sichert Flächenabdeckung, die Obergrenze vermeidet Überdimensionierung und teure Standorte."],
    ["Anzahl mVZ", "bedarfsabhängig", "Lokale Umschlagpunkte entstehen nur dort, wo Bedarf und Standortdichte sie tragen; aus dem Gesamtbedarf abgeleitet statt fix gesetzt."],
    ["VZ-/mVZ-Kapazität", "600 / 125 Einheiten", "Größenstaffelung bildet die reale Lagerhierarchie ab (regional vs. lokal); die Summe deckt den Gesamtbedarf inkl. Reserve."],
    ["Fahrzeugkapazität", "Sprinter 15 / Klein-LKW 40", "An die letzte Meile mit vielen kleinen Stopps angepasst; Backbone-Typen (LKW/Zug) bündeln große Mengen."],
    ["Einzugsradius", "max_catchment_km 10 km;\nHQ-Direktradius 20 km", "Begrenzt das Catchment auf plausible Nahversorgung; das HQ liefert nur nahe Apotheken direkt, der Rest läuft über Hubs."],
    ["Mindest-Auslastung", "hub_min_utilization 10 %", "Verhindert unwirtschaftliche Kleinst-Hubs: zu gering ausgelastete Hubs werden entfernt und neu zugewiesen."],
    ["Bedarf je Einheit", "population_per_item 12.000 Einw.", "Übersetzt Bevölkerung in Bedarf – bewusst grobe Annahme mangels realer Absatzzahlen."],
    ["Hub-Abstände", "VZ ≥ 40 km, mVZ ≥ 18 km,\n≥ 25 km vom HQ", "Erzwingen räumliche Streuung statt Clusterung, damit das Netz die Fläche abdeckt."],
  ],
  [2100, 2300, 4626],
));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 180 },
  children: [new TextRun({ text: "Tabelle 1: Zentrale Modell- und Optimierungsparameter mit Begründung.", italics: true, size: 17, color: C_GREY })] }));
children.push(p([
  t("Die Werte greifen ineinander: "), tb("Warenbedarf"), t(" (aus der Bevölkerungsdichte), "),
  tb("Standortdichte"), t(", "), tb("Routenplanung"), t(" und "), tb("Kapazitätsgrenzen"),
  t(" bedingen sich gegenseitig. Hoher Bedarf in dichten Regionen zieht mehr Hubs an; kürzere Wege erlauben mehr Stopps je Tour; die Kapazitäts- und Mindestauslastungsgrenzen begrenzen, wie viele Apotheken ein Hub bzw. Fahrzeug sinnvoll bedienen kann. So entsteht in Ballungsräumen ein dichteres, in dünn besiedelten Regionen ein weitmaschigeres Netz."),
]));
children.push(p("In einem produktiven Einsatz ließen sich diese Parameter anhand realer Unternehmensdaten, historischer Liefermengen und operativer Erfahrungswerte kalibrieren (z. B. tatsächliche Absatzzahlen statt Bevölkerungsschätzung, reale Lagerkapazitäten und Fahrzeugflotten)."));

// ===== 8. Umsetzung des Prototyps =====
children.push(h1("8  Umsetzung des Prototyps"));
children.push(p("Die Web-App gliedert sich in drei über die Navigationsleiste erreichbare Bereiche: die interaktive Karte mit Pipeline-Steuerung, das Analyse-Dashboard und die Einstellungen."));
children.push(h3("Interaktive Karte"));
children.push(p("Die Karte (MapLibre GL) zeigt je nach Pipeline-Fortschritt ein- und ausblendbare Layer: Apotheken (Kreisgröße = Warenbedarf; rot = nach Schritt 4 nicht belieferbar), Hubs (HQ, VZ, mVZ farblich unterschieden), Einzugsgebiete (Linien Hub → Apotheke), Backbone-Routen (HQ → VZ → mVZ) und Fahrzeugrouten (je Fahrzeugtyp eingefärbt). Per Klick öffnet sich ein Info-Panel; nicht zugehörige Routen werden abgedunkelt, sodass einzelne Lieferketten gezielt nachvollziehbar werden."));
figure(children, "fig7_hub_basel.png", 960, 674, 462, 7,
  "Detailansicht eines beispielhaften Hubs im Raum Basel – Screenshot aus dem Prototyp");
children.push(h3("Analyse-Dashboard"));
children.push(p("Nach Schritt 4 fasst ein mehrteiliges Dashboard die Ergebnisse zusammen: KPI-Karten (Gesamtkilometer, Gesamtkosten, CO₂), Kostenaufteilung, Fahrzeugauslastung sowie – prominent – der Optimierungsgewinn gegenüber den Einzelfahrten (−% bei km, CHF, Stunden und CO₂). Weitere Tabs behandeln letzte Meile, Hauptlauf, Hubs, Belieferbarkeit, Verkehr und Umwelt. Die konkreten Ergebniswerte werden in Kapitel 9 ausgewertet."));
children.push(h3("Einstellungen"));
children.push(p("Zur Laufzeit konfigurierbar sind: die Fahrzeugflotte, die Optimierungsgewichte (Slider Kosten/Zeit/Umwelt), das Verkehrsmodell (Tageszeit-Simulation oder TomTom-Live) sowie Systemparameter (Anzahl VZ/mVZ, Kapazitäten, HQ-Direktradius, Bedarfsparameter, Schicht- und Öffnungszeiten). Die vordefinierte Fahrzeugflotte:"));
children.push(makeTable(
  ["Fahrzeug", "Einsatz", "Kapazität", "Reichweite", "CHF/km", "CO₂/km", "Ø-Tempo"],
  [
    ["Sprinter", "Letzte Meile + Backbone", "15", "350 km", "0,38", "185 g", "65 km/h"],
    ["Klein-LKW", "Letzte Meile + Backbone", "40", "450 km", "0,70", "230 g", "70 km/h"],
    ["LKW", "Nur Backbone", "200", "600 km", "1,20", "280 g", "75 km/h"],
    ["Zug", "Nur Backbone", "1.000", "2.000 km", "3,20", "520 g", "90 km/h"],
  ],
  [1300, 2226, 1100, 1300, 1000, 1000, 1100],
));

// ===== 9. Tests und Ergebnisse =====
children.push(h1("9  Tests und Ergebnisse"));
children.push(p([t("Die fachliche Kernlogik ist durch eine "), tb("automatisierte pytest-Testsuite"), t(" abgesichert, die vollständig offline läuft (die OSRM-Matrix wird im Test deterministisch ersetzt). Geprüft werden insbesondere drei Bereiche:")]));
children.push(bullet([tb("Optimierungslogik: "), t("Jedes reine Gewicht wählt nachweislich den Stopp bzw. das Fahrzeug, das seine eigene Zielgröße minimiert; Zeit-Minimierung ergibt dank echter Straßenfahrzeiten eine andere Route als Distanz-Minimierung; Kapazitäts-, Reichweiten- und Öffnungszeit-Constraints greifen korrekt (nicht belieferbare Stopps erhalten einen nachvollziehbaren Grund).")]));
children.push(bullet([tb("Verkehrsmodell: "), t("Die Tageszeit-Simulation liefert in Spitzenstunden höhere Faktoren; der schichtgemittelte Stau-Faktor bleibt in plausiblen Grenzen.")]));
children.push(bullet([tb("Einsparungsmetrik: "), t("Die Konsolidierung mehrerer Stopps reduziert gegenüber der Einzelfahrten-Baseline nachweislich Kilometer und CO₂; Sonderfälle (keine Routen / kein Fahrzeug) werden sauber behandelt.")]));
children.push(p([t("Ergebnisse eines vollständigen Pipeline-Durchlaufs für die rund 400 Apotheken (Werte aus dem Analyse-Dashboard):")]));
children.push(makeTable(
  ["Kennzahl", "Optimierte Touren", "Baseline (Einzelfahrten)", "Einsparung"],
  [
    [[tb("Gesamtkilometer")], tt("9'560.3 km"), tt("16'492.6 km"), tt("−42.0 %  /  6'932.4 km")],
    [[tb("Gesamtkosten")], tt("CHF 16'189"), tt("CHF 30'689"), tt("−12.5 %  /  CHF 2'309")],
    [[tb("CO₂-Ausstoß")], tt("1'924.4 kg"), tt("3'051.1 kg"), tt("−36.9 %  /  1'126.8 kg")],
    [[tb("Fahrzeit")], tt("244.8 h"), tt("271.8 h"), tt("−9.9 %  /  27.0 h")],
  ],
  [2426, 2200, 2400, 2000],
));
children.push(p([
  t("Der Durchlauf berücksichtigt "), tb("36 Hubs"), t(" und "), tb("190 Fahrzeugrouten"),
  t(" (durchschnittlich 2,1 Stopps und 50,3 km je Route) bei einer mittleren Fahrzeugauslastung von "),
  tb("rund 32,1 %"), t(" (Sprinter 31,9 %, Klein-LKW 32,4 %); alle rund 400 Apotheken werden beliefert. Die Einsparung gegenüber den Einzelfahrten belegt den von der Aufgabenstellung geforderten Nutzen der Optimierung – wirtschaftlich (Kosten) wie ökologisch (CO₂).")]));

// ===== 10. Reflexion =====
children.push(h1("10  Reflexion des eigenen Beitrags"));
children.push(p("Das Projekt wurde eigenständig und durchgängig bearbeitet – von der Analyse bis zur lauffähigen Anwendung. Die Phasen umfassten Analyse und Graphmodellierung, Recherche (Logistikoptimierung, p-Median, VRP, Cloud-/Container-Technologien), Grob- und Feinkonzept, die Umsetzung von Backend, Pipeline, Datenbank und Frontend sowie die Dokumentation inklusive Tests."));
children.push(p("Die größten Herausforderungen lagen in:"));
children.push(bullet([tb("Datenmodellierung: "), t("heterogene Quellen (OSM-Apotheken, Eurostat-Raster, OSM-Straßennetz) in ein konsistentes Datenmodell überführen.")]));
children.push(bullet([tb("OSRM-Integration: "), t("Aufbau und Einbindung der Routing-Engine für reale Distanz-/Zeitmatrizen samt Geometrien – effizient über Batch-/Matrix-Aufrufe.")]));
children.push(bullet([tb("Asynchrone Pipeline: "), t("lang laufende Schritte über Celery/Redis entkoppeln und ihren Status sauber an die Oberfläche zurückmelden.")]));
children.push(bullet([tb("Multi-Kriterien-Optimierung: "), t("Kosten, Zeit und CO₂ in vergleichbare Einheiten bringen und nachvollziehbar gewichten.")]));
children.push(bullet([tb("Visualisierung: "), t("große Mengen an Punkten, Linien und Routen im Frontend performant darstellen, inkl. interaktiver Hervorhebung einzelner Lieferketten.")]));

// ===== 11. Fazit =====
children.push(h1("11  Fazit"));
children.push(p([
  t("Der Prototyp „Pharma Logistics CH“ zeigt vollständig und lauffähig, wie sich Logistikrouten für einen realistischen Anwendungsfall – die Versorgung von rund 400 Schweizer Apotheken – optimieren lassen. Aus echten Standort-, Bevölkerungs- und Straßendaten berechnet das System eine mehrstufige Lieferkette mit "),
  tb("36 Hubs"), t(" (1 HQ + 4–6 VZ + mVZ) und "), tb("190 Fahrzeugrouten"),
  t(", die alle rund 400 Apotheken bei einer mittleren Auslastung von rund 32,1 % bedienen."),
]));
children.push(p([
  t("Gegenüber der Baseline aus Einzelfahrten senken die konsolidierten Touren die Gesamtstrecke von 16'492.6 km auf "),
  tb("9'560.3 km (−42.0 %)"), t(", die Kosten von CHF 30'689 auf "), tb("CHF 16'189 (−12.5 %)"),
  t(", die CO₂-Emissionen von 3'051.1 kg auf "), tb("1'924.4 kg (−36.9 %)"), t(" und die Fahrzeit um "),
  tb("27.0 h (−9.9 %)"),
  t(". Die größte Wirkung entfällt damit auf Strecke und Emissionen. Die Hub-Verteilung folgt der Bevölkerungsdichte: In Ballungsräumen (z. B. Zürich, Basel, Genferseeraum) verdichten sich Hubs und Touren, während dünn besiedelte alpine Regionen längere Zubringer erfordern."),
]));
children.push(p([
  t("Die drei Zielgrößen "), tb("Kosten"), t(", "), tb("Zeit"), t(" und "), tb("Umwelt"),
  t(" werden nicht nur genannt, sondern über verallgemeinerte Grenzkosten gewichtet in die Routenwahl einbezogen. Weil die Fahrzeit aus echten Straßendaten stammt, weicht eine zeit-optimale Route real von einer distanz-optimalen ab – der Faktor Verkehr ist damit fachlich verankert. Der Baseline-Vergleich quantifiziert den Nutzen unmittelbar in eingesparten Kilometern, Kosten und Emissionen."),
]));
children.push(h3("Grenzen des Prototyps"));
children.push(bullet("Die Optimierungsverfahren sind Greedy-Heuristiken – schnell und nachvollziehbar, aber nicht garantiert optimal."));
children.push(bullet("Der Warenbedarf beruht auf einem vereinfachten geometrischen Catchment-Modell, nicht auf realen Verkaufszahlen."));
children.push(bullet("Lager- und Bestandshaltung sind über Kapazitäten vereinfacht, nicht als dynamische Bestandsführung abgebildet."));
children.push(h3("Mögliche Weiterentwicklungen"));
children.push(bullet("Durchgängige Anbindung echter Live-Verkehrsdaten (z. B. TomTom/HERE) inkl. periodischer Aktualisierung."));
children.push(bullet("Kalibrierung der Parameter mit realen Unternehmens- und Absatzdaten."));
children.push(bullet("Cloud-Deployment mit Orchestrierung (z. B. Kubernetes) und automatischer Skalierung der Worker."));
children.push(bullet("Stärkere VRP-Metaheuristiken (z. B. lokale Suche, Tabu-Suche, OR-Tools) für bessere Touren."));

// ===== 12. Quellen =====
children.push(h1("12  Quellen"));
children.push(p("Alle Quellen sind offizielle Dokumentationen, anerkannte Datenanbieter bzw. einschlägige Fachliteratur der eingesetzten Technologien, Daten und Methoden (zuletzt abgerufen 2026)."));
const sources = [
  ["Docker / Docker Compose – Dokumentation", "https://docs.docker.com/"],
  ["FastAPI – Dokumentation", "https://fastapi.tiangolo.com/"],
  ["PostgreSQL – Dokumentation", "https://www.postgresql.org/docs/"],
  ["PostGIS – Dokumentation", "https://postgis.net/documentation/"],
  ["Celery – Dokumentation", "https://docs.celeryq.dev/"],
  ["Redis – Dokumentation", "https://redis.io/docs/latest/"],
  ["OSRM (Open Source Routing Machine) – Projekt & Dokumentation", "https://project-osrm.org/"],
  ["OpenStreetMap", "https://www.openstreetmap.org/"],
  ["Overpass Turbo (OSM-Datenabfrage)", "https://overpass-turbo.eu/"],
  ["Geofabrik – OSM-Datenextrakte (Schweiz)", "https://download.geofabrik.de/europe/switzerland.html"],
  ["Eurostat / GISCO – Census Grid (Bevölkerungsraster)", "https://ec.europa.eu/eurostat/web/gisco/geodata/population-distribution/geostat"],
  ["MapLibre GL JS – Dokumentation", "https://maplibre.org/maplibre-gl-js/docs/"],
  ["TomTom – Developer / Routing API", "https://developer.tomtom.com/"],
  ["React – Dokumentation", "https://react.dev/"],
  ["NumPy – Dokumentation", "https://numpy.org/doc/stable/"],
  ["Dijkstra, E. W. – A Note on Two Problems in Connexion with Graphs", "https://www.cs.yale.edu/homes/lans/readings/routing/dijkstra-routing-1959.pdf"],
  ["MIT OpenCourseWare – Lecture 16: Dijkstra / Shortest Paths", "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/"],
  ["Google OR-Tools – Vehicle Routing Problem", "https://developers.google.com/optimization/routing/vrp"],
  ["Google OR-Tools – Routing Solver Overview", "https://developers.google.com/optimization/routing"],
  ["Laporte, G. – What You Should Know about the Vehicle Routing Problem", "https://ideas.repec.org/a/wly/navres/v54y2007i8p811-819.html"],
  ["Toth, P.; Vigo, D. – The Vehicle Routing Problem", "https://epubs.siam.org/doi/book/10.1137/1.9780898718515"],
  ["Toth, P.; Vigo, D. – Vehicle Routing: Problems, Methods, and Applications", "https://cris.unibo.it/handle/11585/520559"],
  ["Braekers, K. et al. – The Vehicle Routing Problem: State of the Art Classification and Review", "https://www.researchgate.net/publication/287796502"],
  ["Cornell University Optimization Wiki – Facility Location Problem", "https://optimization.cbe.cornell.edu/index.php?title=Facility_location_problem"],
  ["An, Y. et al. – Reliable p-Median Facility Location Problem", "https://optimization-online.org/wp-content/uploads/2012/12/3712.pdf"],
  ["European Environment Agency – Transport and Mobility", "https://www.eea.europa.eu/en/topics/in-depth/transport-and-mobility"],
  ["European Environment Agency – Specific CO₂ Emissions per Tonne-km", "https://www.eea.europa.eu/en/analysis/maps-and-charts/specific-co2-emissions-per-tonne-2-daviz"],
  ["GHG Protocol – Scope 3 Calculation Guidance", "https://ghgprotocol.org/scope-3-calculation-guidance-2"],
  ["GHG Protocol – Technical Guidance for Calculating Scope 3 Emissions", "https://ghgprotocol.org/sites/default/files/standards/Scope3_Calculation_Guidance_0.pdf"],
  ["GOV.UK / DEFRA – Greenhouse Gas Reporting: Conversion Factors 2025", "https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2025"],
];
sources.forEach(([name, url]) => {
  children.push(new Paragraph({ numbering: { reference: "src", level: 0 },
    spacing: { after: 40, line: 252 },
    children: [new TextRun({ text: name + " — ", size: 17 }), link(url, url)] }));
});

// ── Assemble document ────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Pharma Logistics CH",
  title: "Projektausarbeitung – Pharma Logistics CH",
  description: "Cloud Computing & Big Data – Optimierung von Logistikrouten",
  styles: {
    default: { document: { run: { font: "Arial", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: C_PRIMARY },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_ACCENT, space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, font: "Arial", color: C_ACCENT },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "333333" },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 600, hanging: 280 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 280 } } } },
      ] },
      { reference: "src", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "[%1]", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 620, hanging: 420 } } } },
      ] },
      ...["s1", "s2", "s3"].map((ref) => ({
        reference: ref, levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 600, hanging: 320 } } } },
        ],
      })),
    ],
  },
  sections: [{
    properties: { titlePage: true, page: { size: { width: PAGE_W, height: PAGE_H },
      margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } } },
    footers: {
      default: new (require("docx").Footer)({
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "Pharma Logistics CH – Projektausarbeitung   |   Seite ", size: 16, color: C_GREY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: C_GREY }),
          new TextRun({ text: " / ", size: 16, color: C_GREY }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: C_GREY }),
        ] })],
      }),
      first: new (require("docx").Footer)({ children: [new Paragraph({ children: [] })] }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("Projektdokumentation_Pharma_Logistics_CH.docx", buffer);
  console.log("OK: Projektdokumentation_Pharma_Logistics_CH.docx (" + buffer.length + " bytes)");
});

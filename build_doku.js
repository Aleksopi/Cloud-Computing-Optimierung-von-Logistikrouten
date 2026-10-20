// Build script: Projektausarbeitung "Pharma Logistics CH" als Word-Dokument (.docx)
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak, TableOfContents, ExternalHyperlink,
  TabStopType, LeaderType,
} = require("docx");

// ── A4 geometry ──────────────────────────────────────────────────────────────
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1440;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 9026 DXA

// ── Colours ──────────────────────────────────────────────────────────────────
const C_PRIMARY = "1F4E79";   // dark blue
const C_ACCENT  = "2E75B6";   // medium blue
const C_HEADBG  = "D9E6F2";   // table header fill
const C_ROWALT  = "F2F6FB";   // zebra row
const C_PLACE   = "FBE9D0";   // image-placeholder fill (warm)
const C_PLACEBD = "E0A458";   // image-placeholder border
const C_GREY    = "555555";

// ── Helpers ──────────────────────────────────────────────────────────────────
const cap = (s) => s;

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] });
}

// paragraph from string OR array of TextRun
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

function bullet(content, level = 0) {
  const runs = typeof content === "string" ? [new TextRun(content)] : content;
  return new Paragraph({
    numbering: { reference: "bullets", level },
    children: runs,
    spacing: { after: 60, line: 270 },
    alignment: AlignmentType.LEFT,
  });
}
function numbered(content, ref) {
  const runs = typeof content === "string" ? [new TextRun(content)] : content;
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    children: runs,
    spacing: { after: 60, line: 270 },
    alignment: AlignmentType.LEFT,
  });
}

// Image placeholder — single-cell shaded callout box (table borders serialise
// correctly; paragraph borders have a docx-js ordering quirk).
function imgPlaceholder(text) {
  const bd = { style: BorderStyle.DASHED, size: 6, color: C_PLACEBD };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    borders: { top: bd, left: bd, bottom: bd, right: bd,
      insideHorizontal: bd, insideVertical: bd },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: C_PLACE },
      margins: { top: 120, bottom: 120, left: 160, right: 160 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "🖼  ", color: C_GREY }),
          new TextRun({ text: text, italics: true, color: "7A4E12", bold: true }),
        ],
      })],
    })] })],
  });
}

// Value placeholder run (inline)
const valph = (s) => new TextRun({ text: s, bold: true, color: "C00000" });

// Generic table builder
function makeTable(headers, rows, widths) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" };
  const borders = { top: border, left: border, bottom: border, right: border,
    insideHorizontal: border, insideVertical: border };
  const cellMargins = { top: 60, bottom: 60, left: 110, right: 110 };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((htext, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: C_HEADBG },
      margins: cellMargins,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: htext, bold: true, color: C_PRIMARY, size: 18 })] })],
    })),
  });

  const bodyRows = rows.map((cells, r) => new TableRow({
    children: cells.map((cell, i) => {
      const runs = Array.isArray(cell) ? cell : [new TextRun({ text: String(cell), size: 18 })];
      return new TableCell({
        width: { size: widths[i], type: WidthType.DXA },
        shading: r % 2 === 1 ? { type: ShadingType.CLEAR, fill: C_ROWALT } : undefined,
        margins: cellMargins,
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ children: runs })],
      });
    }),
  }));

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    borders,
    rows: [headerRow, ...bodyRows],
  });
}

function spacer(after = 80) {
  return new Paragraph({ children: [], spacing: { after } });
}

function link(text, url) {
  return new ExternalHyperlink({
    link: url,
    children: [new TextRun({ text, style: "Hyperlink", size: 18 })],
  });
}

// ── Document ─────────────────────────────────────────────────────────────────
const children = [];

// ===== TITLE PAGE =====
children.push(
  new Paragraph({ spacing: { before: 1800 } }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text: "Cloud Computing –", bold: true, size: 40, color: C_ACCENT })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: "Optimierung von Logistikrouten", bold: true, size: 56, color: C_PRIMARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: "Prototyp", italics: true, size: 24, color: C_GREY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: "„Pharma Logistics CH“", bold: true, size: 40, color: C_PRIMARY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1200 },
    children: [new TextRun({ text: "Optimierung der Schweizer Apothekenversorgung", size: 26, color: C_GREY })],
  }),
);
// title page meta box
children.push(new Table({
  width: { size: 6000, type: WidthType.DXA },
  columnWidths: [2400, 3600],
  alignment: AlignmentType.CENTER,
  borders: { top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE },
    bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
    insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
  rows: [
    ["Modul:", "Cloud Computing (4. Semester)"],
    ["Hochschule:", "DHBW"],
    ["Projekt:", "Optimierung von Logistikrouten"],
    ["Dokumenttyp:", "Projektausarbeitung"],
  ].map(([k, v]) => new TableRow({ children: [
    new TableCell({ width: { size: 2400, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 0, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: k, bold: true, color: C_PRIMARY })] })] }),
    new TableCell({ width: { size: 3600, type: WidthType.DXA }, margins: { top: 40, bottom: 40, left: 0, right: 0 },
      children: [new Paragraph({ children: [new TextRun({ text: v })] })] }),
  ] })),
}));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== TOC (static, with dot leaders + real page numbers) =====
children.push(new Paragraph({
  spacing: { after: 240 },
  children: [new TextRun({ text: "Inhaltsverzeichnis", bold: true, size: 32, color: C_PRIMARY })],
}));
function tocLine(label, page, { sub = false } = {}) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 9000, leader: LeaderType.DOT }],
    spacing: { after: sub ? 40 : 80, line: 288 },
    indent: sub ? { left: 480 } : undefined,
    children: [
      new TextRun({ text: label, bold: !sub, size: sub ? 20 : 22, color: sub ? "333333" : C_PRIMARY }),
      new TextRun({ text: "\t" + page, bold: !sub, size: sub ? 20 : 22, color: sub ? "333333" : C_PRIMARY }),
    ],
  });
}
const tocEntries = [
  ["1  Allgemeine Zielsetzung", "3"],
  ["2  Wahl des Anwendungsfalls: Schweizer Apothekenversorgung", "3"],
  ["3  Projektüberblick", "4"],
  ["4  Voranalyse / Analyse", "4"],
  ["5  Recherche", "5"],
  ["6  Grobkonzeption", "6"],
  ["7  Feinkonzeption der Optimierungspipeline", "6"],
  ["7.1  Schritt 1 – Warenbedarf berechnen", "7", true],
  ["7.2  Schritt 2 – Hub Placement", "7", true],
  ["7.3  Schritt 3 – Einzugsgebiete / Hub-Zuweisung", "8", true],
  ["7.4  Schritt 4 – Routenoptimierung", "8", true],
  ["7.5  Optimierungsmodell – verallgemeinerte Kosten", "8", true],
  ["8  Umsetzung des Prototyps", "9"],
  ["9  Tests und Ergebnisse", "10"],
  ["10  Reflexion des eigenen Beitrags", "10"],
  ["11  Fazit / Summary", "11"],
  ["12  Quellen", "12"],
];
tocEntries.forEach(([label, page, sub]) => children.push(tocLine(label, page, { sub })));
children.push(new Paragraph({ children: [new PageBreak()] }));

// ===== 1. Allgemeine Zielsetzung =====
children.push(h1("1  Allgemeine Zielsetzung"));
children.push(p([tb("Ziel: "), t("In diesem Projekt werden Sie lernen, wie man Transportrouten optimiert, um Kosten, Zeit und Umweltauswirkungen zu reduzieren. Sie werden Graphenalgorithmen anwenden, um die effizientesten Wege zwischen verschiedenen Standorten zu finden, unter Berücksichtigung von Faktoren wie Entfernung, Verkehr und Transportkapazität. Logistikoptimierung ist für Unternehmen mit Lieferketten von entscheidender Bedeutung und kann erhebliche Einsparungen und Umweltvorteile bringen.")]));
children.push(p("Ausgehend von dieser Zielsetzung verfolgt das Projekt die Idee, Lieferungen nicht mehr als isolierte Einzelfahrten zu betrachten, sondern als zusammenhängendes Netzwerk aus Standorten und Verbindungen. Standorte (z. B. ein Zentrallager oder die zu beliefernden Kunden) werden als Knoten und die Straßenverbindungen zwischen ihnen als Kanten eines Graphen modelliert. Auf diesem Graphen lassen sich mit Graphen- und Routing-Algorithmen die günstigsten Wege bestimmen — wobei „günstig“ je nach Zielsetzung unterschiedlich definiert sein kann."));
children.push(p([
  t("Im Mittelpunkt stehen dabei sechs zentrale Optimierungsfaktoren: "),
  tb("Kosten"), t(" (Betriebs- und Personalkosten je gefahrenem Kilometer und je Stunde), "),
  tb("Zeit"), t(" (reale Fahrzeit im Straßennetz), "),
  tb("Umweltauswirkungen"), t(" (CO₂-Emissionen), "),
  tb("Entfernung"), t(", "), tb("Verkehr"), t(" sowie die "), tb("Transportkapazität"),
  t(" der eingesetzten Fahrzeuge. Diese Faktoren stehen häufig in Konflikt zueinander: Die kürzeste Strecke ist nicht zwangsläufig die schnellste, und die schnellste Route ist nicht immer die kostengünstigste oder emissionsärmste. Eine gute Optimierung muss diese Zielkonflikte bewusst gegeneinander abwägen."),
]));
children.push(p("Für Unternehmen mit Lieferketten ist Logistikoptimierung deshalb von hoher praktischer Relevanz: Transport verursacht einen erheblichen Teil der laufenden Kosten, bindet Personal und Fahrzeuge und ist ein wesentlicher Treiber des CO₂-Ausstoßes. Schon kleine prozentuale Verbesserungen bei Streckenführung und Fahrzeugauslastung summieren sich über viele Touren und Lieferzyklen zu spürbaren Einsparungen — wirtschaftlich wie ökologisch. Das vorliegende Projekt setzt dieses Prinzip an einem konkreten, realitätsnahen Anwendungsfall um."));

// ===== 2. Anwendungsfall =====
children.push(h1("2  Wahl des Anwendungsfalls: Schweizer Apothekenversorgung"));
children.push(p("Als konkreter Anwendungsfall wurde die Versorgung von Apotheken in der Schweiz gewählt. Die Entscheidung ist bewusst getroffen, weil dieser Fall die Anforderungen eines lauffähigen Prototyps gut mit einem realistischen Optimierungsproblem verbindet:"));
children.push(bullet([tb("Geografisch kompakt: "), t("Die Schweiz ist deutlich kleiner als z. B. Deutschland und dadurch als Datengrundlage für einen Prototyp besser handhabbar — das Straßennetz lässt sich vollständig lokal verarbeiten und die Rechenzeiten bleiben überschaubar.")]));
children.push(bullet([tb("Ausreichend große Datenbasis: "), t("Mit rund 400 Apotheken gibt es genügend Standorte, um ein realistisches Verteil- und Tourenproblem abzubilden — nicht trivial klein, aber noch beherrschbar.")]));
children.push(bullet([tb("Heterogene Verteilung: "), t("Die Apotheken sind über das gesamte Land verteilt, konzentrieren sich aber unterschiedlich stark in Städten und Ballungsräumen. Dadurch lassen sich regionale Flächenverteilung und lokale Ballung gleichzeitig analysieren.")]));
children.push(bullet([tb("Interessante Topografie: "), t("Städte, ländliche Regionen, Seen und Gebirge ergeben ein abwechslungsreiches Logistiknetz, in dem die kürzeste Strecke und die schnellste Strecke spürbar auseinanderfallen können.")]));
children.push(bullet([tb("Gute Eignung für Visualisierung: "), t("Standorte, Hubs, Einzugsgebiete und Routen lassen sich auf einer Landkarte anschaulich darstellen — ideal für Hub-Planung und Routenoptimierung.")]));
children.push(bullet([tb("Realitätsnah, aber überschaubar: "), t("Der Fall ist praxisnah genug, um die Optimierungsfaktoren sinnvoll zu demonstrieren, und gleichzeitig klein genug, um im Rahmen eines Projekts vollständig umgesetzt zu werden.")]));
children.push(imgPlaceholder("[Bild einfügen: Übersichtskarte der Schweiz mit allen Apothekenstandorten]"));

// ===== 3. Projektüberblick =====
children.push(h1("3  Projektüberblick"));
children.push(p([
  t("Der Prototyp trägt den Namen "), tb("„Pharma Logistics CH“"),
  t(" und ist eine vollständige Web-Anwendung, die für die rund 400 Schweizer Apotheken eine effiziente Lieferstruktur berechnet. Ausgehend von den Apothekenstandorten und der regionalen Bevölkerungsverteilung ermittelt das System, "),
  t("wo Lager und Umschlagpunkte am sinnvollsten liegen, welche Apotheke von welchem Standort beliefert wird und mit welchen Fahrzeugen und auf welchen Routen die Auslieferung erfolgen soll."),
]));
children.push(p("Konkret berechnet der Prototyp eine mehrstufige Lieferkette aus vier Ebenen:"));
children.push(bullet([tb("Hauptquartier (HQ): "), t("zentrales Lager (im Prototyp in Bern), durch das alle Waren laufen.")]));
children.push(bullet([tb("Verteilzentren (VZ): "), t("regionale Lager mit größerer Kapazität.")]));
children.push(bullet([tb("Mini-Verteilzentren (mVZ): "), t("lokale Umschlagpunkte mit kleinerer Kapazität.")]));
children.push(bullet([tb("Fahrzeugrouten: "), t("konkrete Touren von den Hubs zu den Apotheken (letzte Meile) sowie zwischen den Hubs (Hauptlauf/Backbone).")]));
children.push(p([t("Alle Berechnungen basieren auf "), tb("echten Daten"), t(". Als Datengrundlage dienen:")]));
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
children.push(bullet([tb("Kanten: "), t("Straßenverbindungen zwischen diesen Knoten, jeweils gewichtet mit der realen Straßendistanz (km) und der Fahrzeit (h).")]));
children.push(p([
  t("Entscheidend ist, dass Distanz und Fahrzeit "), tb("getrennt"),
  t(" modelliert werden und beide aus echten Straßendaten stammen. Ein 10-km-Abschnitt in der Stadt dauert länger als ein 10-km-Abschnitt auf der Autobahn — die Fahrzeit ist also nicht einfach proportional zur Entfernung. Genau dadurch unterscheiden sich eine zeit-optimale und eine distanz-optimale Route, und der Faktor „Verkehr“ wird bereits ohne Live-Daten greifbar."),
]));
children.push(h3("Relevante Faktoren"));
children.push(p([
  t("In die Optimierung fließen ein: "), tb("Entfernung"), t(", "), tb("Fahrzeit"), t(", "),
  tb("Verkehr"), t(", "), tb("Nachfrage"), t(" (Warenbedarf je Apotheke), "), tb("Fahrzeugkapazität"),
  t(", "), tb("Kosten"), t(" (CHF/km und Fahrerlohn), "), tb("CO₂-Emissionen"), t(" sowie "),
  tb("Öffnungszeiten"), t(" von Apotheken und Hubs."),
]));
children.push(h3("Abgrenzung des Prototyps"));
children.push(p("Der Prototyp ist bewusst fokussiert: Er bildet die strategische und operative Planung einer Lieferstruktur ab (Bedarf, Standorte, Zuweisung, Touren), nicht jedoch eine vollständige Echtzeit-Disposition. Bestands- und Lagerhaltung werden vereinfacht über Kapazitäten abgebildet, nicht als dynamische Bestandsführung. Live-Verkehr ist optional anbindbar (TomTom), Standard ist ein nachvollziehbares, deterministisches Modell auf Basis echter Straßenfahrzeiten."));

// ===== 5. Recherche =====
children.push(h1("5  Recherche"));
children.push(p("Vor der Konzeption wurden die fachlichen Grundlagen recherchiert. Die folgenden Themenfelder bilden das methodische Fundament des Prototyps."));
children.push(h3("Logistikoptimierung"));
children.push(p("Logistikoptimierung beschäftigt sich damit, Transport-, Lager- und Verteilprozesse so zu gestalten, dass vorgegebene Ziele (Kosten, Zeit, Service, Umwelt) bestmöglich erfüllt werden. Klassische Teilprobleme sind die Standortplanung (wo werden Lager errichtet?) und die Tourenplanung (in welcher Reihenfolge werden Kunden beliefert?)."));
children.push(h3("Graphenalgorithmen und Routing"));
children.push(p("Straßennetze werden als gewichtete Graphen dargestellt; kürzeste-Wege-Verfahren (z. B. nach Dijkstra) bestimmen die günstigste Verbindung zwischen zwei Punkten. Im Prototyp übernimmt diese Aufgabe die Open-Source-Routing-Engine OSRM, die auf dem realen OpenStreetMap-Straßennetz vorberechnete kürzeste Wege sowie Distanz- und Zeitmatrizen liefert."));
children.push(h3("p-Median (Standortoptimierung)"));
children.push(p("Das p-Median-Problem sucht p Standorte so, dass die (nachfragegewichtete) Summe der Distanzen aller Nachfragepunkte zum jeweils nächsten Standort minimal wird. Es eignet sich daher gut für die Platzierung der Verteilzentren: Hubs werden dorthin gezogen, wo viel Bedarf besteht. Da die exakte Lösung NP-schwer ist, wird ein Greedy-Verfahren eingesetzt, das in jedem Schritt den Standort mit dem größten zusätzlichen Erreichbarkeitsgewinn wählt."));
children.push(h3("Vehicle Routing Problem (Tourenplanung)"));
children.push(p("Das Vehicle Routing Problem (VRP) verallgemeinert das Problem des Handlungsreisenden (TSP) um mehrere Fahrzeuge und Nebenbedingungen wie Kapazität, Reichweite und Zeitfenster. Ziel ist es, alle Kunden mit möglichst geringem Gesamtaufwand zu bedienen. Auch das VRP ist NP-schwer; in der Praxis kommen Heuristiken zum Einsatz. Der Prototyp nutzt eine Greedy-Heuristik, die in jedem Schritt den nächsten Stopp mit den geringsten gewichteten Grenzkosten anhängt."));
children.push(h3("Cloud Computing, Containerisierung und Microservices"));
children.push(p("Cloud Computing stellt Rechen- und Speicherressourcen flexibel bereit. Containerisierung (Docker) verpackt jede Komponente mit ihren Abhängigkeiten in ein reproduzierbares Image; mehrere Container werden über Docker Compose orchestriert. Die Anwendung ist nach dem Microservice-Gedanken in getrennte Dienste (Frontend, Backend, Datenbank, Cache, Worker, Routing-Engine) zerlegt, die unabhängig betrieben und skaliert werden können."));
children.push(p([t("Die verwendeten Werkzeuge und ihre offiziellen Dokumentationen sind in "), tb("Kapitel 12 (Quellen)"), t(" aufgeführt.")]));

// ===== 6. Grobkonzeption =====
children.push(h1("6  Grobkonzeption"));
children.push(p("Die Gesamtidee lautet: Eine Web-App nimmt die Standort- und Bevölkerungsdaten entgegen, führt darauf eine vierstufige Optimierungspipeline aus und visualisiert das Ergebnis interaktiv auf einer Karte mit zugehörigem Analyse-Dashboard. Die rechenintensive Pipeline läuft asynchron im Hintergrund, damit die Oberfläche jederzeit bedienbar bleibt."));
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
children.push(bullet([tb("Containerisierung: "), t("Jeder Dienst läuft in einem eigenen Docker-Container — identisch auf dem Entwicklungsrechner und auf dem Server.")]));
children.push(bullet([tb("Reproduzierbare Umgebung: "), t("Ein einziger Befehl (docker-compose up) startet die komplette Anwendung samt Datenbank und Routing-Engine.")]));
children.push(bullet([tb("Getrennte Services: "), t("Frontend, Backend, Datenbank, Cache, Worker und Routing sind entkoppelt und einzeln austausch- bzw. skalierbar.")]));
children.push(bullet([tb("Asynchrone Verarbeitung: "), t("Lang laufende Berechnungen werden über Redis und Celery in den Hintergrund verlagert, sodass die API antwortbereit bleibt.")]));
children.push(imgPlaceholder("[Bild einfügen: Architekturdiagramm bzw. Abbildung der Container-Struktur (Docker Compose)]"));

// ===== 7. Feinkonzeption der Optimierungspipeline =====
children.push(h1("7  Feinkonzeption der Optimierungspipeline"));
children.push(p("Den Kern des Prototyps bildet eine vierstufige Pipeline. Die Reihenfolge ist bewusst gewählt: Erst wird der Bedarf bestimmt, damit Standortwahl und Zuweisung auf echten Bedarfszahlen beruhen. Jeder Schritt schreibt sein Ergebnis in die Datenbank und ist Grundlage des nächsten."));
children.push(makeTable(
  ["Schritt", "Pipeline-Schritt", "Kurzbeschreibung", "Typische Dauer"],
  [
    [tt("1"), tt("Warenbedarf"), [t("Bedarf je Apotheke aus Bevölkerung schätzen", {size:18})], tt("~1–2 min")],
    [tt("2"), tt("Hub Placement"), [t("Standorte für HQ, VZ und mVZ bestimmen", {size:18})], tt("~5–10 s")],
    [tt("3"), tt("Einzugsgebiete"), [t("Apotheken den Hubs nach Straßenfahrzeit zuweisen", {size:18})], tt("~2–3 min")],
    [tt("4"), tt("Routenoptimierung"), [t("Fahrzeugtouren nach Kosten/Zeit/CO₂ berechnen", {size:18})], tt("~1–2 min")],
  ],
  [900, 2100, 4626, 1400],
));

children.push(h2("7.1  Schritt 1 – Warenbedarf berechnen"));
children.push(p([t("Im ersten Schritt wird geschätzt, wie viele Wareneinheiten jede Apotheke pro Lieferzyklus benötigt. Grundlage ist das "), tb("Eurostat-Bevölkerungsraster"), t(" (1 km²-Zellen). Der Bedarf einer Apotheke richtet sich nach der Bevölkerung in ihrem Einzugsgebiet — ein geometrisches Catchment-Modell.")]));
children.push(numbered([t("Für jede Apotheke wird ein Einzugsradius bestimmt: "), tb("radius = min(⅔ × Distanz zur nächsten Konkurrenz-Apotheke, max_catchment_km)"), t(". Liegen Apotheken dicht beieinander, fällt ihr Einzugsgebiet entsprechend kleiner aus.")], "s1"));
children.push(numbered([t("Alle Bevölkerungszellen innerhalb dieses Radius werden aufsummiert (vektorisiert über die Haversine-Distanz).")], "s1"));
children.push(numbered([t("Der Bedarf ergibt sich als "), tb("Bedarf = max(1, aufrunden(Bevölkerung / population_per_item))"), t(" — standardmäßig eine Einheit je 12.000 Einwohner.")], "s1"));
children.push(p([t("Konfigurierbar sind u. a. "), tb("population_per_item"), t(" (Standard 12.000) und "), tb("max_catchment_km"), t(" (Standard 10 km). Ergebnis: Jede Apotheke erhält einen ganzzahligen "), tb("demand"), t("-Wert (typisch 1–15), der später auch die Kreisgröße auf der Karte bestimmt.")]));

children.push(h2("7.2  Schritt 2 – Hub Placement"));
children.push(p([t("Schritt 2 platziert das Verteilnetz: "), tb("1 HQ"), t(" (fest, z. B. Bern), eine bedarfsabhängige Zahl "), tb("VZ"), t(" (begrenzt auf 4–6) und darunter "), tb("mVZ"), t(" (ohne festes Maximum). Verwendet wird ein "), tb("nachfragegewichteter Greedy-p-Median-Algorithmus"), t(".")]));
children.push(numbered([t("Es wird eine vollständige Haversine-Distanzmatrix über HQ und alle Apotheken aufgebaut.")], "s2"));
children.push(numbered([t("Jede Apotheke erhält ein Nachfragegewicht ("), tb("weight = demand / Mittelwert(demand)"), t("), damit Hubs zu nachfragestarken Regionen gezogen werden.")], "s2"));
children.push(numbered([t("Die VZ werden iterativ (greedy) platziert — jeweils dort, wo der gewichtete Erreichbarkeitsgewinn am größten ist. Nebenbedingungen: ≥ 40 km Abstand untereinander, ≥ 25 km vom HQ. Zusätzlich werden dicht besiedelte (teure) Lagen über einen Lagerkosten-Term leicht bestraft.")], "s2"));
children.push(numbered([t("Anschließend werden mVZ-Kandidaten analog platziert (engere Abstände, ≥ 18 km). Ihre Zahl wird aus dem Gesamtbedarf abgeleitet.")], "s2"));
children.push(numbered([t("Mindestauslastung: Nach einer kapazitätsbewussten Probe-Zuweisung werden Hubs unter 10 % Lagerauslastung entfernt und die Apotheken neu zugewiesen — solange, bis jeder verbleibende VZ/mVZ die Schwelle erreicht. Bedarf und Auslastung bestimmen so die endgültige Anzahl und Lage der Hubs.")], "s2"));
children.push(numbered([t("Jedem mVZ wird das nächstgelegene VZ als übergeordneter Hub zugeordnet; die HQ-Lagerkapazität wird auf 130 % des Gesamtbedarfs gesetzt (100 % Bedarf + 30 % Reserve). Außerdem werden Öffnungszeiten gesetzt (HQ 06–22, VZ 07–20, mVZ 08–18 Uhr).")], "s2"));
children.push(p([t("Wichtige Parameter: "), tb("n_vz"), t(" (4–6), "), tb("vz_capacity"), t(" (600), "), tb("mvz_capacity"), t(" (125), "), tb("hub_min_utilization"), t(" (0,10) und "), tb("hq_storage_factor"), t(" (1,30). Ergebnis: 1 HQ + 4–6 VZ + bedarfsabhängig viele mVZ mit Koordinaten, Kapazitäten und Öffnungszeiten.")]));

children.push(h2("7.3  Schritt 3 – Einzugsgebiete / Hub-Zuweisung"));
children.push(p([t("Schritt 3 entscheidet, "), tb("welcher Hub welche Apotheke beliefert"), t(" — und zwar auf Basis "), tb("echter OSRM-Straßenfahrzeiten"), t(", nicht der Luftlinie.")]));
children.push(numbered([t("Mit einem einzigen OSRM-/table-Aufruf wird eine vollständige Distanz- und Zeitmatrix zwischen allen Apotheken und allen Hubs abgerufen.")], "s3"));
children.push(numbered([tb("HQ-Direktlieferung: "), t("Das HQ kann Apotheken innerhalb eines konfigurierbaren Radius (Standard 20 km Straßendistanz) direkt beliefern. Außerhalb dieses Radius wird das HQ als Kandidat ausgeschlossen.")], "s3"));
children.push(numbered([tb("Kapazitätsbewusste Zuweisung: "), t("Die Apotheken werden nach ihrer besten Fahrzeit sortiert (kürzeste zuerst) und jeweils dem nächstgelegenen Hub mit freier Lagerkapazität zugewiesen. Sind alle Hubs voll, erfolgt eine protokollierte Überlauf-Zuweisung.")], "s3"));
children.push(numbered([t("Für alle Zuweisungen werden parallel (8 Threads) die echten Straßengeometrien von OSRM geladen, damit die Verbindungslinien auf der Karte dem realen Straßenverlauf folgen.")], "s3"));
children.push(p([t("Ergebnis: Jede Apotheke trägt einen "), tb("hub_name"), t("; die Einzugsgebiet-Linien auf der Karte zeigen die Zuordnung Hub → Apotheke.")]));

children.push(h2("7.4  Schritt 4 – Routenoptimierung"));
children.push(p([t("Im letzten Schritt werden konkrete "), tb("Fahrzeugrouten"), t(" berechnet — sowohl für die letzte Meile (Hub → Apotheken) als auch für den Hauptlauf/Backbone (HQ → VZ → mVZ). Eingesetzt wird ein "), tb("Greedy-Multi-Objektiv-VRP"), t(", das gleichzeitig Kosten, Zeit und CO₂ berücksichtigt.")]));
children.push(p([t("Die Optimierungsgewichte bestimmen zuerst die "), tb("Fahrzeugreihenfolge"), t(" pro Hub (Kostenfokus → günstigstes, Zeitfokus → schnellstes, Ökofokus → emissionsärmstes Fahrzeug zuerst) und steuern anschließend die "), tb("Stop-Auswahl"), t(": Angehängt wird jeweils der zulässige Stopp mit den geringsten gewichteten Grenzkosten (zusätzliche CHF / Stunden / kg CO₂).")]));
children.push(p("Pro Kandidaten-Stopp werden folgende Constraints geprüft:"));
children.push(bullet([tb("Kapazität: "), t("Bedarf ≤ noch geladene Einheiten.")]));
children.push(bullet([tb("Reichweite: "), t("bereits gefahrene km + Hin- und Rückweg ≤ Fahrzeugreichweite.")]));
children.push(bullet([tb("Schichtzeit: "), t("verbrauchte Stunden + Fahrzeit + Servicezeit ≤ Schichtlänge.")]));
children.push(bullet([tb("Öffnungszeiten: "), t("die Ankunftszeit muss innerhalb der Öffnungszeiten der Apotheke liegen.")]));
children.push(p([t("Ist kein zulässiger Stopp mehr möglich, endet das Fahrzeug (zurück zum Depot) und das nächste beginnt. Vordefiniert sind vier Fahrzeugtypen: "), tb("Sprinter"), t(", "), tb("Klein-LKW"), t(", "), tb("LKW"), t(" und "), tb("Zug"), t(" — die ersten beiden für die letzte Meile, LKW und Zug für den Hauptlauf.")]));
children.push(p([t("Optional erzwingt die Einstellung "), tb("„Alle Apotheken beliefern“"), t(" einen abschließenden Zwangslieferungs-Pass, der auch sonst nicht belieferbare Apotheken bedient (unter bewusster Lockerung der Schicht- und Öffnungszeitgrenzen). Alle Routenlinien werden als echte OSRM-Straßengeometrien gezeichnet.")]));
children.push(imgPlaceholder("[Bild einfügen: Screenshot der Pipeline-Steuerung mit den vier Schritten]"));

children.push(h2("7.5  Optimierungsmodell – verallgemeinerte Kosten"));
children.push(p("Die Auswahl des jeweils nächsten Stopps erfolgt über einen gewichteten, normierten Multi-Objektiv-Score. Jedes Ziel minimiert die echte Grenzgröße des Stopps in seiner natürlichen Einheit:"));
children.push(bullet([tb("Kosten (CHF) "), t("= zusätzliche Strecke × CHF/km + zusätzliche Fahrzeit × Fahrerlohn.")]));
children.push(bullet([tb("Zeit (h) "), t("= zusätzliche, aus echten Straßendaten stammende Fahrzeit.")]));
children.push(bullet([tb("Umwelt (kg CO₂) "), t("= zusätzliche Strecke × CO₂ je km.")]));
children.push(p([t("Die drei Größen werden per Min-Max-Normierung vergleichbar gemacht und gewichtet summiert. Standard: "), tb("40 % Kosten, 35 % Zeit, 25 % Umwelt"), t(". Da die Zeit auf echten Straßenfahrzeiten beruht, erzeugt die Zeit-Minimierung nachweislich eine andere (schnellere) Route als die reine Distanz-Minimierung — der Faktor Verkehr wirkt damit bereits ohne Live-Daten. Ein optionaler "), tb("Traffic-Faktor"), t(" bzw. die TomTom-Live-Matrix verschärfen diesen Effekt.")]));
children.push(p([t("Zum Nachweis des Nutzens berechnet Schritt 4 zusätzlich eine "), tb("Baseline"), t(": Jede Apotheke würde per Einzelfahrt (eigene Hin- und Rückfahrt ab ihrem Hub, ohne Konsolidierung) beliefert. Die Einsparung der konsolidierten Touren gegenüber dieser Baseline wird in km, CHF, Stunden und kg CO₂ ausgewiesen.")]));

// ===== 8. Umsetzung des Prototyps =====
children.push(h1("8  Umsetzung des Prototyps"));
children.push(p("Die Web-App gliedert sich in drei Bereiche, die über die obere Navigationsleiste erreichbar sind: die interaktive Karte mit Pipeline-Steuerung, das Analyse-Dashboard und die Einstellungen."));
children.push(h3("Interaktive Karte"));
children.push(p("Die Karte (MapLibre GL) zeigt je nach Pipeline-Fortschritt verschiedene ein- und ausblendbare Layer:"));
children.push(bullet([tb("Apotheken "), t("(Kreisgröße = Warenbedarf; rot = nicht belieferbar nach Schritt 4),")]));
children.push(bullet([tb("Hubs "), t("(HQ, VZ, mVZ farblich unterschieden),")]));
children.push(bullet([tb("Einzugsgebiete "), t("(Linien Hub → Apotheke),")]));
children.push(bullet([tb("Backbone-Routen "), t("(HQ → VZ, VZ → mVZ) und")]));
children.push(bullet([tb("Fahrzeugrouten "), t("(je Fahrzeugtyp eingefärbt).")]));
children.push(p("Per Klick auf Apotheke, Hub oder Route öffnet sich ein Info-Panel; nicht zugehörige Routen werden abgedunkelt, sodass einzelne Lieferketten gezielt nachvollziehbar werden. Tooltips zeigen Detailwerte wie Bedarf, Auslastung, km und Kosten."));
children.push(imgPlaceholder("[Bild einfügen: Screenshot der interaktiven Karte nach abgeschlossener Pipeline]"));
children.push(h3("Analyse-Dashboard"));
children.push(p("Nach Schritt 4 fasst ein mehrteiliges Dashboard die Ergebnisse zusammen: KPI-Karten (Gesamtkilometer, Gesamtkosten, CO₂), Kostenaufteilung, Fahrzeugauslastung mit Balken sowie — prominent — der Optimierungsgewinn gegenüber den Einzelfahrten (−% bei km, CHF, Stunden und CO₂). Weitere Tabs behandeln letzte Meile, Hauptlauf, Hubs, Belieferbarkeit, Verkehr und Umwelt."));
children.push(imgPlaceholder("[Bild einfügen: Screenshot des Analyse-Dashboards (Übersicht mit KPIs und Einsparung)]"));
children.push(h3("Einstellungen"));
children.push(p("Im Einstellungsbereich lassen sich zur Laufzeit konfigurieren: die Fahrzeugflotte (Anlegen/Bearbeiten/Löschen je Fahrzeug), die Optimierungsgewichte (Slider Kosten/Zeit/Umwelt mit Voreinstellungen), das Verkehrsmodell (Tageszeit-Simulation oder TomTom-Live) sowie Systemparameter (Anzahl VZ/mVZ, Kapazitäten, HQ-Direktradius, Bedarfsparameter, Schicht- und Öffnungszeiten)."));
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
children.push(imgPlaceholder("[Bild einfügen: Screenshot der Einstellungen / Fahrzeugflotte]"));

// ===== 9. Tests und Ergebnisse =====
children.push(h1("9  Tests und Ergebnisse"));
children.push(p([t("Die fachliche Kernlogik ist durch eine "), tb("automatisierte pytest-Testsuite"), t(" abgesichert, die vollständig offline läuft (ohne OSRM, Datenbank oder Netzwerk — die OSRM-Matrix wird im Test deterministisch ersetzt). Geprüft werden insbesondere drei Bereiche:")]));
children.push(bullet([tb("Optimierungslogik: "), t("Jedes reine Gewicht wählt nachweislich den Stopp bzw. das Fahrzeug, das seine eigene Zielgröße minimiert (Kosten, Zeit, CO₂). Es wird zudem geprüft, dass Zeit-Minimierung dank echter Straßenfahrzeiten eine andere Route ergibt als Distanz-Minimierung, und dass Kapazitäts-, Reichweiten- und Öffnungszeit-Constraints korrekt greifen (nicht belieferbare Stopps erhalten einen nachvollziehbaren Grund).")]));
children.push(bullet([tb("Verkehrsmodell: "), t("Die Tageszeit-Simulation liefert in den Spitzenstunden höhere Faktoren als außerhalb; der schichtgemittelte Stau-Faktor bleibt in plausiblen Grenzen, und der statische vs. simulierte Faktor wird je nach Einstellung korrekt aufgelöst.")]));
children.push(bullet([tb("Einsparungsmetrik: "), t("Die Konsolidierung mehrerer Stopps reduziert gegenüber der Einzelfahrten-Baseline nachweislich Kilometer und CO₂; Sonderfälle (keine Routen / kein Fahrzeug) werden sauber behandelt.")]));
children.push(p([t("Beispielhafte Ergebnisse eines vollständigen Pipeline-Durchlaufs für die rund 400 Apotheken (konkrete Werte aus dem Analyse-Dashboard einsetzen):")]));
children.push(makeTable(
  ["Kennzahl", "Optimierte Touren", "Baseline (Einzelfahrten)", "Einsparung"],
  [
    [[tb("Gesamtkilometer")], [valph("[Wert einfügen: Gesamtkilometer]")], [valph("[Wert einfügen: km Baseline]")], [valph("[Wert: −% km]")]],
    [[tb("Gesamtkosten (CHF)")], [valph("[Wert einfügen: Gesamtkosten]")], [valph("[Wert einfügen: CHF Baseline]")], [valph("[Wert: −% CHF]")]],
    [[tb("CO₂-Ausstoß (kg)")], [valph("[Wert einfügen: CO2-Ausstoß]")], [valph("[Wert einfügen: kg Baseline]")], [valph("[Wert: −% CO₂]")]],
    [[tb("Fahrzeit (h)")], [valph("[Wert einfügen: Fahrzeit]")], [valph("[Wert einfügen: h Baseline]")], [valph("[Wert: −% h]")]],
  ],
  [2426, 2200, 2400, 2000],
));
children.push(p([t("Zusätzlich relevant: "), valph("[Wert einfügen: Anzahl Hubs (VZ/mVZ)]"), t(", "), valph("[Wert einfügen: Ø-Fahrzeugauslastung]"), t(" sowie "), valph("[Wert einfügen: Anzahl belieferter / nicht belieferbarer Apotheken]"), t(". Die Einsparung gegenüber den Einzelfahrten belegt den von der Aufgabenstellung geforderten Nutzen der Optimierung — wirtschaftlich (Kosten) wie ökologisch (CO₂).")]));

// ===== 10. Reflexion =====
children.push(h1("10  Reflexion des eigenen Beitrags"));
children.push(p("Das Projekt wurde eigenständig und durchgängig bearbeitet — von der Analyse bis zur lauffähigen Anwendung. Die einzelnen Phasen umfassten:"));
children.push(bullet([tb("Analyse "), t("des Problems und Modellierung als Graph (Knoten, Kanten, Faktoren);")]));
children.push(bullet([tb("Recherche "), t("zu Logistikoptimierung, p-Median, VRP sowie Cloud-/Container-Technologien;")]));
children.push(bullet([tb("Grobkonzept "), t("der Systemarchitektur (Microservices, Docker Compose);")]));
children.push(bullet([tb("Feinkonzept "), t("der vierstufigen Optimierungspipeline und des Optimierungsmodells;")]));
children.push(bullet([tb("Umsetzung "), t("von Backend, Pipeline, Datenbank und interaktivem Frontend; und")]));
children.push(bullet([tb("Dokumentation "), t("inklusive Tests und Auswertung.")]));
children.push(p("Die größten Herausforderungen lagen in:"));
children.push(bullet([tb("Datenmodellierung: "), t("heterogene Quellen (OSM-Apotheken, Eurostat-Raster, OSM-Straßennetz) in ein konsistentes Datenmodell überführen.")]));
children.push(bullet([tb("OSRM-Integration: "), t("Aufbau und Einbindung der Routing-Engine für reale Distanz- und Zeitmatrizen samt Geometrien — effizient über Batch-/Matrix-Aufrufe.")]));
children.push(bullet([tb("Asynchrone Pipeline: "), t("lang laufende Schritte über Celery/Redis entkoppeln und ihren Status sauber an die Oberfläche zurückmelden.")]));
children.push(bullet([tb("Multi-Kriterien-Optimierung: "), t("Kosten, Zeit und CO₂ in vergleichbare Einheiten bringen und in einem nachvollziehbaren, fachlich sauberen Score gewichten.")]));
children.push(bullet([tb("Visualisierung: "), t("große Mengen an Punkten, Linien und Routen im Frontend performant und übersichtlich darstellen, inkl. interaktiver Hervorhebung einzelner Lieferketten.")]));

// ===== 11. Fazit =====
children.push(h1("11  Fazit / Summary"));
children.push(p("Der Prototyp „Pharma Logistics CH“ zeigt vollständig und lauffähig, wie sich Logistikrouten für einen realistischen Anwendungsfall — die Versorgung von rund 400 Schweizer Apotheken — optimieren lassen. Aus echten Standort-, Bevölkerungs- und Straßendaten berechnet das System eine mehrstufige Lieferkette: Bedarf je Apotheke, optimale Hub-Standorte (p-Median), Hub-Zuweisung nach realer Fahrzeit und konkrete Fahrzeugtouren (VRP)."));
children.push(p([t("Die drei Zielgrößen "), tb("Kosten"), t(", "), tb("Zeit"), t(" und "), tb("Umwelt"), t(" werden nicht nur genannt, sondern über verallgemeinerte Grenzkosten (CHF, Stunden, kg CO₂) gewichtet in die Routenwahl einbezogen. Weil die Fahrzeit aus echten Straßendaten stammt, weicht eine zeit-optimale Route real von einer distanz-optimalen ab — der Faktor Verkehr ist damit fachlich verankert. Der Baseline-Vergleich gegen Einzelfahrten quantifiziert den Nutzen direkt in eingesparten Kilometern, Kosten und Emissionen.")]));
children.push(h3("Grenzen des Prototyps"));
children.push(bullet("Die Optimierungsverfahren sind Greedy-Heuristiken — schnell und nachvollziehbar, aber nicht garantiert optimal."));
children.push(bullet("Der Warenbedarf beruht auf einem vereinfachten geometrischen Catchment-Modell, nicht auf realen Verkaufszahlen."));
children.push(bullet("Lager- und Bestandshaltung sind über Kapazitäten vereinfacht, nicht als dynamische Bestandsführung abgebildet."));
children.push(bullet("Verkehr wird standardmäßig über reale Straßenfahrzeiten (und optional eine Tageszeit-Simulation) modelliert; durchgängiger Live-Verkehr ist optional (TomTom)."));
children.push(h3("Mögliche Weiterentwicklungen"));
children.push(bullet("Durchgängige Anbindung echter Live-Verkehrsdaten (z. B. TomTom/HERE) inkl. periodischer Aktualisierung."));
children.push(bullet("Größere bzw. länderübergreifende Datenmengen und damit verbundene Skalierung."));
children.push(bullet("Cloud-Deployment mit Orchestrierung (z. B. Kubernetes) und automatischer Skalierung der Worker."));
children.push(bullet("Stärkere VRP-Heuristiken bzw. Metaheuristiken (z. B. lokale Suche, Tabu-Suche, OR-Tools) für bessere Touren."));
children.push(bullet("Realistische Lager- und Bestandsplanung mit Nachschub- und Lagerhaltungskosten."));

// ===== 12. Quellen =====
children.push(h1("12  Quellen"));
children.push(p("Alle Quellen sind offizielle Dokumentationen bzw. anerkannte Datenanbieter der eingesetzten Technologien und Daten (zuletzt abgerufen 2026)."));
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
];
sources.forEach(([name, url]) => {
  children.push(new Paragraph({
    numbering: { reference: "src", level: 0 },
    spacing: { after: 50, line: 264 },
    children: [new TextRun({ text: name + " — ", size: 18 }), link(url, url)],
  }));
});

// helper used inside table cells (defined after use is fine for hoisted funcs)
function tt(s) { return [new TextRun({ text: s, size: 18, bold: false })]; }

// ── Assemble document ────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Pharma Logistics CH",
  title: "Projektausarbeitung – Pharma Logistics CH",
  description: "Cloud Computing – Optimierung von Logistikrouten",
  styles: {
    default: { document: { run: { font: "Arial", size: 21 } } }, // ~10.5pt body
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
      ...["s1","s2","s3"].map((ref) => ({
        reference: ref, levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 600, hanging: 320 } } } },
        ],
      })),
    ],
  },
  sections: [{
    properties: {
      page: { size: { width: PAGE_W, height: PAGE_H },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
    },
    footers: {
      default: new (require("docx").Footer)({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Pharma Logistics CH – Projektausarbeitung   |   Seite ", size: 16, color: C_GREY }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: C_GREY }),
            new TextRun({ text: " / ", size: 16, color: C_GREY }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: C_GREY }),
          ],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("Projektdokumentation_Pharma_Logistics_CH.docx", buffer);
  console.log("OK: Projektdokumentation_Pharma_Logistics_CH.docx geschrieben (" + buffer.length + " bytes)");
});

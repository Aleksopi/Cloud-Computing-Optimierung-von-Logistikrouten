const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, LevelFormat, TableOfContents,
  HeadingLevel, BorderStyle, WidthType, ShadingType, VerticalAlign,
  PageNumber, PageBreak,
} = require("docx");

// ── Layout constants (A4, 1" margins → content width 9026 DXA) ───────────────
const CW = 9026;
const NAVY = "1f3a5f", BLUE = "2e6da4", TEAL = "2a9d8f", LIGHT = "eef2f6",
      GREYBORDER = "C7D0DA", HEADBG = "1f3a5f", AMBER = "e09f3e";

// ── Helpers ──────────────────────────────────────────────────────────────────
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });

function P(runs, opts = {}) {
  const children = Array.isArray(runs)
    ? runs.map((r) => (typeof r === "string" ? new TextRun(r) : new TextRun(r)))
    : [typeof runs === "string" ? new TextRun(runs) : new TextRun(runs)];
  return new Paragraph({
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { after: opts.after ?? 140, line: 276 },
    children,
  });
}

const bullets = (items) =>
  items.map((it) => new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60, line: 268 },
    children: typeof it === "string" ? [new TextRun(it)]
      : it.map((r) => new TextRun(r)),
  }));

const numbered = (items, ref = "nums") =>
  items.map((it) => new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60, line: 268 },
    children: typeof it === "string" ? [new TextRun(it)] : it.map((r) => new TextRun(r)),
  }));

function caption(t) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 60, after: 200 },
    children: [new TextRun({ text: t, italics: true, size: 18, color: "52677d" })],
  });
}

function img(file, ratio, widthPx = 600, cap) {
  const data = fs.readFileSync(`assets/${file}`);
  const ext = file.split(".").pop();
  const out = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: cap ? 40 : 160 },
      children: [new ImageRun({
        type: ext,
        data,
        transformation: { width: widthPx, height: Math.round(widthPx * ratio) },
        altText: { title: cap || file, description: cap || file, name: file },
      })],
    }),
  ];
  if (cap) out.push(caption(cap));
  return out;
}

// Table builder. header = [..], rows = [[..],..], widths sum to CW.
function table(header, rows, widths, opts = {}) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: GREYBORDER };
  const borders = { top: border, bottom: border, left: border, right: border };
  const cellMargins = { top: 60, bottom: 60, left: 110, right: 110 };

  const headRow = new TableRow({
    tableHeader: true,
    children: header.map((h, i) => new TableCell({
      borders, width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: HEADBG, type: ShadingType.CLEAR }, margins: cellMargins,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 18 })] })],
    })),
  });

  const bodyRows = rows.map((r, ri) => new TableRow({
    children: r.map((c, i) => new TableCell({
      borders, width: { size: widths[i], type: WidthType.DXA },
      shading: { fill: ri % 2 ? "F4F7FA" : "FFFFFF", type: ShadingType.CLEAR },
      margins: cellMargins, verticalAlign: VerticalAlign.CENTER,
      children: String(c).split("\n").map((line) => new Paragraph({
        children: [new TextRun({ text: line, size: opts.size || 18, bold: (i === 0 && opts.boldFirst) })],
      })),
    })),
  }));

  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headRow, ...bodyRows],
  });
}

// ── Document content ──────────────────────────────────────────────────────────
const titlePage = [
  new Paragraph({ spacing: { before: 1400 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: "Projektdokumentation", size: 28, color: BLUE, bold: true, allCaps: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: "Optimierung von Logistikrouten", size: 56, bold: true, color: "1c2733" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 8 } },
    children: [] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 600 },
    children: [new TextRun({ text: "Ein cloudbasiertes System zur Optimierung der Schweizer Apothekenlogistik nach Kosten, Zeit und Umweltauswirkungen", size: 24, italics: true, color: "52677d" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: "Prototyp: „Pharma Logistics CH“", size: 24, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 },
    children: [new TextRun({ text: "Modul Cloud Computing · DHBW · 4. Semester", size: 22, color: "52677d" })] }),
  table(
    ["Feld", "Angabe"],
    [
      ["Thema", "Optimierung von Logistikrouten (Projekt 9)"],
      ["Art der Abgabe", "Schriftliche Dokumentation + Präsentation (Prototyp)"],
      ["Verfasser/in", "[Name eintragen]"],
      ["Matrikelnummer", "[Matrikelnummer eintragen]"],
      ["Betreuung", "[Dozent/in eintragen]"],
      ["Abgabedatum", "[Datum eintragen]"],
    ],
    [3000, 6026], { boldFirst: true, size: 20 }
  ),
  new Paragraph({ children: [new PageBreak()] }),
];

const toc = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Inhaltsverzeichnis")] }),
  new TableOfContents("Inhaltsverzeichnis", { hyperlink: true, headingStyleRange: "1-2" }),
  new Paragraph({ children: [new PageBreak()] }),
];

const body = [
  // 1
  H1("1  Einleitung"),
  P("Logistik- und Transportprozesse sind ein zentraler Kostentreiber und zugleich eine bedeutende Quelle von CO₂-Emissionen. Unternehmen mit Lieferketten stehen daher vor der Aufgabe, ihre Transportrouten so zu planen, dass Kosten, Zeit und Umweltauswirkungen gleichzeitig möglichst gering ausfallen. Bereits kleine Effizienzgewinne pro Fahrt summieren sich über eine Flotte und einen Lieferzyklus zu erheblichen Einsparungen — wirtschaftlich wie ökologisch."),
  P("Die vorliegende Arbeit dokumentiert die autonome Bearbeitung dieser Aufgabenstellung anhand eines lauffähigen Prototyps: eines cloudbasierten Systems zur Optimierung der Apothekenlogistik in der Schweiz. Für rund 400 Apotheken berechnet das System auf Basis echter Straßen- und Bevölkerungsdaten optimale Standorte eines mehrstufigen Verteilnetzes, den Warenbedarf je Apotheke, die Zuordnung der Apotheken zu Hubs sowie konkrete Fahrzeugrouten, die nach Kosten, Zeit und Emissionen optimiert werden."),
  P("Das Dokument folgt dem geforderten Bearbeitungsbogen — von der Analyse der Aufgabenstellung über Recherche, Grob- und Feinkonzeption bis zur Beschreibung der prototypischen Anwendungslösung — und stellt durchgängig den Bezug zwischen Aufgabenstellung und tatsächlicher Umsetzung im Projekt her."),

  // 2
  H1("2  Aufgabenstellung und Zielsetzung"),
  P("Die Aufgabenstellung lautet sinngemäß: Transportrouten sollen optimiert werden, um Kosten, Zeit und Umweltauswirkungen zu reduzieren. Dazu sind Graphenalgorithmen anzuwenden, um die effizientesten Wege zwischen verschiedenen Standorten zu finden — unter Berücksichtigung der Faktoren Entfernung, Verkehr und Transportkapazität. Logistikoptimierung wird als für Unternehmen mit Lieferketten entscheidend beschrieben, mit erheblichem Einspar- und Umweltpotenzial."),
  P("Daraus ergeben sich die folgenden konkreten Zielsetzungen für den Prototyp:"),
  ...bullets([
    [{ text: "Mehrzieloptimierung: ", bold: true }, "Fahrzeugrouten werden gleichzeitig nach Kosten, Zeit und CO₂-Emissionen optimiert."],
    [{ text: "Graphbasierte Verfahren: ", bold: true }, "Standortwahl und Routenplanung beruhen auf graphentheoretischen Algorithmen (Facility Location, Vehicle Routing) auf einem realen Straßennetz."],
    [{ text: "Faktoren wirksam einbeziehen: ", bold: true }, "Entfernung, Verkehr und Transportkapazität gehen nachweislich in die Entscheidungslogik ein und werden nicht nur erwähnt."],
    [{ text: "Nachvollziehbarer Nutzen: ", bold: true }, "Die erzielten Einsparungen werden quantifiziert und im Frontend transparent dargestellt."],
    [{ text: "Lauffähiger Prototyp: ", bold: true }, "Die Lösung ist als vollständig containerisierte Web-Anwendung ausführbar."],
  ]),
  P("Der Anspruch ist damit nicht ein theoretisches Modell, sondern eine prototypische, real bedienbare Anwendung, die die Aufgabenstellung an einem konkreten, datengetriebenen Anwendungsfall belegt."),

  // 3
  H1("3  Analyse der Problemstellung"),
  P("Die Aufgabe ist ein zusammengesetztes Optimierungsproblem aus zwei klassischen, jeweils NP-schweren Teilproblemen der Logistik:"),
  ...numbered([
    [{ text: "Standortproblem (Facility Location): ", bold: true }, "Wo sollen Verteilzentren platziert werden, damit die nachfragegewichtete Distanz zu den Apotheken minimal ist?"],
    [{ text: "Tourenplanung (Vehicle Routing Problem, VRP): ", bold: true }, "Wie werden Fahrzeuge so über die Stopps geführt, dass Kosten, Zeit und Emissionen unter Einhaltung aller Restriktionen minimal sind?"],
  ]),
  P("Hinzu kommt der Charakter einer Mehrzieloptimierung: Kosten, Zeit und Umwelt können in Konflikt stehen — die zeitschnellste Route ist nicht zwingend die günstigste oder die emissionsärmste. Die Lösung muss diesen Zielkonflikt explizit gewichtbar machen."),
  P("Aus der Analyse lassen sich die zu modellierenden Faktoren und Restriktionen ableiten:"),
  table(
    ["Faktor / Restriktion", "Bedeutung für die Optimierung"],
    [
      ["Entfernung", "Reale Straßendistanz zwischen Standorten (nicht Luftlinie) — bestimmt Strecke, Kosten und Emissionen."],
      ["Verkehr", "Reale Straßenfahrzeiten und Stauzustände — Fahrzeit weicht von der reinen Distanz ab."],
      ["Transportkapazität", "Ladekapazität der Fahrzeuge und Lagerkapazität der Hubs begrenzen, was geliefert werden kann."],
      ["Reichweite / Schicht", "Tagesreichweite der Fahrzeuge und Schichtlänge begrenzen die Tourlänge."],
      ["Öffnungszeiten", "Eine Apotheke kann nur innerhalb ihrer Öffnungszeit beliefert werden."],
    ],
    [3100, 5926], { boldFirst: true }
  ),
  P("Weiterhin erfordert eine belastbare Lösung eine realistische Datengrundlage: tatsächliche Apothekenstandorte, ein echtes Straßennetz für Distanzen und Fahrzeiten sowie Bevölkerungsdaten als Proxy für den Warenbedarf.", { after: 60 }),

  // 4
  H1("4  Recherche und fachlicher Hintergrund"),
  P("Die Konzeption stützt sich auf etablierte Verfahren der Graphentheorie, des Operations Research und der Verkehrsökonomie:"),
  ...bullets([
    [{ text: "Kürzeste-Wege-Probleme: ", bold: true }, "Dijkstra-/Contraction-Hierarchies-Verfahren bilden die Grundlage realer Routing-Engines (hier OSRM) zur Berechnung von Distanzen und Fahrzeiten im Straßengraphen."],
    [{ text: "Facility Location / p-Median: ", bold: true }, "Das p-Median-Problem minimiert die (gewichtete) Summe der Distanzen zwischen Nachfragepunkten und einer festen Anzahl von Standorten — ein klassisches, NP-schweres Standortproblem, das hier nachfragegewichtet greedy gelöst wird."],
    [{ text: "Vehicle Routing Problem (VRP): ", bold: true }, "Die kapazitäts- und zeitbeschränkte Tourenplanung ist NP-schwer; in der Praxis werden konstruktive Heuristiken (z. B. Greedy-Insertion, Savings-Algorithmus) eingesetzt, die in kurzer Zeit gute Lösungen liefern."],
    [{ text: "Verallgemeinerte Kosten (generalized cost): ", bold: true }, "In der Verkehrsökonomie werden heterogene Zielgrößen (Geld, Zeit, Emissionen) zu einer gewichteten Bewertungsgröße zusammengeführt — die methodische Grundlage der hier umgesetzten Mehrzieloptimierung."],
    [{ text: "Zeitabhängige Fahrzeiten: ", bold: true }, "Reale Reisezeiten hängen von Tageszeit und Straßentyp ab; dies motiviert die Einbindung echter Straßenfahrzeiten und eines Verkehrsmodells."],
  ]),
  P("Für die technische Umsetzung wurden bewusste Werkzeugentscheidungen getroffen: OSRM mit OpenStreetMap-Daten für ein echtes, lokal betreibbares Straßennetz; PostgreSQL/PostGIS für relationale und räumliche Daten; MapLibre GL für eine performante, interaktive Kartenvisualisierung; sowie optional die TomTom-API für Echtzeit-Verkehrsdaten."),

  // 5
  H1("5  Anforderungen an die Lösung"),
  H2("5.1  Funktionale Anforderungen"),
  ...bullets([
    "Berechnung des Warenbedarfs je Apotheke aus Bevölkerungsdaten.",
    "Bestimmung optimaler Standorte eines mehrstufigen Verteilnetzes (Hauptquartier, Verteilzentren, Mini-Verteilzentren).",
    "Kapazitätsbewusste Zuordnung der Apotheken zu Hubs anhand realer Fahrzeiten.",
    "Optimierung der Fahrzeugrouten nach Kosten, Zeit und CO₂ unter Einhaltung aller Restriktionen.",
    "Konfigurierbarkeit von Fahrzeugflotte, Optimierungsgewichten und Systemparametern.",
    "Interaktive Visualisierung sowie quantitative Auswertung der Ergebnisse inkl. Einsparungsnachweis.",
  ]),
  H2("5.2  Nicht-funktionale Anforderungen"),
  ...bullets([
    "Realdatenbasis: echtes Straßennetz, reale Apothekenstandorte, amtliche Bevölkerungsdaten.",
    "Reproduzierbarkeit und Persistenz aller Berechnungsergebnisse.",
    "Cloud-/Container-Betrieb: vollständige Orchestrierung über Docker Compose.",
    "Asynchrone Verarbeitung rechenintensiver Schritte ohne Blockieren der Oberfläche.",
    "Nachvollziehbarkeit und Testbarkeit der fachlichen Kernlogik.",
  ]),

  // 6
  H1("6  Grobkonzept"),
  P("Das Grobkonzept gliedert die Lösung in eine vierstufige Berechnungs-Pipeline und eine Client-Server-Webanwendung. Die Pipeline berechnet nacheinander Warenbedarf, Hub-Standorte, Einzugsgebiete und Fahrzeugrouten; jede Stufe baut auf den Ergebnissen der vorherigen auf. Die Ergebnisse werden persistent in einer Datenbank gespeichert und über eine REST-Schnittstelle an ein interaktives Web-Frontend ausgeliefert."),
  ...img("architecture.png", 0.6145, 560, "Abbildung 1: Systemarchitektur — sechs containerisierte Dienste mit Datenfluss."),
  P("Die bewusste Reihenfolge „Bedarf zuerst“ stellt sicher, dass Standortwahl und Zuordnung auf echten Bedarfszahlen beruhen und nicht auf einer reinen Anzahl von Apotheken."),

  // 7
  H1("7  Feinkonzept / technische Konzeption"),
  P("Auf Ebene des Feinkonzepts werden die Komponenten, der Technologie-Stack und die Schnittstellen konkretisiert. Die Anwendung trennt klar zwischen Präsentationsschicht (Frontend), Anwendungs-/Orchestrierungsschicht (API + Worker) und Datenschicht (Datenbank, Routing-Engine, Rohdaten)."),
  table(
    ["Schicht", "Technologie", "Aufgabe"],
    [
      ["Frontend", "React, Vite, TypeScript, MapLibre GL", "Interaktive Karte, Pipeline-Steuerung, Analyse-Dashboard, Einstellungen"],
      ["API", "FastAPI (Python)", "REST-Endpunkte, Auslieferung als GeoJSON, Orchestrierung der Pipeline"],
      ["Worker", "Celery + Redis", "Asynchrone Ausführung der rechenintensiven Pipeline-Schritte"],
      ["Datenbank", "PostgreSQL + PostGIS", "Persistenz von Apotheken, Hubs, Zuweisungen, Routen, Konfiguration"],
      ["Routing", "OSRM (OpenStreetMap)", "Reale Straßendistanzen und -fahrzeiten (Matrix- und Routen-Abfragen)"],
    ],
    [1700, 3200, 4126], { boldFirst: true, size: 17 }
  ),
  P("Die fachliche Logik ist in vier Pipeline-Module gekapselt (Bedarf, Hub-Platzierung, Einzugsgebiete, Routenoptimierung). Konfigurationswerte (Fahrzeugparameter, Optimierungsgewichte, Kapazitäten, Öffnungszeiten, Verkehrseinstellungen) werden zur Laufzeit aus der Datenbank gelesen, sodass sich das System ohne Codeänderung anpassen lässt."),

  // 8
  H1("8  Architektur des Systems"),
  P("Das System besteht aus sechs über Docker Compose orchestrierten Containern (vgl. Abbildung 1): einem Reverse-Proxy (Nginx), dem React-Frontend, dem FastAPI-Backend, einem Celery-Worker, dem Redis-Message-Broker, der PostgreSQL/PostGIS-Datenbank sowie der OSRM-Routing-Engine. Diese Trennung erlaubt es, rechenintensive Berechnungen im Worker asynchron auszuführen, während die API jederzeit ansprechbar bleibt."),
  ...bullets([
    [{ text: "Nginx ", bold: true }, "leitet Anfragen an Frontend bzw. Backend weiter (Reverse Proxy)."],
    [{ text: "FastAPI-Backend ", bold: true }, "stellt REST-Endpunkte bereit und stößt Pipeline-Schritte an."],
    [{ text: "Celery-Worker ", bold: true }, "führt die Schritte 1–4 asynchron aus; Redis dient als Message-Broker."],
    [{ text: "PostgreSQL/PostGIS ", bold: true }, "speichert alle Eingangs- und Ergebnisdaten dauerhaft."],
    [{ text: "OSRM ", bold: true }, "liefert reale Straßendistanzen und Fahrzeiten aus dem Schweizer Straßennetz."],
  ]),
  P("Die Architektur erfüllt damit die nicht-funktionalen Anforderungen Cloud-Betrieb, Asynchronität und Persistenz unmittelbar.", { after: 60 }),

  // 9
  H1("9  Datenbasis und verwendete Quellen"),
  P("Die Optimierung basiert ausschließlich auf realen, frei verfügbaren Datenquellen:"),
  table(
    ["Datenquelle", "Herkunft", "Inhalt"],
    [
      ["Apothekenstandorte", "OpenStreetMap / Overpass", "≈ 400 Schweizer Apotheken mit Koordinaten und Metadaten"],
      ["Bevölkerungsraster", "Eurostat Census Grid 2021", "1-km²-Bevölkerungszellen für die Schweiz (Zehntausende Zellen)"],
      ["Straßennetz", "Geofabrik / OpenStreetMap", "Vorverarbeitetes Schweizer Straßennetz für OSRM (Distanz + Fahrzeit)"],
    ],
    [2200, 2600, 4226], { boldFirst: true, size: 17 }
  ),
  P("In der Datenbank werden diese Daten zusammen mit den Berechnungsergebnissen in einem relationalen Schema gehalten. Zentrale Tabellen sind u. a. pharmacies (Apotheken inkl. Bedarf und Hub-Zuordnung), hubs (Verteilnetz inkl. Kapazität und Öffnungszeiten), assignments (Apotheke→Hub mit Straßengeometrie), vehicle_routes (Fahrzeugrouten inkl. km, Zeit, Kosten, CO₂), population_cells (Bevölkerungsraster) sowie Konfigurationstabellen für Fahrzeugflotte und Systemparameter."),

  // 10
  H1("10  Beschreibung der Implementierung"),
  P("Das Backend ist in Python implementiert. Die FastAPI-Anwendung stellt die REST-Endpunkte bereit (Pipeline-Steuerung, Ergebnis-Auslieferung als GeoJSON, Einstellungen), während die eigentliche Berechnung in Celery-Tasks erfolgt. Die vier Pipeline-Schritte sind als eigenständige Module organisiert:"),
  ...bullets([
    [{ text: "Schritt 1 – Warenbedarf: ", bold: true }, "ein geometrisches Catchment-Modell summiert die Bevölkerung im Einzugsgebiet jeder Apotheke (begrenzt durch den Abstand zur nächsten Konkurrenz) und leitet daraus einen ganzzahligen Warenbedarf ab."],
    [{ text: "Schritt 2 – Hub Placement: ", bold: true }, "ein nachfragegewichteter Greedy-p-Median platziert Verteilzentren dort, wo der Bedarf am höchsten ist; eine Mindestauslastungs-Regel bestimmt die endgültige Hub-Anzahl."],
    [{ text: "Schritt 3 – Einzugsgebiete: ", bold: true }, "eine OSRM-Matrixabfrage liefert alle Fahrzeiten Apotheke→Hub; die Zuordnung erfolgt kapazitätsbewusst nach Fahrzeit."],
    [{ text: "Schritt 4 – Routenoptimierung: ", bold: true }, "ein Greedy-Mehrziel-VRP berechnet die Fahrzeugrouten je Hub und die Hauptlauf-Touren (HQ→VZ→mVZ)."],
  ]),
  P("Ergänzende Dienste kapseln die OSRM-Kommunikation (Distanz- und Fahrzeitmatrizen, Routengeometrien), das Verkehrsmodell (tageszeitabhängige Simulation) sowie die optionale TomTom-Anbindung für Echtzeit-Verkehr. Das Frontend (React/MapLibre GL) visualisiert Apotheken, Hubs, Einzugsgebiete und Routen interaktiv und stellt in einem Analyse-Dashboard Kennzahlen, Auslastungen und Einsparungen dar. Die fachliche Kernlogik ist durch eine offline lauffähige Testsuite (19 pytest-Tests) abgesichert, die Score-Berechnung, Restriktionen, Verkehrsmodell und Einsparungsberechnung prüft."),

  // 11
  H1("11  Optimierungslogik: Kosten, Zeit, Umwelt, Entfernung, Verkehr, Kapazität"),
  P("Kern der Arbeit ist die Routenentscheidung in Schritt 4. Sie folgt dem Prinzip der verallgemeinerten Kosten (generalized cost): Jeder mögliche nächste Stopp einer Tour wird über seine echten Grenzkosten — den Mehraufwand des Einfügens — in den drei Zieldimensionen bewertet. Alle drei Größen werden in ihrer natürlichen Einheit (CHF, Stunden, kg CO₂) berechnet."),
  ...img("optimization.png", 0.4524, 580, "Abbildung 2: Verallgemeinerte Grenzkosten und gewichteter Score der Stopp-Auswahl."),
  P("Für einen Kandidaten-Stopp wird zunächst das Insertions-Delta in Distanz (Δkm) und Fahrzeit (Δh) gebildet — der Mehraufwand inklusive des veränderten Rückwegs. Daraus ergeben sich die drei Objektive:"),
  ...bullets([
    [{ text: "Kosten = Δkm · CHF/km + Δh · Fahrerlohn", bold: true }, "  — reale Betriebs- plus Lohnkosten in CHF."],
    [{ text: "Zeit = Δh", bold: true }, "  — reale zusätzliche Fahrzeit (verkehrsbereinigt)."],
    [{ text: "Umwelt = Δkm · g CO₂/km", bold: true }, "  — reale zusätzliche Emissionen in kg CO₂."],
  ]),
  P("Die drei Objektive werden über die aktuelle Kandidatenmenge min-max-normiert und mit den konfigurierbaren Gewichten (Standard: Kosten 0,40; Zeit 0,35; Umwelt 0,25) zu einem Score summiert; der Stopp mit dem kleinsten Score wird gewählt. Zusätzlich steuern die Gewichte die Reihenfolge, in der Fahrzeugtypen eingesetzt werden (günstigstes / schnellstes / emissionsärmstes zuerst). Die einzelnen Faktoren gehen wie folgt wirksam ein:"),
  table(
    ["Faktor", "Umsetzung in der Entscheidungslogik"],
    [
      ["Entfernung", "Reale OSRM-Straßendistanz; bestimmt Δkm und damit Kosten- und Umweltkomponente."],
      ["Verkehr", "Δh basiert auf echten OSRM-Straßenfahrzeiten (Stadt ≠ Autobahn) — Zeit ist nicht proportional zur Distanz; zusätzlich Tageszeit-Simulation und optional TomTom-Echtzeit."],
      ["Transportkapazität", "Ladekapazität je Fahrzeug und Lagerkapazität je Hub als harte Restriktionen der Stopp- und Zuordnungswahl."],
      ["Kosten", "Δkm · CHF/km + Δh · Fahrerlohn als monetäre Zielgröße."],
      ["Zeit", "Δh als echte, verkehrsbereinigte Fahrzeit."],
      ["Umwelt", "Δkm · g CO₂/km; ein CO₂-Schattenpreis erlaubt zusätzlich die Monetarisierung."],
    ],
    [2100, 6926], { boldFirst: true, size: 17 }
  ),
  P("Methodisch entscheidend ist, dass die Zeit aus echten Straßenfahrzeiten stammt: Dadurch erzeugt eine Zeit-Gewichtung nachweislich eine andere — schnellere — Route als eine reine Distanz-/Emissions-Gewichtung, und zwar auch ohne Live-Verkehrsdaten. Die drei Gewichte spannen so eine echte Zielkonflikt-Ebene auf, statt auf dieselbe Größe zu kollabieren."),
  P("Zusätzliche Restriktionen schränken die zulässigen Stopps ein: Fahrzeugkapazität (Bedarf ≤ Ladung), Tagesreichweite (genutzte km + Hin- + Rückweg ≤ Reichweite), Schichtlänge (genutzte Stunden + Fahrzeit + Servicezeit ≤ Schicht) sowie Öffnungszeiten der Apotheken.", { after: 60 }),

  // 12
  H1("12  Eingesetzte Algorithmen und graphbasierte Verfahren"),
  P("Das System ist durchgehend graphbasiert: Standorte sind Knoten, reale Straßenverbindungen sind Kanten, und die Optimierung operiert auf dem von OSRM bereitgestellten Straßengraphen."),
  ...bullets([
    [{ text: "Kürzeste Wege (OSRM): ", bold: true }, "OSRM berechnet auf dem Straßengraphen reale Distanzen und Fahrzeiten zwischen allen Standorten (eine Matrixabfrage je Depot)."],
    [{ text: "Nachfragegewichteter Greedy-p-Median: ", bold: true }, "wählt iterativ die Standorte mit dem größten gewichteten Erreichbarkeitsgewinn und platziert so das Verteilnetz dort, wo der Bedarf konzentriert ist."],
    [{ text: "Greedy-Mehrziel-VRP: ", bold: true }, "konstruiert die Touren stopp-für-stopp nach den verallgemeinerten Grenzkosten — eine konstruktive Heuristik für das NP-schwere VRP, die in Sekunden eine gute Lösung liefert."],
    [{ text: "Haversine-Distanzmatrix: ", bold: true }, "dient als schnelle Luftlinien-Näherung in der Standortphase und als Rückfallebene, falls OSRM nicht verfügbar ist."],
  ]),
  P("Da sowohl das p-Median- als auch das VRP-Problem NP-schwer sind, ist der Einsatz von Greedy-Heuristiken methodisch begründet: Sie liefern reproduzierbar in Sekunden praxistaugliche Lösungen für 400 Apotheken und ein mehrstufiges Netz."),

  // 13
  H1("13  Ablauf der Pipeline und des Gesamtsystems"),
  P("Der Gesamtablauf folgt der vierstufigen Pipeline, die der/die Anwender/in über das Frontend startet. Jeder Schritt wird asynchron im Celery-Worker ausgeführt, schreibt seine Ergebnisse in die Datenbank und meldet seinen Status zurück."),
  ...img("pipeline.png", 0.3414, 600, "Abbildung 3: Vierstufige Berechnungs-Pipeline mit sequenzieller Abhängigkeit."),
  P("Das resultierende Verteilnetz ist mehrstufig aufgebaut: Ein zentrales Hauptquartier (HQ) versorgt regionale Verteilzentren (VZ), diese die lokalen Mini-Verteilzentren (mVZ), von denen aus die Apotheken auf der „letzten Meile“ beliefert werden; nahe gelegene Apotheken kann das HQ direkt bedienen."),
  ...img("supplychain.png", 0.3921, 560, "Abbildung 4: Mehrstufige Lieferketten-Hierarchie (Hauptlauf und letzte Meile)."),

  // 14
  H1("14  Ergebnisse und Nutzen des Prototyps"),
  P("Der Prototyp ist lauffähig und erzeugt nach Durchlauf der vier Schritte ein vollständiges, konsistentes Optimierungsergebnis: ein bedarfsgerecht platziertes Verteilnetz, die kapazitätsbewusste Zuordnung aller Apotheken sowie konkrete, auf dem realen Straßennetz verlaufende Fahrzeugrouten mit ausgewiesenen Kennzahlen (Strecke, Fahrzeit, Kosten, CO₂)."),
  P("Den Nutzen der Optimierung weist das System quantitativ aus: Es vergleicht die konsolidierten Mehrstopp-Routen mit einer naiven Referenz aus Einzelfahrten (eine eigene Hin- und Rückfahrt je Apotheke, ohne Konsolidierung) und beziffert die Einsparung in Strecke, Kosten, Fahrzeit und CO₂ — absolut und in Prozent. Diese Kennzahl ist im Analyse-Dashboard (Reiter „Übersicht“) als „Optimierungsgewinn“ prominent dargestellt und belegt unmittelbar das von der Aufgabenstellung geforderte Einspar- und Umweltpotenzial."),
  P("Das Dashboard macht die Ergebnisse darüber hinaus in sieben Reitern nachvollziehbar: Übersicht (Kennzahlen, Kostenaufteilung, Flotteneinsatz), Last Mile, Hauptlauf, Hubs (Lagerauslastung), Belieferung (Abdeckungsgrad und Gründe nicht belieferbarer Apotheken), Verkehr (Mehrzeit durch Stau) sowie CO₂ & Umwelt. Die interaktive Karte hebt auf Klick ganze Lieferketten hervor und filtert Routen nach Hub oder Fahrzeugtyp."),
  P("Die konkreten Zahlenwerte hängen von der gewählten Konfiguration (Fahrzeugflotte, Gewichte, Kapazitäten, Verkehrsmodell) und dem jeweiligen Lauf ab. Maßgeblich für die Bewertung ist daher nicht ein einzelner Zahlenwert, sondern dass das System die Zielgrößen korrekt berechnet, transparent ausweist und den Optimierungsgewinn reproduzierbar belegt."),

  // 15
  H1("15  Kritische Reflexion, Grenzen und Weiterentwicklung"),
  P("Der Prototyp setzt die Aufgabenstellung vollständig und fachlich sauber um, weist jedoch bewusste Vereinfachungen auf, die im Sinne einer ehrlichen Einordnung benannt werden:"),
  ...bullets([
    [{ text: "Greedy statt global optimal: ", bold: true }, "Die Touren werden konstruktiv aufgebaut; eine lokale Nachoptimierung (z. B. 2-opt) oder ein Solver (OR-Tools) könnte die Lösungen weiter verbessern."],
    [{ text: "Verkehrsmodell: ", bold: true }, "Ohne TomTom beruht der Stauanteil auf einer kalibrierten Tageszeit-Simulation; reale, segmentgenaue Echtzeitdaten liefert erst die optionale Live-Anbindung."],
    [{ text: "Fahrzeit-Skalierung: ", bold: true }, "Die OSRM-Fahrzeiten werden auf das konfigurierte Fahrzeugtempo umskaliert; die relative Stadt-/Autobahn-Charakteristik bleibt korrekt, die absolute Schichtdauer kann in rein städtischen Gebieten leicht optimistisch ausfallen."],
    [{ text: "Konservative Baseline: ", bold: true }, "Der Einsparungsvergleich nutzt das günstigste Fahrzeug als Referenz; gegenüber realistischeren Naiv-Szenarien fiele die ausgewiesene Einsparung eher höher aus."],
  ]),
  P("Sinnvolle Weiterentwicklungen sind eine metaheuristische bzw. solver-basierte Tourenoptimierung, ein zeitabhängiges VRP mit echten Verkehrsprofilen, eine dynamische Re-Optimierung bei Störungen sowie eine mehrtägige Tourenplanung. Die modulare, container-basierte Architektur unterstützt solche Erweiterungen unmittelbar."),

  // 16
  H1("16  Fazit"),
  P("Die Arbeit zeigt die autonome Bearbeitung einer komplexeren Aufgabenstellung von der Analyse über Recherche und Konzeption bis zur lauffähigen prototypischen Anwendungslösung. Das entstandene System optimiert Logistikrouten nachweisbar nach Kosten, Zeit und Umweltauswirkungen und bindet die Faktoren Entfernung, Verkehr und Transportkapazität wirksam in die Entscheidungslogik ein."),
  P("Graphbasierte Verfahren — ein nachfragegewichteter p-Median für die Standortwahl und ein Greedy-Mehrziel-VRP auf dem realen OSRM-Straßennetz — bilden den methodischen Kern. Durch die verallgemeinerten Kosten und die Nutzung echter Straßenfahrzeiten wird die Mehrzieloptimierung fachlich sauber umgesetzt, und der Optimierungsgewinn gegenüber unkonsolidierten Einzelfahrten wird transparent beziffert. Damit erfüllt der Prototyp die Aufgabenstellung „Optimierung von Logistikrouten“ vollständig und belegt anschaulich den wirtschaftlichen wie ökologischen Nutzen der Logistikoptimierung."),
];

// ── Assemble ──────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "Pharma Logistics CH",
  title: "Projektdokumentation – Optimierung von Logistikrouten",
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "C7D0DA", space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: BLUE },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
        alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
      { reference: "nums", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.",
        alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
    ],
  },
  sections: [
    // Title page — no header/footer
    { properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: titlePage },
    // TOC + body — with header/footer + page numbers
    {
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "C7D0DA", space: 4 } },
        children: [new TextRun({ text: "Optimierung von Logistikrouten · Pharma Logistics CH", size: 16, color: "8a98a8" })],
      })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "C7D0DA", space: 4 } },
        children: [new TextRun({ text: "Seite ", size: 16, color: "8a98a8" }),
                   new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "8a98a8" }),
                   new TextRun({ text: " von ", size: 16, color: "8a98a8" }),
                   new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "8a98a8" })],
      })] }) },
      children: [...toc, ...body],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync("../Projektdokumentation_Logistikrouten.docx", buffer);
  console.log("DOCX written: docs/Projektdokumentation_Logistikrouten.docx");
});

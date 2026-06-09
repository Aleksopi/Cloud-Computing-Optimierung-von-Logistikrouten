# Sprecherleitfaden — „Optimierung von Logistikrouten"

Begleitend zu **Praesentation_Logistikrouten.pptx** (13 Folien, ca. 10 Minuten).
Die Sprechtexte sind zusätzlich als **Notizen** in jeder Folie hinterlegt.

## Gliederung & Zeitbudget (≈ 10 min)

| # | Folie | Inhalt | Zeit |
|---|-------|--------|------|
| 1 | Titel | Einstieg, Thema, Zielsetzung | 0:30 |
| 2 | Problem & Motivation | Warum Logistikoptimierung zählt | 0:45 |
| 3 | Aufgabenstellung | Die drei Anforderungen | 0:40 |
| 4 | Analyse & Zielsetzung | Zwei NP-schwere Teilprobleme, Mehrzielkonflikt | 0:50 |
| 5 | Lösungsidee (Pipeline) | Vierstufige Pipeline | 0:45 |
| 6 | Systemarchitektur | Sechs Container | 0:50 |
| 7 | Datenquellen | OSM, Eurostat, OSRM | 0:35 |
| 8 | Optimierungslogik | Verallgemeinerte Kosten | 1:00 |
| 9 | Entfernung/Verkehr/Kapazität | Faktoren in der Entscheidung | 0:55 |
| 10 | Algorithmen & Lieferkette | p-Median, VRP, Graph | 0:50 |
| 11 | Ergebnisse & Visualisierung | Einsparungsnachweis, Dashboard | 1:00 |
| 12 | Nutzen | Wirtschaftlich & ökologisch | 0:45 |
| 13 | Fazit & Ausblick | Zusammenfassung, Weiterentwicklung | 0:45 |

---

## Sprechtext je Folie

**1 — Titel.** Begrüßung. Thema: Optimierung von Logistikrouten am realen Anwendungsfall der Schweizer Apothekenlogistik. Ich zeige, wie ein lauffähiger, cloudbasierter Prototyp Transportrouten gleichzeitig nach Kosten, Zeit und Umwelt optimiert — auf Basis echter Straßen- und Bevölkerungsdaten.

**2 — Problem & Motivation.** Logistik ist Kostentreiber und CO₂-Quelle zugleich. Gleichzeitig ist die Planung komplex: viele Stopps, begrenzte Fahrzeuge, Kapazitäten, Reichweiten, Öffnungszeiten. Schon kleine Effizienzgewinne pro Fahrt summieren sich über die Flotte zu erheblichen wirtschaftlichen und ökologischen Vorteilen — genau hier setzt algorithmische Optimierung an.

**3 — Aufgabenstellung.** Die Aufgabe verlangt dreierlei: nach Kosten, Zeit und Umwelt optimieren; graphbasierte Algorithmen einsetzen; und die Faktoren Entfernung, Verkehr und Transportkapazität wirksam einbeziehen — nicht nur erwähnen. Diese drei Punkte strukturieren meinen Vortrag.

**4 — Analyse & Zielsetzung.** Die Aufgabe zerfällt in zwei klassische, je NP-schwere Teilprobleme: Standortwahl (p-Median) und Tourenplanung (VRP). Erschwerend ist der Mehrzielkonflikt — schnell, günstig und sauber sind nicht dasselbe. Ziel ist ein Prototyp, der beides graphbasiert löst und den Nutzen messbar macht.

**5 — Lösungsidee (Pipeline).** Die Lösung ist eine vierstufige Pipeline. Bewusst zuerst der Warenbedarf, damit Standort und Zuordnung auf echten Zahlen beruhen. Dann Hub-Platzierung per p-Median, kapazitätsbewusste Zuordnung nach Fahrzeit, und schließlich die Routenoptimierung. Jeder Schritt baut auf dem vorherigen auf und läuft asynchron.

**6 — Systemarchitektur.** Sechs Container trennen Präsentation, Anwendung und Daten. Das FastAPI-Backend stößt die Pipeline an, die schwere Arbeit läuft im Celery-Worker mit Redis. PostgreSQL/PostGIS persistiert alles, OSRM liefert echte Distanzen und Fahrzeiten. Damit sind Cloud-Betrieb, Asynchronität und Persistenz erfüllt.

**7 — Datenquellen.** Alles beruht auf realen, frei verfügbaren Daten: rund 400 Apotheken aus OpenStreetMap, das Eurostat-Bevölkerungsraster als Bedarfs-Proxy, und das Schweizer Straßennetz für OSRM. Keine Luftlinien, keine erfundenen Werte.

**8 — Optimierungslogik.** Kern ist die Routenentscheidung nach verallgemeinerten Kosten. Für jeden möglichen nächsten Stopp bilde ich die echten Grenzkosten: Kosten in CHF aus Distanz und Fahrerlohn, Zeit in Stunden, Umwelt in kg CO₂. Diese drei werden normiert, gewichtet und summiert — der kleinste Score gewinnt. Entscheidend: die Zeit stammt aus echten Straßenfahrzeiten.

**9 — Entfernung, Verkehr & Kapazität.** Entfernung als reale Straßendistanz. Verkehr über echte OSRM-Fahrzeiten — ein Stadtkilometer dauert länger als ein Autobahnkilometer, deshalb ist Zeit nicht proportional zur Distanz; plus Tageszeit-Modell und optional TomTom. Kapazität als harte Restriktion je Fahrzeug und je Hub, ergänzt um Reichweite und Schicht.

**10 — Algorithmen & Lieferkette.** Durchgehend graphbasiert: Standorte sind Knoten, Straßen sind Kanten. OSRM liefert kürzeste Wege, ein p-Median platziert das mehrstufige Netz HQ–VZ–mVZ, ein Greedy-Mehrziel-VRP konstruiert die Touren. Da beide Probleme NP-schwer sind, liefern die Heuristiken in Sekunden praxistaugliche Lösungen.

**11 — Ergebnisse & Visualisierung.** Den Nutzen weise ich quantitativ aus: Ich vergleiche die konsolidierten Mehrstopp-Routen mit einer naiven Referenz aus Einzelfahrten und beziffere die Einsparung in Strecke, Kosten, Fahrzeit und CO₂ — absolut und prozentual, prominent im Dashboard. Sieben Analyse-Reiter und eine interaktive Karte machen jedes Ergebnis nachvollziehbar.

**12 — Nutzen.** Der Nutzen ist doppelt. Wirtschaftlich: geringere Kosten, höhere Auslastung, reproduzierbare Planung. Ökologisch: weniger Kilometer bedeuten direkt weniger CO₂, weil Emissionen als gleichwertige Zielgröße eingehen. Genau das fordert die Aufgabenstellung.

**13 — Fazit & Ausblick.** Der Prototyp erfüllt die Aufgabe vollständig: graphbasierte Optimierung nach Kosten, Zeit und Umwelt, wirksame Einbindung von Entfernung, Verkehr und Kapazität, plus quantitativer Einsparungsnachweis. Ausblick: Solver-basierte Touren, zeitabhängiges VRP, dynamische Re-Optimierung. Vielen Dank — gerne Fragen.

---

## Kurzfazit (für Rückfragen / Abstract)

Es wurde ein cloudbasierter Prototyp zur **Optimierung von Logistikrouten** in der Schweizer Apothekenlogistik entwickelt. Auf Basis echter OpenStreetMap-Straßendaten und Eurostat-Bevölkerungsdaten berechnet eine vierstufige Pipeline Warenbedarf, ein nachfragegewichtetes Verteilnetz (Greedy-**p-Median**), die kapazitätsbewusste Zuordnung und schließlich Fahrzeugrouten mit einem **Greedy-Mehrziel-VRP**. Die Routenwahl folgt dem Prinzip der **verallgemeinerten Kosten**: Kosten (CHF), Zeit (h) und Umwelt (kg CO₂) werden als echte Grenzgrößen gewichtet. Durch echte OSRM-Straßenfahrzeiten gehen **Entfernung, Verkehr und Transportkapazität** wirksam in die Entscheidung ein. Der Optimierungsgewinn gegenüber unkonsolidierten Einzelfahrten wird quantitativ ausgewiesen. Damit ist die Aufgabenstellung vollständig und nachvollziehbar erfüllt.

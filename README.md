# Pharma Logistics CH

> **DHBW Projekt — Cloud Computing, 4. Semester**  
> Optimierungssystem für die Schweizer Apothekenlogistik: Berechnet optimale Hub-Standorte, Einzugsgebiete, Warenbedarf und Fahrzeugrouten für 400 Apotheken in der gesamten Schweiz. Alle Berechnungen basieren auf echten OpenStreetMap-Straßendaten und Eurostat-Bevölkerungsdaten.

---

## Inhaltsverzeichnis

1. [Projektübersicht](#1-projektübersicht)
2. [Systemarchitektur](#2-systemarchitektur)
3. [Services & Container](#3-services--container)
4. [Schnellstart](#4-schnellstart)
5. [Pipeline — Die 4 Berechnungsschritte](#5-pipeline--die-4-berechnungsschritte)
6. [Fahrzeugflotte & Lieferkette](#6-fahrzeugflotte--lieferkette)
7. [Optimierungsmodell](#7-optimierungsmodell)
8. [Web-App — Benutzeroberfläche](#8-web-app--benutzeroberfläche)
9. [Konfiguration & Einstellungen](#9-konfiguration--einstellungen)
10. [API-Referenz](#10-api-referenz)
11. [Datenbankschema](#11-datenbankschema)
12. [Datenquellen](#12-datenquellen)
13. [Deployment auf dem Server](#13-deployment-auf-dem-server)
14. [Projektanforderungen — Erfüllungsgrad](#14-projektanforderungen--erfüllungsgrad)
15. [Live-Verkehr (Roadmap)](#15-live-verkehr-roadmap)

---

## 1. Projektübersicht

Das System löst ein reales Logistikoptimierungsproblem: Wie versorgt man 400 Schweizer Apotheken möglichst effizient mit Waren — unter Berücksichtigung von **Kosten**, **Zeit** und **CO₂-Emissionen**?

### Kernfunktionen

| Funktion | Beschreibung |
|---|---|
| **Nachfrageberechnung** | Geometrisches Catchment-Modell auf Basis von Eurostat-Bevölkerungsdaten |
| **Nachfragegewichtetes Hub Placement** | p-Median-Algorithmus platziert Hubs dort, wo der Bedarf am höchsten ist |
| **HQ-Direktlieferung** | Das Hauptquartier beliefert Apotheken im 20-km-Radius direkt |
| **Kapazitätsbewusste Zuweisung** | Jeder Hub hat eine Lagerkapazität — Überlastung wird verhindert |
| **Multi-Objekt-Routenoptimierung** | VRP minimiert gleichzeitig Kosten, Fahrzeit und CO₂ |
| **Vollständig konfigurierbar** | Fahrzeugflotte, Kapazitäten, Öffnungszeiten, Optimierungsgewichte |
| **Interaktive Karte** | Echtzeit-Visualisierung mit Hervorhebung von Lieferketten |
| **Analyse-Dashboard** | 6 Analyse-Tabs: Übersicht, Last Mile, Hauptlauf, Hubs, Verkehr, CO₂ |

---

## 2. Systemarchitektur

```
Browser (Port 5173 / 80)
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│               Nginx (Port 80 — Production)               │
│         /api/* → FastAPI Backend   / → React Frontend    │
└────────────────────────┬─────────────────────────────────┘
                         │
           ┌─────────────┴─────────────┐
           ▼                           ▼
  ┌─────────────────┐        ┌──────────────────┐
  │ FastAPI Backend │        │  React + Vite    │
  │   (Port 8000)   │        │   (Port 5173)    │
  └────────┬────────┘        └──────────────────┘
           │
           ├─── PostgreSQL + PostGIS (Port 5433 extern / 5432 intern)
           ├─── Redis (Celery Broker, Port 6379)
           ├─── Celery Worker (Pipeline-Ausführung, async)
           └─── OSRM Routing Engine (Port 5001)
                └── Schweizer Straßennetz (vorverarbeitet)
```

### Datenfluss

```
GeoJSON-Daten         OSRM               PostgreSQL
     │                  │                    │
     │ Step 1:          │                    │ Warenbedarf
     │ Bevölkerung ─────────────────────────►│ pro Apotheke
     │                  │                    │
     │ Step 2:          │                    │ Hub-Standorte
     │ Demand-Gewichte  │                    │ + Kapazitäten
     │         ─────────────────────────────►│
     │                  │                    │
     │ Step 3:          │ /table             │ Zuweisungen
     │ Apotheken+Hubs ──►│ + /route          │ + Geometrien
     │                  │         ──────────►│
     │                  │                    │
     │ Step 4:          │ /route (parallel)  │ Fahrzeugrouten
     │ Hubs + Stops ────►│                  │ + Backbone
     │                  │         ──────────►│
```

---

## 3. Services & Container

| Container | Image | Ports | Zweck |
|---|---|---|---|
| `pharma-postgres` | `postgis/postgis:16-3.4` | `5433:5432` | Datenbank (Apotheken, Hubs, Routen, Konfiguration) |
| `pharma-redis` | `redis:7-alpine` | `6379:6379` | Message Broker für Celery-Tasks |
| `pharma-osrm` | Custom (osrm-backend) | `5001:5000` | Schweizer Straßenrouting (OSRM) |
| `pharma-backend` | Python 3.12 + FastAPI | `8000:8000` | REST-API + Pipeline-Orchestrierung |
| `pharma-worker` | Python 3.12 + Celery | — | Asynchrone Pipeline-Ausführung |
| `pharma-frontend` | Node 20 + Vite | `5173:5173` | Interaktive Web-App |

### Tech-Stack

**Backend**

| Paket | Version | Zweck |
|---|---|---|
| FastAPI | 0.115.5 | REST-API Framework |
| SQLAlchemy | 2.0.36 | ORM + PostgreSQL |
| Celery | 5.4.0 | Async Task Queue |
| NumPy | 2.1.3 | Distanzmatrizen, p-Median |
| psycopg2 | 2.9.10 | PostgreSQL-Treiber |
| pydantic-settings | 2.6.1 | Konfiguration aus .env |

**Frontend**

| Paket | Version | Zweck |
|---|---|---|
| React | 18.3.1 | UI Framework |
| MapLibre GL | 4.7.1 | Interaktive Karte |
| Vite | 5.4.10 | Build Tool + Dev Server |
| Tailwind CSS | 3.4.14 | Utility-first CSS |
| TypeScript | 5.6.3 | Typsicherheit |

---

## 4. Schnellstart

### Voraussetzungen

- Docker + Docker Compose installiert
- Mindestens **6 GB freier RAM** (OSRM benötigt ~1,5 GB)
- Die folgenden Datendateien sind bereits im Repository enthalten:
  - `backend/data/apotheken.geojson` — 400 Schweizer Apotheken (OpenStreetMap)
  - `backend/data/population.geojson` — Eurostat Bevölkerungsraster, 58.000 Zellen à 1 km²
  - `osrm/data/switzerland-*.osrm*` — Vorverarbeitetes Schweizer Straßennetz

### Starten

```bash
# Erstes Mal (baut alle Docker-Images, ~3–5 Minuten)
docker-compose up --build

# Ab dem zweiten Start
docker-compose up
```

### URLs

| URL | Beschreibung |
|---|---|
| `http://localhost:5173` | Web-App (Karte + Pipeline + Analyse) |
| `http://localhost:8000/docs` | FastAPI Swagger UI (interaktive API-Dokumentation) |
| `http://localhost:8000/api/health` | Health-Check Endpoint |
| `localhost:5433` | PostgreSQL direkt (User: `pharma`, Passwort: `pharma`) |

> **Hinweis:** Der externe PostgreSQL-Port ist `5433` (intern `5432`), um Konflikte mit lokal laufenden Instanzen zu vermeiden.

### Pipeline ausführen

Nach dem Start die 4 Schritte in der Web-App nacheinander ausführen:

```
Step 1: Warenbedarf        → ~1–2 Minuten
Step 2: Hub Placement      → ~5–10 Sekunden
Step 3: Einzugsgebiete     → ~2–3 Minuten
Step 4: Routenoptimierung  → ~1–2 Minuten
```

### Kompletter Reset (DB löschen)

```bash
docker-compose down -v && docker-compose up --build
```

### Tests ausführen (Optimierungs-Kernlogik)

Die fachliche Kernlogik (Generalized-Cost-Score, Constraints, Verkehrsmodell, Einsparungsnachweis) ist
durch eine **pytest-Suite** abgesichert. Sie läuft vollständig **offline** — ohne OSRM, Datenbank oder
Netzwerk (die OSRM-Matrix wird im Test deterministisch ersetzt):

```bash
# im laufenden Backend-Container
docker-compose exec backend sh -c "pip install -r requirements-dev.txt && pytest -q"

# oder lokal
cd backend && pip install -r requirements-dev.txt && pytest -q
```

Geprüft werden u. a.: dass jedes Gewicht (Kosten/Zeit/Umwelt) das jeweils richtige Objektiv minimiert,
dass Zeit-Minimierung dank echter Straßenfahrzeiten eine **andere** Route als Distanz-Minimierung
ergibt, dass Kapazitäts-/Reichweiten-/Öffnungszeit-Constraints greifen und dass die Einsparung gegen
die Einzelfahrten-Baseline korrekt berechnet wird.

---

## 5. Pipeline — Die 4 Berechnungsschritte

Die Berechnungsreihenfolge ist **bewusst gewählt**: Nachfrage zuerst, damit Hub-Platzierung und Zuweisung auf echten Bedarfszahlen basieren.

---

### Step 1 — Warenbedarf (~1–2 Minuten)

**Datei:** `backend/app/pipeline/a3_demand.py`

**Was wird berechnet?** Wie viele Waren benötigt jede Apotheke pro Lieferzyklus?

**Algorithmus — Geometrisches Catchment-Modell:**

1. Für jede Apotheke wird der Einzugsgebiet-Radius berechnet:
   ```
   radius = min(2/3 × Distanz zur nächsten Konkurrenz, max_catchment_km)
   ```
2. Alle Bevölkerungszellen (1 km² Eurostat-Raster) innerhalb des Radius werden summiert
3. Warenbedarf = `max(1, ceil(Bevölkerung / population_per_item))`

**Konfigurierbar:**
- `population_per_item` (Standard: 12.000) — Bevölkerung pro Warenartikel
- `max_catchment_km` (Standard: 10 km) — maximaler Einzugsradius

**Ergebnis:** Jede Apotheke hat einen `demand`-Wert (Ganzzahl, typisch 1–15). Apothekenkreise auf der Karte skalieren mit diesem Wert.

---

### Step 2 — Hub Placement (~5–10 Sekunden)

**Datei:** `backend/app/pipeline/a1_hub_placement.py`

**Was wird berechnet?** Optimale Standorte für das Verteilnetz aus 1 HQ, VZ und mVZ.

**Netzwerkstruktur:**
```
HQ (Bern) — Hauptquartier, alle Waren gehen hier durch
├── VZ_1 – VZ_n  — Verteilzentren (regional, größere Kapazität)
│   └── mVZ_*    — Mini-Verteilzentren (lokal, kleinere Kapazität)
│       └── Apotheken (letzte Meile)
└── Direktlieferung an Apotheken im 20-km-Radius
```

**Algorithmus — Nachfragegewichteter Greedy p-Median:**

Der p-Median-Algorithmus minimiert die gewichtete Summe der Distanzen zwischen Apotheken und Hubs. Durch Demand-Gewichtung werden Hubs dorthin gezogen, wo **mehr Bedarf** herrscht.

1. Vollständige Haversine-Distanzmatrix (400 Apotheken + HQ) wird aufgebaut
2. Nachfragegewichte: `weight[i] = demand[i] / mean(demand)` (normalisiert)
3. VZs iterativ platziert (greedy, größter gewichteter Erreichbarkeitsgewinn). Die VZ-Anzahl ist auf **4–6** begrenzt.
4. Constraints VZ: ≥40 km Abstand untereinander, ≥25 km vom HQ
5. mVZ-Kandidaten analog mit engeren Abstandsregeln (≥18 km). Die mVZ-Anzahl hat **kein festes Maximum** — sie wird aus dem Warenbedarf abgeleitet.
6. **Mindestauslastung:** Kapazitätsbewusste Apothekenzuweisung (haversine), danach werden Hubs unter 10 % Lagerauslastung entfernt und die Apotheken neu zugewiesen — so lange, bis jeder verbleibende VZ/mVZ ≥ 10 % führt. Bedarf und Auslastung entscheiden damit über die endgültige Anzahl und Lage der Hubs.
7. Jedem mVZ wird das nächste VZ als `parent_hub` zugewiesen
8. HQ-Kapazität = **130 %** des Gesamtwarenbedarfs (100 % Bedarf + 30 % Reserve)

**Konfigurierbar:**
- `n_vz` (Standard: 4) — gewünschte Anzahl Verteilzentren, automatisch auf 4–6 begrenzt
- `n_mvz` (Standard: 20) — mVZ-Startwert (Mindest-Kandidatenzahl); die tatsächliche Anzahl ergibt sich aus Bedarf und Mindestauslastung
- `hub_min_utilization` (Standard: 0,10) — Mindest-Lagerauslastung je VZ/mVZ
- `hq_storage_factor` (Standard: 1,30) — HQ-Lager = Faktor × Gesamtwarenbedarf
- `vz_capacity` (Standard: 600) — Lagerkapazität VZ in Einheiten
- `mvz_capacity` (Standard: 125) — Lagerkapazität mVZ in Einheiten
- HQ-Position: Umgebungsvariablen `HQ_LAT`, `HQ_LON`, `HQ_NAME`

**Öffnungszeiten werden gesetzt:**
- HQ: 06:00–22:00, VZ: 07:00–20:00, mVZ: 08:00–18:00 (konfigurierbar)

**Ergebnis:** 1 HQ + 4–6 VZ + eine bedarfsabhängige Anzahl mVZ (jeder Hub ≥ 10 % Lagerauslastung) mit Koordinaten, Kapazitäten und Öffnungszeiten.

---

### Step 3 — Einzugsgebiete (~2–3 Minuten)

**Datei:** `backend/app/pipeline/a2_influence.py`

**Was wird berechnet?** Welcher Hub beliefert welche Apotheke — basierend auf echten Straßenfahrzeiten?

**Besonderheit — HQ-Direktlieferung:**
Das HQ kann Apotheken im konfigurierten Radius (`hq_direct_radius_km`, Standard: 20 km) direkt beliefern. Es ist daher als optionaler Liefer-Hub eingeschlossen.

**Algorithmus:**

1. OSRM `/table`-Aufruf: vollständige Distanz- und Zeitmatrix (400 × 26) in einem HTTP-Request
2. Apotheken außerhalb des HQ-Direktradius: HQ wird aus Kandidaten ausgeblendet (Wert auf 1e9 gesetzt)
3. Kapazitätsbewusste Zuweisung nach Fahrzeit:
   - Apotheken werden nach ihrer besten Fahrzeit sortiert (kürzeste zuerst)
   - Jede Apotheke geht zum nächsten Hub mit verbleibender Lagerkapazität
   - Overflow (alle Hubs voll): nächster Hub wird überlastet (protokolliert)
4. OSRM `/route`-Geometrien für alle 400 Zuweisungen parallel (8 Threads)

**Ergebnis:** Jede Apotheke hat einen `hub_name`. Einzugsgebiet-Linien auf der Karte zeigen die Verbindung Hub → Apotheke.

---

### Step 4 — Routenoptimierung (~1–2 Minuten)

**Datei:** `backend/app/pipeline/a4_routes.py`

**Was wird berechnet?** Konkrete Fahrzeugrouten für jeden Hub, optimiert nach Kosten, Zeit und CO₂.

**Last-Mile-Routing (Hub → Apotheken):**

Algorithmus: **Greedy Multi-Objektiv-VRP** mit gewichteter, normierter Stop-Auswahl auf Basis
**verallgemeinerter Kosten** (generalized cost), parallelisiert über 8 Threads. Distanzen *und*
Fahrzeiten stammen aus echten OSRM-Straßendaten (ein `/table`-Aufruf je Depot, `distance,duration`).

Die **Optimierungsgewichte** (Kosten/Zeit/Umwelt) bestimmen zuerst die **Fahrzeugreihenfolge**
(Kosten → günstigstes, Zeit → schnellstes, Umwelt → emissionsärmstes Fahrzeug zuerst) und steuern
dann pro Hub und Fahrzeug die **Stop-Auswahl**: Es wird der Stop mit den geringsten gewichteten
**Grenzkosten** (zusätzliche CHF / Stunden / kg CO₂, siehe Abschnitt 7) gewählt. Weil die Zeit aus
echten Straßenfahrzeiten kommt, verändern die Gewichte die Route real — auch ohne Live-Verkehr:
1. Sammle alle zulässigen Kandidaten-Stops; Constraints pro Stop:
   - `demand ≤ items_loaded` (Fahrzeugkapazität)
   - `km_used + d_to + d_back ≤ range_km` (Reichweite)
   - `hours_used + drive_h + service_min/60 ≤ shift_hours` (Schichtende)
   - Öffnungszeiten: Ankunft muss innerhalb der Apotheken-Öffnungszeiten liegen
2. Wähle den Kandidaten mit dem kleinsten gewichteten, normierten Score (siehe Abschnitt 7).
3. Wenn kein Stop möglich: Fahrzeug endet, nächstes Fahrzeug beginnt.

**Nicht belieferbare Apotheken:** Bleibt eine zugewiesene Apotheke nach allen Fahrzeugen offen
(Bedarf > Fahrzeugkapazität, Entfernung > Reichweite, außerhalb Öffnungszeit/Schicht, oder Hub
erschöpft), wird der **Grund** je Apotheke gespeichert und in der Analyse (Tab „Belieferung")
angezeigt. Mit der Einstellung **„Alle Apotheken beliefern"** (`require_full_delivery`) erzwingt
ein abschließender Zwangslieferungs-Pass die Belieferung *aller* zugewiesenen Apotheken mit dem
kapazitätsstärksten Last-Mile-Fahrzeug — dabei werden Schicht- und Öffnungszeit-Grenzen bewusst
ignoriert, damit niemand offen bleibt.

**Backbone-Routing (HQ → VZ → mVZ):**

Ebenfalls als VRP-Touren mit denselben backbone-fähigen Fahrzeugen:
- HQ → VZs: ein oder mehrere Touren, Warenvolumen = alle Apotheken des VZ-Bereichs
- VZ → mVZs: jedes VZ versorgt seine Kind-mVZs

**HQ Last-Mile:**
Falls dem HQ direkte Apotheken zugewiesen wurden (Step 3), werden auch für das HQ Last-Mile-Routen berechnet (mit der Last-Mile-Fahrzeugflotte).

**OSRM-Geometrien:**
Alle Routenlinien werden als echte Straßengeometrien von OSRM abgerufen (`/route/v1/driving/...`). Fallback auf Luftlinie bei OSRM-Fehler.

---

## 6. Fahrzeugflotte & Lieferkette

### Vordefinierte Fahrzeuge

| Fahrzeug | Einsatz | Kapazität | Reichweite | CHF/km | CO₂/km | Ø-Tempo | Fahrerlohn |
|---|---|---|---|---|---|---|---|
| Sprinter | Last-Mile + Backbone | 15 Einh. | 350 km | CHF 0,38 | 185 g | 65 km/h | CHF 45/h |
| Klein-LKW | Last-Mile + Backbone | 40 Einh. | 450 km | CHF 0,70 | 230 g | 70 km/h | CHF 50/h |
| LKW | Nur Backbone | 200 Einh. | 600 km | CHF 1,20 | 280 g | 75 km/h | CHF 55/h |
| Zug | Nur Backbone | 1.000 Einh. | 2.000 km | CHF 3,20 | 520 g | 90 km/h | CHF 70/h |

**Last-Mile** = Hub → Apotheke | **Backbone** = HQ → VZ und VZ → mVZ

Alle Werte sind in den Einstellungen änderbar. Neue Fahrzeuge können hinzugefügt werden.

### Lieferkettenstruktur

```
HQ (Bern)
│
│ ← Direkte Last-Mile-Lieferung (Sprinter/Klein-LKW)
│   an Apotheken im 20-km-Radius
│
├── [Backbone: LKW/Zug/Klein-LKW/Sprinter]
│
├── VZ_1 ──► mVZ_3 ──► Apotheken (Sprinter/Klein-LKW)
│       │──► mVZ_4 ──► Apotheken
│       └──► Direkte Apotheken
│
├── VZ_2 ──► mVZ_7 ──► ...
│   ...
│
└── VZ_4 ──► ...
```

**Backbone-Lieferung:**
- HQ beliefert alle VZs per LKW/Zug (Bulk-Transport)
- Jedes VZ beliefert seine zugehörigen mVZs (Regional-Transport)
- VZs und mVZs erhalten Waren für alle ihre zugehörigen Apotheken

**Last-Mile-Lieferung:**
- Sprinter und Klein-LKW fahren vom Hub (VZ, mVZ oder HQ) zu den Apotheken
- Kapazitätsbeschränkungen, Reichweite und Öffnungszeiten werden eingehalten
- Fahrzeuge werden sequenziell eingesetzt (Sprinter zuerst, dann Klein-LKW)

---

## 7. Optimierungsmodell

### Verallgemeinerte Kosten (generalized cost) — die Routing-Entscheidung

Jeder nächste Stop wird über einen **gewichteten, normierten Multi-Objektiv-Score** gewählt
(kleinerer Wert ist besser). Anders als ein reines „nächster-Stop"-Greedy minimiert jedes der drei
Objektive die **echte Grenzgröße** (Insertions-Delta) des Stops in seiner **natürlichen Einheit** —
CHF, Stunden, kg CO₂:

```
Δkm = d(hier→Stop) + d(Stop→Depot) − d(hier→Depot)     ← zusätzliche Fahrstrecke (inkl. Rückweg)
Δh  = t(hier→Stop) + t(Stop→Depot) − t(hier→Depot)     ← zusätzliche Fahrzeit (Straßenzeit, verkehrsbereinigt)

Kosten  = Δkm × CHF/km  +  Δh × Fahrerlohn   (CHF — Betriebskosten + Lohnkosten)
Zeit    = Δh                                 (Stunden — echte Fahrzeit)
Umwelt  = Δkm × g CO₂/km / 1000              (kg CO₂ — Emissionen der Zusatzstrecke)

score = w_cost × norm(Kosten) + w_time × norm(Zeit) + w_env × norm(Umwelt)
```

- `norm(...)` = Min-Max-Normierung über die aktuelle Kandidatenmenge → jedes Gewicht hat trotz
  unterschiedlicher Einheiten (CHF / h / kg) balancierte Hebelwirkung.
- Die **Kosten** sind eine *Mischung* aus Distanz und Zeit, **Umwelt** ist reine Distanz, **Zeit** ist
  reine (Straßen-)Zeit. Die drei Gewichte spannen damit eine echte Zielkonflikt-Ebene auf, statt auf
  dieselbe Größe zu kollabieren.

**Warum Zeit ≠ Distanz (zentral für die Verkehrsberücksichtigung):**
`Δh` basiert auf **echten OSRM-Straßenfahrzeiten** (Dauer-Matrix aus demselben `/table`-Aufruf wie die
Distanzen). Ein 10-km-Stadtleg dauert dort länger als ein 10-km-Autobahnleg — `Δh` ist also **nicht**
proportional zu `Δkm`. Dadurch erzeugt **Zeit-Minimierung nachweislich eine andere (schnellere) Route
als Distanz-Minimierung**, und zwar **auch ohne Live-Verkehr**. Mit aktivem Verkehrsmodell/TomTom
kommen zusätzlich verkehrsbereinigte bzw. echte Echtzeit-Zeiten hinzu.

Zusätzlich steuern die Gewichte die **Fahrzeugreihenfolge** je Hub
(`w_cost·norm(CHF/km) + w_time·norm(1/Tempo) + w_env·norm(g CO₂/km)`): Kostenfokus setzt das günstigste,
Zeitfokus das schnellste, Ökofokus das emissionsärmste Fahrzeug zuerst ein.

**Standard-Gewichtung:**
- `w_cost = 0,40` (40 % echte Fahrtkosten in CHF)
- `w_time = 0,35` (35 % echte Fahrzeit in h)
- `w_env  = 0,25` (25 % echte Emissionen in kg CO₂)

> Hinweis: Da Umwelt-Kosten (∝ Distanz) und der Distanzanteil der Kosten korreliert sind, liegen
> Kosten- und Ökofokus tendenziell näher beieinander; der Zeitfokus weicht am stärksten ab, weil
> Straßenzeit nicht proportional zur Distanz ist. Das ist fachlich korrekt: bei einem einzelnen
> Fahrzeug ohne Zeit-/Verkehrsunterschiede *sind* die kostengünstigste und die emissionsärmste Route
> identisch — der echte Zielkonflikt entsteht über die Straßenzeit, die Fahrzeugwahl und den Verkehr.

**Traffic Factor:**
`traffic_factor` skaliert die Straßen-Fahrzeiten, wenn kein Live-Verkehr aktiv ist (1,0 = Freifluss).
Bei aktivem Tageszeit-Modell wird der schichtgemittelte Stau-Faktor, bei TomTom die echte
Echtzeit-Matrix verwendet.

### Nachweis des Optimierungsnutzens (Baseline-Vergleich)

Step 4 berechnet zusätzlich eine **naive Vergleichs-Baseline**: jede Apotheke wird per **Einzelfahrt**
(eine eigene Hin-/Rückfahrt ab ihrem Hub, ohne Konsolidierung) beliefert — der klassische Referenzfall
„ohne Routenoptimierung". Für jede tatsächlich belieferte Apotheke fährt die Baseline `2 × Hub→Apotheke`
(Straßendistanz/-zeit aus Step 3), Kosten/CO₂ mit dem **günstigsten** Lieferfahrzeug (konservativ).

Die **Einsparung** der Mehrstopp-Optimierung gegenüber dieser Baseline wird in km, CHF, Stunden und kg
CO₂ (absolut und in %) berechnet und im Analyse-Dashboard (Tab „Übersicht" → Karte
*Optimierungsgewinn — Last Mile*) prominent angezeigt. So ist der von der Aufgabenstellung geforderte
Nachweis „erhebliche Einsparungen sowie Umweltvorteile" direkt belegt.

### Constraints

| Constraint | Bedingung |
|---|---|
| Kapazität | `demand ≤ items_loaded` |
| Reichweite | `km_used + d_hin + d_zurück ≤ range_km` |
| Schicht | `hours_used + Fahrzeit + Service ≤ shift_hours` |
| Öffnungszeiten | `open_hour ≤ Ankunftszeit ≤ close_hour − service_min/60` |

> **Ausnahme „Alle Apotheken beliefern":** Ist `require_full_delivery` aktiv, werden nach dem
> regulären Routing alle übrig gebliebenen Apotheken per Zwangslieferung beliefert. Dieser Pass
> ignoriert die Schicht- und Öffnungszeit-Grenzen (Reichweite/Kapazität werden über Mehrfachtouren
> abgebildet), sodass garantiert jede zugewiesene Apotheke versorgt wird.

### Öffnungszeiten

Öffnungszeiten werden als Dezimalstunden gespeichert (z.B. `8.5 = 08:30`). Das Routing überspringt Stops, die außerhalb der Öffnungszeiten nicht beliefert werden können.

| Typ | Standard |
|---|---|
| Apotheken | 08:00 – 18:30 |
| HQ | 06:00 – 22:00 |
| VZ | 07:00 – 20:00 |
| mVZ | 08:00 – 18:00 |

---

## 8. Web-App — Benutzeroberfläche

### Navigation (3 Tabs in der Topbar)

| Tab | Funktion |
|---|---|
| Karte | Interaktive Karte mit Pipeline-Steuerung |
| Analyse | 7-Tab-Dashboard nach Step 4 |
| Einstellungen | Fahrzeugflotte, Gewichtung und Systemparameter |

### Karte

**Layer (ein-/ausblendbar in der Layer-Legende):**

| Layer | Farbe | Verfügbar ab |
|---|---|---|
| Apotheken | Blau (Kreisgröße = Bedarf); **Rot = nicht belieferbar** (nach Step 4) | Immer |
| Hubs | Violett (HQ), Dunkelblau (VZ), Bernstein (mVZ) | Nach Step 2 |
| Einzugsgebiete | Blau (VZ), Bernstein (mVZ) | Nach Step 3 |
| Lieferkette (Backbone) | Rot/dick (HQ→VZ), Teal/gestrichelt (VZ→mVZ) | Nach Step 4 |
| Fahrzeugrouten | Cyan (Sprinter), Grün (Klein-LKW), Violett (LKW), Pink (Zug) | Nach Step 4 |

**Interaktion:**

| Aktion | Ergebnis |
|---|---|
| Hover über Apotheke | Tooltip: Name, Stadt, Hub, Warenbedarf, Öffnungszeiten |
| Hover über Hub | Tooltip: Typ, Lagerauslastung, Lieferfenster |
| Hover über Route | Tooltip: Fahrzeug, Stops, km, CHF |
| Klick auf Apotheke | Info-Panel + Button „Lieferkette dieser Apotheke anzeigen" |
| Klick auf Hub | Info-Panel (oben rechts) + sofortige Routenfilterung auf diesen Hub |
| Klick auf Route | Info-Panel (oben rechts) mit Routendaten |
| Info-Panel → „Details anzeigen" | Öffnet das **Detail-Fenster** (Hub bzw. Fahrzeug, identisch zur Analyse — Fahrzeug inkl. „von Stadt → nach Stadt") |
| Klick auf Hub → „Routen-Übersicht" | Modal mit allen Fahrzeugen des Hubs |
| Klick auf Fahrzeug im Modal | Nur diese Route auf der Karte, Modal schließt |
| Banner-Button „Übersicht" | Modal wieder öffnen |
| Banner-Button „✕" | Alle Filter zurücksetzen |
| Fahrzeugtyp-Filter (Legende) | Nur Routen bestimmter Fahrzeugtypen zeigen |

**Hervorhebung (Dimming):**
- Klick auf Hub → alle nicht-zugehörigen Routen auf 7 % Deckkraft gedimmt
- Klick auf Apotheke → Zuweisungslinie wird **bernsteinfarben** hervorgehoben; Hub-Routen werden in Fahrzeugfarben heller dargestellt
- Klick auf einzelnes Fahrzeug → Route wird 5 px dick + volle Deckkraft, alles andere gedimmt

### Analyse (7 Tabs)

| Tab | Inhalt |
|---|---|
| **Übersicht** | 4 KPI-Karten, **Optimierungsgewinn-Karte** (−% km/CHF/h/CO₂ vs. Einzelfahrten), Kostenaufteilung, Flotteneinsatz mit Auslastungsbalken, Kennzahlen (inkl. belieferte / nicht belieferbare Apotheken) |
| **Last Mile** | Fahrzeug-Auslastungstabelle (eingesetzt vs. verfügbar), aufklappbare Routen-Tabelle pro Typ — **Zeile anklickbar → Detail-Fenster** (inkl. „von Stadt → nach Stadt") |
| **Hauptlauf** | Backbone-KPIs, Flotte nach Fahrzeugtyp (HQ→VZ, VZ→mVZ), Routendetails (Zeile anklickbar → Detail-Fenster) |
| **Hubs** | Hub-Verteilung, Lagerauslastung & -kosten (**Hub-Zeile anklickbar → Detail-Fenster**), Fahrzeugspezifikationen, Lieferkettenhierarchie |
| **Belieferung** | Abdeckungsgrad (beliefert vs. nicht beliefert), **Liste der nicht belieferbaren Apotheken gruppiert nach Grund** + Hinweis auf die Einstellung „Alle Apotheken beliefern" |
| **Verkehr** | Verkehrsquelle/-faktor, Mehrzeit je Fahrzeugtyp, am stärksten betroffene Routen |
| **CO2 & Umwelt** | CO2-Balken nach Typ, Detail-Vergleichstabelle, CO2-Einsparung Sprinter vs. LKW |

**Detail-Fenster:** In den Tabs *Last Mile*, *Hauptlauf* und *Hubs* öffnet ein Klick auf eine Zeile
ein Pop-up mit allen Details. Für Fahrzeuge inkl. **von wo nach wo** (Start-Stadt → Ziel-Städte).
Dasselbe Fenster lässt sich auf der Karte über den Button **„Details anzeigen"** im Info-Panel öffnen.

### Einstellungen

| Abschnitt | Parameter |
|---|---|
| Fahrzeugflotte | Alle Fahrzeuge editierbar/löschbar, neue hinzufügbar; Felder: can_last_mile, can_backbone, Kapazität, Reichweite, CHF/km, CO₂/km, Tempo, Fahrerlohn, Stop-Zeit, Max/Hub, Priorität |
| Gewichtung | Interaktive Slider für Kosten/Zeit/Umwelt (Summe 100 %) mit Voreinstellungen (Kostenfokus, Ausgewogen, Zeitkritisch, Öko) |
| Parameter | Anzahl VZ/mVZ, Lagerkapazitäten, HQ-Direktradius, Warenbedarf-Parameter, Schichtzeiten, Lagerkosten — sowie der Schalter **„Alle Apotheken beliefern"** (erzwingt garantierte Belieferung) |
| Verkehrsmodell | Tageszeit-Simulation ↔ TomTom Live, Stau-Intensität, API-Key |
| Öffnungszeiten | Apotheken und alle Hub-Typen separat konfigurierbar (Dezimalstunden, Live-Uhrzeit-Vorschau) |

**Zurücksetzen:** Der Button **„Auf Standard zurücksetzen"** (oben rechts) stellt Parameter,
Gewichtung und Fahrzeugflotte auf die Werkseinstellungen zurück (der gespeicherte TomTom-Key
bleibt erhalten, Pipeline-Ergebnisse bleiben unverändert).

> **Wichtig:** Änderungen an Hub-Anzahl, Kapazitäten oder Fahrzeugflotte erfordern einen Neustart der Pipeline (Step 2 → 4). Gewichtung und „Alle Apotheken beliefern" wirken ab erneutem Step 4.

---

## 9. Konfiguration & Einstellungen

### Umgebungsvariablen (`.env`)

Kopiere `.env.example` nach `.env` und passe ggf. an:

```env
DATABASE_URL=postgresql://pharma:pharma@postgres:5432/pharma
REDIS_URL=redis://redis:6379/0
OSRM_URL=http://osrm:5000
HQ_LAT=46.9480
HQ_LON=7.4474
HQ_NAME=HQ_Bern
DATA_DIR=/app/data
```

### System-Konfiguration (Einstellungen-Tab in der Web-App)

Alle Werte sind zur Laufzeit änderbar und werden in der Datenbank gespeichert:

| Schlüssel | Standard | Beschreibung |
|---|---|---|
| `n_vz` | 4 | Anzahl Verteilzentren (VZ) — automatisch auf 4–6 begrenzt |
| `n_mvz` | 20 | mVZ-Startwert; tatsächliche Anzahl automatisch (kein Maximum) |
| `hub_min_utilization` | 0,10 | Mindest-Lagerauslastung je VZ/mVZ (sonst entfällt der Hub) |
| `hq_storage_factor` | 1,30 | HQ-Lager = Faktor × Gesamtwarenbedarf (130 %) |
| `vz_capacity` | 600 | Max. Einheiten je VZ |
| `mvz_capacity` | 125 | Max. Einheiten je mVZ |
| `hq_direct_radius_km` | 20 | HQ-Direktlieferung bis X km Straßendistanz |
| `population_per_item` | 12.000 | Bevölkerung pro Warenartikel |
| `max_catchment_km` | 10 | Max. Einzugsgebiet-Radius (Nachfragemodell) |
| `vz_hard_radius_km` | 45 | VZ-Direktzuweisung bis X km Luftlinie |
| `default_demand_est` | 3 | Bedarfsschätzung vor Step 1 (Proxy) |
| `shift_start` | 8,0 | Schichtbeginn (Stunden, z.B. 8,0 = 08:00) |
| `shift_hours` | 8,0 | Schichtlänge in Stunden |
| `traffic_factor` | 1,0 | 1,0 = Freifluss; Hook für Live-Verkehr |
| `co2_shadow_chf` | 0,12 | CO₂-Schattenpreis (CHF/kg) |
| `opt_weight_cost` | 0,40 | Routing-Gewicht Kosten (Δ-Tourlänge) |
| `opt_weight_time` | 0,35 | Routing-Gewicht Zeit (verkehrs-bereinigt) |
| `opt_weight_env` | 0,25 | Routing-Gewicht CO₂ (Leg-Distanz) |
| `require_full_delivery` | 0 | 1 = alle zugewiesenen Apotheken garantiert beliefern (Zwangslieferung ignoriert Schicht-/Öffnungszeit-Grenzen) |

---

## 10. API-Referenz

Basis-URL: `http://localhost:8000`  
Interaktive Dokumentation: `http://localhost:8000/docs`

### Pipeline

| Endpoint | Methode | Beschreibung |
|---|---|---|
| `/api/pipeline/status` | GET | Status aller 4 Steps (idle/running/done/error) |
| `/api/pipeline/run/{step}` | POST | Step 1–4 starten (sequenzielle Abhängigkeiten) |
| `/api/pipeline/reset` | POST | Alle Ergebnisse und Hub-Zuweisungen löschen |
| `/api/health` | GET | Health-Check (DB-Verbindung) |

### Ergebnisse (GeoJSON)

| Endpoint | Beschreibung | Verfügbar ab |
|---|---|---|
| `/api/results/pharmacies` | Alle Apotheken als Punkte (inkl. Bedarf, Öffnungszeiten) | Immer |
| `/api/results/hubs` | Alle Hubs (inkl. Kapazität, Auslastung, Routen-Stats) | Nach Step 2 |
| `/api/results/assignments` | Hub→Apotheke-Linien (Straßengeometrie) | Nach Step 3 |
| `/api/results/routes` | Last-Mile-Fahrzeugrouten | Nach Step 4 |
| `/api/results/backbone` | Backbone-Lieferkette (HQ→VZ, VZ→mVZ) mit `backbone_tier` | Nach Step 4 |
| `/api/results/summary` | Kurzübersicht (Hubs, Routen, Kosten, km) | Nach Step 4 |
| `/api/results/summary/full` | Vollständige Analyse (Metriken, Flotten-Util., Hierarchie, **Einsparung vs. Baseline**) | Nach Step 4 |

### Einstellungen

| Endpoint | Methode | Beschreibung |
|---|---|---|
| `/api/settings/vehicles` | GET | Alle Fahrzeugkonfigurationen |
| `/api/settings/vehicles` | POST | Neues Fahrzeug hinzufügen |
| `/api/settings/vehicles/{id}` | PUT | Fahrzeug bearbeiten |
| `/api/settings/vehicles/{id}` | DELETE | Fahrzeug löschen |
| `/api/settings/system` | GET | Alle Systemparameter |
| `/api/settings/system` | PUT | Systemparameter aktualisieren (bulk) |
| `/api/settings/reset` | POST | Parameter, Gewichtung und Fahrzeugflotte auf Standardwerte zurücksetzen (TomTom-Key bleibt erhalten) |

---

## 11. Datenbankschema

```sql
-- Apotheken (400 Stück, aus OpenStreetMap)
pharmacies (
    id, osm_id, name, city,
    lat, lon,
    demand,           -- Warenbedarf (Einheiten), gesetzt in Step 1
    hub_name,         -- zugewiesener Hub, gesetzt in Step 3
    open_hour,        -- Öffnungszeit als Dezimalstunden (z.B. 8.0 = 08:00)
    close_hour,       -- Schließzeit als Dezimalstunden
    undeliverable_reason  -- Grund, falls in Step 4 nicht beliefert (NULL = beliefert)
)

-- Hubs (HQ + VZs + mVZs)
hubs (
    id, name,
    hub_type,         -- "HQ", "VZ" oder "mVZ"
    lat, lon,
    parent_hub,       -- mVZ → übergeordnetes VZ
    capacity,         -- Lagerkapazität in Wareneinheiten
    open_hour,        -- Öffnungszeit Hub
    close_hour        -- Schließzeit Hub
)

-- Zuweisungen (Apotheke → Hub, Straßengeometrie)
assignments (
    id,
    pharmacy_id,      -- FK → pharmacies
    hub_name,         -- Name des zugewiesenen Hubs
    distance_km,      -- Straßendistanz in km
    travel_time_h,    -- Fahrzeit in Stunden
    route_geometry    -- [[lon, lat], ...] Straßengeometrie
)

-- Fahrzeugrouten (Last-Mile + Backbone)
vehicle_routes (
    id,
    hub_name,         -- Ausgangshub
    vehicle_id,       -- Eindeutige ID, z.B. "VZ_1_Sprinter_3"
    vehicle_type,     -- "Sprinter", "Klein-LKW", "LKW", "Zug" etc.
    stops,            -- [pharmacy_id, ...] (Last-Mile) oder [hub_name, ...] (Backbone)
    stop_coords,      -- [[lon, lat], ...] Straßengeometrie der vollständigen Route
    total_km,         -- Gesamtdistanz in km
    total_hours,      -- Gesamtfahrzeit in Stunden
    total_items,      -- Gelieferte Wareneinheiten
    total_cost_chf,   -- Gesamtkosten: km × CHF/km + h × Fahrerlohn
    co2_kg,           -- CO₂-Emissionen in kg
    restock_count,    -- Anzahl Depot-Rückfahrten (0 = keine)
    supply_tier,      -- "last_mile" oder "backbone"
    forced            -- true = Zwangslieferung ("Alle Apotheken beliefern")
)

-- Pipeline-Status
pipeline_runs (
    id, step,         -- Step 1–4
    status,           -- "idle", "running", "done", "error"
    started_at,       -- Startzeitpunkt (UTC)
    finished_at,      -- Endzeitpunkt (UTC)
    error_message     -- Fehlermeldung bei status="error"
)

-- Bevölkerungsraster (Eurostat, 58.000 Zellen)
population_cells (id, lat, lon, population)

-- Konfigurierbare Fahrzeugflotte
vehicle_fleet_configs (
    id, name,
    vehicle_class,    -- "delivery" oder "backbone" (Legacy)
    can_last_mile,    -- boolean: für Hub→Apotheke geeignet
    can_backbone,     -- boolean: für HQ→Hub-Backbone geeignet
    capacity,         -- Ladekapazität (NULL = unbegrenzt)
    range_km,         -- Tagesreichweite
    cost_per_km,      -- Betriebskosten in CHF/km
    co2_g_per_km,     -- CO₂-Emissionen in g/km
    speed_kmh,        -- Durchschnittsgeschwindigkeit
    driver_chf_h,     -- Fahrerlohn in CHF/h
    service_min,      -- Stoppdauer pro Haltepunkt in Minuten
    max_per_hub,      -- Maximale Fahrzeuganzahl je Hub
    restock_threshold,-- Restock-Schwelle (Einheiten)
    sort_order,       -- Einsatzreihenfolge (kleiner = früher)
    enabled           -- Fahrzeug aktiv/inaktiv
)

-- Systemkonfiguration (Key-Value)
system_config (key, value, label, description)
```

---

## 12. Datenquellen

| Datei | Quelle | Beschreibung |
|---|---|---|
| `backend/data/apotheken.geojson` | OpenStreetMap / Overpass Turbo | 400 Schweizer Apotheken mit Koordinaten und Metadaten |
| `backend/data/population.geojson` | Eurostat Census Grid 2021 | 1 km²-Bevölkerungsraster für die Schweiz (58.000 Zellen) |
| `osrm/data/switzerland-*.osrm*` | Geofabrik.de / OSM | Vorverarbeitetes Schweizer Straßennetz für OSRM |
| `osrm/data/switzerland-*.osm.pbf` | Geofabrik.de | Rohe OSM-Daten (Fallback / Neuverarbeitung) |

### Überarbeitung der Datenbasis

Falls aktuellere Daten benötigt werden:

```bash
# Apotheken neu von OpenStreetMap laden (Overpass API)
# → Einfach apotheken.geojson löschen, beim nächsten Start wird automatisch heruntergeladen

# OSRM-Daten aktualisieren
# 1. Neues .osm.pbf von geofabrik.de/europe/switzerland herunterladen
# 2. Nach osrm/data/ kopieren
# 3. OSRM-Container neu bauen: docker-compose build osrm
```

---

## 13. Deployment auf dem Server

### Voraussetzungen

- Ubuntu 22.04 Server mit Docker
- Mindestens 8 GB RAM (OSRM + PostgreSQL + Backend)
- VPN-Zugang (Port 80 nur über WireGuard `wg0` erreichbar)

### Deployment

```bash
# Projekt auf Server kopieren
scp -rp . user@SERVER_IP:/opt/pharma-logistics/

# Auf dem Server starten (Production-Konfiguration)
cd /opt/pharma-logistics
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Production-Checkliste

- [ ] Port freigeben: `sudo ufw allow in on wg0 to any port 80`
- [ ] `restart: always` in `docker-compose.prod.yml` gesetzt
- [ ] PostgreSQL-Volume persistent: `postgres_data` volume vorhanden
- [ ] Projekt liegt in `/opt/pharma-logistics/`
- [ ] In Portainer als Stack sichtbar
- [ ] Uptime Kuma Monitor für `http://SERVER_IP/api/health` eingerichtet

**Zugriff:** `http://10.0.0.1` (WireGuard VPN, HTTP)

### Datenbank-Reset auf dem Server

```bash
cd /opt/pharma-logistics
docker-compose down -v          # löscht postgres_data Volume
docker-compose up -d --build    # startet neu, importiert Daten automatisch
```

---

## 14. Projektanforderungen — Erfüllungsgrad

Das Projekt erfüllt die DHBW-Anforderungen aus „Projekt 9: Optimierung von Logistikrouten":

| Anforderung | Status | Umsetzung |
|---|---|---|
| **Routenoptimierung** | Vollständig | Greedy Multi-Objektiv-VRP auf Basis **verallgemeinerter Kosten** (echte CHF + h + kg CO₂) |
| **Graphenalgorithmen** | Vollständig | Nachfragegewichteter Greedy p-Median (Hub Placement) + VRP auf dem OSRM-Straßengraphen |
| **Faktor: Entfernung** | Vollständig | OSRM-Straßendistanz (Routing) + Haversine (Placement) |
| **Faktor: Verkehr** | Vollständig | **Echte OSRM-Straßenfahrzeiten** (Zeit ≠ Distanz) + Tageszeit-Simulation + TomTom Live (Step 4) |
| **Faktor: Transportkapazität** | Vollständig | Fahrzeug-Ladekapazität + Hub-Lagerkapazität als harte Constraints |
| **Kosten-Optimierung** | Vollständig | Echte Grenzkosten `Δkm × CHF/km + Δh × Fahrerlohn` im Score |
| **Zeit-Optimierung** | Vollständig | Echte Grenzfahrzeit (OSRM-Straßenzeit, verkehrsbereinigt) im Score |
| **Umwelt-Optimierung** | Vollständig | Echte Grenzemissionen `Δkm × g CO₂/km`; Schattenpreis zur Monetarisierung |
| **Nachweis der Einsparung** | Vollständig | Baseline-Vergleich (Einzelfahrten ohne Optimierung): −% km / CHF / h / CO₂ im Dashboard |
| **OpenStreetMap-Daten** | Vollständig | OSRM mit echtem Schweizer Straßennetz (Distanz + Fahrzeit) |
| **Interaktive Visualisierung** | Vollständig | MapLibre GL (statt Folium — weitaus leistungsfähiger) |
| **Datenbankintegration** | Vollständig | PostgreSQL + PostGIS (statt Neo4j — besser für relationale Daten) |
| **Cloud/Container-Betrieb** | Vollständig | Vollständige Docker-Compose-Orchestrierung |
| **Live-Verkehrsdaten** | Vollständig | TomTom Matrix Routing (Echtzeit) mit Fallback auf Tageszeit-Simulation |
| **Tests / Validierung** | Vollständig | pytest-Suite für Score, Constraints, Verkehrsmodell und Einsparungsnachweis |

### Eigenleistungen über die Anforderungen hinaus

- **Verallgemeinerte Kosten (generalized cost):** der Routing-Score minimiert die echten Grenzkosten in
  CHF, Stunden und kg CO₂ — kein geometrischer Proxy, sondern fachlich saubere Multi-Objektiv-Optimierung
- **Echte OSRM-Straßenfahrzeiten** als Zeitbasis (Dauer-Matrix), sodass das Zeit-Ziel nachweislich von
  Distanz/CO₂ abweicht — die Verkehrsberücksichtigung wirkt **auch ohne Live-Daten**
- **Baseline-Einsparungsnachweis:** quantifizierter Vergleich Mehrstopp-Optimierung vs. Einzelfahrten
- **pytest-Testsuite** (19 Tests, offline lauffähig) für die Optimierungs-Kernlogik
- **Mehrstufige Lieferkette** (HQ → VZ → mVZ → Apotheke) mit echten Backbone-Routen
- **HQ-Direktlieferung** für nahegelegene Apotheken
- **Nachfragegewichtetes Hub Placement** (Demand-Gewichte im p-Median)
- **Kapazitätsbewusste Zuweisung** in zwei Schritten (Haversine + Straßenrouting)
- **Vollständige Web-App** mit interaktiver Karte, Hervorhebung von Lieferketten, Analyse-Dashboard
- **Konfigurierbare Fahrzeugflotte** mit CRUD-Interface
- **Öffnungszeiten-Constraint** im Routing-Algorithmus

---

## 15. Live-Verkehr (Roadmap)

Live-Verkehrsdaten sind als zukünftige Erweiterung geplant. Die Architektur ist darauf vorbereitet:

### Einfachste Implementierung: Tageszeit-basierter Simulator

```python
# In a4_routes.py — Schichtbeginn-abhängiger Traffic-Faktor
def get_traffic_factor(hour: float) -> float:
    if 7.0 <= hour <= 9.0:   return 1.45   # Morgenspitze
    if 16.0 <= hour <= 18.0: return 1.55   # Abendspitze
    if 12.0 <= hour <= 13.0: return 1.15   # Mittagsverkehr
    if hour >= 22.0 or hour <= 5.0: return 0.85  # Nachts
    return 1.0
```

Dieser Ansatz erfordert nur Änderungen in `a4_routes.py` und dem `traffic_factor`-Config-Key.

### Vollständige Live-Anbindung (HERE Traffic API)

1. HERE Traffic API Free Tier (250.000 Requests/Monat kostenlos)
2. Pro Backbone-Route: aktuelle Durchschnittsgeschwindigkeit von API abrufen
3. `traffic_factor = api_speed / normal_speed` pro Streckenabschnitt
4. Celery Periodic Task für stündliche Aktualisierung

### OSRM mit Custom Speed Profiles

OSRM unterstützt `--traffic-speeds` für CSV-basierte Geschwindigkeitsprofile:
```
# speed_overrides.csv: edge_id,speed_override
123456,45
789012,30
```

Dies erlaubt streckenbasierte Verkehrsanpassung ohne API-Abhängigkeit.

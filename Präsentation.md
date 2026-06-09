# Optimierung von Logistikrouten
## Schweizer Apothekenversorgung — Cloud-basiertes Optimierungssystem

**DHBW Projekt — Cloud Computing, 4. Semester**  
**Kurs:** Cloud Computing  
**Datum:** Juni 2026

---

## Agenda

1. Problemstellung & Motivation
2. Projektüberblick
3. Systemarchitektur (Cloud-Konzepte)
4. Container-Orchestrierung mit Docker
5. Backend — Technologie-Stack im Detail
   - FastAPI (REST-API Framework)
   - Celery + Redis (Asynchrone Task Queue)
   - PostgreSQL + PostGIS (Geodatenbank)
   - OSRM (Selbst-gehostete Routing Engine)
   - TomTom Traffic API (Live-Verkehr)
6. Die 4-stufige Berechnungs-Pipeline
7. Optimierungsmodell & Algorithmen
8. Frontend & Visualisierung
9. Deployment & Cloud-Betrieb
10. Live-Demo & Ergebnisse
11. Erfüllungsgrad der Anforderungen
12. Fazit & Ausblick

---

## 1. Problemstellung & Motivation

### Das reale Logistikproblem

> **Wie versorgt man 400 Schweizer Apotheken möglichst effizient mit Waren — unter Berücksichtigung von Kosten, Zeit und CO₂-Emissionen?**

#### Herausforderungen

- **Geografische Komplexität:** Die Schweiz ist ein kleines, aber topografisch anspruchsvolles Land — Alpen, Pässe, Tunnel prägen das Straßennetz
- **Skalierung:** 400 Apotheken, verteilt über die gesamte Schweiz (Zürich, Bern, Genf, Basel, ländliche Regionen)
- **Multi-Kriterien-Optimierung:** Kosten, Zeit und Umwelt stehen in Konflikt — günstigste Route ≠ schnellste Route ≠ grünste Route
- **Lieferkettenstruktur:** Direkte Auslieferung von einer zentralen Stelle an 400 Empfänger ist ineffizient — ein Hub-and-Spoke-Netzwerk ist notwendig
- **Variable Nachfrage:** Städtische Apotheken (z.B. Zürich HB) haben deutlich höheren Bedarf als Dorfapotheken

#### Vorherige Lösung (Jupyter Notebook)

Das Vorgängerprojekt war ein einzelnes Jupyter-Notebook mit Folium-Karte:
- Keine echte Web-Oberfläche, kein interaktives UI
- Berechnungen liefen lokal, blockierend, nicht skalierbar
- Ergebnisse konnten nicht gespeichert oder geteilt werden
- Keine konfigurierbare Fahrzeugflotte
- Kein echter Serverbetrieb möglich

#### Unsere Lösung

Eine vollständige, containerisierte Web-Applikation mit:
- Interaktiver Karte und Echtzeit-Visualisierung
- Asynchroner Pipeline-Ausführung im Hintergrund
- Konfigurierbaren Parametern und Fahrzeugflotte
- Persistenter Datenhaltung in PostgreSQL
- Deployment auf einem echten Ubuntu-Server

---

## 2. Projektüberblick

### Was berechnet das System?

Das System führt eine **4-stufige Pipeline** aus, die das komplette Logistiknetz berechnet:

```
Schritt 1: Warenbedarf berechnen
  → Wie viel braucht jede Apotheke? (Bevölkerungsmodell)

Schritt 2: Hub Placement
  → Wo sollen Verteilzentren und Mini-Verteilzentren stehen?

Schritt 3: Einzugsgebiete
  → Welcher Hub beliefert welche Apotheke? (Straßendistanz)

Schritt 4: Routenoptimierung
  → Welche Fahrzeuge fahren welche Routen? (VRP)
```

### Lieferkettenhierarchie

```
HQ Bern (Hauptquartier)
│
├──[LKW/Zug]──► VZ_1 Zürich ──[Klein-LKW]──► mVZ_3 ──[Sprinter]──► Apotheken
│               VZ_2 Basel  ──              ► mVZ_4 ──             ► Apotheken
│               VZ_3 Genf   ──              ► ...
│               VZ_4 Luzern ──              ► ...
│
└──[Sprinter]──► Direktlieferung an Berner Apotheken im 20-km-Radius
```

- **HQ:** Hauptquartier in Bern — alle Waren gehen hier durch
- **VZ (Verteilzentrum):** 4 regionale Hubs, Kapazität 600 Einheiten, Backbone-Empfang vom HQ
- **mVZ (Mini-Verteilzentrum):** 20 lokale Hubs, Kapazität 125 Einheiten, Last-Mile-Auslieferung
- **Direktlieferung:** HQ beliefert Apotheken im 20-km-Radius direkt

### Datenbasis (real, keine Testdaten)

| Datei | Quelle | Inhalt |
|---|---|---|
| `apotheken.geojson` | OpenStreetMap / Overpass API | 400 echte Schweizer Apotheken |
| `population.geojson` | Eurostat Census Grid 2021 | 58.000 Bevölkerungszellen à 1 km² |
| `switzerland-*.osrm*` | Geofabrik.de / OSM | Vorverarbeitetes Schweizer Straßennetz |

---

## 3. Systemarchitektur

### Überblick — Cloud-Konzepte in der Praxis

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Browser (User)                                 │
│                  http://10.0.0.1 (VPN-Zugang)                       │
└──────────────────────────┬───────────────────────────────────────────┘
                           │ HTTP
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Nginx Reverse Proxy (Port 80)                     │
│         /api/*  →  FastAPI Backend                                   │
│           /*    →  React Frontend                                    │
└──────────────┬──────────────────────────────────────────────────────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
┌──────────────┐   ┌──────────────┐
│ FastAPI      │   │  React +     │
│ Backend      │   │  Vite        │
│ (Port 8000)  │   │  (Port 5173) │
└──────┬───────┘   └──────────────┘
       │
       ├──────────────────────► PostgreSQL + PostGIS
       │                         (Geodatenbank, Port 5432)
       │
       ├──────────────────────► Redis
       │                         (Message Broker, Port 6379)
       │
       ├──────────────────────► Celery Worker
       │                         (Async Pipeline-Ausführung)
       │
       └──────────────────────► OSRM Routing Engine
                                 (Schweizer Straßennetz, Port 5000)
```

### Cloud-Computing-Konzepte im Projekt

| Konzept | Umsetzung |
|---|---|
| **Containerisierung** | 6 Docker-Container, alle isoliert und reproduzierbar |
| **Microservices** | Jeder Service hat genau eine Aufgabe |
| **Asynchrone Verarbeitung** | Celery entkoppelt API von Berechnungen |
| **Service Discovery** | Docker-interne DNS-Auflösung (`postgres`, `redis`, `osrm`) |
| **Health Checks** | PostgreSQL-Healthcheck vor Backend-Start |
| **Persistenz** | Named Volume `postgres_data` überlebt Container-Neustarts |
| **Reverse Proxy** | Nginx routet Anfragen, abstrahiert interne Ports |
| **Infrastruktur als Code** | Gesamte Umgebung in `docker-compose.yml` deklariert |

---

## 4. Container-Orchestrierung mit Docker

### Die 6 Container

| Container | Image | Ports | Aufgabe |
|---|---|---|---|
| `pharma-postgres` | `postgis/postgis:16-3.4` | 5432 intern | Geodatenbank |
| `pharma-redis` | `redis:7-alpine` | 6379 | Task Queue Broker |
| `pharma-osrm` | Custom Build | 5000 intern | Routing Engine |
| `pharma-backend` | Python 3.12 | 8000 | REST-API + Pipeline |
| `pharma-worker` | Python 3.12 | — | Async Berechnung |
| `pharma-frontend` | Node 20 / Nginx | 5173 / 80 | Web-Oberfläche |

### Docker Compose — deklarative Infrastruktur

Alle 6 Container, ihre Abhängigkeiten und Konfigurationen sind in einer einzigen `docker-compose.yml` definiert. Ein einzelner Befehl startet das gesamte System:

```bash
docker-compose up --build
```

#### Abhängigkeitsgraph (Startup-Reihenfolge)

```
postgres (healthcheck: pg_isready)
    │
    ├──► backend (wartet auf postgres healthy)
    │         └──► worker (wartet auf postgres healthy)
    │
    └──► redis
              └──► worker (wartet auf redis started)
```

Das Backend startet erst, wenn PostgreSQL **wirklich bereit** ist — nicht nur wenn der Container läuft. Das verhindert Verbindungsfehler beim Start.

#### Bind-Mounts für schnelle Entwicklung

Im Dev-Modus werden Quellcode-Verzeichnisse direkt in die Container gemountet:

```yaml
volumes:
  - ./backend/app:/app/app     # Live-Reload ohne Image-Rebuild
  - ./backend/data:/app/data   # Apotheken-/Bevölkerungsdaten
```

Änderungen am Python-Code sind sofort wirksam — FastAPI läuft mit `--reload`.

#### Plattform-Handling (Apple Silicon vs. Server)

OSRM und PostgreSQL liefern nur `linux/amd64`-Images. Auf Apple Silicon (ARM) läuft das via Rosetta-Emulation:

```yaml
osrm:
  platform: linux/amd64   # läuft via Rosetta auf Apple Silicon
```

Auf dem Produktionsserver (x86-64 Ubuntu) entfällt diese Einschränkung.

#### Production vs. Development

```
docker-compose.yml          # Dev: Ports offen, bind-mounts, --reload
docker-compose.prod.yml     # Prod: restart=always, kein --reload
```

Durch Overriding mit `-f docker-compose.prod.yml` wird das Dev-Setup in ein Production-Setup überführt — ohne Duplikate.

---

## 5. Backend — Technologie-Stack im Detail

### 5.1 FastAPI — Das REST-API Framework

#### Was ist FastAPI?

FastAPI ist ein modernes Python-Web-Framework, das auf **ASGI** (Asynchronous Server Gateway Interface) basiert. Im Gegensatz zum älteren WSGI (Flask, Django) erlaubt ASGI echte Nebenläufigkeit ohne Threads — ideal für I/O-intensive APIs.

#### Warum FastAPI?

| Eigenschaft | Vorteil im Projekt |
|---|---|
| **Automatische OpenAPI-Docs** | `/docs` zeigt alle Endpoints mit Try-it-out |
| **Pydantic-Integration** | Typen werden validiert, Fehler klar kommuniziert |
| **Async/Await** | Kein Blockieren bei DB-Abfragen oder OSRM-Calls |
| **Dependency Injection** | DB-Session per `Depends(get_db)` automatisch verwaltet |
| **Lifespan Events** | Datenbankschema beim Start einmalig initialisiert |

#### Projekt-Struktur des Backends

```
backend/app/
├── main.py          # App-Instanz, CORS, Lifespan
├── config.py        # Einstellungen aus .env (pydantic-settings)
├── celery_app.py    # Celery-Konfiguration
│
├── api/             # HTTP-Routen (Router)
│   ├── health.py    # GET /api/health
│   ├── pipeline.py  # POST /api/pipeline/run/{step}
│   ├── results.py   # GET /api/results/...
│   └── settings.py  # GET/PUT /api/settings/...
│
├── db/              # Datenbankmodelle und -setup
│   ├── models.py    # SQLAlchemy ORM-Modelle
│   ├── init_db.py   # Schema-Initialisierung
│   └── session.py   # DB-Session Factory
│
├── pipeline/        # Berechnungsschritte
│   ├── a1_hub_placement.py
│   ├── a2_influence.py
│   ├── a3_demand.py
│   ├── a4_routes.py
│   └── runner.py    # Celery-Task-Wrapper
│
└── services/        # Externe Services
    ├── osrm.py      # OSRM HTTP-Client
    ├── tomtom.py    # TomTom Traffic API
    ├── traffic.py   # Tageszeit-Simulation
    └── downloader.py # Auto-Download von Geodaten
```

#### CORS-Konfiguration

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Im Dev-Modus; in Prod: spezifische Domain
    allow_methods=["*"],
    allow_headers=["*"],
)
```

In der Produktion sitzt Nginx vor dem Backend und stellt bereits die richtige Origin-Kontrolle sicher.

#### Konfigurationsmanagement mit pydantic-settings

Alle Umgebungsvariablen werden typsicher aus `.env` geladen:

```python
class Settings(BaseSettings):
    database_url: str
    redis_url: str
    osrm_url: str
    hq_lat: float = 46.9480
    hq_lon: float = 7.4474
    tomtom_api_key: str = ""
```

Die gesamte Anwendung liest Konfiguration aus einem einzigen `settings`-Objekt — kein `os.getenv` verstreut im Code.

---

### 5.2 Celery + Redis — Asynchrone Task Queue

#### Das Problem: Blockierende Berechnungen

Eine HTTP-Anfrage sollte in unter einer Sekunde beantwortet werden. Die Pipeline-Berechnungen dauern aber mehrere Minuten. Was tun?

**Ohne Celery:** Der API-Call würde blockieren, der Browser würde ein Timeout erhalten.

**Mit Celery:** Der API-Call enqueut einen Task in Redis und antwortet sofort mit `{"status": "running"}`. Der Worker berechnet im Hintergrund.

#### Wie funktioniert das?

```
Browser          FastAPI          Redis          Celery Worker
   │                │               │                 │
   │ POST /run/1    │               │                 │
   │──────────────►│               │                 │
   │                │ enqueue task  │                 │
   │                │──────────────►│                 │
   │                │               │ task available  │
   │ 200 OK         │               │────────────────►│
   │◄──────────────│               │                 │ berechnet...
   │                │               │                 │ (2 Minuten)
   │                │               │                 │
   │ GET /status    │               │ result stored   │
   │──────────────►│               │◄────────────────│
   │ {"status":"done"} │           │                 │
   │◄──────────────│               │                 │
```

#### Celery-Konfiguration

```python
celery_app = Celery(
    "pharma_logistics",
    broker=settings.redis_url,    # Redis als Message Broker
    backend=settings.redis_url,   # Redis speichert auch Ergebnisse
    include=["app.pipeline.runner"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    task_track_started=True,      # Status "running" wird sofort gesetzt
    timezone="UTC",
)
```

#### Task-Ausführung mit Concurrency

```
docker-compose.yml:
  command: celery -A app.celery_app worker --loglevel=info --concurrency=4
```

4 parallele Worker-Prozesse. Innerhalb der Pipeline-Steps werden zusätzlich `ThreadPoolExecutor`s mit 8 Threads für parallele OSRM-Calls genutzt.

#### Warum Redis als Broker?

Redis ist ein In-Memory Key-Value-Store, der als Message Broker für Celery ideal ist:
- **Extrem schnell** (alles im RAM, Latenz < 1ms)
- **Einfach** (kein Kafka-Overhead für diesen Anwendungsfall)
- **Reliabel** (persistiert Tasks bei Neustart dank AOF/RDB)
- **Dual-Verwendung:** Redis ist gleichzeitig Celery-Broker UND Ergebnis-Backend

---

### 5.3 PostgreSQL + PostGIS — Die Geodatenbank

#### Warum PostgreSQL statt Neo4j?

Das Vorgängerprojekt verwendete Neo4j (Graphdatenbank). Für dieses Projekt ist PostgreSQL die bessere Wahl:

| Kriterium | Neo4j | PostgreSQL + PostGIS |
|---|---|---|
| **Geodaten** | Kein nativer Support | Native GIS-Erweiterung |
| **Joins** | Traversals | Klassische SQL-Joins |
| **Spatial Queries** | Aufwändig | `ST_Distance`, `ST_Within`, etc. |
| **Docker-Image** | Groß, komplex | Offizielles `postgis/postgis` Image |
| **ORM-Support** | Begrenzt | Hervorragend (SQLAlchemy) |

#### PostGIS — Geospatiale Abfragen in SQL

PostGIS erweitert PostgreSQL um Geodatentypen und -funktionen. Im Projekt wird es für die Warenbedarf-Berechnung in Step 1 verwendet:

```sql
-- Alle Bevölkerungszellen innerhalb des Einzugsgebiets einer Apotheke
SELECT SUM(population)
FROM population_cells
WHERE ST_Distance(
    ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography,
    ST_SetSRID(ST_MakePoint(pharmacy_lon, pharmacy_lat), 4326)::geography
) <= catchment_radius_m
```

Das entspricht einer räumlichen Bereichsabfrage über 58.000 Bevölkerungszellen — in Millisekunden.

#### SQLAlchemy ORM — Datenbankzugriff in Python

SQLAlchemy 2.0 ermöglicht typsicheren Datenbankzugriff über Python-Klassen. Keine SQL-Strings im Anwendungscode:

```python
class Pharmacy(Base):
    __tablename__ = "pharmacies"
    id = mapped_column(Integer, primary_key=True)
    name = mapped_column(String)
    lat = mapped_column(Float)
    lon = mapped_column(Float)
    demand = mapped_column(Integer, nullable=True)    # gesetzt in Step 1
    hub_name = mapped_column(String, nullable=True)  # gesetzt in Step 3
```

#### Datenbankschema — Übersicht

```
pharmacies          hubs               assignments
──────────          ────               ───────────
id                  id                 id
osm_id              name               pharmacy_id ──► pharmacies
name                hub_type           hub_name
city                lat / lon          distance_km
lat / lon           parent_hub         travel_time_h
demand              capacity           route_geometry
hub_name            open/close_hour    
open/close_hour     

vehicle_routes      pipeline_runs      population_cells
──────────────      ─────────────      ────────────────
id                  id                 id
hub_name            step               lat / lon
vehicle_id          status             population
vehicle_type        started_at
stops               finished_at
total_km/hours      error_message
total_cost_chf
co2_kg
supply_tier
```

---

### 5.4 OSRM — Die selbst-gehostete Routing Engine

#### Was ist OSRM?

OSRM (Open Source Routing Machine) ist eine Hochleistungs-Routing-Engine, die auf OpenStreetMap-Daten basiert. Im Gegensatz zu kommerziellen Routing-APIs:

- **100% kostenlos** — keine API-Calls, keine Limits
- **Datenschutzkonform** — keine Koordinaten werden an externe Server gesendet
- **Schnell** — die vorverarbeiteten Graphen ermöglichen Anfragen in Millisekunden
- **Offline-fähig** — funktioniert ohne Internetverbindung

#### Wie funktioniert OSRM intern?

OSRM verwendet den **Multi-Level-Dijkstra (MLD)** Algorithmus, der deutlich schneller als klassischer Dijkstra ist. Dafür muss das Straßennetz vorverarbeitet werden:

```
Rohe OSM-Daten (.osm.pbf)
         │
         ▼ osrm-extract (Extraktion relevanter Kanten)
         │
         ▼ osrm-partition (Hierarchische Zerlegung des Graphen)
         │
         ▼ osrm-customize (Gewichtungsberechnung)
         │
Vorverarbeiteter Graph (.osrm.*)  ←── liegt bereits im Repo (2.3 GB)
         │
         ▼
OSRM Backend (HTTP Server, Port 5000)
```

Die Vorverarbeitung läuft einmalig und dauert mehrere Stunden. Das Ergebnis (der verarbeitete Graph) ist im Repository bereits enthalten, sodass der Container sofort startet.

#### OSRM APIs im Projekt

**1. Table API** — Distanz-/Zeitmatrix in einem Aufruf

```
GET /table/v1/driving/{koordinaten}?sources=...&destinations=...&annotations=distance,duration
```

Im Step 3 wird eine vollständige `400 × 26`-Matrix (400 Apotheken × 26 Hubs) in **einem einzigen HTTP-Request** berechnet. Das wären 10.400 einzelne Routing-Anfragen — OSRM löst das in Sekunden.

```python
def osrm_table(sources, destinations):
    all_coords = sources + destinations
    url = f"{OSRM_URL}/table/v1/driving/{_lonlat(all_coords)}?..."
    r = requests.get(url, timeout=120)
    dist_m = np.array(data["distances"])  # numpy für Matrixoperationen
    time_s = np.array(data["durations"])
    return dist_m / 1000.0, time_s / 3600.0
```

**2. Route API** — Straßengeometrie für die Visualisierung

```
GET /route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson
```

Liefert die exakte Straßengeometrie als GeoJSON-Koordinaten — für die Linien auf der Karte. Im Step 3 und 4 werden diese für alle 400+ Routen parallel in 8 Threads abgerufen.

**3. Fallback auf Luftlinie**

Falls OSRM für eine Route keine Antwort liefert (z.B. eine Apotheke liegt auf einer Insel, die nicht verbunden ist), wird automatisch auf eine gerade Linie als Fallback zurückgegriffen — das verhindert, dass ein einzelner Fehler die gesamte Pipeline stoppt.

---

### 5.5 TomTom Traffic API — Live-Verkehr

#### Architektur: Zwei Modi

Das System unterstützt zwei Verkehrsmodi, die über die Web-Oberfläche umschaltbar sind:

```
traffic_factor (DB-Konfiguration)
       │
       ├──► Wert 1.0         → Freifluss (kein Stau)
       │
       ├──► Simulation       → Tageszeit-basierter Faktor
       │    (traffic.py)       Morgenspitze: ×1.45
       │                       Abendspitze: ×1.55
       │
       └──► TomTom Live      → Echter Echtzeit-Faktor von der API
            (tomtom.py)        Abgerufen alle 2 Minuten, gecacht
```

#### TomTom Flow Segment Data

Die erste verwendete API ist **Traffic Flow Segment Data**. Sie liefert für einen konkreten Straßenpunkt die aktuelle und die Freiflussgeschwindigkeit:

```python
url = "https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json"
    + f"?point={lat},{lon}&key={api_key}"
```

Das Projekt sampelt **5 repräsentative Punkte** in der Schweiz (Zürich, Bern, Genf, Basel, Luzern) und berechnet den **mittleren Staufaktor**:

```python
factor = freeFlowSpeed / currentSpeed
# factor = 1.0 → kein Stau
# factor = 1.5 → 50% langsamer als üblich (schwerer Stau)
```

Dieser Wert wird **2 Minuten gecacht** (TomTom aktualisiert den Traffic alle 2 Minuten), um das API-Kontingent zu schonen.

#### TomTom Matrix Routing v2 — Traffic-aware Fahrtzeiten

Die zweite API liefert eine **verkehrsberücksichtigte Reisezeitmatrix**:

```python
body = {
    "origins": [...],
    "destinations": [...],
    "options": {
        "departAt": "now",     # Abfahrt jetzt
        "traffic": "live",     # echte Verkehrslage
        "travelMode": "car"
    }
}
```

**Technische Herausforderung:** Matrix Routing v2 mit Live-Verkehr erlaubt max. 100 Zellen pro Request (10×10). Für größere Matrizen wird automatisch **tiled** — die große Matrix wird in 10×10-Blöcke zerlegt und nacheinander abgefragt.

**Rate-Limiting-Problem:** Der TomTom Developer-Plan erlaubt nur ~1 Request/Sekunde. Da Step 4 mit 8 parallelen Threads arbeitet, würde es sofort HTTP 429 geben. Lösung: Ein globales Semaphore (`threading.Semaphore(1)`) serialisiert alle Matrix-Requests. Bei HTTP 429 werden automatisch bis zu 3 Retries mit exponentiellem Backoff ausgeführt (2s, 5s, 10s).

#### API-Key Management

Der API-Key kann über zwei Wege gesetzt werden:
1. **`.env`-Datei:** Standard-Key für alle Berechnungen
2. **Web-Oberfläche:** Überschreibt den `.env`-Key für die aktuelle Session

Der Key wird nie vollständig angezeigt — nur die letzten 4 Zeichen sind sichtbar (`••••wxyz`).

---

## 6. Die 4-stufige Berechnungs-Pipeline

### Überblick: Warum diese Reihenfolge?

Die Berechnungsreihenfolge ist **bewusst sequenziell** und aufeinander aufbauend:

```
Step 1: Nachfrage  →  Step 2: Hubs  →  Step 3: Zuweisung  →  Step 4: Routen
  (Basis für         (Basis für         (Basis für            (Endresultat)
   Gewichtung)        Platzierung)       Routenplanung)
```

Hub Placement **ohne** Nachfragedaten würde Hubs gleichmäßig verteilen — aber nicht dorthin, wo der Bedarf tatsächlich ist.

### Step 1 — Warenbedarf (~1–2 Minuten)

**Datei:** [`backend/app/pipeline/a3_demand.py`](backend/app/pipeline/a3_demand.py)

**Frage:** Wie viele Wareneinheiten benötigt jede Apotheke pro Lieferzyklus?

#### Algorithmus: Geometrisches Catchment-Modell

Jede Apotheke hat ein **Einzugsgebiet** — den geografischen Bereich, aus dem ihre Kunden kommen. Dieses Gebiet wird approximiert durch:

```
radius = min(⅔ × Distanz zur nächsten Konkurrenz, max_catchment_km)
```

Warum ⅔? Ein Kunde, der zwischen zwei gleich weit entfernten Apotheken wohnt, geht tendenziell zur nächstgelegenen. Mit dem ⅔-Faktor modellieren wir, dass der Einflussbereich vor der Halbierungslinie endet.

```python
Warenbedarf = max(1, ceil(Bevölkerung_im_Radius / population_per_item))
# population_per_item = 12.000 (Standard)
# Eine Apotheke mit 36.000 Menschen im Einzugsgebiet → Bedarf 3 Einheiten
```

**PostGIS-Spatial-Query:**

```sql
SELECT SUM(population) FROM population_cells
WHERE ST_Distance(zelle, apotheke) <= catchment_radius_m
```

58.000 Bevölkerungszellen × 400 Apotheken = 23.200.000 potenzielle Vergleiche — PostGIS erledigt das dank räumlicher Indizes in Sekunden.

---

### Step 2 — Hub Placement (~5–10 Sekunden)

**Datei:** [`backend/app/pipeline/a1_hub_placement.py`](backend/app/pipeline/a1_hub_placement.py)

**Frage:** Wo sollen die 4 VZs und 20 mVZs stehen?

#### Algorithmus: Nachfragegewichteter Greedy p-Median

Das **p-Median-Problem** fragt: Platziere p Einrichtungen so, dass die gewichtete Summe der Distanzen aller Nachfragepunkte zur nächsten Einrichtung minimiert wird.

Exakte Lösung: NP-schwer (exponentieller Aufwand). Unser Ansatz: Greedy-Approximation mit Demand-Gewichtung.

```python
# 1. Haversine-Distanzmatrix aufbauen (400 Apotheken + HQ)
dist_matrix = haversine_matrix(pharmacy_coords)  # numpy, vectorized

# 2. Demand-Gewichte normalisieren
weights = demand_array / mean(demand_array)

# 3. Greedy: Iterativ den besten Standort wählen
for _ in range(n_vz):
    bester_hub = argmax(
        sum(weights × max(0, min_dist_alt - min_dist_new))
    )
    # "Welche Apotheke reduziert die gewichtete Gesamtdistanz am meisten?"
```

**Constraints:**
- VZs mindestens 40 km voneinander entfernt (Haversine)
- VZs mindestens 25 km vom HQ entfernt
- mVZs mindestens 18 km voneinander entfernt
- Kapazitätsbewusste Apothekenzuweisung (Nearest-Hub-with-Capacity)

**Ergebnis:** 25 Hubs (1 HQ + 4 VZ + 20 mVZ) mit Koordinaten, Kapazitäten, Öffnungszeiten und Eltern-Hub-Zuordnungen.

---

### Step 3 — Einzugsgebiete (~2–3 Minuten)

**Datei:** [`backend/app/pipeline/a2_influence.py`](backend/app/pipeline/a2_influence.py)

**Frage:** Welcher Hub beliefert welche Apotheke — basierend auf **echten Straßenfahrtzeiten**?

#### Algorithmus

Step 2 nutzte Haversine (Luftlinie) für Geschwindigkeit. Step 3 nutzt **echte OSRM-Straßendistanzen** — weil die kürzeste Luftlinie oft nicht der schnellsten Straßenroute entspricht (Alpen!).

```python
# 1. OSRM Table-Request: 400 Apotheken × 26 Hubs in EINEM HTTP-Call
distances, durations = osrm_table(pharmacy_coords, hub_coords)
# durations.shape = (400, 26) — Fahrzeit in Stunden

# 2. HQ-Direktlieferungsradius anwenden
# Apotheken > 20 km vom HQ → HQ aus Kandidaten ausblenden
durations[apotheken_zu_weit, hq_idx] = 1e9

# 3. Kapazitätsbewusste Zuweisung
# Apotheken nach kürzester Fahrzeit sortiert → Nearest-Hub-with-Capacity
for apotheke in sorted_by_best_time:
    hub = first_hub_with_remaining_capacity(durations[apotheke])
    assign(apotheke, hub)
```

**Parallele OSRM-Geometrien:**

Für alle 400 Zuweisungen werden die Straßengeometrien für die Karte abgerufen. Das geschieht parallel mit 8 Threads:

```python
with ThreadPoolExecutor(max_workers=8) as pool:
    geometries = list(pool.map(osrm_geometry, assignments))
```

---

### Step 4 — Routenoptimierung (~1–2 Minuten)

**Datei:** [`backend/app/pipeline/a4_routes.py`](backend/app/pipeline/a4_routes.py)

**Frage:** Welche Fahrzeuge fahren welche Routen, optimiert nach Kosten, Zeit und CO₂?

#### Last-Mile Routing: Greedy Nearest-Neighbour VRP

VRP = Vehicle Routing Problem. Das klassische VRP ist NP-schwer. Unser Greedy-Ansatz liefert in Sekunden eine gute (nicht optimale) Lösung.

```
Für jeden Hub:
  Für jedes verfügbare Fahrzeug (in Prioritätsreihenfolge):
    1. Lade Fahrzeug voll (items_loaded = capacity)
    2. Starte am Hub
    3. Wähle nächsten Stop mit kleinstem Composite-Score:
       score = w_cost × (km × CHF/km)
             + w_time × (h × Fahrerlohn)
             + w_env  × (CO₂_g/km × km / 1000 × CHF/kg_CO₂)
    4. Prüfe Constraints (Kapazität, Reichweite, Schicht, Öffnungszeiten)
    5. Stop hinzufügen, Restkapazität reduzieren
    6. Wenn kein Stop mehr möglich: zum Hub zurückfahren
    7. Nächstes Fahrzeug beginnt
```

#### Multi-Objekt-Score: Was bedeuten die Gewichte?

```
score = 0.40 × Fahrtkosten
      + 0.35 × Fahrzeitkosten
      + 0.25 × CO₂-Kosten

# Beispiel: Sprinter vs. LKW für eine 50-km-Strecke
Sprinter:  0.40×19 + 0.35×34 + 0.25×9.25  = 7.60 + 11.90 + 2.31  = 21.81
Klein-LKW: 0.40×35 + 0.35×36 + 0.25×11.5  = 14.0 + 12.60 + 2.87  = 29.47
→ Sprinter gewinnt auf dieser Strecke
```

#### Backbone Routing

Das HQ beliefert VZs, VZs beliefern mVZs — mit denselben VRP-Algorithmen, aber mit backbone-fähigen Fahrzeugen (Klein-LKW, LKW, Zug).

#### Parallelisierung über Hubs

Da jeder Hub unabhängig von den anderen optimiert werden kann, laufen alle 25 Hubs parallel:

```python
with ThreadPoolExecutor(max_workers=8) as pool:
    all_routes = list(pool.map(optimize_hub_routes, hubs))
```

---

## 7. Optimierungsmodell & Algorithmen

### Composite Score — Die zentrale Routing-Entscheidung

Jede Routing-Entscheidung basiert auf einem einheitlichen, gewichteten Score:

```
score = w_cost × (d_km × CHF/km)
      + w_time × ((d_km/speed × traffic_factor + service_min/60) × Fahrerlohn)
      + w_env  × (d_km × CO₂_g/km / 1000 × CO₂_Schattenpreis)
```

**Konfigurierbare Gewichte** (Standard):

| Gewicht | Wert | Bedeutung |
|---|---|---|
| `w_cost` | 0.40 (40%) | Direkte Fahrtkosten in CHF/km |
| `w_time` | 0.35 (35%) | Fahrerarbeitszeit × Stundenlohn |
| `w_env` | 0.25 (25%) | CO₂-Emissionen × Schattenpreis (0.12 CHF/kg) |

### Constraints — Was das Routing einschränkt

| Constraint | Bedingung | Begründung |
|---|---|---|
| **Kapazität** | `demand ≤ items_loaded` | Fahrzeug kann nicht überladen werden |
| **Reichweite** | `km_used + d_hin + d_zurück ≤ range_km` | Sprinter hat 350 km Tagesreichweite |
| **Schicht** | `hours_used + Fahrzeit + Service ≤ shift_hours` | 8-Stunden-Schicht |
| **Öffnungszeiten** | `open_hour ≤ Ankunft ≤ close_hour − service_min/60` | Apotheke muss offen sein |

### Traffic Factor — Verbindung zu Live-Verkehr

```python
# In a4_routes.py wird die Fahrzeit skaliert:
drive_h = (d_km / vehicle.speed_kmh) × traffic_factor

# traffic_factor = 1.0 → Freifluss
# traffic_factor = 1.45 → Morgenspitze (Simulation)
# traffic_factor = TomTom-API-Wert → Echtzeit
```

Der `traffic_factor` ist in der Datenbank konfigurierbar — ein einziger Wert beeinflusst alle Routen aller Fahrzeuge gleichzeitig.

### Fahrzeugflotte — Technische Parameter

| Fahrzeug | Last-Mile | Backbone | Kapazität | Reichweite | CHF/km | CO₂/km |
|---|---|---|---|---|---|---|
| Sprinter | ✅ | ✅ | 15 | 350 km | 0.38 | 185 g |
| Klein-LKW | ✅ | ✅ | 40 | 450 km | 0.70 | 230 g |
| LKW | — | ✅ | 200 | 600 km | 1.20 | 280 g |
| Zug | — | ✅ | 1.000 | 2.000 km | 3.20 | 520 g |

---

## 8. Frontend & Visualisierung

### Tech-Stack

| Technologie | Version | Zweck |
|---|---|---|
| React | 18.3 | UI-Framework (Komponentenmodell) |
| TypeScript | 5.6 | Typsicherheit, bessere IDE-Unterstützung |
| MapLibre GL JS | 4.7 | Interaktive Vektorkarte |
| Vite | 5.4 | Build-Tool mit Hot Module Replacement |
| Tailwind CSS | 3.4 | Utility-first Styling ohne CSS-Dateien |

### Warum MapLibre GL statt Folium?

| Eigenschaft | Folium (alt) | MapLibre GL (neu) |
|---|---|---|
| Rendering | Server-side HTML | Client-side WebGL |
| Interaktivität | Begrenzt | Vollständig (Hover, Klick, Filter) |
| Performance | Langsam bei vielen Features | Flüssig mit Tausenden von Linien |
| Stil-Kontrolle | Limitiert | Vollständige Kontrolle |
| Echtzeit-Updates | Nicht möglich | Nahtlos |

MapLibre GL rendert alle Kartenelemente (Punkte, Linien, Polygone) auf der GPU via WebGL — selbst 400 Apothekenmarker und Hunderte von Routenlinien laufen flüssig.

### Navigation: 3 Bereiche

**1. Karte (Hauptansicht)**
- Pipeline-Steuerung (Start/Status der 4 Steps)
- Interaktive Karte mit ein-/ausblendabaren Layern
- Klick auf Apotheke/Hub → Hervorhebung der Lieferkette
- Hover → Tooltip mit Detailinfos

**2. Analyse-Dashboard** (nach Step 4)

| Tab | Inhalt |
|---|---|
| Übersicht | KPI-Karten: Gesamtkosten, km, CO₂, Routen |
| Fahrzeuge | Auslastungstabelle, aufklappbare Routenlisten |
| Hubs | Lagerauslastung aller 25 Hubs als Balkendiagramm |
| CO₂ & Umwelt | Emissionsvergleich Sprinter vs. LKW vs. Zug |

**3. Einstellungen**
- Fahrzeugflotte vollständig editierbar (CRUD)
- Optimierungsparameter (Gewichte, Kapazitäten, Radien)
- TomTom API-Key Verwaltung mit Live-Test-Funktion
- Alle Änderungen werden sofort in PostgreSQL gespeichert

### Kartenvisualisierung — Layer

| Layer | Farbe | Beschreibung |
|---|---|---|
| Apotheken | Blau | Kreise skaliert mit Warenbedarf |
| HQ | Violett | Hauptquartier Bern |
| VZs | Dunkelblau | 4 Verteilzentren |
| mVZs | Bernstein | 20 Mini-Verteilzentren |
| Einzugslinien | Blau/Bernstein | Hub → Apotheke (Straßenlinie) |
| Backbone | Rot / Teal | HQ→VZ / VZ→mVZ |
| Sprinter-Routen | Cyan | Last-Mile |
| Klein-LKW-Routen | Grün | Last-Mile |
| LKW-Routen | Violett | Backbone |
| Zug-Routen | Pink | Backbone |

---

## 9. Deployment & Cloud-Betrieb

### Server-Infrastruktur

| Eigenschaft | Wert |
|---|---|
| OS | Ubuntu 22.04 LTS |
| RAM | 32 GB |
| Speicher | 512 GB SSD |
| Zugang | WireGuard VPN → `http://10.0.0.1` |
| Container-Management | Docker Compose + Portainer |
| Monitoring | Uptime Kuma |

### Production vs. Development

```yaml
# docker-compose.prod.yml — Overrides für Production
services:
  backend:
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000
    #         kein --reload in Production
    restart: always
    platform: linux/amd64   # Server ist x86-64

  worker:
    restart: always
    platform: linux/amd64
```

Start auf dem Server:
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Nginx als Reverse Proxy

```
Browser → nginx:80 → /api/* → backend:8000 (FastAPI)
                   → /*     → frontend:80  (React, statisch)
```

Nginx übernimmt:
- **Single Entry Point:** Außen ist nur Port 80 erreichbar
- **SSL-Termination:** (vorbereitet für Let's Encrypt)
- **Statische Dateien:** React-Build wird direkt von Nginx ausgeliefert

### Health Monitoring

```bash
# Uptime Kuma prüft minütlich:
GET http://10.0.0.1/api/health
# Antwort: {"status": "ok", "db": "connected"}
```

Bei Ausfall → Benachrichtigung via Telegram/E-Mail.

### Datenbank-Persistenz

PostgreSQL-Daten liegen in einem Docker **Named Volume** (`postgres_data`):
- Container-Neustarts löschen keine Daten
- `docker-compose down` löscht keine Daten
- `docker-compose down -v` löscht alle Daten (Reset)

---

## 10. Live-Demo & Ergebnisse

### Typische Pipeline-Laufzeiten

| Schritt | Dauer | Bottleneck |
|---|---|---|
| Step 1 — Warenbedarf | 1–2 min | PostGIS-Spatial-Queries (58K × 400) |
| Step 2 — Hub Placement | 5–10 sek | Numpy-Matrixoperationen |
| Step 3 — Einzugsgebiete | 2–3 min | OSRM Table + 400 parallele Route-Calls |
| Step 4 — Routenoptimierung | 1–2 min | VRP über 25 Hubs + OSRM-Geometrien |

### Beispielhafte Ergebnisse (Schweiz, 400 Apotheken)

| Metrik | Wert |
|---|---|
| Hubs gesamt | 25 (1 HQ, 4 VZ, 20 mVZ) |
| Letzte-Meile-Routen | ~80–120 (je nach Flottengröße) |
| Backbone-Routen | ~20–30 |
| Gesamtstrecke | ~15.000–25.000 km/Lieferzyklus |
| Fahrzeuge eingesetzt | ~100–150 |

### Was die Karte zeigt

Nach Abschluss aller 4 Steps ist die Karte interaktiv navigierbar:

1. **Klick auf Apotheke** → zeigt ihren Hub, Warenbedarf, Lieferlinie
2. **Klick auf Hub** → zeigt alle Fahrzeugrouten dieses Hubs, dimmt den Rest
3. **Klick auf Fahrzeug-Modal** → isoliert genau diese eine Route auf der Karte
4. **CO₂-Tab** → vergleicht Emissionen verschiedener Fahrzeugtypen

---

## 11. Erfüllungsgrad der Anforderungen

### DHBW-Anforderungen: Projekt 9 — Optimierung von Logistikrouten

| Anforderung | Status | Umsetzung |
|---|---|---|
| **Routenoptimierung** | ✅ Vollständig | Greedy VRP mit Multi-Objekt-Score |
| **Graphenalgorithmen** | ✅ Vollständig | Greedy p-Median für Hub Placement |
| **Faktor: Entfernung** | ✅ Vollständig | Haversine (Placement) + OSRM Straßen |
| **Faktor: Verkehr** | ⚠️ Vorbereitet | `traffic_factor` konfigurierbar; TomTom API integriert |
| **Faktor: Transportkapazität** | ✅ Vollständig | Kapazität pro Fahrzeug und Hub |
| **Kosten-Optimierung** | ✅ Vollständig | CHF/km + Fahrerlohn im Score |
| **Zeit-Optimierung** | ✅ Vollständig | Fahrzeit × Fahrerlohn im Score |
| **Umwelt-Optimierung** | ✅ Vollständig | CO₂-Emissionen monetarisiert |
| **OpenStreetMap-Daten** | ✅ Vollständig | OSRM mit echtem CH-Straßennetz |
| **Interaktive Visualisierung** | ✅ Vollständig | MapLibre GL, weit über Folium hinaus |
| **Datenbankintegration** | ✅ Vollständig | PostgreSQL + PostGIS |
| **Cloud/Container-Betrieb** | ✅ Vollständig | Docker Compose, 6 Container |

### Eigenleistungen über die Anforderungen hinaus

- **Mehrstufige Lieferkette** (HQ → VZ → mVZ → Apotheke) mit echten Backbone-Routen
- **HQ-Direktlieferung** für nahegelegene Apotheken (konfigurierbarer Radius)
- **Nachfragegewichtetes Hub Placement** — Hubs gehen dorthin, wo der Bedarf ist
- **Kapazitätsbewusste Zuweisung** in zwei Schritten (Haversine + Straßenrouting)
- **Vollständige Web-App** mit Analyse-Dashboard und Einstellungen
- **Konfigurierbare Fahrzeugflotte** mit CRUD-Interface
- **Öffnungszeiten-Constraint** im Routing
- **CO₂-Tracking** pro Fahrzeug mit Analyse-Tab
- **TomTom Live-Traffic-Integration** (API voll integriert, Key über UI verwaltbar)

---

## 12. Fazit & Ausblick

### Was wurde erreicht?

Aus einem Jupyter-Notebook wurde eine vollwertige Cloud-Applikation:

| Vorher | Nachher |
|---|---|
| Jupyter Notebook, läuft lokal | Dockerisierte Web-App, auf Server deployed |
| Folium-Karte (statisch) | MapLibre GL (interaktiv, GPU-beschleunigt) |
| Berechnungen blockieren den Browser | Celery-Worker läuft asynchron im Hintergrund |
| Keine Persistenz | PostgreSQL + PostGIS speichert alle Ergebnisse |
| Keine Konfigurierbarkeit | Vollständige Settings-Seite, alles änderbar |
| Kein echtes Straßennetz | OSRM mit realem Schweizer OpenStreetMap-Netz |
| Keine Mehrbenutzerfähigkeit | Web-App, mehrere Nutzer gleichzeitig möglich |

### Technische Highlights

1. **Eine OSRM Table-Request ersetzt 10.400 einzelne Routing-Anfragen** — das ist der entscheidende Performance-Trick in Step 3
2. **Celery entkoppelt API von Berechnung** — der Browser wartet nie blockierend
3. **PostGIS macht Spatial-Queries trivial** — 23 Millionen potenzielle Abstands-Checks in Sekunden
4. **Nachfragegewichteter p-Median** — Hubs werden dorthin gezogen, wo Menschen sind, nicht wo Luftlinie passt
5. **Multi-Objekt-Scoring** — ein einziger Score balanciert Kosten, Zeit und Umwelt

### Ausblick — Was wäre noch möglich?

**Kurzfristig (einfach umsetzbar):**
- Tageszeit-basierter Traffic-Faktor aktivieren (Code bereits vorhanden in `traffic.py`)
- Let's Encrypt für HTTPS (1 Befehl mit Certbot)
- Mehrere HQ-Standorte konfigurierbar machen

**Mittelfristig:**
- OSRM Custom Speed Profiles (CSV-basierte Verkehrsanpassung ohne API-Abhängigkeit)
- HERE Traffic API als Alternative zu TomTom (250.000 freie Requests/Monat)
- Export der Routen als GPX/CSV für reale Fahrer

**Langfristig:**
- Echtes Ganzzahliges p-Median (ILP) statt Greedy-Approximation (mit PuLP oder OR-Tools)
- Zeitfensterbeschränkungen für Kundenbesuche (VRPTW)
- Kubernetes-Deployment für automatische Skalierung bei hoher Last

---

## Anhang: API-Referenz

### Endpoints

| Endpoint | Methode | Beschreibung |
|---|---|---|
| `/api/health` | GET | Health-Check |
| `/api/pipeline/status` | GET | Status aller 4 Steps |
| `/api/pipeline/run/{step}` | POST | Step 1–4 starten |
| `/api/pipeline/reset` | POST | Alle Ergebnisse löschen |
| `/api/results/pharmacies` | GET | GeoJSON: 400 Apotheken |
| `/api/results/hubs` | GET | GeoJSON: 25 Hubs |
| `/api/results/assignments` | GET | GeoJSON: Hub→Apotheke-Linien |
| `/api/results/routes` | GET | GeoJSON: Fahrzeugrouten |
| `/api/results/backbone` | GET | GeoJSON: Backbone-Lieferkette |
| `/api/results/summary/full` | GET | Vollständige Analyse-Daten |
| `/api/settings/vehicles` | GET/POST | Fahrzeugflotte |
| `/api/settings/vehicles/{id}` | PUT/DELETE | Fahrzeug bearbeiten |
| `/api/settings/system` | GET/PUT | Systemparameter |

Interaktive Dokumentation: `http://localhost:8000/docs`

---

## Anhang: Starten & Entwickeln

```bash
# Erststart (alle Images bauen, ~3–5 Minuten)
docker-compose up --build

# Normaler Start
docker-compose up

# Nur Backend + Dependencies (ohne Frontend)
docker-compose up postgres redis osrm backend worker

# Logs eines Services anzeigen
docker-compose logs -f backend

# Kompletter Reset (alle Daten löschen)
docker-compose down -v && docker-compose up --build

# Production-Start
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Ports lokal:**

| URL | Beschreibung |
|---|---|
| `http://localhost:5173` | Web-App |
| `http://localhost:8000/docs` | FastAPI Swagger UI |
| `http://localhost:8000/api/health` | Health-Check |
| `localhost:5433` | PostgreSQL (User: pharma, PW: pharma) |

# Pharma Logistics CH

Optimierungssystem für die Schweizer Apothekenlogistik — berechnet Hub-Standorte, Einzugsgebiete, Warenbedarf und Fahrzeugrouten für 400 Apotheken in der gesamten Schweiz.

## Architektur

```
Browser (5173/80)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│                    Nginx (Port 80, Prod)             │
│           /api/* → Backend    / → Frontend           │
└───────────────────┬─────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────┐       ┌────────────────┐
│  FastAPI     │       │  React + Vite  │
│  (Port 8000) │       │  (Port 5173)   │
└──────┬───────┘       └────────────────┘
       │
       ├──── PostgreSQL + PostGIS (Port 5433 extern)
       ├──── Redis (Celery Broker)
       ├──── Celery Worker (Pipeline-Execution)
       └──── OSRM (Port 5001, Routing Engine)
```

## Services

| Container | Bild | Zweck |
|-----------|------|-------|
| `pharma-postgres` | postgis/postgis:16-3.4 | Datenbank (Apotheken, Hubs, Routen) |
| `pharma-redis` | redis:7-alpine | Message Broker für Celery |
| `pharma-osrm` | osrm/osrm-backend:latest | Straßenrouting für die Schweiz |
| `pharma-backend` | Python 3.12 + FastAPI | REST-API + Pipeline-Orchestrierung |
| `pharma-worker` | Python 3.12 + Celery | Async Ausführung der Pipeline-Steps |
| `pharma-frontend` | Node 20 + Vite | Interaktive Karten-Web-App |

## Voraussetzungen

- Docker + Docker Compose
- Mindestens 6 GB freier RAM (OSRM benötigt ~1.5 GB)
- Die Datendateien sind bereits enthalten:
  - `backend/data/apotheken.geojson` — 400 Schweizer Apotheken
  - `backend/data/population.geojson` — Eurostat Bevölkerungsraster (58k Zellen)
  - `osrm/data/switzerland-260525-roads.osrm*` — Vorverarbeitetes Straßennetz
  - `osrm/data/switzerland-260525-roads.osm.pbf` — Rohdaten (Fallback)

## Lokaler Start

```bash
docker-compose up --build
```

Beim ersten Start: Images werden gebaut (~3–5 Min).

| URL | Beschreibung |
|-----|-------------|
| `http://localhost:5173` | Web-App (Karte + Pipeline) |
| `http://localhost:8000/docs` | FastAPI Swagger UI |
| `http://localhost:8000/api/health` | Health-Check |
| `localhost:5433` | PostgreSQL (User: pharma, Passwort: pharma) |

> **Hinweis:** Der Host-Port für PostgreSQL ist `5433` (intern nutzen alle Container `5432`).

## Pipeline-Steps

Die Pipeline besteht aus 4 aufeinanderfolgenden Schritten, die per Klick in der Web-App ausgeführt werden.

### Schritt 1 — Hub Placement (~5–10 Sekunden)

**Was:** Optimale Standorte für Verteilzentren (VZ) und Mini-Verteilzentren (mVZ) berechnen.

**Algorithmus:** Dijkstra-inspirierter Greedy p-Median

1. Baut eine vollständige Haversine-Distanzmatrix (400 Apotheken + HQ)
2. Platziert VZs iterativ: wählt jeweils den Standort mit dem größten gewichteten Erreichbarkeitsgewinn
3. Constraints: VZs ≥40 km Abstand untereinander, ≥25 km vom HQ
4. Mini-VZs analog, mindestens 18 km Abstand
5. Jede Apotheke wird dem nächsten VZ (≤45 km) oder Mini-VZ zugewiesen

**Budget:** 1× HQ (Bern) + 4× VZ + 20× mVZ = 25 Hubs

**Karte:** Oranger Punkt = VZ, grüner Punkt = mVZ, roter Punkt = HQ

---

### Schritt 2 — Influence Zones (~2–3 Minuten)

**Was:** Jede Apotheke wird dem straßennächsten Hub (Fahrzeit, nicht Luftlinie) zugewiesen.

**Algorithmus:**
1. Ruft OSRM `/table`-Endpoint auf → vollständige Distanz + Zeit-Matrix (400 × 24) in einem HTTP-Call
2. `argmin(Fahrzeit)` pro Apotheke → nächster Hub
3. Holt Straßengeometrie für jede der 400 Routen (parallel, 8 Threads)
4. Speichert Route-Geometrien als GeoJSON LineStrings in der DB

**Karte:** Farbige Linien von Hub zu Apotheke (orange = VZ-Einzugsgebiet, grün = mVZ)

---

### Schritt 3 — Warenbedarf (~1–2 Minuten)

**Was:** Wie viele Waren braucht jede Apotheke pro Lieferzyklus?

**Modell:** Geometrisches Catchment-Modell
1. Einzugsgebiet-Radius = `min(2/3 × Distanz zur nächsten Konkurrenz, 10 km)`
2. Summiert Bevölkerung aller 1km²-Zellen innerhalb des Einzugsgebiets
3. Warenbedarf = `max(1, ceil(Bevölkerung / 12.000))`

**Karte:** Apothekenkreise skalieren nach Demand-Wert

---

### Schritt 4 — Routenoptimierung (~30 Sekunden)

**Was:** Konkrete Fahrzeugrouten für jeden Hub berechnen.

**Algorithmus:** Greedy Nearest-Neighbour VRP mit gemischter Flotte (parallelisiert, 8 Threads)

| Fahrzeug | Kapazität | Reichweite | Service/Stop | Max/Hub |
|----------|-----------|------------|--------------|---------|
| EVan (Elektro) | 30 Waren | 150 km (+80 km Ersttrip) | 30 Min | 12 |
| LKW | Unbegrenzt | 600 km | 40 Min | 3 |

EVans werden zuerst eingesetzt, LKWs für verbleibende Stops. Schichtlänge: 8h.

**Karte:** Grüne Linien = EVan-Routen, blaue Linien = LKW-Routen

---

## Karten-Bedienung

| Aktion | Ergebnis |
|--------|---------|
| Klick auf Apotheke | Detailpanel: Name, Stadt, Demand, Hub, Distanz |
| Klick auf Hub | Detailpanel: Typ (HQ/VZ/mVZ), Name |
| Klick auf Route | Detailpanel: Fahrzeugtyp, Stops, km, Stunden, CHF |
| Toggle "Einfach / Straßen" | Wechsel zwischen minimaler Karte und OpenStreetMap |
| Layer-Checkboxen | Ein-/Ausblenden einzelner Ebenen |

---

## API-Referenz

Basis-URL: `http://localhost:8000`

### Pipeline

| Endpoint | Methode | Beschreibung |
|----------|---------|-------------|
| `/api/pipeline/status` | GET | Status aller 4 Steps |
| `/api/pipeline/run/{step}` | POST | Step 1–4 starten |
| `/api/pipeline/reset` | POST | Pipeline zurücksetzen |

### Ergebnisse (GeoJSON)

| Endpoint | Beschreibung | Verfügbar ab |
|----------|-------------|-------------|
| `/api/results/pharmacies` | Alle Apotheken als Punkte | Immer |
| `/api/results/hubs` | Alle Hubs als Punkte | Nach Step 1 |
| `/api/results/assignments` | Hub-Routen als Linien | Nach Step 2 |
| `/api/results/routes` | Fahrzeugrouten als Linien | Nach Step 4 |
| `/api/results/summary` | Zusammenfassung (JSON) | Nach Step 4 |

---

## Datenbankschema

```
pharmacies      id, name, city, lat, lon, demand, hub_name
hubs            id, name, hub_type (HQ/VZ/mVZ), lat, lon
assignments     id, pharmacy_id, hub_name, distance_km, travel_time_h, route_geometry
vehicle_routes  id, hub_name, vehicle_id, vehicle_type, stops, stop_coords,
                total_km, total_hours, total_items, total_cost_chf, restock_count
pipeline_runs   id, step (1–4), status, started_at, finished_at, error_message
population_cells id, lat, lon, population
```

---

## Deployment auf dem Server

```bash
# Auf dem Server: Projekt nach /opt/pharma-logistics/ kopieren
scp -rp . user@SERVER_IP:/opt/pharma-logistics/

# Starten mit Prod-Overrides (Ports an 10.0.0.1 gebunden, restart: always)
cd /opt/pharma-logistics
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

**Server-Checkliste:**
- [ ] Port freigeben: `sudo ufw allow in on wg0 to any port 80`
- [ ] `restart: always` ist in docker-compose.prod.yml gesetzt
- [ ] Volumes für `postgres_data` persistent angelegt
- [ ] Projekt in `/opt/pharma-logistics/` abgelegt
- [ ] In Portainer sichtbar + Uptime Kuma Monitor hinzufügen

**Web-App erreichbar:** `http://SERVER_IP` (HTTP, später HTTPS via Let's Encrypt + Nginx)

---

## Datenquellen

| Datei | Quelle |
|-------|--------|
| `apotheken.geojson` | OpenStreetMap / Overpass Turbo — 400 Schweizer Apotheken |
| `population.geojson` | Eurostat Census Grid 2021 — 1 km²-Bevölkerungsraster |
| `switzerland-260525-roads.osm.pbf` | Geofabrik.de — Schweizer Straßennetz (OSM) |

---

## Live-Verkehr (Roadmap)

Live-Verkehrsdaten sind als spätere Erweiterung geplant. Die Architektur ist darauf vorbereitet:
- OSRM unterstützt Traffic-Overlay via `--traffic-speeds`
- Die UI hat bereits einen reservierten Live-Verkehr-Toggle (aktuell deaktiviert)
- Celery-Worker kann für periodisches Routing-Update erweitert werden

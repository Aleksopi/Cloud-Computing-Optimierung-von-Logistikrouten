"""Generate clean, professional diagrams for the documentation/presentation.
All content reflects the actual project (no invented features)."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
from matplotlib.lines import Line2D

# Muted professional palette
NAVY   = "#1f3a5f"
BLUE   = "#2e6da4"
TEAL   = "#2a9d8f"
AMBER  = "#e09f3e"
SLATE  = "#52677d"
LIGHT  = "#eef2f6"
GREEN  = "#3a7d44"
INK    = "#1c2733"
GREY   = "#9aa7b4"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 11,
})

ASSETS = "assets"


def _box(ax, x, y, w, h, text, fc, tc="white", fs=11, bold=True, ec=None, lw=1.2):
    box = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.012,rounding_size=0.05",
                         linewidth=lw, edgecolor=ec or fc, facecolor=fc, zorder=2)
    ax.add_patch(box)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
            color=tc, fontsize=fs, fontweight="bold" if bold else "normal", zorder=3,
            wrap=True)


def _arrow(ax, x1, y1, x2, y2, color=SLATE, style="-|>", lw=1.6, ls="-"):
    ax.add_patch(FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style,
                 mutation_scale=14, color=color, lw=lw, linestyle=ls, zorder=1))


# ── 1. Systemarchitektur ────────────────────────────────────────────────────────
def architecture():
    fig, ax = plt.subplots(figsize=(10, 6.2))
    ax.set_xlim(0, 10); ax.set_ylim(0, 6.2); ax.axis("off")

    _box(ax, 3.6, 5.5, 2.8, 0.55, "Browser  (Web-App)", SLATE, fs=11)
    _box(ax, 3.1, 4.55, 3.8, 0.6, "Nginx  ·  Reverse Proxy\n/api → Backend   / → Frontend", NAVY, fs=9.5)

    # App layer
    _box(ax, 0.5, 3.35, 3.1, 0.75, "React + Vite + MapLibre GL\n(Interaktive Karte & Dashboard)", BLUE, fs=9.5)
    _box(ax, 6.4, 3.35, 3.1, 0.75, "FastAPI Backend\n(REST-API · Orchestrierung)", BLUE, fs=9.5)
    _arrow(ax, 3.6, 3.72, 6.4, 3.72, color=SLATE)
    ax.text(5.0, 3.92, "REST / GeoJSON", ha="center", fontsize=8.5, color=INK)

    # Worker + broker
    _box(ax, 6.4, 2.2, 3.1, 0.7, "Celery Worker\n(asynchrone Pipeline Step 1–4)", TEAL, fs=9.5)
    _box(ax, 3.55, 2.2, 2.3, 0.7, "Redis\n(Message Broker)", SLATE, fs=9.5)
    _arrow(ax, 7.95, 3.35, 7.95, 2.9, color=SLATE)
    _arrow(ax, 6.4, 2.55, 5.85, 2.55, color=SLATE, style="<|-|>")

    # Data layer
    _box(ax, 0.5, 0.9, 3.0, 0.8, "PostgreSQL + PostGIS\n(Apotheken, Hubs, Routen,\nKonfiguration)", NAVY, fs=9)
    _box(ax, 3.7, 0.9, 2.7, 0.8, "OSRM Routing-Engine\n(CH-Straßennetz:\nDistanz + Fahrzeit)", GREEN, fs=9)
    _box(ax, 6.6, 0.9, 2.9, 0.8, "GeoJSON-Daten\n(OSM-Apotheken,\nEurostat-Bevölkerung)", AMBER, fs=9, tc=INK)

    _arrow(ax, 6.9, 3.35, 2.6, 1.7, color=GREY, ls=(0, (4, 3)))   # backend->db
    _arrow(ax, 7.6, 2.2, 5.4, 1.7, color=GREY, ls=(0, (4, 3)))    # worker->osrm
    _arrow(ax, 8.2, 2.2, 8.0, 1.7, color=GREY, ls=(0, (4, 3)))    # worker->geojson
    _arrow(ax, 7.2, 2.2, 3.4, 1.7, color=GREY, ls=(0, (4, 3)))    # worker->db
    _arrow(ax, 4.7, 5.5, 4.7, 5.15, color=SLATE)
    _arrow(ax, 2.05, 4.55, 2.05, 4.1, color=SLATE)
    _arrow(ax, 8.0, 4.55, 8.0, 4.1, color=SLATE)

    ax.text(0.1, 6.05, "6 Docker-Container · Docker-Compose-Orchestrierung",
            fontsize=9.5, style="italic", color=SLATE)
    fig.tight_layout()
    fig.savefig(f"{ASSETS}/architecture.png", dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


# ── 2. Pipeline (4 Schritte) ─────────────────────────────────────────────────────
def pipeline():
    fig, ax = plt.subplots(figsize=(10, 3.5))
    ax.set_xlim(0, 10); ax.set_ylim(0, 3.5); ax.axis("off")
    steps = [
        ("Step 1\nWarenbedarf", "Geometrisches\nCatchment-Modell\n(Eurostat-Bevölkerung)", BLUE),
        ("Step 2\nHub Placement", "Nachfragegewichteter\nGreedy p-Median\n(HQ · VZ · mVZ)", TEAL),
        ("Step 3\nEinzugsgebiete", "Kapazitätsbewusste\nZuweisung\n(OSRM-Fahrzeit)", AMBER),
        ("Step 4\nRoutenoptimierung", "Multi-Objektiv-VRP\n(verallgem. Kosten:\nCHF · h · CO₂)", GREEN),
    ]
    w, h, y = 2.1, 1.6, 1.1
    xs = [0.25, 2.7, 5.15, 7.6]
    for (title, sub, col), x in zip(steps, xs):
        _box(ax, x, y, w, h, "", col)
        ax.text(x + w / 2, y + h - 0.32, title, ha="center", va="center",
                color="white", fontsize=11, fontweight="bold", zorder=3)
        ax.text(x + w / 2, y + 0.55, sub, ha="center", va="center",
                color="white", fontsize=8.3, zorder=3)
        if x != xs[-1]:
            _arrow(ax, x + w, y + h / 2, x + w + 0.35, y + h / 2, color=SLATE, lw=2)
    ax.text(5.0, 0.45, "Sequenzielle Abhängigkeit · asynchron im Celery-Worker · Ergebnisse in PostgreSQL",
            ha="center", fontsize=9, style="italic", color=SLATE)
    fig.tight_layout()
    fig.savefig(f"{ASSETS}/pipeline.png", dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


# ── 3. Optimierungsmodell (Generalized Cost) ─────────────────────────────────────
def optimization():
    fig, ax = plt.subplots(figsize=(10, 4.6))
    ax.set_xlim(0, 10); ax.set_ylim(0, 4.6); ax.axis("off")

    ax.text(5.0, 4.3, "Verallgemeinerte Grenzkosten je Kandidaten-Stop (Insertion)",
            ha="center", fontsize=12, fontweight="bold", color=INK)
    ax.text(5.0, 3.92, r"$\Delta x = x(\mathrm{hier}\to\mathrm{Stop}) + x(\mathrm{Stop}\to\mathrm{Depot}) - x(\mathrm{hier}\to\mathrm{Depot})$",
            ha="center", fontsize=11, color=SLATE)

    _box(ax, 0.5, 2.2, 2.8, 1.2, "", BLUE)
    ax.text(1.9, 3.15, "KOSTEN", ha="center", color="white", fontsize=11, fontweight="bold")
    ax.text(1.9, 2.62, "Δkm · CHF/km\n+ Δh · Fahrerlohn\n(echte CHF)", ha="center", color="white", fontsize=8.6)

    _box(ax, 3.6, 2.2, 2.8, 1.2, "", AMBER, tc=INK)
    ax.text(5.0, 3.15, "ZEIT", ha="center", color=INK, fontsize=11, fontweight="bold")
    ax.text(5.0, 2.62, "Δh  (OSRM-Straßenzeit,\nverkehrsbereinigt)\nZeit ≠ Distanz", ha="center", color=INK, fontsize=8.6)

    _box(ax, 6.7, 2.2, 2.8, 1.2, "", GREEN)
    ax.text(8.1, 3.15, "UMWELT", ha="center", color="white", fontsize=11, fontweight="bold")
    ax.text(8.1, 2.62, "Δkm · g CO₂/km\n(echte kg CO₂)", ha="center", color="white", fontsize=8.6)

    for x, wlab in [(1.9, "w = 0,40"), (5.0, "w = 0,35"), (8.1, "w = 0,25")]:
        _arrow(ax, x, 2.2, x, 1.75, color=SLATE)
        ax.text(x + 0.55, 1.97, wlab, ha="left", fontsize=8.5, color=SLATE)

    _box(ax, 2.4, 0.9, 5.2, 0.75,
         "Score = Σ  wᵢ · norm(Objektivᵢ)   →   kleinster Score gewinnt", NAVY, fs=10.5)
    ax.text(5.0, 0.5, "Min-Max-Normierung je Kandidatenmenge · zusätzlich gewichtete Fahrzeugauswahl",
            ha="center", fontsize=8.8, style="italic", color=SLATE)
    fig.tight_layout()
    fig.savefig(f"{ASSETS}/optimization.png", dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


# ── 4. Lieferketten-Hierarchie ───────────────────────────────────────────────────
def supplychain():
    fig, ax = plt.subplots(figsize=(10, 4.0))
    ax.set_xlim(0, 10); ax.set_ylim(0, 4.0); ax.axis("off")
    _box(ax, 4.0, 3.1, 2.0, 0.7, "HQ (Bern)", NAVY, fs=11)
    vz = [(1.2, "VZ 1"), (4.0, "VZ 2"), (6.8, "VZ …")]
    for x, lab in vz:
        _box(ax, x, 1.9, 2.0, 0.6, lab, BLUE, fs=10)
        _arrow(ax, 5.0, 3.1, x + 1.0, 2.5, color=SLATE, lw=1.6)
    mvz = [(0.5, "mVZ"), (2.0, "mVZ"), (4.0, "mVZ"), (6.8, "mVZ")]
    for x, lab in mvz:
        _box(ax, x, 0.75, 1.3, 0.5, lab, TEAL, fs=9)
    _arrow(ax, 1.7, 1.9, 1.1, 1.25, color=GREY, lw=1.3)
    _arrow(ax, 2.2, 1.9, 2.6, 1.25, color=GREY, lw=1.3)
    _arrow(ax, 5.0, 1.9, 4.6, 1.25, color=GREY, lw=1.3)
    _arrow(ax, 7.8, 1.9, 7.4, 1.25, color=GREY, lw=1.3)
    for x in [1.15, 2.65, 4.65, 7.45]:
        _arrow(ax, x, 0.75, x, 0.4, color=GREY, lw=1.2)
    ax.text(8.9, 0.5, "Apotheken\n(Last Mile)", ha="center", fontsize=9, color=SLATE)
    _box(ax, 8.2, 2.9, 1.6, 0.5, "Direkt-\nlieferung", AMBER, fs=8.5, tc=INK)
    _arrow(ax, 5.0, 3.1, 8.6, 3.4, color=AMBER, lw=1.4, ls=(0, (3, 2)))
    ax.text(0.1, 3.8, "Hauptlauf (Backbone): HQ→VZ→mVZ  ·  Last Mile: Hub→Apotheke",
            fontsize=9, style="italic", color=SLATE)
    fig.tight_layout()
    fig.savefig(f"{ASSETS}/supplychain.png", dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    architecture(); pipeline(); optimization(); supplychain()
    print("diagrams written to", ASSETS)

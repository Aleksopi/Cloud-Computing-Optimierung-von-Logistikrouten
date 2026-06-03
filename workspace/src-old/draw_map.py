"""
draw_map.py
-----------
Vollständige Folium-Visualisierungslogik für das Apotheken-Logistikprojekt.
Unterstützt die dreistufige Pipeline (Schritt 2 Bulk-Vorbereitung & Schritt 3 VRP Feinverteilung).

Public API
----------
build_map(
    hq_lat, hq_lon, hq_name,
    vz_locations, mini_vz_locations,
    step2_links, step3_routes, global_locations,
    engine,
) -> folium.Map
"""

from __future__ import annotations
import folium

# ── Farbpaletten ──────────────────────────────────────────────────────────
LKW_COLORS = [
    '#FF8C00', '#FFA500', '#E65C00', '#FF6B00',
    '#FF7F50', '#FF9933', '#CC5500', '#FFAA00',
]

EVAN_COLORS = [
    '#2E8B57', '#3CB371', '#00A86B', '#66BB6A',
    '#43A047', '#00897B', '#4CAF50', '#1B7F4A',
]

TRAIN_COLOR       = '#1565C0'  # Markantes Blau für Schienennetz
BULK_LKW_COLOR    = '#D43F00'  # Dunkleres Rot-Orange für VZ -> Mini-VZ Bulk-Zubringer
HQ_COLOR          = '#7B2FBE'
VZ_COLOR          = '#D32F2F'
MINI_VZ_COLOR     = '#2E7D32'


# ── SVG Marker Helpers ───────────────────────────────────────────────────────

def _hq_svg(color: str = HQ_COLOR) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">'
        f'<path d="M18 0 C8.059 0 0 8.059 0 18 C0 30.5 18 48 18 48 C18 48 36 30.5 36 18 C36 8.059 27.941 0 18 0Z"'
        f' fill="{color}" stroke="#4A0080" stroke-width="2"/>'
        '<circle cx="18" cy="18" r="11" fill="white" opacity="0.92"/>'
        f'<text x="18" y="23" font-family="Arial,sans-serif" font-size="11" font-weight="bold"'
        f' text-anchor="middle" fill="{color}">HQ</text>'
        '</svg>'
    )


def _vz_svg(color: str = VZ_COLOR) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">'
        f'<path d="M15 0 C6.716 0 0 6.716 0 15 C0 26.25 15 40 15 40 C15 40 30 26.25 30 15 C30 6.716 23.284 0 15 0Z"'
        f' fill="{color}" stroke="#8B0000" stroke-width="1.5"/>'
        '<circle cx="15" cy="15" r="9.5" fill="white" opacity="0.92"/>'
        f'<text x="15" y="19.5" font-family="Arial,sans-serif" font-size="9.5" font-weight="bold"'
        f' text-anchor="middle" fill="{color}">VZ</text>'
        '</svg>'
    )


def _mini_vz_svg(color: str = MINI_VZ_COLOR) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">'
        f'<path d="M13 0 C5.82 0 0 5.82 0 13 C0 22.75 13 34 13 34 C13 34 26 22.75 26 13 C26 5.82 20.18 0 13 0Z"'
        f' fill="{color}" stroke="#1B5E20" stroke-width="1.5"/>'
        '<circle cx="13" cy="13" r="8" fill="white" opacity="0.92"/>'
        f'<text x="13" y="16.5" font-family="Arial,sans-serif" font-size="7" font-weight="bold"'
        f' text-anchor="middle" fill="{color}">mVZ</text>'
        '</svg>'
    )


def _div_icon(svg: str, size: tuple, anchor: tuple | None = None) -> folium.DivIcon:
    if anchor is None:
        anchor = (size[0] // 2, size[1])
    return folium.DivIcon(html=svg, icon_size=size, icon_anchor=anchor)


# ── Straßennetz-Geometrie Helper ─────────────────────────────────────────────

def _road_coords(route_nodes: list, global_locations: dict, engine) -> list:
    """Berechnet die reale Straßengeometrie (OSM) für eine Sequenz von Stopps."""
    coords = []
    for i in range(len(route_nodes) - 1):
        loc1 = global_locations.get(route_nodes[i])
        loc2 = global_locations.get(route_nodes[i + 1])
        if not loc1 or not loc2:
            continue
        segment = engine.get_route_geometry(loc1, loc2)
        if coords:
            coords.extend(segment[1:])
        else:
            coords.extend(segment)
    return coords


# ── Main Builder ─────────────────────────────────────────────────────────────

def build_map(
    hq_lat: float,
    hq_lon: float,
    hq_name: str,
    vz_locations: dict,
    mini_vz_locations: dict,
    step2_links: dict,        # 'network_links' aus Schritt 2 Optimizer
    step3_routes: dict,       # 'routes' aus Schritt 3 Optimizer
    global_locations: dict,
    engine,
) -> folium.Map:
    """
    Erstellt eine interaktive Folium-Karte mit dedizierten Logistik-Ebenen.
    """
    m = folium.Map(location=[hq_lat, hq_lon], zoom_start=8, tiles='OpenStreetMap')

    # ── Feature Groups (Ebenensteuerung) ──────────────────────────────────────
    fg_hq        = folium.FeatureGroup(name='<b style="color:#7B2FBE">&#9632;</b> HQ (Zentrallager)', show=True)
    fg_vz        = folium.FeatureGroup(name='<b style="color:#D32F2F">&#9632;</b> VZ (Verteilzentrum)', show=True)
    fg_mini_vz   = folium.FeatureGroup(name='<b style="color:#2E7D32">&#9632;</b> Mini-VZ Hubs', show=True)
    fg_train     = folium.FeatureGroup(name='<b style="color:#1565C0">- -</b> Schritt 2: Zug (Bulk Rail)', show=True)
    fg_bulk_lkw  = folium.FeatureGroup(name='<b style="color:#D43F00">&#9654;</b> Schritt 2: VZ \u2192 Mini-VZ (Zubringer)', show=True)
    fg_lkw       = folium.FeatureGroup(name='<b style="color:#FF8C00">&#9632;</b> Schritt 3: Last-Mile LKW', show=True)
    fg_evan      = folium.FeatureGroup(name='<b style="color:#2E8B57">&#9632;</b> Schritt 3: Last-Mile Evan', show=True)
    fg_stops     = folium.FeatureGroup(name='Apotheken-Stopps', show=True)

    # ── 1. Marker zeichnen ────────────────────────────────────────────────────
    folium.Marker(
        [hq_lat, hq_lon],
        popup=folium.Popup('<b>&#127970; Depot HQ</b><br>Zentrallager', max_width=200),
        tooltip='Depot HQ',
        icon=_div_icon(_hq_svg(), size=(36, 48)),
    ).add_to(fg_hq)

    for name, (lat, lon) in vz_locations.items():
        folium.Marker(
            [lat, lon],
            popup=folium.Popup(f'<b>&#127981; {name}</b><br>Verteilzentrum', max_width=200),
            tooltip=name,
            icon=_div_icon(_vz_svg(), size=(30, 40)),
        ).add_to(fg_vz)

    for name, (lat, lon) in mini_vz_locations.items():
        folium.Marker(
            [lat, lon],
            popup=folium.Popup(f'<b>&#128230; {name}</b><br>Mini-Verteilzentrum', max_width=200),
            tooltip=name,
            icon=_div_icon(_mini_vz_svg(), size=(26, 34)),
        ).add_to(fg_mini_vz)

    # ── 2. SCHRITT 2 Linien zeichnen (Supply Chain Preprocessing) ─────────────
    for dest_hub, link_data in step2_links.items():
        transport_type = link_data['transport_type']
        route_nodes = link_data['route']
        dist_km = link_data['distance_km']
        load = link_data['load_delivered']

        if transport_type == 'TRAIN':
            # Zuglinien werden als direkte gestrichelte Segmente gezeichnet (keine Straßengeometrie)
            points = [global_locations[node] for node in route_nodes if node in global_locations]
            if len(points) >= 2:
                path_str = " \u2192 ".join(route_nodes)
                folium.PolyLine(
                    points,
                    color=TRAIN_COLOR,
                    weight=4.5,
                    opacity=0.90,
                    dash_array='12 8',
                    tooltip=f'&#128642; Bulk-Zug-Route: {path_str} ({dist_km} km) | Load: {load} units',
                ).add_to(fg_train)

        elif transport_type == 'LKW':
            # VZ -> Mini-VZ Zubringer nutzen die reale Straßengeometrie
            road_geom = _road_coords(route_nodes, global_locations, engine)
            if road_geom:
                folium.PolyLine(
                    road_geom,
                    color=BULK_LKW_COLOR,
                    weight=4.0,
                    opacity=0.85,
                    tooltip=f'&#128667; Preprocessing Zubringer-LKW: {route_nodes[0]} \u2192 {route_nodes[1]} ({dist_km} km) | Load: {load} units',
                ).add_to(fg_bulk_lkw)

    # ── 3. SCHRITT 3 Linien zeichnen (Last-Mile Routing) ──────────────────────
    lkw_idx = 0
    evan_idx = 0

    for route_id, r in step3_routes.items():
        v_type = r['vehicle_type']
        route_nodes = r.get('path', r.get('route', []))  # Fallback für Key-Kompatibilität
        dist_km = r['distance_km']
        load = r['load']

        road_geom = _road_coords(route_nodes, global_locations, engine)
        if not road_geom:
            continue

        # Farbbestimmung & Zuordnung je nach Fahrzeug-Enforcement aus dem Optimizer
        if v_type == 'LKW':
            route_color = LKW_COLORS[lkw_idx % len(LKW_COLORS)]
            lkw_idx += 1
            target_group = fg_lkw
            tooltip_msg = f'&#128667; Last-Mile LKW: {route_id} ({dist_km:.1f} km) | Last: {load}/60'
            weight_line = 3.5
        else:
            route_color = EVAN_COLORS[evan_idx % len(EVAN_COLORS)]
            evan_idx += 1
            target_group = fg_evan
            tooltip_msg = f'&#128653; Last-Mile Evan: {route_id} ({dist_km:.1f} km) | Last: {load}/20'
            weight_line = 2.5

        # Route auf Karte eintragen
        folium.PolyLine(
            road_geom,
            color=route_color,
            weight=weight_line,
            opacity=0.80,
            tooltip=tooltip_msg,
        ).add_to(target_group)

        # Apotheken-Stopps auf dieser Route mit passender Tourenfarbe markieren
        for loc in route_nodes:
            # Hubs und HQs filtern, sodass nur Apotheken Punkte erhalten
            if loc == hq_name or loc.startswith("VZ_") or loc.startswith("mVZ_"):
                continue
            pos = global_locations.get(loc)
            if not pos:
                continue
            folium.CircleMarker(
                list(pos),
                radius=3.5,
                color=route_color,
                fill=True,
                fill_color=route_color,
                fill_opacity=0.85,
                tooltip=f"Stopp: {loc} (Route: {route_id})",
            ).add_to(fg_stops)

    # ── 4. Zusammenbau & Layer-Control ───────────────────────────────────────
    # Sortierung bestimmt die visuelle Überlagerungs-Reihenfolge (Züge ganz unten, Hubs ganz oben)
    for fg in [fg_train, fg_bulk_lkw, fg_lkw, fg_evan, fg_stops, fg_mini_vz, fg_vz, fg_hq]:
        fg.add_to(m)

    folium.LayerControl(collapsed=False).add_to(m)

    return m
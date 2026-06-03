"""
draw.py – Interactive Map Visualization Engine
==============================================

Zwei Klassen mit sauberer Trennung:

  draw_interface  – reine Zeichen-API (add_hub, add_point, add_line, add_route).
                    Kennt kein State, kein Save/Load. Schreibt direkt auf das
                    folium.Map-Objekt, das ihr übergeben wird.

  map_object      – State-Logik. Verwaltet die Instruction-Liste, baut bei
                    Bedarf das folium-Objekt neu auf und stellt save/load/render
                    bereit. Exponiert draw_interface über das Attribut
                    `drawInterface`.

Verwendung:
-----------
    from draw import map_object

    # Neue Karte
    m = map_object.new(center_lat=46.9, center_lon=7.4)

    # Zeichnen immer über drawInterface
    m.drawInterface.add_hub(lat=46.95, lon=7.45, layer="Hubs", hub_type="HQ")
    m.drawInterface.add_point(lat=47.1, lon=7.6, layer="Apotheken")

    # Anzeigen
    m.render()

    # Speichern / Laden
    state = m.save("schritt1.json")
    m2    = map_object.load("schritt1.json")
    m2.render()
"""

from __future__ import annotations

import json
from pathlib import Path

import folium


# ---------------------------------------------------------------------------
# draw_interface  –  reine Zeichen-API, kein State
# ---------------------------------------------------------------------------

class draw_interface:
    """Zeichen-API. Schreibt auf ein fremdes folium.Map-Objekt.

    Wird von map_object instanziiert und als `drawInterface` exponiert.
    Kann aber auch standalone genutzt werden, wenn man das folium-Objekt
    selbst verwaltet.
    """

    LKW_COLORS  = ['#FF8C00', '#FFA500', '#E65C00', '#FF6B00',
                   '#FF7F50', '#FF9933', '#CC5500', '#FFAA00']
    EVAN_COLORS = ['#2E8B57', '#3CB371', '#00A86B', '#66BB6A',
                   '#43A047', '#00897B', '#4CAF50', '#1B7F4A']
    THEME = {
        'TRAIN':    '#1565C0',
        'BULK_LKW': '#D43F00',
        'HQ':       '#7B2FBE',
        'VZ':       '#D32F2F',
        'MINI_VZ':  '#2E7D32',
    }

    def __init__(self, folium_map: folium.Map, layers: dict,
                 record_fn, lkw_idx_ref: list, evan_idx_ref: list):
        """
        Args:
            folium_map:    Das folium.Map-Objekt, auf das gezeichnet wird.
            layers:        Geteiltes dict {name -> FeatureGroup} von map_object.
            record_fn:     Callback map_object._record(cmd, kwargs) zum Aufzeichnen.
            lkw_idx_ref:   Einelementige Liste [int] als mutierbarer Zähler-Ref.
            evan_idx_ref:  Einelementige Liste [int] als mutierbarer Zähler-Ref.
        """
        self._m            = folium_map
        self._layers       = layers
        self._record       = record_fn
        self._lkw_idx      = lkw_idx_ref
        self._evan_idx     = evan_idx_ref

    # ------------------------------------------------------------------
    # Interne Helfer
    # ------------------------------------------------------------------

    def _get_or_create_layer(self, name: str) -> folium.FeatureGroup:
        if name not in self._layers:
            self._layers[name] = folium.FeatureGroup(name=name, show=True).add_to(self._m)
        return self._layers[name]

    @staticmethod
    def _build_svg_icon(hub_type: str) -> folium.DivIcon | None:
        h = hub_type.upper()
        T = draw_interface.THEME
        if h == 'HQ':
            svg = (
                f'<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">'
                f'<path d="M18 0 C8.059 0 0 8.059 0 18 C0 30.5 18 48 18 48 C18 48 36 30.5 36 18 '
                f'C36 8.059 27.941 0 18 0Z" fill="{T["HQ"]}" stroke="#4A0080" stroke-width="2"/>'
                f'<circle cx="18" cy="18" r="11" fill="white" opacity="0.92"/>'
                f'<text x="18" y="23" font-family="Arial,sans-serif" font-size="11" font-weight="bold" '
                f'text-anchor="middle" fill="{T["HQ"]}">HQ</text></svg>'
            )
            return folium.DivIcon(html=svg, icon_size=(36, 48), icon_anchor=(18, 48))
        elif h == 'VZ':
            svg = (
                f'<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">'
                f'<path d="M15 0 C6.716 0 0 6.716 0 15 C0 26.25 15 40 15 40 C15 40 30 26.25 30 15 '
                f'C30 6.716 23.284 0 15 0Z" fill="{T["VZ"]}" stroke="#8B0000" stroke-width="1.5"/>'
                f'<circle cx="15" cy="15" r="9.5" fill="white" opacity="0.92"/>'
                f'<text x="15" y="19.5" font-family="Arial,sans-serif" font-size="9.5" font-weight="bold" '
                f'text-anchor="middle" fill="{T["VZ"]}">VZ</text></svg>'
            )
            return folium.DivIcon(html=svg, icon_size=(30, 40), icon_anchor=(15, 40))
        elif h in ('MINI_VZ', 'MVZ'):
            svg = (
                f'<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">'
                f'<path d="M13 0 C5.82 0 0 5.82 0 13 C0 22.75 13 34 13 34 C13 34 26 22.75 26 13 '
                f'C26 5.82 20.18 0 13 0Z" fill="{T["MINI_VZ"]}" stroke="#1B5E20" stroke-width="1.5"/>'
                f'<circle cx="13" cy="13" r="8" fill="white" opacity="0.92"/>'
                f'<text x="13" y="16.5" font-family="Arial,sans-serif" font-size="7" font-weight="bold" '
                f'text-anchor="middle" fill="{T["MINI_VZ"]}">mVZ</text></svg>'
            )
            return folium.DivIcon(html=svg, icon_size=(26, 34), icon_anchor=(13, 34))
        return None

    # ------------------------------------------------------------------
    # Öffentliche Zeichen-Methoden
    # ------------------------------------------------------------------

    def add_hub(self, lat: float, lon: float, layer: str, hub_type: str,
                name: str = "", tooltip: str = "", popup: str = "") -> draw_interface:
        self._record('add_hub', dict(lat=lat, lon=lon, layer=layer, hub_type=hub_type,
                                     name=name, tooltip=tooltip, popup=popup))
        fg = self._get_or_create_layer(layer)
        folium.Marker(
            [lat, lon],
            popup=folium.Popup(popup, max_width=200) if popup else None,
            tooltip=tooltip or name,
            icon=self._build_svg_icon(hub_type),
        ).add_to(fg)
        return self

    def add_point(self, lat: float, lon: float, layer: str,
                  color: str = '#FF8C00', tooltip: str = "") -> draw_interface:
        self._record('add_point', dict(lat=lat, lon=lon, layer=layer,
                                       color=color, tooltip=tooltip))
        fg = self._get_or_create_layer(layer)
        folium.CircleMarker(
            [lat, lon], radius=3.5, color=color,
            fill=True, fill_color=color, fill_opacity=0.85, tooltip=tooltip,
        ).add_to(fg)
        return self

    def add_line(self, start: tuple, end: tuple, color: str = "blue",
                 weight: int = 2, opacity: float = 0.5) -> draw_interface:
        self._record('add_line', dict(start=list(start), end=list(end),
                                      color=color, weight=weight, opacity=opacity))
        folium.PolyLine(
            locations=[start, end], color=color, weight=weight, opacity=opacity,
        ).add_to(self._m)
        return self

    def _fetch_road_coords(self, nodes: list, global_locations: dict,
                           engine) -> list:
        """Stitch OSRM road geometry for a sequence of nodes.

        Calls engine.geometry() for each consecutive pair and splices the
        results together, dropping the shared duplicate endpoint between
        segments.  Returns a flat list of [lat, lon] pairs.
        """
        coords: list = []
        for i in range(len(nodes) - 1):
            loc1 = global_locations.get(nodes[i])
            loc2 = global_locations.get(nodes[i + 1])
            if loc1 and loc2:
                seg = engine.geometry(loc1, loc2)          # [(lat, lon), …]
                coords.extend(seg if not coords else seg[1:])
        return coords

    def add_route_coords(self, coords: list, color: str, weight: float,
                         opacity: float, layer: str, tooltip: str = "",
                         dash_array: str | None = None) -> draw_interface:
        """Draw a pre-computed coordinate list as a PolyLine.

        Fully serializable — recorded in history and replayed by
        map_object.load() without needing an engine reference.
        Call this directly when geometry has already been fetched
        (e.g. from a parallel pre-fetch loop in a2_influence).
        """
        self._record('add_route_coords', dict(
            coords=coords, color=color, weight=weight, opacity=opacity,
            layer=layer, tooltip=tooltip, dash_array=dash_array,
        ))
        fg = self._get_or_create_layer(layer)
        kw: dict = dict(color=color, weight=weight, opacity=opacity,
                        tooltip=tooltip)
        if dash_array:
            kw['dash_array'] = dash_array
        folium.PolyLine(coords, **kw).add_to(fg)
        return self

    def add_route(self, nodes: list, global_locations: dict, engine,
                  layer: str, transport_type: str = 'LKW',
                  tooltip: str = "") -> draw_interface:
        """Fetch OSRM road geometry for a node sequence and draw it.

        Determines colour/weight from transport_type, then delegates to
        add_route_coords — so the resolved geometry is recorded and the
        route survives save/load without an engine reference.
        """
        t_type = transport_type.upper()

        if t_type == 'TRAIN':
            points = [global_locations[n] for n in nodes
                      if n in global_locations]
            if len(points) >= 2:
                self.add_route_coords(
                    coords=points, color=self.THEME['TRAIN'],
                    weight=4.5, opacity=0.9, layer=layer,
                    tooltip=tooltip, dash_array='12 8',
                )
            return self

        coords = self._fetch_road_coords(nodes, global_locations, engine)
        if not coords:
            return self

        if t_type == 'BULK_LKW':
            color, weight = self.THEME['BULK_LKW'], 4.0
        elif t_type == 'LKW':
            color  = self.LKW_COLORS[self._lkw_idx[0] % len(self.LKW_COLORS)]
            weight = 3.5
            self._lkw_idx[0] += 1
        else:   # EVAN
            color  = self.EVAN_COLORS[self._evan_idx[0] % len(self.EVAN_COLORS)]
            weight = 2.5
            self._evan_idx[0] += 1

        self.add_route_coords(
            coords=coords, color=color, weight=weight,
            opacity=0.8, layer=layer, tooltip=tooltip,
        )
        return self


# ---------------------------------------------------------------------------
# map_object  –  State-Logik, save / load / render
# ---------------------------------------------------------------------------

class map_object:
    """State-Container für eine Karte.

    Erstelle Instanzen ausschliesslich über:
        map_object.new(...)   – neue leere Karte
        map_object.load(...)  – aus gespeichertem JSON wiederherstellen

    Zeichnen immer über:
        m.drawInterface.add_hub(...)
        m.drawInterface.add_point(...)
        ...
    """

    def __init__(self):
        raise TypeError("Nutze map_object.new() oder map_object.load().")

    @classmethod
    def new(cls, center_lat: float, center_lon: float, zoom: int = 8) -> map_object:
        """Erstellt eine neue, leere Karte."""
        inst = cls.__new__(cls)
        inst._center_lat = center_lat
        inst._center_lon = center_lon
        inst._zoom       = zoom
        inst._history: list[dict] = []
        inst._lkw_idx  = [0]   # mutierbarer Ref für draw_interface
        inst._evan_idx = [0]
        inst._layer_control_added = False
        inst._folium_map = folium.Map(
            location=[center_lat, center_lon],
            zoom_start=zoom,
            tiles='OpenStreetMap',
        )
        inst._layers: dict = {}
        inst.drawInterface = draw_interface(
            folium_map    = inst._folium_map,
            layers        = inst._layers,
            record_fn     = inst._record,
            lkw_idx_ref   = inst._lkw_idx,
            evan_idx_ref  = inst._evan_idx,
        )
        return inst

    # ------------------------------------------------------------------
    # Interner Record-Callback (wird von draw_interface aufgerufen)
    # ------------------------------------------------------------------

    def _record(self, cmd: str, kwargs: dict) -> None:
        self._history.append({'cmd': cmd, 'kwargs': kwargs})

    # ------------------------------------------------------------------
    # Render
    # ------------------------------------------------------------------

    def render(self) -> folium.Map:
        """Zeigt die Karte im Notebook. LayerControl wird nur einmal hinzugefügt."""
        if not self._layer_control_added:
            folium.LayerControl(collapsed=False).add_to(self._folium_map)
            self._layer_control_added = True
        return self._folium_map

    # ------------------------------------------------------------------
    # Save / Load
    # ------------------------------------------------------------------

    def save(self) -> dict:
        """Gibt den Kartenzustand als plain dict zurück."""
        return {
            'center_lat': self._center_lat,
            'center_lon': self._center_lon,
            'zoom':       self._zoom,
            'lkw_idx':    self._lkw_idx[0],
            'evan_idx':   self._evan_idx[0],
            'history':    [dict(r) for r in self._history],
        }

    @classmethod
    def load(cls, state: dict) -> map_object:
        """Stellt eine Karte aus einem zuvor gespeicherten dict wieder her."""
        inst = cls.new(
            center_lat = state['center_lat'],
            center_lon = state['center_lon'],
            zoom       = state['zoom'],
        )

        dispatch = {
            'add_hub':          inst.drawInterface.add_hub,
            'add_point':        inst.drawInterface.add_point,
            'add_line':         inst.drawInterface.add_line,
            'add_route_coords': inst.drawInterface.add_route_coords,
        }

        for record in state['history']:
            cmd    = record['cmd']
            kwargs = dict(record['kwargs'])
            if cmd not in dispatch:
                continue
            if cmd == 'add_line':
                kwargs['start'] = tuple(kwargs['start'])
                kwargs['end']   = tuple(kwargs['end'])
            dispatch[cmd](**kwargs)

        inst._lkw_idx[0]  = max(inst._lkw_idx[0],  state['lkw_idx'])
        inst._evan_idx[0] = max(inst._evan_idx[0], state['evan_idx'])

        return inst

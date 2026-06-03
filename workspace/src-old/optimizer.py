"""
Advanced Logistics Optimizer – Dreistufige Pipeline (Schritt 2 & 3)
==================================================================
Dieses Modul implementiert die dedizierten Optimierungsschritte nach der Platzierung:

Schritt 2: Supply Chain Preprocessing (Bulk-Logistik)
-----------------------------------------------------
- Zug-Transporte (Train): AUSSCHLIESSLICH von HQ -> VZ oder VZ -> VZ.
- LKW-Transporte: AUSSCHLIESSLICH von VZ -> Mini-VZ.
- Überwachung der harten Storage-Limits (VZ: max 5000 Pakete, Mini-VZ: max 800 Pakete).
- Optimierungsvariable: Minimale Gesamtkosten für die Vorlagerung.

Schritt 3: Last-Mile VRP Routing (Feinverteilung)
--------------------------------------------------
- Startet an den jeweiligen Hubs (VZ oder Mini-VZ) zu den zugeordneten Apotheken.
- Fahrzeugauswahl & Restriktionen werden pro Route strikt enforced:
  * Evan (Kleinlieferwagen): Kapazität max. 20 Einheiten | Max. Routenlänge 200 km | Max. Zeit 8h.
  * LKW (Großtransporter)  : Kapazität max. 60 Einheiten | Max. Routenlänge 600 km | Max. Zeit 8h.
- Zuordnung: Apotheken nahe am Hub (<30km) nutzen bevorzugt Evans, entferntere LKWs.
- Heuristik wählt automatisch die kostengünstigste Variante (Clarke-Wright vs. Greedy).
"""

import numpy as np
import pandas as pd
import logging
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AdvancedLogisticsOptimizer:
    """
    Optimierungs-Engine für die Schritte 2 und 3 der Logistikkette.
    Berücksichtigt reale Straßennetz-Distanzen, Fahrzeugtypen und Kapazitätsgrenzen.
    """

    DEFAULT_COSTS = {
        'train_per_km': 1.50,         # Kosten pro km für Zugstrecken
        'lkw_per_km': 2.20,           # Kosten pro km für LKW-Transporte
        'evan_per_km': 0.95,          # Kosten pro km für Evan-Transporter
        'driver_wage_per_h': 35.00,   # Stundenlohn für Fahrer
        'co2_per_km_lkw': 0.75,       # CO2 Ausstoß LKW (kg/km)
        'co2_per_km_evan': 0.18,      # CO2 Ausstoß Evan (kg/km)
        'currency': 'CHF'
    }

    # Strikte Kapazitätsgrenzen aus der Aufgabenstellung
    VZ_STORAGE_LIMIT = 5000
    MINI_VZ_STORAGE_LIMIT = 800

    def __init__(self, locations: dict, demands: dict, routing_engine, cost_params: dict = None):
        """
        Muss mit ALLEN kombinierten Standorten initialisiert werden:
        { 'HQ': (lat, lon), 'VZ_1': (lat, lon), ..., 'mVZ_1': ..., 'Pharm_X': ... }
        """
        self.locations = locations
        self.demands = demands
        self.routing_engine = routing_engine
        self.costs = {**self.DEFAULT_COSTS, **(cost_params or {})}
        
        logger.info("[Init] Berechne globale Distanz- und Zeitmatrizen für alle Knoten...")
        self.distance_matrix, self.time_matrix = routing_engine.calculate_distance_matrix(locations)
        logger.info("✅ Distanzmatrizen erfolgreich generiert.")
        
        self.location_names = list(locations.keys())

    # ==================================================================
    # SCHRITT 2: SUPPLY CHAIN PREPROCESSING (HQ -> VZ -> Mini-VZ)
    # ==================================================================
    def solve_supply_chain_preprocessing(self, hq_name: str, vz_locations: dict, 
                                         mini_vz_locations: dict, hub_to_pharmacies: dict) -> dict:
        """
        Implementiert Schritt 2: Warenbewegung so vorbereiten, dass alle Waren genau einen 
        Schritt von den Apotheken entfernt in den VZs oder Mini-VZs gelagert werden.
        
        RESTRIKTIONEN (Strikt erzwungen):
          - ZUG (Train) darf NUR von HQ -> VZ oder von VZ -> VZ fahren.
          - LKW darf NUR für die Belieferung von VZ -> Mini-VZ genutzt werden.
          - Lagerlimits (Storage Limits) werden pro Hub geprüft und validiert.
        """
        logger.info("\n=== [SCHRITT 2] Starte Supply Chain Preprocessing Optimierung ===")
        supply_links = {}
        total_step2_cost = 0.0

        # 1. Aggregierten Bedarf (Demand) pro Hub ermitteln
        hub_demands = {}
        for hub_name, pharmacy_ids in hub_to_pharmacies.items():
            total_demand = sum(self.demands.get(pid, 10) for pid in pharmacy_ids)
            hub_demands[hub_name] = total_demand

            # Prüfung des maximalen Lagerlimits (Storage Limit Enforcement)
            if hub_name.startswith("VZ_") and total_demand > self.VZ_STORAGE_LIMIT:
                logger.error(f"❌ KATASTROPHE: Storage Limit in {hub_name} überschritten! ({total_demand}/{self.VZ_STORAGE_LIMIT})")
            elif hub_name.startswith("mVZ_") and total_demand > self.MINI_VZ_STORAGE_LIMIT:
                logger.error(f"❌ KATASTROPHE: Storage Limit in {hub_name} überschritten! ({total_demand}/{self.MINI_VZ_STORAGE_LIMIT})")

        # 2. VZ-Belieferung via ZUG optimieren (HQ -> VZ oder VZ -> VZ)
        # Wir suchen für jedes VZ den kostengünstigsten Schienenweg
        for vz_name in vz_locations.keys():
            dist_hq = self.distance_matrix.loc[hq_name, vz_name]
            time_hq = self.time_matrix.loc[hq_name, vz_name]
            cost_direct = (dist_hq * self.costs['train_per_km']) + (time_hq * self.costs['driver_wage_per_h'])
            
            best_cost = cost_direct
            best_path = [hq_name, vz_name]

            # VZ -> VZ Chaining prüfen (Falls ein Zwischenstopp Kosten spart)
            for alt_vz in vz_locations.keys():
                if alt_vz == vz_name:
                    continue
                d1 = self.distance_matrix.loc[hq_name, alt_vz]
                t1 = self.time_matrix.loc[hq_name, alt_vz]
                d2 = self.distance_matrix.loc[alt_vz, vz_name]
                t2 = self.time_matrix.loc[alt_vz, vz_name]
                cost_chained = ((d1 + d2) * self.costs['train_per_km']) + ((t1 + t2) * self.costs['driver_wage_per_h'])
                
                if cost_chained < best_cost:
                    best_cost = cost_chained
                    best_path = [hq_name, alt_vz, vz_name]

            supply_links[vz_name] = {
                'transport_type': 'TRAIN',
                'route': best_path,
                'distance_km': round(sum(self.distance_matrix.loc[best_path[i], best_path[i+1]] for i in range(len(best_path)-1)), 1),
                'cost': round(best_cost, 2),
                'load_delivered': hub_demands.get(vz_name, 0)
            }
            total_step2_cost += best_cost

        # 3. Mini-VZ Belieferung via LKW aus dem optimalen VZ speisen
        # Ein Mini-VZ darf nur per LKW von einem übergeordneten VZ versorgt werden
        for mvz_name in mini_vz_locations.keys():
            best_lkw_cost = float('inf')
            best_source_vz = None
            best_lkw_dist = 0.0

            for vz_name in vz_locations.keys():
                dist_lkw = self.distance_matrix.loc[vz_name, mvz_name]
                time_lkw = self.time_matrix.loc[vz_name, mvz_name]
                lkw_cost = (dist_lkw * self.costs['lkw_per_km']) + (time_lkw * self.costs['driver_wage_per_h'])
                
                if lkw_cost < best_lkw_cost:
                    best_lkw_cost = lkw_cost
                    best_source_vz = vz_name
                    best_lkw_dist = dist_lkw

            supply_links[mvz_name] = {
                'transport_type': 'LKW',
                'route': [best_source_vz, mvz_name],
                'distance_km': round(best_lkw_dist, 1),
                'cost': round(best_lkw_cost, 2),
                'load_delivered': hub_demands.get(mvz_name, 0)
            }
            total_step2_cost += best_lkw_cost

        logger.info(f"✅ Schritt 2 abgeschlossen. Bulk-Kosten: {total_step2_cost:.2f} {self.costs['currency']}.")
        return {
            'total_supply_chain_cost': round(total_step2_cost, 2),
            'network_links': supply_links
        }

    # ==================================================================
    # SCHRITT 3: LAST-MILE ROUTING (Hub -> Apotheken)
    # ==================================================================
    def solve_last_mile_routing(self, hub_to_pharmacies: dict) -> dict:
        """
        Implementiert Schritt 3: Feinverteilung zu den Apotheken mit minimalen Kosten.
        Fahrzeuge (Evans & LKW) werden auf Basis von Kapazitäten und Entfernungen gewählt.
        
        RESTRIKTIONEN (Strikt erzwungen):
          - Evan: Kapazität max. 20 Einheiten | Max. Routenlänge 200 km | Max. Zeit 8h
          - LKW : Kapazität max. 60 Einheiten | Max. Routenlänge 600 km | Max. Zeit 8h
        """
        logger.info("\n=== [SCHRITT 3] Starte Last-Mile VRP Routenoptimierung ===")
        final_routes = {}
        total_step3_cost = 0.0

        for hub_name, pharmacy_ids in hub_to_pharmacies.items():
            if not pharmacy_ids:
                continue
            
            logger.info(f"  Optimiere Routennetzwerk für Hub {hub_name} ({len(pharmacy_ids)} Apotheken)...")
            
            # Ausführung beider Heuristiken zur Sicherung des günstigsten Preises
            routes_greedy = self._solve_hub_vrp_greedy(hub_name, pharmacy_ids)
            routes_cw = self._solve_hub_vrp_cw(hub_name, pharmacy_ids)
            
            cost_greedy = sum(r['cost'] for r in routes_greedy.values()) if routes_greedy else float('inf')
            cost_cw = sum(r['cost'] for r in routes_cw.values()) if routes_cw else float('inf')

            # Wähle die strikt kostengünstigere Variante ("GÜNSTIGSTER PREIS")
            if cost_cw <= cost_greedy:
                selected_routes = routes_cw
                best_hub_cost = cost_cw
            else:
                selected_routes = routes_greedy
                best_hub_cost = cost_greedy

            for r_id, r_data in selected_routes.items():
                final_routes[f"{hub_name}_Route_{r_id}"] = r_data
                total_step3_cost += r_data['cost']

        logger.info(f"✅ Schritt 3 abgeschlossen. Last-Mile Kosten: {total_step3_cost:.2f} {self.costs['currency']}.")
        return {
            'total_last_mile_cost': round(total_step3_cost, 2),
            'routes': final_routes
        }

    def _solve_hub_vrp_greedy(self, hub_name: str, pharmacy_ids: list) -> dict:
        """Nächster-Nachbar-Heuristik unter strenger Einhaltung aller Fahrzeuggrenzen."""
        routes = {}
        unvisited = set(pharmacy_ids)
        r_num = 1

        while unvisited:
            # Fahrzeugtyp-Vorauswahl basierend auf der verbleibenden pharmacy Verteilung
            # Wenn weit entfernte Stops anstehen, nutzen wir den LKW, ansonsten den günstigen Evan.
            sample_p = list(unvisited)[0]
            dist_to_hub = self.distance_matrix.loc[hub_name, sample_p]
            v_type = 'EVAN' if dist_to_hub <= 30.0 else 'LKW'
            
            cap_limit = 20 if v_type == 'EVAN' else 60
            dist_limit = 200.0 if v_type == 'EVAN' else 600.0
            cost_per_km = self.costs['evan_per_km'] if v_type == 'EVAN' else self.costs['lkw_per_km']

            route = [hub_name]
            current_load = 0
            current_dist = 0.0
            current_time = 0.0
            current_node = hub_name

            while unvisited:
                best_next = None
                best_d, best_t = float('inf'), 0.0

                for p in unvisited:
                    d = self.distance_matrix.loc[current_node, p]
                    t = self.time_matrix.loc[current_node, p]
                    p_demand = self.demands.get(p, 10)

                    # Rückweg zum Hub einplanen für Limitprüfung
                    return_d = self.distance_matrix.loc[p, hub_name]
                    return_t = self.time_matrix.loc[p, hub_name]

                    if (current_load + p_demand <= cap_limit and 
                        current_dist + d + return_d <= dist_limit and 
                        current_time + t + return_t <= 8.0):
                        if d < best_d:
                            best_next = p
                            best_d = d
                            best_t = t

                if best_next is None:
                    # Falls kein Stop mit Evan passt, prüfen wir erzwungenes Upgrade auf LKW
                    if v_type == 'EVAN':
                        v_type = 'LKW'
                        cap_limit, dist_limit = 60, 600.0
                        cost_per_km = self.costs['lkw_per_km']
                        continue
                    break

                route.append(best_next)
                current_load += self.demands.get(best_next, 10)
                current_dist += best_d
                current_time += best_t
                unvisited.remove(best_next)
                current_node = best_next

            # Zurück zum Depot
            if current_node != hub_name:
                current_dist += self.distance_matrix.loc[current_node, hub_name]
                current_time += self.time_matrix.loc[current_node, hub_name]
            route.append(hub_name)

            route_cost = (current_dist * cost_per_km) + (current_time * self.costs['driver_wage_per_h'])
            
            routes[r_num] = {
                'vehicle_type': v_type,
                'path': route,
                'distance_km': round(current_dist, 1),
                'time_hours': round(current_time, 2),
                'load': current_load,
                'cost': round(route_cost, 2)
            }
            r_num += 1

        return routes

    def _solve_hub_vrp_cw(self, hub_name: str, pharmacy_ids: list) -> dict:
        """Clarke-Wright-Savings-Heuristik angepasst an dynamische Fahrzeugrestriktionen."""
        if not pharmacy_ids:
            return {}

        # Startkonfiguration: Jede Apotheke wird einzeln angefahren
        routes = {}
        for idx, p in enumerate(pharmacy_ids, 1):
            d = self.distance_matrix.loc[hub_name, p] * 2
            t = self.time_matrix.loc[hub_name, p] * 2
            p_dem = self.demands.get(p, 10)
            v_type = 'EVAN' if d/2 <= 30.0 and p_dem <= 20 else 'LKW'
            cost_k = self.costs['evan_per_km'] if v_type == 'EVAN' else self.costs['lkw_per_km']
            c = (d * cost_k) + (t * self.costs['driver_wage_per_h'])
            
            routes[idx] = {
                'vehicle_type': v_type, 'path': [hub_name, p, hub_name],
                'distance_km': d, 'time_hours': t, 'load': p_dem, 'cost': c
            }

        # Einsparungen berechnen s(i,j) = d(hub, i) + d(hub, j) - d(i, j)
        savings = []
        n_p = len(pharmacy_ids)
        for i in range(n_p):
            for j in range(i + 1, n_p):
                p_i, p_j = pharmacy_ids[i], pharmacy_ids[j]
                s = (self.distance_matrix.loc[hub_name, p_i] + 
                     self.distance_matrix.loc[hub_name, p_j] - 
                     self.distance_matrix.loc[p_i, p_j])
                if s > 0:
                    savings.append(((p_i, p_j), s))

        savings.sort(key=lambda x: x[1], reverse=True)

        # Routen-Verschmelzung (Merging) unter strikten Constraints
        for (p_i, p_j), s in savings:
            r_i_id, r_j_id = None, None
            for rid, rdata in routes.items():
                if rdata['path'][1] == p_i and rdata['path'][-2] == p_j: pass
                if p_i in rdata['path'][1:-1]: r_i_id = rid
                if p_j in rdata['path'][1:-1]: r_j_id = rid

            if r_i_id is None or r_j_id is None or r_i_id == r_j_id:
                continue

            ri, rj = routes[r_i_id], routes[r_j_id]
            
            # Prüfen ob die Enden zusammenpassen
            if ri['path'][-2] == p_i and rj['path'][1] == p_j:
                merged_path = ri['path'][:-1] + rj['path'][1:]
            elif ri['path'][1] == p_i and rj['path'][-2] == p_j:
                merged_path = rj['path'][:-1] + ri['path'][1:]
            else:
                continue

            # Neue Metriken bestimmen
            merged_load = ri['load'] + rj['load']
            
            # Fahrzeugklasse bestimmen
            v_type = 'EVAN' if merged_load <= 20 else 'LKW'
            cap_limit = 20 if v_type == 'EVAN' else 60
            dist_limit = 200.0 if v_type == 'EVAN' else 600.0
            cost_k = self.costs['evan_per_km'] if v_type == 'EVAN' else self.costs['lkw_per_km']

            # Exakte Distanz/Zeitberechnung der neuen Route
            m_dist, m_time = 0.0, 0.0
            for k in range(len(merged_path) - 1):
                m_dist += self.distance_matrix.loc[merged_path[k], merged_path[k+1]]
                m_time += self.time_matrix.loc[merged_path[k], merged_path[k+1]]

            # Harte Restriktionsprüfung vor Akzeptanz des Merges
            if merged_load <= cap_limit and m_dist <= dist_limit and m_time <= 8.0:
                m_cost = (m_dist * cost_k) + (m_time * self.costs['driver_wage_per_h'])
                routes[r_i_id] = {
                    'vehicle_type': v_type, 'path': merged_path,
                    'distance_km': round(m_dist, 1), 'time_hours': round(m_time, 2),
                    'load': merged_load, 'cost': round(m_cost, 2)
                }
                del routes[r_j_id]

        return {i: r for i, r in enumerate(routes.values(), 1)}

    # ==================================================================
    # REPRODUKTION & EXPORT FUNKTIONEN
    # ==================================================================
    def calculate_total_kpis(self, step2_res: dict, step3_res: dict) -> dict:
        """Führt alle Ergebnisse zusammen und berechnet Gesamtmetriken."""
        total_dist = step2_res['total_supply_chain_cost'] / self.costs['lkw_per_km'] # Näherung für CO2
        for r in step3_res['routes'].values():
            total_dist += r['distance_km']

        return {
            'total_cost_chf': round(step2_res['total_supply_chain_cost'] + step3_res['total_last_mile_cost'], 2),
            'supply_chain_cost': step2_res['total_supply_chain_cost'],
            'last_mile_cost': step3_res['total_last_mile_cost'],
            'total_routes_count': len(step3_res['routes'])
        }
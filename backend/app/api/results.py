import math
from collections import defaultdict

from fastapi import APIRouter
from sqlalchemy import or_

from app.db.models import Assignment, Hub, Pharmacy, SystemConfig, VehicleFleetConfig, VehicleRoute
from app.db.session import SessionLocal
from app.services.traffic import resolve as traffic_resolve

router = APIRouter()


def _traffic_delay_min(r: VehicleRoute) -> float | None:
    """Extra driving minutes vs. free flow for this route (factor − 1)."""
    if r.free_flow_hours and r.traffic_factor:
        return round(r.free_flow_hours * (r.traffic_factor - 1.0) * 60.0, 1)
    return None


def _fmt_hour(h: float | None) -> str:
    """Convert float hour to HH:MM string. 8.5 → '08:30'."""
    if h is None:
        return "—"
    hrs  = int(h)
    mins = round((h - hrs) * 60)
    return f"{hrs:02d}:{mins:02d}"


def _window(start_h: float | None, hours: float | None) -> str:
    """Per-hub delivery window as 'HH:MM – HH:MM Uhr'."""
    if start_h is None or hours is None:
        return "—"
    return f"{_fmt_hour(start_h)} – {_fmt_hour(min(start_h + hours, 24.0))} Uhr"


def _optimization_block(sys_raw: dict[str, str]) -> dict:
    """Optimisation weights + the traffic context (simulation ↔ TomTom) used by Step 4."""
    def _f(key: str, default: float) -> float:
        try:
            return float(sys_raw.get(key, default))
        except (TypeError, ValueError):
            return default

    ctx = traffic_resolve(sys_raw)
    eff = ctx["effective_factor"]
    return {
        "weights": {
            "cost":        _f("opt_weight_cost", 0.40),
            "time":        _f("opt_weight_time", 0.35),
            "environment": _f("opt_weight_env",  0.25),
        },
        "traffic_factor":          eff,                 # actually applied factor
        "static_traffic_factor":   ctx["static_factor"],
        "live_traffic_enabled":    ctx["enabled"],
        "traffic_mode":            ctx["mode"],         # "simulation" | "tomtom"
        "traffic_source":          ctx["source"],       # "static" | "simulation" | "tomtom"
        "traffic_peak_intensity":  ctx["peak_intensity"],
        "effective_traffic_factor": eff,
        # 24h curve only meaningful for the simulation (TomTom has no daily profile)
        "traffic_profile":         ctx["profile"] if (ctx["enabled"] and ctx["source"] == "simulation") else None,
        "co2_shadow_chf_per_kg":   _f("co2_shadow_chf", 0.12),
        "shift_hours":             ctx["shift_hours"],
        "shift_start":             ctx["shift_start"],
    }


@router.get("/pharmacies")
def get_pharmacies():
    db = SessionLocal()
    try:
        rows = db.query(Pharmacy).all()

        # Which pharmacies are actually delivered by a last-mile vehicle route?
        # A pharmacy can be assigned to a hub yet remain undeliverable (capacity,
        # range or opening-hours constraints in Step 4). Only meaningful once
        # routes exist — before that `served` is None (rendered normally).
        last_mile = db.query(VehicleRoute).filter(
            or_(VehicleRoute.supply_tier == "last_mile", VehicleRoute.supply_tier == None)  # noqa: E711
        ).all()
        have_routes = len(last_mile) > 0
        delivered: set[int] = set()
        for r in last_mile:
            for sid in (r.stops or []):
                if isinstance(sid, int):
                    delivered.add(sid)

        def _served(p) -> bool | None:
            if not have_routes:
                return None
            return p.id in delivered

        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [p.lon, p.lat]},
                    "properties": {
                        "id":            p.id,
                        "name":          p.name or "",
                        "city":          p.city or "",
                        "demand":        p.demand,
                        "hub_name":      p.hub_name,
                        "served":        _served(p),
                        "open_hour":     p.open_hour,
                        "close_hour":    p.close_hour,
                        "opening_hours": f"{_fmt_hour(p.open_hour)} – {_fmt_hour(p.close_hour)}"
                                         if p.open_hour is not None else None,
                    },
                }
                for p in rows
            ],
        }
    finally:
        db.close()


@router.get("/hubs")
def get_hubs():
    db = SessionLocal()
    try:
        rows = db.query(Hub).all()

        # Route stats per hub (last-mile) for InfoSidebar enrichment
        route_stats: dict[str, dict] = defaultdict(
            lambda: {"vehicle_counts": {}, "total_items": 0, "total_km": 0.0}
        )
        for r in db.query(VehicleRoute).filter(
            or_(VehicleRoute.supply_tier == "last_mile", VehicleRoute.supply_tier == None)  # noqa: E711
        ).all():
            s = route_stats[r.hub_name]
            vt = r.vehicle_type or "—"
            s["vehicle_counts"][vt] = s["vehicle_counts"].get(vt, 0) + 1
            s["total_items"] += r.total_items or 0
            s["total_km"]    += r.total_km or 0

        # Current goods load: use actual demand if known, else configured estimate
        sys_raw = {c.key: c.value for c in db.query(SystemConfig).all()}
        demand_est = float(sys_raw.get("default_demand_est", "3"))
        all_pharmacies = db.query(Pharmacy).all()
        has_actual_demand = any(p.demand is not None for p in all_pharmacies)

        load: dict[str, int] = defaultdict(int)
        pharm_count: dict[str, int] = defaultdict(int)
        for p in all_pharmacies:
            if p.hub_name:
                effective = p.demand if p.demand is not None else demand_est
                load[p.hub_name] += int(effective)
                pharm_count[p.hub_name] += 1

        g_shift_start = float(sys_raw.get("shift_start", "8.0"))
        g_shift_hours = float(sys_raw.get("shift_hours", "8.0"))

        def _hub_shift(h):
            return (h.shift_start if h.shift_start is not None else g_shift_start,
                    h.shift_hours if h.shift_hours is not None else g_shift_hours)

        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [h.lon, h.lat]},
                    "properties": {
                        "id":              h.id,
                        "name":            h.name,
                        "hub_type":        h.hub_type,
                        "parent_hub":      h.parent_hub,
                        "capacity":        h.capacity,
                        "load":            load.get(h.name, 0),
                        "pharmacy_count":  pharm_count.get(h.name, 0),
                        # Route stats (available after Step 4)
                        "vehicle_counts":   route_stats[h.name]["vehicle_counts"],
                        "total_items":      route_stats[h.name]["total_items"],
                        "total_km":         round(route_stats[h.name]["total_km"], 1),
                        # Per-hub delivery shift (each city its own)
                        "delivery_window":  _window(*_hub_shift(h)),
                        "shift_start":      _hub_shift(h)[0],
                        "shift_hours":      _hub_shift(h)[1],
                        "warehouse_cost":   round(h.warehouse_cost, 2) if h.warehouse_cost is not None else None,
                        "open_hour":        h.open_hour,
                        "close_hour":       h.close_hour,
                        "opening_hours":    f"{_fmt_hour(h.open_hour)} – {_fmt_hour(h.close_hour)}"
                                            if h.open_hour is not None else None,
                        "load_estimated":   not has_actual_demand,
                    },
                }
                for h in rows
            ],
        }
    finally:
        db.close()


@router.get("/assignments")
def get_assignments():
    db = SessionLocal()
    try:
        rows = db.query(Assignment).all()
        features = []
        for a in rows:
            if a.route_geometry and len(a.route_geometry) >= 2:
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": a.route_geometry},
                        "properties": {
                            "pharmacy_id": a.pharmacy_id,
                            "hub_name": a.hub_name,
                            "distance_km": a.distance_km,
                            "travel_time_h": a.travel_time_h,
                        },
                    }
                )
        return {"type": "FeatureCollection", "features": features}
    finally:
        db.close()


@router.get("/routes")
def get_routes():
    db = SessionLocal()
    try:
        rows = db.query(VehicleRoute).filter(
            or_(VehicleRoute.supply_tier == "last_mile", VehicleRoute.supply_tier == None)  # noqa: E711
        ).all()
        features = []
        for r in rows:
            if r.stop_coords and len(r.stop_coords) >= 2:
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": r.stop_coords},
                        "properties": {
                            "id": r.id,
                            "hub_name": r.hub_name,
                            "vehicle_id": r.vehicle_id,
                            "vehicle_type": r.vehicle_type,
                            "total_km": r.total_km,
                            "total_hours": r.total_hours,
                            "total_items": r.total_items,
                            "total_cost_chf": r.total_cost_chf,
                            "co2_kg": r.co2_kg,
                            "stops": r.stops or [],          # pharmacy ids — map filter: pharmacy → route
                            "stop_count": len(r.stops) if r.stops else 0,
                            "restock_count": r.restock_count,
                            "traffic_factor": r.traffic_factor,
                            "traffic_source": r.traffic_source,
                            "free_flow_hours": r.free_flow_hours,
                            "traffic_delay_min": _traffic_delay_min(r),
                        },
                    }
                )
        return {"type": "FeatureCollection", "features": features}
    finally:
        db.close()


@router.get("/backbone")
def get_backbone():
    db = SessionLocal()
    try:
        hq = db.query(Hub).filter(Hub.hub_type == "HQ").first()
        hq_name = hq.name if hq else ""
        rows = db.query(VehicleRoute).filter(VehicleRoute.supply_tier == "backbone").all()
        features = []
        for r in rows:
            if r.stop_coords and len(r.stop_coords) >= 2:
                # tier: "hq_vz" for HQ→VZ routes, "vz_mvz" for VZ→mVZ routes
                tier = "hq_vz" if r.hub_name == hq_name else "vz_mvz"
                to_hubs = [str(s) for s in (r.stops or [])]
                features.append(
                    {
                        "type": "Feature",
                        "geometry": {"type": "LineString", "coordinates": r.stop_coords},
                        "properties": {
                            "id":            r.id,
                            "hub_name":      r.hub_name,
                            "from_hub":      r.hub_name,
                            "to_hubs":       to_hubs,
                            "stop_count":    len(to_hubs),
                            "vehicle_id":    r.vehicle_id,
                            "vehicle_type":  r.vehicle_type,
                            "backbone_tier": tier,
                            "total_km":      r.total_km,
                            "total_hours":   r.total_hours,
                            "total_items":   r.total_items,
                            "total_cost_chf": r.total_cost_chf,
                            "co2_kg":        r.co2_kg,
                        },
                    }
                )
        return {"type": "FeatureCollection", "features": features}
    finally:
        db.close()


@router.get("/summary")
def get_summary():
    db = SessionLocal()
    try:
        pharmacies = db.query(Pharmacy).all()
        routes   = db.query(VehicleRoute).all()
        all_hubs = db.query(Hub).all()
        sys_raw  = {c.key: c.value for c in db.query(SystemConfig).all()}
        ctx = traffic_resolve(sys_raw)

        assigned   = sum(1 for p in pharmacies if p.hub_name)
        route_cost = round(sum(r.total_cost_chf or 0 for r in routes), 2)
        wh_cost    = round(sum(h.warehouse_cost or 0 for h in all_hubs), 2)
        return {
            "hubs": len(all_hubs),
            "pharmacies_total": len(pharmacies),
            "pharmacies_assigned": assigned,
            "total_demand": sum(p.demand or 0 for p in pharmacies),
            "total_routes": len(routes),
            "total_cost_chf": route_cost,
            "warehouse_cost_chf": wh_cost,
            "total_cost_incl_warehouse_chf": round(route_cost + wh_cost, 2),
            "total_km": round(sum(r.total_km or 0 for r in routes), 2),
            "total_co2_kg": round(sum(r.co2_kg or 0 for r in routes), 2),
            "cost_per_pharmacy_chf": round(route_cost / assigned, 2) if assigned else 0,
            "traffic_source": ctx["source"],
            "traffic_total_delay_min": round(sum(_traffic_delay_min(r) or 0 for r in routes), 1),
            # legacy fields (kept for compatibility)
            "evan_routes": sum(1 for r in routes if r.vehicle_type == "EVan"),
            "lkw_routes": sum(1 for r in routes if r.vehicle_type == "LKW"),
        }
    finally:
        db.close()


@router.get("/summary/full")
def get_full_summary():
    """Detailed summary for the analytics dashboard page — reads all specs from DB."""
    db = SessionLocal()
    try:
        pharmacies = db.query(Pharmacy).all()
        all_hubs   = db.query(Hub).all()
        all_routes = db.query(VehicleRoute).all()
        vehicles   = db.query(VehicleFleetConfig).order_by(VehicleFleetConfig.sort_order).all()
        sys_raw    = {c.key: c.value for c in db.query(SystemConfig).all()}

        last_mile = [r for r in all_routes if r.supply_tier in (None, "last_mile")]
        backbone  = [r for r in all_routes if r.supply_tier == "backbone"]

        # Fleet stats per vehicle type
        type_stats: dict[str, dict] = {}
        for r in last_mile:
            vt = r.vehicle_type or "—"
            if vt not in type_stats:
                type_stats[vt] = {"count": 0, "total_km": 0.0, "total_hours": 0.0,
                                   "total_cost_chf": 0.0, "total_co2_kg": 0.0, "total_items": 0}
            s = type_stats[vt]
            s["count"]          += 1
            s["total_km"]       += r.total_km       or 0
            s["total_hours"]    += r.total_hours     or 0
            s["total_cost_chf"] += r.total_cost_chf or 0
            s["total_co2_kg"]   += r.co2_kg         or 0
            s["total_items"]    += r.total_items     or 0

        def _fleet_stats(rs):
            return {
                "count":          len(rs),
                "total_km":       round(sum(r.total_km       or 0 for r in rs), 2),
                "total_hours":    round(sum(r.total_hours     or 0 for r in rs), 2),
                "total_cost_chf": round(sum(r.total_cost_chf or 0 for r in rs), 2),
                "total_co2_kg":   round(sum(r.co2_kg         or 0 for r in rs), 3),
                "total_items":    sum(r.total_items or 0 for r in rs),
            }

        def _hav(lat1, lon1, lat2, lon2):
            R = 6371.0
            dlat = math.radians(lat2 - lat1)
            dlon = math.radians(lon2 - lon1)
            a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
            return R * 2 * math.asin(min(1.0, math.sqrt(max(0.0, a))))

        hq       = next((h for h in all_hubs if h.hub_type == "HQ"), None)
        vz_list  = [h for h in all_hubs if h.hub_type == "VZ"]
        mvz_list = [h for h in all_hubs if h.hub_type == "mVZ"]
        pharm_by_hub: dict[str, list] = {}
        for p in pharmacies:
            if p.hub_name:
                pharm_by_hub.setdefault(p.hub_name, []).append(p)

        # Backbone is multi-stop, so per-leg cost is not isolated per target;
        # we report straight-line leg distances and let aggregate stats cover cost/CO₂.
        hierarchy = []
        for vz in vz_list:
            vz_mvzs    = [m for m in mvz_list if m.parent_hub == vz.name]
            vz_pharmas = pharm_by_hub.get(vz.name, [])
            mvz_count  = sum(len(pharm_by_hub.get(m.name, [])) for m in vz_mvzs)
            hq_dist    = _hav(hq.lat, hq.lon, vz.lat, vz.lon) if hq else 0
            vz_stat: dict = {
                "name":              vz.name,
                "direct_pharmacies": len(vz_pharmas),
                "mvz_count":         len(vz_mvzs),
                "total_pharmacies":  len(vz_pharmas) + mvz_count,
                "total_items":       (sum(p.demand or 0 for p in vz_pharmas)
                                      + sum(p.demand or 0 for p in pharmacies
                                            if any(p.hub_name == m.name for m in vz_mvzs))),
                "capacity":          vz.capacity,
                "load":              sum(p.demand or 0 for p in vz_pharmas),
                "distance_to_hq_km": round(hq_dist, 1),
                "backbone_km":       round(hq_dist, 1),
                "backbone_cost_chf": None,
                "backbone_co2_kg":   None,
                "mvz": [],
            }
            for mvz in vz_mvzs:
                mvz_p   = pharm_by_hub.get(mvz.name, [])
                leg_km  = _hav(vz.lat, vz.lon, mvz.lat, mvz.lon)
                vz_stat["mvz"].append({
                    "name":            mvz.name,
                    "pharmacy_count":  len(mvz_p),
                    "total_items":     sum(p.demand or 0 for p in mvz_p),
                    "backbone_km":       round(leg_km, 1),
                    "backbone_cost_chf": None,
                    "backbone_co2_kg":   None,
                })
            hierarchy.append(vz_stat)

        # Capacity / load per hub for metrics
        sys_raw_full  = {c.key: c.value for c in db.query(SystemConfig).all()}
        demand_est_f  = float(sys_raw_full.get("default_demand_est", "3"))

        # Fleet utilisation: how many vehicles were actually deployed vs available
        delivery_hub_names = {r.hub_name for r in last_mile}
        n_delivery_hubs    = len(delivery_hub_names)
        fleet_utilization  = {}
        for v in vehicles:
            if not v.can_last_mile:
                continue
            total_avail = (v.max_per_hub or 0) * n_delivery_hubs
            actually_used = len({r.vehicle_id for r in last_mile if r.vehicle_type == v.name})
            fleet_utilization[v.name] = {
                "total_available": total_avail,
                "actually_used":   actually_used,
                "utilization_pct": round(100 * actually_used / max(1, total_avail), 1),
            }
        load_per_hub: dict[str, int] = defaultdict(int)
        for p in pharmacies:
            if p.hub_name:
                load_per_hub[p.hub_name] += int(p.demand if p.demand is not None else demand_est_f)

        total_lm_km   = sum(r.total_km or 0 for r in last_mile)
        total_lm_cost = sum(r.total_cost_chf or 0 for r in last_mile)
        total_lm_items = sum(r.total_items or 0 for r in last_mile)
        total_lm_stops = sum(len(r.stops or []) for r in last_mile)
        total_all_co2  = sum(r.co2_kg or 0 for r in all_routes)

        # Pharmacies actually served by a last-mile route vs. assigned-but-undelivered
        delivered_ids: set[int] = set()
        for r in last_mile:
            for sid in (r.stops or []):
                if isinstance(sid, int):
                    delivered_ids.add(sid)
        served_count      = sum(1 for p in pharmacies if p.id in delivered_ids)
        undelivered_count = sum(1 for p in pharmacies if p.id not in delivered_ids)

        # ── Hauptlauf (backbone) fleet stats per vehicle type ─────────────────
        backbone_type_stats: dict[str, dict] = {}
        for r in backbone:
            vt = r.vehicle_type or "—"
            s = backbone_type_stats.setdefault(vt, {
                "count": 0, "total_km": 0.0, "total_hours": 0.0,
                "total_cost_chf": 0.0, "total_co2_kg": 0.0, "total_items": 0})
            s["count"]          += 1
            s["total_km"]       += r.total_km       or 0
            s["total_hours"]    += r.total_hours     or 0
            s["total_cost_chf"] += r.total_cost_chf or 0
            s["total_co2_kg"]   += r.co2_kg         or 0
            s["total_items"]    += r.total_items     or 0

        hq_name = hq.name if hq else ""
        individual_backbone = sorted([
            {
                "vehicle_id":    r.vehicle_id,
                "vehicle_type":  r.vehicle_type,
                "hub_name":      r.hub_name,
                "from_hub":      r.hub_name,
                "to_hubs":       [str(x) for x in (r.stops or [])],
                "tier":          "hq_vz" if r.hub_name == hq_name else "vz_mvz",
                "stop_count":    len(r.stops or []),
                "total_km":      round(r.total_km or 0, 2),
                "total_hours":   round(r.total_hours or 0, 2),
                "total_items":   r.total_items or 0,
                "total_cost_chf": round(r.total_cost_chf or 0, 2),
                "co2_kg":        round(r.co2_kg or 0, 3),
                "restock_count": r.restock_count or 0,
                "traffic_factor":    r.traffic_factor,
                "traffic_source":    r.traffic_source,
                "traffic_delay_min": _traffic_delay_min(r),
            }
            for r in backbone
        ], key=lambda x: (x["vehicle_type"], x["hub_name"], x["vehicle_id"]))

        # ── Warehouse (Lager) costs ───────────────────────────────────────────
        warehouse_total = round(sum(h.warehouse_cost or 0 for h in all_hubs), 2)
        route_cost_total = round(sum(r.total_cost_chf or 0 for r in all_routes), 2)

        # ── Traffic impact aggregate (per vehicle type) ───────────────────────
        traffic_ctx = traffic_resolve(sys_raw)
        tbt: dict[str, dict] = {}
        for r in all_routes:
            vt = r.vehicle_type or "—"
            s = tbt.setdefault(vt, {"routes": 0, "total_delay_min": 0.0,
                                    "_ff": 0.0, "_drive": 0.0, "source": r.traffic_source})
            s["routes"] += 1
            s["total_delay_min"] += _traffic_delay_min(r) or 0
            ff = r.free_flow_hours or 0.0
            s["_ff"]    += ff
            s["_drive"] += ff * (r.traffic_factor or 1.0)
            if r.traffic_source:
                s["source"] = r.traffic_source
        for s in tbt.values():
            s["avg_factor"]      = round(s["_drive"] / s["_ff"], 3) if s["_ff"] > 1e-6 else 1.0
            s["total_delay_min"] = round(s["total_delay_min"], 1)
            del s["_ff"], s["_drive"]

        return {
            "overview": {
                "total_cost_chf":          route_cost_total,
                "warehouse_cost_chf":      warehouse_total,
                "total_cost_incl_warehouse_chf": round(route_cost_total + warehouse_total, 2),
                "total_co2_kg":            round(total_all_co2, 2),
                "total_km":                round(sum(r.total_km or 0 for r in all_routes), 2),
                "total_last_mile_routes":  len(last_mile),
                "total_backbone_routes":   len(backbone),
                "pharmacies_total":        len(pharmacies),
                "pharmacies_assigned":     sum(1 for p in pharmacies if p.hub_name),
                "hubs_total":              len(all_hubs),
                "traffic_total_delay_min": round(sum(_traffic_delay_min(r) or 0 for r in all_routes), 1),
            },
            "fleet_by_type":  {vt: {**s, "total_km": round(s["total_km"], 2),
                                         "total_hours": round(s["total_hours"], 2),
                                         "total_cost_chf": round(s["total_cost_chf"], 2),
                                         "total_co2_kg": round(s["total_co2_kg"], 3)}
                                for vt, s in type_stats.items()},
            "backbone_by_type": {vt: {**s, "total_km": round(s["total_km"], 2),
                                          "total_hours": round(s["total_hours"], 2),
                                          "total_cost_chf": round(s["total_cost_chf"], 2),
                                          "total_co2_kg": round(s["total_co2_kg"], 3)}
                                 for vt, s in backbone_type_stats.items()},
            "fleet": {
                "last_mile": _fleet_stats(last_mile),
                "backbone":  _fleet_stats(backbone),
            },
            "vehicle_specs": [
                {
                    "id": v.id, "name": v.name, "vehicle_class": v.vehicle_class,
                    "can_last_mile": bool(v.can_last_mile), "can_backbone": bool(v.can_backbone),
                    "capacity": v.capacity, "range_km": v.range_km,
                    "cost_per_km": v.cost_per_km, "co2_g_per_km": v.co2_g_per_km,
                    "speed_kmh": v.speed_kmh, "driver_chf_h": v.driver_chf_h,
                    "service_min": v.service_min, "max_per_hub": v.max_per_hub,
                    "enabled": v.enabled,
                }
                for v in vehicles
            ],
            "optimization": _optimization_block(sys_raw),
            "supply_chain": {
                "hq_name":        hq.name if hq else None,
                "vz_count":       len(vz_list),
                "mvz_count":      len(mvz_list),
                "pharmacy_count": len(pharmacies),
                "hierarchy":      hierarchy,
            },
            "traffic": {
                "mode":            traffic_ctx["mode"],
                "source":          traffic_ctx["source"],
                "error":           traffic_ctx.get("error"),
                "last_error":      sys_raw.get("tomtom_last_error") or "",
                "effective_factor": traffic_ctx["effective_factor"],
                "total_delay_min": round(sum(_traffic_delay_min(r) or 0 for r in all_routes), 1),
                "by_type":         tbt,
            },
            "metrics": {
                "avg_stops_per_route":   round(total_lm_stops / max(1, len(last_mile)), 1),
                "avg_km_per_route":      round(total_lm_km    / max(1, len(last_mile)), 1),
                "cost_per_item_chf":     round(total_lm_cost  / max(1, total_lm_items), 2),
                "co2_per_km_kg":         round(total_all_co2  / max(1, sum(r.total_km or 0 for r in all_routes)), 4),
                "total_driver_hours":    round(sum(r.total_hours or 0 for r in last_mile), 1),
                "unrouted_pharmacies":   sum(1 for p in pharmacies if not p.hub_name),
                "served_pharmacies":     served_count,
                "undelivered_pharmacies": undelivered_count,
                "hub_loads": [
                    {
                        "name":     h.name,
                        "hub_type": h.hub_type,
                        "load":     load_per_hub.get(h.name, 0),
                        "capacity": h.capacity or 0,
                        "pct":      round(100 * load_per_hub.get(h.name, 0) / h.capacity, 1)
                                    if h.capacity else 0,
                        "warehouse_cost": round(h.warehouse_cost, 2) if h.warehouse_cost is not None else None,
                    }
                    for h in sorted(all_hubs, key=lambda x: (x.hub_type, x.name))
                ],
            },
            "fleet_utilization": fleet_utilization,
            "individual_backbone_routes": individual_backbone,
            "individual_routes": sorted([
                {
                    "vehicle_id":    r.vehicle_id,
                    "vehicle_type":  r.vehicle_type,
                    "hub_name":      r.hub_name,
                    "stop_count":    len(r.stops or []),
                    "total_km":      round(r.total_km or 0, 2),
                    "total_hours":   round(r.total_hours or 0, 2),
                    "total_items":   r.total_items or 0,
                    "total_cost_chf": round(r.total_cost_chf or 0, 2),
                    "co2_kg":        round(r.co2_kg or 0, 3),
                    "restock_count": r.restock_count or 0,
                    "traffic_factor":    r.traffic_factor,
                    "traffic_source":    r.traffic_source,
                    "traffic_delay_min": _traffic_delay_min(r),
                }
                for r in last_mile
            ], key=lambda x: (x["vehicle_type"], x["hub_name"], x["vehicle_id"])),
        }
    finally:
        db.close()

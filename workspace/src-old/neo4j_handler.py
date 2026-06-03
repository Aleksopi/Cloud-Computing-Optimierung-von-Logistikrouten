"""Neo4j Handler für Logistik-Datenbank"""
from neo4j import GraphDatabase
import json

class Neo4jHandler:
    def __init__(self, uri="bolt://localhost:7687", user="neo4j", password="password123"):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))
    
    def close(self):
        self.driver.close()
    
    def create_location(self, name, lat, lon, location_type="warehouse"):
        """Erstelle einen Ort (Warehouse, Lieferstelle, etc.)"""
        with self.driver.session() as session:
            result = session.run(
                """
                CREATE (l:Location {
                    name: $name,
                    latitude: $lat,
                    longitude: $lon,
                    type: $type
                })
                RETURN l.name as name
                """,
                name=name, lat=lat, lon=lon, type=location_type
            )
            return result.single()
    
    def create_delivery(self, location_id, demand, time_window_start, time_window_end):
        """Erstelle eine Lieferanforderung"""
        with self.driver.session() as session:
            session.run(
                """
                MATCH (l:Location {name: $loc})
                CREATE (d:Delivery {
                    id: apoc.create.uuid(),
                    demand: $demand,
                    time_window_start: $tw_start,
                    time_window_end: $tw_end
                })-[:AT]->(l)
                """,
                loc=location_id, demand=demand, 
                tw_start=time_window_start, tw_end=time_window_end
            )
    
    def create_route(self, vehicle_id, locations, total_distance, total_time):
        """Speichere eine berechnete Route"""
        with self.driver.session() as session:
            session.run(
                """
                CREATE (r:Route {
                    vehicle_id: $vehicle_id,
                    locations: $locations,
                    total_distance: $total_distance,
                    total_time: $total_time,
                    created_at: datetime()
                })
                """,
                vehicle_id=vehicle_id,
                locations=locations,
                total_distance=total_distance,
                total_time=total_time
            )
    
    def get_all_locations(self):
        """Hole alle Orte"""
        with self.driver.session() as session:
            result = session.run("MATCH (l:Location) RETURN l.name, l.latitude, l.longitude, l.type")
            return [(record["l.name"], record["l.latitude"], record["l.longitude"], record["l.type"]) 
                    for record in result]
    
    def get_deliveries(self):
        """Hole alle Lieferanforderungen"""
        with self.driver.session() as session:
            result = session.run(
                """
                MATCH (d:Delivery)-[:AT]->(l:Location)
                RETURN d.id, l.name, d.demand, d.time_window_start, d.time_window_end
                """
            )
            return [dict(record) for record in result]
    
    def clear_all(self):
        """Lösche alle Daten (für Testing)"""
        with self.driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")

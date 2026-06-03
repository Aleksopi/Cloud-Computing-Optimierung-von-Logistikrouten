"""
neo4j_handler.py  –  Generic Neo4j infrastructure handler
==========================================================
Provides connection management and reusable low-level operations.
Domain-specific logic (spatial joins, demand calculation) lives in
the step modules (a3_demand.py, etc.), not here.

Neo4j requirements
------------------
  Neo4j >= 4.4  (native point() + point.distance() built-in, no APOC needed)

Usage
-----
    from neo4j_handler import Neo4jHandler

    with Neo4jHandler() as neo4j:
        neo4j.run("MATCH (n) RETURN count(n) AS n")
"""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Any

from neo4j import GraphDatabase, Session

logger = logging.getLogger(__name__)

_DEFAULT_URI      = os.getenv("NEO4J_URI",      "bolt://localhost:7687")
_DEFAULT_USER     = os.getenv("NEO4J_USER",     "neo4j")
_DEFAULT_PASSWORD = os.getenv("NEO4J_PASSWORD", "Tr0p1c@lM0nk3y92")

_BATCH_SIZE = 500


class Neo4jHandler:
    """
    Context-manager-compatible Neo4j connection wrapper.

    Provides:
      • run()        – execute a single Cypher query, return list[dict]
      • run_batch()  – UNWIND a list of row-dicts in fixed-size batches
      • ensure_index() / ensure_point_index() – idempotent schema helpers
      • stats()      – node counts by label
      • clear_all()  – full wipe (testing only)

    All domain logic belongs in the calling module.
    """

    def __init__(
        self,
        uri: str      = _DEFAULT_URI,
        user: str     = _DEFAULT_USER,
        password: str = _DEFAULT_PASSWORD,
    ) -> None:
        self.driver = GraphDatabase.driver(uri, auth=(user, password))
        logger.info(f"[Neo4j] Connected → {uri}")

    def close(self) -> None:
        self.driver.close()

    def __enter__(self) -> "Neo4jHandler":
        return self

    def __exit__(self, *_) -> None:
        self.close()

    # ── Query helpers ──────────────────────────────────────────────────────────

    def run(self, query: str, **params) -> list[dict]:
        """Execute a Cypher query and return all rows as list[dict]."""
        with self.driver.session() as s:
            return [dict(r) for r in s.run(query, **params)]

    def run_one(self, query: str, **params) -> dict | None:
        """Execute a Cypher query and return the first row, or None."""
        rows = self.run(query, **params)
        return rows[0] if rows else None

    def run_batch(self, query: str, rows: list[dict], batch_size: int = _BATCH_SIZE) -> int:
        """
        Execute a Cypher query that expects an $rows parameter via UNWIND,
        splitting into batches of batch_size. Returns total rows processed.
        """
        total = 0
        with self.driver.session() as s:
            for i in range(0, len(rows), batch_size):
                batch = rows[i : i + batch_size]
                s.run(query, rows=batch)
                total += len(batch)
        return total

    # ── Schema helpers ─────────────────────────────────────────────────────────

    def ensure_index(self, label: str, prop: str) -> None:
        """Create a standard index IF NOT EXISTS."""
        name = f"idx_{label.lower()}_{prop.lower()}"
        self.run(
            f"CREATE INDEX {name} IF NOT EXISTS FOR (n:{label}) ON (n.{prop})"
        )
        logger.debug(f"[Neo4j] Index ensured: {name}")

    def ensure_point_index(self, label: str, prop: str) -> None:
        """Create a point index IF NOT EXISTS (required for point.distance() performance)."""
        name = f"pidx_{label.lower()}_{prop.lower()}"
        self.run(
            f"CREATE POINT INDEX {name} IF NOT EXISTS FOR (n:{label}) ON (n.{prop})"
        )
        logger.info(f"[Neo4j] Point index ensured: {name}")

    # ── Utility ────────────────────────────────────────────────────────────────

    def stats(self, labels: list[str] | None = None) -> dict[str, int]:
        """Return node counts by label."""
        if labels is None:
            labels = ["PopulationCell", "Location", "Pharmacy", "Route", "Delivery"]
        counts = {}
        for label in labels:
            row = self.run_one(f"MATCH (n:{label}) RETURN count(n) AS n")
            counts[label] = row["n"] if row else 0
        return counts

    def clear_all(self) -> None:
        """Delete all nodes and relationships. Testing only."""
        self.run("MATCH (n) DETACH DELETE n")
        logger.warning("[Neo4j] ⚠️  All data cleared.")

    def node_exists(self, label: str, **match_props) -> bool:
        """Return True if at least one node matching label+props exists."""
        conditions = " AND ".join(f"n.{k} = ${k}" for k in match_props)
        query = f"MATCH (n:{label}) WHERE {conditions} RETURN count(n) AS n LIMIT 1"
        row = self.run_one(query, **match_props)
        return bool(row and row["n"] > 0)

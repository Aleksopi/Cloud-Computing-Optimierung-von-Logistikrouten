"""
result.py – Pipeline Result Management
======================================

Dieses Modul ist für die Persistenz der Zwischen- und Endergebnisse der 
Logistik-Pipeline verantwortlich. Es stellt sicher, dass generierte Daten 
(wie Standortzuweisungen, berechnete Routen oder Kosten) einheitlich, 
sicher und nachvollziehbar gespeichert werden.

Hauptmerkmale:
--------------
- Speicherung als JSON: Gewährleistet einfache Lesbarkeit und Kompatibilität.
- Automatisches Verzeichnismanagement: Erstellt das Zielverzeichnis 
  (/workspace/results/), falls es nicht existiert.
- Chronologische Sortierung: Stellt einen strikten Zeitstempel (YYYYMMDD_HHMMSS) 
  an den Anfang jedes Dateinamens, um eine saubere Historie zu garantieren.
- Fehlerbehandlung: Fängt Schreibfehler ab, loggt diese und wirft sie sicher weiter.

Verwendung:
-----------
    from result import save_result
    
    data = {"locations": [...], "costs": 12500}
    save_result(data, "01_locations")
"""

import json
from pathlib import Path
from datetime import datetime
from log import logger

def save_result(filename_prefix: str, data: dict) -> Path:
    """
    Speichert ein Python-Dictionary als JSON-Datei.
    """
    # Relativer Pfad zum Workspace-Verzeichnis (funktioniert auf Win/Linux)
    target_dir = Path("../../workspace/results")
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # Zeitstempel generieren
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{filename_prefix}.json"
    full_path = target_dir / filename
    
    try:
        with open(full_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logger.info(f"💾 Ergebnisse exportiert nach: {full_path}")
        return full_path
    except Exception as e:
        logger.error(f"❌ Fehler beim Speichern der Ergebnisse ({filename}): {e}")
        raise e

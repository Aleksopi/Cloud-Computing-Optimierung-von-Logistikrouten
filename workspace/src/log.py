"""
log.py – Centralized Pipeline Logging
=====================================

Dieses Modul konfiguriert das zentrale Logging-System für die gesamte 
Notebook-Pipeline. Es stellt eine globale `logger`-Instanz zur Verfügung, 
die Konsolen-Ausgaben und Dateiprotokollierung parallel handhabt.

Hauptmerkmale:
--------------
- Duales Logging: Schreibt Logs synchron in die Konsole (für das Notebook) 
  und in eine dedizierte Log-Datei (zur späteren Analyse).
- Notebook-Sicherheit: Verhindert die Mehrfach-Registrierung von Handlern 
  (was bei wiederholter Ausführung von Notebook-Zellen oft zu doppelten Logs führt).
- Automatisches Verzeichnismanagement: Erstellt das Verzeichnis /workspace/logs/ 
  bei Bedarf automatisch.
- Chronologische Dateinamen: Nutzt einen Zeitstempel am Anfang des Dateinamens 
  für eine saubere, sortierbare Ablage.

Verwendung:
-----------
    from log import logger
    
    logger.info("Starte Schritt 1...")
    logger.error("Fehler bei der Berechnung!")
"""

import logging
from pathlib import Path
from datetime import datetime

# Logger-Instanz holen
logger = logging.getLogger("LogisticsLogger")
logger.setLevel(logging.INFO)

# Handler nur hinzufügen, wenn noch keine existieren (Notebook-Schutz vor Duplikaten)
if not logger.handlers:
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')

    # 1. Console Handler (Direktausgabe im Notebook/Terminal)
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # 2. File Handler mit Zeitstempel AM ANFANG des Dateinamens
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_dir = Path("/workspace/logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    
    log_file_path = log_dir / f"{timestamp}_pipeline.log"
    
    file_handler = logging.FileHandler(log_file_path, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

logger.info(f"📝 Logger initialisiert. Log-Protokoll: {log_file_path.name}")
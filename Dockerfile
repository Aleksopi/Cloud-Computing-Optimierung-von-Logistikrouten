FROM ubuntu:22.04

# Abhängigkeiten installieren
RUN apt-get update && apt-get install -y \
    openjdk-17-jdk \
    python3 \
    python3-pip \
    wget \
    curl \
    git \
    osmium-tool \
    && rm -rf /var/lib/apt/lists/*

# Neo4j installieren
RUN wget -O neo4j.tar.gz https://neo4j.com/artifact.php?name=neo4j-community-5.15.0-unix.tar.gz \
    && tar -xzf neo4j.tar.gz \
    && mv neo4j-community-5.15.0 /opt/neo4j \
    && rm neo4j.tar.gz

# Python-Pakete installieren
RUN pip3 install --no-cache-dir \
    ortools \
    folium \
    neo4j \
    osmnx \
    networkx \
    pandas \
    geopandas \
    matplotlib \
    jupyter \
    geopy \
    pyrosm

# Ports exponieren
EXPOSE 7474 7687 8888 5000

# Working directory
WORKDIR /workspace

# Neo4j konfigurieren - auf 0.0.0.0 exponieren
RUN echo "server.default_listen_address=0.0.0.0" >> /opt/neo4j/conf/neo4j.conf && \
    echo "server.bolt.listen_address=:7687" >> /opt/neo4j/conf/neo4j.conf && \
    echo "server.http.listen_address=:7474" >> /opt/neo4j/conf/neo4j.conf

# Startup-Skript direkt im Dockerfile erstellen
COPY <<-'---ENDOFSCRIPT---' /startup.sh
#!/bin/bash
set -e

echo "Starting Neo4j..."
/opt/neo4j/bin/neo4j start

echo "Starting Jupyter Notebook..."
jupyter notebook \
  --ip=0.0.0.0 \
  --port=8888 \
  --no-browser \
  --allow-root \
  --NotebookApp.token='' \
  --NotebookApp.password='' \
  --NotebookApp.base_url=/ \
  --NotebookApp.trust_xheaders=True \
  --NotebookApp.allow_remote_access=True \
  --NotebookApp.allow_origin='*'

echo "All services started!"
tail -f /dev/null
---ENDOFSCRIPT---

# Skript ausführbar machen
RUN chmod +x /startup.sh

ENTRYPOINT ["/startup.sh"]
import { C, addIcon, arrow, formulaBox, frame, label, numberedCard, pill, shadowCard, title } from "./shared.mjs";

function matrix(slide, ctx, x, y, labelText, color) {
  frame(slide, ctx, x, y, 106, 96, C.white, "#CBD5E1", "roundRect");
  const vals = [
    [0.1, 0.4, 0.7],
    [0.4, 0.1, 0.5],
    [0.7, 0.5, 0.1],
  ];
  vals.forEach((row, r) => row.forEach((v, c) => {
    const fill = v < 0.2 ? "#D9F7EF" : v < 0.5 ? "#8FD8D0" : "#D8E9F4";
    frame(slide, ctx, x + 16 + c * 24, y + 18 + r * 22, 18, 18, fill, "#FFFFFF", "roundRect");
  }));
  label(slide, ctx, labelText, x + 8, y + 76, 90, 12, { size: 9.2, bold: true, color, align: "center" });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();
  title(
    slide,
    ctx,
    "ROUTENBERECHNUNG",
    "Datenbasis: OSRM-Matrix und Live Traffic",
    "Step 4 arbeitet pro Depot mit echten Straßendistanzen und Fahrzeiten. Live Traffic kann die Zeitmatrix ersetzen; sonst greifen Simulation oder statischer Faktor.",
    C.amber,
    "10",
  );

  shadowCard(slide, ctx, 68, 246, 330, 318, C.white);
  label(slide, ctx, "1 OSRM als Routing-Engine", 94, 268, 250, 24, {
    size: 18,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  await addIcon(slide, ctx, "Route", 338, 266, 28, 28, C.violet);
  label(slide, ctx, "Schweizer OpenStreetMap-Straßennetz liegt als vorverarbeiteter OSRM-Graph im Container.", 94, 302, 250, 40, {
    size: 12.2,
    color: C.ink2,
  });
  await pill(slide, ctx, 94, 358, 244, 38, "Table2", "/table: km + Stunden", C.violet, C.softViolet);
  await pill(slide, ctx, 94, 410, 244, 38, "Map", "/route: GeoJSON-Linie", C.blue, C.softBlue);
  await pill(slide, ctx, 94, 462, 244, 38, "Server", "OSRM_URL = http://osrm:5000", C.teal, C.softTeal);
  label(slide, ctx, "Ergebnis: keine Luftlinie, sondern Straßenkilometer und Straßenfahrzeit.", 94, 518, 250, 24, {
    size: 11.6,
    bold: true,
    color: C.muted,
  });

  await arrow(slide, ctx, 414, 382);

  shadowCard(slide, ctx, 456, 246, 362, 318, C.white);
  label(slide, ctx, "2 Pro Hub: Depot + Stopps", 482, 268, 250, 24, {
    size: 18,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Knotenliste = Hub als Depot plus alle zugeordneten Apotheken.", 482, 300, 280, 28, {
    size: 12.2,
    color: C.ink2,
  });
  matrix(slide, ctx, 492, 344, "Distanzmatrix d(i,j)", C.blue);
  matrix(slide, ctx, 638, 344, "Zeitmatrix t(i,j)", C.violet);
  formulaBox(
    slide,
    ctx,
    486,
    466,
    296,
    70,
    "nodes = [Depot, Stop_1, ..., Stop_n]\nOSRM /table -> dmat[km], durmat[h]",
    "Input fuer den VRP",
  );

  await arrow(slide, ctx, 834, 382);

  shadowCard(slide, ctx, 876, 246, 338, 318, C.white);
  label(slide, ctx, "3 Zeitquelle im Optimierer", 902, 268, 260, 24, {
    size: 18,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  const items = [
    { n: 1, color: C.blue, fill: C.softBlue, icon: "Gauge", title: "OSRM Free Flow", body: "Basisdauer mit Straßentypen: Stadt, Autobahn, Passstraße." },
    { n: 2, color: C.teal, fill: C.softTeal, icon: "Clock3", title: "Simulation", body: "Tageszeitprofil skaliert freie Fahrzeit, z. B. Berufsverkehr." },
    { n: 3, color: C.red, fill: "#FFF5F5", icon: "RadioTower", title: "TomTom live", body: "Optional: Matrix Routing mit echten aktuellen Fahrzeiten." },
  ];
  for (let i = 0; i < items.length; i += 1) {
    await numberedCard(slide, ctx, { ...items[i], x: 902, y: 310 + i * 74, w: 272, h: 58, bodySize: 9.3, titleSize: 12.5 });
  }
  label(slide, ctx, "Fallback: Wenn TomTom fehlt, bleibt die Tour berechenbar: OSRM-Zeit × Faktor oder Distanz/Geschwindigkeit.", 902, 536, 270, 28, {
    size: 10.5,
    bold: true,
    color: C.muted,
  });
}

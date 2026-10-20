import { C, addIcon, arrow, frame, label, line, numberedCard, shadowCard, title } from "./shared.mjs";

function codeBlock(slide, ctx, x, y, w, h) {
  frame(slide, ctx, x, y, w, h, "#101826", "none", "roundRect");
  label(slide, ctx, "Greedy-Schleife pro Fahrzeug", x + 18, y + 14, w - 36, 16, {
    size: 12.5,
    bold: true,
    color: "#D7E2F1",
    face: ctx.fonts.title,
  });
  label(slide, ctx, [
    "while noch Stopps offen:",
    "  kandidaten = zulässige Stopps",
    "  best = min(score(kandidaten))",
    "  route.append(best)",
    "  update Kapazität, km, Zeit",
    "route.append(Depot)",
  ].join("\n"), x + 18, y + 40, w - 36, h - 48, {
    size: 12,
    bold: true,
    color: C.white,
    face: ctx.fonts.mono,
  });
}

function routeSketch(slide, ctx, x, y, w, h) {
  shadowCard(slide, ctx, x, y, w, h, C.white);
  label(slide, ctx, "Route entsteht iterativ", x + 20, y + 16, w - 40, 20, {
    size: 16.5,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  const box = { x: x + 26, y: y + 58, w: w - 52, h: h - 96 };
  frame(slide, ctx, box.x, box.y, box.w, box.h, "#F7FAFC", "#DDE7F0", "roundRect");
  const pts = [
    { x: box.x + 42, y: box.y + 132, t: "H", c: C.blue, rect: true },
    { x: box.x + 116, y: box.y + 42, t: "1", c: C.teal },
    { x: box.x + 208, y: box.y + 64, t: "2", c: C.teal },
    { x: box.x + 260, y: box.y + 132, t: "3", c: C.amber },
    { x: box.x + 156, y: box.y + 150, t: "4", c: C.teal },
  ];
  for (let i = 0; i < pts.length - 1; i += 1) {
    line(slide, ctx, pts[i], pts[i + 1], i === 2 ? C.amber : C.teal, 3);
  }
  line(slide, ctx, pts[4], pts[0], "#A8B8CB", 3);
  pts.forEach((p) => {
    frame(slide, ctx, p.x - 11, p.y - 11, 22, 22, p.c, "#FFFFFF", p.rect ? "roundRect" : "ellipse");
    label(slide, ctx, p.t, p.x - 9, p.y - 7, 18, 12, { size: 9.5, bold: true, color: C.white, align: "center" });
  });
  label(slide, ctx, "OSRM /route erzeugt am Ende die echte Liniengeometrie für die Karte.", x + 20, y + h - 28, w - 40, 14, {
    size: 10.5,
    color: C.muted,
  });
}

export async function slide03(presentation, ctx) {
  const slide = presentation.slides.add();
  title(
    slide,
    ctx,
    "ROUTENBERECHNUNG",
    "So berechnet der Greedy-VRP eine Fahrzeugtour",
    "Für jeden Hub wird eine eigene Mehrstopp-Tour gebaut. Der Algorithmus prüft erst harte Nebenbedingungen, dann entscheidet der gewichtete Score.",
    C.amber,
    "12",
  );

  const steps = [
    { n: 1, x: 68, y: 246, w: 342, h: 82, color: C.violet, fill: C.softViolet, icon: "MapPin", title: "Depot + Stopps laden", body: "Alle Apotheken, die Step 3 diesem Hub zugeordnet hat, werden als Stopps geladen." },
    { n: 2, x: 68, y: 352, w: 342, h: 82, color: C.teal, fill: C.softTeal, icon: "Filter", title: "Zulässige Kandidaten", body: "Kapazität, Reichweite, Schichtdauer und Öffnungszeiten filtern unzulässige Stopps." },
    { n: 3, x: 68, y: 458, w: 342, h: 94, color: C.amber, fill: C.softAmber, icon: "Calculator", title: "Nächsten Stopp wählen", body: "Für jeden Kandidaten wird das Insertions-Delta berechnet; der kleinste Score wird angefahren." },
  ];
  for (const s of steps) await numberedCard(slide, ctx, s);

  await arrow(slide, ctx, 428, 382);
  codeBlock(slide, ctx, 474, 250, 310, 302);
  await arrow(slide, ctx, 804, 382);
  routeSketch(slide, ctx, 856, 246, 356, 306);

  shadowCard(slide, ctx, 68, 582, 1144, 44, C.softBlue, "#C9DBEC");
  await addIcon(slide, ctx, "Truck", 92, 592, 22, 22, C.blue);
  label(slide, ctx, "Last-Mile: Fahrzeuge mit can_last_mile, gewichtsabhängig sortiert. Backbone: Fahrzeuge mit can_backbone, kapazitätsstark zuerst.", 126, 594, 900, 16, {
    size: 13,
    bold: true,
    color: C.ink2,
  });
}

import { C, addIcon, formulaBox, frame, label, shadowCard, title } from "./shared.mjs";

async function factorCard(slide, ctx, item) {
  shadowCard(slide, ctx, item.x, item.y, item.w, item.h, item.fill, item.border);
  frame(slide, ctx, item.x, item.y, item.w, 7, item.color, "none", "roundRect");
  await addIcon(slide, ctx, item.icon, item.x + 22, item.y + 24, 28, 28, item.color);
  label(slide, ctx, item.title, item.x + 64, item.y + 20, item.w - 88, 26, {
    size: 19,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, item.formula, item.x + 64, item.y + 56, item.w - 88, 32, {
    size: 12.2,
    bold: true,
    color: item.color,
    face: ctx.fonts.mono,
  });
  label(slide, ctx, item.body, item.x + 22, item.y + 104, item.w - 44, 54, {
    size: 12,
    color: C.ink2,
  });
}

function weightBar(slide, ctx, x, y, labelText, pct, color) {
  label(slide, ctx, labelText, x, y, 86, 16, { size: 11.5, bold: true, color: C.ink });
  frame(slide, ctx, x + 96, y + 3, 190, 10, "#E8EEF5", "none", "roundRect");
  frame(slide, ctx, x + 96, y + 3, 190 * pct, 10, color, "none", "roundRect");
  label(slide, ctx, `${Math.round(pct * 100)} %`, x + 298, y - 1, 42, 16, { size: 11.5, bold: true, color });
}

export async function slide02(presentation, ctx) {
  const slide = presentation.slides.add();
  title(
    slide,
    ctx,
    "ROUTENBERECHNUNG",
    "Kosten, Zeit und Umwelt werden als Grenzkosten bewertet",
    "Der Greedy-VRP wählt keinen bloß nächstgelegenen Stopp. Er bewertet, was ein Stopp zusätzlich verursacht: CHF, Stunden und kg CO₂.",
    C.amber,
    "11",
  );

  const cards = [
    {
      x: 68, y: 246, w: 356, h: 174, color: C.blue, fill: C.softBlue, border: "#C9DBEC", icon: "Banknote",
      title: "Kosten",
      formula: "ΔCHF = Δkm·CHF/km + Δh·Lohn/h",
      body: "Kosten kombinieren Betriebskosten der zusätzlichen Strecke mit Fahrerlohn der zusätzlichen Fahrzeit.",
    },
    {
      x: 462, y: 246, w: 356, h: 174, color: C.teal, fill: C.softTeal, border: "#B9E7DF", icon: "Clock3",
      title: "Zeit",
      formula: "Δh = tneu - tbisher",
      body: "Zeit stammt aus OSRM-Straßenzeiten oder TomTom-Live-Matrix. Deshalb kann ein längerer Autobahnweg schneller sein.",
    },
    {
      x: 856, y: 246, w: 356, h: 174, color: C.green, fill: C.softGreen, border: "#B9E7C9", icon: "Leaf",
      title: "Umwelt",
      formula: "ΔCO2 = Δkm·gCO2/km / 1000",
      body: "Emissionen entstehen aus zusätzlicher Straßenstrecke und Fahrzeug-Emissionsfaktor.",
    },
  ];
  for (const card of cards) {
    await factorCard(slide, ctx, card);
  }

  formulaBox(
    slide,
    ctx,
    68,
    454,
    566,
    106,
    "score = wc·norm(ΔCHF) + wt·norm(Δh) + we·norm(ΔCO2)\n\nnorm(...) = Min-Max über alle aktuell zulässigen Kandidaten\nkleiner Score = besserer nächster Stopp",
    "Multi-Objective-Score",
  );

  shadowCard(slide, ctx, 674, 454, 250, 106, C.white);
  label(slide, ctx, "Default-Gewichtung", 698, 472, 190, 18, {
    size: 16,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  weightBar(slide, ctx, 700, 504, "Kosten", 0.40, C.blue);
  weightBar(slide, ctx, 700, 528, "Zeit", 0.35, C.teal);
  weightBar(slide, ctx, 700, 552, "Umwelt", 0.25, C.green);

  shadowCard(slide, ctx, 954, 454, 258, 106, C.softAmber, "#EFD5AA");
  frame(slide, ctx, 954, 454, 7, 106, C.amber);
  label(slide, ctx, "Wichtig", 982, 472, 150, 18, {
    size: 16,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
  });
  label(slide, ctx, "Die Gewichte steuern den nächsten Stopp und zusätzlich die Reihenfolge der Last-Mile-Fahrzeuge.", 982, 500, 196, 42, {
    size: 12.1,
    color: C.ink2,
  });
}

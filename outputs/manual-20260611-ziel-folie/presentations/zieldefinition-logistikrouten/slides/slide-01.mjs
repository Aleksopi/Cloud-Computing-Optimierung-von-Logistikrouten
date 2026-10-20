const C = {
  ink: "#1B2537",
  ink2: "#26384F",
  muted: "#53657A",
  soft: "#F7F9FB",
  white: "#FFFFFF",
  line: "#D9E1EA",
  teal: "#109A8F",
  blue: "#155A92",
  amber: "#D97A00",
  green: "#16A34A",
  paleBlue: "#EAF3FA",
  paleAmber: "#FFF4E3",
  paleGreen: "#EAF8F0",
};

function shape(slide, ctx, x, y, w, h, fill, line = "none", geometry = "rect") {
  return ctx.addShape(slide, {
    x,
    y,
    w,
    h,
    geometry,
    fill,
    line: line === "none" ? ctx.line("#00000000", 0) : ctx.line(line, 1),
  });
}

function text(slide, ctx, value, x, y, w, h, opts = {}) {
  return ctx.addText(slide, {
    text: value,
    x,
    y,
    w,
    h,
    fontSize: opts.size || 18,
    bold: opts.bold || false,
    color: opts.color || C.ink,
    align: opts.align || "left",
    valign: opts.valign || "top",
    typeface: opts.face || ctx.fonts.body,
    insets: opts.insets || { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

function card(slide, ctx, x, y, w, h, accent, fill = C.white) {
  shape(slide, ctx, x + 3, y + 5, w, h, "#D8DEE6", "none", "roundRect");
  shape(slide, ctx, x, y, w, h, fill, C.line, "roundRect");
  shape(slide, ctx, x, y, 7, h, accent, "none");
}

async function objectiveCard(slide, ctx, item) {
  card(slide, ctx, item.x, item.y, item.w, item.h, item.color, item.fill);
  shape(slide, ctx, item.x + 30, item.y + 26, 46, 46, item.color, "none", "ellipse");
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + 41,
    y: item.y + 37,
    w: 24,
    h: 24,
    color: C.white,
    strokeWidth: 2.4,
  });
  text(slide, ctx, item.title, item.x + 96, item.y + 24, item.w - 122, 28, {
    size: 21,
    bold: true,
    color: C.ink,
    face: ctx.fonts.title,
    valign: "middle",
  });
  text(slide, ctx, item.body, item.x + 96, item.y + 62, item.w - 126, 56, {
    size: 14.5,
    color: C.muted,
  });
}

async function inputChip(slide, ctx, item) {
  shape(slide, ctx, item.x, item.y, item.w, 76, C.white, C.line, "roundRect");
  await ctx.addLucideIcon(slide, {
    icon: item.icon,
    x: item.x + 18,
    y: item.y + 20,
    w: 28,
    h: 28,
    color: item.color,
    strokeWidth: 2.2,
  });
  text(slide, ctx, item.title, item.x + 58, item.y + 15, item.w - 74, 24, {
    size: 15.5,
    bold: true,
    color: C.ink,
  });
  text(slide, ctx, item.body, item.x + 58, item.y + 41, item.w - 74, 24, {
    size: 12.5,
    color: C.muted,
  });
}

export async function slide01(presentation, ctx) {
  const slide = presentation.slides.add();

  shape(slide, ctx, 0, 0, ctx.W, ctx.H, C.white);
  shape(slide, ctx, 0, 0, ctx.W, 22, C.soft);

  shape(slide, ctx, 67, 70, 16, 16, C.teal);
  text(slide, ctx, "ZIELDEFINITION", 92, 68, 260, 22, {
    size: 13,
    bold: true,
    color: C.teal,
  });
  text(
    slide,
    ctx,
    "Transportrouten nach Kosten, Zeit und Umwelt optimieren",
    67,
    108,
    850,
    74,
    {
      size: 33,
      bold: true,
      color: C.ink,
      face: ctx.fonts.title,
    },
  );

  shape(slide, ctx, 858, 92, 313, 106, "#F3F7FA", C.line, "roundRect");
  text(slide, ctx, "Erfolg wird messbar in", 883, 111, 250, 22, {
    size: 13,
    bold: true,
    color: C.muted,
  });
  text(slide, ctx, "km · CHF · h · kg CO2", 883, 140, 260, 38, {
    size: 23,
    bold: true,
    color: C.ink2,
    face: ctx.fonts.title,
  });

  card(slide, ctx, 67, 214, 1104, 112, C.teal, "#F7FBFB");
  text(
    slide,
    ctx,
    "Ziel ist ein cloudbasierter Prototyp, der für 400 Schweizer Apotheken realistische Lieferwege berechnet und die beste Route nicht nur nach Strecke, sondern als Abwägung aus Betriebskosten, Fahrzeit und CO2-Ausstoß auswählt.",
    104,
    242,
    1030,
    60,
    {
      size: 20,
      bold: true,
      color: C.ink,
      face: ctx.fonts.title,
      valign: "middle",
    },
  );

  const objectives = [
    {
      x: 67,
      y: 374,
      w: 342,
      h: 136,
      color: C.blue,
      fill: C.paleBlue,
      icon: "CircleDollarSign",
      title: "Kosten senken",
      body: "Routen minimieren Kilometer, Fahrzeugkosten und Fahrerzeit.",
    },
    {
      x: 449,
      y: 374,
      w: 342,
      h: 136,
      color: C.amber,
      fill: C.paleAmber,
      icon: "Clock3",
      title: "Zeit reduzieren",
      body: "Fahrzeiten werden auf realen Straßenabschnitten bewertet.",
    },
    {
      x: 829,
      y: 374,
      w: 342,
      h: 136,
      color: C.green,
      fill: C.paleGreen,
      icon: "Leaf",
      title: "Umwelt entlasten",
      body: "CO2-Emissionen fließen als eigene Zielgröße in den Score ein.",
    },
  ];
  for (const item of objectives) {
    await objectiveCard(slide, ctx, item);
  }

  text(slide, ctx, "Berücksichtigt werden als harte Eingangsgrößen", 68, 556, 530, 24, {
    size: 17,
    bold: true,
    color: C.ink,
  });

  const inputs = [
    {
      x: 67,
      y: 592,
      w: 342,
      icon: "Route",
      color: C.blue,
      title: "Entfernung",
      body: "echte OSRM-Straßendistanzen",
    },
    {
      x: 449,
      y: 592,
      w: 342,
      icon: "Gauge",
      color: C.amber,
      title: "Verkehr",
      body: "reale Fahrzeiten und Live-Traffic",
    },
    {
      x: 829,
      y: 592,
      w: 342,
      icon: "Truck",
      color: C.green,
      title: "Transportkapazität",
      body: "Fahrzeug- und Hub-Kapazitäten",
    },
  ];
  for (const item of inputs) {
    await inputChip(slide, ctx, item);
  }

  shape(slide, ctx, 67, 694, 1104, 1, "#D9E1EA");
  text(slide, ctx, "Optimierung von Logistikrouten", 67, 699, 360, 14, {
    size: 10,
    color: "#53657A",
  });
  text(slide, ctx, "01", 1135, 699, 36, 14, {
    size: 10,
    color: "#53657A",
    align: "right",
  });

  slide.speakerNotes.setText(
    "Diese Folie definiert das Ziel: Der Prototyp berechnet realistische Lieferwege für 400 Schweizer Apotheken. Optimiert wird nicht nur nach kürzester Strecke, sondern nach einer Abwägung aus Kosten, Zeit und CO2. Entfernung, Verkehr und Kapazität sind dabei Eingangsgrößen und Restriktionen, der Erfolg wird quantitativ in Kilometern, CHF, Stunden und kg CO2 gemessen.",
  );
  return slide;
}

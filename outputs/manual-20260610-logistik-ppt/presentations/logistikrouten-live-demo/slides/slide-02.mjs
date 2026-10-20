import { C, bg, title, footer, card, label, metric, bulletList, notes } from "./theme.mjs";

export async function slide02(presentation, ctx) {
  const slide = presentation.slides.add();
  bg(slide, ctx);
  title(slide, ctx, "Motivation", "Warum Routenplanung nicht per Bauchgefühl funktioniert", "Kosten, Zeit und Umwelt ziehen in unterschiedliche Richtungen.");

  metric(slide, ctx, "Kosten", "Fahrerlohn, Fahrzeug, Strecke", 86, 198, 210, C.blue);
  metric(slide, ctx, "Zeit", "Fahrzeit, Schicht, Servicefenster", 326, 198, 236, C.amber);
  metric(slide, ctx, "CO₂", "Emissionen je Fahrzeug und km", 592, 198, 210, C.green);
  metric(slide, ctx, "Skala", "400 Stopps, echte Straßenzeiten", 832, 198, 270, C.red);

  card(slide, ctx, 86, 350, 500, 230, { fill: C.white });
  label(slide, ctx, "Ausgangsproblem", 112, 374, 440, 30, { fontSize: 22, bold: true, color: C.ink });
  bulletList(
    slide,
    ctx,
    [
      "Direktfahrten erzeugen viele leere Rückwege",
      "Stadtverkehr und Alpenstrecken verzerren Luftlinien",
      "Hub- und Fahrzeugkapazitäten begrenzen jede Lösung",
    ],
    114,
    426,
    420,
    { fontSize: 16, gap: 45, dot: C.red },
  );

  card(slide, ctx, 660, 350, 430, 230, { fill: C.paleTeal, line: "#B9DFD8" });
  label(slide, ctx, "Ziel der Anwendung", 690, 374, 360, 30, { fontSize: 22, bold: true, color: C.teal });
  label(
    slide,
    ctx,
    "Eine reproduzierbare Pipeline berechnet Nachfrage, optimale Hub-Standorte, Einzugsgebiete und Fahrzeugrouten. Der Nutzen wird als Einsparung gegenüber Einzelfahrten ausgewiesen.",
    690,
    424,
    350,
    120,
    { fontSize: 18, color: C.ink },
  );

  footer(slide, ctx, 2);
  notes(slide, "Motivation: Die Kernidee ist nicht nur kürzere Strecken zu finden. Das System bewertet Kosten, Zeit und CO₂ gemeinsam und muss gleichzeitig mit realen Restriktionen umgehen.");
  return slide;
}

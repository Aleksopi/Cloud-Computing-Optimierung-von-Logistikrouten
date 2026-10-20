import path from "node:path";

import * as artifact from "@oai/artifact-tool";
import {
  createSlideContext,
  saveBlobToFile,
} from "/Users/aleksferro/.codex/plugins/cache/openai-primary-runtime/presentations/26.601.10930/skills/presentations/scripts/artifact_tool_utils.mjs";

import { slide01 } from "./slides/slide-01.mjs";

const workspace = path.resolve("outputs/manual-20260611-apotheken-folie/presentations/anwendungsfall-apotheken");
const input = path.resolve("docs/Praesentation_Routenoptimierung.pptx");
const output = path.resolve("docs/Praesentation_Routenoptimierung_Apothekenfokus.pptx");
const preview = path.resolve("outputs/manual-20260611-apotheken-folie/presentations/anwendungsfall-apotheken/preview/deck-slide-03.png");

const { FileBlob, PresentationFile } = artifact;
const presentation = await PresentationFile.importPptx(await FileBlob.load(input));

presentation.slides.remove(2);

const ctx = createSlideContext(artifact, {
  slideSize: { width: 1280, height: 720 },
  slideNumber: 3,
  outputDir: path.dirname(output),
  assetDir: path.join(workspace, "assets"),
  workspaceDir: workspace,
});

const newSlide = await slide01(presentation, ctx);
newSlide.moveTo(2);

await saveBlobToFile(await presentation.export({ slide: newSlide, format: "png", scale: 1 }), preview);

const pptx = await PresentationFile.exportPptx(presentation);
await pptx.save(output);

console.log(JSON.stringify({ input, output, preview, slideCount: presentation.slides.count }, null, 2));

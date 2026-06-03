import "dotenv/config";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.FAL_KEY;
if (!KEY) { console.error("FAL_KEY not set"); process.exit(1); }

const PROMPT =
  "A minimalist modern app logo icon for an autonomous AI commerce platform. " +
  "A single clean geometric mark: two abstract chevrons meeting at a central diamond, " +
  "suggesting two agents exchanging value. Flat vector style, deep electric blue (#3F6DF6) " +
  "to soft violet gradient, plain white background, no text, no letters, centered, " +
  "generous negative space, crisp, high-contrast, premium fintech app icon.";

async function main() {
  console.log("Generating logo via fal-ai/flux/schnell…");
  const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: PROMPT, image_size: "square_hd", num_inference_steps: 4, num_images: 1 }),
  });
  if (!res.ok) { console.error("fal error", res.status, await res.text()); process.exit(1); }
  const data: any = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) { console.error("no image url", JSON.stringify(data).slice(0, 300)); process.exit(1); }
  console.log("image url:", url);
  const img = Buffer.from(await (await fetch(url)).arrayBuffer());
  const out = path.join(__dirname, "../public/logo.png");
  writeFileSync(out, img);
  console.log("saved →", out, `(${img.length} bytes)`);
}
main().catch((e) => { console.error(e); process.exit(1); });

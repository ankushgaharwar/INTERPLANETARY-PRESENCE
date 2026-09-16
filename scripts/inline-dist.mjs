import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const indexPath = path.join(distDir, "index.html");
const outputPath = path.join(distDir, "standalone.html");

const inlineAsset = async (html, tagPattern, replacer) => {
  let output = html;
  const matches = [...html.matchAll(tagPattern)];

  for (const match of matches) {
    const [fullMatch, assetPath] = match;
    const asset = await readFile(path.join(distDir, assetPath), "utf8");
    output = output.replace(fullMatch, () => replacer(asset));
  }

  return output;
};

await mkdir(distDir, { recursive: true });

let html = await readFile(indexPath, "utf8");
html = await inlineAsset(
  html,
  /<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g,
  (asset) => `<style>${asset}</style>`
);
html = await inlineAsset(
  html,
  /<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g,
  (asset) => `<script type="module">${asset.replaceAll("</script", "<\\/script")}</script>`
);

await writeFile(outputPath, html, "utf8");
console.log(`Standalone file written to ${outputPath}`);

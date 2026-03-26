/*
  scripts/import-lambasingi.mjs

  IMPORTANT (copyright/permission):
  - This script fetches pages from https://www.lambasingifpo.com to help YOU
    create a local dataset for this static catalog.
  - Run it only if you have permission to reuse the product info/images.

  What it does:
  - Crawls category product pages (millets/spices/naturals/groceries/pickles)
  - Collects product page URLs
  - Extracts: id (slug-based), name, image (first reasonable img), category
  - Leaves description/ingredients/shelf_life empty by default
  - Writes lambasingi-products.json in the repo root

  Usage:
    node scripts/import-lambasingi.mjs

  Then:
    - Review lambasingi-products.json
    - Copy/merge into products.js as needed
*/

import fs from "node:fs";
import path from "node:path";

const BASE = "https://www.lambasingifpo.com";
const CATEGORY_PAGES = [
  { key: "Millets", url: `${BASE}/categories/millets/products` },
  { key: "Spices", url: `${BASE}/categories/spices/products` },
  { key: "Naturals", url: `${BASE}/categories/naturals/products` },
  { key: "Groceries", url: `${BASE}/categories/groceries/products` },
  { key: "Pickles", url: `${BASE}/categories/pickles/products` },
];

function normalizeSpace(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function absoluteUrl(u) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("/")) return `${BASE}${u}`;
  return `${BASE}/${u}`;
}

function extractProductLinks(html) {
  const links = new Set();
  const re = /href\s*=\s*"([^"]*\/products\/[^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const u = absoluteUrl(m[1]);
    if (u.includes("/products/")) links.add(u);
  }
  return Array.from(links);
}

function extractFirstImage(html) {
  // Heuristic: pick the first <img ... src="..."> that points to storage/media
  // or looks like a product image.
  const candidates = [];
  const re = /<img[^>]+src\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = absoluteUrl(m[1]);
    if (!src) continue;
    // Skip tiny icons / sprite-ish assets.
    if (src.includes("data:image")) continue;
    candidates.push(src);
  }

  const preferred = candidates.find((u) => u.includes("/storage/media/"));
  return preferred || candidates[0] || "";
}

function extractTitle(html) {
  // Try <h1> first.
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return normalizeSpace(h1[1].replace(/<[^>]*>/g, ""));

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) {
    const t = normalizeSpace(title[1].replace(/<[^>]*>/g, ""));
    // Many sites use "Product | Site"; keep left side.
    return normalizeSpace(t.split("|")[0]);
  }

  return "";
}

function slugToId(slug) {
  // Deterministic id from slug (safe for URL params)
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "ICMR-Millets-Catalog-Importer/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  return await res.text();
}

async function main() {
  const productUrlsByCategory = new Map();

  for (const cat of CATEGORY_PAGES) {
    const html = await fetchText(cat.url);
    const links = extractProductLinks(html);
    productUrlsByCategory.set(cat.key, links);
    console.log(`${cat.key}: found ${links.length} product links`);
  }

  // De-dupe while keeping first category.
  const seen = new Set();
  const queue = [];
  for (const [category, links] of productUrlsByCategory.entries()) {
    for (const u of links) {
      if (seen.has(u)) continue;
      seen.add(u);
      queue.push({ url: u, category });
    }
  }

  const out = [];
  for (let i = 0; i < queue.length; i++) {
    const { url, category } = queue[i];
    const slug = url.split("/products/")[1]?.split(/[?#]/)[0] || url;

    let html;
    try {
      html = await fetchText(url);
    } catch (e) {
      console.warn(`Skip (fetch failed): ${url}`);
      continue;
    }

    const name = extractTitle(html) || normalizeSpace(slug.replace(/-/g, " "));
    const image = extractFirstImage(html);

    out.push({
      id: slugToId(slug),
      name,
      image,
      weight: "",
      category,
      millet_type: category === "Millets" ? "Millets" : "Other",
      fpo_name: "Lambasingi Tribal Products FPC Ltd",
      fpo_location: "Chintapalli Mandal, ASR District, Andhra Pradesh",
      contact: "",
      description: "",
      ingredients: "",
      shelf_life: "",
      source_url: url,
    });

    if ((i + 1) % 10 === 0) {
      console.log(`Processed ${i + 1}/${queue.length}`);
    }
  }

  const repoRoot = path.resolve(process.cwd());
  const outPath = path.join(repoRoot, "lambasingi-products.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

  console.log(`\nWrote ${out.length} products to: ${outPath}`);
  console.log(
    "Next: review the JSON, then merge into products.js (and add contact numbers)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

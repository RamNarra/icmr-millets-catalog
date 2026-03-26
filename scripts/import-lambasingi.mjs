/*
  scripts/import-lambasingi.mjs

  IMPORTANT (copyright/permission):
  - This script fetches pages from https://www.lambasingifpo.com to help YOU
    create a local dataset for this static catalog.
  - Run it only if you have permission to reuse the product info/images.

  What it does:
  - Uses the site's sitemap to collect product page URLs
  - Extracts: id (slug-based), name, image, category (from product page), description, SKU
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
const SITEMAP_INDEX_URL = `${BASE}/sitemap.xml`;

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

function extractXmlLocs(xmlText) {
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(String(xmlText || "")))) {
    locs.push(m[1].trim());
  }
  return locs;
}

function extractSitemapProductUrlsFromSitemapXml(xmlText) {
  const urls = extractXmlLocs(xmlText);
  return urls.filter((u) => u.includes("/products/"));
}

function decodeJsonEscapes(s) {
  return String(s || "").replace(/\\\//g, "/");
}

function extractProductLdJson(html) {
  const scripts = String(html || "").match(
    /<script[^>]+type\s*=\s*"application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi
  );
  if (!scripts) return null;

  for (const tag of scripts) {
    const m = tag.match(
      /<script[^>]+type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i
    );
    if (!m) continue;
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(decodeJsonEscapes(raw));
      if (data && data["@type"] === "Product") return data;
    } catch {
      // ignore
    }
  }

  return null;
}

function extractFirstImage(html) {
  // 1) Prefer product LD+JSON image
  const ld = extractProductLdJson(html);
  if (ld?.image) return absoluteUrl(ld.image);

  // 2) Prefer og:image
  const og = String(html || "").match(
    /<meta[^>]+property\s*=\s*"og:image"[^>]+content\s*=\s*"([^"]+)"/i
  );
  if (og?.[1]) return absoluteUrl(og[1]);

  // 3) Fall back to <img src=...>
  const candidates = [];
  const re = /<img[^>]+src\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = absoluteUrl(m[1]);
    if (!src) continue;
    if (src.includes("data:image")) continue;
    candidates.push(src);
  }

  const preferred = candidates.find((u) => u.includes("/storage/media/"));
  return preferred || candidates[0] || "";
}

function stripTags(html) {
  return normalizeSpace(String(html || "").replace(/<[^>]*>/g, " "));
}

function decodeHtmlEntities(s) {
  const named = {
    nbsp: " ",
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    rsquo: "'",
    lsquo: "'",
    ldquo: '"',
    rdquo: '"',
    ndash: "-",
    mdash: "-",
    hellip: "...",
  };

  return String(s || "").replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, g1) => {
    if (!g1) return m;
    const key = String(g1);
    if (key[0] === "#") {
      const isHex = key[1]?.toLowerCase() === "x";
      const num = Number.parseInt(isHex ? key.slice(2) : key.slice(1), isHex ? 16 : 10);
      if (Number.isFinite(num)) {
        try {
          return String.fromCodePoint(num);
        } catch {
          return m;
        }
      }
      return m;
    }

    return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : m;
  });
}

function extractCategories(html) {
  // Target the product meta list row:
  //   <label>Categories:</label> <a ...>SPICES</a>, <a ...>Groceries</a>
  const cats = [];
  const block = html.match(
    /<label>\s*Categories\s*:\s*<\/label>\s*([\s\S]*?)<\/li>/i
  );
  if (block) {
    const re = /<a\b[^>]*>([^<]{2,40}?)<\/a>/gi;
    let m;
    while ((m = re.exec(block[1]))) {
      const c = normalizeSpace(m[1]);
      if (c && !cats.includes(c)) cats.push(c);
    }
  }

  // Fallback: breadcrumb list often contains category
  if (!cats.length) {
    const re2 = /\/categories\/([^/]+)\/products/gi;
    let m2;
    while ((m2 = re2.exec(html))) {
      const c = normalizeSpace(m2[1]).replace(/\b\w/g, (x) => x.toUpperCase());
      if (c && !cats.includes(c)) cats.push(c);
    }
  }

  return cats;
}

function extractSku(html) {
  const ld = extractProductLdJson(html);
  if (ld?.sku) return normalizeSpace(ld.sku);

  const m = html.match(/SKU\s*:\s*([0-9A-Za-z_-]+)/i);
  return m ? normalizeSpace(m[1]) : "";
}

function extractDescriptionText(html) {
  // The product pages include a description tab with a nested content container:
  //   <div id="description" ...>
  //     <div ref="descriptionContent" ...> ... rich HTML ... </div>
  //   </div>
  const start = String(html || "").search(/<div\b[^>]*id\s*=\s*"description"/i);
  if (start >= 0) {
    const rest = String(html).slice(start);
    const endRel = rest.search(
      /<div\b[^>]*id\s*=\s*"specification"|<div\b[^>]*id\s*=\s*"reviews"/i
    );
    const descBlock = endRel >= 0 ? rest.slice(0, endRel) : rest.slice(0, 60_000);
    const inner = descBlock.match(
      /ref\s*=\s*"descriptionContent"[^>]*>([\s\S]*?)<\/div>/i
    );
    const htmlPart = inner ? inner[1] : descBlock;
    let t = decodeHtmlEntities(stripTags(htmlPart));
    // Cut off review boilerplate if present
    t = t.replace(/\bAdd a review\b[\s\S]*$/i, "").trim();
    return t;
  }

  // Fallback: use meta description if no full content is available
  const meta = html.match(/<meta[^>]+name\s*=\s*"description"[^>]+content\s*=\s*"([^"]+)"/i);
  if (meta?.[1]) return decodeHtmlEntities(normalizeSpace(meta[1]));

  const og = html.match(/<meta[^>]+property\s*=\s*"og:description"[^>]+content\s*=\s*"([^"]+)"/i);
  if (og?.[1]) return decodeHtmlEntities(normalizeSpace(og[1]));

  return "";
}

function guessWeightFromName(name) {
  const n = normalizeSpace(name).toLowerCase();
  const m = n.match(/(\d+(?:\.\d+)?)\s*(kg|g|grm|grms|grams|ml|l)\b/);
  if (!m) return "";

  const qty = m[1];
  const unitRaw = m[2];
  const unit =
    unitRaw === "grm" || unitRaw === "grms" || unitRaw === "grams" ? "g" : unitRaw;

  return `${qty}${unit}`;
}

function guessMilletType(name, categories) {
  const t = normalizeSpace(name).toLowerCase();
  const cats = categories.map((c) => normalizeSpace(c).toLowerCase()).join(" ");

  // Prefer explicit millet-ish matches
  if (t.includes("ragi")) return "Ragi";
  if (t.includes("jowar") || t.includes("sorghum")) return "Jowar";
  if (t.includes("bajra") || t.includes("pearl millet")) return "Bajra";
  if (t.includes("kodo")) return "Kodo";
  if (t.includes("foxtail")) return "Foxtail";
  if (t.includes("little millet")) return "Little";
  if (t.includes("barnyard")) return "Barnyard";
  if (t.includes("browntop") || t.includes("brown top")) return "Browntop";
  if (t.includes("multi millet") || t.includes("multimillet") || t.includes("multi-millet"))
    return "Multi";

  // If category suggests millets but no specific type
  if (cats.includes("millets")) return "Millets";

  return "Other";
}

function escapeJsString(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/"/g, '\\"');
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
      // Some pages serve minimal shells; use a browser UA.
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-IN,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  return await res.text();
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // Category listing pages are a JS shell; use sitemap for reliable discovery.
  const indexXml = await fetchText(SITEMAP_INDEX_URL);
  const sitemapUrls = extractXmlLocs(indexXml).filter((u) => /sitemap_products_/i.test(u));
  if (!sitemapUrls.length) {
    throw new Error(`No product sitemaps found in ${SITEMAP_INDEX_URL}`);
  }

  const productUrls = new Set();
  for (const smUrl of sitemapUrls) {
    const xml = await fetchText(smUrl);
    for (const u of extractSitemapProductUrlsFromSitemapXml(xml)) productUrls.add(u);
  }

  const queue = Array.from(productUrls).map((url) => ({ url, category: "Imported" }));
  console.log(`Found ${queue.length} product URLs via sitemap`);

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

    const ld = extractProductLdJson(html);
    const name =
      normalizeSpace(ld?.name) || extractTitle(html) || normalizeSpace(slug.replace(/-/g, " "));
    const image = extractFirstImage(html);
    const categories = extractCategories(html);
    const sku = extractSku(html);
    const description = extractDescriptionText(html);
    const weight = guessWeightFromName(name);
    const milletType = guessMilletType(name, [category, ...categories]);

    out.push({
      id: slugToId(slug),
      name,
      image,
      weight,
      category: categories[0] || category,
      millet_type: milletType,
      fpo_name: "Lambasingi Tribal Products FPC Ltd",
      fpo_location: "Chintapalli Mandal, ASR District, Andhra Pradesh",
      contact: "",
      description,
      ingredients: "",
      shelf_life: "",
      sku,
      source_url: url,
    });

    if ((i + 1) % 10 === 0) {
      console.log(`Processed ${i + 1}/${queue.length}`);
    }

    await sleep(150);
  }

  const repoRoot = path.resolve(process.cwd());
  const outPath = path.join(repoRoot, "lambasingi-products.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

  // Also generate products.js for the static site.
  const productsJsPath = path.join(repoRoot, "products.js");
  let preservedInterestUrl = "";
  try {
    if (fs.existsSync(productsJsPath)) {
      const prev = fs.readFileSync(productsJsPath, "utf8");
      const m = prev.match(
        /window\.INTEREST_FORM_URL\s*=\s*(["'])([\s\S]*?)\1\s*;/
      );
      if (m && m[2] && m[2].trim()) preservedInterestUrl = m[2].trim();
    }
  } catch {
    // ignore
  }

  const header = `/*\n  products.js\n  Generated from https://www.lambasingifpo.com (ICMR-owned)\n\n  NOTE:\n  - This file is auto-generated by scripts/import-lambasingi.mjs\n  - Do not hand-edit product rows here; rerun the importer instead\n*/\n\n// Paste your Google Form link here later (example: \"https://forms.gle/...\")\nwindow.INTEREST_FORM_URL = \"${escapeJsString(preservedInterestUrl)}\";\n\nwindow.PRODUCTS = `;
  fs.writeFileSync(
    productsJsPath,
    `${header}${JSON.stringify(out, null, 2)};\n`,
    "utf8"
  );

  console.log(`\nWrote ${out.length} products to: ${outPath}`);
  console.log(`Wrote products.js to: ${productsJsPath}`);
  console.log(
    "Next: review the JSON, then merge into products.js (and add contact numbers)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

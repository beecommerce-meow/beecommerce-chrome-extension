// content.js - Improved scraping with better selectors and data extraction

const DEFAULT_APP_BASE = "https://bee-commerce-78532760.base44.app";

// ---- Helpers ----
function hostname() {
  return (location.hostname || "").toLowerCase();
}

function inferSupplier(host) {
  if (host.includes("aliexpress")) return "AliExpress";
  if (host.includes("amazon")) return "Amazon";
  if (host.includes("makro.pro")) return "Makro";
  if (host.includes("lotus")) return "Lotus";
  if (host.includes("shopee")) return "Shopee";
  if (host.includes("walmart")) return "Walmart";
  if (host.includes("costco")) return "Costco";
  if (host.includes("lazada")) return "Lazada";
  if (host.includes("ebay")) return "eBay";
  if (host.includes("bigc")) return "BigC";
  return "Unknown";
}

function pickText(selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      const t = el?.textContent?.trim();
      if (t && t.length > 2) return t;
    } catch (e) {
      console.warn(`Selector failed: ${sel}`, e);
    }
  }
  return "";
}

function pickAllText(selectors) {
  const results = [];
  for (const sel of selectors) {
    try {
      document.querySelectorAll(sel).forEach(el => {
        const t = el?.textContent?.trim();
        if (t && t.length > 2) results.push(t);
      });
    } catch (e) {
      console.warn(`Selector failed: ${sel}`, e);
    }
  }
  return results;
}

function pickMeta(nameOrProp) {
  try {
    const el =
      document.querySelector(`meta[property="${nameOrProp}"]`) ||
      document.querySelector(`meta[name="${nameOrProp}"]`);
    return el?.getAttribute("content")?.trim() || "";
  } catch (e) {
    return "";
  }
}

function normalizePrice(raw) {
  if (!raw) return null;
  
  // Remove currency symbols and non-numeric characters except . and ,
  const cleaned = raw.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;

  let s = cleaned;
  
  // Handle different decimal separators
  if (s.includes(",") && s.includes(".")) {
    // Determine which is decimal separator based on position
    if (s.lastIndexOf(".") > s.lastIndexOf(",")) {
      // Dot is decimal separator (e.g., 1,234.56)
      s = s.replace(/,/g, "");
    } else {
      // Comma is decimal separator (e.g., 1.234,56)
      s = s.replace(/\./g, "").replace(",", ".");
    }
  } else if (s.includes(",") && !s.includes(".")) {
    const parts = s.split(",");
    if (parts.length > 2) {
      // Comma is thousands separator (e.g., 1,234,567)
      s = s.replace(/,/g, "");
    } else if (parts[1]?.length <= 2) {
      // Comma is decimal separator (e.g., 12,50)
      s = s.replace(",", ".");
    } else {
      // Comma is thousands separator (e.g., 1,234)
      s = s.replace(/,/g, "");
    }
  }

  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function uniqueUrls(arr) {
  const out = [];
  const seen = new Set();
  for (const u of arr) {
    const s = String(u || "").trim();
    if (!s) continue;
    if (s.startsWith("data:")) continue;
    if (s.toLowerCase().endsWith(".svg")) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

// ---- Enhanced Image Detection ----
function getProductImages() {
  const host = hostname();

  // Amazon: pull true product gallery images (hi-res) from Amazon-specific attributes.
  // Kept strictly inside getProductImages() so other sites are not affected.
  function amazonNormalizeHiRes(url) {
    const u = String(url || "").trim();
    if (!u) return "";
    // Remove Amazon size/crop suffix like: ._AC_SX679_.jpg or ._SX38_SY50_CR,0,0,38,50_.jpg
    // Example: https://.../81abc._AC_SX679_.jpg  -> https://.../81abc.jpg
    return u.replace(/\._[^.]+\.(jpg|jpeg|png|webp)(\?.*)?$/i, ".$1$2");
  }

  function extractAmazonDynamicImages() {
    if (!host.includes("amazon")) return [];
    const out = [];

    // 1) landingImage / imgTagWrapperId (main image) + its hi-res
    const landing = document.querySelector("#landingImage") || document.querySelector("#imgTagWrapperId img");

    const landingSrc = landing?.currentSrc || landing?.src || landing?.getAttribute?.("src") || "";
    if (landingSrc) out.push(amazonNormalizeHiRes(landingSrc));

    const dyn = landing?.getAttribute?.("data-a-dynamic-image");
    if (dyn) {
      try {
        const obj = JSON.parse(dyn);
        // Keys are URLs, values are [w,h]
        for (const k of Object.keys(obj || {})) {
          const hi = amazonNormalizeHiRes(k);
          if (hi) out.push(hi);
        }
      } catch {}
    }

    // 2) Some pages store old-hires on the image element
    const oldHires = landing?.getAttribute?.("data-old-hires") || landing?.dataset?.oldHires;
    if (oldHires) out.push(amazonNormalizeHiRes(oldHires));

    // 3) Thumbnails area (#altImages) contains the gallery thumbnails
    const altImgs = Array.from(document.querySelectorAll("#altImages img"));
    for (const img of altImgs) {
      const src = img.currentSrc || img.src || img.getAttribute("src") || "";
      if (src) out.push(amazonNormalizeHiRes(src));

      const ss = img.getAttribute("srcset") || img.dataset?.srcset || "";
      if (ss) {
        // grab the largest srcset candidate
        const best = ss
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
          .map(s => {
            const [u2, w2] = s.split(/\s+/);
            const w = Number(String(w2 || "").replace("w", "")) || 0;
            return { u: u2, w };
          })
          .sort((a, b) => b.w - a.w)[0]?.u;
        if (best) out.push(amazonNormalizeHiRes(best));
      }
    }

    return uniqueUrls(out).filter(Boolean);
  }

  // Helpers
  const BAD_SECTION_RE = /(recommend|related|suggest|similar|also\s*bought|you\s*may\s*like|sponsored|cross[-\s]?sell|upsell|recommended|similar\s*items)/i;
  const UGC_SECTION_RE = (host.includes("amazon") || host.includes("shopee"))
    ? /(review|reviews|comment|comments|rating|ratings|feedback|customer\s*images|customer\s*reviews|questions|answers|q&a|ugc|community|see\s*all\s*reviews)/i
    : null;

  function isInBadSection(el) {
    let cur = el;
    for (let i = 0; i < 12 && cur; i++) {
      try {
        const id = (cur.id || "");
        const cls = (typeof cur.className === "string" ? cur.className : "");
        const aria = (cur.getAttribute && (cur.getAttribute("aria-label") || cur.getAttribute("aria-labelledby") || "")) || "";
        const role = (cur.getAttribute && (cur.getAttribute("role") || "")) || "";
        const txt = (cur.textContent || "").slice(0, 140);
        const hay = `${id} ${cls} ${aria} ${role} ${txt}`;
        if (BAD_SECTION_RE.test(hay)) return true;
        if (UGC_SECTION_RE && UGC_SECTION_RE.test(hay)) return true;
      } catch {}
      cur = cur.parentElement;
    }
    return false;
  }

  function normalizeUrl(u) {
    try {
      return new URL(u, location.href).href;
    } catch {
      return String(u || "").trim();
    }
  }

  function bestFromSrcset(srcset) {
    try {
      const parts = String(srcset || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => {
          const [url, size] = s.split(/\s+/);
          const w = Number(String(size || "").replace("w", "")) || 0;
          return { url, w };
        })
        .sort((a, b) => b.w - a.w);
      return parts[0]?.url || "";
    } catch {
      return "";
    }
  }

  function getImgSrc(img) {
    const ds = img?.dataset || {};
    const src =
      img.currentSrc ||
      img.src ||
      ds.src ||
      ds.original ||
      ds.zoom ||
      bestFromSrcset(img.getAttribute("srcset")) ||
      bestFromSrcset(ds.srcset) ||
      "";
    if (!src) return "";
    if (src.startsWith("data:")) return "";
    if (src.toLowerCase().endsWith(".svg")) return "";
    return normalizeUrl(src);
  }

  function looksLikeLogoOrIcon(img) {
    const alt = (img.alt || "").toLowerCase();
    const cls = (typeof img.className === "string" ? img.className : "").toLowerCase();
    const id = (img.id || "").toLowerCase();
    const src = (img.currentSrc || img.src || "").toLowerCase();
    return (
      alt.includes("logo") || alt.includes("icon") ||
      cls.includes("logo") || cls.includes("icon") ||
      id.includes("logo") || id.includes("icon") ||
      src.includes("logo") || src.includes("sprite")
    );
  }

  // 0) Start with og:image if present (often main)
  const urls = [];
  const seen = new Set();

  // ✅ Amazon-only: prefer gallery images from Amazon's own metadata (prevents review/comment images)
  if (host.includes("amazon")) {
    for (const u of extractAmazonDynamicImages()) {
      const s = String(u || "").trim();
      if (!s) continue;
      if (s.startsWith("data:")) continue;
      if (s.toLowerCase().endsWith(".svg")) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      urls.push(s);
      if (urls.length >= 10) break;
    }
  }
  const og = pickMeta("og:image");
  if (og && !og.toLowerCase().includes("logo")) {
    const u = normalizeUrl(og);
    if (u && !seen.has(u)) { seen.add(u); urls.push(u); }
  }

  // 1) Find main image (largest visible product image near top)
  const imgs = Array.from(document.querySelectorAll("img"));
  const vpH = window.innerHeight || 800;
  const vpW = window.innerWidth || 1200;

  function scoreMain(img) {
    if (!img) return -1;
    if (looksLikeLogoOrIcon(img)) return -1;
    if (isInBadSection(img)) return -1;

    const src = getImgSrc(img);
    if (!src) return -1;

    const rect = img.getBoundingClientRect();
    // Keep within first ~2.5 screens vertically
    if (rect.bottom < 0 || rect.top > vpH * 2.5) return -1;

    const w = rect.width || img.naturalWidth || 0;
    const h = rect.height || img.naturalHeight || 0;
    if (w < 180 || h < 180) return -1;

    const area = w * h;
    // Prefer images closer to top/center
    const topPenalty = Math.max(0, rect.top) * 4;
    const centerPenalty = Math.abs((rect.left + rect.width / 2) - (vpW / 2)) * 0.5;
    return area - topPenalty - centerPenalty;
  }

  let mainImg = null;
  let best = -1;
  for (const img of imgs) {
    const sc = scoreMain(img);
    if (sc > best) { best = sc; mainImg = img; }
  }

  // 2) If still no main image, try site-specific selectors quickly
  if (!mainImg) {
    const siteSpecificSelectors = {
      aliexpress: [".product-image img", ".image-view-item img", "[class*='magnifier'] img", "[class*='ProductImage'] img"],
      amazon: ["#imgTagWrapperId img", "#landingImage", "#imgBlkFront", "#main-image", "[data-a-dynamic-image] img"],
      shopee: ["[class*='product'] [class*='image'] img", "[class*='product-image'] img", "img[class*='_' i]"],
      makro: [".product-gallery img", "[class*='ProductImage'] img", ".image-zoom img"],
      walmart: ["[data-testid='hero-image-container'] img", ".prod-hero-image img", "[class*='ProductImage'] img"],
      bigc: ["[class*='product'] img", "[class*='gallery'] img", "[id*='product'] img", "[id*='image'] img"]
    };

    let selectors = [];
    if (host.includes("aliexpress")) selectors = siteSpecificSelectors.aliexpress;
    else if (host.includes("amazon")) selectors = siteSpecificSelectors.amazon;
    else if (host.includes("shopee")) selectors = siteSpecificSelectors.shopee;
    else if (host.includes("makro")) selectors = siteSpecificSelectors.makro;
    else if (host.includes("walmart")) selectors = siteSpecificSelectors.walmart;
    else if (host.includes("bigc")) selectors = siteSpecificSelectors.bigc;

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && scoreMain(el) > -1) { mainImg = el; break; }
    }
  }

  // 3) Build a "gallery container" near main image, then collect 5-10 images from it.
  function pickGalleryContainer(img) {
    if (!img) return null;

    // Site-specific: Amazon / Shopee - keep images only in the main gallery area
    if (host.includes("amazon")) {
      const cands = [
        img.closest("#imageBlock") ||
          img.closest("#imageBlock_feature_div") ||
          img.closest("#imgTagWrapperId") ||
          img.closest("#leftCol"),
        document.querySelector("#imageBlock"),
        document.querySelector("#imageBlock_feature_div"),
        document.querySelector("#leftCol"),
        document.querySelector("#altImages")
      ].filter(Boolean);

      // Prefer a container that is near the top (avoid reviews)
      for (const c of cands) {
        const r = c.getBoundingClientRect?.();
        if (r && r.top > (window.innerHeight || 800) * 1.7) continue;
        if (isInBadSection(c)) continue;
        const count = c.querySelectorAll ? c.querySelectorAll("img").length : 0;
        if (count >= 1 && count <= 60) return c;
      }
    }

    if (host.includes("shopee")) {
      // Shopee gallery usually lives in the first screen (avoid review media further down)
      let cur = img.parentElement;
      for (let i = 0; i < 9 && cur; i++) {
        if (!isInBadSection(cur)) {
          const r = cur.getBoundingClientRect?.();
          if (r && r.top <= (window.innerHeight || 800) * 1.6) {
            const count = cur.querySelectorAll ? cur.querySelectorAll("img").length : 0;
            if (count >= 2 && count <= 60) return cur;
          }
        }
        cur = cur.parentElement;
      }
    }

    let cur = img.parentElement;
    let picked = null;

    for (let i = 0; i < 7 && cur; i++) {
      if (!isInBadSection(cur)) {
        const r = cur.getBoundingClientRect?.();
        // Keep gallery container near top; prevents grabbing review images
        if (!r || r.top <= (window.innerHeight || 800) * 1.8) {
          const count = cur.querySelectorAll ? cur.querySelectorAll("img").length : 0;
          if (count >= 3 && count <= 40) {
            picked = cur;
            break;
          }
        }
      }
      cur = cur.parentElement;
    }

    // Fallbacks
    if (!picked) {
      picked = img.closest("main, article, section, div") || img.parentElement;
    }
    return picked || null;
  }

  function addUrl(u) {
    if (!u) return;
    const s = String(u).trim();
    if (!s) return;
    if (s.startsWith("data:")) return;
    if (s.toLowerCase().endsWith(".svg")) return;
    if (seen.has(s)) return;
    seen.add(s);
    urls.push(s);
  }

  if (mainImg) {
    // Amazon: normalize to hi-res when possible
    const mainSrc = getImgSrc(mainImg);
    addUrl(host.includes("amazon") ? amazonNormalizeHiRes(mainSrc) : mainSrc);

    const container = pickGalleryContainer(mainImg);
    const mainRect = mainImg.getBoundingClientRect();
    const mx = mainRect.left + mainRect.width / 2;
    const my = mainRect.top + mainRect.height / 2;

    const candidates = [];
    let inContainer = Array.from((container || document).querySelectorAll("img"));

    // Amazon: hard-limit to the image gallery area to avoid review/comment images
    if (host.includes("amazon")) {
      const gallery = container || document.querySelector("#imageBlock") || document.querySelector("#leftCol") || document.querySelector("#altImages");
      if (gallery) inContainer = Array.from(gallery.querySelectorAll("img"));
    }

    // Shopee: keep to container near top (avoid review images)
    if (host.includes("shopee") && container) {
      const r = container.getBoundingClientRect?.();
      if (r && r.top > (window.innerHeight || 800) * 1.8) {
        inContainer = [];
      }
    }

    for (const img of inContainer) {
      if (!img) continue;
      if (img === mainImg) continue;
      if (looksLikeLogoOrIcon(img)) continue;
      if (isInBadSection(img)) continue;

      let src = getImgSrc(img);
      if (host.includes("amazon")) src = amazonNormalizeHiRes(src);
      if (!src) continue;

      const r = img.getBoundingClientRect();
      const w = r.width || img.naturalWidth || 0;
      const h = r.height || img.naturalHeight || 0;

      // Allow small thumbnails near main (but not tiny UI icons)
      if (w && h && (w < 45 || h < 45)) continue;

      // Keep images reasonably near the main image vertically (avoid page footer / long scrollers)
      if (Math.abs((r.top + r.height / 2) - my) > vpH * 2.2) continue;

      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(cx - mx, cy - my);

      candidates.push({ src, dist, area: w * h });
    }

    // Sort by distance (closest thumbnails first), then by size
    candidates.sort((a, b) => (a.dist - b.dist) || (b.area - a.area));

    for (const c of candidates) {
      if (urls.length >= 10) break;
      addUrl(c.src);
    }
  }

  // 4) If we still don't have enough, do a conservative fallback: visible large-ish images only (still excluding bad sections)
  if (urls.length < 5) {
    for (const img of imgs) {
      if (urls.length >= 10) break;
      if (looksLikeLogoOrIcon(img)) continue;
      if (isInBadSection(img)) continue;

      const src = getImgSrc(img);
      if (!src) continue;

      const r = img.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vpH * 3) continue;

      const w = r.width || img.naturalWidth || 0;
      const h = r.height || img.naturalHeight || 0;
      if (w && h && (w < 160 || h < 160)) continue;

      addUrl(src);
    }
  }

  return urls.slice(0, 10);
}

// ---- Enhanced JSON-LD extraction ----
function parseLdJsonProducts() {
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  const objs = [];

  for (const s of scripts) {
    const txt = s.textContent?.trim();
    if (!txt) continue;
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) objs.push(...parsed);
      else objs.push(parsed);
    } catch (e) {
      console.warn("Failed to parse LD+JSON:", e);
    }
  }

  // Flatten @graph
  const flat = [];
  for (const o of objs) {
    if (o && typeof o === "object" && Array.isArray(o["@graph"])) {
      flat.push(...o["@graph"]);
    } else {
      flat.push(o);
    }
  }

  // Find Product objects
  return flat.filter((x) => {
    const t = x?.["@type"];
    if (Array.isArray(t)) return t.includes("Product");
    return t === "Product";
  });
}


function extractFromLdJson(supplier) {
  const products = parseLdJsonProducts();
  if (!products.length) return null;

  // Pick first product that looks valid
  const p = products.find((x) => x?.name || x?.image || x?.offers) || products[0];

  const title = (p?.name || "").trim();

  // ✅ DOM-first images (BigC-style): main image + nearby thumbnails
  // This avoids pulling "recommended / suggested" images that often appear in LD+JSON.
  const domImages = getProductImages();

  // Images from LD+JSON (as a fallback only)
  let ldImages = [];
  try {
    if (Array.isArray(p?.image)) {
      ldImages = p.image;
    } else if (typeof p?.image === "string") {
      ldImages = [p.image];
    } else if (p?.image?.url) {
      ldImages = [p.image.url];
    }
  } catch {}

  // Handle offers (can be object or array)
  const offers = Array.isArray(p?.offers) ? p.offers[0] : p?.offers;
  const price = normalizePrice(
    String(offers?.price ?? offers?.lowPrice ?? offers?.highPrice ?? "")
  );
  const currency = String(offers?.priceCurrency || "").trim().toUpperCase();

  // Description
  const description = (p?.description || "").trim();

  // Brand
  const brand = p?.brand?.name || p?.brand || "";

  // Prefer DOM images (near main). If not enough, merge in LD+JSON.
  let images = Array.isArray(domImages) ? domImages : [];
  if (images.length < 5 && ldImages.length) {
    images = uniqueUrls([...images, ...ldImages]).slice(0, 10);
  } else {
    images = uniqueUrls(images).slice(0, 10);
  }

  return {
    title: title || "",
    price: price ?? null,
    description: description || "",
    images,
    brand: brand,
    currency:
      currency ||
      (supplier === "Makro" || supplier === "Lotus" || supplier === "Shopee" ? "THB" : "USD"),
    _layer: "json"
  };
}

// ---- Enhanced DOM scraping ----
function scrapeGeneric(supplier) {
  const host = hostname();
  
  // Enhanced title extraction
  const title =
    pickMeta("og:title") ||
    pickText([
      "h1[class*='product']",
      "h1[class*='title']",
      "h1[id*='product']",
      "#productTitle",
      "[data-testid='product-title']",
      ".product-title",
      ".product-name",
      "h1"
    ]) ||
    document.title ||
    "Imported Product";

  // Enhanced price extraction by supplier
  let priceRaw = "";
  
  if (supplier === "Amazon") {
    priceRaw =
      pickText([
        ".a-price .a-offscreen",
        "#priceblock_ourprice",
        "#priceblock_dealprice",
        "[data-a-color='price'] .a-offscreen",
        ".priceToPay .a-offscreen"
      ]) || pickMeta("product:price:amount");
  } else if (supplier === "Walmart") {
    priceRaw =
      pickText([
        "[itemprop='price']",
        "[data-testid='price-wrap'] span",
        "span.price-characteristic",
        "[class*='price-current']"
      ]) || pickMeta("product:price:amount");
  } else if (supplier === "Shopee") {
    priceRaw =
      pickText([
        "[class*='pqTWkA']",
        "[class*='_3n5NQx']",
        "[class*='_2v_RSJ']",
        "[data-testid='product-price']"
      ]) || pickMeta("product:price:amount");
  } else if (supplier === "AliExpress") {
    priceRaw =
      pickText([
        ".product-price-value",
        ".uniform-banner-box-price",
        "[class*='snow-price']",
        "[class*='product-price']",
        "[data-testid='price']"
      ]) || pickMeta("product:price:amount");
  } else if (supplier === "Makro") {
    priceRaw =
      pickText([
        "[class*='price']",
        "[data-testid='price']",
        ".product-price"
      ]) || pickMeta("product:price:amount");
  } else {
    priceRaw =
      pickMeta("product:price:amount") ||
      pickText([
        "[itemprop='price']",
        ".price",
        "[class*='price']",
        "[data-testid='price']"
      ]);
  }

  const price = normalizePrice(priceRaw);

  // Enhanced description extraction
  const description =
    pickMeta("og:description") ||
    pickText([
      "[data-testid='product-description']",
      "#productDescription",
      ".product-description",
      "[class*='description']",
      "[itemprop='description']"
    ]) ||
    "";

  // Try to get brand
  const brand = pickText([
    "[class*='brand']",
    "#brand",
    "[itemprop='brand']",
    ".brand-name"
  ]);

  const images = getProductImages();

  // Get currency based on supplier
  let currency = "USD";
  if (supplier === "Makro" || supplier === "Lotus" || supplier === "Shopee") {
    currency = "THB";
  } else if (supplier === "Amazon") {
    if (host.includes("amazon.co.th")) currency = "THB";
    else if (host.includes("amazon.co.jp")) currency = "JPY";
    else if (host.includes("amazon.co.uk")) currency = "GBP";
  }

  return {
    title: title.trim(),
    price,
    description,
    images,
    brand,
    currency,
    _layer: "dom"
  };
}

function scrapeProduct() {
  const host = hostname();
  const supplier = inferSupplier(host);
  const supplierUrl = location.href;

  // Try JSON-first for supported sites
  let focused = null;
  if (["AliExpress", "Amazon", "Makro", "Walmart", "Shopee"].includes(supplier)) {
    focused = extractFromLdJson(supplier);
  }

  const base = focused || scrapeGeneric(supplier);

  const result = {
    title: (base.title || "Imported Product").trim(),
    price: base.price ?? null,
    description: base.description || "",
    brand: base.brand || "",
    images: Array.isArray(base.images) ? uniqueUrls(base.images).slice(0, 10) : [],
    supplier,
    supplierUrl,
    status: "imported",
    currency: base.currency || "USD",
    extractedAtMs: Date.now(),
    source: {
      host,
      parser:
        supplier === "AliExpress" ? "aliexpress" :
        supplier === "Amazon" ? "amazon" :
        supplier === "Makro" ? "makro" :
        supplier === "Shopee" ? "shopee" :
        supplier === "Walmart" ? "walmart" : "generic",
      layer: base._layer || "dom"
    }
  };

  // Ensure images not empty
  if (!result.images.length) {
    result.images = getProductImages();
  }

  console.log("[BeeCommerce] Scraped data:", result);

  return result;
}

// ---- UI (floating import button) ----
function injectImportButton() {
  if (document.getElementById("beecommerce-import-btn")) return;

  const btn = document.createElement("button");
  btn.id = "beecommerce-import-btn";
  btn.textContent = "🐝 Import to BeeCommerce";
  btn.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    padding: 12px 16px;
    background: #facc15;
    color: #000;
    border: none;
    border-radius: 10px;
    font-weight: bold;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    transition: all 0.2s ease;
  `;

  btn.addEventListener("mouseenter", () => {
    btn.style.transform = "scale(1.05)";
    btn.style.boxShadow = "0 6px 16px rgba(0,0,0,0.3)";
  });

  btn.addEventListener("mouseleave", () => {
    btn.style.transform = "scale(1)";
    btn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
  });

  let lastOpenUrl = null;

  btn.addEventListener("click", async () => {
    // If already imported, second click opens draft
    if (lastOpenUrl) {
      window.open(lastOpenUrl, "_blank");
      return;
    }

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Importing…";
    btn.style.opacity = "0.7";

    try {
      const scraped = scrapeProduct();
      if (!scraped?.supplierUrl) {
        throw new Error("Missing supplierUrl (scrape failed)");
      }

      console.log("[BeeCommerce] Sending to background:", {
        parser: scraped?.source?.parser,
        layer: scraped?.source?.layer
      });

      const resp = await chrome.runtime.sendMessage({
        type: "BEE_IMPORT_SCRAPED",
        payload: { scraped }
      });

      if (!resp?.ok) {
        throw new Error(resp?.error || "Import failed");
      }

      btn.textContent = "✅ Imported! Click to open";
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.background = "#3ddc97";

      lastOpenUrl = resp.openUrl || 
        `${DEFAULT_APP_BASE}/DraftDetail?draftId=${encodeURIComponent(resp.draftId)}`;
    } catch (e) {
      btn.textContent = "❌ Import failed";
      btn.style.background = "#ff5a5f";
      btn.style.opacity = "1";
      btn.disabled = false;
      
      alert(`Import error: ${String(e?.message || e)}`);
      
      setTimeout(() => {
        btn.textContent = original;
        btn.style.background = "#facc15";
      }, 2000);
    }
  });

  document.body.appendChild(btn);
}

// Keep popup button compatibility
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "SCRAPE_PRODUCT") return;

  try {
    const data = scrapeProduct();
    sendResponse({ ok: true, data });
  } catch (e) {
    sendResponse({ ok: false, error: String(e?.message || e) });
  }

  return true;
});

// Inject button when page loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectImportButton);
} else {
  injectImportButton();
}

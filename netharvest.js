#!/usr/bin/env node
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { exec, execFile } from 'node:child_process';

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  gray: '\x1b[90m',
  white: '\x1b[97m',
  cyan: '\x1b[36m',
  brightCyan: '\x1b[96m',
  green: '\x1b[32m',
  brightGreen: '\x1b[92m',
  yellow: '\x1b[33m',
  brightYellow: '\x1b[93m',
  red: '\x1b[31m',
  brightRed: '\x1b[91m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

function detectSystemBrowser() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function printBanner() {
  console.clear();
  console.log(`${c.brightCyan}${c.bold}======================================================================${c.reset}`);
  console.log(`${c.brightCyan}${c.bold}  NETHARVEST  ::  High-Precision Web Archiver & Offline Mirror Engine${c.reset}`);
  console.log(`${c.brightCyan}${c.bold}======================================================================${c.reset}\n`);
}

function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, questionText, defaultValue = '') {
  return new Promise((resolve) => {
    const promptString = defaultValue !== '' 
      ? `${c.white}${questionText}${c.reset} ${c.gray}[${defaultValue}]${c.reset}: `
      : `${c.white}${questionText}${c.reset}: `;
    rl.question(promptString, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

const DEFAULT_CONFIG = {
  url: '',
  maxDepth: 3,
  concurrency: 6,
  delayMs: 25,
  useBrowserEngine: true,
  includeSubdomains: false,
  pathPrefixLock: false,
  downloadAssets: true,
  downloadMedia: false,
  rewriteOffline: true,
  unpackSourceMaps: true,
  scanEndpoints: true,
  exportReaderMode: true,
  autoSeedSitemap: true,
  createZipArchive: true,
  cookies: '',
  customHeaders: {},
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  outputDir: '',
};

const ENDPOINT_PATTERNS = [
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z-_]{35}/g },
  { name: 'AWS Access Key', regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g },
  { name: 'JWT Token', regex: /ey[A-Za-z0-9-_=]{10,}\.[A-Za-z0-9-_=]{10,}\.?[A-Za-z0-9-_.+/=]*/g },
  { name: 'Generic Auth Key', regex: /(?:api_key|apikey|secret|token|auth_token|access_token)[\s]*[:=][\s]*["']([a-zA-Z0-9_\-]{16,64})["']/gi },
  { name: 'Private/Public Token', regex: /(?:sk|pk)_(?:test|live)_[0-9a-zA-Z]{24,34}/g },
  { name: 'Webhook URL', regex: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]+\/B[a-zA-Z0-9_]+\/[a-zA-Z0-9_]+/g },
  { name: 'REST/GraphQL Endpoint', regex: /https?:\/\/[a-zA-Z0-9_\-\.]+\/(?:api|v[0-9]|graphql)[a-zA-Z0-9_\-\.\/\?]*/gi },
  { name: 'Internal Route', regex: /["'](\/(?:api|v[0-9]|graphql|auth|admin|login|webhook|internal)\/[a-zA-Z0-9_\-\.\/]+)["']/gi },
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function sanitizeSafe(str) {
  return str.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

function normalizeUrl(targetUrl) {
  try {
    const u = new URL(targetUrl);
    u.hash = '';
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
      u.port = '';
    }
    return u.href;
  } catch {
    return targetUrl;
  }
}

function getSafePagePath(urlObj, outputDir) {
  let pathname = decodeURIComponent(urlObj.pathname);
  if (pathname.endsWith('/') || pathname === '') {
    pathname += 'index.html';
  } else if (!path.extname(pathname)) {
    pathname += '.html';
  }

  if (urlObj.search) {
    const safeQuery = sanitizeSafe(urlObj.search.replace(/^\?/, ''));
    const ext = path.extname(pathname);
    const base = pathname.slice(0, pathname.length - ext.length);
    pathname = `${base}_q_${safeQuery.slice(0, 32)}${ext || '.html'}`;
  }

  const parts = pathname.split('/').filter(Boolean);
  const safeParts = parts.map(sanitizeSafe);
  const relativeFilePath = safeParts.join(path.sep) || 'index.html';

  return path.join(outputDir, 'offline', relativeFilePath);
}

function getSafeAssetPath(urlObj, outputDir, contentType = '') {
  let ext = path.extname(urlObj.pathname).toLowerCase().split('?')[0];
  let category = 'other';

  if (['.css'].includes(ext) || contentType.includes('text/css')) {
    category = 'css';
    if (!ext) ext = '.css';
  } else if (['.js', '.mjs', '.cjs'].includes(ext) || contentType.includes('javascript')) {
    category = 'js';
    if (!ext) ext = '.js';
  } else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.avif'].includes(ext) || contentType.includes('image')) {
    category = 'images';
    if (!ext) ext = '.png';
  } else if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext) || contentType.includes('font')) {
    category = 'fonts';
    if (!ext) ext = '.woff2';
  } else if (['.mp4', '.webm', '.ogg', '.mp3', '.wav', '.mov'].includes(ext) || contentType.includes('video') || contentType.includes('audio')) {
    category = 'media';
  } else if (['.pdf', '.docx', '.zip', '.tar', '.gz'].includes(ext) || contentType.includes('pdf')) {
    category = 'documents';
  }

  const hash = crypto.createHash('sha256').update(urlObj.href).digest('hex').slice(0, 10);
  let baseName = path.basename(urlObj.pathname) || 'asset';
  baseName = sanitizeSafe(baseName).replace(/\.[^.]+$/, '');
  const fileName = `${baseName}_${hash}${ext}`;

  return {
    relativePath: path.join('assets', category, fileName),
    absolutePath: path.join(outputDir, 'offline', 'assets', category, fileName),
    category,
  };
}

function extractUrlsFromHtml(html, baseUrl) {
  const links = new Set();
  const assets = [];
  const spaRoutes = new Set();

  function safeResolve(raw) {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('javascript:') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('#') || trimmed.startsWith('data:')) {
      return null;
    }
    try {
      return new URL(trimmed, baseUrl);
    } catch {
      return null;
    }
  }

  const aMatches = html.matchAll(/<a\b[^>]*?\bhref=["']([^"']+)["'][^>]*>/gi);
  for (const m of aMatches) {
    const resolved = safeResolve(m[1]);
    if (resolved) {
      resolved.hash = '';
      links.add({ url: resolved.href, rawAttr: m[1] });
    }
  }

  const linkMatches = html.matchAll(/<link\b[^>]*?\bhref=["']([^"']+)["'][^>]*>/gi);
  for (const m of linkMatches) {
    const resolved = safeResolve(m[1]);
    if (resolved) {
      const isCss = /rel=["'](?:stylesheet|preload)["']/i.test(m[0]);
      assets.push({ url: resolved.href, type: isCss ? 'css' : 'asset', rawAttr: m[1] });
    }
  }

  const jsMatches = html.matchAll(/<script\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi);
  for (const m of jsMatches) {
    const resolved = safeResolve(m[1]);
    if (resolved) assets.push({ url: resolved.href, type: 'js', rawAttr: m[1] });
  }

  const mediaAttrs = ['src', 'poster', 'data-src', 'data-original', 'data-lazy', 'data-lazy-src', 'data-url'];
  for (const attr of mediaAttrs) {
    const regex = new RegExp(`\\b${attr}=["']([^"']+)["']`, 'gi');
    const matches = html.matchAll(regex);
    for (const m of matches) {
      const resolved = safeResolve(m[1]);
      if (resolved) assets.push({ url: resolved.href, type: 'image', rawAttr: m[1] });
    }
  }

  const useMatches = html.matchAll(/<(?:use|image)\b[^>]*?\b(?:href|xlink:href)=["']([^"']+)["'][^>]*>/gi);
  for (const m of useMatches) {
    const raw = m[1].trim();
    const hashIndex = raw.indexOf('#');
    const cleanUrlPart = hashIndex !== -1 ? raw.slice(0, hashIndex) : raw;
    if (cleanUrlPart) {
      const resolved = safeResolve(cleanUrlPart);
      if (resolved) assets.push({ url: resolved.href, type: 'image', rawAttr: m[1], hashPart: hashIndex !== -1 ? raw.slice(hashIndex) : '' });
    }
  }

  const metaMatches = html.matchAll(/<meta\b[^>]*?\bcontent=["']([^"']+)["'][^>]*>/gi);
  for (const m of metaMatches) {
    if (/(?:image|icon|tile)/i.test(m[0])) {
      const resolved = safeResolve(m[1]);
      if (resolved) assets.push({ url: resolved.href, type: 'image', rawAttr: m[1] });
    }
  }

  const srcsetRegexes = [/srcset=["']([^"']+)["']/gi, /data-srcset=["']([^"']+)["']/gi];
  for (const regex of srcsetRegexes) {
    const srcsetMatches = html.matchAll(regex);
    for (const m of srcsetMatches) {
      const candidates = m[1].split(',');
      for (const cand of candidates) {
        const item = cand.trim().split(/\s+/)[0];
        const resolved = safeResolve(item);
        if (resolved) assets.push({ url: resolved.href, type: 'image', rawAttr: item, inSrcset: true });
      }
    }
  }

  const sourceMatches = html.matchAll(/<(?:source|track|video|audio)\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi);
  for (const m of sourceMatches) {
    const resolved = safeResolve(m[1]);
    if (resolved) assets.push({ url: resolved.href, type: 'media', rawAttr: m[1] });
  }

  const inlineUrls = html.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi);
  for (const m of inlineUrls) {
    const resolved = safeResolve(m[1]);
    if (resolved) assets.push({ url: resolved.href, type: 'asset', rawAttr: m[1] });
  }

  const nextDataMatch = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch && nextDataMatch[1]) {
    try {
      const parsed = JSON.parse(nextDataMatch[1]);
      if (parsed.page && typeof parsed.page === 'string' && !parsed.page.includes('[')) {
        const routeUrl = safeResolve(parsed.page);
        if (routeUrl) spaRoutes.add(routeUrl.href);
      }
    } catch {}
  }

  return { 
    links: Array.from(links), 
    assets,
    spaRoutes: Array.from(spaRoutes),
  };
}

function extractUrlsFromCss(cssText, baseUrl) {
  const assets = [];
  const matches = cssText.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi);
  for (const m of matches) {
    const raw = m[1].trim();
    if (!raw.startsWith('data:')) {
      try {
        const resolved = new URL(raw, baseUrl);
        assets.push({ url: resolved.href, rawAttr: m[1] });
      } catch {}
    }
  }

  const importMatches = cssText.matchAll(/@import\s+(?:url\(['"]?|['"])([^'")]+)(?:['"]\)|['"])/gi);
  for (const m of importMatches) {
    try {
      const resolved = new URL(m[1].trim(), baseUrl);
      assets.push({ url: resolved.href, rawAttr: m[1], type: 'css' });
    } catch {}
  }

  return assets;
}

function convertToReaderMarkdown(html, pageTitle = 'Document') {
  let md = `# ${pageTitle}\n\n`;

  let clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<(?:nav|footer|header|aside|dialog|form)\b[^>]*>[\s\S]*?<\/(?:nav|footer|header|aside|dialog|form)>/gi, '');

  clean = clean.replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, (_, text) => `\n\n# ${cleanTags(text)}\n\n`);
  clean = clean.replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, (_, text) => `\n\n## ${cleanTags(text)}\n\n`);
  clean = clean.replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, (_, text) => `\n\n### ${cleanTags(text)}\n\n`);
  clean = clean.replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, (_, text) => `\n\n#### ${cleanTags(text)}\n\n`);
  clean = clean.replace(/<h5\b[^>]*>([\s\S]*?)<\/h5>/gi, (_, text) => `\n\n##### ${cleanTags(text)}\n\n`);
  clean = clean.replace(/<h6\b[^>]*>([\s\S]*?)<\/h6>/gi, (_, text) => `\n\n###### ${cleanTags(text)}\n\n`);

  clean = clean.replace(/<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => `\n\`\`\`\n${decodeHtml(cleanTags(code))}\n\`\`\`\n`);
  clean = clean.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, code) => `\`${decodeHtml(cleanTags(code))}\``);
  clean = clean.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, p) => `\n\n${cleanTags(p).trim()}\n\n`);
  clean = clean.replace(/<br\s*\/?>/gi, '\n');
  clean = clean.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, item) => `\n* ${cleanTags(item).trim()}`);
  clean = clean.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, q) => `\n> ${cleanTags(q).trim()}\n`);

  clean = clean.replace(/<a\b[^>]*?\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => `[${cleanTags(text).trim() || 'Link'}](${href})`);
  clean = clean.replace(/<img\b[^>]*?\balt=["']([^"']*)["'][^>]*?\bsrc=["']([^"']*)["'][^>]*>/gi, (_, alt, src) => `![${alt}](${src})`);
  clean = clean.replace(/<img\b[^>]*?\bsrc=["']([^"']*)["'][^>]*>/gi, (_, src) => `![](${src})`);

  clean = cleanTags(clean);
  clean = decodeHtml(clean);
  clean = clean.replace(/\n{3,}/g, '\n\n').trim();

  return md + clean;
}

function cleanTags(str) {
  return str.replace(/<[^>]*>/g, '').trim();
}

function decodeHtml(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function fetchPageWithBrowser(url, browserExe) {
  return new Promise((resolve) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--dump-dom',
      '--virtual-time-budget=3500',
      url,
    ];
    execFile(browserExe, args, { maxBuffer: 1024 * 1024 * 30 }, (err, stdout) => {
      if (!err && stdout && stdout.length > 50) {
        resolve({ ok: true, text: () => Promise.resolve(stdout), url, browserUsed: true });
      } else {
        resolve(null);
      }
    });
  });
}

async function fetchWithRetry(url, config, retries = 2) {
  const headers = {
    'User-Agent': config.userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    ...config.customHeaders,
  };

  if (config.cookies) {
    headers['Cookie'] = config.cookies;
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        redirect: 'follow',
      });
      return response;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

class NetHarvest {
  constructor(config) {
    this.config = config;
    this.targetUrl = new URL(config.url);
    this.rootHost = this.targetUrl.hostname;
    this.basePathPrefix = this.targetUrl.pathname.replace(/\/$/, '') || '';
    this.systemBrowser = this.config.useBrowserEngine ? detectSystemBrowser() : null;

    const hostFolder = sanitizeSafe(this.rootHost);
    const baseScriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([a-zA-Z]:)/, '$1');
    const defaultDumpsParent = path.join(baseScriptDir, 'dumps');
    this.outputDir = config.outputDir ? path.resolve(config.outputDir) : path.join(defaultDumpsParent, hostFolder);
    this.stateFilePath = path.join(this.outputDir, 'harvest_state.json');

    this.pagesQueue = [{ url: normalizeUrl(this.targetUrl.href), depth: 0, referrer: 'root' }];
    this.visitedPages = new Set();
    this.crawledPageRecords = new Map();
    this.assetRecords = new Map();
    this.endpointsFound = [];
    this.sitemapEntries = [];
    this.errors = [];

    this.startTime = Date.now();
    this.bytesDownloaded = 0;
    this.activeWorkers = 0;
    this.currentProcessingUrl = this.targetUrl.href;
    this.isAborted = false;
  }

  async loadCheckpointIfPresent() {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        const raw = await fsp.readFile(this.stateFilePath, 'utf-8');
        const state = JSON.parse(raw);
        if (state && Array.isArray(state.visitedPages)) {
          this.visitedPages = new Set(state.visitedPages);
          if (Array.isArray(state.pendingQueue)) {
            this.pagesQueue = state.pendingQueue;
          }
          if (state.assetRecords) {
            for (const [k, v] of Object.entries(state.assetRecords)) {
              this.assetRecords.set(k, v);
            }
          }
          console.log(`${c.brightGreen}[+] Resumed checkpoint: ${this.visitedPages.size} pages already indexed.${c.reset}`);
          return true;
        }
      }
    } catch {}
    return false;
  }

  async saveCheckpoint() {
    try {
      const state = {
        target: this.targetUrl.href,
        savedAt: new Date().toISOString(),
        visitedPages: Array.from(this.visitedPages),
        pendingQueue: this.pagesQueue.slice(0, 5000),
        assetRecords: Object.fromEntries(this.assetRecords.entries()),
      };
      await fsp.writeFile(this.stateFilePath, JSON.stringify(state), 'utf-8');
    } catch {}
  }

  async autoSeedSitemap() {
    if (!this.config.autoSeedSitemap) return;
    const probeTargets = [
      new URL('/sitemap.xml', this.targetUrl.origin).href,
      new URL('/sitemap_index.xml', this.targetUrl.origin).href,
      new URL('/robots.txt', this.targetUrl.origin).href,
    ];

    for (const probeUrl of probeTargets) {
      try {
        const res = await fetchWithRetry(probeUrl, this.config, 1);
        if (!res.ok) continue;

        const text = await res.text();
        if (probeUrl.endsWith('robots.txt')) {
          const sitemapDirectives = text.matchAll(/Sitemap:\s*(https?:\/\/[^\s]+)/gi);
          for (const sm of sitemapDirectives) {
            try {
              const smRes = await fetchWithRetry(sm[1], this.config, 1);
              if (smRes.ok) {
                this.parseXmlSitemapUrls(await smRes.text());
              }
            } catch {}
          }
        } else {
          this.parseXmlSitemapUrls(text);
        }
      } catch {}
    }
  }

  parseXmlSitemapUrls(xmlText) {
    const locMatches = xmlText.matchAll(/<loc>([\s\S]*?)<\/loc>/gi);
    let seededCount = 0;
    for (const m of locMatches) {
      const rawUrl = normalizeUrl(m[1].trim());
      try {
        const parsed = new URL(rawUrl);
        if (this.isAllowedDomain(parsed) && !this.visitedPages.has(rawUrl)) {
          this.pagesQueue.push({ url: rawUrl, depth: 1, referrer: 'sitemap.xml' });
          seededCount++;
        }
      } catch {}
    }
    if (seededCount > 0) {
      console.log(`${c.brightGreen}[+] Discovered ${seededCount} pages from sitemap.xml${c.reset}`);
    }
  }

  isAllowedDomain(urlObj) {
    let hostAllowed = false;
    if (this.config.includeSubdomains) {
      hostAllowed = (urlObj.hostname === this.rootHost || urlObj.hostname.endsWith('.' + this.rootHost));
    } else {
      hostAllowed = (urlObj.hostname === this.rootHost);
    }
    if (!hostAllowed) return false;

    if (this.config.pathPrefixLock && this.basePathPrefix) {
      if (!urlObj.pathname.startsWith(this.basePathPrefix)) {
        return false;
      }
    }

    return true;
  }

  scanTextForEndpoints(text, sourceUrl) {
    if (!this.config.scanEndpoints) return;
    for (const rule of ENDPOINT_PATTERNS) {
      rule.regex.lastIndex = 0;
      let match;
      while ((match = rule.regex.exec(text)) !== null) {
        const item = match[1] || match[0];
        if (item.length < 6 || item.includes('example.com') || item.includes('w3.org')) continue;
        this.endpointsFound.push({
          type: rule.name,
          value: item.slice(0, 120),
          foundIn: sourceUrl,
        });
      }
    }
  }

  async unpackSourceMap(jsContent, jsUrl) {
    if (!this.config.unpackSourceMaps) return;
    try {
      const match = jsContent.match(/\/\/#\s*sourceMappingURL=([^\s]+)/);
      let mapUrl = null;

      if (match && match[1]) {
        mapUrl = new URL(match[1], jsUrl).href;
      } else {
        mapUrl = `${jsUrl}.map`;
      }

      const res = await fetch(mapUrl, { headers: { 'User-Agent': this.config.userAgent } });
      if (!res.ok) return;

      const mapJson = await res.json();
      if (!mapJson || !Array.isArray(mapJson.sources) || !Array.isArray(mapJson.sourcesContent)) return;

      const sourceCodeDir = path.join(this.outputDir, 'unpacked_source');
      for (let i = 0; i < mapJson.sources.length; i++) {
        const srcPath = mapJson.sources[i];
        const srcContent = mapJson.sourcesContent[i];
        if (!srcPath || !srcContent) continue;

        const cleanSrcPath = srcPath.replace(/^[a-z0-9_-]+:\/\//i, '').replace(/^[\\\/]+/, '');
        const targetPath = path.join(sourceCodeDir, cleanSrcPath);

        await fsp.mkdir(path.dirname(targetPath), { recursive: true });
        await fsp.writeFile(targetPath, srcContent, 'utf-8');
      }
    } catch {}
  }

  async downloadAsset(assetItem, refererUrl) {
    const assetUrl = assetItem.url || assetItem;
    if (this.assetRecords.has(assetUrl)) {
      return this.assetRecords.get(assetUrl);
    }

    try {
      const parsed = new URL(assetUrl);
      const res = await fetchWithRetry(assetUrl, this.config);
      if (!res.ok) return null;

      const contentType = res.headers.get('content-type') || '';
      if (!this.config.downloadMedia && (contentType.includes('video') || contentType.includes('audio'))) {
        return null;
      }

      const pathInfo = getSafeAssetPath(parsed, this.outputDir, contentType);
      pathInfo.url = assetUrl;
      this.assetRecords.set(assetUrl, pathInfo);

      const buffer = Buffer.from(await res.arrayBuffer());
      this.bytesDownloaded += buffer.length;

      await fsp.mkdir(path.dirname(pathInfo.absolutePath), { recursive: true });

      if (pathInfo.category === 'css') {
        let cssText = buffer.toString('utf-8');
        this.scanTextForEndpoints(cssText, assetUrl);

        const nestedAssets = extractUrlsFromCss(cssText, assetUrl);
        for (const nested of nestedAssets) {
          const nestedRec = await this.downloadAsset(nested, assetUrl);
          if (nestedRec) {
            const relToNested = path.relative(path.dirname(pathInfo.absolutePath), nestedRec.absolutePath).replace(/\\/g, '/');
            cssText = cssText.replaceAll(`"${nested.rawAttr}"`, `"${relToNested}"`);
            cssText = cssText.replaceAll(`'${nested.rawAttr}'`, `'${relToNested}'`);
            cssText = cssText.replaceAll(`url(${nested.rawAttr})`, `url(${relToNested})`);
            cssText = cssText.replaceAll(`url("${nested.rawAttr}")`, `url("${relToNested}")`);
            cssText = cssText.replaceAll(`url('${nested.rawAttr}')`, `url('${relToNested}')`);
          }
        }
        await fsp.writeFile(pathInfo.absolutePath, cssText, 'utf-8');
      } else if (pathInfo.category === 'js') {
        const jsText = buffer.toString('utf-8');
        this.scanTextForEndpoints(jsText, assetUrl);
        await fsp.writeFile(pathInfo.absolutePath, jsText, 'utf-8');
        await this.unpackSourceMap(jsText, assetUrl);
      } else {
        await fsp.writeFile(pathInfo.absolutePath, buffer);
      }

      return pathInfo;
    } catch (err) {
      this.errors.push({ type: 'asset', url: assetUrl, error: err.message });
      return null;
    }
  }

  async processPage(pageItem) {
    const { url, depth, referrer } = pageItem;
    if (this.visitedPages.has(url)) return;
    this.visitedPages.add(url);
    this.currentProcessingUrl = url;

    try {
      const parsedUrl = new URL(url);
      let html = null;
      let finalUrl = url;

      if (this.systemBrowser) {
        const browserRes = await fetchPageWithBrowser(url, this.systemBrowser);
        if (browserRes && browserRes.ok) {
          html = await browserRes.text();
        }
      }

      if (!html) {
        const res = await fetchWithRetry(url, this.config);
        if (!res.ok) {
          this.errors.push({ type: 'page', url, status: res.status });
          return;
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
          await this.downloadAsset({ url }, url);
          return;
        }

        if (res.url) finalUrl = normalizeUrl(res.url);
        html = await res.text();
      }

      this.bytesDownloaded += Buffer.byteLength(html, 'utf-8');
      const finalParsedUrl = new URL(finalUrl);

      const localFilePath = getSafePagePath(finalParsedUrl, this.outputDir);
      
      const { links, assets, spaRoutes } = extractUrlsFromHtml(html, finalUrl);
      this.crawledPageRecords.set(url, { localFilePath, html, depth, assets, pageUrl: finalUrl });
      if (finalUrl !== url) {
        this.crawledPageRecords.set(finalUrl, { localFilePath, html, depth, assets, pageUrl: finalUrl });
      }

      const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
      const pageTitle = titleMatch ? cleanTags(titleMatch[1]).trim() : parsedUrl.pathname;

      this.sitemapEntries.push({
        url: finalUrl,
        title: pageTitle,
        depth,
        referrer,
        localPath: path.relative(this.outputDir, localFilePath).replace(/\\/g, '/'),
      });

      this.scanTextForEndpoints(html, finalUrl);

      if (this.config.downloadAssets) {
        for (const asset of assets) {
          if (this.isAborted) break;
          await this.downloadAsset(asset, finalUrl);
        }
      }

      if (depth < this.config.maxDepth) {
        const candidateLinks = [...links.map(l => l.url), ...spaRoutes];
        for (const link of candidateLinks) {
          try {
            const normalizedLink = normalizeUrl(link);
            const linkParsed = new URL(normalizedLink);
            if (this.isAllowedDomain(linkParsed) && !this.visitedPages.has(normalizedLink)) {
              this.pagesQueue.push({ url: normalizedLink, depth: depth + 1, referrer: finalUrl });
            }
          } catch {}
        }
      }

      if (this.config.exportReaderMode) {
        const md = convertToReaderMarkdown(html, pageTitle);
        const mdRelative = path.relative(path.join(this.outputDir, 'offline'), localFilePath).replace(/\.html?$/i, '.md');
        const mdPath = path.join(this.outputDir, 'reader_view', mdRelative);
        await fsp.mkdir(path.dirname(mdPath), { recursive: true });
        await fsp.writeFile(mdPath, md, 'utf-8');
      }

    } catch (err) {
      this.errors.push({ type: 'page', url, error: err.message });
    }
  }

  resolveOfflinePageLink(rawLink, baseUrl, pageDir) {
    let clean = rawLink.trim();
    if (!clean || clean.startsWith('#') || clean.startsWith('javascript:') || clean.startsWith('mailto:') || clean.startsWith('tel:')) {
      return null;
    }

    let hashPart = '';
    const hashIdx = clean.indexOf('#');
    if (hashIdx !== -1) {
      hashPart = clean.slice(hashIdx);
      clean = clean.slice(0, hashIdx);
    }

    let targetUrlObj;
    try {
      targetUrlObj = new URL(clean, baseUrl);
    } catch {
      return null;
    }

    if (!this.isAllowedDomain(targetUrlObj)) {
      return null;
    }

    const normalized = normalizeUrl(targetUrlObj.href);
    let matched = this.crawledPageRecords.get(normalized) ||
                  this.crawledPageRecords.get(targetUrlObj.href) ||
                  this.crawledPageRecords.get(normalized.replace(/\/$/, '')) ||
                  this.crawledPageRecords.get(normalized + '/');

    let targetFilePath;
    if (matched && matched.localFilePath) {
      targetFilePath = matched.localFilePath;
    } else {
      targetFilePath = getSafePagePath(targetUrlObj, this.outputDir);
    }

    let rel = path.relative(pageDir, targetFilePath).replace(/\\/g, '/');
    if (!rel.startsWith('.') && !rel.startsWith('/')) {
      rel = './' + rel;
    }
    return rel + hashPart;
  }

  async rewriteOfflineLinks() {
    for (const [pageUrl, record] of this.crawledPageRecords.entries()) {
      let rewritten = record.html;
      const pageDir = path.dirname(record.localFilePath);

      rewritten = rewritten.replace(/<base\b[^>]*>/gi, '');

      if (record.assets && Array.isArray(record.assets)) {
        for (const assetItem of record.assets) {
          const assetRec = this.assetRecords.get(assetItem.url);
          if (!assetRec) continue;

          let relPath = path.relative(pageDir, assetRec.absolutePath).replace(/\\/g, '/');
          if (assetItem.hashPart) relPath += assetItem.hashPart;

          if (assetItem.rawAttr) {
            rewritten = rewritten.replaceAll(`"${assetItem.rawAttr}"`, `"${relPath}"`);
            rewritten = rewritten.replaceAll(`'${assetItem.rawAttr}'`, `'${relPath}'`);
            rewritten = rewritten.replaceAll(`url(${assetItem.rawAttr})`, `url(${relPath})`);
            rewritten = rewritten.replaceAll(`url("${assetItem.rawAttr}")`, `url("${relPath}")`);
            rewritten = rewritten.replaceAll(`url('${assetItem.rawAttr}')`, `url('${relPath}')`);

            if (assetItem.inSrcset) {
              const escapedRaw = assetItem.rawAttr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const srcsetCandRegex = new RegExp(`(^|[\\s,])${escapedRaw}([\\s,]|$)`, 'g');
              rewritten = rewritten.replace(srcsetCandRegex, `$1${relPath}$2`);
            }
          }

          rewritten = rewritten.replaceAll(`"${assetItem.url}"`, `"${relPath}"`);
          rewritten = rewritten.replaceAll(`'${assetItem.url}'`, `'${relPath}'`);
        }
      }

      for (const [assetUrl, assetRec] of this.assetRecords.entries()) {
        const relPath = path.relative(pageDir, assetRec.absolutePath).replace(/\\/g, '/');
        rewritten = rewritten.replaceAll(`"${assetUrl}"`, `"${relPath}"`);
        rewritten = rewritten.replaceAll(`'${assetUrl}'`, `'${relPath}'`);
        try {
          const u = new URL(assetUrl);
          rewritten = rewritten.replaceAll(`"${u.pathname}"`, `"${relPath}"`);
          rewritten = rewritten.replaceAll(`'${u.pathname}'`, `'${relPath}'`);
          if (u.search) {
            rewritten = rewritten.replaceAll(`"${u.pathname}${u.search}"`, `"${relPath}"`);
            rewritten = rewritten.replaceAll(`'${u.pathname}${u.search}'`, `'${relPath}'`);
          }
        } catch {}
      }

      rewritten = rewritten.replace(/(<a\b[^>]*?\bhref=["'])([^"']+)(["'][^>]*>)/gi, (match, prefix, rawLink, suffix) => {
        const resolved = this.resolveOfflinePageLink(rawLink, record.pageUrl || pageUrl, pageDir);
        if (resolved) {
          return `${prefix}${resolved}${suffix}`;
        }
        return match;
      });

      rewritten = rewritten.replace(/(\b(?:data-href|action)=["'])([^"']+)(["'])/gi, (match, prefix, rawLink, suffix) => {
        const resolved = this.resolveOfflinePageLink(rawLink, record.pageUrl || pageUrl, pageDir);
        if (resolved) {
          return `${prefix}${resolved}${suffix}`;
        }
        return match;
      });

      rewritten = rewritten.replace(/((?:location(?:\.href)?|open)\(\s*['"])([^'"]+)(['"]\s*\))/gi, (match, prefix, rawLink, suffix) => {
        const resolved = this.resolveOfflinePageLink(rawLink, record.pageUrl || pageUrl, pageDir);
        if (resolved) {
          return `${prefix}${resolved}${suffix}`;
        }
        return match;
      });

      for (const [otherUrl, otherRec] of this.crawledPageRecords.entries()) {
        const relPath = path.relative(pageDir, otherRec.localFilePath).replace(/\\/g, '/');
        rewritten = rewritten.replaceAll(`"${otherUrl}"`, `"${relPath}"`);
        rewritten = rewritten.replaceAll(`'${otherUrl}'`, `'${relPath}'`);
        try {
          const u = new URL(otherUrl);
          rewritten = rewritten.replaceAll(`href="${u.pathname}"`, `href="${relPath}"`);
          rewritten = rewritten.replaceAll(`href='${u.pathname}'`, `href='${relPath}'`);
          rewritten = rewritten.replaceAll(`href="${u.pathname}/"`, `href="${relPath}"`);
          rewritten = rewritten.replaceAll(`href='${u.pathname}/'`, `href='${relPath}'`);
          if (u.search) {
            rewritten = rewritten.replaceAll(`href="${u.pathname}${u.search}"`, `href="${relPath}"`);
            rewritten = rewritten.replaceAll(`href='${u.pathname}${u.search}'`, `href='${relPath}'`);
          }
        } catch {}
      }

      rewritten = rewritten.replace(/<img\b([^>]*?)\b(?:data-src|data-original|data-lazy|data-lazy-src)=["']([^"']+)["']([^>]*?)>/gi, (match, before, realSrc, after) => {
        if (!/src=["'](?:data:image|about:blank|\s*)["']/i.test(match)) {
          return match;
        }
        return `<img ${before} src="${realSrc}" ${after}>`;
      });

      const clickHandlerScript = '<script>(function(){document.addEventListener("click",function(e){var el=e.target.closest("a,button,[data-href]");if(!el)return;var h=el.getAttribute("href")||el.getAttribute("data-href");if(h&&!h.startsWith("http:")&&!h.startsWith("https:")&&!h.startsWith("#")&&!h.startsWith("mailto:")&&!h.startsWith("tel:")){e.stopPropagation();if(el.tagName.toLowerCase()!=="a"){window.location.href=h;}}},true);})();</script>';
      if (rewritten.includes('</body>')) {
        rewritten = rewritten.replace('</body>', `${clickHandlerScript}</body>`);
      } else {
        rewritten += clickHandlerScript;
      }

      await fsp.mkdir(pageDir, { recursive: true });
      await fsp.writeFile(record.localFilePath, rewritten, 'utf-8');
    }
  }

  async runWorker() {
    while (this.pagesQueue.length > 0 && !this.isAborted) {
      const item = this.pagesQueue.shift();
      if (!item) break;

      this.activeWorkers++;
      await this.processPage(item);
      this.activeWorkers--;

      if (this.config.delayMs > 0) {
        const jitter = Math.floor(Math.random() * (this.config.delayMs * 0.4));
        await new Promise(r => setTimeout(r, this.config.delayMs + jitter));
      }
    }
  }

  renderDashboard() {
    const elapsed = Math.max(0.1, (Date.now() - this.startTime) / 1000);
    const mbDownloaded = (this.bytesDownloaded / (1024 * 1024)).toFixed(2);
    const speed = (mbDownloaded / elapsed).toFixed(2);
    const pagesCount = this.crawledPageRecords.size;
    const assetsCount = this.assetRecords.size;
    const queuedCount = this.pagesQueue.length;
    const memUsage = (process.memoryUsage().rss / (1024 * 1024)).toFixed(1);

    readline.cursorTo(process.stdout, 0);
    process.stdout.write(
      `${c.cyan}Pages:${c.white}${pagesCount}${c.reset}  ` +
      `${c.cyan}Assets:${c.white}${assetsCount}${c.reset}  ` +
      `${c.cyan}Queue:${c.white}${queuedCount}${c.reset}  ` +
      `${c.green}${mbDownloaded} MB (${speed} MB/s)${c.reset}  ` +
      `${c.gray}RAM:${memUsage}MB${c.reset}  ` +
      `${c.yellow}Workers:${this.activeWorkers}/${this.config.concurrency}${c.reset}   `
    );
  }

  async start() {
    await fsp.mkdir(this.outputDir, { recursive: true });
    await this.loadCheckpointIfPresent();

    console.log(`${c.brightCyan}[+] Target:       ${c.white}${this.targetUrl.href}${c.reset}`);
    console.log(`${c.brightCyan}[+] Output:       ${c.white}${this.outputDir}${c.reset}`);
    const engineName = this.systemBrowser ? `High-Fidelity Browser (${path.basename(this.systemBrowser)})` : 'Fast Async HTTP';
    console.log(`${c.brightCyan}[+] Engine:       ${c.white}${engineName}${c.reset}`);
    console.log(`${c.brightCyan}[+] Concurrency:  ${c.gray}${this.config.concurrency} workers | Depth ${this.config.maxDepth}${c.reset}`);
    if (this.config.cookies) {
      console.log(`${c.yellow}[!] Auth:         Session cookie injected${c.reset}`);
    }
    console.log('');

    await this.autoSeedSitemap();

    const checkpointInterval = setInterval(() => {
      this.saveCheckpoint();
    }, 4000);

    const timer = setInterval(() => {
      this.renderDashboard();
    }, 200);

    const workers = [];
    for (let i = 0; i < this.config.concurrency; i++) {
      workers.push(this.runWorker());
    }

    await Promise.all(workers);
    clearInterval(timer);
    clearInterval(checkpointInterval);
    this.renderDashboard();
    console.log('\n');

    console.log(`${c.yellow}[*] Finalizing offline links and generating route tree...${c.reset}`);
    await this.rewriteOfflineLinks();

    const manifest = {
      target: this.targetUrl.href,
      timestamp: new Date().toISOString(),
      durationSeconds: ((Date.now() - this.startTime) / 1000).toFixed(1),
      totalPages: this.crawledPageRecords.size,
      totalAssets: this.assetRecords.size,
      totalBytes: this.bytesDownloaded,
      endpointsDiscovered: this.endpointsFound.length,
      errorsCount: this.errors.length,
      config: this.config,
    };
    await fsp.writeFile(path.join(this.outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    await fsp.writeFile(path.join(this.outputDir, 'sitemap.json'), JSON.stringify(this.sitemapEntries, null, 2), 'utf-8');

    if (this.endpointsFound.length > 0) {
      await fsp.writeFile(path.join(this.outputDir, 'endpoints_and_keys.json'), JSON.stringify(this.endpointsFound, null, 2), 'utf-8');
    }

    if (this.errors.length > 0) {
      await fsp.writeFile(path.join(this.outputDir, 'errors.json'), JSON.stringify(this.errors, null, 2), 'utf-8');
    }

    await this.writeSummaryReport(manifest);

    if (this.config.createZipArchive) {
      await this.generateZipPackage();
    }

    try {
      if (fs.existsSync(this.stateFilePath)) await fsp.unlink(this.stateFilePath);
    } catch {}

    this.printSummary(manifest);
  }

  async generateZipPackage() {
    const parentDir = path.dirname(this.outputDir);
    const folderName = path.basename(this.outputDir);
    const zipPath = `${this.outputDir}.zip`;

    console.log(`${c.yellow}[*] Creating ZIP archive...${c.reset}`);
    await new Promise((resolve) => {
      execFile('tar.exe', ['-a', '-cf', zipPath, '-C', parentDir, folderName], async (err) => {
        if (!err && fs.existsSync(zipPath)) {
          const stat = await fsp.stat(zipPath);
          const zipMb = (stat.size / (1024 * 1024)).toFixed(2);
          this.zipArchiveInfo = { path: zipPath, sizeMb: zipMb };
          console.log(`${c.brightGreen}[+] Archive created: ${c.white}${zipPath} (${zipMb} MB)${c.reset}`);
          resolve();
        } else {
          exec(`powershell.exe -NoProfile -Command "Compress-Archive -Path '${this.outputDir}' -DestinationPath '${zipPath}' -Force"`, async (psErr) => {
            if (!psErr && fs.existsSync(zipPath)) {
              const stat = await fsp.stat(zipPath);
              const zipMb = (stat.size / (1024 * 1024)).toFixed(2);
              this.zipArchiveInfo = { path: zipPath, sizeMb: zipMb };
              console.log(`${c.brightGreen}[+] Archive created: ${c.white}${zipPath} (${zipMb} MB)${c.reset}`);
            }
            resolve();
          });
        }
      });
    });
  }

  async writeSummaryReport(manifest) {
    const lines = [];
    lines.push('======================================================================');
    lines.push('  NETHARVEST DUMP REPORT');
    lines.push('======================================================================');
    lines.push(`Target Website:        ${this.targetUrl.href}`);
    lines.push(`Harvest Date:          ${manifest.timestamp}`);
    lines.push(`Duration:              ${manifest.durationSeconds}s`);
    lines.push(`Total Transferred:     ${(manifest.totalBytes / (1024 * 1024)).toFixed(2)} MB`);
    lines.push(`Total Pages Dumped:    ${manifest.totalPages}`);
    lines.push(`Total Assets Saved:    ${manifest.totalAssets}`);
    lines.push(`Discovered Endpoints:  ${manifest.endpointsDiscovered}`);
    lines.push(`Errors Encountered:    ${manifest.errorsCount}`);
    lines.push('');

    const assetCategories = {
      css: 0,
      js: 0,
      images: 0,
      fonts: 0,
      media: 0,
      documents: 0,
      other: 0,
    };
    for (const record of this.assetRecords.values()) {
      if (assetCategories[record.category] !== undefined) {
        assetCategories[record.category]++;
      } else {
        assetCategories.other++;
      }
    }

    lines.push('======================================================================');
    lines.push('  ASSET BREAKDOWN');
    lines.push('======================================================================');
    lines.push(`Stylesheets (CSS):     ${assetCategories.css}`);
    lines.push(`Scripts (JS):          ${assetCategories.js}`);
    lines.push(`Images:                ${assetCategories.images}`);
    lines.push(`Web Fonts:             ${assetCategories.fonts}`);
    lines.push(`Media (Audio/Video):   ${assetCategories.media}`);
    lines.push(`Documents:             ${assetCategories.documents}`);
    lines.push(`Other Assets:          ${assetCategories.other}`);
    lines.push('');

    lines.push('======================================================================');
    lines.push('  INDEX OF DUMPED PAGES');
    lines.push('======================================================================');
    if (this.sitemapEntries.length === 0) {
      lines.push('(No pages indexed)');
    } else {
      for (const entry of this.sitemapEntries) {
        lines.push(`- [Depth ${entry.depth}] ${entry.title}`);
        lines.push(`  URL:  ${entry.url}`);
        lines.push(`  Path: ${entry.localPath}`);
      }
    }
    lines.push('');

    if (this.endpointsFound.length > 0) {
      lines.push('======================================================================');
      lines.push('  DISCOVERED KEYS & ENDPOINTS');
      lines.push('======================================================================');
      for (const ep of this.endpointsFound) {
        lines.push(`- [${ep.type}] ${ep.value}`);
        lines.push(`  Source: ${ep.foundIn}`);
      }
      lines.push('');
    }

    lines.push('======================================================================');
    lines.push(`  ERRORS & FAILED REQUESTS (${this.errors.length})`);
    lines.push('======================================================================');
    if (this.errors.length === 0) {
      lines.push('None. All requests completed successfully.');
    } else {
      for (const err of this.errors) {
        lines.push(`- [${err.type.toUpperCase()}] ${err.url}`);
        if (err.status) lines.push(`  HTTP Status: ${err.status}`);
        if (err.error) lines.push(`  Details:     ${err.error}`);
      }
    }
    lines.push('');

    lines.push('======================================================================');
    lines.push('  OFFLINE ENTRYPOINT');
    lines.push('======================================================================');
    lines.push('Open in your browser:');
    lines.push(path.join(this.outputDir, 'offline', 'index.html'));
    lines.push('======================================================================');

    await fsp.writeFile(path.join(this.outputDir, 'dump_summary.txt'), lines.join('\n'), 'utf-8');
  }

  printSummary(manifest) {
    console.log(`${c.brightGreen}${c.bold}======================================================================${c.reset}`);
    console.log(`${c.brightGreen}${c.bold}  HARVEST COMPLETE${c.reset}`);
    console.log(`${c.brightGreen}${c.bold}======================================================================${c.reset}`);
    console.log(`  Target:       ${c.white}${this.targetUrl.href}${c.reset}`);
    console.log(`  Duration:     ${c.white}${manifest.durationSeconds}s${c.reset}`);
    console.log(`  Pages:        ${c.brightGreen}${manifest.totalPages}${c.reset}`);
    console.log(`  Assets:       ${c.brightGreen}${manifest.totalAssets}${c.reset}`);
    console.log(`  Transferred:  ${c.white}${(manifest.totalBytes / (1024 * 1024)).toFixed(2)} MB${c.reset}`);
    if (manifest.endpointsDiscovered > 0) {
      console.log(`  Findings:     ${c.brightYellow}${manifest.endpointsDiscovered} items (see endpoints_and_keys.json)${c.reset}`);
    }

    console.log(`\n  Structure:`);
    console.log(`    offline/               Relative offline browser mirror`);
    if (this.config.exportReaderMode) {
      console.log(`    reader_view/           Clean text markdown per page`);
    }
    if (this.config.unpackSourceMaps) {
      console.log(`    unpacked_source/       Reconstructed frontend source code`);
    }
    console.log(`    dump_summary.txt       Readable report (pages, assets, errors)`);
    console.log(`    sitemap.json           Route and title registry`);
    console.log(`    manifest.json          Session performance telemetry`);
    if (manifest.endpointsDiscovered > 0) {
      console.log(`    endpoints_and_keys.json Discovered keys and API endpoints`);
    }

    console.log(`\n  Entrypoint:`);
    console.log(`    ${c.white}${path.join(this.outputDir, 'offline', 'index.html')}${c.reset}`);
    if (this.zipArchiveInfo) {
      console.log(`\n  Archive:`);
      console.log(`    ${c.white}${this.zipArchiveInfo.path} (${this.zipArchiveInfo.sizeMb} MB)${c.reset}\n`);
    } else {
      console.log('');
    }
  }
}

function getAvailablePort(startPort = 9473) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(getAvailablePort(startPort + 1)));
    s.once('listening', () => {
      s.close(() => resolve(startPort));
    });
    s.listen({ port: startPort, host: '127.0.0.1', exclusive: true });
  });
}

async function startPreviewServer(targetDirectory, initialPort = 9473) {
  const rootDir = path.resolve(targetDirectory);
  const port = await getAvailablePort(initialPort);

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      let reqPath = decodeURIComponent(parsedUrl.pathname);

      if (reqPath.endsWith('/') || reqPath === '') {
        reqPath += 'index.html';
      }

      let filePath = path.join(rootDir, reqPath);

      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Access Denied');
        return;
      }

      if (!fs.existsSync(filePath)) {
        if (fs.existsSync(filePath + '.html')) {
          filePath += '.html';
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
      }

      const stat = await fsp.stat(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      const fileStream = fs.createReadStream(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });
      fileStream.pipe(res);

    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal Server Error: ${err.message}`);
    }
  });

  server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
    const localUrl = `http://127.0.0.1:${port}`;
    console.log(`${c.brightGreen}[+] Preview server active at ${c.white}${c.bold}${localUrl}${c.reset}`);
    console.log(`${c.gray}    Serving root: ${rootDir}${c.reset}`);
    console.log(`${c.gray}    Press Ctrl+C to terminate server.${c.reset}\n`);

    exec(`start "" "${localUrl}"`);
  });
}

async function main() {
  printBanner();

  const args = process.argv.slice(2);

  const serveIdx = args.findIndex(a => a === '--serve' || a === '-s');
  if (serveIdx !== -1) {
    const serveFolder = args[serveIdx + 1] || './dumps';
    startPreviewServer(serveFolder);
    return;
  }

  const config = { ...DEFAULT_CONFIG };
  const directUrl = args.find(a => a.startsWith('http://') || a.startsWith('https://'));

  const outFlagIdx = args.findIndex(a => a === '-o' || a === '--output');
  if (outFlagIdx !== -1 && args[outFlagIdx + 1]) {
    config.outputDir = path.resolve(args[outFlagIdx + 1]);
  }

  const cookieFlagIdx = args.findIndex(a => a === '--cookie' || a === '-c');
  if (cookieFlagIdx !== -1 && args[cookieFlagIdx + 1]) {
    config.cookies = args[cookieFlagIdx + 1];
  }

  if (args.includes('--no-zip')) {
    config.createZipArchive = false;
  }

  let rl = createPrompt();

  if (directUrl && (args.includes('--yes') || !process.stdin.isTTY)) {
    config.url = directUrl;
    console.log(`${c.cyan}[*] Direct capture: ${config.url}${c.reset}`);
  } else {
    console.log(`${c.brightCyan}${c.bold}Select Harvester Profile:${c.reset}`);
    console.log(`  ${c.white}[1]${c.reset} High-Fidelity Mirror ${c.gray}(Chrome/Edge engine, executes JS, loads icons/fonts, full CSS)${c.reset}`);
    console.log(`  ${c.white}[2]${c.reset} Fast Mirror          ${c.gray}(Asynchronous HTTP, depth 3, 8 workers, asset rewrite)${c.reset}`);
    console.log(`  ${c.white}[3]${c.reset} Deep Extraction      ${c.gray}(Depth 6, subdomains, source maps, security endpoints)${c.reset}`);
    console.log(`  ${c.white}[4]${c.reset} Reader Mode          ${c.gray}(Depth 2, locked path prefix, clean reader markdown)${c.reset}`);
    console.log(`  ${c.white}[5]${c.reset} Custom Config        ${c.gray}(Custom depth, threads, browser toggle, cookies, rate limits)${c.reset}\n`);

    const mode = await ask(rl, 'Profile selection', '1');

    if (mode === '1') {
      config.useBrowserEngine = true;
      config.maxDepth = 3;
      config.concurrency = 5;
    } else if (mode === '2') {
      config.useBrowserEngine = false;
      config.maxDepth = 3;
      config.concurrency = 8;
    } else if (mode === '3') {
      config.maxDepth = 6;
      config.concurrency = 6;
      config.includeSubdomains = true;
      config.unpackSourceMaps = true;
      config.scanEndpoints = true;
      config.autoSeedSitemap = true;
    } else if (mode === '4') {
      config.useBrowserEngine = false;
      config.maxDepth = 2;
      config.concurrency = 6;
      config.pathPrefixLock = true;
      config.exportReaderMode = true;
    } else if (mode === '5') {
      console.log(`\n${c.gray}----------------------------------------------------------------------${c.reset}`);
      const browserAns = await ask(rl, 'Use headless browser engine for post-JS DOM? (y/n)', 'y');
      config.useBrowserEngine = browserAns.toLowerCase().startsWith('y');

      const depthAns = await ask(rl, 'Max crawl depth (1-10)', '3');
      config.maxDepth = parseInt(depthAns, 10) || 3;

      const workersAns = await ask(rl, 'Concurrent worker threads (1-20)', '6');
      config.concurrency = Math.min(20, Math.max(1, parseInt(workersAns, 10) || 6));

      const delayAns = await ask(rl, 'Request delay in ms (0-2000)', '25');
      config.delayMs = parseInt(delayAns, 10) || 0;

      const subdomainsAns = await ask(rl, 'Crawl subdomains? (y/n)', 'n');
      config.includeSubdomains = subdomainsAns.toLowerCase().startsWith('y');

      const prefixLockAns = await ask(rl, 'Lock crawler strictly inside target path prefix? (y/n)', 'n');
      config.pathPrefixLock = prefixLockAns.toLowerCase().startsWith('y');

      const sitemapAns = await ask(rl, 'Auto-seed URLs from /sitemap.xml and robots.txt? (y/n)', 'y');
      config.autoSeedSitemap = sitemapAns.toLowerCase().startsWith('y');

      const cookieAns = await ask(rl, 'Session Cookie header (optional)', '');
      config.cookies = cookieAns;

      const mediaAns = await ask(rl, 'Download large media files (mp4, webm, mp3)? (y/n)', 'n');
      config.downloadMedia = mediaAns.toLowerCase().startsWith('y');

      const mapAns = await ask(rl, 'Reconstruct frontend source code from .map files? (y/n)', 'y');
      config.unpackSourceMaps = mapAns.toLowerCase().startsWith('y');

      const endpointsAns = await ask(rl, 'Scan JS & HTML for internal routes & keys? (y/n)', 'y');
      config.scanEndpoints = endpointsAns.toLowerCase().startsWith('y');

      const readerAns = await ask(rl, 'Generate clean Reader View markdown copies? (y/n)', 'y');
      config.exportReaderMode = readerAns.toLowerCase().startsWith('y');

      const zipAns = await ask(rl, 'Compress dump into .zip archive? (y/n)', 'y');
      config.createZipArchive = zipAns.toLowerCase().startsWith('y');
      console.log(`${c.gray}----------------------------------------------------------------------${c.reset}\n`);
    }

    let urlInput = directUrl || '';
    while (!urlInput) {
      const entered = await ask(rl, 'Target URL');
      try {
        let fmt = entered.trim();
        if (!fmt.startsWith('http://') && !fmt.startsWith('https://')) {
          fmt = 'https://' + fmt;
        }
        new URL(fmt);
        urlInput = fmt;
      } catch {
        console.log(`${c.brightRed}[!] Invalid URL format. Example: https://domain.com${c.reset}`);
      }
    }

    config.url = urlInput;

    const urlObj = new URL(urlInput);
    const hostFolder = sanitizeSafe(urlObj.hostname);
    const baseScriptDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([a-zA-Z]:)/, '$1');
    const suggestedDir = config.outputDir || path.join(baseScriptDir, 'dumps', hostFolder);

    const outAnswer = await ask(rl, 'Destination folder', suggestedDir);
    config.outputDir = path.resolve(outAnswer.trim() || suggestedDir);
  }

  const harvester = new NetHarvest(config);

  process.on('SIGINT', async () => {
    if (harvester.isAborted) {
      console.log(`\n${c.brightRed}[!] Forcing immediate exit.${c.reset}`);
      process.exit(1);
    }
    console.log(`\n\n${c.brightYellow}[!] Interrupt received. Preserving downloaded assets and finalizing links...${c.reset}`);
    harvester.isAborted = true;
  });

  try {
    await harvester.start();

    if (!args.includes('--yes') && process.stdin.isTTY) {
      const serverChoice = await ask(rl, 'Launch local preview server? (y/n)', 'y');
      rl.close();

      if (serverChoice.toLowerCase().startsWith('y')) {
        const offlineDir = path.join(harvester.outputDir, 'offline');
        startPreviewServer(offlineDir);
      }
    } else {
      rl.close();
    }
  } catch (err) {
    console.error(`\n${c.brightRed}[!] Engine failure:${c.reset}`, err);
    rl.close();
  }
}

main();

# NetHarvest

High-precision web archiver and offline mirroring engine with headless browser rendering, universal asset preservation, and intelligent link resolution.

NetHarvest downloads complete, fully functional offline mirrors of modern websites. It executes client-side JavaScript via system headless browsers (Chrome or Edge) to capture the real DOM as rendered live, automatically pulls in external CDN assets, reconstructs frontend source trees from `.map` files, normalizes button and link routing, and bundles the output into browsable folders and portable `.zip` archives.

---

## Features

* **High-Fidelity Browser Engine:** Leverages system Chrome or Edge installations in headless mode (`--headless=new --dump-dom`) to execute client-side JavaScript, hydrate dynamic SPAs (React, Vue, Next.js, Webflow), and capture the post-render DOM.
* **Universal Asset Preservation:** Automatically pulls in Google Fonts, external CDNs (Cloudflare, jsDelivr, unpkg), AWS S3/Cloudinary media, responsive `srcset` resolution variants, and SVG sprite sheets (`<use href="...">`).
* **Deep Button & Link Resolution:** Normalizes paths, trailing slashes, fragments (`#`), form actions, `onclick` handlers, and `data-href` attributes so clicking any button routes strictly to local offline files.
* **Client-Side Router Neutralizer:** Injects an offline click controller to prevent single-page application routers from intercepting navigation and crashing with live network errors.
* **Conflict-Free Preview Web Server:** Built-in local HTTP preview server bound to `127.0.0.1:9473` with automatic port stepping to avoid conflicts with background services (PostgreSQL, Apache, IIS).
* **Automated Route Seeding:** Scans `/sitemap.xml`, `/sitemap_index.xml`, and `/robots.txt` before crawling to discover unlinked and deep archive pages.
* **Source Map Decompiler:** Locates and extracts frontend `.map` files, reconstructing original source trees (TypeScript, JSX, Vue components) into an `unpacked_source/` folder.
* **Security & Route Audit:** Passively scans crawled HTML and JavaScript bundles for exposed API keys, JWT tokens, endpoints, and internal routes.
* **Clean Reader Markdown:** Generates distraction-free Markdown files per page (stripped of navigation, footers, and cookie overlays).
* **Automatic ZIP Packaging:** Automatically compresses the completed dump into a `<domain>.zip` archive alongside the output folder.
* **Zero Dependencies:** Pure Node.js utilizing standard platform libraries. No third-party package installations required.

---

## Prerequisites

* **Node.js:** v18.0.0 or higher.
* **Browser (Optional for High-Fidelity Mode):** Google Chrome or Microsoft Edge installed on the host system. If neither is available, NetHarvest automatically falls back to asynchronous HTTP fetching.

---

## Installation & Quickstart

Clone the repository:

```bash
git clone https://github.com/your-username/netharvest.git
cd netharvest
```

### 1. Interactive Wizard

Run without arguments to launch the terminal wizard:

```bash
node netharvest.js
```

*(On Windows, you can also double-click `netharvest.bat`).*

### 2. Direct CLI Capture

Capture a website directly using default settings:

```bash
node netharvest.js https://example.com --yes
```

### 3. Custom Output Location

Specify a custom destination directory:

```bash
node netharvest.js https://example.com -o ./archives/my-site --yes
```

### 4. Authenticated Capture (Session Cookies)

Scrape private portals or member dashboards using session cookies:

```bash
node netharvest.js https://example.com/dashboard -c "session=abc123xyz" --yes
```

### 5. Preview Server

Launch the local web server to view any previously dumped site:

```bash
node netharvest.js --serve ./dumps/example.com/offline
```

---

## Global Command Setup

To run `netharvest` from any directory across your system:

### Windows (npm link)

```bash
npm link
```

Now you can run `netharvest` anywhere:

```bash
netharvest https://example.com
```

---

## Output Structure

Dumps are organized by website domain:

```text
dumps/
└── example.com/
    ├── offline/                     Relative-linked, offline-browsable copy
    │   ├── index.html               Double-click or preview in browser
    │   ├── docs/
    │   │   └── index.html
    │   └── assets/
    │       ├── css/                 Rewritten stylesheets with local url() links
    │       ├── js/                  Preserved scripts
    │       ├── images/              All logos, icons, and SVG sprites
    │       └── fonts/               Localized webfonts (woff2, ttf)
    ├── reader_view/                 Distraction-free Markdown per page
    ├── unpacked_source/             Decompiled frontend source files (from .map)
    ├── dump_summary.txt             Human-readable audit report & error ledger
    ├── sitemap.json                 Indexed route registry
    ├── manifest.json                Session telemetry & crawl configuration
    └── endpoints_and_keys.json      Discovered API keys, routes & tokens
dumps/
└── example.com.zip                  Standalone portable archive
```

---

## Command Line Flags

| Flag | Description |
| :--- | :--- |
| `<url>` | Target website address (e.g. `https://example.com`) |
| `--yes`, `-y` | Run non-interactively using optimal defaults |
| `-o`, `--output <dir>` | Specify custom output directory |
| `-c`, `--cookie <str>` | Pass raw cookie header for authenticated sessions |
| `-s`, `--serve [dir]` | Launch local HTTP preview server |
| `--no-zip` | Disable automatic `.zip` compression |

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

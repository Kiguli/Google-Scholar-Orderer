# Google Scholar Orderer

A browser extension that enhances Google Scholar with citation-based sorting and CORE venue ranking badges.

![Scholar Owl Logo](icons/icon128.png)

## Features

- **Sort by Citations**: Reorder search results by citation count (high to low or low to high)
- **CORE Ranking Badges**: Display color-coded badges showing venue rankings (A*, A, B, C)
- **Author Profile Analysis**: View ranking distribution bar on author profile pages
- **Tooltips**: Hover over badges to see full venue names and ranking details

### Badge Colors
- 🟢 **A*** - Top-tier venues (dark green)
- 🟢 **A** - Excellent venues (green)
- 🟡 **B** - Good venues (yellow)
- ⚫ **C** - Other ranked venues (gray)

## Installation

### Google Chrome

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the `Google-Scholar-Orderer` folder
6. The extension icon should appear in your toolbar

### Microsoft Edge

1. Download or clone this repository
2. Open Edge and go to `edge://extensions/`
3. Enable **Developer mode** (toggle in left sidebar)
4. Click **Load unpacked**
5. Select the `Google-Scholar-Orderer` folder

### Mozilla Firefox

1. Download or clone this repository
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on**
4. Select the `manifest.json` file from the `Google-Scholar-Orderer` folder

> **Note**: Firefox loads the extension temporarily. It will be removed when Firefox restarts. For permanent installation, the extension would need to be signed by Mozilla.

### Brave Browser

1. Download or clone this repository
2. Open Brave and go to `brave://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the `Google-Scholar-Orderer` folder

### Opera

1. Download or clone this repository
2. Open Opera and go to `opera://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the `Google-Scholar-Orderer` folder

## Usage

1. Go to [Google Scholar](https://scholar.google.com)
2. Search for any topic
3. Use the **Sort by** dropdown above results to reorder by citations
4. Look for colored badges next to venue names indicating CORE rankings
5. Visit an author's profile page to see their publication ranking distribution

## Supported Google Scholar Domains

The extension works on all major Google Scholar regional domains including:
- scholar.google.com
- scholar.google.co.uk
- scholar.google.de
- scholar.google.fr
- And 20+ more regional variants

## Data Source

Venue rankings are based on the [CORE Rankings](https://www.core.edu.au/conference-portal) database, which evaluates computing research venues worldwide.

## License

MIT License

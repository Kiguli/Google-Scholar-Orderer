# Google Scholar Orderer

A browser extension that enhances Google Scholar with citation-based sorting, multiple venue ranking systems (CORE, SJR, JCR), and smart venue matching for truncated names.

![Scholar Owl Logo](icons/icon128.png)

## Features

### Search Results Page
- **Sort by Citations**: Reorder search results by citation count (high to low or low to high)
- **Multi-Source Ranking Badges**: Display color-coded badges showing venue rankings from multiple sources:
  - **CORE Rankings** (A*, A, B, C) - Conference and journal quality rankings
  - **SJR Quartiles** (Q1-Q4) - Scimago Journal Rankings
  - **JCR Quartiles** (Q1-Q4) - Journal Citation Reports
  - **h5-index** - Google Scholar's 5-year h-index for venues
- **Smart Venue Matching**: Automatically matches venues even when Google Scholar truncates long names
- **Lazy Lookup Button**: Click the "?" button on unmatched venues to fetch the full venue name and find its ranking
- **Rich Tooltips**: Hover over badges to see full venue names, all ranking metrics, and impact factors

### Author Profile Page
- **Ranking Distribution Bar**: Visual breakdown of an author's publications by CORE ranking
- **Per-Publication Badges**: See ranking badges next to each publication in the author's list
- **Statistics Summary**: Total publications count and percentage of ranked venues

### Badge Colors

**CORE Rankings:**
- **A*** - Top-tier venues (dark green)
- **A** - Excellent venues (green)
- **B** - Good venues (yellow)
- **C** - Other ranked venues (gray)

**SJR Quartiles** (blue shades):
- **Q1** - Dark blue
- **Q2** - Medium blue
- **Q3** - Light blue
- **Q4** - Pale blue

**JCR Quartiles** (orange shades):
- **Q1** - Dark orange
- **Q2** - Medium orange
- **Q3** - Light orange
- **Q4** - Pale orange

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
4. Look for colored badges next to venue names indicating rankings
5. Click the **?** button on unmatched venues to lookup their full name and ranking
6. Hover over any badge to see detailed ranking information
7. Visit an author's profile page to see their publication ranking distribution

## How It Works

### Venue Matching
The extension extracts venue names from Google Scholar's author line (e.g., "Author1, Author2 - Journal Name, 2023 - publisher.com") and matches them against a local database of ranked venues.

### Handling Truncated Names
Google Scholar often truncates long venue names with "...". The extension handles this by:
1. **Exact matching** - If the extracted name matches a venue in the database
2. **Prefix matching** - If exactly one venue in the database starts with the truncated name
3. **Lazy lookup** - Shows a "?" button that fetches the full venue name from Google Scholar's citation data

### Privacy
All venue matching happens locally in your browser. The extension only makes network requests when you click the "?" button to fetch citation information from Google Scholar itself.

## Supported Google Scholar Domains

The extension works on all major Google Scholar regional domains including:
- scholar.google.com
- scholar.google.co.uk
- scholar.google.de
- scholar.google.fr
- scholar.google.es
- scholar.google.it
- scholar.google.com.au
- And 20+ more regional variants

## Data Sources

- **CORE Rankings**: [CORE Conference Portal](https://www.core.edu.au/conference-portal) - Evaluates computing research venues worldwide
- **SJR**: [Scimago Journal Rankings](https://www.scimagojr.com/) - Journal rankings based on citation data from Scopus
- **JCR**: Journal Citation Reports - Impact factors and quartile rankings
- **h5-index**: Google Scholar Metrics - 5-year h-index for academic venues

## Contributing

Contributions are welcome! If you find a venue that should be ranked or notice incorrect rankings, please open an issue or submit a pull request.

## License

MIT License

/**
 * Google Scholar Orderer
 * Sorts search results by citations and displays venue rankings (CORE, SJR, JCR, h5-index)
 */

(function() {
  'use strict';

  // ============================================
  // Configuration
  // ============================================

  const CONFIG = {
    selectors: {
      // Search results page selectors
      resultsContainer: '#gs_res_ccl_mid',
      resultItem: '.gs_r.gs_or.gs_scl',
      authorLine: '.gs_a',
      citationLink: '.gs_fl a',
      searchBar: '#gs_hdr_tsi',
      // Author profile page selectors
      profileContainer: '#gsc_a_b',
      profileResultItem: '.gsc_a_tr',
      profileVenueLine: '.gs_gray',  // The venue is in the gray text (third line)
      profileCitationCell: '.gsc_a_c'
    },
    // CORE ranking badge colors
    coreBadges: {
      'A*': { color: '#1e7e34', textColor: '#ffffff' },
      'A':  { color: '#28a745', textColor: '#ffffff' },
      'B':  { color: '#ffc107', textColor: '#212529' },
      'C':  { color: '#6c757d', textColor: '#ffffff' }
    },
    // SJR quartile colors
    sjrBadges: {
      'Q1': { color: '#1565c0', textColor: '#ffffff' },
      'Q2': { color: '#42a5f5', textColor: '#ffffff' },
      'Q3': { color: '#90caf9', textColor: '#212529' },
      'Q4': { color: '#bbdefb', textColor: '#212529' }
    },
    // JCR quartile colors (using orange tones to differentiate from SJR)
    jcrBadges: {
      'Q1': { color: '#e65100', textColor: '#ffffff' },
      'Q2': { color: '#fb8c00', textColor: '#ffffff' },
      'Q3': { color: '#ffb74d', textColor: '#212529' },
      'Q4': { color: '#ffe0b2', textColor: '#212529' }
    }
  };

  // ============================================
  // State
  // ============================================

  let rankingsData = null;
  let originalOrder = [];
  let currentSort = 'default';

  // ============================================
  // Inject CSS Styles
  // ============================================

  function injectStyles() {
    if (document.getElementById('gs-orderer-styles')) return;

    const style = document.createElement('style');
    style.id = 'gs-orderer-styles';
    style.textContent = `
      .gs-orderer-fetch-btn:hover:not(:disabled) {
        background: #1a73e8 !important;
        color: white !important;
      }
      .gs-orderer-fetch-btn:disabled {
        opacity: 0.6;
        cursor: wait !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Inject styles immediately
  injectStyles();

  // ============================================
  // Rankings Data Loader
  // ============================================

  async function loadRankingsData() {
    try {
      const url = chrome.runtime.getURL('data/core-rankings.json');
      const response = await fetch(url);
      rankingsData = await response.json();
      console.log('[Scholar Orderer] Loaded rankings data:', Object.keys(rankingsData.conferences).length, 'conferences,', Object.keys(rankingsData.journals).length, 'journals');
    } catch (error) {
      console.error('[Scholar Orderer] Failed to load rankings data:', error);
      rankingsData = { conferences: {}, journals: {}, aliases: {} };
    }
  }

  // ============================================
  // Citation Parsing
  // ============================================

  function getCitationCount(resultElement) {
    const links = resultElement.querySelectorAll(CONFIG.selectors.citationLink);
    for (const link of links) {
      const text = link.textContent;
      const match = text.match(/Cited by (\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return 0;
  }

  // ============================================
  // Venue Extraction & Matching
  // ============================================

  function normalizeString(str) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Find citation info URL for a result element
   * Returns a URL that can be fetched to get the citation popup with full venue name
   */
  function findCiteInfo(resultElement) {
    // Try to get the article ID from the result element itself
    let articleId = resultElement.getAttribute('data-cid') || resultElement.getAttribute('data-aid');

    // If not found, look in the cite link's data attributes
    if (!articleId) {
      const citeLink = resultElement.querySelector('a.gs_or_cit, a[onclick*="gs_ocit"]');
      if (citeLink) {
        articleId = citeLink.getAttribute('data-aid');

        // Try parsing from onclick handler: gs_ocit(event,'ARTICLE_ID')
        if (!articleId) {
          const onclick = citeLink.getAttribute('onclick') || '';
          const match = onclick.match(/gs_ocit\s*\(\s*event\s*,\s*'([^']+)'/);
          if (match) {
            articleId = match[1];
          }
        }
      }
    }

    // Also try finding it in any link with gs_fl class
    if (!articleId) {
      const links = resultElement.querySelectorAll('.gs_fl a, .gs_flb a');
      for (const link of links) {
        const onclick = link.getAttribute('onclick') || '';
        const match = onclick.match(/gs_ocit\s*\(\s*event\s*,\s*'([^']+)'/);
        if (match) {
          articleId = match[1];
          break;
        }
      }
    }

    if (articleId) {
      console.log('[Scholar Orderer] Found article ID:', articleId);
      return `${window.location.origin}/scholar?q=info:${articleId}:scholar.google.com/&output=cite&scirp=0&hl=en`;
    }

    console.log('[Scholar Orderer] Could not find article ID for result');
    return null;
  }

  function extractVenueFromAuthorLine(authorLineText, debugIndex = null) {
    // Extract venue from author line (no HTTP requests needed)
    // Google Scholar author line formats:
    // "Author1, Author2 - Journal Name, 2023 - publisher.com"
    // "Author1, Author2 - Conference Name, 2023 - dl.acm.org"

    const debug = (msg) => {
      if (debugIndex !== null) {
        console.log(`[Scholar Orderer] Result ${debugIndex} extraction: ${msg}`);
      }
    };

    if (!authorLineText) {
      debug('No author line text');
      return null;
    }

    debug(`Raw input: "${authorLineText}"`);

    // Debug: show character codes around dashes to understand the separator
    const dashMatches = authorLineText.match(/.\s*[-–—]\s*./g);
    if (dashMatches) {
      debug(`Dash patterns found: ${JSON.stringify(dashMatches)}`);
    }

    // Split on various dash patterns that Google Scholar uses
    // This handles: " - " (space-hyphen-space), " – " (en-dash), " — " (em-dash)
    const parts = authorLineText.split(/\s+[-–—]\s+/);
    debug(`Split into ${parts.length} parts: ${JSON.stringify(parts)}`);

    if (parts.length < 2) {
      debug('Not enough parts (need at least 2)');
      return null;
    }

    // Known publishers that appear as standalone parts in author lines (not as part of venue names)
    const knownPublishers = ['springer', 'elsevier', 'wiley', 'mdpi', 'taylor & francis', 'oxford', 'cambridge', 'mit press', 'sciencedirect', 'arxiv', 'ssrn', 'researchgate', 'academia'];

    for (let i = 1; i < parts.length; i++) {
      let part = parts[i].trim();
      debug(`Checking part[${i}]: "${part}"`);

      // Skip year-only parts
      if (/^\d{4}$/.test(part)) {
        debug(`  -> Skipped: year-only`);
        continue;
      }
      // Skip publisher URLs
      if (part.includes('.com') || part.includes('.org') || part.includes('.edu') ||
          part.includes('.net') || part.includes('.io') || part.includes('.gov') ||
          part.includes('.ac.') || part.includes('.co.')) {
        debug(`  -> Skipped: contains URL domain`);
        continue;
      }
      // Skip known publisher names
      if (knownPublishers.some(pub => part.toLowerCase() === pub)) {
        debug(`  -> Skipped: known publisher name`);
        continue;
      }

      debug(`  -> Processing this part`);
      const originalPart = part;

      // Clean up the venue part
      // First remove leading ellipsis (truncated start)
      part = part.replace(/^…\s*/, '').trim();
      if (part !== originalPart) debug(`  After leading ellipsis removal: "${part}"`);

      // Remove trailing ellipsis with optional year: "… , 2004" or just "…"
      let prev = part;
      part = part.replace(/\s*…\s*(,\s*\d{4}.*)?$/, '').trim();
      if (part !== prev) debug(`  After trailing ellipsis removal: "${part}"`);

      prev = part;
      part = part.replace(/,\s*\d{4}.*$/, '').trim();  // Remove ", 2023" and after
      if (part !== prev) debug(`  After comma+year removal: "${part}"`);

      prev = part;
      part = part.replace(/\s+\d{4}$/, '').trim();     // Remove trailing year
      if (part !== prev) debug(`  After trailing year removal: "${part}"`);

      prev = part;
      part = part.replace(/\s+\d+\s*\(\d+\).*$/, '').trim();  // Remove volume/issue
      if (part !== prev) debug(`  After volume/issue removal: "${part}"`);

      prev = part;
      part = part.replace(/,?\s*\d+-\d+\s*$/, '').trim();     // Remove page numbers
      if (part !== prev) debug(`  After page numbers removal: "${part}"`);

      prev = part;
      part = part.replace(/,\s*$/, '').trim();  // Remove trailing comma
      if (part !== prev) debug(`  After trailing comma removal: "${part}"`);

      // Clean up common prefixes for better matching
      prev = part;
      part = part.replace(/^Proceedings of (the\s+)?/i, '').trim();
      if (part !== prev) debug(`  After "Proceedings of" removal: "${part}"`);

      // Remove organization prefixes ONLY when followed by ordinals (conference pattern)
      prev = part;
      part = part.replace(/^(ACM\/IEEE|IEEE\/ACM|ACM|IEEE)\s+\d+(st|nd|rd|th)\s+/i, '').trim();
      if (part !== prev) debug(`  After org+ordinal removal: "${part}"`);

      // Remove standalone ordinal numbers like "45th", "16th", "1st", "2nd", "3rd"
      prev = part;
      part = part.replace(/^\d+(st|nd|rd|th)\s+/i, '').trim();
      if (part !== prev) debug(`  After numeric ordinal removal: "${part}"`);

      // Remove written ordinals like "Thirty-First", "Twenty-Second", etc.
      prev = part;
      part = part.replace(/^(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth|Thirteenth|Fourteenth|Fifteenth|Sixteenth|Seventeenth|Eighteenth|Nineteenth|Twentieth|Twenty-First|Twenty-Second|Twenty-Third|Twenty-Fourth|Twenty-Fifth|Twenty-Sixth|Twenty-Seventh|Twenty-Eighth|Twenty-Ninth|Thirtieth|Thirty-First|Thirty-Second|Thirty-Third|Thirty-Fourth|Thirty-Fifth|Thirty-Sixth|Thirty-Seventh|Thirty-Eighth|Thirty-Ninth|Fortieth|Forty-First|Forty-Second|Forty-Third|Forty-Fourth|Forty-Fifth)\s+/i, '').trim();
      if (part !== prev) debug(`  After written ordinal removal: "${part}"`);

      debug(`  Final cleaned venue: "${part}" (length: ${part.length})`);

      if (part.length >= 3) {
        debug(`  -> RETURNING: "${part}"`);
        return part;
      } else {
        debug(`  -> Too short (< 3 chars), checking next part`);
      }
    }
    debug('No valid venue found in any part');
    return null;
  }

  function findRanking(venueName) {
    if (!rankingsData || !venueName) return null;

    const normalized = normalizeString(venueName);

    // Debug logging
    console.log('[Scholar Orderer] Trying to match venue:', venueName, '-> normalized:', normalized);

    // Check if detected venue matches target full name
    // If exactMatch is true, require exact match only
    // Supports bidirectional matching for truncated venue names
    function isFullNameMatch(detected, target, exactMatch = false) {
      if (!target) return false;
      if (detected === target) return true;
      if (exactMatch || target.length < 10) return false;  // Short or exact-match names require exact match only

      // Standard check: detected contains target (detected is longer)
      if (detected.includes(target)) return true;

      // Reverse check for truncated venues: target contains detected
      // Only allow this if detected is long enough (at least 25 chars) to avoid false positives
      // e.g., "International Conference on Cyber-Physical" matches "International Conference on Cyber-Physical Systems"
      if (detected.length >= 25 && target.includes(detected)) {
        console.log('[Scholar Orderer] Partial match (truncated venue):', detected, '->', target);
        return true;
      }

      return false;
    }

    // Check aliases first (these are usually full names that map to a canonical key)
    if (rankingsData.aliases) {
      for (const [alias, canonical] of Object.entries(rankingsData.aliases)) {
        const aliasNorm = normalizeString(alias);
        // Only match if alias is long enough (full name, not acronym)
        if (aliasNorm.length >= 10 && isFullNameMatch(normalized, aliasNorm)) {
          // Found alias, look up the canonical name
          if (rankingsData.conferences[canonical]) {
            console.log('[Scholar Orderer] Matched via alias:', alias, '->', canonical);
            return { ...rankingsData.conferences[canonical], key: canonical, type: 'conference' };
          }
          if (rankingsData.journals[canonical]) {
            console.log('[Scholar Orderer] Matched via alias:', alias, '->', canonical);
            return { ...rankingsData.journals[canonical], key: canonical, type: 'journal' };
          }
        }
      }
    }

    // Match conferences by full name only (no acronym matching)
    for (const [key, data] of Object.entries(rankingsData.conferences)) {
      const fullNameNorm = normalizeString(data.fullName || '');

      if (fullNameNorm && isFullNameMatch(normalized, fullNameNorm, data.exactMatch)) {
        console.log('[Scholar Orderer] Matched conference by full name:', key);
        return { ...data, key, type: 'conference' };
      }
    }

    // Match journals by full name only (no acronym matching)
    for (const [key, data] of Object.entries(rankingsData.journals)) {
      const fullNameNorm = normalizeString(data.fullName || '');

      if (fullNameNorm && isFullNameMatch(normalized, fullNameNorm, data.exactMatch)) {
        console.log('[Scholar Orderer] Matched journal by full name:', key);
        return { ...data, key, type: 'journal' };
      }
    }

    console.log('[Scholar Orderer] No match found for:', venueName);
    return null;
  }

  /**
   * Find all venues in the database that start with the given truncated venue name
   * Used to determine if a truncated venue has a unique match or multiple possibilities
   */
  function findPrefixMatches(truncatedVenue) {
    if (!rankingsData || !truncatedVenue) return [];

    const normalized = normalizeString(truncatedVenue);
    // Need sufficient length for reliable prefix matching
    if (normalized.length < 15) {
      console.log('[Scholar Orderer] Prefix match skipped - venue too short:', normalized.length);
      return [];
    }

    const matches = [];
    const seenKeys = new Set();

    // Check conferences
    for (const [key, data] of Object.entries(rankingsData.conferences)) {
      const fullNameNorm = normalizeString(data.fullName || '');
      if (fullNameNorm.length >= normalized.length && fullNameNorm.startsWith(normalized)) {
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          matches.push({ key, ...data, type: 'conference' });
        }
      }
    }

    // Check journals
    for (const [key, data] of Object.entries(rankingsData.journals)) {
      const fullNameNorm = normalizeString(data.fullName || '');
      if (fullNameNorm.length >= normalized.length && fullNameNorm.startsWith(normalized)) {
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          matches.push({ key, ...data, type: 'journal' });
        }
      }
    }

    // Check aliases
    if (rankingsData.aliases) {
      for (const [alias, canonical] of Object.entries(rankingsData.aliases)) {
        const aliasNorm = normalizeString(alias);
        if (aliasNorm.length >= normalized.length && aliasNorm.startsWith(normalized)) {
          if (!seenKeys.has(canonical)) {
            const data = rankingsData.conferences[canonical] || rankingsData.journals[canonical];
            if (data) {
              seenKeys.add(canonical);
              matches.push({ key: canonical, ...data });
            }
          }
        }
      }
    }

    console.log('[Scholar Orderer] Prefix matches for "' + truncatedVenue + '":', matches.length, matches.map(m => m.key));
    return matches;
  }

  // ============================================
  // Badge Creation
  // ============================================

  function createBadgeElement(label, bgColor, textColor, className) {
    const badge = document.createElement('span');
    badge.className = `gs-orderer-badge ${className}`;
    badge.style.backgroundColor = bgColor;
    badge.style.color = textColor;
    badge.textContent = label;
    return badge;
  }

  function createBadgeContainer(ranking) {
    const container = document.createElement('span');
    container.className = 'gs-orderer-badge-container';

    // Create CORE badge (always present for ranked venues)
    if (ranking.core) {
      const coreConfig = CONFIG.coreBadges[ranking.core];
      if (coreConfig) {
        const coreBadge = createBadgeElement(
          ranking.core,
          coreConfig.color,
          coreConfig.textColor,
          'gs-orderer-badge-core'
        );
        coreBadge.setAttribute('data-rank', ranking.core);
        container.appendChild(coreBadge);
      }
    }

    // Create SJR badge for journals
    if (ranking.sjr) {
      const sjrConfig = CONFIG.sjrBadges[ranking.sjr];
      if (sjrConfig) {
        const sjrBadge = createBadgeElement(
          `SJR ${ranking.sjr}`,
          sjrConfig.color,
          sjrConfig.textColor,
          'gs-orderer-badge-sjr'
        );
        container.appendChild(sjrBadge);
      }
    }

    // Create JCR badge for journals
    if (ranking.jcr) {
      const jcrConfig = CONFIG.jcrBadges[ranking.jcr];
      if (jcrConfig) {
        const jcrBadge = createBadgeElement(
          `JCR ${ranking.jcr}`,
          jcrConfig.color,
          jcrConfig.textColor,
          'gs-orderer-badge-jcr'
        );
        container.appendChild(jcrBadge);
      }
    }

    // Create h5-index badge
    if (ranking.h5) {
      const h5Badge = createBadgeElement(
        `h5: ${ranking.h5}`,
        '#7b1fa2',
        '#ffffff',
        'gs-orderer-badge-h5'
      );
      container.appendChild(h5Badge);
    }

    // Create tooltip with full details
    const tooltip = document.createElement('span');
    tooltip.className = 'gs-orderer-tooltip';

    let tooltipContent = `<strong>${ranking.fullName || ranking.key}</strong><br>`;
    tooltipContent += `<em>${ranking.type === 'conference' ? 'Conference' : 'Journal'}</em><br><br>`;

    // Rankings section
    tooltipContent += '<div class="gs-orderer-tooltip-rankings">';

    if (ranking.core) {
      tooltipContent += `<div class="gs-orderer-tooltip-row"><span class="gs-orderer-tooltip-label">CORE:</span> <span class="gs-orderer-tooltip-value">${ranking.core}</span></div>`;
    }

    if (ranking.sjr) {
      tooltipContent += `<div class="gs-orderer-tooltip-row"><span class="gs-orderer-tooltip-label">SJR:</span> <span class="gs-orderer-tooltip-value">${ranking.sjr}</span></div>`;
    }

    if (ranking.jcr) {
      tooltipContent += `<div class="gs-orderer-tooltip-row"><span class="gs-orderer-tooltip-label">JCR:</span> <span class="gs-orderer-tooltip-value">${ranking.jcr}</span></div>`;
    }

    if (ranking.if) {
      tooltipContent += `<div class="gs-orderer-tooltip-row"><span class="gs-orderer-tooltip-label">Impact Factor:</span> <span class="gs-orderer-tooltip-value">${ranking.if}</span></div>`;
    }

    if (ranking.h5) {
      tooltipContent += `<div class="gs-orderer-tooltip-row"><span class="gs-orderer-tooltip-label">h5-index:</span> <span class="gs-orderer-tooltip-value">${ranking.h5}</span></div>`;
    }

    tooltipContent += '</div>';

    tooltip.innerHTML = tooltipContent;
    container.appendChild(tooltip);

    return container;
  }

  // ============================================
  // Lazy Fetch Button for Unmatched Venues
  // ============================================

  let lastFetchTime = 0;
  const FETCH_COOLDOWN = 1000; // 1 second between fetches

  function createFetchButton(result, authorLine, index) {
    const button = document.createElement('button');
    button.className = 'gs-orderer-fetch-btn';
    button.innerHTML = '?';
    button.title = 'Click to lookup venue ranking';
    button.style.cssText = `
      margin-left: 6px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: bold;
      background: #e8f0fe;
      color: #1a73e8;
      border: 1px solid #1a73e8;
      border-radius: 4px;
      cursor: pointer;
      vertical-align: middle;
    `;

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleFetchClick(button, result, authorLine, index);
    });

    return button;
  }

  async function handleFetchClick(button, result, authorLine, index) {
    // Rate limiting
    const now = Date.now();
    if (now - lastFetchTime < FETCH_COOLDOWN) {
      button.title = 'Please wait before clicking again';
      return;
    }
    lastFetchTime = now;

    // Show loading state
    const originalContent = button.innerHTML;
    button.innerHTML = '⏳';
    button.disabled = true;
    button.style.cursor = 'wait';

    try {
      // Use findCiteInfo to get the citation URL (extracts article ID properly)
      const citeUrl = findCiteInfo(result);

      if (!citeUrl) {
        button.innerHTML = '✗';
        button.title = 'Could not find article citation link';
        button.disabled = false;
        button.style.cursor = 'pointer';
        return;
      }

      console.log('[Scholar Orderer] Fetching citation:', citeUrl);

      // Fetch citation popup
      const response = await fetch(citeUrl, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();

      // Parse MLA citation for venue (in italics)
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const italics = doc.querySelectorAll('#gs_citt i');

      let venueName = null;
      for (const italic of italics) {
        const text = italic.textContent.trim();
        if (text.length > 3) {
          venueName = text;
          break;
        }
      }

      if (!venueName) {
        button.innerHTML = '✗';
        button.title = 'Could not extract venue from citation';
        button.disabled = false;
        button.style.cursor = 'pointer';
        return;
      }

      console.log('[Scholar Orderer] Result', index, ': Fetched venue:', venueName);

      // Try to find ranking
      const ranking = findRanking(venueName);

      // Remove the button
      button.remove();

      if (ranking) {
        // Add badge
        const badgeContainer = createBadgeContainer(ranking);
        authorLine.appendChild(badgeContainer);
        console.log('[Scholar Orderer] Result', index, ': Found ranking via fetch:', ranking.key);
      } else {
        // Show "not ranked" indicator
        const notRanked = document.createElement('span');
        notRanked.className = 'gs-orderer-not-ranked';
        notRanked.textContent = 'Not ranked';
        notRanked.title = `Venue: ${venueName}`;
        notRanked.style.cssText = `
          margin-left: 6px;
          padding: 2px 6px;
          font-size: 10px;
          background: #f1f3f4;
          color: #5f6368;
          border-radius: 4px;
        `;
        authorLine.appendChild(notRanked);
        console.log('[Scholar Orderer] Result', index, ': Venue not in database:', venueName);
      }

    } catch (error) {
      console.error('[Scholar Orderer] Fetch error:', error);
      button.innerHTML = '✗';
      button.title = 'Network error - click to retry';
      button.disabled = false;
      button.style.cursor = 'pointer';
    }
  }

  function injectBadges() {
    if (!rankingsData) {
      console.log('[Scholar Orderer] Rankings data not loaded yet');
      return;
    }

    const results = document.querySelectorAll(CONFIG.selectors.resultItem);
    console.log('[Scholar Orderer] Processing', results.length, 'results');

    // Process each result synchronously (no HTTP requests needed)
    results.forEach((result, index) => {
      // Skip if already processed (badge or fetch button or not-ranked)
      if (result.querySelector('.gs-orderer-badge-container')) return;
      if (result.querySelector('.gs-orderer-fetch-btn')) return;
      if (result.querySelector('.gs-orderer-not-ranked')) return;

      // Skip books - title starts with [BOOK] or [Book]
      const titleElement = result.querySelector('.gs_rt');
      if (titleElement) {
        const titleText = titleElement.textContent.trim();
        if (titleText.startsWith('[BOOK]') || titleText.startsWith('[Book]') || titleText.startsWith('[book]')) {
          console.log('[Scholar Orderer] Result', index, ': Skipping book');
          return;
        }
      }

      const authorLine = result.querySelector(CONFIG.selectors.authorLine);
      if (!authorLine) {
        console.log('[Scholar Orderer] Result', index, ': No author line found');
        return;
      }

      // Extract venue from author line (no HTTP request needed)
      const authorLineText = authorLine.textContent;
      const venueName = extractVenueFromAuthorLine(authorLineText, index);
      const hasTruncation = authorLineText.includes('…');

      if (!venueName) {
        // Could not extract venue - add fetch button to try citation lookup
        console.log('[Scholar Orderer] Result', index, ': Could not extract venue, adding fetch button');
        const fetchButton = createFetchButton(result, authorLine, index);
        authorLine.appendChild(fetchButton);
        return;
      }

      // Try exact match first
      const exactRanking = findRanking(venueName);

      // Logic:
      // 1. Exact match with NO truncation -> show badge (high confidence)
      // 2. Exact match WITH truncation -> show badge (matched despite truncation)
      // 3. No exact match but truncated -> try prefix matching
      //    - Single prefix match -> show badge automatically
      //    - Multiple or zero prefix matches -> show "?" button
      // 4. No exact match and not truncated -> show "?" button (venue not in database)

      if (exactRanking) {
        // We have an exact match - show badge regardless of truncation
        console.log('[Scholar Orderer] Result', index, ': Found exact ranking:', exactRanking.key, exactRanking.core || exactRanking.sjr);
        const badgeContainer = createBadgeContainer(exactRanking);
        authorLine.appendChild(badgeContainer);
        return;
      }

      // No exact match - check if venue is truncated
      if (hasTruncation) {
        // Try prefix matching for truncated venues
        const prefixMatches = findPrefixMatches(venueName);

        if (prefixMatches.length === 1) {
          // Single unambiguous match - show badge automatically
          console.log('[Scholar Orderer] Result', index, ': Single prefix match for truncated venue:', prefixMatches[0].key);
          const badgeContainer = createBadgeContainer(prefixMatches[0]);
          authorLine.appendChild(badgeContainer);
          return;
        } else if (prefixMatches.length > 1) {
          // Multiple possible matches - need user to fetch full name
          console.log('[Scholar Orderer] Result', index, ': Multiple prefix matches (' + prefixMatches.length + '), adding fetch button');
        } else {
          // No prefix matches found
          console.log('[Scholar Orderer] Result', index, ': No prefix matches for truncated venue, adding fetch button');
        }
        // Fall through to add fetch button for truncated venues with no unique match
      } else {
        // Not truncated but no match - venue likely not in database
        console.log('[Scholar Orderer] Result', index, ': No ranking found (not truncated), adding fetch button');
      }

      // Add fetch button for all remaining cases (no exact match, no unique prefix match)
      const fetchButton = createFetchButton(result, authorLine, index);
      authorLine.appendChild(fetchButton);
    });
  }

  // ============================================
  // Author Profile Page Ranking Distribution Bar
  // ============================================

  function extractVenueNameFromProfileRow(result) {
    // On author profile pages, the venue is in the second .gs_gray element (third line)
    const grayElements = result.querySelectorAll('.gs_gray');

    let venueLine = null;
    if (grayElements.length >= 2) {
      venueLine = grayElements[1];
    } else if (grayElements.length === 1) {
      venueLine = grayElements[0];
    }

    if (!venueLine) return null;

    let venueName = venueLine.textContent.trim();

    // Clean up venue name
    venueName = venueName.replace(/,?\s*\d{4}\s*$/, '').trim();
    venueName = venueName.replace(/\s*\d+\s*\([^)]*\)\s*$/, '').trim();
    venueName = venueName.replace(/,\s*$/, '').trim();
    venueName = venueName.replace(/^Proceedings of the\s*/i, '').trim();
    venueName = venueName.replace(/^Proceedings of\s*/i, '').trim();
    venueName = venueName.replace(/^(ACM\/IEEE|IEEE\/ACM|ACM|IEEE)\s+/i, '').trim();
    venueName = venueName.replace(/^\d+(st|nd|rd|th)\s+/i, '').trim();
    // Remove written ordinals like "Thirty-First", "Twenty-Second", etc.
    venueName = venueName.replace(/^(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth|Thirteenth|Fourteenth|Fifteenth|Sixteenth|Seventeenth|Eighteenth|Nineteenth|Twentieth|Twenty-First|Twenty-Second|Twenty-Third|Twenty-Fourth|Twenty-Fifth|Twenty-Sixth|Twenty-Seventh|Twenty-Eighth|Twenty-Ninth|Thirtieth|Thirty-First|Thirty-Second|Thirty-Third|Thirty-Fourth|Thirty-Fifth|Thirty-Sixth|Thirty-Seventh|Thirty-Eighth|Thirty-Ninth|Fortieth)\s+/i, '').trim();
    venueName = venueName.replace(/\s*[…\.]{3,}\s*$/, '').trim();
    venueName = venueName.replace(/\s*…\s*$/, '').trim();

    return venueName || null;
  }

  function calculateRankingDistribution() {
    const results = document.querySelectorAll(CONFIG.selectors.profileResultItem);
    const core = { 'A*': 0, 'A': 0, 'B': 0, 'C': 0, 'Unranked': 0, total: 0 };
    const sjr = { 'Q1': 0, 'Q2': 0, 'Q3': 0, 'Q4': 0, 'Unranked': 0, total: 0 };

    results.forEach((result) => {
      core.total++;
      sjr.total++;

      const venueName = extractVenueNameFromProfileRow(result);
      if (!venueName) {
        core['Unranked']++;
        sjr['Unranked']++;
        return;
      }

      const ranking = findRanking(venueName);

      if (ranking && ranking.core) {
        core[ranking.core]++;
      } else {
        core['Unranked']++;
      }

      if (ranking && ranking.sjr) {
        sjr[ranking.sjr]++;
      } else {
        sjr['Unranked']++;
      }
    });

    return { core, sjr };
  }

  function createRankingDistributionBar() {
    // Remove existing bar if present
    const existingBar = document.querySelector('#gs-orderer-distribution-bar');
    if (existingBar) {
      existingBar.remove();
    }

    const distributions = calculateRankingDistribution();

    if (distributions.core.total === 0) {
      console.log('[Scholar Orderer] No results to show distribution for');
      return;
    }

    // Rank definitions for each mode
    const rankDefs = {
      core: [
        { key: 'A*', color: '#1e7e34', textColor: '#ffffff' },
        { key: 'A', color: '#28a745', textColor: '#ffffff' },
        { key: 'B', color: '#ffc107', textColor: '#212529' },
        { key: 'C', color: '#6c757d', textColor: '#ffffff' },
        { key: 'Unranked', color: '#e0e0e0', textColor: '#757575' }
      ],
      sjr: [
        { key: 'Q1', color: '#1a5276', textColor: '#ffffff' },
        { key: 'Q2', color: '#2e86c1', textColor: '#ffffff' },
        { key: 'Q3', color: '#85c1e9', textColor: '#212529' },
        { key: 'Q4', color: '#d4e6f1', textColor: '#212529' },
        { key: 'Unranked', color: '#e0e0e0', textColor: '#757575' }
      ]
    };

    const titles = { core: 'CORE Ranking Distribution', sjr: 'SJR Quartile Distribution' };

    // Determine default mode: whichever has more ranked publications
    const coreRanked = distributions.core.total - distributions.core['Unranked'];
    const sjrRanked = distributions.sjr.total - distributions.sjr['Unranked'];
    let currentMode = sjrRanked > coreRanked ? 'sjr' : 'core';

    // Create container
    const container = document.createElement('div');
    container.id = 'gs-orderer-distribution-bar';
    container.style.cssText = `
      margin: 16px 0;
      padding: 12px 16px;
      background: #f8f9fa;
      border: 1px solid #dadce0;
      border-radius: 8px;
      font-family: Arial, sans-serif;
    `;

    // Create header row with title and toggle
    const headerRow = document.createElement('div');
    headerRow.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      font-size: 13px;
      font-weight: 500;
      color: #5f6368;
    `;

    const toggleContainer = document.createElement('div');
    toggleContainer.style.cssText = `
      display: flex;
      border: 1px solid #dadce0;
      border-radius: 4px;
      overflow: hidden;
    `;

    const coreBtn = document.createElement('button');
    coreBtn.type = 'button';
    const sjrBtn = document.createElement('button');
    sjrBtn.type = 'button';
    const btnBaseStyle = `
      padding: 2px 10px;
      font-size: 11px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: background-color 0.2s, color 0.2s;
    `;

    coreBtn.textContent = 'CORE';
    sjrBtn.textContent = 'SJR';

    toggleContainer.appendChild(coreBtn);
    toggleContainer.appendChild(sjrBtn);
    headerRow.appendChild(title);
    headerRow.appendChild(toggleContainer);
    container.appendChild(headerRow);

    // Create bar, legend, summary containers
    const barContainer = document.createElement('div');
    barContainer.style.cssText = `
      display: flex;
      width: 100%;
      height: 24px;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
    `;
    container.appendChild(barContainer);

    const legend = document.createElement('div');
    legend.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 10px;
      font-size: 12px;
    `;
    container.appendChild(legend);

    const summary = document.createElement('div');
    summary.style.cssText = `
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #dadce0;
      font-size: 12px;
      color: #5f6368;
    `;
    container.appendChild(summary);

    function renderBar(mode) {
      currentMode = mode;
      const dist = distributions[mode];
      const ranks = rankDefs[mode];
      const rankedKeys = ranks.filter(r => r.key !== 'Unranked').map(r => r.key);
      const rankedTotal = rankedKeys.reduce((sum, k) => sum + (dist[k] || 0), 0);

      // Update title
      title.textContent = titles[mode];

      // Update toggle button styles
      const activeStyle = btnBaseStyle + 'background-color: #1a73e8; color: #ffffff;';
      const inactiveStyle = btnBaseStyle + 'background-color: #ffffff; color: #5f6368;';
      coreBtn.style.cssText = mode === 'core' ? activeStyle : inactiveStyle;
      sjrBtn.style.cssText = mode === 'sjr' ? activeStyle : inactiveStyle;

      // Update bar segments
      barContainer.innerHTML = '';
      ranks.forEach(rank => {
        const count = dist[rank.key];
        if (count === 0) return;
        const percentage = (count / dist.total) * 100;

        const segment = document.createElement('div');
        segment.style.cssText = `
          width: ${percentage}%;
          height: 100%;
          background-color: ${rank.color};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 600;
          color: ${rank.textColor};
          overflow: hidden;
          transition: opacity 0.2s;
          cursor: default;
        `;
        if (percentage >= 8) {
          segment.textContent = rank.key;
        }
        segment.title = `${rank.key}: ${count} (${percentage.toFixed(1)}%)`;
        barContainer.appendChild(segment);
      });

      // Update legend
      legend.innerHTML = '';
      ranks.forEach(rank => {
        const count = dist[rank.key];
        const percentage = dist.total > 0 ? (count / dist.total) * 100 : 0;

        const item = document.createElement('div');
        item.style.cssText = 'display: flex; align-items: center; gap: 4px;';

        const colorBox = document.createElement('span');
        colorBox.style.cssText = `
          width: 12px; height: 12px; border-radius: 2px;
          background-color: ${rank.color}; flex-shrink: 0;
        `;

        const label = document.createElement('span');
        label.style.cssText = 'color: #5f6368;';
        label.textContent = `${rank.key}: ${count} (${percentage.toFixed(1)}%)`;

        item.appendChild(colorBox);
        item.appendChild(label);
        legend.appendChild(item);
      });

      // Update summary
      const rankedPercentage = dist.total > 0 ? (rankedTotal / dist.total) * 100 : 0;
      summary.textContent = `Total: ${dist.total} publications | Ranked: ${rankedTotal} (${rankedPercentage.toFixed(1)}%)`;
    }

    // Wire up toggle buttons
    coreBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); renderBar('core'); });
    sjrBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); renderBar('sjr'); });

    // Initial render
    renderBar(currentMode);

    // Insert before the publications table
    const profileTable = document.querySelector('#gsc_a_t');
    if (profileTable) {
      profileTable.parentNode.insertBefore(container, profileTable);
      console.log('[Scholar Orderer] Ranking distribution bar inserted (default: ' + currentMode + ')');
    } else {
      const profileContainer = document.querySelector(CONFIG.selectors.profileContainer);
      if (profileContainer) {
        profileContainer.parentNode.insertBefore(container, profileContainer);
        console.log('[Scholar Orderer] Ranking distribution bar inserted (fallback, default: ' + currentMode + ')');
      }
    }
  }

  // ============================================
  // Author Profile Page Badge Injection
  // ============================================

  async function injectBadgesOnProfilePage() {
    if (!rankingsData) {
      console.log('[Scholar Orderer] Rankings data not loaded yet');
      return;
    }

    const results = document.querySelectorAll(CONFIG.selectors.profileResultItem);
    console.log('[Scholar Orderer] Processing', results.length, 'profile results');

    results.forEach((result, index) => {
      // Skip if already processed
      if (result.querySelector('.gs-orderer-badge-container')) return;

      // On author profile pages, the venue is in the second .gs_gray element (third line)
      // Structure: Title (link), Authors (gray), Venue (gray)
      const grayElements = result.querySelectorAll('.gs_gray');

      // The venue line is typically the second gray element
      let venueLine = null;
      if (grayElements.length >= 2) {
        venueLine = grayElements[1];  // Second gray element is the venue
      } else if (grayElements.length === 1) {
        venueLine = grayElements[0];  // Sometimes there's only one gray element
      }

      if (!venueLine) {
        console.log('[Scholar Orderer] Profile result', index, ': No venue line found');
        return;
      }

      // Extract venue name - it's usually the text content, possibly with year at the end
      let venueName = venueLine.textContent.trim();

      // Remove year and volume info at the end (e.g., ", 2023" or "42 (3), 2023")
      venueName = venueName.replace(/,?\s*\d{4}\s*$/, '').trim();
      venueName = venueName.replace(/\s*\d+\s*\([^)]*\)\s*$/, '').trim();
      venueName = venueName.replace(/,\s*$/, '').trim();

      // Remove "Proceedings of the" prefix and ordinal numbers (e.g., "16th", "27th")
      // "Proceedings of the ACM/IEEE 16th International Conference on Cyber-Physical …"
      // -> "International Conference on Cyber-Physical"
      venueName = venueName.replace(/^Proceedings of the\s*/i, '').trim();
      venueName = venueName.replace(/^Proceedings of\s*/i, '').trim();
      // Remove organization prefixes like "ACM/IEEE", "IEEE/ACM", "ACM", "IEEE" followed by ordinals
      venueName = venueName.replace(/^(ACM\/IEEE|IEEE\/ACM|ACM|IEEE)\s+/i, '').trim();
      // Remove ordinal numbers like "16th", "27th", "1st", "2nd", "3rd"
      venueName = venueName.replace(/^\d+(st|nd|rd|th)\s+/i, '').trim();
      // Remove written ordinals like "Thirty-First", "Twenty-Second", etc.
      venueName = venueName.replace(/^(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth|Thirteenth|Fourteenth|Fifteenth|Sixteenth|Seventeenth|Eighteenth|Nineteenth|Twentieth|Twenty-First|Twenty-Second|Twenty-Third|Twenty-Fourth|Twenty-Fifth|Twenty-Sixth|Twenty-Seventh|Twenty-Eighth|Twenty-Ninth|Thirtieth|Thirty-First|Thirty-Second|Thirty-Third|Thirty-Fourth|Thirty-Fifth|Thirty-Sixth|Thirty-Seventh|Thirty-Eighth|Thirty-Ninth|Fortieth)\s+/i, '').trim();
      // Remove trailing ellipsis and everything after
      venueName = venueName.replace(/\s*[…\.]{3,}\s*$/, '').trim();
      venueName = venueName.replace(/\s*…\s*$/, '').trim();

      console.log('[Scholar Orderer] Profile result', index, ': Detected venue:', venueName);

      if (!venueName) {
        console.log('[Scholar Orderer] Profile result', index, ': Could not extract venue name');
        return;
      }

      const ranking = findRanking(venueName);
      if (!ranking) {
        console.log('[Scholar Orderer] Profile result', index, ': No ranking found for venue');
        return;
      }

      console.log('[Scholar Orderer] Profile result', index, ': Found ranking:', ranking.key, ranking.core || ranking.sjr);
      const badgeContainer = createBadgeContainer(ranking);

      // Insert badge after venue text
      venueLine.appendChild(badgeContainer);
    });
  }

  function setupProfileMutationObserver() {
    const targetNode = document.querySelector(CONFIG.selectors.profileContainer);
    if (!targetNode) return;

    const observer = new MutationObserver((mutations) => {
      let hasNewResults = false;

      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE &&
                (node.matches?.(CONFIG.selectors.profileResultItem) ||
                 node.querySelector?.(CONFIG.selectors.profileResultItem))) {
              hasNewResults = true;
            }
          });
        }
      });

      if (hasNewResults) {
        // Debounce the reprocessing
        setTimeout(() => {
          injectBadgesOnProfilePage();
          // Update the distribution bar with new data
          createRankingDistributionBar();
        }, 100);
      }
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }

  // ============================================
  // Sorting
  // ============================================

  function saveOriginalOrder(force = false) {
    // Only save if we haven't saved yet, or if forced (for truly new results)
    if (originalOrder.length > 0 && !force) return;

    const container = document.querySelector(CONFIG.selectors.resultsContainer);
    if (!container) return;

    // Set up flexbox on container for CSS-based ordering
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    const results = container.querySelectorAll(CONFIG.selectors.resultItem);
    originalOrder = Array.from(results);

    // Store the original index on each element for reliable restoration
    // Also set initial CSS order
    originalOrder.forEach((el, index) => {
      el.setAttribute('data-gs-orderer-original-index', index);
      el.style.order = index;
    });
  }

  function sortResults(sortType) {
    const container = document.querySelector(CONFIG.selectors.resultsContainer);
    if (!container) return;

    currentSort = sortType;
    let results = Array.from(container.querySelectorAll(CONFIG.selectors.resultItem));

    // Use CSS flexbox order instead of DOM reordering to preserve event handlers
    // First, make sure container uses flexbox
    if (!container.style.display || container.style.display !== 'flex') {
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
    }

    if (sortType === 'default') {
      // Restore original order using stored indices
      results.forEach(result => {
        const originalIndex = parseInt(result.getAttribute('data-gs-orderer-original-index') || '0', 10);
        result.style.order = originalIndex;
      });
    } else if (sortType === 'citations-desc') {
      // Sort by citations descending - highest citations get lowest order number
      const sorted = [...results].sort((a, b) => getCitationCount(b) - getCitationCount(a));
      sorted.forEach((result, index) => {
        result.style.order = index;
      });
    } else if (sortType === 'citations-asc') {
      // Sort by citations ascending - lowest citations get lowest order number
      const sorted = [...results].sort((a, b) => getCitationCount(a) - getCitationCount(b));
      sorted.forEach((result, index) => {
        result.style.order = index;
      });
    }

    // Update dropdown visual
    const dropdown = document.querySelector('#gs-orderer-sort-select');
    if (dropdown) {
      dropdown.value = sortType;
    }
  }

  // ============================================
  // UI Controls
  // ============================================

  function createSortControls() {
    // Check if controls already exist
    if (document.querySelector('#gs-orderer-controls')) return;

    const container = document.querySelector(CONFIG.selectors.resultsContainer);
    if (!container) return;

    const controls = document.createElement('div');
    controls.id = 'gs-orderer-controls';
    controls.innerHTML = `
      <label for="gs-orderer-sort-select">Sort by:</label>
      <select id="gs-orderer-sort-select">
        <option value="default">Default (Relevance)</option>
        <option value="citations-desc">Citations (High to Low)</option>
        <option value="citations-asc">Citations (Low to High)</option>
      </select>
      <span class="gs-orderer-info" title="Google Scholar Orderer: Sort by citations and view venue rankings (CORE, SJR, JCR, h5-index)">ℹ️</span>
    `;

    const select = controls.querySelector('#gs-orderer-sort-select');
    select.addEventListener('change', (e) => {
      sortResults(e.target.value);
    });

    container.parentNode.insertBefore(controls, container);
  }

  // ============================================
  // Mutation Observer
  // ============================================

  function setupMutationObserver() {
    const targetNode = document.querySelector(CONFIG.selectors.resultsContainer);
    if (!targetNode) return;

    const observer = new MutationObserver((mutations) => {
      let hasNewResults = false;

      mutations.forEach(mutation => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE &&
                (node.matches?.(CONFIG.selectors.resultItem) ||
                 node.querySelector?.(CONFIG.selectors.resultItem))) {
              hasNewResults = true;
            }
          });
        }
      });

      if (hasNewResults) {
        // Debounce the reprocessing
        setTimeout(() => {
          // Assign original indices and CSS order to any new results that don't have them
          const container = document.querySelector(CONFIG.selectors.resultsContainer);
          if (container) {
            const results = container.querySelectorAll(CONFIG.selectors.resultItem);
            let maxIndex = originalOrder.length;
            results.forEach((el) => {
              if (!el.hasAttribute('data-gs-orderer-original-index')) {
                el.setAttribute('data-gs-orderer-original-index', maxIndex);
                el.style.order = maxIndex;
                originalOrder.push(el);
                maxIndex++;
              }
            });
          }

          injectBadges();
          if (currentSort !== 'default') {
            sortResults(currentSort);
          }
        }, 100);
      }
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }

  // ============================================
  // Initialization
  // ============================================

  async function init() {
    console.log('[Scholar Orderer] Initializing...');

    // Load rankings data first
    await loadRankingsData();

    // Check if we're on an author profile page
    const isProfilePage = document.querySelector(CONFIG.selectors.profileContainer) !== null;

    // Check if we're on a search results page
    const isSearchPage = document.querySelector(CONFIG.selectors.resultsContainer) !== null;

    if (isProfilePage) {
      console.log('[Scholar Orderer] Detected author profile page');

      // Create ranking distribution bar
      createRankingDistributionBar();

      // Inject ranking badges on profile page
      injectBadgesOnProfilePage();

      // Setup observer for dynamic content (when user scrolls/loads more)
      setupProfileMutationObserver();

      console.log('[Scholar Orderer] Profile page initialization complete');
    } else if (isSearchPage) {
      console.log('[Scholar Orderer] Detected search results page');

      // Save original order
      saveOriginalOrder();

      // Create sort controls
      createSortControls();

      // Inject ranking badges
      injectBadges();

      // Setup observer for dynamic content
      setupMutationObserver();

      console.log('[Scholar Orderer] Search page initialization complete');
    } else {
      console.log('[Scholar Orderer] Not a supported page type, skipping initialization');
      return;
    }
  }

  // Run initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

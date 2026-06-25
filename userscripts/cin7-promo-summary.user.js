// ==UserScript==
// @name         Cin7 Living Culture Promo Summary
// @namespace    livingculture-cin7
// @version      2.8
// @description  Compact grouped Living Culture promo summary inside Cin7 from the Summary tab.
// @match        https://*.cin7.com/*
// @match        https://go.cin7.com/*
// @match        https://inventory.dearsystems.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-promo-summary.user.js?v=2.8
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-promo-summary.user.js?v=2.8
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @connect      googleusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  const SUMMARY_CSV_URL =
    'https://docs.google.com/spreadsheets/d/1Y6r2-84sZYqtqDGKQwIWt9gT03BmjXloiuER8gHDqRY/export?format=csv&gid=375042703';

  const CACHE_KEY = 'lc-promo-summary-grouped-v22';
  const CACHE_TIME_KEY = 'lc-promo-summary-grouped-time-v22';

  const UPCOMING_DAYS_TO_SHOW = 90;

  const FALLBACK_CSV = `Approval,NZ Promotion Campaign,Start date,End date,NZ Category ( Shopify > Sales & Discount (Selected items only) ),Note
Approval,Tauranga Home Show Special Offer,30-Apr,12-May,"Spend $3,000+ on Products, and Get 10% OFF your items.Spend $6,000+ on Products, and Get 10% OFF your items + A FREE Hanging Wicker Swing Chair (Value $600).Note: Discount applies to product RRP only. Excludes shipping and installation fees. Offer valid while stocks last.",
,Week 18,30-Apr,6-May,,
,Tauranga Home Show Special Offer,30-Apr,12-May,"Spend $3,000+ on Products, and Get 10% OFF your items.Spend $6,000+ on Products, and Get 10% OFF your items + A FREE Hanging Wicker Swing Chair (Value $600).Note: Discount applies to product RRP only. Excludes shipping and installation fees. Offer valid while stocks last.",
,Week 19,7-May,13-May,,
Approval,May Mega Sale,14-May,26-May,"10%off - Baltic Pergolas(Manual)5%off - Caspian Pergola5%off - Tasman Pergolas10%off - Patio Covers10%off - Window / Door Awning15%off - Ficus Solid Polycarbonate Outdoor Window Awning Door Canopy10%off - Retractable Awnings + Solar-Powered Awnings20%off - Aluminium Furniture20%off - Plastic Chairs15%off - Outdoor Throw Blanket and Rugs15%off - Outdoor Heating15%off - Outdoor Grills15%off - Garden & Outdoor Decor15%off - Pets & Farm",
`;

  let allRows = [];
  let filteredRows = [];
  let sourceLabel = 'Loading Summary tab...';

  const INLINE_BUTTON_ID = 'lc-promo-summary-inline-button';
  const ACTION_ROW_ID = 'lc-cin7-action-row-v1';
  const SITE_VISIT_BUTTON_ID = 'lc-site-visit-inline-button-v2';
  const QUOTE_REVIEW_BUTTON_ID = 'lc-quote-review-inline-button-v1';
  const TOP_ROW_SETTLE_MS = 1800;
  const scriptStartedAt = Date.now();
  let revealRetryTimer = null;
  let positionScheduled = false;
  let lastLocationKey = `${window.location.href}|${document.title}`;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function compact(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function linkify(value) {
    const safe = escapeHtml(value);

    return safe.replace(
      /(https?:\/\/[^\s<]+)/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  function parseCsvRows(csvText) {
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;

    const text = String(csvText || '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && quoted && next === '"') {
        value += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        quoted = !quoted;
        continue;
      }

      if (char === ',' && !quoted) {
        row.push(value);
        value = '';
        continue;
      }

      if (char === '\n' && !quoted) {
        row.push(value);

        if (row.some(cell => clean(cell))) {
          rows.push(row);
        }

        row = [];
        value = '';
        continue;
      }

      value += char;
    }

    row.push(value);

    if (row.some(cell => clean(cell))) {
      rows.push(row);
    }

    return rows;
  }

  function parseCsv(rawCsv) {
    const rows = parseCsvRows(rawCsv);

    if (!rows.length) return [];

    const output = [];

    rows.slice(1).forEach((cells, index) => {
      const approval = clean(cells[0]);
      const campaign = clean(cells[1]);
      const start = clean(cells[2]);
      const end = clean(cells[3]);
      const category = clean(cells[4]);
      const note = clean(cells[5]);

      if (!approval && !campaign && !start && !end && !category && !note) return;

      const weekMatch = campaign.match(/week\s+(\d+)/i);

      output.push({
        rowIndex: index + 2,
        approval,
        campaign,
        start,
        end,
        category,
        note,
        isWeek: /^week\s+\d+/i.test(campaign),
        weekNum: weekMatch ? Number(weekMatch[1]) : null
      });
    });

    return output;
  }

  function requestText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          headers: {
            'Cache-Control': 'no-cache'
          },
          onload: response => {
            if (response.status >= 200 && response.status < 300) {
              resolve(response.responseText || '');
            } else {
              reject(new Error(`Google Sheet returned ${response.status}`));
            }
          },
          onerror: () => reject(new Error('Could not load Google Sheet'))
        });

        return;
      }

      fetch(url, { cache: 'no-store' })
        .then(response => {
          if (!response.ok) throw new Error(`Google Sheet returned ${response.status}`);
          return response.text();
        })
        .then(resolve)
        .catch(reject);
    });
  }

  function readCachedCsv() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (!cached) return '';

      const parsed = parseCsv(cached);
      if (!parsed.length) return '';

      const cachedAt = Number(localStorage.getItem(CACHE_TIME_KEY)) || 0;
      const ageMinutes = cachedAt ? Math.round((Date.now() - cachedAt) / 60000) : 0;

      sourceLabel = ageMinutes
        ? `Summary tab from cache (${ageMinutes}m old)`
        : 'Summary tab from cache';

      return cached;
    } catch (error) {
      console.warn(error);
      return '';
    }
  }

  async function loadPromoData() {
    setSourceLabel('Loading Summary tab...');

    try {
      const raw = await requestText(SUMMARY_CSV_URL);

      if (/<!doctype html|<html/i.test(raw.slice(0, 300))) {
        throw new Error('Google returned an HTML page instead of CSV');
      }

      const parsed = parseCsv(raw);

      if (!parsed.length) {
        throw new Error('No Summary rows found');
      }

      localStorage.setItem(CACHE_KEY, raw);
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));

      allRows = parsed;
      sourceLabel = 'Summary tab live data loaded';
      setSourceLabel(sourceLabel);
      applyFilters();

      return true;
    } catch (error) {
      console.warn(error);

      const cached = readCachedCsv();

      if (cached) {
        allRows = parseCsv(cached);
        setSourceLabel(`${sourceLabel} - live unavailable`);
        applyFilters();
        return false;
      }

      allRows = parseCsv(FALLBACK_CSV);
      setSourceLabel('Built-in fallback - Summary tab unavailable');
      applyFilters();
      return false;
    }
  }

  function startOfToday() {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  const monthMap = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11
  };

  function parseDateText(value) {
    const text = clean(value);
    if (!text) return null;

    const currentYear = new Date().getFullYear();

    let match = text.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,9})(?:[-\s/](\d{2,4}))?$/);

    if (match) {
      const day = Number(match[1]);
      const month = monthMap[match[2].toLowerCase()];
      let year = match[3] ? Number(match[3]) : currentYear;

      if (year < 100) year += 2000;

      if (Number.isFinite(day) && month !== undefined) {
        return new Date(year, month, day);
      }
    }

    match = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);

    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      let year = match[3] ? Number(match[3]) : currentYear;

      if (year < 100) year += 2000;

      return new Date(year, month, day);
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function fixDateRange(row) {
    let start = parseDateText(row.start);
    let end = parseDateText(row.end);

    if (start && end && end < start) {
      end.setFullYear(end.getFullYear() + 1);
    }

    return { start, end };
  }

  function getState(row) {
    const today = startOfToday();
    const { start, end } = fixDateRange(row);

    if (!start && !end) {
      if (clean(row.campaign).toLowerCase().includes('clearance')) return 'always';
      return 'undated';
    }

    if (start && today < start) return 'upcoming';
    if (end && today > end) return 'past';

    return 'current';
  }

  function isDateRelevant(row) {
    const state = getState(row);
    const today = startOfToday();
    const futureLimit = addDays(today, UPCOMING_DAYS_TO_SHOW);
    const { start } = fixDateRange(row);

    if (state === 'current' || state === 'always') return true;
    if (state === 'upcoming' && start) return start <= futureLimit;

    return false;
  }

  function dateMin(a, b) {
    if (!a) return b || null;
    if (!b) return a || null;
    return a < b ? a : b;
  }

  function dateMax(a, b) {
    if (!a) return b || null;
    if (!b) return a || null;
    return a > b ? a : b;
  }

  function formatShortDate(date, fallback) {
    if (!date) return clean(fallback);

    return date
      .toLocaleDateString('en-NZ', {
        day: 'numeric',
        month: 'short'
      })
      .replace(' ', '-');
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    return aStart <= bEnd && bStart <= aEnd;
  }

  function getLatestWeekOneIndex() {
    let latest = 0;

    allRows.forEach((row, index) => {
      if (row.weekNum === 1) latest = index;
    });

    return latest;
  }

  function getCycleRows() {
    const startIndex = getLatestWeekOneIndex();
    return allRows.slice(startIndex);
  }

  function getWeekLabelForRange(start, end) {
    if (!start || !end) return '';

    const weeks = getCycleRows()
      .filter(row => row.isWeek && row.weekNum)
      .filter(row => {
        const weekRange = fixDateRange(row);
        return rangesOverlap(start, end, weekRange.start, weekRange.end);
      })
      .map(row => row.weekNum)
      .filter(Boolean)
      .sort((a, b) => a - b);

    if (!weeks.length) return '';

    const min = weeks[0];
    const max = weeks[weeks.length - 1];

    return min === max ? `Week ${min}` : `Week ${min}–${max}`;
  }

  function daysBetween(a, b) {
    const oneDay = 24 * 60 * 60 * 1000;
    const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());

    return Math.round((end - start) / oneDay);
  }

  function stateLabel(state) {
    if (state === 'current') return 'Current';
    if (state === 'upcoming') return 'Upcoming';
    if (state === 'past') return 'Past';
    if (state === 'always') return 'Always On';
    return 'No Date';
  }

  function approvalHtml(value) {
    const text = clean(value);

    if (!text) return '<span class="blank">No approval note</span>';

    const cls = text.toLowerCase().includes('review') ? 'review' : 'approval';

    return `<span class="pill ${cls}">${escapeHtml(text)}</span>`;
  }

  function stateHtml(row) {
    const state = getState(row);
    const { start } = fixDateRange(row);

    const days = state === 'upcoming' && start
      ? `<div class="small">${daysBetween(startOfToday(), start)} days away</div>`
      : '';

    return `<span class="tag ${state}">${stateLabel(state)}</span>${days}`;
  }

  function sortRows(rows) {
    const priority = {
      current: 0,
      always: 1,
      upcoming: 2,
      undated: 3,
      past: 4
    };

    return [...rows].sort((a, b) => {
      const ap = priority[getState(a)] ?? 9;
      const bp = priority[getState(b)] ?? 9;

      if (ap !== bp) return ap - bp;

      const aStart = fixDateRange(a).start;
      const bStart = fixDateRange(b).start;
      const at = aStart ? aStart.getTime() : Number.MAX_SAFE_INTEGER;
      const bt = bStart ? bStart.getTime() : Number.MAX_SAFE_INTEGER;

      return at - bt;
    });
  }

  function mergeRows(rows) {
    const map = new Map();

    rows.forEach(row => {
      if (row.isWeek) return;

      const key = compact(row.campaign) + '|' + compact(row.category);

      if (!map.has(key)) {
        const rowCopy = { ...row };
        const fixed = fixDateRange(row);

        rowCopy._startDate = fixed.start;
        rowCopy._endDate = fixed.end;
        rowCopy._sources = [row];

        map.set(key, rowCopy);
        return;
      }

      const existing = map.get(key);
      const fixed = fixDateRange(row);

      existing._startDate = dateMin(existing._startDate, fixed.start);
      existing._endDate = dateMax(existing._endDate, fixed.end);
      existing.start = formatShortDate(existing._startDate, existing.start);
      existing.end = formatShortDate(existing._endDate, existing.end);

      if (!existing.approval && row.approval) existing.approval = row.approval;
      if (clean(row.note).length > clean(existing.note).length) existing.note = row.note;

      existing._sources.push(row);
    });

    return Array.from(map.values()).map(row => {
      if (!row._startDate || !row._endDate) {
        const fixed = fixDateRange(row);
        row._startDate = fixed.start;
        row._endDate = fixed.end;
      }

      row.weekLabel = getWeekLabelForRange(row._startDate, row._endDate);
      return row;
    });
  }

  function parseOfferItems(text) {
    const raw = clean(text);
    if (!raw) return [];

    const parts = raw
      .replace(/(Up to\s+\d+\s*% ?off\s*[–-])/gi, '|||$1')
      .replace(/(\d+\s*% ?off\s*[–-])/gi, '|||$1')
      .split('|||')
      .map(item => clean(item))
      .filter(Boolean);

    if (!parts.length) return [{ discount: '', name: raw }];

    return parts.map(part => {
      const match = part.match(/^((?:Up to\s+)?\d+\s*% ?off)\s*[–-]?\s*(.*)$/i);

      if (match) {
        return {
          discount: match[1],
          name: match[2] || ''
        };
      }

      return {
        discount: '',
        name: part
      };
    });
  }

  function renderOffers(text) {
    const offers = parseOfferItems(text);

    if (!offers.length) return '<span class="blank">No category details</span>';

    const hasDiscounts = offers.some(item => item.discount);

    if (!hasDiscounts) {
      return `
        <div class="detail-box">
          <div>${linkify(text) || '<span class="blank">No category details</span>'}</div>
        </div>
      `;
    }

    return `
      <div class="offers">
        ${offers.map(item => `
          <div class="offer">
            ${item.discount ? `<div class="discount">${escapeHtml(item.discount)}</div>` : '<div></div>'}
            <div class="offer-name">${item.name ? linkify(item.name) : '<span class="blank">No offer text</span>'}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function isElementVisible(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  }

  function setSourceLabel(text) {
    sourceLabel = text || sourceLabel;

    const root = document.getElementById('lc-promo-summary-root');
    const source = root?.shadowRoot?.getElementById('lc-promo-source');

    if (source) source.textContent = sourceLabel;
  }

  function applyFilters() {
    const root = document.getElementById('lc-promo-summary-root');
    const shadow = root?.shadowRoot;

    if (!shadow) return;

    const searchValue = clean(shadow.getElementById('lc-promo-search')?.value).toLowerCase();
    const filterValue = shadow.getElementById('lc-promo-filter')?.value || 'date-relevant';
    const mergePromos = shadow.getElementById('lc-promo-merge')?.checked ?? true;

    let rows = getCycleRows().filter(row => {
      if (row.isWeek) return false;

      const state = getState(row);

      if (filterValue === 'date-relevant' && !isDateRelevant(row)) return false;
      if (filterValue === 'current' && state !== 'current') return false;
      if (filterValue === 'upcoming' && state !== 'upcoming') return false;
      if (filterValue === 'past' && state !== 'past') return false;

      if (!searchValue) return true;

      const combined = [
        row.approval,
        row.campaign,
        row.start,
        row.end,
        row.category,
        row.note,
        state
      ].join(' ').toLowerCase();

      return combined.includes(searchValue);
    });

    if (mergePromos) rows = mergeRows(rows);

    filteredRows = sortRows(rows);

    renderRows();
  }

  function renderRows() {
    const root = document.getElementById('lc-promo-summary-root');
    const shadow = root?.shadowRoot;
    const list = shadow?.getElementById('lc-promo-list');
    const count = shadow?.getElementById('lc-promo-count');

    if (!list || !count) return;

    count.textContent = `${filteredRows.length} promos`;

    if (!filteredRows.length) {
      list.innerHTML = `<div class="empty">No promotions found for this filter.</div>`;
      return;
    }

    list.innerHTML = filteredRows.map(row => `
      <article class="promo">
        <div class="promo-head">
          <div>
            <h2 class="title">${escapeHtml(row.campaign) || 'Untitled promotion'}</h2>

            <div class="meta-row">
              <span class="date">
                ${escapeHtml(row.start) || 'No start date'}${row.end ? ` – ${escapeHtml(row.end)}` : ''}
              </span>

              ${row.weekLabel ? `<span class="week-range">${escapeHtml(row.weekLabel)}</span>` : ''}
            </div>
          </div>

          <div class="badges">
            ${stateHtml(row)}
            ${approvalHtml(row.approval)}
          </div>
        </div>

        <div class="promo-body">
          <div>
            <h3 class="label-title">Offer / category details</h3>
            ${renderOffers(row.category)}
          </div>

          ${clean(row.note) ? `
            <div class="details">
              <div class="detail-box">
                <h3 class="label-title">Note / T&Cs</h3>
                <div>${linkify(row.note)}</div>
              </div>
            </div>
          ` : ''}
        </div>
      </article>
    `).join('');
  }

  function openModal() {
    const root = document.getElementById('lc-promo-summary-root');
    const modal = root?.shadowRoot?.getElementById('lc-promo-modal');
    const search = root?.shadowRoot?.getElementById('lc-promo-search');

    if (!modal) return;

    modal.classList.add('open');
    loadPromoData();

    setTimeout(() => search?.focus(), 80);
  }

  function closeModal() {
    const root = document.getElementById('lc-promo-summary-root');
    const modal = root?.shadowRoot?.getElementById('lc-promo-modal');

    if (modal) modal.classList.remove('open');
  }

  function applyInlineButtonSizing(button, sourceElement) {
    if (!button) return;

    const sourceRect = sourceElement?.getBoundingClientRect?.();
    const height = Math.max(34, Math.round(sourceRect?.height || 34));

    button.style.boxSizing = 'border-box';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.height = `${height}px`;
    button.style.minHeight = `${height}px`;
    button.style.minWidth = '116px';
    button.style.padding = '0 14px';
    button.style.lineHeight = '1';
  }

  function positionButtonBetweenSiteVisitAndQuoteReview(button) {
    const row = document.getElementById(ACTION_ROW_ID);
    const siteVisitButton = document.getElementById(SITE_VISIT_BUTTON_ID);
    const quoteReviewButton = document.getElementById(QUOTE_REVIEW_BUTTON_ID);
    if (!row || !siteVisitButton || !quoteReviewButton || !button) return false;

    if (button.parentElement !== row) row.appendChild(button);
    applyInlineButtonSizing(button, quoteReviewButton);

    const rowRect = row.getBoundingClientRect();
    const siteRect = siteVisitButton.getBoundingClientRect();
    const quoteRect = quoteReviewButton.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const centerBetween = siteRect.right + (quoteRect.left - siteRect.right) / 2;

    button.style.position = 'absolute';
    button.style.left = `${Math.max(0, centerBetween - rowRect.left - buttonRect.width / 2)}px`;
    button.style.top = `${Math.max(0, quoteRect.top - rowRect.top)}px`;
    button.style.zIndex = '2147483601';
    button.style.marginLeft = '0';
    button.style.marginBottom = '0';

    const elapsed = Date.now() - scriptStartedAt;
    if (elapsed < TOP_ROW_SETTLE_MS) {
      button.style.visibility = 'hidden';
      button.style.opacity = '0';
      if (!revealRetryTimer) {
        revealRetryTimer = window.setTimeout(() => {
          revealRetryTimer = null;
          insertButtonNextToScan();
        }, TOP_ROW_SETTLE_MS - elapsed + 80);
      }
    } else {
      button.style.visibility = 'visible';
      button.style.opacity = '1';
    }
    return true;
  }

  function insertButtonNextToScan() {
    let button = document.getElementById(INLINE_BUTTON_ID);

    if (!button) {
      button = document.createElement('button');
      button.id = INLINE_BUTTON_ID;
      button.type = 'button';
      button.textContent = 'Promo Summary';

      button.style.background = '#7c3aed';
      button.style.color = '#fff';
      button.style.border = '1px solid #7c3aed';
      button.style.borderRadius = '4px';
      button.style.font = '700 14px Arial, sans-serif';
      button.style.cursor = 'pointer';
      button.style.marginLeft = '8px';
      button.style.whiteSpace = 'nowrap';
      button.style.verticalAlign = 'middle';
      button.style.visibility = 'hidden';
      button.style.opacity = '0';
      applyInlineButtonSizing(button);

      button.addEventListener('mouseenter', () => {
        button.style.background = '#6d28d9';
        button.style.borderColor = '#6d28d9';
      });

      button.addEventListener('mouseleave', () => {
        button.style.background = '#7c3aed';
        button.style.borderColor = '#7c3aed';
      });

      button.addEventListener('click', openModal);
    }

    if (positionButtonBetweenSiteVisitAndQuoteReview(button)) return true;

    const scanButton = Array.from(document.querySelectorAll('button, a, div, span'))
      .filter(element => isElementVisible(element))
      .find(element => clean(element.textContent || '').toLowerCase() === 'scan');

    if (!scanButton) return false;

    const scanRect = scanButton.getBoundingClientRect();
    button.style.position = '';
    button.style.left = '';
    button.style.top = '';
    button.style.zIndex = '2147483601';
    applyInlineButtonSizing(button, scanButton);
    button.style.visibility = 'visible';
    button.style.opacity = '1';

    scanButton.insertAdjacentElement('afterend', button);
    positionButtonBetweenSiteVisitAndQuoteReview(button);
    return true;
  }

  function schedulePromoButtonPosition() {
    if (positionScheduled) return;
    positionScheduled = true;
    window.requestAnimationFrame(() => {
      positionScheduled = false;
      insertButtonNextToScan();
    });
  }

  function schedulePromoButtonRecovery() {
    schedulePromoButtonPosition();
    window.setTimeout(schedulePromoButtonPosition, 350);
    window.setTimeout(schedulePromoButtonPosition, 900);
    window.setTimeout(schedulePromoButtonPosition, 1800);
  }

  function watchCin7Navigation() {
    const wrapHistoryMethod = methodName => {
      const original = history[methodName];
      if (typeof original !== 'function' || original.__lcPromoWrapped) return;

      history[methodName] = function () {
        const result = original.apply(this, arguments);
        schedulePromoButtonRecovery();
        return result;
      };
      history[methodName].__lcPromoWrapped = true;
    };

    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');

    window.setInterval(() => {
      const key = `${window.location.href}|${document.title}`;
      const button = document.getElementById(INLINE_BUTTON_ID);

      if (key !== lastLocationKey || !button || !button.isConnected || !isElementVisible(button)) {
        lastLocationKey = key;
        schedulePromoButtonRecovery();
      }
    }, 1500);
  }

  function createWidget() {
    if (document.getElementById('lc-promo-summary-root')) return;
    if (!document.body) return;

    const cachedCsv = readCachedCsv();
    allRows = parseCsv(cachedCsv || FALLBACK_CSV);

    const root = document.createElement('div');
    root.id = 'lc-promo-summary-root';
    root.attachShadow({ mode: 'open' });

    root.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: Arial, Helvetica, sans-serif;
          color: #243238;
          position: relative;
          z-index: 2147483647;
        }

        * {
          box-sizing: border-box;
        }

        #lc-promo-modal {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          background: rgba(0,0,0,.20);
          align-items: stretch;
          justify-content: flex-end;
          padding: 10px;
        }

        #lc-promo-modal.open {
          display: flex;
        }

        .panel {
          width: min(980px, 96vw);
          height: min(94vh, 940px);
          background: #eef5f5;
          border-radius: 12px;
          box-shadow: 0 14px 45px rgba(0,0,0,.26);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border: 1px solid #dce7ea;
        }

        .controls {
          background: rgba(255,255,255,.96);
          border-bottom: 1px solid #dce7ea;
          padding: 10px;
          display: grid;
          grid-template-columns: 1fr 170px auto 72px;
          gap: 8px;
          align-items: center;
        }

        #lc-promo-search,
        #lc-promo-filter {
          width: 100%;
          min-height: 34px;
          border: 1px solid #ccdbdf;
          border-radius: 9px;
          padding: 7px 10px;
          font: 13px Arial, Helvetica, sans-serif;
          outline: none;
          background: #fff;
          color: #243238;
        }

        #lc-promo-search:focus,
        #lc-promo-filter:focus {
          border-color: #05cbbf;
          box-shadow: 0 0 0 3px rgba(5,203,191,.14);
        }

        .merge-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #607d8b;
          font: 800 12px Arial, Helvetica, sans-serif;
          white-space: nowrap;
        }

        .count {
          color: #007f79;
          font: 900 12px Arial, Helvetica, sans-serif;
          text-align: right;
          white-space: nowrap;
        }

        .source {
          padding: 7px 10px;
          background: #f8fbfb;
          border-bottom: 1px solid #dce7ea;
          color: #008f8f;
          font: 800 10px Arial, Helvetica, sans-serif;
        }

        .content {
          overflow: auto;
          padding: 10px;
        }

        .list {
          display: grid;
          gap: 10px;
        }

        .promo {
          background: #fff;
          border: 1px solid #dce7ea;
          border-radius: 16px;
          box-shadow: 0 8px 22px rgba(15,45,55,.08);
          overflow: hidden;
        }

        .promo-head {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid #edf3f4;
          background: #fff;
        }

        .title {
          margin: 0;
          font: 900 16px/1.2 Arial, Helvetica, sans-serif;
          color: #17262c;
          white-space: pre-line;
        }

        .meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 6px;
          align-items: center;
        }

        .date {
          color: #607d8b;
          font: 900 12px Arial, Helvetica, sans-serif;
        }

        .week-range {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 3px 8px;
          font: 900 10px Arial, Helvetica, sans-serif;
          background: #eaf7ff;
          color: #116078;
        }

        .badges {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 5px;
          align-content: flex-start;
        }

        .tag,
        .pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 4px 8px;
          font: 900 10px Arial, Helvetica, sans-serif;
          white-space: nowrap;
        }

        .tag.current {
          color: #0f5a3b;
          background: #e4f5ec;
        }

        .tag.upcoming {
          color: #76500d;
          background: #fff2d2;
        }

        .tag.past {
          color: #78909c;
          background: #eef2f4;
        }

        .tag.always {
          color: #006c70;
          background: #dff8f6;
        }

        .tag.undated {
          color: #455a64;
          background: #edf2f4;
        }

        .pill.approval {
          color: #0f5a3b;
          background: #e4f5ec;
        }

        .pill.review {
          color: #76500d;
          background: #fff2d2;
        }

        .promo-body {
          padding: 12px 14px 14px;
          display: grid;
          gap: 10px;
        }

        .label-title {
          margin: 0 0 7px;
          color: #607d8b;
          font: 900 10px Arial, Helvetica, sans-serif;
          text-transform: uppercase;
          letter-spacing: .06em;
        }

        .offers {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }

        .offer {
          display: inline-grid;
          grid-template-columns: auto 1fr;
          align-items: start;
          gap: 7px;
          border: 1px solid #e5eff1;
          border-radius: 10px;
          background: #fbfdfd;
          padding: 8px 9px;
          min-width: 220px;
          flex: 1 1 240px;
        }

        .discount {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 58px;
          border-radius: 999px;
          padding: 4px 7px;
          background: #e0f8f6;
          color: #007f79;
          font: 900 11px/1 Arial, Helvetica, sans-serif;
          white-space: nowrap;
        }

        .offer-name {
          color: #2c3d43;
          font: 700 12.5px/1.32 Arial, Helvetica, sans-serif;
        }

        .details {
          display: grid;
          gap: 8px;
        }

        .detail-box {
          border: 1px solid #edf3f4;
          border-radius: 11px;
          background: #fbfdfd;
          padding: 10px;
        }

        .detail-box div {
          color: #526870;
          font: 12.5px/1.4 Arial, Helvetica, sans-serif;
          white-space: pre-line;
        }

        .blank {
          color: #9aa9af;
          font-weight: 400;
        }

        .small {
          margin-top: 3px;
          color: #607d8b;
          font: 800 10.5px Arial, Helvetica, sans-serif;
        }

        .empty {
          background: #fff;
          border: 1px solid #dce7ea;
          border-radius: 16px;
          padding: 22px;
          text-align: center;
          color: #607d8b;
          font: 900 13px Arial, Helvetica, sans-serif;
          box-shadow: 0 8px 22px rgba(15,45,55,.08);
        }

        a {
          color: #007f79;
          text-decoration: none;
          font-weight: 800;
          word-break: break-word;
        }

        a:hover {
          text-decoration: underline;
        }

        @media (max-width: 760px) {
          #lc-promo-modal {
            padding: 4px;
          }

          .panel {
            width: 100vw;
            height: 96vh;
          }

          .controls {
            grid-template-columns: 1fr;
          }

          .count {
            text-align: left;
          }

          .promo-head {
            grid-template-columns: 1fr;
          }

          .badges {
            justify-content: flex-start;
          }

          .offer {
            flex-basis: 100%;
          }
        }
      </style>

      <div id="lc-promo-modal">
        <div class="panel">
          <div class="controls">
            <input id="lc-promo-search" type="search" placeholder="Search promo, category, date or note..." />

            <select id="lc-promo-filter">
              <option value="date-relevant">Current + upcoming</option>
              <option value="current">Current only</option>
              <option value="upcoming">Upcoming only</option>
              <option value="past">Past in current cycle</option>
              <option value="all">All current-cycle promos</option>
            </select>

            <label class="merge-label">
              <input id="lc-promo-merge" type="checkbox" checked />
              Merge multi-week promos
            </label>

            <div class="count" id="lc-promo-count">0 promos</div>
          </div>

          <div class="source" id="lc-promo-source">${escapeHtml(sourceLabel)}</div>

          <div class="content">
            <div class="list" id="lc-promo-list"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const shadow = root.shadowRoot;

    shadow.getElementById('lc-promo-modal').addEventListener('click', event => {
      if (event.target === shadow.getElementById('lc-promo-modal')) closeModal();
    });

    shadow.getElementById('lc-promo-search').addEventListener('input', applyFilters);
    shadow.getElementById('lc-promo-filter').addEventListener('change', applyFilters);
    shadow.getElementById('lc-promo-merge').addEventListener('change', applyFilters);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
    });

    applyFilters();
    insertButtonNextToScan();
    loadPromoData();
  }

  function boot() {
    if (!document.body) return;

    createWidget();

    setTimeout(schedulePromoButtonPosition, 500);
    setTimeout(schedulePromoButtonPosition, 1500);
    setTimeout(schedulePromoButtonPosition, 3000);
  }

  boot();
  window.addEventListener('load', boot);
  window.addEventListener('resize', schedulePromoButtonPosition);
  window.addEventListener('orientationchange', schedulePromoButtonPosition);
  window.addEventListener('focus', schedulePromoButtonRecovery);
  window.addEventListener('popstate', schedulePromoButtonRecovery);
  window.addEventListener('hashchange', schedulePromoButtonRecovery);
  watchCin7Navigation();

  if (document.body) {
    new MutationObserver(schedulePromoButtonPosition).observe(document.body, {
      childList: true,
      subtree: true
    });
  }
})();

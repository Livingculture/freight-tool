// ==UserScript==
// @name         Cin7 Living Culture Promo Calendar Helper
// @namespace    livingculture-cin7
// @version      1.0
// @description  Shows the Living Culture promotion calendar inside Cin7 from the shared Google Sheet CSV.
// @match        https://*.cin7.com/*
// @match        https://go.cin7.com/*
// @match        https://inventory.dearsystems.com/*
// @downloadURL  https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-promo-calendar-helper.user.js
// @updateURL    https://raw.githubusercontent.com/Livingculture/freight-tool/main/userscripts/cin7-promo-calendar-helper.user.js
// @supportURL   https://github.com/Livingculture/freight-tool
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @connect      googleusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  const PROMO_CSV_URL =
    'https://docs.google.com/spreadsheets/d/1Y6r2-84sZYqtqDGKQwIWt9gT03BmjXloiuER8gHDqRY/export?format=csv&gid=375042703';

  const CACHE_KEY = 'lc-promo-calendar-csv-v1';
  const CACHE_TIME_KEY = 'lc-promo-calendar-csv-time-v1';

  const FALLBACK_CSV = `
,NZ Promotion Campaign,Start date,End date,NZ Category ( Shopify > Sales & Discount (Selected items only) ),Note,Task
,Clearance,,,https://livingculture.co.nz/collections/clearance-sale,,
`;

  let sourceLabel = 'Loading promo calendar...';
  let allPromos = [];
  let filteredPromos = [];

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function parseCsvLine(line) {
    const values = [];
    let value = '';
    let quoted = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"' && quoted && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(value);
        value = '';
      } else {
        value += char;
      }
    }

    values.push(value);
    return values;
  }

  function normaliseHeader(value) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function findColumn(headers, names) {
    const normalised = headers.map(normaliseHeader);
    const wanted = names.map(normaliseHeader);

    return normalised.findIndex(header =>
      wanted.some(name => header === name || header.includes(name))
    );
  }

  function parseDateText(value) {
    const text = clean(value);

    if (!text) return null;

    const currentYear = new Date().getFullYear();

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

    let match = text.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,9})(?:[-\s/](\d{2,4}))?$/);

    if (match) {
      const day = Number(match[1]);
      const month = monthMap[match[2].toLowerCase()];
      let year = match[3] ? Number(match[3]) : currentYear;

      if (year < 100) year += 2000;

      if (Number.isFinite(day) && month !== undefined) {
        return new Date(year, month, day, 0, 0, 0, 0);
      }
    }

    match = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);

    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]) - 1;
      let year = match[3] ? Number(match[3]) : currentYear;

      if (year < 100) year += 2000;

      return new Date(year, month, day, 0, 0, 0, 0);
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatDate(date, fallback) {
    if (!date || Number.isNaN(date.getTime())) return clean(fallback);

    return date.toLocaleDateString('en-NZ', {
      day: 'numeric',
      month: 'short'
    });
  }

  function daysBetween(a, b) {
    const oneDay = 24 * 60 * 60 * 1000;
    const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());

    return Math.round((end - start) / oneDay);
  }

  function getPromoState(startDate, endDate, campaignName) {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (!startDate && !endDate) {
      if (clean(campaignName).toLowerCase().includes('clearance')) return 'always';
      return 'undated';
    }

    let start = startDate;
    let end = endDate;

    if (start && end && end < start) {
      end = new Date(end);
      end.setFullYear(end.getFullYear() + 1);
    }

    if (start && todayStart < start) return 'upcoming';
    if (end && todayStart > end) return 'past';

    return 'current';
  }

  function getStateLabel(state) {
    if (state === 'current') return 'Current';
    if (state === 'upcoming') return 'Upcoming';
    if (state === 'past') return 'Past';
    if (state === 'always') return 'Always On';
    return 'No Date';
  }

  function getStateClass(state) {
    if (state === 'current') return 'current';
    if (state === 'upcoming') return 'upcoming';
    if (state === 'past') return 'past';
    if (state === 'always') return 'always';
    return 'undated';
  }

  function containsUrl(value) {
    return /https?:\/\//i.test(String(value || ''));
  }

  function linkify(value) {
    const text = clean(value);

    if (!containsUrl(text)) return escapeHtml(text);

    const url = text.match(/https?:\/\/[^\s]+/i)?.[0];

    if (!url) return escapeHtml(text);

    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
  }

  function parsePromoCsv(rawCsv) {
    const lines = String(rawCsv || '').trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];

    const headers = parseCsvLine(lines[0]);

    const colApproval = 0;
    const colCampaign = findColumn(headers, ['NZ Promotion Campaign', 'Promotion Campaign', 'Campaign']);
    const colStart = findColumn(headers, ['Start date', 'Start']);
    const colEnd = findColumn(headers, ['End date', 'End']);
    const colCategory = findColumn(headers, ['NZ Category', 'Category', 'Shopify']);
    const colNote = findColumn(headers, ['Note', 'Notes']);
    const colTask = findColumn(headers, ['Task']);

    return lines.slice(1)
      .map((line, index) => {
        const cells = parseCsvLine(line);

        const campaign = clean(cells[colCampaign >= 0 ? colCampaign : 1]);
        const startText = clean(cells[colStart >= 0 ? colStart : 2]);
        const endText = clean(cells[colEnd >= 0 ? colEnd : 3]);
        const category = clean(cells[colCategory >= 0 ? colCategory : 4]);
        const note = clean(cells[colNote >= 0 ? colNote : 5]);
        const task = clean(cells[colTask >= 0 ? colTask : 6]);
        const approval = clean(cells[colApproval]);

        const startDate = parseDateText(startText);
        const endDate = parseDateText(endText);
        const state = getPromoState(startDate, endDate, campaign);

        return {
          rowNumber: index + 2,
          approval,
          campaign,
          startText,
          endText,
          startDate,
          endDate,
          dateLabel: startText || endText
            ? `${formatDate(startDate, startText)}${endText ? ` – ${formatDate(endDate, endText)}` : ''}`
            : '',
          category,
          note,
          task,
          state,
          isWeekRow: /^week\s+\d+/i.test(campaign),
          isBlank: !campaign && !category && !note
        };
      })
      .filter(item => !item.isBlank)
      .filter(item => item.campaign || item.category || item.note);
  }

  function sortPromos(promos) {
    const priority = {
      current: 0,
      always: 1,
      upcoming: 2,
      undated: 3,
      past: 4
    };

    return [...promos].sort((a, b) => {
      const priorityDiff = (priority[a.state] ?? 9) - (priority[b.state] ?? 9);
      if (priorityDiff !== 0) return priorityDiff;

      const aTime = a.startDate ? a.startDate.getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.startDate ? b.startDate.getTime() : Number.MAX_SAFE_INTEGER;

      return aTime - bTime;
    });
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

      const parsed = parsePromoCsv(cached);
      if (!parsed.length) return '';

      const cachedAt = Number(localStorage.getItem(CACHE_TIME_KEY)) || 0;
      const ageMinutes = cachedAt ? Math.round((Date.now() - cachedAt) / 60000) : 0;

      sourceLabel = ageMinutes
        ? `Google Sheet from cache (${ageMinutes}m old)`
        : 'Google Sheet from cache';

      return cached;
    } catch (error) {
      console.warn(error);
      return '';
    }
  }

  async function loadPromoData() {
    setSourceLabel('Loading Google Sheet...');

    try {
      const raw = await requestText(PROMO_CSV_URL);

      if (/<!doctype html|<html/i.test(raw.slice(0, 300))) {
        throw new Error('Google returned an HTML page instead of CSV');
      }

      const parsed = parsePromoCsv(raw);

      if (!parsed.length) {
        throw new Error('No promo rows found in Google Sheet');
      }

      localStorage.setItem(CACHE_KEY, raw);
      localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));

      allPromos = parsed;
      sourceLabel = 'Google Sheet live data loaded';
      setSourceLabel(sourceLabel);
      applyFilters();

      return true;
    } catch (error) {
      console.warn(error);

      const cached = readCachedCsv();

      if (cached) {
        allPromos = parsePromoCsv(cached);
        setSourceLabel(`${sourceLabel} - live unavailable`);
        applyFilters();
        return false;
      }

      allPromos = parsePromoCsv(FALLBACK_CSV);
      setSourceLabel('Built-in fallback - live Google Sheet unavailable');
      applyFilters();
      return false;
    }
  }

  function setSourceLabel(text) {
    sourceLabel = text || sourceLabel;

    const root = document.getElementById('lc-promo-calendar-root');
    const source = root?.shadowRoot?.getElementById('lc-promo-source');

    if (source) source.textContent = sourceLabel;
  }

  function applyFilters() {
    const root = document.getElementById('lc-promo-calendar-root');
    const shadow = root?.shadowRoot;

    const searchValue = clean(shadow?.getElementById('lc-promo-search')?.value).toLowerCase();
    const stateValue = shadow?.getElementById('lc-promo-filter')?.value || 'active';
    const hideWeeks = shadow?.getElementById('lc-promo-hide-weeks')?.checked ?? true;

    filteredPromos = allPromos.filter(item => {
      if (hideWeeks && item.isWeekRow) return false;

      if (stateValue === 'active' && !['current', 'always', 'upcoming'].includes(item.state)) {
        return false;
      }

      if (stateValue !== 'all' && stateValue !== 'active' && item.state !== stateValue) {
        return false;
      }

      if (!searchValue) return true;

      const combined = [
        item.approval,
        item.campaign,
        item.startText,
        item.endText,
        item.category,
        item.note,
        item.task,
        item.state
      ].join(' ').toLowerCase();

      return combined.includes(searchValue);
    });

    filteredPromos = sortPromos(filteredPromos);
    renderPromoRows();
    renderSummary();
  }

  function renderSummary() {
    const root = document.getElementById('lc-promo-calendar-root');
    const shadow = root?.shadowRoot;

    if (!shadow) return;

    const currentCount = allPromos.filter(item => item.state === 'current').length;
    const upcomingCount = allPromos.filter(item => item.state === 'upcoming').length;
    const alwaysCount = allPromos.filter(item => item.state === 'always').length;

    const currentEl = shadow.getElementById('lc-promo-current-count');
    const upcomingEl = shadow.getElementById('lc-promo-upcoming-count');
    const alwaysEl = shadow.getElementById('lc-promo-always-count');
    const resultEl = shadow.getElementById('lc-promo-result-count');

    if (currentEl) currentEl.textContent = currentCount;
    if (upcomingEl) upcomingEl.textContent = upcomingCount;
    if (alwaysEl) alwaysEl.textContent = alwaysCount;
    if (resultEl) resultEl.textContent = `${filteredPromos.length} result${filteredPromos.length === 1 ? '' : 's'}`;
  }

  function renderPromoRows() {
    const root = document.getElementById('lc-promo-calendar-root');
    const tbody = root?.shadowRoot?.getElementById('lc-promo-tbody');

    if (!tbody) return;

    if (!filteredPromos.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty">No promotions found.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filteredPromos.map(item => `
      <tr>
        <td class="status-cell">
          <span class="tag ${getStateClass(item.state)}">${escapeHtml(getStateLabel(item.state))}</span>
          ${item.approval ? `<div class="approval">${escapeHtml(item.approval)}</div>` : ''}
        </td>

        <td class="date-cell">
          ${item.dateLabel ? escapeHtml(item.dateLabel) : '<span class="muted">No date</span>'}
          ${item.startDate && item.state === 'upcoming' ? `<div class="small">${daysBetween(new Date(), item.startDate)} days away</div>` : ''}
        </td>

        <td class="campaign-cell">
          <strong>${escapeHtml(item.campaign || 'Untitled promotion')}</strong>
          ${item.note ? `<div class="note">${escapeHtml(item.note)}</div>` : ''}
        </td>

        <td class="category-cell">
          ${item.category ? linkify(item.category) : '<span class="muted">No category details</span>'}
        </td>

        <td class="task-cell">
          ${item.task ? escapeHtml(item.task) : '<span class="muted">—</span>'}
        </td>
      </tr>
    `).join('');
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

  function openModal() {
    const root = document.getElementById('lc-promo-calendar-root');
    const modal = root?.shadowRoot?.getElementById('lc-promo-modal');
    const search = root?.shadowRoot?.getElementById('lc-promo-search');

    if (!modal) return;

    modal.classList.add('open');
    loadPromoData();

    setTimeout(() => search?.focus(), 80);
  }

  function closeModal() {
    const root = document.getElementById('lc-promo-calendar-root');
    const modal = root?.shadowRoot?.getElementById('lc-promo-modal');

    if (modal) modal.classList.remove('open');
  }

  function insertButtonNextToScan() {
    if (document.getElementById('lc-promo-calendar-inline-button')) return;

    const scanButton = Array.from(document.querySelectorAll('button, a, div, span'))
      .filter(element => isElementVisible(element))
      .find(element => clean(element.textContent || '').toLowerCase() === 'scan');

    if (!scanButton) return;

    const button = document.createElement('button');
    button.id = 'lc-promo-calendar-inline-button';
    button.type = 'button';
    button.textContent = 'Promo Calendar';

    const scanRect = scanButton.getBoundingClientRect();

    button.style.background = '#05cbbf';
    button.style.color = '#fff';
    button.style.border = '1px solid #05cbbf';
    button.style.borderRadius = '4px';
    button.style.padding = '0 14px';
    button.style.font = '700 14px Arial, sans-serif';
    button.style.cursor = 'pointer';
    button.style.height = `${Math.max(34, scanRect.height || 34)}px`;
    button.style.lineHeight = '1';
    button.style.marginLeft = '8px';
    button.style.whiteSpace = 'nowrap';
    button.style.verticalAlign = 'middle';

    button.addEventListener('mouseenter', () => {
      button.style.background = '#04b5aa';
      button.style.borderColor = '#04b5aa';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = '#05cbbf';
      button.style.borderColor = '#05cbbf';
    });

    button.addEventListener('click', openModal);

    scanButton.insertAdjacentElement('afterend', button);
  }

  function createWidget() {
    if (document.getElementById('lc-promo-calendar-root')) return;
    if (!document.body) return;

    const cachedCsv = readCachedCsv();
    allPromos = parsePromoCsv(cachedCsv || FALLBACK_CSV);
    filteredPromos = sortPromos(allPromos);

    const root = document.createElement('div');
    root.id = 'lc-promo-calendar-root';
    root.attachShadow({ mode: 'open' });

    root.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          font-family: Arial, Helvetica, sans-serif;
          color: #263238;
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
          align-items: center;
          justify-content: flex-end;
          padding: 14px 22px 14px 14px;
        }

        #lc-promo-modal.open {
          display: flex;
        }

        .panel {
          width: min(920px, 94vw);
          max-height: 88vh;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 14px 45px rgba(0,0,0,.25);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-bottom: 1px solid #d9e1e5;
          background: #f6f8f9;
        }

        .title {
          margin: 0;
          font: 700 17px Arial, sans-serif;
          color: #263238;
        }

        .subtitle {
          margin-top: 4px;
          font: 11px Arial, sans-serif;
          color: #607d8b;
        }

        .source {
          margin-top: 4px;
          font: 700 10px Arial, sans-serif;
          color: #008f8f;
        }

        #lc-promo-close {
          background: #fff;
          border: 1px solid #cfd8dc;
          border-radius: 4px;
          padding: 4px 8px;
          font: 700 11px Arial, sans-serif;
          cursor: pointer;
          color: #263238;
          height: 28px;
        }

        .summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid #d9e1e5;
          background: #ffffff;
        }

        .metric {
          border: 1px solid #d9e1e5;
          border-radius: 7px;
          padding: 8px 10px;
          background: #f8fbfb;
        }

        .metric strong {
          display: block;
          font-size: 20px;
          line-height: 1;
          color: #263238;
        }

        .metric span {
          display: block;
          margin-top: 4px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .04em;
          text-transform: uppercase;
          color: #607d8b;
        }

        .toolbar {
          display: grid;
          grid-template-columns: 1fr 145px auto 92px;
          gap: 8px;
          align-items: center;
          padding: 8px 12px;
          border-bottom: 1px solid #d9e1e5;
          background: #fff;
        }

        #lc-promo-search,
        #lc-promo-filter {
          width: 100%;
          min-height: 32px;
          border: 1px solid #cfd8dc;
          border-radius: 4px;
          padding: 5px 8px;
          font: 12px Arial, sans-serif;
          outline: none;
          background: #fff;
          color: #263238;
        }

        #lc-promo-search:focus,
        #lc-promo-filter:focus {
          border-color: #05cbbf;
          box-shadow: 0 0 0 2px rgba(5,203,191,.15);
        }

        .check {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font: 700 11px Arial, sans-serif;
          color: #607d8b;
          white-space: nowrap;
        }

        .check input {
          margin: 0;
        }

        #lc-promo-result-count {
          text-align: right;
          font: 700 10px Arial, sans-serif;
          color: #607d8b;
        }

        .table-wrap {
          overflow: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font: 11px Arial, sans-serif;
        }

        thead th {
          position: sticky;
          top: 0;
          z-index: 1;
          text-align: left;
          padding: 6px 7px;
          border-bottom: 1px solid #d9e1e5;
          background: #ffffff;
          color: #37474f;
          font: 800 10px Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: .03em;
        }

        tbody td {
          padding: 7px;
          border-bottom: 1px solid #edf2f4;
          vertical-align: top;
          line-height: 1.25;
        }

        tbody tr:hover {
          background: #eefafa;
        }

        .status-cell {
          width: 86px;
        }

        .date-cell {
          width: 92px;
          color: #263238;
          font-weight: 700;
          white-space: nowrap;
        }

        .campaign-cell {
          width: 210px;
        }

        .campaign-cell strong {
          display: block;
          color: #263238;
          font-size: 12px;
          margin-bottom: 3px;
        }

        .category-cell {
          color: #37474f;
        }

        .task-cell {
          width: 64px;
          text-align: center;
          font-weight: 700;
        }

        .note {
          color: #607d8b;
          font-size: 10.5px;
        }

        .small {
          margin-top: 3px;
          font-size: 10px;
          color: #607d8b;
          font-weight: 700;
        }

        .approval {
          margin-top: 4px;
          font-size: 9.5px;
          font-weight: 800;
          color: #607d8b;
          text-transform: uppercase;
        }

        .muted {
          color: #90a4ae;
          font-weight: 400;
        }

        .empty {
          text-align: center;
          padding: 18px;
          color: #607d8b;
          font-weight: 700;
        }

        .tag {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 4px 7px;
          font-size: 10px;
          font-weight: 800;
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

        a {
          color: #007f79;
          font-weight: 700;
          text-decoration: none;
        }

        a:hover {
          text-decoration: underline;
        }

        @media (max-width: 760px) {
          .summary {
            grid-template-columns: 1fr;
          }

          .toolbar {
            grid-template-columns: 1fr;
          }

          #lc-promo-result-count {
            text-align: left;
          }
        }
      </style>

      <div id="lc-promo-modal">
        <div class="panel">
          <div class="header">
            <div>
              <h2 class="title">Living Culture Promo Calendar</h2>
              <div class="subtitle">Live promotion calendar from the shared head office Google Sheet.</div>
              <div class="source" id="lc-promo-source">${escapeHtml(sourceLabel)}</div>
            </div>

            <button id="lc-promo-close" type="button">Close</button>
          </div>

          <div class="summary">
            <div class="metric">
              <strong id="lc-promo-current-count">0</strong>
              <span>Current</span>
            </div>
            <div class="metric">
              <strong id="lc-promo-upcoming-count">0</strong>
              <span>Upcoming</span>
            </div>
            <div class="metric">
              <strong id="lc-promo-always-count">0</strong>
              <span>Always On</span>
            </div>
          </div>

          <div class="toolbar">
            <input id="lc-promo-search" type="search" placeholder="Search promo, product, category, note..." />

            <select id="lc-promo-filter">
              <option value="active">Active + upcoming</option>
              <option value="current">Current only</option>
              <option value="upcoming">Upcoming only</option>
              <option value="always">Always on</option>
              <option value="past">Past</option>
              <option value="all">All rows</option>
            </select>

            <label class="check">
              <input id="lc-promo-hide-weeks" type="checkbox" checked />
              Hide week rows
            </label>

            <div id="lc-promo-result-count">0 results</div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Promotion</th>
                  <th>Category / Details</th>
                  <th>Task</th>
                </tr>
              </thead>
              <tbody id="lc-promo-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const shadow = root.shadowRoot;

    shadow.getElementById('lc-promo-close').addEventListener('click', closeModal);

    shadow.getElementById('lc-promo-modal').addEventListener('click', event => {
      if (event.target === shadow.getElementById('lc-promo-modal')) closeModal();
    });

    shadow.getElementById('lc-promo-search').addEventListener('input', applyFilters);
    shadow.getElementById('lc-promo-filter').addEventListener('change', applyFilters);
    shadow.getElementById('lc-promo-hide-weeks').addEventListener('change', applyFilters);

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

    setTimeout(insertButtonNextToScan, 500);
    setTimeout(insertButtonNextToScan, 1500);
    setTimeout(insertButtonNextToScan, 3000);
  }

  boot();
  window.addEventListener('load', boot);
})();

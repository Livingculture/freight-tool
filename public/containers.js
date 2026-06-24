const state = {
  containers: [],
  query: '',
  stage: '',
  manager: ''
};

const elements = {
  syncStatus: document.getElementById('syncStatus'),
  refreshButton: document.getElementById('refreshButton'),
  searchInput: document.getElementById('searchInput'),
  stageFilter: document.getElementById('stageFilter'),
  managerFilter: document.getElementById('managerFilter'),
  metricTotal: document.getElementById('metricTotal'),
  metricTransit: document.getElementById('metricTransit'),
  metricSoon: document.getElementById('metricSoon'),
  metricAttention: document.getElementById('metricAttention'),
  cardListTitle: document.getElementById('cardListTitle'),
  cardCount: document.getElementById('cardCount'),
  resultCount: document.getElementById('resultCount'),
  containerCards: document.getElementById('containerCards'),
  containerTable: document.getElementById('containerTable')
};

const STAGES = [
  'Arriving soon',
  'On water',
  'Loading planned',
  'Awaiting departure',
  'Planned',
  'Arrived',
  'Discharged',
  'To warehouse',
  'Dehired'
];

const STAGE_PRIORITY = new Map(STAGES.map((stage, index) => [stage, index]));

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseDate(value) {
  const text = extractDateTexts(value)[0] || clean(value);
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    return new Date(year, Number(slash[1]) - 1, Number(slash[2]), 12);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function extractDateTexts(value) {
  const text = clean(value);
  if (!text) return [];
  return Array.from(text.matchAll(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g))
    .map(match => match[0]);
}

function formatDate(value) {
  const dates = extractDateTexts(value);
  const values = dates.length ? dates : [value];
  const formatted = values
    .map(item => {
      const date = parseDate(item);
      if (!date) return clean(item);
      return date.toLocaleDateString('en-NZ', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    })
    .filter(Boolean);

  if (!formatted.length) return '-';
  if (formatted.length <= 3) return formatted.join(', ');
  return `${formatted.slice(0, 3).join(', ')} +${formatted.length - 3}`;
}

function daysFromToday(date) {
  if (!date) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((target - start) / 86400000);
}

function oneMonthAgo() {
  const today = new Date();
  const threshold = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  threshold.setMonth(threshold.getMonth() - 1);
  return threshold;
}

function milestoneDates(container) {
  return [
    container.loadingDate,
    container.departure,
    container.arrive,
    container.dischargeDate,
    container.dispatchToWarehouse,
    container.lastFreeDate,
    container.dehireDate
  ].map(parseDate).filter(Boolean);
}

function latestMilestoneDate(container) {
  const dates = milestoneDates(container);
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map(date => date.getTime())));
}

function isArchivedContainer(container) {
  const latestDate = latestMilestoneDate(container);
  return Boolean(latestDate) && latestDate < oneMonthAgo();
}

function relativeDate(value) {
  const date = parseDate(value);
  const label = formatDate(value);
  const days = daysFromToday(date);

  if (days === null) return label;
  if (days === 0) return `${label} - today`;
  if (days === 1) return `${label} - tomorrow`;
  if (days > 1) return `${label} - in ${days} days`;
  if (days === -1) return `${label} - yesterday`;
  return `${label} - ${Math.abs(days)} days ago`;
}

function hasDate(value) {
  return Boolean(parseDate(value));
}

function deriveContainer(container) {
  const status = clean(container.status);
  const loadingDate = parseDate(container.loadingDate);
  const departure = parseDate(container.departure);
  const arrive = parseDate(container.arrive);
  const dischargeDate = parseDate(container.dischargeDate);
  const dehireDate = parseDate(container.dehireDate);
  const dispatchToWarehouse = clean(container.dispatchToWarehouse);
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const etaDays = daysFromToday(arrive);
  let stage = 'Planned';
  let where = 'Planning';
  let nextLabel = 'Add loading, ETD and ETA';
  let nextDate = null;
  let attention = false;
  let tone = '';

  if (dehireDate) {
    stage = 'Dehired';
    where = 'Container returned';
    nextLabel = `Dehired ${relativeDate(container.dehireDate)}`;
  } else if (dispatchToWarehouse) {
    stage = 'To warehouse';
    where = 'Warehouse dispatch';
    nextLabel = dispatchToWarehouse;
  } else if (dischargeDate) {
    stage = 'Discharged';
    where = 'NZ port';
    nextLabel = container.lastFreeDate ? `Last free ${relativeDate(container.lastFreeDate)}` : 'Add dehire date';
  } else if (arrive && dayStart >= new Date(arrive.getFullYear(), arrive.getMonth(), arrive.getDate())) {
    stage = 'Arrived';
    where = 'NZ port';
    nextLabel = container.dischargeDate ? `Discharge ${relativeDate(container.dischargeDate)}` : 'Add discharge date';
  } else if (arrive && etaDays !== null && etaDays >= 0 && etaDays <= 7) {
    stage = 'Arriving soon';
    where = 'At sea';
    nextDate = arrive;
    nextLabel = `ETA ${relativeDate(container.arrive)}`;
    tone = 'soon';
  } else if (departure && dayStart >= new Date(departure.getFullYear(), departure.getMonth(), departure.getDate())) {
    stage = 'On water';
    where = 'At sea';
    nextDate = arrive;
    nextLabel = arrive ? `ETA ${relativeDate(container.arrive)}` : 'Add ETA';
    tone = 'transit';
  } else if (departure) {
    stage = 'Awaiting departure';
    where = 'Origin port';
    nextDate = departure;
    nextLabel = `ETD ${relativeDate(container.departure)}`;
  } else if (loadingDate) {
    stage = 'Loading planned';
    where = 'Supplier';
    nextDate = loadingDate;
    nextLabel = `Loading ${relativeDate(container.loadingDate)}`;
  }

  if (!departure || !arrive || (stage === 'Arrived' && !dischargeDate) || (stage === 'Discharged' && !container.lastFreeDate)) {
    attention = stage !== 'Dehired';
  }

  if (status) nextLabel = `${status} - ${nextLabel}`;
  if (attention) tone = 'attention';

  return {
    ...container,
    stage,
    where,
    nextLabel,
    nextDate,
    attention,
    tone,
    etaDays,
    searchable: [
      container.container,
      container.po,
      container.tristarRef,
      container.products,
      container.shipper,
      container.categoryManager,
      container.status,
      container.month,
      stage,
      where
    ].map(clean).join(' ').toLowerCase()
  };
}

function timeline(container) {
  const current = container.stage;
  const steps = [
    ['Loading', container.loadingDate, ['Loading planned', 'Awaiting departure']],
    ['ETD', container.departure, ['On water', 'Arriving soon']],
    ['ETA', container.arrive, ['Arrived', 'Discharged', 'To warehouse']],
    ['Dehire', container.dehireDate, ['Dehired']]
  ];

  return `
    <div class="timeline">
      ${steps.map(([label, value, activeStages]) => {
        const done = hasDate(value);
        const currentClass = activeStages.includes(current) ? 'is-current' : '';
        return `
          <div class="step ${done ? 'is-done' : ''} ${currentClass}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(formatDate(value))}</strong>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function card(container) {
  const volume = clean(container.volume);
  const refs = [container.po, container.tristarRef].map(clean).filter(Boolean).join(' / ');
  return `
    <article class="container-card ${escapeHtml(container.tone)}">
      <div class="container-id">
        <strong>${escapeHtml(container.container)}</strong>
        <span class="pill ${escapeHtml(container.tone)}">${escapeHtml(container.stage)}</span>
      </div>
      <div class="card-main">
        <p><strong>${escapeHtml(container.where)}</strong> ${escapeHtml(container.nextLabel)}</p>
        <p>${escapeHtml(container.products || 'Products not listed')}${volume ? ` - ${escapeHtml(volume)}` : ''}</p>
        <p>${escapeHtml([container.shipper, container.categoryManager].map(clean).filter(Boolean).join(' - ') || 'People not listed')}</p>
        ${refs ? `<p>${escapeHtml(refs)}</p>` : ''}
        ${timeline(container)}
      </div>
    </article>
  `;
}

function tableRow(container) {
  return `
    <tr>
      <td><strong>${escapeHtml(container.container)}</strong><span>${escapeHtml(container.month || '')}</span></td>
      <td><strong>${escapeHtml(container.where)}</strong><span>${escapeHtml(container.stage)}</span><span>${escapeHtml(container.status || '')}</span></td>
      <td><strong>${escapeHtml(container.nextLabel)}</strong><span>Load ${escapeHtml(formatDate(container.loadingDate))} | ETD ${escapeHtml(formatDate(container.departure))} | ETA ${escapeHtml(formatDate(container.arrive))}</span><span>Last free ${escapeHtml(formatDate(container.lastFreeDate))} | Dehire ${escapeHtml(formatDate(container.dehireDate))}</span></td>
      <td><strong>${escapeHtml(container.products || '-')}</strong><span>${escapeHtml(container.volume || '')}</span></td>
      <td><strong>${escapeHtml(container.categoryManager || '-')}</strong><span>${escapeHtml(container.shipper || '')}</span></td>
      <td><strong>${escapeHtml(container.po || '-')}</strong><span>${escapeHtml(container.tristarRef || '')}</span></td>
    </tr>
  `;
}

function filteredContainers() {
  return state.containers.filter(container => {
    if (state.query && !container.searchable.includes(state.query.toLowerCase())) return false;
    if (state.stage && container.stage !== state.stage) return false;
    if (state.manager && container.categoryManager !== state.manager) return false;
    return true;
  });
}

function numericContainerValue(container) {
  const match = clean(container.container).match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function compareContainerNumbers(a, b) {
  const aNumber = numericContainerValue(a);
  const bNumber = numericContainerValue(b);

  if (aNumber !== bNumber) return aNumber - bNumber;
  return clean(a.container).localeCompare(clean(b.container), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function sortByPriorityDateThenContainer(a, b) {
  const aPriority = STAGE_PRIORITY.get(a.stage) ?? Number.MAX_SAFE_INTEGER;
  const bPriority = STAGE_PRIORITY.get(b.stage) ?? Number.MAX_SAFE_INTEGER;

  if (aPriority !== bPriority) return aPriority - bPriority;

  const aDistance = a.nextDate ? Math.abs(daysFromToday(a.nextDate)) : Number.MAX_SAFE_INTEGER;
  const bDistance = b.nextDate ? Math.abs(daysFromToday(b.nextDate)) : Number.MAX_SAFE_INTEGER;

  if (aDistance !== bDistance) return aDistance - bDistance;
  return compareContainerNumbers(a, b);
}

function renderFilters() {
  const currentStage = state.stage;
  const currentManager = state.manager;
  const availableStages = STAGES.filter(stage => state.containers.some(item => item.stage === stage));
  if (currentStage && !availableStages.includes(currentStage)) state.stage = '';

  elements.stageFilter.innerHTML = '<option value="">All stages</option>' + availableStages.map(stage => (
    `<option value="${escapeHtml(stage)}">${escapeHtml(stage)}</option>`
  )).join('');

  const managers = Array.from(new Set(state.containers.map(item => item.categoryManager).filter(Boolean))).sort();
  elements.managerFilter.innerHTML = '<option value="">All managers</option>' + managers.map(manager => (
    `<option value="${escapeHtml(manager)}">${escapeHtml(manager)}</option>`
  )).join('');
  elements.stageFilter.value = state.stage;
  elements.managerFilter.value = currentManager;
}

function render() {
  const list = filteredContainers().sort(sortByPriorityDateThenContainer);
  const cards = [...list];

  elements.metricTotal.textContent = state.containers.length;
  elements.metricTransit.textContent = state.containers.filter(item => item.stage === 'On water' || item.stage === 'Arriving soon').length;
  elements.metricSoon.textContent = state.containers.filter(item => item.etaDays !== null && item.etaDays >= 0 && item.etaDays <= 7).length;
  elements.metricAttention.textContent = state.containers.filter(item => item.attention).length;

  elements.cardListTitle.textContent = state.stage ? `${state.stage} Container Cards` : 'All Container Cards';
  elements.cardCount.textContent = cards.length;
  elements.resultCount.textContent = list.length;

  elements.containerCards.innerHTML = cards.length
    ? cards.map(card).join('')
    : '<div class="empty">No containers match this filter.</div>';
  elements.containerTable.innerHTML = list.length
    ? list.map(tableRow).join('')
    : '<tr><td colspan="6">No containers match this filter.</td></tr>';
}

async function loadContainers() {
  elements.refreshButton.disabled = true;
  elements.syncStatus.textContent = 'Loading spreadsheet...';

  try {
    const response = await fetch('/api/containers', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Spreadsheet load failed');

    state.containers = (data.containers || [])
      .map(deriveContainer)
      .filter(container => !isArchivedContainer(container));
    renderFilters();
    render();
    const updated = new Date(data.updatedAt).toLocaleString('en-NZ', {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    elements.syncStatus.textContent = `Live from Google Sheet. Last checked ${updated}.`;
  } catch (error) {
    elements.syncStatus.textContent = error.message;
    elements.containerCards.innerHTML = '<div class="empty">Could not load the spreadsheet. Try refresh, or check the sheet sharing setting.</div>';
  } finally {
    elements.refreshButton.disabled = false;
  }
}

elements.searchInput.addEventListener('input', event => {
  state.query = event.target.value.trim();
  render();
});

elements.stageFilter.addEventListener('change', event => {
  state.stage = event.target.value;
  render();
});

elements.managerFilter.addEventListener('change', event => {
  state.manager = event.target.value;
  render();
});

elements.refreshButton.addEventListener('click', loadContainers);

loadContainers();

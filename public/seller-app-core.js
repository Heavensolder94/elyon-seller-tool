'use strict';
let elyonXlsxLibraryPromise = null;
function ensureXlsxLibrary(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(elyonXlsxLibraryPromise) return elyonXlsxLibraryPromise;
  elyonXlsxLibraryPromise = new Promise(function(resolve,reject){
    const existing = document.querySelector('script[data-elyon-xlsx-loader]');
    if(existing){
      existing.addEventListener('load',function(){ resolve(window.XLSX); },{once:true});
      existing.addEventListener('error',function(){ reject(new Error('XLSX-Bibliothek konnte nicht geladen werden.')); },{once:true});
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.async = true;
    script.dataset.elyonXlsxLoader = 'true';
    script.onload = function(){ resolve(window.XLSX); };
    script.onerror = function(){
      elyonXlsxLibraryPromise = null;
      reject(new Error('XLSX-Bibliothek konnte nicht geladen werden.'));
    };
    document.head.appendChild(script);
  });
  return elyonXlsxLibraryPromise;
}
function loadStoredArray(key){
  try{
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  }catch(err){
    console.warn('Konnte gespeicherte Daten nicht laden:', key, err);
    return [];
  }
}
const PRODUCT_STATUS_VALUES = ['Recherche','Draft','SEO prüfen','eBay Ready','Live','Verkauft','Versand offen','Abgeschlossen','Archiviert'];
const PRODUCT_STATUS_ALIASES = {
  idee: 'Draft',
  entwurf: 'Draft',
  draft: 'Draft',
  research: 'Recherche',
  recherche: 'Recherche',
  geprüft: 'SEO prüfen',
  geprueft: 'SEO prüfen',
  'seo prüfen': 'SEO prüfen',
  'seo pruefen': 'SEO prüfen',
  testkauf: 'SEO prüfen',
  gelistet: 'eBay Ready',
  'ebay ready': 'eBay Ready',
  live: 'Live',
  verkauft: 'Verkauft',
  'versand offen': 'Versand offen',
  abgeschlossen: 'Abgeschlossen',
  archiviert: 'Archiviert',
  problem: 'Archiviert',
  problemfall: 'Archiviert',
  rauswerfen: 'Archiviert'
};
function parseLooseDateIso(value, fallback){
  const fallbackIso = fallback || new Date().toISOString();
  if(value instanceof Date && !Number.isNaN(value.getTime())){
    return value.toISOString();
  }
  const text = String(value || '').trim();
  if(!text) return fallbackIso;
  const direct = new Date(text);
  if(!Number.isNaN(direct.getTime())){
    return direct.toISOString();
  }
  const dot = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(dot){
    const day = Number(dot[1]);
    const month = Number(dot[2]) - 1;
    let year = Number(dot[3]);
    if(year < 100) year += 2000;
    const hour = Number(dot[4] || 0);
    const minute = Number(dot[5] || 0);
    const second = Number(dot[6] || 0);
    const parsed = new Date(year, month, day, hour, minute, second);
    if(!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const ymd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if(ymd){
    const parsed = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    if(!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallbackIso;
}
function normalizeProductStatus(value, fallback){
  const text = String(value || '').trim();
  if(!text) return fallback || 'Draft';
  const lower = text.toLowerCase();
  if(PRODUCT_STATUS_VALUES.includes(text)) return text;
  if(Object.prototype.hasOwnProperty.call(PRODUCT_STATUS_ALIASES, lower)){
    return PRODUCT_STATUS_ALIASES[lower];
  }
  return fallback || 'Draft';
}
function normalizeIssueList(value){
  if(Array.isArray(value)){
    return value.map(function(item){ return String(item || '').trim(); }).filter(Boolean);
  }
  const text = String(value || '').trim();
  if(!text) return [];
  return text.split(/\r?\n|\s*\|\s*|\s*;\s*/).map(function(item){ return String(item || '').trim(); }).filter(Boolean);
}
function normalizeProductRecord(product){
  const p = {...(product || {})};
  const nowIso = new Date().toISOString();
  const createdAt = parseLooseDateIso(p.createdAt || p.created || p.savedAt || p.addedAt, nowIso);
  const updatedAt = parseLooseDateIso(p.updatedAt || p.updated || p.lastCheckedAt || createdAt, createdAt);
  const status = normalizeProductStatus(p.productStatus || p.status || p.lifecycleStatus, 'Draft');
  const listingScoreRaw = Number(p.listingScore);
  const listingScore = Number.isFinite(listingScoreRaw) ? listingScoreRaw : 0;
  const issues = normalizeIssueList(p.issues);
  const lastCheckedAt = p.lastCheckedAt ? parseLooseDateIso(p.lastCheckedAt, '') : '';
  const created = p.created || new Date(createdAt).toLocaleDateString('de-DE');
  const updated = p.updated || new Date(updatedAt).toLocaleDateString('de-DE');
  const name = String(p.name || p.title || p.productName || '').trim();
  const title = String(p.title || p.name || p.productName || '').trim();
  return {
    ...p,
    name,
    title,
    sku: String(p.sku || p.articleId || '').trim(),
    articleId: String(p.articleId || p.sku || '').trim(),
    supplierName: String(p.supplierName || p.supplier || '').trim(),
    supplier: String(p.supplier || p.supplierName || '').trim(),
    type: String(p.type || p.category || '').trim(),
    category: String(p.category || p.type || '').trim(),
    ebayLink: String(p.ebayLink || p.ebayUrl || '').trim(),
    ebayUrl: String(p.ebayUrl || p.ebayLink || '').trim(),
    notes: String(p.notes || '').trim(),
    productStatus: status,
    status,
    listingScore,
    issues,
    lastCheckedAt,
    createdAt,
    updatedAt,
    created,
    updated,
  };
}
function normalizeProductsCollection(list){
  return Array.isArray(list) ? list.map(normalizeProductRecord) : [];
}
function normalizeEbayListingDraftRecord(draft){
  const d = {...(draft || {})};
  const nowIso = new Date().toISOString();
  const createdAt = parseLooseDateIso(d.createdAt || d.savedAt || d.addedAt, nowIso);
  const updatedAt = parseLooseDateIso(d.updatedAt || d.savedAt || d.lastCheckedAt || createdAt, createdAt);
  const status = normalizeProductStatus(d.productStatus || d.status || 'Draft', 'Draft');
  const listingScoreRaw = Number(d.listingScore);
  const listingScore = Number.isFinite(listingScoreRaw) ? listingScoreRaw : 0;
  const issues = normalizeIssueList(d.issues);
  const lastCheckedAt = d.lastCheckedAt ? parseLooseDateIso(d.lastCheckedAt, '') : '';
  return {
    ...d,
    productStatus: status,
    status,
    listingScore,
    issues,
    lastCheckedAt,
    createdAt,
    updatedAt,
    savedAt: parseLooseDateIso(d.savedAt || updatedAt, updatedAt),
  };
}
function normalizeBrowserImportRecord(item){
  const nowIso = new Date().toISOString();
  const source = {...(item || {})};
  const url = String(source.url || '').trim();
  const domain = String(source.domain || '').trim();
  const images = normalizeBrowserImportImages(source.image, source.images);
  const availability = cleanAvailabilityText(source.availability || '');
  const priceParts = normalizeBrowserImportPrice(source.price || '', source.currency || '');
  const importedAt = parseLooseDateIso(source.importedAt || source.detectedAt || nowIso, nowIso);
  const updatedAt = parseLooseDateIso(source.updatedAt || importedAt, importedAt);
  return {
    ...source,
    id: String(source.id || url || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    title: cleanBrowserImportTitle(source.title || 'Unbekanntes Produkt', domain),
    price: priceParts.price,
    currency: priceParts.currency,
    image: images[0] || '',
    images,
    description: String(source.description || source.productDescription || source.summary || '').trim(),
    descriptionCandidates: Array.isArray(source.descriptionCandidates) ? source.descriptionCandidates.filter(Boolean).slice(0,8) : [],
    descriptionSource: String(source.descriptionSource || '').trim(),
    aiPrepared: source.aiPrepared && typeof source.aiPrepared === 'object' ? source.aiPrepared : null,
    aiPreparedAt: String(source.aiPreparedAt || '').trim(),
    aiProvider: String(source.aiProvider || '').trim(),
    aiModel: String(source.aiModel || '').trim(),
    aiStatus: String(source.aiStatus || '').trim(),
    aiError: String(source.aiError || '').trim(),
    variants: Array.isArray(source.variants) ? source.variants.slice(0,50) : [],
    shipping: source.shipping && typeof source.shipping === 'object' ? source.shipping : {},
    rating: String(source.rating || '').trim(),
    reviewsCount: String(source.reviewsCount || '').trim(),
    soldCount: String(source.soldCount || '').trim(),
    productDetails: source.productDetails && typeof source.productDetails === 'object' ? source.productDetails : {},
    availability,
    category: String(source.category || '').trim(),
    supplierInfo: source.supplierInfo && typeof source.supplierInfo === 'object' ? source.supplierInfo : {},
    complianceRisks: Array.isArray(source.complianceRisks) ? source.complianceRisks.filter(Boolean).slice(0,20) : [],
    url,
    supplier: String(source.supplier || '').trim(),
    domain,
    status: String(source.status || 'new').trim() || 'new',
    notes: String(source.notes || '').trim(),
    score: String(source.score || '').trim(),
    linkedSupplierId: String(source.linkedSupplierId || '').trim(),
    linkedSupplierName: String(source.linkedSupplierName || '').trim(),
    importedAt,
    updatedAt
  };
}
function cleanAvailabilityText(value){
  let text = String(value || '').trim();
  if(!text) return '';
  text = text.replace(/\{[\s\S]*$/, '').trim();
  text = text.replace(/\[[\s\S]*$/, '').trim();
  text = text.replace(/"\s*,?\s*".*$/g, '').trim();
  text = text.replace(/\b(isInternal|showInsightsHub|isRobot|showFaceout|merchantId|availableBadges|loggedIn|asin|showBadge|ingressFaceout|availableFaceouts)\b[\s\S]*$/i, '').trim();
  text = text.replace(/\s{2,}/g, ' ');
  return text.slice(0, 160);
}
function decodeBrowserImportText(value){
  const text = String(value || '').trim();
  if(!text) return '';
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}
function cleanBrowserImportTitle(value, domain){
  let text = decodeBrowserImportText(value).replace(/\s+/g, ' ').trim();
  if(String(domain || '').includes('amazon.')){
    text = text.replace(/\s*:\s*Amazon\.[^:]+(?::.*)?$/i, '').trim();
  }
  text = text.replace(/\s*-\s*AliExpress.*$/i, '').replace(/\s*\|\s*eBay.*$/i, '').trim();
  return (text || 'Unbekanntes Produkt').slice(0, 260);
}
function normalizeBrowserImportImageUrl(value){
  const text = decodeBrowserImportText(value);
  if(!text || /^data:/i.test(text) || /^blob:/i.test(text)) return '';
  try{
    const url = new URL(text);
    url.hash = '';
    return url.toString();
  }catch{
    return '';
  }
}
function normalizeBrowserImportImages(primary, images){
  const list = [primary].concat(Array.isArray(images) ? images : [])
    .map(normalizeBrowserImportImageUrl)
    .filter(Boolean);
  return Array.from(new Set(list)).slice(0,20);
}
function detectBrowserImportCurrency(value, fallback){
  const text = String(value || '');
  if(/€|\bEUR\b|\bEuro\b/i.test(text)) return 'EUR';
  if(/\$|\bUSD\b/i.test(text)) return 'USD';
  if(/£|\bGBP\b/i.test(text)) return 'GBP';
  if(/¥|\bJPY\b/i.test(text)) return 'JPY';
  return String(fallback || '').trim();
}
function normalizeBrowserImportPrice(value, fallbackCurrency){
  const text = String(value || '').trim();
  const currency = detectBrowserImportCurrency(text, fallbackCurrency);
  if(!text) return {price:'', currency};
  const clean = text.replace(/\b(EUR|Euro|USD|GBP|JPY)\b/gi, '').replace(/[€$£¥]/g, '').trim();
  const match = clean.match(/[\d]{1,3}(?:[.\s]\d{3})*(?:[.,]\d{1,2})?|[\d]+/);
  return {price: match ? match[0].replace(/\s+/g, '') : clean, currency};
}
function parseJsonArrayField(value){
  if(Array.isArray(value)) return value.filter(Boolean);
  if(typeof value !== 'string' || !value.trim()) return [];
  try{
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  }catch{
    return [];
  }
}
function normalizeBrowserImportsCollection(list){
  return Array.isArray(list) ? list.map(normalizeBrowserImportRecord) : [];
}
let products = normalizeProductsCollection(loadStoredArray("elyonProducts"));
let browserImports = normalizeBrowserImportsCollection(loadStoredArray("elyonBrowserImports"));
let browserImportsStorage = {mode:'server_unknown', message:'Serverstatus wird geladen.'};
let returns = loadStoredArray("elyonReturns");
let shopifyReturns = loadStoredArray("elyonShopifyReturns");
let sales = loadStoredArray("elyonSales");
let suppliers = loadStoredArray("elyonSuppliers");
let runningCosts = loadStoredArray("elyonCosts");
let editingProductId = null;
let productEditModalId = null;
let integrationSettings = JSON.parse(localStorage.getItem('elyonIntegrations') || '{}');
let invoices = loadStoredArray("elyonInvoices");
let pendingCsvImport = [];
let pendingEbayOrdersImport = [];
let lastCjSearchItems = [];
const defaultInvoiceSettings = {
  prefix:'RE',
  nextNumber:1,
  useYear:'yes',
  smallBusiness:'yes',
  sellerName:'',
  sellerAddress:'',
  taxId:'',
  paymentNote:'Bereits über Plattform bezahlt.',
  footerNote:'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'
};
let invoiceSettings = {...defaultInvoiceSettings, ...JSON.parse(localStorage.getItem('elyonInvoiceSettings') || '{}')};
const defaultSettings = {
  profit: 7,
  fees: 15,
  buffer: 5,
  budget: 50,
  mode: 'balanced',
  goProfit: 10,
  maxDelivery: 14,
  maxSellers: 40,
  safeMode: true,
  avoidElectronics: true,
  lucidReminder: true,
  aiEnabled: true,
  aiProvider: 'openai',
  aiModel: 'gpt-4o-mini',
  market: 'DE',
  theme: 'dark',
  designPreset: 'classic',
  start: 'dashboardTab'
};
let appSettings = { ...defaultSettings, ...JSON.parse(localStorage.getItem('elyonSettings') || '{}') };
const listingItems = ['Titel enthält Hauptkeyword','Produktbilder vorhanden','Beschreibung verständlich','Preis geprüft','Versandzeit realistisch','Rücknahmebedingungen klar','LUCID/Verpackung bedacht','WEEE/Batt geprüft, falls relevant','Markenrechte geprüft','Gewinn nach Gebühren positiv'];
const $ = id => document.getElementById(resolveTabId(id)) || document.getElementById(id);
const safe = (id, fn) => { const el = $(id); if (el) fn(el); };
const n = id => { const el = $(id); return el ? (parseFloat(String(el.value || '0').replace(',', '.')) || 0) : 0; };
function euro(v){ return (Number(v)||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'}); }
function setHTML(id, html){ safe(id, el => { el.innerHTML = html; }); }
const TAB_ALIASES = {
  homeTab: 'dashboardTab',
  productsTab: 'productSearchTab',
  researchTab: 'productAnalysisTab',
  generatorTab: 'ebayListingTab',
  salesTab: 'ordersTab',
  shippingTab: 'automationTab',
  apiImportTab: 'settingsTab',
  importTab: 'settingsTab',
  marketCheckTab: 'productAnalysisTab',
  financeTab: 'financeTab',
  listingCheckTab: 'checklistTab',
  productStatusTab: 'productListTab'
};
const START_TARGETS_BY_TAB = {
  dashboardTab: 'ebay',
  productSearchTab: 'product',
  productAnalysisTab: 'product',
  productListTab: 'productStatus',
  ebayListingTab: 'product',
  ordersTab: 'sale',
  automationTab: 'shipping',
  settingsTab: 'backoffice',
  virtualAgentsTab: 'agents',
  marketCheckTab: 'product',
  financeTab: 'finance',
  checklistTab: 'listing',
  invoiceTab: 'invoice',
  shopifyTab: 'shopify'
};
function resolveTabId(tabId){
  return TAB_ALIASES[tabId] || tabId;
}
function showTab(tabId){
  const resolvedId = resolveTabId(tabId);
  const target = $(resolvedId);
  if(!target){ console.warn('Tab nicht gefunden:', tabId); return; }
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  target.classList.add('active');
  safe('mainMenu', menu => { if([...menu.options].some(o => o.value === resolvedId && !o.disabled)) menu.value = resolvedId; });
  const startTarget = START_TARGETS_BY_TAB[resolvedId];
  if(startTarget) localStorage.setItem('elyonLastStartTarget', startTarget);
}
window.showTab = showTab;
function showShopifyTool(sectionId){
  showTab('shopifyTab');
  safe('mainMenu', menu => { menu.value = ''; });
  safe('shopifyMenu', menu => { menu.value = sectionId || 'shopifyTab'; });

  const defaultSection = sectionId && sectionId !== 'shopifyTab' ? sectionId : 'shopifyPageSection';
  document.querySelectorAll('.shopify-tool').forEach(tool => tool.classList.remove('active'));
  safe(defaultSection, el => el.classList.add('active'));

  window.scrollTo({top:0, behavior:'smooth'});
}
function resetMenusToLabNames(){
  safe('mainMenu', menu => { menu.value = ''; });
  safe('shopifyMenu', menu => { menu.value = 'shopifyTab'; });
}
function showDashboard(){
  showTab('dashboardTab');
  resetMenusToLabNames();
}
function openOrders(){
  showTab('ordersTab');
  safe('mainMenu', menu => { menu.value = 'ordersTab'; });
}
function openSalesAssistant(){
  showTab('ordersTab');
  safe('mainMenu', menu => { menu.value = 'ordersTab'; });
}
function openReturnsCenter(){
  showTab('returnsTab');
  resetMenusToLabNames();
}
function openGenerator(){
  showTab('ebayListingTab');
  safe('mainMenu', menu => { menu.value = 'ebayListingTab'; });
}
function openProductBoard(){
  showTab('productListTab');
  safe('mainMenu', menu => { menu.value = 'productListTab'; });
}
function openIntegrations(){
  safe('settingsModal', el => el.classList.remove('hidden'));
  setTimeout(function(){
    const dropdowns = document.querySelectorAll('.settings-dropdown');
    dropdowns.forEach(function(dropdown){
      const summary = dropdown.querySelector('summary');
      if(summary && summary.textContent.includes('Integrationen')) dropdown.open = true;
      else dropdown.open = false;
    });
    refreshGoogleSheetsSyncSettingsForm().then(renderGoogleSheetsSyncStatus);
  },50);
}
function openAiDashboard(){
  openIntegrations();
  setTimeout(function(){
    safe('aiDashboardModal', el => el.classList.remove('hidden'));
    refreshAiDashboardStatus();
  },80);
}
function openApiImport(){
  showTab('settingsTab');
  safe('mainMenu', menu => { menu.value = 'settingsTab'; });
  window.scrollTo({top:0, behavior:'smooth'});
}
function openImportCheck(){
  showTab('settingsTab');
  safe('mainMenu', menu => { menu.value = 'importTab'; });
  setTimeout(function(){ safe('importBtn', btn => btn.click()); }, 80);
}
function openMarketCheck(){
  showTab('productAnalysisTab');
  safe('mainMenu', menu => { menu.value = 'marketCheckTab'; });
  setTimeout(function(){ safe('rCost', el => el.focus()); }, 80);
}
function openFinanceTool(){
  showTab('financeTab');
  safe('mainMenu', menu => { menu.value = 'financeTab'; });
  setTimeout(function(){ safe('fRevenue', el => el.focus()); }, 80);
}
function openListingCheck(){
  showTab('checklistTab');
  safe('mainMenu', menu => { menu.value = 'listingCheckTab'; });
  setTimeout(function(){ safe('listingBtn', el => el.scrollIntoView({behavior:'smooth',block:'start'})); }, 80);
}
function openProductStatus(){
  showTab('productListTab');
  safe('mainMenu', menu => { menu.value = 'productStatusTab'; });
  setTimeout(function(){ safe('search', el => el.focus()); }, 80);
}
function openStartLauncher(){
  renderStartDashboard();
  safe('startLauncherModal', el => el.classList.remove('hidden'));
  const showAgain = localStorage.getItem('elyonShowStartLauncher');
  safe('showStartLauncherAgain', el => { el.checked = showAgain !== 'no'; });
}
const START_TARGET_META = {
  product:{kind:'quick', action:'product', label:'Produkt prüfen', description:'Zum Produktformular springen und den nächsten Kandidaten prüfen.', button:'Produktprüfung öffnen'},
  sale:{kind:'quick', action:'sale', label:'Verkauf öffnen', description:'Verkäufe, Gewinn und Status direkt weiterbearbeiten.', button:'Verkauf öffnen'},
  shipping:{kind:'quick', action:'shipping', label:'Versand prüfen', description:'Offene Versandfälle und Tracking nachfassen.', button:'Versand prüfen'},
  orders:{kind:'quick', action:'orders', label:'Neue Bestellungen', description:'Neue eBay-Bestellungen anzeigen und direkt abarbeiten.', button:'Bestellungen öffnen'},
  invoice:{kind:'tab', tab:'invoiceTab', label:'Rechnungen', description:'Rechnungsübersicht, Status und Export öffnen.', button:'Rechnungen öffnen'},
  return:{kind:'quick', action:'return', label:'Retouren', description:'Offene Rückgaben und Erstattungen klären.', button:'Retouren öffnen'},
  ebay:{kind:'area', area:'ebay', label:'Bestellungen', description:'Den operativen Bereich für Verkäufe, Versand und Rechnungen öffnen.', button:'Bestellungen öffnen'},
  shopify:{kind:'area', area:'shopify', label:'Shopify Vorbereitung', description:'Shopify-Lab und Store-Potenzial öffnen.', button:'Shopify öffnen'},
  backoffice:{kind:'area', area:'backoffice', label:'Backoffice & Setup', description:'Einstellungen, Backup und Integrationen öffnen.', button:'Backoffice öffnen'},
  finance:{kind:'tab', tab:'financeTab', label:'Kalkulation', description:'Finanzübersicht und Marge prüfen.', button:'Kalkulation öffnen'},
  listing:{kind:'tab', tab:'listingCheckTab', label:'Listing-Check', description:'Listing-Checkliste und Konformität prüfen.', button:'Listing-Check öffnen'},
  productStatus:{kind:'tab', tab:'productStatusTab', label:'Produkt-Status', description:'Produktstatus und offene To-dos ansehen.', button:'Status öffnen'},
  agents:{kind:'tab', tab:'virtualAgentsTab', label:'KI-Agenten', description:'Virtuelle Mitarbeiter und Automatisierung öffnen.', button:'Agenten öffnen'}
};
function setLastStartTarget(target){
  localStorage.setItem('elyonLastStartTarget', target);
}
function getLastStartTarget(){
  const target = localStorage.getItem('elyonLastStartTarget') || localStorage.getItem('elyonLastMainTab');
  return START_TARGET_META[target] ? target : 'ebay';
}
function openStartTarget(target){
  const meta = START_TARGET_META[target] || START_TARGET_META.ebay;
  setLastStartTarget(target);
  if(meta.kind === 'quick') startQuickAction(meta.action);
  else if(meta.kind === 'area') enterStartArea(meta.area);
  else if(meta.kind === 'tab'){
    showTab(meta.tab);
    if(meta.tab === 'invoiceTab') safe('invoiceSearch', el => el.focus());
    if(meta.tab === 'financeTab') safe('fRevenue', el => el.focus());
  }
}
function getStartOrderSortTime(order){
  const createdAt = Date.parse(order.createdAt || order.importedAt || order.updatedAt || '');
  return Number.isFinite(createdAt) ? createdAt : Number(order.id) || 0;
}
function getStartRecentEbayOrders(limit){
  return sales.filter(function(s){
    const platform = String(s.platform || '').toLowerCase();
    const ship = String(s.shippingStatus || 'Noch nicht versendet');
    return platform === 'ebay' && (ship === 'Noch nicht versendet' || ship === 'Versand vorbereitet' || ship === 'Bezahlt');
  }).sort(function(a, b){
    return getStartOrderSortTime(b) - getStartOrderSortTime(a);
  }).slice(0, limit || 3);
}
function getStartLauncherRecommendation(){
  const stats = getTodayFocusData();
  const openReturnCount = returns.filter(function(r){ return !isReturnClosed(r.status); }).length + shopifyReturns.filter(function(r){ return !isReturnClosed(r.status); }).length;
  const shippingTodos = sales.filter(function(s){
    const ship = s.shippingStatus || 'Noch nicht versendet';
    const trackingMissing = !String(s.trackingNo || '').trim();
    return ship !== 'Zugestellt' && ship !== 'Storniert' && (ship !== 'Versendet' || trackingMissing);
  }).length;
  const openEbayOrders = getStartRecentEbayOrders(3);
  if(stats.problemCount > 0) return {target:'product', tone:'bad', eyebrow:'Heute priorisieren', title:'Archivierte Produkte prüfen', text:'Es gibt archivierte oder unklare Produkte. Räume diese Fälle zuerst auf, bevor du weiterarbeitest.'};
  if(stats.missingKeyword > 0 || stats.missingTitle > 0 || stats.missingDescription > 0 || stats.seoCheckCount > 0 || stats.ebayReadyCount > 0){
    return {target:'product', tone:'warn', eyebrow:'Heute priorisieren', title:'Produktdaten und Listing verbessern', text:'Deine Drafts brauchen noch Titel, Keywords oder SEO-Feinschliff. Öffne direkt die Produktarbeit.'};
  }
  if(openReturnCount > 0) return {target:'return', tone:'warn', eyebrow:'Heute priorisieren', title:'Offene Retouren klären', text:openReturnCount + ' offene Retoure(n) warten auf Bearbeitung. Danach sind Versand und Rechnungen dran.'};
  if(stats.trackingMissingCount > 0 || shippingTodos > 0) return {target:'shipping', tone:'info', eyebrow:'Heute priorisieren', title:'Versand und Tracking prüfen', text:(stats.trackingMissingCount || shippingTodos) + ' Versandfall/Fälle brauchen Aufmerksamkeit oder Tracking.'};
  if(openEbayOrders.length > 0){
    return {target:'orders', tone:'good', eyebrow:'Neue Bestellungen', title:openEbayOrders.length + (openEbayOrders.length === 1 ? ' neue eBay-Bestellung' : ' neue eBay-Bestellungen'), text:'Öffne die Bestellungen und arbeite die frischen eBay-Vorgänge direkt ab.'};
  }
  const lastTarget = getLastStartTarget();
  const lastMeta = START_TARGET_META[lastTarget] || START_TARGET_META.ebay;
  return {target:lastTarget, tone:'good', eyebrow:'Weiterarbeiten', title:'Zuletzt: ' + lastMeta.label, text:lastMeta.description};
}
function renderStartDashboard(){
  const shippingTodos = sales.filter(function(s){
    const ship = s.shippingStatus || 'Noch nicht versendet';
    const trackingMissing = !String(s.trackingNo || '').trim();
    return ship !== 'Zugestellt' && ship !== 'Storniert' && (ship !== 'Versendet' || trackingMissing);
  }).length;
  const openReturns = returns.filter(function(r){ return !isReturnClosed(r.status); }).length + shopifyReturns.filter(function(r){ return !isReturnClosed(r.status); }).length;
  const ebay = integrationStatusText('ebay', integrationSettings.ebayCheck);
  const cj = integrationStatusText('cj', integrationSettings.cjCheck);
  const recommendation = getStartLauncherRecommendation();
  const openEbayOrders = getStartRecentEbayOrders(3);
  safe('startShipTodos',el=>el.textContent=shippingTodos);
  safe('startOpenReturns',el=>el.textContent=openReturns);
  safe('startBackupStatus',el=>el.textContent=lastBackupText());
  safe('startIntegrationStatus',el=>el.textContent=ebay+' / '+cj);
  safe('startTodayFocus',el=>el.textContent=getSmartDailyFocus());
  safe('startFocusTag', el => {
    el.textContent = recommendation.eyebrow;
    el.className = 'status ' + recommendation.tone;
  });
  safe('startRecommendationEyebrow', el => { el.textContent = recommendation.eyebrow; });
  safe('startRecommendationTitle', el => { el.textContent = recommendation.title; });
  safe('startRecommendationText', el => { el.textContent = recommendation.text; });
  safe('startRecommendedBtn', el => {
    el.textContent = (START_TARGET_META[recommendation.target] || START_TARGET_META.ebay).button;
    el.dataset.startTarget = recommendation.target;
  });
  safe('startOrdersTitle', el => {
    el.textContent = openEbayOrders.length + (openEbayOrders.length === 1 ? ' neue Bestellung' : ' neue Bestellungen');
  });
  safe('startRecentOrders', el => {
    if(!openEbayOrders.length){
      el.innerHTML = '<div class="start-order-empty">Keine neuen eBay-Bestellungen gefunden. Sobald eBay neue Aufträge importiert, erscheinen sie hier automatisch.</div>';
      return;
    }
    el.innerHTML = openEbayOrders.map(function(s){
      const orderNo = escapeHtml(s.orderNo || 'ohne Order-ID');
      const product = escapeHtml(s.product || 'eBay Bestellung');
      const buyer = escapeHtml(s.customerName || s.buyerRef || 'Kunde');
      const ship = escapeHtml(s.shippingStatus || 'Noch nicht versendet');
      return '<button type="button" class="start-order-item" onclick="openOrders()"><div class="start-order-main"><strong>' + product + '</strong><small>' + buyer + '</small></div><div class="start-order-meta"><small>' + orderNo + '</small><span>' + ship + '</span></div></button>';
    }).join('');
  });
}
function closeStartLauncher(){
  safe('startLauncherModal', el => el.classList.add('hidden'));
  safe('showStartLauncherAgain', el => {
    localStorage.setItem('elyonShowStartLauncher', el.checked ? 'yes' : 'no');
  });
}
function enterStartArea(area){
  setLastStartTarget(area);
  closeStartLauncher();
  if(area === 'ebay'){
    openOrders();
    return;
  }
  if(area === 'shopify'){
    showShopifyTool('shopifyPageSection');
    return;
  }
  if(area === 'backoffice'){
    safe('settingsModal', el => el.classList.remove('hidden'));
    return;
  }
}
function startQuickAction(action){
  setLastStartTarget(action);
  closeStartLauncher();
  if(action === 'product') scrollToProductForm();
  if(action === 'sale') openSalesAssistant();
  if(action === 'shipping') showTab('automationTab');
  if(action === 'orders') openOrders();
  if(action === 'invoice'){
    showTab('invoiceTab');
    safe('invoiceSearch', el => el.focus());
  }
  if(action === 'return') openReturnsCenter();
}
function save(){ products = normalizeProductsCollection(products); localStorage.setItem('elyonProducts', JSON.stringify(products)); render(); renderReturnProductOptions(); }
function saveReturns(){ localStorage.setItem('elyonReturns', JSON.stringify(returns)); renderReturns(); renderReturnsOverview(); render(); }
function saveShopifyReturns(){ localStorage.setItem('elyonShopifyReturns', JSON.stringify(shopifyReturns)); renderShopifyReturns(); renderReturnsOverview(); }
function saveSales(){ localStorage.setItem('elyonSales', JSON.stringify(sales)); renderSales(); render(); }
function saveInvoices(){
  localStorage.setItem('elyonInvoices', JSON.stringify(invoices));
  renderInvoiceOverview();
}
function saveInvoiceSettings(){
  invoiceSettings = {
    prefix: ($('invPrefix') && $('invPrefix').value.trim()) || 'RE',
    nextNumber: n('invNextNumber') || 1,
    useYear: ($('invUseYear') && $('invUseYear').value) || 'yes',
    smallBusiness: ($('invSmallBusiness') && $('invSmallBusiness').value) || 'yes',
    sellerName: ($('invSellerName') && $('invSellerName').value.trim()) || '',
    sellerAddress: ($('invSellerAddress') && $('invSellerAddress').value.trim()) || '',
    taxId: ($('invTaxId') && $('invTaxId').value.trim()) || '',
    paymentNote: ($('invPaymentNote') && $('invPaymentNote').value.trim()) || 'Bereits über Plattform bezahlt.',
    footerNote: ($('invFooterNote') && $('invFooterNote').value.trim()) || 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'
  };
  localStorage.setItem('elyonInvoiceSettings', JSON.stringify(invoiceSettings));
  applyInvoiceSettings();
  alert('Rechnungseinstellungen gespeichert.');
}
function applyInvoiceSettings(){
  safe('invPrefix',el=>el.value=invoiceSettings.prefix||'RE');
  safe('invNextNumber',el=>el.value=invoiceSettings.nextNumber||1);
  safe('invUseYear',el=>el.value=invoiceSettings.useYear||'yes');
  safe('invSmallBusiness',el=>el.value=invoiceSettings.smallBusiness||'yes');
  safe('invSellerName',el=>el.value=invoiceSettings.sellerName||'');
  safe('invSellerAddress',el=>el.value=invoiceSettings.sellerAddress||'');
  safe('invTaxId',el=>el.value=invoiceSettings.taxId||'');
  safe('invPaymentNote',el=>el.value=invoiceSettings.paymentNote||'Bereits über Plattform bezahlt.');
  safe('invFooterNote',el=>el.value=invoiceSettings.footerNote||'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.');
}
function saveIntegrationSettings(){
  const modalInput = $('setIntBackendUrl');
  const tabInput = $('intBackendUrl');
  integrationSettings.backendUrl = (modalInput && modalInput.value.trim()) || (tabInput && tabInput.value.trim()) || '';
  integrationSettings.backendCheck = 'unknown';
  integrationSettings.ebayCheck = 'unknown';
  integrationSettings.cjCheck = 'unknown';
  localStorage.setItem('elyonIntegrations', JSON.stringify(integrationSettings));
  renderIntegrationStatus();
  alert('Integrations-Einstellungen gespeichert.');
}
function renderIntegrationStatus(){
  const backendUrl = integrationSettings.backendUrl || '';
  const backendStatus = integrationStatusText('backend', integrationSettings.backendCheck);
  const ebayStatus = integrationStatusText('ebay', integrationSettings.ebayCheck);
  const cjStatus = integrationStatusText('cj', integrationSettings.cjCheck);
  safe('intBackendUrl', el => el.value = backendUrl);
  safe('setIntBackendUrl', el => el.value = backendUrl);
  safe('intBackendStatus', el => el.textContent = backendStatus);
  safe('setIntBackendStatus', el => el.textContent = backendStatus);
  safe('intEbayStatus', el => el.textContent = ebayStatus);
  safe('setIntEbayStatus', el => el.textContent = ebayStatus);
  safe('intCjStatus', el => el.textContent = cjStatus);
  safe('setIntCjStatus', el => el.textContent = cjStatus);
}
function integrationStatusText(service, state){
  if(state === 'ok'){
    if(service === 'backend') return 'Backend erreichbar';
    if(service === 'ebay') return 'eBay API erreichbar';
    return 'CJ API erreichbar';
  }
  if(state === 'error'){
    if(service === 'backend') return 'Backend nicht erreichbar';
    if(service === 'ebay') return 'eBay API nicht erreichbar';
    return 'CJ API nicht erreichbar';
  }
  return 'Nicht geprüft';
}
function normalizeBackendUrl(url){
  let out = String(url || '').trim();
  if(out && !out.startsWith('http://') && !out.startsWith('https://')){
    out = 'https://' + out;
  }
  while(out.endsWith('/')) out = out.slice(0,-1);
  return out;
}
function getBackendUrl(){
  const modalInput = $('setIntBackendUrl');
  const tabInput = $('intBackendUrl');
  return normalizeBackendUrl((modalInput && modalInput.value.trim()) || (tabInput && tabInput.value.trim()) || integrationSettings.backendUrl || '');
}
async function fetchBackendJSON(path,options){
  const backendUrl = getBackendUrl();
  if(!backendUrl) throw new Error('Bitte zuerst die Backend URL speichern.');
  const url = backendUrl + path;
  try{
    const controller = new AbortController();
    const timer = setTimeout(function(){ controller.abort(); }, 9000);
    const response = await fetch(url, {...(options || {}), signal: controller.signal});
    clearTimeout(timer);
    let data = null;
    try{ data = await response.json(); }catch(err){ data = {}; }
    if(!response.ok){
      const msg = data && (data.error || data.message) ? (data.error || data.message) : ('Backend-Fehler: HTTP ' + response.status);
      throw new Error(msg + ' · URL: ' + url);
    }
    return data;
  }catch(err){
    if(err.name === 'AbortError') throw new Error('Zeitüberschreitung · URL nicht erreichbar: ' + url);
    if(String(err.message || '').includes('URL:')) throw err;
    throw new Error('Failed to fetch · Prüfe Backend URL, CORS oder Vercel-Route · URL: ' + url);
  }
}
function testBackendConnection(){
  const backendUrl = getBackendUrl();
  if(!backendUrl){
    setHTML('backendTestResult','<p>Trage zuerst eine Backend URL ein.</p>');
    setHTML('settingsIntegrationResult','<p>Trage zuerst eine Backend URL ein.</p>');
    return;
  }
  integrationSettings.backendUrl = backendUrl;
  integrationSettings.backendCheck = 'unknown';
  localStorage.setItem('elyonIntegrations', JSON.stringify(integrationSettings));
  renderIntegrationStatus();
  const intro = '<p>Prüfe Backend: <strong>'+backendUrl+'</strong></p>';
  setHTML('backendTestResult',intro+'<p>Ping wird geprüft...</p>');
  setHTML('settingsIntegrationResult',intro+'<p>Ping wird geprüft...</p>');
  fetchBackendJSON('/api/ping').then(function(data){
    if(!data || data.ok !== true){
      throw new Error((data && (data.error || data.message)) ? (data.error || data.message) : 'Ping antwortet nicht mit ok:true');
    }
    integrationSettings.backendCheck = 'ok';
    localStorage.setItem('elyonIntegrations', JSON.stringify(integrationSettings));
    renderIntegrationStatus();
    const html = '<h3>Backend-Test</h3><p>Ping: <strong>Backend erreichbar</strong></p><p class="hint">Route geprüft: /api/ping</p>';
    setHTML('backendTestResult',html);
    setHTML('settingsIntegrationResult',html);
  }).catch(function(err){
    integrationSettings.backendCheck = 'error';
    localStorage.setItem('elyonIntegrations', JSON.stringify(integrationSettings));
    renderIntegrationStatus();
    const msg = err && err.message ? err.message : 'Backend nicht erreichbar';
    const html = '<h3>Backend-Test</h3><p>Ping: <strong>Backend nicht erreichbar</strong></p><p class="hint">'+msg+'</p><p class="hint">Route geprüft: /api/ping</p>';
    setHTML('backendTestResult',html);
    setHTML('settingsIntegrationResult',html);
  });
}
function prepareEbayIntegration(){
  const backendUrl = getBackendUrl();
  if(!backendUrl){
    setHTML('ebayIntegrationResult','<p>Bitte zuerst die Backend URL speichern.</p>');
    setHTML('settingsIntegrationResult','<p>Bitte zuerst die Backend URL speichern.</p>');
    return;
  }
  integrationSettings.backendUrl = backendUrl;
  integrationSettings.ebayCheck = 'unknown';
  localStorage.setItem('elyonIntegrations', JSON.stringify(integrationSettings));
  renderIntegrationStatus();
  setHTML('ebayIntegrationResult','<p>eBay API wird geprüft...</p>');
  setHTML('settingsIntegrationResult','<p>eBay API wird geprüft...</p>');
  fetchBackendJSON('/api/ebay/status').then(function(data){
    if(!data || data.ok !== true){
      throw new Error((data && (data.error || data.message)) ? (data.error || data.message) : 'eBay Route antwortet nicht mit ok:true');
    }
    integrationSettings.ebayCheck = 'ok';
    localStorage.setItem('elyonIntegrations', JSON.stringify(integrationSettings));
    renderIntegrationStatus();
    const html = '<p>eBay API erreichbar.</p><p class="hint">Route geprüft: /api/ebay/status</p>';
    setHTML('ebayIntegrationResult',html);
    setHTML('settingsIntegrationResult',html);
  }).catch(function(err){
    integrationSettings.ebayCheck = 'error';
    localStorage.setItem('elyonIntegrations', JSON.stringify(integrationSettings));
    renderIntegrationStatus();
    const msg = err && err.message ? err.message : 'eBay API nicht erreichbar';
    const html = '<p>eBay API nicht erreichbar.</p><p class="hint">'+msg+'</p><p class="hint">Route geprüft: /api/ebay/status</p>';
    setHTML('ebayIntegrationResult',html);
    setHTML('settingsIntegrationResult',html);
  });
}
function prepareCjIntegration(){
  const backendUrl = getBackendUrl();
  if(!backendUrl){
    setHTML('cjIntegrationResult','<p>Bitte zuerst die Backend URL speichern.</p>');
    setHTML('settingsIntegrationResult','<p>Bitte zuerst die Backend URL speichern.</p>');
    return;
  }
  integrationSettings.backendUrl = backendUrl;
  integrationSettings.cjCheck = 'unknown';
  localStorage.setItem('elyonIntegrations', JSON.stringify(integrationSettings));
  renderIntegrationStatus();
  setHTML('cjIntegrationResult','<p>CJ API wird geprüft...</p>');
  setHTML('settingsIntegrationResult','<p>CJ API wird geprüft...</p>');
  fetchBackendJSON('/api/cj/status').then(function(data){
    if(!data || data.ok !== true){
      throw new Error((data && (data.error || data.message)) ? (data.error || data.message) : 'CJ Route antwortet nicht mit ok:true');
    }
    integrationSettings.cjCheck = 'ok';
    localStorage.setItem('elyonIntegrations', JSON.stringify(integrationSettings));
    renderIntegrationStatus();
    const html = '<p>CJ API erreichbar.</p><p class="hint">Route geprüft: /api/cj/status</p>';
    setHTML('cjIntegrationResult',html);
    setHTML('settingsIntegrationResult',html);
  }).catch(function(err){
    integrationSettings.cjCheck = 'error';
    localStorage.setItem('elyonIntegrations', JSON.stringify(integrationSettings));
    renderIntegrationStatus();
    const msg = err && err.message ? err.message : 'CJ API nicht erreichbar';
    const html = '<p>CJ API nicht erreichbar.</p><p class="hint">'+msg+'</p><p class="hint">Route geprüft: /api/cj/status</p>';
    setHTML('cjIntegrationResult',html);
    setHTML('settingsIntegrationResult',html);
  });
}
function resetIntegrationSettings(){
  if(!confirm('Integrationen wirklich zurücksetzen? Produktdaten, Verkäufe und Retouren bleiben erhalten.')) return;
  integrationSettings = {};
  pendingEbayOrdersImport = [];
  lastCjSearchItems = [];
  localStorage.removeItem('elyonIntegrations');
  renderIntegrationStatus();
  setHTML('settingsIntegrationResult','<p>Integrationen wurden zurückgesetzt. Backend, eBay und CJ sind wieder nicht geprüft.</p>');
  setHTML('backendTestResult','<p>Backend noch nicht geprüft.</p>');
  setHTML('ebayIntegrationResult','<p>eBay API noch nicht geprüft.</p>');
  setHTML('cjIntegrationResult','<p>CJ API noch nicht geprüft.</p>');
  setHTML('cjSearchResult','<p>Noch keine CJ Suche.</p>');
  setHTML('ebayCompetitionResult','<p>Noch keine eBay Konkurrenzprüfung.</p>');
  setHTML('ebayOrdersImportResult','<p>Noch keine Bestellungen abgerufen.</p>');
}
const GOOGLE_SHEETS_SYNC_KEYS = {
  url: 'elyon_google_apps_script_url',
  urlEncrypted: 'elyon_google_apps_script_url_encrypted',
  token: 'elyon_google_sync_token',
  tokenEncrypted: 'elyon_google_sync_token_encrypted',
  inventoryAt: 'elyon_last_inventory_sync_at',
  supplierAt: 'elyon_last_supplier_sync_at',
  salesAt: 'elyon_last_sales_sync_at',
  costsAt: 'elyon_last_costs_sync_at',
};
const AUTHORITATIVE_GOOGLE_SHEET_ID = '1-PhVpyF44kxE09uRtwEKnGn9XBtStbp4wSWxeJ_zASI';
const GOOGLE_SHEETS_SYNC_TYPES = {
  inventory: 'inventory',
  suppliers: 'suppliers',
  sales: 'sales',
  costs: 'costs',
};
const GOOGLE_SHEETS_AUTO_SYNC_KEYS = {
  enabled: 'elyon_google_sheets_auto_sync_enabled',
  intervalMinutes: 'elyon_google_sheets_auto_sync_interval_minutes',
  lastRunAt: 'elyon_google_sheets_auto_sync_last_run_at',
};
const GOOGLE_SHEETS_SYNC_ERROR_KEYS = {
  inventory: 'elyon_google_sheets_sync_error_inventory',
  suppliers: 'elyon_google_sheets_sync_error_suppliers',
  sales: 'elyon_google_sheets_sync_error_sales',
  costs: 'elyon_google_sheets_sync_error_costs',
  load: 'elyon_google_sheets_sync_error_load',
};
let googleSheetsAutoSyncTimer = null;
let googleSheetsAutoSyncInFlight = false;
function queueGoogleSheetsSyncSettingsCloudSave(){
  return Promise.resolve();
}
function getGoogleSheetsSyncError(type){
  const key = GOOGLE_SHEETS_SYNC_ERROR_KEYS[type];
  return key ? String(localStorage.getItem(key) || '') : '';
}
function setGoogleSheetsSyncError(type, message){
  const key = GOOGLE_SHEETS_SYNC_ERROR_KEYS[type];
  if(!key) return;
  localStorage.setItem(key, String(message || ''));
}
function clearGoogleSheetsSyncError(type){
  const key = GOOGLE_SHEETS_SYNC_ERROR_KEYS[type];
  if(!key) return;
  localStorage.removeItem(key);
}
function setGoogleSheetsSyncLoadError(message){
  localStorage.setItem(GOOGLE_SHEETS_SYNC_ERROR_KEYS.load, String(message || ''));
}
function clearGoogleSheetsSyncLoadError(){
  localStorage.removeItem(GOOGLE_SHEETS_SYNC_ERROR_KEYS.load);
}
function sheetText(value){
  if(value === null || value === undefined) return '';
  if(value instanceof Date) return value.toISOString();
  return String(value).trim();
}
function sheetNumber(value){
  const raw = String(value === null || value === undefined ? '' : value).replace(',', '.').trim();
  if(!raw) return '';
  const number = Number(raw);
  return Number.isFinite(number) ? number : '';
}
function sheetYesNo(value){
  if(value === true || value === 'true' || value === 'yes' || value === 'ja' || value === '1' || value === 1) return 'Ja';
  if(value === false || value === 'false' || value === 'no' || value === 'nein' || value === '0' || value === 0) return 'Nein';
  return sheetText(value);
}
function formatSyncTimestamp(value){
  if(!value) return 'Noch nie';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return sheetText(value);
  return date.toLocaleString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function getGoogleSheetsSyncCryptoMaterial(){
  return 'elyon-google-sheets-sync::v1::' + window.location.origin;
}
function toBase64(bytes){
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}
function fromBase64(value){
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i += 1){
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
async function deriveGoogleSheetsSyncKey(){
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(getGoogleSheetsSyncCryptoMaterial()));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function encryptGoogleSheetsSyncValue(value){
  const plain = String(value || '');
  if(!plain) return '';
  const key = await deriveGoogleSheetsSyncKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return JSON.stringify({ v: 1, iv: toBase64(iv), data: toBase64(new Uint8Array(cipherBuffer)) });
}
async function decryptGoogleSheetsSyncValue(value){
  const raw = String(value || '');
  if(!raw) return '';
  try{
    const parsed = JSON.parse(raw);
    if(!parsed || parsed.v !== 1 || !parsed.iv || !parsed.data) return raw;
    const key = await deriveGoogleSheetsSyncKey();
    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(parsed.iv) },
      key,
      fromBase64(parsed.data)
    );
    return new TextDecoder().decode(plainBuffer);
  }catch{
    return raw;
  }
}
async function getStoredGoogleSheetsSyncToken(){
  const encrypted = localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.tokenEncrypted) || '';
  if(encrypted){
    const decrypted = await decryptGoogleSheetsSyncValue(encrypted);
    if(decrypted) return decrypted;
  }
  return localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.token) || '';
}
async function getStoredGoogleSheetsSyncUrl(){
  const encrypted = localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.urlEncrypted) || '';
  if(encrypted){
    const decrypted = await decryptGoogleSheetsSyncValue(encrypted);
    if(decrypted) return decrypted;
  }
  return localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.url) || '';
}
async function setStoredGoogleSheetsSyncUrl(url){
  const encrypted = await encryptGoogleSheetsSyncValue(url);
  localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.urlEncrypted, encrypted);
  localStorage.removeItem(GOOGLE_SHEETS_SYNC_KEYS.url);
}
async function setStoredGoogleSheetsSyncToken(token){
  const encrypted = await encryptGoogleSheetsSyncValue(token);
  localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.tokenEncrypted, encrypted);
  localStorage.removeItem(GOOGLE_SHEETS_SYNC_KEYS.token);
}
function getGoogleSheetsSyncConfig(){
  const formUrl = $('googleSheetsSyncUrl') && $('googleSheetsSyncUrl').value.trim() ? $('googleSheetsSyncUrl').value.trim() : '';
  const formToken = $('googleSheetsSyncToken') && $('googleSheetsSyncToken').value.trim() ? $('googleSheetsSyncToken').value.trim() : '';
  return {
    url: formUrl,
    token: formToken,
  };
}
function setGoogleSheetsSyncTokenVisibility(visible){
  const input = $('googleSheetsSyncToken');
  const button = $('googleSheetsSyncToggleTokenVisibilityBtn');
  if(input) input.type = visible ? 'text' : 'password';
  if(button){
    button.textContent = visible ? '🙈' : '👁';
    button.setAttribute('aria-label', visible ? 'Token verbergen' : 'Token anzeigen');
    button.title = visible ? 'Token verbergen' : 'Token anzeigen';
  }
}
async function refreshGoogleSheetsSyncSettingsForm(){
  const url = await getStoredGoogleSheetsSyncUrl();
  const token = await getStoredGoogleSheetsSyncToken();
  safe('googleSheetsSyncUrl', el => el.value = url);
  safe('googleSheetsSyncToken', el => el.value = token);
  setGoogleSheetsSyncTokenVisibility(false);
}
function setGoogleSheetsSyncTimestamp(type, iso){
  const map = {
    inventory: GOOGLE_SHEETS_SYNC_KEYS.inventoryAt,
    suppliers: GOOGLE_SHEETS_SYNC_KEYS.supplierAt,
    sales: GOOGLE_SHEETS_SYNC_KEYS.salesAt,
    costs: GOOGLE_SHEETS_SYNC_KEYS.costsAt,
  };
  const key = map[type];
  if(key){
    localStorage.setItem(key, iso || new Date().toISOString());
  }
}
function renderGoogleSheetsMetric(label, timestamp, errorText){
  const metricClass = errorText ? 'bad' : (timestamp && timestamp !== 'Noch nie' ? 'good' : 'warn');
  const detail = errorText ? ('Fehler: ' + String(errorText)) : ('Letzter Sync: ' + (timestamp || 'Noch nie'));
  return '<div class="metric"><small>' + String(label || 'Sync') + '</small><strong class="' + metricClass + '">' + (timestamp || 'Noch nie') + '</strong><p class="hint" style="margin-top:8px">' + detail + '</p></div>';
}
function getGoogleSheetsAutoSyncSettings(){
  return {
    enabled: localStorage.getItem(GOOGLE_SHEETS_AUTO_SYNC_KEYS.enabled) === 'yes',
    intervalMinutes: Math.max(5, parseInt(localStorage.getItem(GOOGLE_SHEETS_AUTO_SYNC_KEYS.intervalMinutes) || '15', 10) || 15),
    lastRunAt: localStorage.getItem(GOOGLE_SHEETS_AUTO_SYNC_KEYS.lastRunAt) || ''
  };
}
function saveGoogleSheetsAutoSyncSettings(){
  const enabled = !!($('googleSheetsAutoSyncEnabled') && $('googleSheetsAutoSyncEnabled').checked);
  const intervalMinutes = Math.max(5, parseInt(($('googleSheetsAutoSyncInterval') && $('googleSheetsAutoSyncInterval').value) || '15', 10) || 15);
  localStorage.setItem(GOOGLE_SHEETS_AUTO_SYNC_KEYS.enabled, enabled ? 'yes' : 'no');
  localStorage.setItem(GOOGLE_SHEETS_AUTO_SYNC_KEYS.intervalMinutes, String(intervalMinutes));
  renderGoogleSheetsSyncStatus();
  scheduleGoogleSheetsAutoSync();
  if(enabled){
    localStorage.setItem(GOOGLE_SHEETS_AUTO_SYNC_KEYS.lastRunAt, new Date().toISOString());
    renderGoogleSheetsSyncStatus();
    setHTML('googleSheetsSyncResult', '<p>Auto-Abgleich aktiviert. Erster Abgleich startet jetzt...</p>');
    reconcileAllGoogleSheets({ silent:false }).catch(function(error){
      const message = error && error.message ? error.message : 'Auto-Abgleich konnte nicht gestartet werden.';
      setHTML('googleSheetsSyncResult', '<p>⚠️ ' + escapeHtml(message) + '</p>');
    });
  }else{
    setHTML('googleSheetsSyncResult', '<p>Auto-Abgleich deaktiviert.</p>');
  }
}
function renderGoogleSheetsSyncStatus(){
  const config = getGoogleSheetsSyncConfig();
  const connected = !!(config.url && config.token);
  const statusText = connected ? 'Google Sheets Sync eingerichtet' : 'Nicht verbunden';
  const statusClass = connected ? 'good' : 'bad';
  const autoSync = getGoogleSheetsAutoSyncSettings();
  const lastInventory = formatSyncTimestamp(localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.inventoryAt));
  const lastSupplier = formatSyncTimestamp(localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.supplierAt));
  const lastSales = formatSyncTimestamp(localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.salesAt));
  const lastCosts = formatSyncTimestamp(localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.costsAt));
  safe('googleSheetsAutoSyncEnabled', el => { el.checked = autoSync.enabled; });
  safe('googleSheetsAutoSyncInterval', el => { el.value = String(autoSync.intervalMinutes); });
  setHTML('googleSheetsSyncStatus',
    '<div class="score-top"><span class="status ' + statusClass + '">' + statusText + '</span><span class="score-number">' + (connected ? 'SYNC' : 'OFF') + '</span></div>' +
    '<div class="dashboard" style="margin-top:16px">' +
      renderGoogleSheetsMetric('Inventar', lastInventory, '') +
      renderGoogleSheetsMetric('Supplier', lastSupplier, '') +
      renderGoogleSheetsMetric('Verkäufe', lastSales, '') +
      renderGoogleSheetsMetric('Laufende Kosten', lastCosts, '') +
    '</div>' +
    '<div class="output-box" style="margin-top:14px"><p>' + (connected ? 'Sync bereit. URL und Token werden lokal verschlüsselt gespeichert.' : 'Trage URL und Token ein, um die Google Sheets Sync zu aktivieren.') + '</p><p class="hint" style="margin-top:8px">Autoritative Datei: InventarTracker (`' + AUTHORITATIVE_GOOGLE_SHEET_ID + '`)</p><p class="hint" style="margin-top:8px">Auto-Abgleich: ' + (autoSync.enabled ? ('aktiv, alle ' + autoSync.intervalMinutes + ' Minuten') : 'aus') + (autoSync.lastRunAt ? ' · letzter Lauf: ' + formatSyncTimestamp(autoSync.lastRunAt) : '') + '</p></div>'
  );
  scheduleGoogleSheetsAutoSync();
}
async function saveGoogleSheetsSyncSettings(){
  const url = $('googleSheetsSyncUrl') ? $('googleSheetsSyncUrl').value.trim() : '';
  const token = $('googleSheetsSyncToken') ? $('googleSheetsSyncToken').value.trim() : '';
  if(!url || !token){
    setHTML('googleSheetsSyncResult', '<p>Bitte Web-App URL und Sync Token eintragen.</p>');
    alert('Bitte Google Apps Script Web-App URL und Sync Token eintragen.');
    return;
  }
  await setStoredGoogleSheetsSyncUrl(url);
  await setStoredGoogleSheetsSyncToken(token);
  saveGoogleSheetsAutoSyncSettings();
  renderGoogleSheetsSyncStatus();
  setHTML('googleSheetsSyncResult', '<p>Sync-Einstellungen gespeichert.</p>');
  alert('Google Sheets Sync-Einstellungen gespeichert.');
}
function calcProductSafe(product){
  try{
    return calcProduct(product || {});
  }catch(error){
    return null;
  }
}
function deriveSuppliersFromProducts(){
  const map = new Map();
  (Array.isArray(products) ? products : []).forEach(function(product){
    const supplierId = sheetText(product.supplierId || product.supplierID || product.supplier || '');
    const supplierName = sheetText(product.supplierName || product.supplierLabel || product.supplier || '');
    const key = supplierId || supplierName;
    if(!key) return;
    if(map.has(key)) return;
    map.set(key, {
      supplierId: supplierId || key,
      name: supplierName || supplierId || key,
      platform: sheetText(product.supplierPlatform || product.platform || 'unbekannt'),
      website: sheetText(product.supplierLink || product.website || product.url || ''),
      contact: sheetText(product.supplierContact || product.contact || ''),
      shippingCountries: sheetText(product.shippingCountries || product.countries || ''),
      delivery: sheetText(product.delivery || product.deliveryTime || ''),
      returnsPossible: sheetYesNo(product.returnsPossible || product.supplierReturns || ''),
      paymentType: sheetText(product.paymentType || product.supplierPayment || ''),
      rating: sheetText(product.supplierRating || product.rating || ''),
      status: sheetText(product.supplierStatus || product.status || 'aktiv'),
      notes: sheetText(product.supplierNotes || product.notes || ''),
    });
  });
  return Array.from(map.values());
}
function getInventorySyncRecords(){
  return Array.isArray(products) ? products.filter(isMeaningfulInventoryProductRecord) : [];
}
function getSupplierSyncRecords(){
  const stored = loadStoredArray('elyonSuppliers');
  if(Array.isArray(stored) && stored.length) return stored;
  return deriveSuppliersFromProducts();
}
function getSalesSyncRecords(){
  return Array.isArray(sales) ? sales : [];
}
function getCostSyncRecords(){
  return loadStoredArray('elyonCosts');
}
function mapProductToSheetRow(product){
  const p = product || {};
  const calc = calcProductSafe(p) || {};
  const buy = sheetNumber(p.buy);
  const ship = sheetNumber(p.ship);
  const totalCost = (buy || 0) + (ship || 0);
  const targetProfit = sheetNumber(p.targetProfit ?? appSettings.profit);
  const recommendedPrice = sheetNumber(p.recommendedPrice ?? calc.recommendedPrice);
  const fee = sheetNumber(p.fee ?? appSettings.fees);
  const profit = sheetNumber(p.profit ?? calc.profit);
  return [
    sheetText(p.articleId || p.sku || p.id || ''),
    sheetText(p.name || p.title || p.productName || 'Unbenanntes Produkt'),
    sheetText(p.type || p.category || 'Produkt'),
    buy,
    ship,
    totalCost,
    sheetNumber(p.sell),
    fee,
    profit,
    targetProfit,
    recommendedPrice,
    sheetText(p.shipFrom || p.shippingFrom || ''),
    sheetText(p.stock || p.qty || ''),
    sheetText(normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft')),
    sheetText(p.supplierName || p.supplier || p.supplierId || ''),
    sheetText(p.delivery || p.deliveryTime || ''),
    sheetText(p.ebayLink || p.ebayUrl || p.ebayItemId || ''),
    sheetText(p.notes || ''),
  ];
}
function mapSupplierToSheetRow(supplier){
  const s = supplier || {};
  return [
    sheetText(s.supplierId || s.id || ''),
    sheetText(s.name || s.supplierName || ''),
    sheetText(s.platform || ''),
    sheetText(s.website || s.url || s.link || ''),
    sheetText(s.contact || ''),
    sheetText(s.shippingCountries || ''),
    sheetText(s.delivery || s.deliveryTime || ''),
    sheetYesNo(s.returnsPossible),
    sheetText(s.paymentType || ''),
    sheetText(s.rating || ''),
    sheetText(s.status || 'aktiv'),
    sheetText(s.notes || ''),
  ];
}
function mapSaleToSheetRow(sale){
  const p = sale || {};
  const quantity = sheetNumber(p.qty || p.quantity || 1) || 1;
  const price = sheetNumber(p.price ?? p.sell ?? p.salePrice ?? 0);
  const cost = sheetNumber(p.cost ?? p.buy ?? p.purchasePrice ?? 0);
  const shipping = sheetNumber(p.ship ?? p.shipping ?? p.shippingCost ?? 0);
  const fees = sheetNumber(p.fees ?? p.fee ?? 0);
  const totalCost = sheetNumber(p.totalCost ?? (cost + shipping));
  const profit = sheetNumber(p.profit ?? (price - totalCost - fees));
  const targetProfit = sheetNumber(p.targetProfit ?? appSettings.profit);
  const recommendedPrice = sheetNumber(p.recommendedPrice ?? 0);
  return [
    sheetText(p.orderNo || p.orderId || p.id || p.articleId || p.sku || ''),
    sheetText(p.articleId || p.productId || p.sku || ''),
    sheetText(p.createdAt || p.created || ''),
    sheetText(p.product || p.name || p.title || 'Unbenanntes Produkt'),
    sheetText(p.type || p.category || 'Produkt'),
    quantity,
    sheetText(p.platform || 'eBay'),
    price,
    cost,
    shipping,
    fees,
    totalCost,
    profit,
    targetProfit,
    recommendedPrice,
    sheetText(p.status || 'Bezahlt'),
    sheetText(p.shippingStatus || ''),
    sheetText(p.trackingNo || ''),
    sheetText(p.buyerRef || ''),
    sheetText(p.customerName || ''),
    sheetText(p.customerEmail || ''),
    sheetText(p.customerPhone || ''),
    sheetText(p.supplierName || p.supplier || ''),
    sheetText(p.delivery || p.deliveryTime || ''),
    sheetText(p.shipFrom || p.shippingFrom || ''),
    sheetText(p.carrier || ''),
    sheetText(p.returnFlag || 'no'),
    sheetText(p.shipDate || ''),
    sheetText(p.ebayLink || p.ebayUrl || p.ebayItemId || ''),
    sheetText(p.note || p.notes || ''),
  ];
}
function mapCostToSheetRow(cost){
  const c = cost || {};
  return [
    sheetText(c.id || c.costId || ''),
    sheetText(c.date || c.created || todayInputDate()),
    sheetText(c.category || ''),
    sheetText(c.description || c.note || ''),
    sheetNumber(c.amount ?? c.value ?? ''),
    sheetText(c.paymentMethod || c.paymentType || ''),
    sheetYesNo(c.recurring),
    sheetText(c.interval || c.repeatInterval || ''),
    sheetText(c.nextDue || c.nextDueDate || ''),
    sheetText(c.status || 'offen'),
    sheetText(c.notes || ''),
  ];
}
function sheetRecordField(record, names){
  const source = record && typeof record === 'object' ? record : {};
  const lookup = {};
  Object.keys(source).forEach(function(key){
    lookup[sheetText(key).toLowerCase().replace(/[^a-z0-9]+/g, '')] = source[key];
  });
  const list = Array.isArray(names) ? names : [names];
  for(let i = 0; i < list.length; i += 1){
    const target = sheetText(list[i]).toLowerCase().replace(/[^a-z0-9]+/g, '');
    if(Object.prototype.hasOwnProperty.call(lookup, target)){
      return lookup[target];
    }
  }
  return '';
}
function sheetRecordDate(value){
  if(!value) return '';
  if(value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const parsed = Date.parse(String(value).trim());
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}
function sheetRecordDateLabel(value){
  const iso = sheetRecordDate(value);
  if(!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('de-DE');
}
function mapGoogleSheetSaleRecord(record, index){
  const orderId = sheetRecordField(record, ['Order-ID', 'OrderId', 'orderNo', 'orderId', 'id']);
  const articleId = sheetRecordField(record, ['Artikel-ID', 'ArtikelId', 'SKU', 'productId', 'sku']);
  const createdAtValue = sheetRecordField(record, ['Datum', 'Date', 'createdAt', 'created']);
  const name = sheetRecordField(record, ['Produkt', 'Bezeichnung', 'Product', 'name', 'title']) || 'Unbenanntes Produkt';
  const type = sheetRecordField(record, ['Typ', 'Kategorie', 'Category']) || 'Produkt';
  const quantity = sheetNumber(sheetRecordField(record, ['Menge', 'Stückzahl', 'qty', 'quantity']) || 1) || 1;
  const platform = sheetRecordField(record, ['Plattform', 'Platform']) || 'eBay';
  const price = sheetNumber(sheetRecordField(record, ['Verkaufspreis', 'Preis VK (ebay)', 'Preis VK', 'VK', 'Preis', 'Umsatz']));
  const cost = sheetNumber(sheetRecordField(record, ['Preis EK', 'EK', 'Cost', 'Einkaufspreis']));
  const shipping = sheetNumber(sheetRecordField(record, ['Versandkosten', 'Versand mind.', 'Versand', 'Shipping']));
  const totalCost = sheetNumber(sheetRecordField(record, ['Gesamt EK', 'PreisGesamt EK', 'Gesamt EK']));
  const fees = sheetNumber(sheetRecordField(record, ['Gebühren', 'Ebay Gebühren', 'Ebay gebühren', 'eBay Gebühren', 'fee']));
  const profitRaw = sheetRecordField(record, ['Gewinn', 'Profit']);
  const targetProfit = sheetNumber(sheetRecordField(record, ['Zielgewinn', 'Target Profit']));
  const recommendedPrice = sheetNumber(sheetRecordField(record, ['Empf. Zielpreis', 'Emph. Zielpreis', 'Empfohlener Preis']));
  const status = sheetRecordField(record, ['Status']) || 'Bezahlt';
  const shippingStatus = sheetRecordField(record, ['Versandstatus', 'Shipping Status']) || (String(status).toLowerCase() === 'versendet' ? 'Versendet' : 'Noch nicht versendet');
  const trackingNo = sheetRecordField(record, ['Trackingnummer', 'Tracking', 'Tracking No']);
  const buyerRef = sheetRecordField(record, ['Käufer-Referenz', 'Buyer-Referenz', 'buyerRef']);
  const customerName = sheetRecordField(record, ['Kundenname', 'Customer', 'customerName']);
  const customerEmail = sheetRecordField(record, ['E-Mail', 'Email', 'customerEmail']);
  const customerPhone = sheetRecordField(record, ['Telefon', 'Phone', 'customerPhone']);
  const supplier = sheetRecordField(record, ['Lieferant', 'Supplier', 'supplierName']);
  const delivery = sheetRecordField(record, ['Versandzeit', 'Delivery', 'Lieferzeit']);
  const shipFrom = sheetRecordField(record, ['Versand ab', 'Ship From', 'Versandort']);
  const carrier = sheetRecordField(record, ['Versanddienstleister', 'Carrier', 'carrier']) || 'DHL';
  const returnFlag = String(sheetRecordField(record, ['Retoure', 'returnFlag']) || 'no').toLowerCase();
  const shipDate = sheetRecordField(record, ['Versanddatum', 'shipDate', 'Ship Date']);
  const ebayLink = sheetRecordField(record, ['eBay Link', 'Ebay Link', 'Ebay URL', 'Link']);
  const note = sheetRecordField(record, ['Hinweise', 'Notizen', 'Notiz', 'note']);
  const createdAt = sheetRecordDate(createdAtValue) || new Date().toISOString();
  const resolvedTotalCost = Number.isFinite(totalCost) && totalCost > 0 ? totalCost : (cost + shipping);
  const profit = Number.isFinite(Number(profitRaw)) ? Number(profitRaw) : (Number.isFinite(price) ? (price - resolvedTotalCost - fees) : 0);
  const resolvedOrderId = orderId || articleId || (Date.now() + index);
  return {
    id: resolvedOrderId,
    orderNo: orderId || String(resolvedOrderId),
    orderId: orderId || String(resolvedOrderId),
    articleId: articleId || '',
    productId: articleId || '',
    sku: articleId || '',
    product: name,
    name: name,
    title: name,
    type: type,
    category: type,
    platform: platform,
    price: Number.isFinite(price) ? price : 0,
    sell: Number.isFinite(price) ? price : 0,
    cost: Number.isFinite(cost) ? cost : 0,
    buy: Number.isFinite(cost) ? cost : 0,
    ship: Number.isFinite(shipping) ? shipping : 0,
    shipping: Number.isFinite(shipping) ? shipping : 0,
    totalCost: Number.isFinite(resolvedTotalCost) ? resolvedTotalCost : 0,
    fees: Number.isFinite(fees) ? fees : 0,
    fee: Number.isFinite(fees) ? fees : 0,
    qty: quantity,
    profit: Number.isFinite(profit) ? profit : 0,
    targetProfit: Number.isFinite(targetProfit) ? targetProfit : 0,
    recommendedPrice: Number.isFinite(recommendedPrice) ? recommendedPrice : 0,
    status: status,
    shippingStatus: shippingStatus,
    trackingNo: trackingNo,
    buyerRef: buyerRef,
    customerName: customerName,
    customerEmail: customerEmail,
    customerPhone: customerPhone,
    supplierName: supplier,
    supplier: supplier,
    delivery: delivery,
    deliveryTime: delivery,
    shipFrom: shipFrom,
    shippingFrom: shipFrom,
    carrier: carrier,
    returnFlag: returnFlag,
    shipDate: shipDate,
    ebayLink: ebayLink,
    ebayUrl: ebayLink,
    note: note,
    notes: note,
    created: sheetRecordDateLabel(createdAt) || sheetText(createdAt),
    createdAt: createdAt,
    updatedAt: createdAt,
  };
}
function mapGoogleSheetInventoryRecord(record, index){
  const articleId = sheetRecordField(record, ['Artikel-ID', 'ArtikelId', 'SKU', 'sku']);
  const primaryName = sheetRecordField(record, ['Bezeichnung']);
  const fallbackName = sheetRecordField(record, ['Produktname', 'Name', 'Titel', 'Artikelname', 'Produkt']);
  const resolvedPrimaryName = String(primaryName || '').trim();
  const resolvedFallbackName = String(fallbackName || '').trim();
  const resolvedArticleId = String(articleId || '').trim();
  const name = (resolvedPrimaryName && resolvedPrimaryName !== resolvedArticleId ? resolvedPrimaryName : (resolvedFallbackName || resolvedPrimaryName)) || 'Importiertes Produkt';
  const type = sheetRecordField(record, ['Typ', 'Kategorie', 'Category']) || 'Produkt';
  const createdAt = new Date().toISOString();
  return normalizeProductRecord({
    id: articleId || ('sheet-product-' + index + '-' + Date.now()),
    articleId: articleId || '',
    sku: articleId || '',
    name: name,
    title: name,
    type: type,
    category: type,
    buy: sheetNumber(sheetRecordField(record, ['Preis EK', 'EK', 'Einkaufspreis'])),
    ship: sheetNumber(sheetRecordField(record, ['Versand mind.', 'Versand', 'Versandkosten'])),
    sell: sheetNumber(sheetRecordField(record, ['Preis VK (ebay)', 'Preis VK', 'VK', 'Verkaufspreis'])),
    fee: sheetNumber(sheetRecordField(record, ['Ebay gebühren', 'Ebay Gebühren', 'eBay Gebühren'])) || appSettings.fees,
    targetProfit: sheetNumber(sheetRecordField(record, ['Zielgewinn'])) || appSettings.profit,
    stock: sheetRecordField(record, ['Stock', 'Bestand']),
    supplierName: sheetRecordField(record, ['Lieferant', 'Supplier']),
    supplier: sheetRecordField(record, ['Lieferant', 'Supplier']),
    delivery: sheetRecordField(record, ['Versandzeit', 'Lieferzeit']),
    deliveryTime: sheetRecordField(record, ['Versandzeit', 'Lieferzeit']),
    shipFrom: sheetRecordField(record, ['Versand ab', 'Versandland', 'Lagerland']),
    shippingFrom: sheetRecordField(record, ['Versand ab', 'Versandland', 'Lagerland']),
    ebayLink: sheetRecordField(record, ['Ebay Link', 'eBay Link', 'Ebay URL']),
    ebayUrl: sheetRecordField(record, ['Ebay Link', 'eBay Link', 'Ebay URL']),
    notes: sheetRecordField(record, ['Hinweise', 'Notizen', 'Notiz']),
    productStatus: normalizeProductStatus(sheetRecordField(record, ['Status']) || 'Draft', 'Draft'),
    status: normalizeProductStatus(sheetRecordField(record, ['Status']) || 'Draft', 'Draft'),
    createdAt: createdAt,
    updatedAt: createdAt
  });
}
function isMeaningfulInventorySheetRecord(record){
  if(!record || typeof record !== 'object') return false;
  return [
    sheetRecordField(record, ['Artikel-ID', 'ArtikelId', 'SKU', 'sku']),
    sheetRecordField(record, ['Bezeichnung', 'Produktname', 'Name', 'Titel', 'Artikelname']),
    sheetRecordField(record, ['Ebay Link', 'eBay Link', 'Ebay URL']),
    sheetRecordField(record, ['Lieferant', 'Supplier']),
    sheetRecordField(record, ['Typ', 'Kategorie', 'Category']),
    sheetRecordField(record, ['Preis EK', 'EK', 'Einkaufspreis']),
    sheetRecordField(record, ['Preis VK (ebay)', 'Preis VK', 'VK', 'Verkaufspreis']),
    sheetRecordField(record, ['Stock', 'Bestand']),
    sheetRecordField(record, ['Hinweise', 'Notizen', 'Notiz'])
  ].some(function(value){
    return String(value === undefined || value === null ? '' : value).trim() !== '';
  });
}
function isMeaningfulInventoryProductRecord(product){
  if(!product || typeof product !== 'object') return false;
  const rawName = String(product.name || product.title || '').trim();
  const hasIdentity = !!String(product.sku || product.articleId || product.ebayLink || product.ebayUrl || '').trim();
  const hasContent = [
    product.type,
    product.category,
    product.buy,
    product.ship,
    product.sell,
    product.stock,
    product.supplierName,
    product.supplier,
    product.delivery,
    product.deliveryTime,
    product.shipFrom,
    product.shippingFrom,
    product.notes
  ].some(function(value){
    return String(value === undefined || value === null ? '' : value).trim() !== '';
  });
  if(rawName && rawName !== 'Importiertes Produkt') return true;
  return hasIdentity || hasContent;
}
function mapGoogleSheetSupplierRecord(record, index){
  const supplierId = sheetRecordField(record, ['Supplier-ID', 'SupplierId', 'ID']);
  const name = sheetRecordField(record, ['Supplier', 'Name', 'Suppliername']) || ('Supplier ' + (index + 1));
  return {
    id: supplierId || ('supplier-' + index + '-' + Date.now()),
    supplierId: supplierId || '',
    name: name,
    supplierName: name,
    status: sheetRecordField(record, ['Status']) || 'Aktiv',
    categories: sheetRecordField(record, ['Kategorie', 'Kategorien', 'Category']),
    type: sheetRecordField(record, ['Kategorie', 'Kategorien', 'Category']),
    website: sheetRecordField(record, ['Website', 'URL']),
    region: sheetRecordField(record, ['Standort', 'Land', 'Region']),
    notes: sheetRecordField(record, ['Notiz', 'Notizen', 'Hinweise'])
  };
}
function mapGoogleSheetCostRecord(record, index){
  const name = sheetRecordField(record, ['Name', 'Kostenname']) || ('Kosten ' + (index + 1));
  const amount = sheetNumber(sheetRecordField(record, ['Betrag', 'Kostenbetrag', 'Amount']));
  return {
    id: 'cost-' + index + '-' + Date.now(),
    name: name,
    category: name,
    interval: sheetRecordField(record, ['Intervall', 'Interval']),
    amount: amount,
    value: amount,
    note: sheetRecordField(record, ['Notiz', 'Notizen', 'Hinweise']),
    notes: sheetRecordField(record, ['Notiz', 'Notizen', 'Hinweise']),
    status: sheetRecordField(record, ['Status']) || 'aktiv',
    created: todayInputDate()
  };
}
function isMeaningfulGoogleSheetSaleRecord(record){
  if(!record || typeof record !== 'object') return false;
  const dateValue = sheetRecordField(record, ['Datum', 'Date', 'createdAt', 'created']);
  const product = sheetRecordField(record, ['Produkt', 'Bezeichnung', 'Product', 'name', 'title']);
  const saleValue = sheetNumber(sheetRecordField(record, ['Verkauf (€)', 'Verkaufspreis', 'Preis VK (ebay)', 'Preis VK', 'VK', 'Preis', 'Umsatz']));
  const costValue = sheetNumber(sheetRecordField(record, ['Einkauf (€)', 'Preis EK', 'EK', 'Cost', 'Einkaufspreis']));
  const profitValue = sheetNumber(sheetRecordField(record, ['Gewinn (€)', 'Gewinn', 'Profit']));
  const hasValidDate = !!sheetRecordDate(dateValue);
  const hasProduct = !!String(product || '').trim();
  const hasNumbers = [saleValue, costValue, profitValue].some(function(value){
    return Number.isFinite(Number(value)) && Number(value) !== 0;
  });
  return hasValidDate || hasProduct || hasNumbers;
}
function replaceInventoryFromSheetRecords(records){
  const next = Array.isArray(records) ? records
    .filter(isMeaningfulInventorySheetRecord)
    .map(mapGoogleSheetInventoryRecord)
    .filter(isMeaningfulInventoryProductRecord) : [];
  products = normalizeProductsCollection(next);
  save();
  return products;
}
function replaceSuppliersFromSheetRecords(records){
  const next = Array.isArray(records) ? records.map(mapGoogleSheetSupplierRecord).filter(function(item){
    return !!String(item.name || item.supplierId || '').trim();
  }) : [];
  suppliers = next;
  localStorage.setItem('elyonSuppliers', JSON.stringify(suppliers));
  renderSupplierCards();
  refreshSourceProviderOptions();
  return suppliers;
}
function replaceCostsFromSheetRecords(records){
  const next = Array.isArray(records) ? records.map(mapGoogleSheetCostRecord).filter(function(item){
    return !!String(item.name || item.category || '').trim();
  }) : [];
  runningCosts = next;
  localStorage.setItem('elyonCosts', JSON.stringify(runningCosts));
  return runningCosts;
}
async function loadFromGoogleSheet(type){
  const config = getGoogleSheetsSyncConfig();
  if(!config.url) throw new Error('Google Apps Script Web-App URL fehlt.');
  if(!config.token) throw new Error('Sync Token fehlt.');
  try{
    const data = await postJsonWithTimeout('/api/google-sheets-sync', {
      method: 'GET',
      url: config.url,
      action: 'getRecords',
      type: type,
      token: config.token
    }, 30000);
    if(!data || data.ok === false){
      throw new Error((data && (data.error || data.message)) ? (data.error || data.message) : 'Google Sheets Laden fehlgeschlagen.');
    }
    clearGoogleSheetsSyncError(type);
    return data;
  }catch(error){
    setGoogleSheetsSyncError(type, error && error.message ? error.message : 'Unbekannter Ladefehler');
    renderGoogleSheetsSyncStatus();
    throw error;
  }
}
function replaceSalesFromSheetRecords(records){
  const next = Array.isArray(records) ? records.filter(isMeaningfulGoogleSheetSaleRecord).map(mapGoogleSheetSaleRecord).filter(function(item){
    return !!String(item.productId || item.articleId || item.id || '').trim() || !!String(item.product || '').trim();
  }) : [];
  sales = next;
  saveSales();
  localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.salesLoadAt, new Date().toISOString());
  renderGoogleSheetsSyncStatus();
  return next;
}
async function loadSalesFromGoogleSheet(){
  setHTML('googleSheetsSyncResult', '<p>Daten aus Google Sheets werden geladen...</p>');
  try{
    const data = await loadFromGoogleSheet('sales');
    const records = Array.isArray(data.records) ? data.records : [];
    const next = replaceSalesFromSheetRecords(records);
    clearGoogleSheetsSyncLoadError();
    queueGoogleSheetsSyncSettingsCloudSave();
    setHTML('googleSheetsSyncResult', '<p>✅ <strong>Verkäufe</strong>: ' + next.length + ' Datensätze aus Google Sheets geladen.</p>');
    return next;
  }catch(error){
    const message = error && error.message ? error.message : 'Unbekannter Ladefehler';
    setGoogleSheetsSyncLoadError(message);
    setHTML('googleSheetsSyncResult', '<p>⚠️ <strong>Verkäufe</strong>: ' + escapeHtml(message) + '</p>');
    throw error;
  }
}
async function loadInventoryFromGoogleSheet(){
  setHTML('googleSheetsSyncResult', '<p>Inventar wird aus Google Sheets geladen...</p>');
  const data = await loadFromGoogleSheet('inventory');
  const next = replaceInventoryFromSheetRecords(Array.isArray(data.records) ? data.records : []);
  setGoogleSheetsSyncTimestamp('inventory', data.syncedAt || new Date().toISOString());
  renderGoogleSheetsSyncStatus();
  setHTML('googleSheetsSyncResult', '<p>✅ <strong>Inventar</strong>: ' + next.length + ' Datensätze aus Google Sheets geladen.</p>');
  return next;
}
async function loadSuppliersFromGoogleSheet(){
  setHTML('googleSheetsSyncResult', '<p>Supplier werden aus Google Sheets geladen...</p>');
  const data = await loadFromGoogleSheet('suppliers');
  const next = replaceSuppliersFromSheetRecords(Array.isArray(data.records) ? data.records : []);
  setGoogleSheetsSyncTimestamp('suppliers', data.syncedAt || new Date().toISOString());
  renderGoogleSheetsSyncStatus();
  setHTML('googleSheetsSyncResult', '<p>✅ <strong>Supplier</strong>: ' + next.length + ' Datensätze aus Google Sheets geladen.</p>');
  return next;
}
async function loadCostsFromGoogleSheet(){
  setHTML('googleSheetsSyncResult', '<p>Laufende Kosten werden aus Google Sheets geladen...</p>');
  const data = await loadFromGoogleSheet('costs');
  const next = replaceCostsFromSheetRecords(Array.isArray(data.records) ? data.records : []);
  setGoogleSheetsSyncTimestamp('costs', data.syncedAt || new Date().toISOString());
  renderGoogleSheetsSyncStatus();
  setHTML('googleSheetsSyncResult', '<p>✅ <strong>Laufende Kosten</strong>: ' + next.length + ' Datensätze aus Google Sheets geladen.</p>');
  return next;
}
async function loadAllFromGoogleSheet(){
  const tasks = [
    { type:'inventory', run: loadInventoryFromGoogleSheet },
    { type:'suppliers', run: loadSuppliersFromGoogleSheet },
    { type:'sales', run: loadSalesFromGoogleSheet },
    { type:'costs', run: loadCostsFromGoogleSheet }
  ];
  const summary = [];
  setGoogleSheetsSyncButtonsLoading(true, 'loadAllGoogleSheetsBtn');
  for(const task of tasks){
    try{
      const result = await task.run();
      summary.push('<li><strong>' + getSyncTypeLabel(task.type) + ':</strong> ' + (Array.isArray(result) ? result.length : 0) + ' geladen</li>');
    }catch(error){
      summary.push('<li><strong>' + getSyncTypeLabel(task.type) + ':</strong> ⚠️ ' + escapeHtml(error && error.message ? error.message : 'Fehler') + '</li>');
    }
  }
  setGoogleSheetsSyncButtonsLoading(false, '');
  setHTML('googleSheetsSyncResult', '<h3>Laden abgeschlossen</h3><ul>' + summary.join('') + '</ul>');
}
function buildSyncRows(type, records){
  const list = Array.isArray(records) ? records : [];
  if(type === 'inventory') return list.map(mapProductToSheetRow);
  if(type === 'suppliers') return list.map(mapSupplierToSheetRow);
  if(type === 'sales') return list.map(mapSaleToSheetRow);
  if(type === 'costs') return list.map(mapCostToSheetRow);
  return [];
}
function getSyncTypeLabel(type){
  if(type === 'inventory') return 'Inventar';
  if(type === 'suppliers') return 'Supplier Liste';
  if(type === 'sales') return 'Verkäufe';
  if(type === 'costs') return 'Laufende Kosten';
  return type;
}
async function syncToGoogleSheet(type, records){
  const config = getGoogleSheetsSyncConfig();
  if(!config.url) throw new Error('Google Apps Script Web-App URL fehlt.');
  if(!config.token) throw new Error('Sync Token fehlt.');
  const rows = buildSyncRows(type, records);
  const payload = {
    token: config.token,
    action: 'upsertRecords',
    type: type,
    records: rows,
  };
  const data = await postJsonWithTimeout('/api/google-sheets-sync', {
    method: 'POST',
    url: config.url,
    payload: payload
  }, 30000);
  if(!data || data.ok === false){
    throw new Error((data && (data.error || data.message)) ? (data.error || data.message) : 'Google Sheets Sync fehlgeschlagen.');
  }
  setGoogleSheetsSyncTimestamp(type, data.syncedAt || new Date().toISOString());
  renderGoogleSheetsSyncStatus();
  return data;
}
const GOOGLE_SHEETS_SYNC_BUTTONS = [
  { id: 'syncInventoryGoogleSheetsBtn', label: 'Inventar synchronisieren' },
  { id: 'syncSuppliersGoogleSheetsBtn', label: 'Supplier Liste synchronisieren' },
  { id: 'syncSalesGoogleSheetsBtn', label: 'Verkäufe synchronisieren' },
  { id: 'syncSalesGoogleSheetsShortcutBtn', label: 'Verkäufe synchronisieren' },
  { id: 'syncCostsGoogleSheetsBtn', label: 'Laufende Kosten synchronisieren' },
  { id: 'syncAllGoogleSheetsBtn', label: 'Alles ins Sheet senden' },
  { id: 'loadAllGoogleSheetsBtn', label: 'Alles aus Google Sheets laden' },
  { id: 'reconcileAllGoogleSheetsBtn', label: 'Alles abgleichen' },
];
function formatGoogleSheetsSendSummary(label, result){
  const inserted = Number(result.inserted || result.added || result.created || 0);
  const updated = Number(result.updated || 0);
  const processed = Number(result.processed || result.received || result.records || 0);
  const zeroHint = processed === 0
    ? '<p class="hint" style="margin-top:8px">Keine lokalen Datensätze gefunden. Für Google Sheets → Tool bitte <strong>Alles aus Google Sheets laden</strong> oder <strong>Alles abgleichen</strong> nutzen.</p>'
    : '';
  return {
    inserted: inserted,
    updated: updated,
    processed: processed,
    html: '<p>✅ <strong>' + escapeHtml(label) + '</strong>: ' + processed + ' lokale Datensätze ins Sheet gesendet, ' + inserted + ' neu, ' + updated + ' aktualisiert.</p>' + zeroHint,
    listItem: '<li><strong>' + escapeHtml(label) + ':</strong> ' + processed + ' lokale Datensätze ins Sheet gesendet, ' + inserted + ' neu, ' + updated + ' aktualisiert' + (processed === 0 ? ' <span class="hint">(keine lokalen Daten; nutze Laden oder Abgleichen)</span>' : '') + '</li>'
  };
}
function setGoogleSheetsSyncButtonsLoading(isLoading, activeId){
  GOOGLE_SHEETS_SYNC_BUTTONS.forEach(function(button){
    const el = $(button.id);
    if(!el) return;
    if(!el.dataset.originalLabel) el.dataset.originalLabel = button.label;
    const isActive = isLoading && activeId === button.id;
    el.disabled = !!isLoading;
    el.textContent = isActive ? 'Synchronisiere...' : (el.dataset.originalLabel || button.label);
  });
}
async function runGoogleSheetsSyncTask(type, runner, buttonId){
  const label = getSyncTypeLabel(type);
  setGoogleSheetsSyncButtonsLoading(true, buttonId);
  setHTML('googleSheetsSyncResult', '<p>' + escapeHtml(label) + ' wird synchronisiert...</p>');
  try{
    const result = await runner();
    const summary = formatGoogleSheetsSendSummary(label, result);
    setHTML('googleSheetsSyncResult', summary.html);
    return result;
  }catch(error){
    const message = error && error.message ? error.message : 'Unbekannter Sync-Fehler';
    setHTML('googleSheetsSyncResult', '<p>⚠️ <strong>' + escapeHtml(label) + '</strong>: ' + escapeHtml(message) + '</p>');
    throw error;
  }finally{
    setGoogleSheetsSyncButtonsLoading(false, '');
  }
}
function syncInventoryToGoogleSheet(){
  return runGoogleSheetsSyncTask('inventory', function(){
    return syncToGoogleSheet('inventory', getInventorySyncRecords());
  }, 'syncInventoryGoogleSheetsBtn');
}
function syncSuppliersToGoogleSheet(){
  return runGoogleSheetsSyncTask('suppliers', function(){
    return syncToGoogleSheet('suppliers', getSupplierSyncRecords());
  }, 'syncSuppliersGoogleSheetsBtn');
}
function syncSalesToGoogleSheet(){
  return runGoogleSheetsSyncTask('sales', function(){
    return syncToGoogleSheet('sales', getSalesSyncRecords());
  }, 'syncSalesGoogleSheetsBtn');
}
function syncSalesToGoogleSheetShortcut(){
  return syncSalesToGoogleSheet();
}
function clearLocalSalesGoogleSheets(){
  if(!confirm('Lokale Verkäufe im Browser wirklich löschen? Google Sheets bleibt unverändert.')) return;
  sales = [];
  localStorage.removeItem('elyonSales');
  saveSales();
  renderGoogleSheetsSyncStatus();
  setHTML('googleSheetsSyncResult', '<p>✅ Lokale Verkäufe wurden gelöscht. Google Sheets wurde nicht verändert.</p>');
}
function syncCostsToGoogleSheet(){
  return runGoogleSheetsSyncTask('costs', function(){
    return syncToGoogleSheet('costs', getCostSyncRecords());
  }, 'syncCostsGoogleSheetsBtn');
}
async function syncAllToGoogleSheet(){
  const tasks = [
    { type: 'inventory', run: function(){ return syncToGoogleSheet('inventory', getInventorySyncRecords()); } },
    { type: 'suppliers', run: function(){ return syncToGoogleSheet('suppliers', getSupplierSyncRecords()); } },
    { type: 'sales', run: function(){ return syncToGoogleSheet('sales', getSalesSyncRecords()); } },
    { type: 'costs', run: function(){ return syncToGoogleSheet('costs', getCostSyncRecords()); } },
  ];
  const summary = [];
  setGoogleSheetsSyncButtonsLoading(true, 'syncAllGoogleSheetsBtn');
  setHTML('googleSheetsSyncResult', '<p>Alle lokalen Rubriken werden ins Google Sheet gesendet...</p>');
  for(const task of tasks){
    try{
      const result = await task.run();
      summary.push(formatGoogleSheetsSendSummary(getSyncTypeLabel(task.type), result).listItem);
    }catch(error){
      summary.push('<li><strong>' + getSyncTypeLabel(task.type) + ':</strong> ⚠️ ' + escapeHtml(error && error.message ? error.message : 'Fehler') + '</li>');
    }
  }
  setHTML('googleSheetsSyncResult', '<h3>Senden abgeschlossen</h3><ul>' + summary.join('') + '</ul><p class="hint" style="margin-top:10px">Wenn du Daten aus Google Sheets ins Tool holen willst, nutze <strong>Alles aus Google Sheets laden</strong> oder <strong>Alles abgleichen</strong>.</p>');
  setGoogleSheetsSyncButtonsLoading(false, '');
  return summary;
}
async function reconcileAllGoogleSheets(options){
  const silent = !!(options && options.silent);
  if(googleSheetsAutoSyncInFlight) return;
  googleSheetsAutoSyncInFlight = true;
  const summary = [];
  if(!silent){
    setGoogleSheetsSyncButtonsLoading(true, 'reconcileAllGoogleSheetsBtn');
    setHTML('googleSheetsSyncResult', '<p>Bidirektionaler Abgleich läuft...</p>');
  }
  try{
    await loadInventoryFromGoogleSheet(); summary.push('<li><strong>Inventar:</strong> geladen</li>');
    await loadSuppliersFromGoogleSheet(); summary.push('<li><strong>Supplier:</strong> geladen</li>');
    await loadSalesFromGoogleSheet(); summary.push('<li><strong>Verkäufe:</strong> geladen</li>');
    await loadCostsFromGoogleSheet(); summary.push('<li><strong>Laufende Kosten:</strong> geladen</li>');
    const syncSummary = await syncAllToGoogleSheet();
    localStorage.setItem(GOOGLE_SHEETS_AUTO_SYNC_KEYS.lastRunAt, new Date().toISOString());
    renderGoogleSheetsSyncStatus();
    if(!silent){
      setHTML('googleSheetsSyncResult', '<h3>Abgleich abgeschlossen</h3><ul>' + summary.join('') + syncSummary.join('') + '</ul>');
    }
  }finally{
    googleSheetsAutoSyncInFlight = false;
    if(!silent) setGoogleSheetsSyncButtonsLoading(false, '');
  }
}
function scheduleGoogleSheetsAutoSync(){
  if(googleSheetsAutoSyncTimer){
    clearInterval(googleSheetsAutoSyncTimer);
    googleSheetsAutoSyncTimer = null;
  }
  const settings = getGoogleSheetsAutoSyncSettings();
  const config = getGoogleSheetsSyncConfig();
  if(!settings.enabled || !config.url || !config.token) return;
  googleSheetsAutoSyncTimer = setInterval(function(){
    reconcileAllGoogleSheets({ silent:true }).catch(function(){});
  }, settings.intervalMinutes * 60 * 1000);
}
function backendProductItems(data){
  if(Array.isArray(data)) return data;
  if(Array.isArray(data.products)) return data.products;
  if(Array.isArray(data.items)) return data.items;
  if(data.data && Array.isArray(data.data.list)) return data.data.list;
  if(data.data && Array.isArray(data.data.content)) return data.data.content;
  if(data.result && Array.isArray(data.result)) return data.result;
  return [];
}
function backendOrderItems(data){
  if(Array.isArray(data)) return data;
  if(Array.isArray(data.orders)) return data.orders;
  if(data.data && Array.isArray(data.data.orders)) return data.data.orders;
  if(data.data && Array.isArray(data.data.list)) return data.data.list;
  return [];
}
function cjProductCardHTML(item,index){
  const name = item.name || item.productName || item.productNameEn || item.title || 'CJ Produkt';
  const pid = item.pid || item.productId || item.id || '';
  const price = item.sellPrice || item.price || item.nowPrice || item.productPrice || '';
  const delivery = item.deliveryTime || item.shippingTime || '';
  let html='';
  html += '<article class="product-card small-card">';
  html += '<div><div class="product-title">'+name+'</div>';
  html += '<div class="muted">CJ-ID: '+(pid||'unbekannt')+'</div>';
  html += '<div class="pill-row"><span class="pill">Preis: '+(price||'n/a')+'</span><span class="pill">Lieferzeit: '+(delivery||'n/a')+'</span></div>';
  html += '</div><div class="score-wrap"><span class="status good">CJ Daten</span></div>';
  html += '<div class="actions"><button class="secondary" data-cj-copy="'+index+'">In Produktformular übernehmen</button><button class="draft-primary" data-cj-draft="'+index+'">In Listing-Draft übernehmen</button></div>';
  html += '</article>';
  return html;
}
async function searchCjProducts(){
  const keyword = $('cjSearchKeyword') ? $('cjSearchKeyword').value.trim() : '';
  if(!keyword){ alert('Bitte CJ Suchbegriff eingeben.'); return; }
  setHTML('cjSearchResult','<p>CJ Produktdaten werden geladen...</p>');
  try{
    const params = new URLSearchParams({ keyword: keyword });
    const url = '/api/cj/search?' + params.toString();
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json, text/plain, */*' }
    });
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    const rawText = await res.text();
    let data = null;
    if(rawText && contentType.includes('application/json')){
      try{ data = JSON.parse(rawText); }catch(parseErr){ data = null; }
    }
    if(!res.ok){
      const detailsText = data && data.details ? (typeof data.details === 'string' ? data.details : JSON.stringify(data.details)) : rawText;
      throw new Error('HTTP ' + res.status + (res.statusText ? ' ' + res.statusText : '') + ' · URL: ' + url + ' · ' + (data && (data.error || data.message) ? (data.error || data.message) : (rawText || 'Backend-Fehler')) + (detailsText ? ' · Details: ' + detailsText : ''));
    }
    if(!data){
      throw new Error('Unerwartete Antwort · URL: ' + url + (rawText ? ' · ' + rawText : ''));
    }
    if(data.ok === false){
      const detailsText = data.details ? (typeof data.details === 'string' ? data.details : JSON.stringify(data.details)) : '';
      throw new Error('HTTP ' + (data.status || res.status) + ' · URL: ' + url + ' · ' + (data.error || data.message || 'CJ Fehler') + (detailsText ? ' · Details: ' + detailsText : ''));
    }
    const items = backendProductItems(data);
    lastCjSearchItems = items;
    if(!items.length){ setHTML('cjSearchResult','<p>Keine CJ Produkte gefunden oder Backend liefert keine Produktliste.</p>'); return; }
    setHTML('cjSearchResult','<h3>CJ Treffer</h3><div class="products">'+items.slice(0,10).map(cjProductCardHTML).join('')+'</div>');
  }catch(err){
    setHTML('cjSearchResult','<p>⚠️ '+(err && err.message ? err.message : 'Backend nicht erreichbar')+'</p><p class="hint">Erwartete Backend-Route: /api/cj/search?keyword=...</p>');
  }
}
function copyCjProductToForm(index){
  const item = lastCjSearchItems[Number(index)];
  if(!item){ alert('CJ Produkt nicht gefunden.'); return; }
  const name = item.name || item.productName || item.productNameEn || item.title || '';
  const pid = item.pid || item.productId || item.id || '';
  const price = item.sellPrice || item.price || item.nowPrice || item.productPrice || '';
  const link = item.productLink || item.url || item.productUrl || '';
  safe('name',el=>el.value=name || el.value);
  safe('supplierId',el=>el.value=pid || el.value);
  safe('supplierLink',el=>el.value=link || el.value);
  if(price) safe('buy',el=>el.value=parseFloat(String(price).replace(',','.')) || el.value);
  safe('productStatus',el=>el.value='SEO prüfen');
  openProductBoard();
  scrollToProductForm();
}
function cjListingDraftText(item){
  const name = item.name || item.productName || item.productNameEn || item.title || 'CJ Produkt';
  const pid = item.pid || item.productId || item.id || '';
  const price = item.sellPrice || item.price || item.nowPrice || item.productPrice || '';
  const link = item.productLink || item.url || item.productUrl || '';
  const delivery = item.deliveryTime || item.shippingTime || '';
  const sku = item.productSku || item.sku || '';
  const keywords = [name, sku, pid].filter(Boolean).join(', ');

  return {
    title: name,
    description: [
      name,
      '',
      'CJ-Produkt intern übernommen.',
      pid ? 'CJ-ID: ' + pid : '',
      sku ? 'SKU: ' + sku : '',
      price ? 'CJ-Preis: ' + price : '',
      delivery ? 'Lieferzeit: ' + delivery : '',
      link ? 'CJ-Link: ' + link : '',
    ].filter(Boolean).join('\n'),
    notes: [
      'Quelle: CJ Suche',
      pid ? 'CJ-ID: ' + pid : null,
      sku ? 'SKU: ' + sku : null,
      price ? 'Preis: ' + price : null,
      delivery ? 'Lieferzeit: ' + delivery : null,
      link ? 'Link: ' + link : null,
    ].filter(Boolean).join('\n'),
    mainKeyword: name,
    features: [sku ? 'SKU ' + sku : '', pid ? 'CJ-ID ' + pid : '', price ? 'Preis ' + price : ''].filter(Boolean).join(', '),
    keywords: keywords,
  };
}
function copyCjProductToDraft(index){
  const item = lastCjSearchItems[Number(index)];
  if(!item){ alert('CJ Produkt nicht gefunden.'); return; }
  const draft = cjListingDraftText(item);
  setInputValue('gMainKeyword', draft.mainKeyword);
  setInputValue('gName', draft.title);
  setInputValue('gFeature', draft.features);
  setInputValue('gUse', 'eBay Listing');
  setInputValue('gPain', 'Intern aus CJ übernommen');
  setInputValue('gKeywords', draft.keywords);
  setInputValue('gMode', 'hybrid');
  setInputValue('listingTitle', draft.title);
  setInputValue('listingBody', draft.description);
  setInputValue('listingNotes', draft.notes);
  showTab('ebayListingTab');
  genCalc();
  refreshEbayListingDraftPreview();
  toast('CJ Produkt in den Listing-Draft übernommen.');
}
async function searchEbayCompetition(){
  const keyword = $('ebayCompetitionKeyword') ? $('ebayCompetitionKeyword').value.trim() : '';
  if(!keyword){ alert('Bitte eBay Suchbegriff eingeben.'); return; }
  setHTML('ebayCompetitionResult','<p>eBay Konkurrenzdaten werden geladen...</p>');
  try{
    const data = await fetchBackendJSON('/api/ebay/competition?keyword=' + encodeURIComponent(keyword));
    const items = data.items || data.itemSummaries || data.results || [];
    if(!items.length){ setHTML('ebayCompetitionResult','<p>Keine eBay Daten gefunden oder Backend liefert keine Trefferliste.</p>'); return; }
    const prices = items.map(function(x){ return parseFloat((x.price && x.price.value) || x.price || x.currentPrice || 0); }).filter(function(v){ return v>0; });
    const avg = prices.length ? prices.reduce(function(a,b){ return a+b; },0)/prices.length : 0;
    const low = prices.length ? Math.min.apply(null,prices) : 0;
    const high = prices.length ? Math.max.apply(null,prices) : 0;
    let html='<h3>eBay Konkurrenz</h3><div class="dashboard"><div class="metric"><small>Treffer</small><strong>'+items.length+'</strong></div><div class="metric"><small>Niedrig</small><strong>'+euro(low)+'</strong></div><div class="metric"><small>Ø Preis</small><strong>'+euro(avg)+'</strong></div><div class="metric"><small>Hoch</small><strong>'+euro(high)+'</strong></div></div>';
    html+='<div class="products">'+items.slice(0,8).map(function(item){
      const title=item.title||item.name||'eBay Treffer';
      const price=(item.price && item.price.value)||item.price||item.currentPrice||'';
      return '<article class="product-card small-card"><div><div class="product-title">'+title+'</div><div class="muted">Preis: '+(price||'n/a')+'</div></div><div class="score-wrap"><span class="status warn">Konkurrenz</span></div></article>';
    }).join('')+'</div>';
    setHTML('ebayCompetitionResult',html);
  }catch(err){
    setHTML('ebayCompetitionResult','<p>⚠️ '+err.message+'</p><p class="hint">Erwartete Backend-Route: /api/ebay/competition?keyword=...</p>');
  }
}
async function ebaySuche(){
  const storedBackend = localStorage.getItem('backendUrl') || '';
  const backendUrl = getBackendUrl() || normalizeBackendUrl(storedBackend) || 'https://elyonsellertool.vercel.app';
  const input = $('ebaySearchInput');
  const suchwort = input && input.value.trim() ? input.value.trim() : 'iphone';
  const box = $('ebaySearchResults');

  if(!box){ alert('eBay Search Ergebnisbox nicht gefunden.'); return; }
  if(!backendUrl){
    setHTML('ebaySearchResults','<p>⚠️ Bitte zuerst Backend URL speichern.</p>');
    return;
  }

  setHTML('ebaySearchResults','<p>eBay Search läuft...</p>');

  try{
    const res = await fetch(backendUrl + '/api/ebay/search?q=' + encodeURIComponent(suchwort) + '&limit=5');
    let data = null;
    try{ data = await res.json(); }catch(parseErr){ data = {}; }
    console.log(data);

    if(!res.ok){
      const msg = data && (data.error || data.message) ? (data.error || data.message) : ('HTTP ' + res.status);
      throw new Error(msg);
    }

    const items = data.items || data.itemSummaries || data.results || [];
    if(!items.length){
      setHTML('ebaySearchResults','<p>Keine eBay Treffer gefunden oder Backend liefert keine items-Liste.</p>');
      return;
    }

    const html = items.map(function(item){
      const title = item.title || item.name || 'eBay Artikel';
      const priceValue = item.price && item.price.value ? item.price.value : (item.price || '-');
      const currency = item.price && item.price.currency ? item.price.currency : '';
      const condition = item.condition || '-';
      const itemId = item.itemId || item.legacyItemId || item.id || '';
      const rawUrl = item.itemWebUrl || item.itemAffiliateWebUrl || item.url || (itemId ? ('https://www.ebay.de/itm/' + encodeURIComponent(String(itemId).replace(/^v1\|/, '').split('|')[0])) : '');
      const safeUrl = rawUrl ? escapeHtml(rawUrl) : '';
      let card = '';
      if(safeUrl) card += '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer" style="display:block;color:inherit;text-decoration:none">';
      card += '<article class="product-card small-card"' + (safeUrl ? ' style="cursor:pointer"' : '') + '>';
      card += '<div>';
      card += '<div class="product-title">' + escapeHtml(title) + '</div>';
      card += '<div class="muted">Preis: ' + escapeHtml(String(priceValue)) + ' ' + escapeHtml(currency) + '<br>Zustand: ' + escapeHtml(condition) + '</div>';
      if(safeUrl) card += '<div class="output-box"><p>eBay-Seite öffnen</p></div>';
      card += '</div>';
      card += '<div class="score-wrap"><span class="status good">eBay Search</span></div>';
      card += '</article>';
      if(safeUrl) card += '</a>';
      return card;
    }).join('');

    setHTML('ebaySearchResults','<h3>eBay Search Ergebnisse für: ' + suchwort + '</h3><div class="products">' + html + '</div>');
  }catch(err){
    setHTML('ebaySearchResults','<p>⚠️ eBay Search Fehler: ' + (err.message || 'Unbekannter Fehler') + '</p><p class="hint">Prüfe Backend URL und Route: /api/ebay/search?q=...&limit=5</p>');
  }
}
function mapEbayOrderToSale(order){
  const lineItem = order.lineItems && order.lineItems[0] ? order.lineItems[0] : {};
  const shipping = extractShippingAddress(order);
  const buyer = order.buyer || {};
  const totalValue = parseFloat((order.pricingSummary && order.pricingSummary.total && order.pricingSummary.total.value) || (lineItem.lineItemCost && lineItem.lineItemCost.value) || order.total || 0) || 0;
  const qty = parseFloat(lineItem.quantity || order.quantity || 1) || 1;
  const product = lineItem.title || order.title || order.product || 'eBay Bestellung';
  const customerEmail = firstDeepText(order, ['buyer.email','buyer.emailAddress','buyer.emailInfo.email','shippingAddress.email','shipTo.email']);
  const customerPhone = firstDeepText(order, ['buyer.phoneNumber','buyer.phone','shippingAddress.phone','shipTo.phoneNumber','shipTo.phone']);
  return {
    id: Date.now() + Math.floor(Math.random()*100000),
    productId:'',
    product:product,
    price: qty ? totalValue / qty : totalValue,
    cost:0,
    fees:0,
    qty:qty,
    profit:totalValue,
    platform:'eBay',
    status: order.orderFulfillmentStatus === 'FULFILLED' ? 'Versendet' : 'Bezahlt',
    orderNo: order.orderId || order.legacyOrderId || order.id || '',
    buyerRef: buyer && buyer.username ? buyer.username : (order.buyerUsername || ''),
    customerName: shipping.recipientName || buyer.fullName || buyer.name || buyer.username || '',
    customerEmail: customerEmail || '',
    customerPhone: customerPhone || '',
    customerAddressHint: '',
    shipToRecipientName: shipping.recipientName || '',
    shipToAddressHint: '',
    shipToStreet: shipping.address1 || '',
    shipToPostalCode: shipping.postalCode || '',
    shipToCity: shipping.city || '',
    shipToCountry: shipping.country || '',
    shipToAddress: shipping.addressText || '',
    returnFlag:'no',
    carrier:'DHL',
    shippingStatus: order.orderFulfillmentStatus === 'FULFILLED' ? 'Versendet' : 'Noch nicht versendet',
    trackingNo:'',
    shipDate:'',
    note:'Importiert aus eBay Backend-Vorschau. Kosten/Gebühren bitte prüfen.',
    created:new Date().toLocaleDateString('de-DE'),
    createdAt:new Date().toISOString()
  };
}
function syncEbayOrdersImportPanels(){
  const main = $('ebayOrdersImportResult');
  const quick = $('ebayOrdersImportResultOrders');
  if(main && quick) quick.innerHTML = main.innerHTML;
}
function showEbayOrdersPreview(orders){
  pendingEbayOrdersImport = orders.map(mapEbayOrderToSale).filter(function(s){ return s.orderNo && !sales.some(function(existing){ return String(existing.orderNo||'') === String(s.orderNo); }); });
  const skipped = orders.length - pendingEbayOrdersImport.length;
  let html='<h3>eBay Bestellvorschau</h3><div class="dashboard"><div class="metric"><small>Gefunden</small><strong>'+orders.length+'</strong></div><div class="metric"><small>Import bereit</small><strong>'+pendingEbayOrdersImport.length+'</strong></div><div class="metric"><small>Übersprungen</small><strong>'+skipped+'</strong></div><div class="metric"><small>Modus</small><strong>Vorschau</strong></div></div>';
  if(!pendingEbayOrdersImport.length){ html+='<p>Keine neuen importierbaren Bestellungen. Möglicherweise sind alle Order-IDs schon vorhanden.</p>'; setHTML('ebayOrdersImportResult',html); syncEbayOrdersImportPanels(); return; }
  html+='<div class="products">'+pendingEbayOrdersImport.slice(0,20).map(function(s){
    return '<article class="product-card small-card"><div><div class="product-title">'+s.product+'</div><div class="muted">Order: '+s.orderNo+' · '+s.status+'</div><div class="pill-row"><span class="pill">Umsatz: '+euro(s.price*s.qty)+'</span><span class="pill">Stück: '+s.qty+'</span></div></div><div class="score-wrap"><span class="status good">bereit</span></div></article>';
  }).join('')+'</div>';
  setHTML('ebayOrdersImportResult',html);
  syncEbayOrdersImportPanels();
}
async function previewEbayOrders(){
  const days = $('ebayOrdersRange') ? $('ebayOrdersRange').value : ($('ebayOrdersRangeOrders') ? $('ebayOrdersRangeOrders').value : '7');
  const status = $('ebayOrdersStatus') ? $('ebayOrdersStatus').value : ($('ebayOrdersStatusOrders') ? $('ebayOrdersStatusOrders').value : 'all');
  setHTML('ebayOrdersImportResult','<p>eBay Bestellungen werden geladen...</p>');
  syncEbayOrdersImportPanels();
  try{
    const data = await fetchBackendJSON('/api/ebay/orders?days=' + encodeURIComponent(days) + '&status=' + encodeURIComponent(status));
    const orders = backendOrderItems(data);
    if(!orders.length){ setHTML('ebayOrdersImportResult','<p>Keine Bestellungen gefunden oder Backend liefert keine Order-Liste.</p>'); return; }
    showEbayOrdersPreview(orders);
  }catch(err){
    setHTML('ebayOrdersImportResult','<p>⚠️ '+err.message+'</p><p class="hint">Erwartete Backend-Route: /api/ebay/orders?days=7&status=all</p>');
    syncEbayOrdersImportPanels();
  }
}
function importPreviewedEbayOrders(){
  if(!pendingEbayOrdersImport.length){ alert('Keine Bestellvorschau zum Importieren vorhanden.'); return; }
  sales = sales.concat(pendingEbayOrdersImport);
  const count = pendingEbayOrdersImport.length;
  runOrderWorkflowForSales(pendingEbayOrdersImport, 'eBay import');
  pendingEbayOrdersImport = [];
  saveSales();
  render();
  setHTML('ebayOrdersImportResult','<p>✅ '+count+' eBay Bestellung(en) in den Verkaufsassistenten importiert. Bitte Kosten, Gebühren, Rechnung und Versand prüfen.</p>');
  syncEbayOrdersImportPanels();
}
function calcProduct(p){
  const buy=+p.buy||0, ship=+p.ship||0, sell=+p.sell||0;
  const feePercent = +p.fee || appSettings.fees || 0;
  const bufferPercent = +p.riskBuffer || appSettings.buffer || 0;
  const fee=sell*(feePercent/100), buffer=sell*(bufferPercent/100), totalCost=buy+ship;
  const profit=sell-totalCost-fee-buffer, targetProfit=+p.targetProfit||appSettings.profit||0;
  const denominator = 1-((feePercent+bufferPercent)/100);
  const recommendedPrice = denominator > 0 ? (totalCost+targetProfit)/denominator : 0;
  let score=0;
  const goProfit = +appSettings.goProfit || 10;
  const maxDelivery = +appSettings.maxDelivery || 14;
  const maxSellers = +appSettings.maxSellers || 40;

  if(profit>=goProfit) score+=30; else if(profit>=5) score+=18; else if(profit>=2) score+=8;
  if(+p.sales>=50) score+=25; else if(+p.sales>=15) score+=16; else if(+p.sales>=5) score+=8;
  if(+p.competition<=15 && +p.competition>0) score+=18; else if(+p.competition<=maxSellers) score+=10; else if(+p.competition<=80) score+=4;
  if(+p.delivery<=7 && +p.delivery>0) score+=15; else if(+p.delivery<=maxDelivery) score+=8; else if(+p.delivery<=21) score+=3;
  if(p.risk==='low') score+=12;
  if(p.risk==='medium') score+=5;
  if(p.risk==='high') score-=appSettings.avoidElectronics ? 18 : 10;

  if(appSettings.mode==='safe'){
    if(+p.delivery>maxDelivery) score-=8;
    if(+p.competition>maxSellers) score-=8;
    if(profit<goProfit) score-=5;
  }
  if(appSettings.mode==='aggressive'){
    if(+p.sales>=15) score+=6;
    if(profit>0) score+=4;
  }
  if(appSettings.safeMode && p.risk==='high') score-=8;

  score=Math.max(0,Math.min(100,Math.round(score)));
  return {profit,totalCost,fee,buffer,recommendedPrice,score};
}
function statusFromScore(score){
  if(score>=65) return {label:'🟢 Listing-Kandidat',key:'go',cls:'good',text:'Guter Kandidat zum kontrollierten Prüfen.'};
  if(score>=40) return {label:'🟡 Beobachten',key:'test',cls:'warn',text:'Noch unsicher. Vorsichtig weiter prüfen.'};
  return {label:'🔴 Nicht geeignet',key:'no',cls:'bad',text:'Eher lassen oder neu kalkulieren.'};
}
function productStatusMeta(status){
  const value = normalizeProductStatus(status || 'Draft', 'Draft');
  const meta = {
    'Recherche': {label:'🔎 Recherche', cls:'info'},
    'Draft': {label:'📝 Draft', cls:'warn'},
    'SEO prüfen': {label:'🔍 SEO prüfen', cls:'warn'},
    'eBay Ready': {label:'✅ eBay Ready', cls:'good'},
    'Live': {label:'🟢 Live', cls:'good'},
    'Verkauft': {label:'📦 Verkauft', cls:'good'},
    'Versand offen': {label:'🚚 Versand offen', cls:'warn'},
    'Abgeschlossen': {label:'🏁 Abgeschlossen', cls:'good'},
    'Archiviert': {label:'🗂️ Archiviert', cls:'bad'},
  };
  return meta[value] || {label:value, cls:'info'};
}
function seoTitle(name){ return `${name} Neu | Praktisch & Modern | Top Preis-Leistung | eBay Angebot`; }
function description(name){ return `Produkt: ${name}\n\nVorteile:\n✓ Neuware\n✓ Praktisch im Alltag\n✓ Modernes Design\n✓ Gutes Preis-Leistungs-Verhältnis\n\nIdeal für Kunden, die eine einfache, zuverlässige und moderne Lösung suchen.\n\nJetzt bestellen und bequem nach Hause liefern lassen.`; }
function readProductForm(){
  const productStatus = normalizeProductStatus($('productStatus')?.value || 'Draft', 'Draft');
  return {name:$('name')?.value.trim()||'Unbenanntes Produkt',sku:$('sku')?.value.trim()||'',supplierId:$('supplierId')?.value.trim()||'',ebayItemId:$('ebayItemId')?.value.trim()||'',supplierLink:$('supplierLink')?.value.trim()||'',buy:n('buy'),ship:n('ship'),sell:n('sell'),targetProfit:n('targetProfit')||appSettings.profit,fee:n('fee')||appSettings.fees,riskBuffer:n('riskBuffer')||appSettings.buffer,sales:n('sales'),competition:n('competition'),delivery:n('delivery'),risk:$('risk')?.value||'low',status:productStatus,productStatus:productStatus,priority:$('priority')?.value||'Normal',notes:$('notes')?.value.trim()||'',sourceProvider:currentSourcingDraft.sourceProvider||'',sourceRisk:currentSourcingDraft.sourceRisk||'',sourceType:currentSourcingDraft.sourceType||'',sourceDomain:currentSourcingDraft.sourceDomain||'',sourceNote:currentSourcingDraft.sourceNote||'',sourceAnalysisStatus:currentSourcingDraft.sourceAnalysisStatus||'',sourceProductNote:currentSourcingDraft.sourceProductNote||'',sourceOnlineStatus:currentSourcingDraft.sourceOnlineStatus||'',sourceOnlineCheckedAt:currentSourcingDraft.sourceOnlineCheckedAt||'',sourceOnlineTitle:currentSourcingDraft.sourceOnlineTitle||'',sourceOnlinePrice:currentSourcingDraft.sourceOnlinePrice||'',sourceOnlineCurrency:currentSourcingDraft.sourceOnlineCurrency||'',sourceOnlineImage:currentSourcingDraft.sourceOnlineImage||'',sourceOnlineAvailability:currentSourcingDraft.sourceOnlineAvailability||'',sourceOnlineShipping:currentSourcingDraft.sourceOnlineShipping||'',sourceOnlineConfidence:currentSourcingDraft.sourceOnlineConfidence||''};
}
function clearProductForm(){
  ['name','sku','supplierId','ebayItemId','supplierLink','buy','ship','sell','sales','competition','delivery','notes'].forEach(id=>safe(id,el=>el.value=''));
  safe('productStatus',el=>el.value='Draft');
  safe('priority',el=>el.value='Normal');
  safe('risk',el=>el.value='low');
  currentSourcingDraft = {};
  editingProductId=null;
  safe('addProductBtn',el=>el.textContent='Produkt speichern & bewerten');
  safe('cancelEditProductBtn',el=>el.classList.add('hidden'));
}
function addProduct(){
  const formData=readProductForm();
  const sku=String(formData.sku||'').trim().toUpperCase();
  if(sku && products.some(p=>String(p.sku||'').trim().toUpperCase()===sku && p.id!==editingProductId)){
    if(!confirm('Diese SKU existiert bereits. Trotzdem speichern?')) return;
  }
  if(editingProductId){
    products=products.map(p=>p.id===editingProductId?normalizeProductRecord({...p,...formData,updated:new Date().toLocaleDateString('de-DE'),updatedAt:new Date().toISOString()}):p);
  }else{
    products.push(normalizeProductRecord({id:Date.now(),...formData,created:new Date().toLocaleDateString('de-DE'),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
  }
  save();
  clearProductForm();
}
const CUSTOM_SUPPLIERS_KEY = 'elyon_custom_suppliers';
let latestSourceAnalysis = null;
let editingCustomSupplierId = null;
let currentSourcingDraft = {};
const STANDARD_SOURCE_PROFILES = {
  cj: {name:'CJdropshipping', domains:['cjdropshipping.com'], type:'Dropshipping', risk:'Mittel', traffic:'Gelb', delivery:'Pruefen', note:'Lieferzeit, Produktqualitaet und Tracking pruefen.'},
  aliexpress: {name:'AliExpress', domains:['aliexpress.com'], type:'Marktplatz', risk:'Hoch', traffic:'Rot/Gelb', delivery:'Lang', note:'Lieferzeit, Qualitaet, Retouren und eBay-Eignung kritisch pruefen.'},
  bigbuy: {name:'BigBuy', domains:['bigbuy.eu','bigbuy.com'], type:'EU-B2B-Supplier', risk:'Niedrig bis Mittel', traffic:'Gelb', delivery:'EU', note:'Versandkosten, Marge und Retouren pruefen.'},
  dropxl: {name:'dropxl.com', domains:['dropxl.com'], type:'Supplier / Home & Garden', risk:'Mittel', traffic:'Gelb', delivery:'Pruefen', note:'Retouren, Sperrgut, Versandkosten und Lieferzeit pruefen.'},
  vidaxl: {name:'vidaXL', domains:['vidaxl.de','vidaxl.com'], type:'Supplier / Home & Garden', risk:'Mittel', traffic:'Gelb', delivery:'Pruefen', note:'Moebel und grosse Artikel koennen hohe Retouren- und Versandrisiken haben.'},
  amazon: {name:'Amazon.de', domains:['amazon.de'], type:'Retail', risk:'Hoch', traffic:'Rot', delivery:'Schnell', note:'Retail-Arbitrage, Rechnungen, Verfuegbarkeit und eBay-Risiko kritisch pruefen.'},
  temu: {name:'Temu', domains:['temu.com'], type:'Marktplatz', risk:'Hoch / kritisch', traffic:'Rot', delivery:'Pruefen', note:'Fuer eBay-Dropshipping sehr kritisch pruefen. Qualitaet, Lieferzeit und Account-Risiko beachten.'},
  alibaba: {name:'Alibaba', domains:['alibaba.com'], type:'Grosshandel', risk:'Mittel bis Hoch', traffic:'Gelb/Rot', delivery:'Lang', note:'Eher fuer groessere Mengen geeignet. Mindestmengen und Importthemen pruefen.'},
  other: {name:'Sonstige', domains:[], type:'Unbekannt', risk:'Unbekannt', traffic:'Gelb/Rot', delivery:'Unbekannt', note:'Supplier zuerst pruefen oder speichern.'}
};
function getCustomSuppliers(){
  try{
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_SUPPLIERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(function(s){
      return {
        id: String(s.id || Date.now()),
        name: String(s.name || '').trim(),
        website: String(s.website || '').trim(),
        type: String(s.type || 'Sonstige'),
        region: String(s.region || ''),
        categories: String(s.categories || ''),
        delivery: String(s.delivery || ''),
        shipping: String(s.shipping || ''),
        dropshipping: String(s.dropshipping || 'Unbekannt'),
        api: String(s.api || 'Unbekannt'),
        risk: String(s.risk || 'Unbekannt'),
        notes: String(s.notes || ''),
        status: String(s.status || 'Pruefen')
      };
    }).filter(function(s){ return s.name; }) : [];
  }catch(err){
    return [];
  }
}
function saveCustomSuppliers(list){
  const safeList = Array.isArray(list) ? list : [];
  localStorage.setItem(CUSTOM_SUPPLIERS_KEY, JSON.stringify(safeList));
  renderSupplierCards();
  refreshSourceProviderOptions();
}
function normalizeUrl(value){
  const raw = String(value || '').trim();
  if(!raw) return null;
  try{ return new URL(raw.match(/^https?:\/\//i) ? raw : 'https://' + raw); }catch(err){ return null; }
}
function sourceDomain(value){
  const url = normalizeUrl(value);
  return url ? url.hostname.replace(/^www\./i,'').toLowerCase() : '';
}
function findCustomSupplierByDomain(domain){
  if(!domain) return null;
  return getCustomSuppliers().find(function(s){
    const supplierDomain = sourceDomain(s.website);
    return supplierDomain && (domain === supplierDomain || domain.endsWith('.' + supplierDomain));
  }) || null;
}
function detectSupplierFromUrl(value){
  const url = normalizeUrl(value);
  if(!url) return {valid:false, supplier:STANDARD_SOURCE_PROFILES.other, domain:'', custom:null};
  const domain = url.hostname.replace(/^www\./i,'').toLowerCase();
  const custom = findCustomSupplierByDomain(domain);
  if(custom){
    return {valid:true, domain, custom, supplier:{name:custom.name,type:custom.type,risk:custom.risk,traffic:trafficFromRisk(custom.risk),delivery:custom.delivery || 'Pruefen',note:custom.notes || 'Eigener Supplier. Daten manuell pruefen.'}};
  }
  const key = Object.keys(STANDARD_SOURCE_PROFILES).find(function(k){
    return STANDARD_SOURCE_PROFILES[k].domains.some(function(d){ return domain === d || domain.endsWith('.' + d); });
  });
  return {valid:true, domain, custom:null, supplier:STANDARD_SOURCE_PROFILES[key || 'other']};
}
function trafficFromRisk(risk){
  const value = String(risk || '').toLowerCase();
  if(value.includes('niedrig')) return 'Gruen/Gelb';
  if(value.includes('hoch') || value.includes('kritisch')) return 'Rot';
  if(value.includes('mittel')) return 'Gelb';
  return 'Grau';
}
function riskClass(risk){
  const value = String(risk || '').toLowerCase();
  if(value.includes('hoch') || value.includes('rot') || value.includes('kritisch')) return 'bad';
  if(value.includes('mittel') || value.includes('gelb')) return 'warn';
  if(value.includes('niedrig') || value.includes('gruen')) return 'good';
  return 'info';
}
function selectedSourceLabel(){
  const select = $('sourceProvider');
  if(!select) return '';
  const selected = select.options[select.selectedIndex];
  return selected ? selected.textContent.trim() : select.value;
}
function refreshSourceProviderOptions(){
  safe('sourceProvider', function(select){
    const current = select.value;
    const standard = [
      ['cj','CJdropshipping'],['aliexpress','AliExpress'],['dropxl','dropxl.com'],['bigbuy','Bigbuy.com'],
      ['amazon','Amazon.de'],['temu','Temu'],['alibaba','Alibaba'],['other','Sonstige']
    ];
    let html = standard.map(function(item){ return '<option value="' + item[0] + '">' + item[1] + '</option>'; }).join('');
    getCustomSuppliers().filter(function(s){ return s.status !== 'Deaktiviert'; }).forEach(function(s){
      html += '<option value="custom:' + escapeHtml(s.id) + '">' + escapeHtml(s.name) + '</option>';
    });
    select.innerHTML = html;
    if([...select.options].some(function(o){ return o.value === current; })) select.value = current;
  });
}
function renderSupplierCards(){
  const list = getCustomSuppliers();
  if(!list.length){
    setHTML('mySuppliersList','<p>Noch keine eigenen Supplier gespeichert.</p><p class="muted">Nutze + Supplier hinzufuegen, um eigene Quellen dauerhaft zu speichern.</p>');
    return;
  }
  const html = list.map(function(s){
    const disabled = s.status === 'Deaktiviert' ? ' style="opacity:.55"' : '';
    return '<article class="ai-product-card supplier-card"' + disabled + ' data-supplier-id="' + escapeHtml(s.id) + '">' +
      '<div class="product-title">' + escapeHtml(s.name) + '</div>' +
      '<div class="pill-row"><span class="pill">' + escapeHtml(s.type || 'Sonstige') + '</span><span class="pill">' + escapeHtml(s.region || 'Region offen') + '</span><span class="status ' + riskClass(s.risk) + '">' + escapeHtml(s.risk || 'Unbekannt') + '</span></div>' +
      '<p class="muted">Lieferzeit: ' + escapeHtml(s.delivery || 'offen') + ' · Status: ' + escapeHtml(s.status || 'Pruefen') + '</p>' +
      '<div class="copy-row"><button class="secondary copy-btn" type="button" data-supplier-action="use">Als Quelle nutzen</button><button class="secondary copy-btn" type="button" data-supplier-action="edit">Bearbeiten</button><button class="danger copy-btn" type="button" data-supplier-action="disable">Deaktivieren</button></div>' +
    '</article>';
  }).join('');
  setHTML('mySuppliersList', html);
}
function useSupplierAsSource(id){
  const supplier = getCustomSuppliers().find(function(s){ return s.id === String(id); });
  if(!supplier) return;
  safe('sourceProvider', function(select){ select.value = 'custom:' + supplier.id; });
  safe('sourceLink', function(input){ if(!input.value && supplier.website) input.value = supplier.website; });
  setHTML('supplierUseNotice','<p>Supplier uebernommen: <strong>' + escapeHtml(supplier.name) + '</strong>. Produktlink kannst du weiter ergaenzen.</p>');
}
function disableSupplier(id){
  const list = getCustomSuppliers().map(function(s){ return s.id === String(id) ? {...s,status:'Deaktiviert'} : s; });
  saveCustomSuppliers(list);
}
function openSupplierForm(id){
  const existing = id ? getCustomSuppliers().find(function(s){ return s.id === String(id); }) : null;
  editingCustomSupplierId = existing ? existing.id : null;
  const s = existing || {};
  let modal = $('supplierModal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'supplierModal';
    modal.className = 'modal-backdrop hidden';
    modal.innerHTML = '<div class="card modal-panel"><h2 id="supplierModalTitle">Supplier hinzufuegen</h2><p class="hint">Eigene Supplier werden nur lokal gespeichert.</p><div class="settings-grid"><div><label>Supplier-Name</label><input id="supplierName"></div><div><label>Website / Shop-Link</label><input id="supplierWebsite"></div><div><label>Supplier-Typ</label><select id="supplierType"><option>Dropshipping</option><option>EU-B2B-Supplier</option><option>Marktplatz</option><option>Großhandel</option><option>Retail</option><option>Sonstige</option></select></div><div><label>Land / Region</label><input id="supplierRegion"></div><div><label>Kategorien</label><input id="supplierCategories"></div><div><label>Durchschnittliche Lieferzeit</label><input id="supplierDelivery"></div><div><label>Versandkosten / Versandmodell</label><input id="supplierShipping"></div><div><label>Dropshipping geeignet</label><select id="supplierDropshipping"><option>Unbekannt</option><option>Ja</option><option>Nein</option></select></div><div><label>API vorhanden</label><select id="supplierApi"><option>Unbekannt</option><option>Ja</option><option>Nein</option></select></div><div><label>Risiko-Level</label><select id="supplierRisk"><option>Unbekannt</option><option>Niedrig</option><option>Mittel</option><option>Hoch</option></select></div><div><label>Status</label><select id="supplierStatus"><option>Aktiv</option><option>Pruefen</option><option>Deaktiviert</option></select></div></div><label>Notizen</label><textarea id="supplierNotes"></textarea><div class="row"><button class="full" type="button" id="supplierSaveBtn">Supplier speichern</button><button class="secondary full" type="button" id="supplierCancelBtn">Abbrechen</button></div></div>';
    document.body.appendChild(modal);
    bind('supplierSaveBtn','click',saveSupplierForm);
    bind('supplierCancelBtn','click',closeSupplierForm);
    modal.addEventListener('click', function(event){ if(event.target === modal) closeSupplierForm(); });
  }
  safe('supplierModalTitle', function(el){ el.textContent = existing ? 'Supplier bearbeiten' : 'Supplier hinzufuegen'; });
  safe('supplierName', function(el){ el.value = s.name || ''; });
  safe('supplierWebsite', function(el){ el.value = s.website || ''; });
  safe('supplierType', function(el){ el.value = s.type || 'Dropshipping'; });
  safe('supplierRegion', function(el){ el.value = s.region || ''; });
  safe('supplierCategories', function(el){ el.value = s.categories || ''; });
  safe('supplierDelivery', function(el){ el.value = s.delivery || ''; });
  safe('supplierShipping', function(el){ el.value = s.shipping || ''; });
  safe('supplierDropshipping', function(el){ el.value = s.dropshipping || 'Unbekannt'; });
  safe('supplierApi', function(el){ el.value = s.api || 'Unbekannt'; });
  safe('supplierRisk', function(el){ el.value = s.risk || 'Unbekannt'; });
  safe('supplierStatus', function(el){ el.value = s.status || 'Pruefen'; });
  safe('supplierNotes', function(el){ el.value = s.notes || ''; });
  modal.classList.remove('hidden');
}
function closeSupplierForm(){ safe('supplierModal', function(el){ el.classList.add('hidden'); }); editingCustomSupplierId = null; }
function saveSupplierForm(){
  const name = getInputValue('supplierName');
  if(!name){ alert('Bitte Supplier-Name eintragen.'); return; }
  const record = {
    id: editingCustomSupplierId || String(Date.now()),
    name,
    website:getInputValue('supplierWebsite'),
    type:$('supplierType') ? $('supplierType').value : 'Sonstige',
    region:getInputValue('supplierRegion'),
    categories:getInputValue('supplierCategories'),
    delivery:getInputValue('supplierDelivery'),
    shipping:getInputValue('supplierShipping'),
    dropshipping:$('supplierDropshipping') ? $('supplierDropshipping').value : 'Unbekannt',
    api:$('supplierApi') ? $('supplierApi').value : 'Unbekannt',
    risk:$('supplierRisk') ? $('supplierRisk').value : 'Unbekannt',
    notes:getInputValue('supplierNotes'),
    status:$('supplierStatus') ? $('supplierStatus').value : 'Pruefen'
  };
  const list = getCustomSuppliers();
  const next = editingCustomSupplierId ? list.map(function(s){ return s.id === editingCustomSupplierId ? record : s; }) : list.concat(record);
  saveCustomSuppliers(next);
  closeSupplierForm();
}
function syncProductFormFromSource(data){
  const d = data || {};
  const online = d.online || {};
  currentSourcingDraft = {
    sourceProvider:d.supplier || currentSourcingDraft.sourceProvider || '',
    sourceRisk:d.risk || currentSourcingDraft.sourceRisk || '',
    sourceType:d.type || currentSourcingDraft.sourceType || '',
    sourceDomain:d.domain || currentSourcingDraft.sourceDomain || sourceDomain(d.link) || '',
    sourceNote:d.note || currentSourcingDraft.sourceNote || '',
    sourceAnalysisStatus:d.status || currentSourcingDraft.sourceAnalysisStatus || '',
    sourceProductNote:d.productNote || currentSourcingDraft.sourceProductNote || '',
    sourceOnlineStatus:online.status || currentSourcingDraft.sourceOnlineStatus || '',
    sourceOnlineCheckedAt:online.checkedAt || currentSourcingDraft.sourceOnlineCheckedAt || '',
    sourceOnlineTitle:online.title || currentSourcingDraft.sourceOnlineTitle || '',
    sourceOnlinePrice:online.price || currentSourcingDraft.sourceOnlinePrice || '',
    sourceOnlineCurrency:online.currency || currentSourcingDraft.sourceOnlineCurrency || '',
    sourceOnlineImage:online.image || currentSourcingDraft.sourceOnlineImage || '',
    sourceOnlineAvailability:online.availability || currentSourcingDraft.sourceOnlineAvailability || '',
    sourceOnlineShipping:online.shipping || currentSourcingDraft.sourceOnlineShipping || '',
    sourceOnlineConfidence:online.confidence || currentSourcingDraft.sourceOnlineConfidence || ''
  };
  safe('name', function(el){ if(d.name && (!el.value || el.value === 'Unbenanntes Produkt')) el.value = d.name; });
  safe('buy', function(el){ if(online.price && !el.value) el.value = String(online.price).replace(',','.'); });
  safe('supplierId', function(el){ if(d.supplier) el.value = d.supplier; });
  safe('supplierLink', function(el){ if(d.link) el.value = d.link; });
  safe('notes', function(el){
    const lines = [];
    if(d.supplier) lines.push('Supplier: ' + d.supplier);
    if(d.type) lines.push('Supplier-Typ: ' + d.type);
    if(d.risk) lines.push('Risiko: ' + d.risk);
    if(d.status) lines.push('Analyse-Status: ' + d.status);
    if(online.status) lines.push('Online-Status: ' + online.status);
    if(online.title) lines.push('Online-Titel: ' + online.title);
    if(online.price) lines.push('Online-Preis: ' + online.price + (online.currency ? ' ' + online.currency : ''));
    if(online.image) lines.push('Online-Bild: ' + online.image);
    if(online.availability) lines.push('Verfuegbarkeit: ' + online.availability);
    if(online.shipping) lines.push('Versand: ' + online.shipping);
    if(d.note) lines.push('Hinweis: ' + d.note);
    if(d.productNote) lines.push('Produktnotiz: ' + d.productNote);
    const addition = lines.join('\n');
    if(addition) el.value = el.value ? el.value + '\n\n' + addition : addition;
  });
  scrollToProductForm();
}
function sourceImport(){
  const provider = selectedSourceLabel();
  const link = getInputValue('sourceLink');
  const detected = link ? detectSupplierFromUrl(link) : null;
  const profile = detected && detected.valid ? detected.supplier : null;
  syncProductFormFromSource({supplier:provider, link, domain:detected ? detected.domain : '', type:profile ? profile.type : '', risk:profile ? profile.risk : '', note:profile ? profile.note : 'Quelle manuell uebernommen.', status:'Quelle uebernommen'});
  setSourcingWorkflowStep('4', 'productFormCard');
  setHTML('supplierUseNotice','<p>Quelle uebernommen: <strong>' + escapeHtml(provider || 'Quelle') + '</strong>.</p>');
}
function manualSourceImport(){
  const idea = getInputValue('manualProductIdea');
  const link = getInputValue('manualProductLink');
  syncProductFormFromSource({name:idea, supplier:'Manuelle Produktsuche', link, productNote:link, status:'Manuell uebernommen'});
  setSourcingWorkflowStep('4', 'productFormCard');
}
function sourceStatusChip(label, cls){
  return '<span class="status ' + (cls || 'info') + '">' + escapeHtml(label) + '</span>';
}
function sourceRiskTone(value){
  const raw = String(value || '').toLowerCase();
  if(raw.includes('rot') || raw.includes('hoch') || raw.includes('kritisch')) return {cls:'bad', color:'#ef4444', label:'Rot'};
  if(raw.includes('gruen') || raw.includes('niedrig') || raw.includes('geeignet')) return {cls:'good', color:'#22c55e', label:'Gruen'};
  if(raw.includes('gelb') || raw.includes('mittel') || raw.includes('pruefen')) return {cls:'warn', color:'#f59e0b', label:'Gelb'};
  return {cls:'info', color:'#64748b', label:'Grau'};
}
function renderSourcingRiskVisual(analysis){
  const supplier = analysis.supplier || STANDARD_SOURCE_PROFILES.other;
  const online = analysis.online || {};
  const supplierTone = sourceRiskTone(supplier.risk || supplier.traffic);
  const onlineTone = online.ok ? sourceRiskTone('Gruen') : online.status === 'failed' ? sourceRiskTone('Gelb') : sourceRiskTone('Grau');
  const complianceTone = sourceRiskTone(String(supplier.risk || '').toLowerCase().includes('hoch') ? 'Rot' : 'Gelb');
  const deliveryTone = sourceRiskTone(String(supplier.delivery || '').toLowerCase().includes('schnell') || String(supplier.delivery || '').toLowerCase().includes('eu') ? 'Gruen' : String(supplier.delivery || '').toLowerCase().includes('lang') ? 'Rot' : 'Gelb');
  const marginTone = sourceRiskTone('Grau');
  const rows = [
    ['Supplier', supplierTone, supplier.risk || 'Unbekannt'],
    ['Online-Daten', onlineTone, online.ok ? 'erkannt' : online.status === 'failed' ? 'nicht verfuegbar' : 'offen'],
    ['Compliance', complianceTone, complianceTone.cls === 'bad' ? 'kritisch pruefen' : 'pruefen'],
    ['Lieferzeit', deliveryTone, supplier.delivery || 'pruefen'],
    ['Marge', marginTone, 'offen']
  ];
  const center = supplierTone.cls === 'bad' || complianceTone.cls === 'bad' ? 'Kritisch' : online.ok ? 'Pruefen' : 'Vorlaeufig';
  let html = '<div class="sourcing-risk-visual">';
  html += '<div class="sourcing-donut" style="--seg1:' + supplierTone.color + ';--seg2:' + onlineTone.color + ';--seg3:' + complianceTone.color + ';--seg4:' + deliveryTone.color + ';--seg5:' + marginTone.color + '"><div class="sourcing-donut-center"><strong>' + escapeHtml(center) + '</strong><span>vorlaeufig</span></div></div>';
  html += '<div><div class="sourcing-scorecard">';
  rows.forEach(function(row){
    html += '<div class="sourcing-score-row"><strong>' + escapeHtml(row[0]) + '</strong><span><i class="sourcing-dot ' + row[1].cls + '"></i>' + escapeHtml(row[1].label) + '</span><span>' + escapeHtml(row[2]) + '</span></div>';
  });
  html += '</div><div class="sourcing-next-step">Naechster Schritt: Marge ergaenzen, Compliance pruefen und erst danach bewusst in die Produktmaske uebernehmen.</div></div></div>';
  return html;
}
function getSourceBackendUrl(){
  const storedBackend = localStorage.getItem('backendUrl') || localStorage.getItem('elyonBackendUrl') || '';
  return getBackendUrl() || normalizeBackendUrl(storedBackend) || 'https://elyonsellertool.vercel.app';
}
function hasOnlineProductData(online){
  if(!online || !online.ok) return false;
  if(isBadOnlineProductData(online)) return false;
  return !!(online.title || online.price || online.image || online.availability || online.shipping || online.description || online.category);
}
function isBadOnlineProductData(online){
  const text = String((online && online.title) || '') + ' ' + String((online && online.description) || '');
  return /\b(404|not found|page not found|access denied|forbidden|captcha|bot detection|seite nicht gefunden|nicht gefunden)\b/i.test(text);
}
function renderOnlineProductDataMask(online, analysis){
  const supplier = (analysis && analysis.supplier) || {};
  if(!hasOnlineProductData(online)){
    const rows = [
      ['Produktlink', (analysis && analysis.url) || (online && online.url)],
      ['Erkannter Supplier', supplier.name || (online && online.supplier)],
      ['Domain', (analysis && analysis.domain) || (online && online.domain)],
      ['Online-Status', (online && online.status) || 'nicht verfuegbar'],
      ['HTTP-Status', (online && online.httpStatus) || 'offen'],
      ['Inhaltstyp', (online && online.contentType) || 'offen'],
      ['Datenvertrauen', (online && online.confidence) || 'low'],
      ['Naechster Schritt', 'Produktdaten manuell ergaenzen oder API-Anbindung nutzen']
    ];
    let html = '<div class="ai-product-card" style="margin-top:0">';
    html += '<p>Noch keine echten Produktdaten erkannt.</p><p class="muted">' + escapeHtml((online && online.message) || 'Automatisches Auslesen ist fuer diese Quelle noch nicht verfuegbar. Bitte Produktdaten manuell ergaenzen oder spaeter API-Anbindung nutzen.') + '</p>';
    html += '<div class="ai-mini-grid">';
    rows.forEach(function(row){
      html += '<div class="ai-mini-item"><span class="ai-mini-label">' + escapeHtml(row[0]) + '</span><span class="ai-mini-value">' + escapeHtml(row[1] || 'offen') + '</span></div>';
    });
    html += '</div><div class="output-box"><h3>Produktdaten manuell ergaenzen</h3>';
    html += '<p class="muted">Wenn der Shop keine Daten freigibt, tragst du hier die wichtigsten Werte ein und uebernimmst sie danach in die Produktmaske.</p>';
    html += '<div class="row"><div><label>Produkttitel</label><input id="manualSourcingTitle" placeholder="z. B. Gartentisch klappbar"></div><div><label>Einkaufspreis</label><input id="manualSourcingPrice" type="number" step="0.01" placeholder="0.00"></div></div>';
    html += '<div class="row"><div><label>Versandkosten</label><input id="manualSourcingShippingCost" type="number" step="0.01" placeholder="0.00"></div><div><label>Lieferzeit in Tagen</label><input id="manualSourcingDelivery" type="number" step="1" placeholder="z. B. 5"></div></div>';
    html += '<div class="row"><div><label>Bild-URL</label><input id="manualSourcingImage" placeholder="https://..."></div><div><label>Kategorie</label><input id="manualSourcingCategory" placeholder="z. B. Home & Garden"></div></div>';
    html += '<label>Produktnotiz</label><textarea id="manualSourcingNote" placeholder="Wichtige Hinweise zu Supplier, Varianten, Versand, Risiko..."></textarea>';
    html += '<button class="secondary full" type="button" onclick="applyManualSourcingDetails()">Produktdaten in Maske uebernehmen</button></div>';
    html += '<div class="sourcing-next-step">Kein automatisches Speichern: Die Produktliste wird erst durch "Produkt speichern & bewerten" aktualisiert.</div></div>';
    return html;
  }
  let html = '<div class="ai-product-card" style="margin-top:0">';
  if(online.image) html += '<p><img src="' + escapeHtml(online.image) + '" alt="Produktbild" style="max-width:150px;border-radius:14px;border:1px solid rgba(148,163,184,.22);margin-bottom:10px"></p>';
  html += '<div class="ai-mini-grid">';
  [['Produkttitel',online.title],['Preis',online.price],['Waehrung',online.currency],['Verfuegbarkeit',online.availability],['Versandinformationen',online.shipping],['Kategorie',online.category],['Datenvertrauen',online.confidence],['Online-Status',online.status],['HTTP-Status',online.httpStatus]].forEach(function(row){
    html += '<div class="ai-mini-item"><span class="ai-mini-label">' + escapeHtml(row[0]) + '</span><span class="ai-mini-value">' + escapeHtml(row[1] || 'offen') + '</span></div>';
  });
  html += '</div>';
  if(online.description) html += '<div class="output-box"><h3>Kurzbeschreibung</h3><p>' + escapeHtml(String(online.description).slice(0, 420)) + '</p></div>';
  html += '<div class="sourcing-next-step">Diese Produktdaten sind nur vorbefuellt. Bitte Titel, Preis, Versand und Compliance manuell pruefen.</div>';
  html += '</div>';
  return html;
}
function getManualSourcingDetails(){
  return {
    title:getInputValue('manualSourcingTitle'),
    price:getInputValue('manualSourcingPrice'),
    shippingCost:getInputValue('manualSourcingShippingCost'),
    delivery:getInputValue('manualSourcingDelivery'),
    image:getInputValue('manualSourcingImage'),
    category:getInputValue('manualSourcingCategory'),
    note:getInputValue('manualSourcingNote')
  };
}
function applyManualSourcingDetails(){
  const a = latestSourceAnalysis;
  if(!a){ return; }
  const supplier = a.supplier || STANDARD_SOURCE_PROFILES.other;
  const manual = getManualSourcingDetails();
  const online = {
    ...(a.online || {}),
    status:(a.online && a.online.status) || 'done',
    title:manual.title || (a.online && a.online.title) || '',
    price:manual.price || (a.online && a.online.price) || '',
    image:manual.image || (a.online && a.online.image) || '',
    category:manual.category || (a.online && a.online.category) || '',
    shipping:manual.shippingCost ? (manual.shippingCost + ' EUR') : ((a.online && a.online.shipping) || ''),
    confidence:manual.title || manual.price ? 'manual' : ((a.online && a.online.confidence) || 'low')
  };
  a.online = online;
  a.productNote = manual.note || a.productNote || '';
  syncProductFormFromSource({name:manual.title || online.title || '', supplier:supplier.name, link:a.link, domain:a.domain, type:supplier.type, risk:supplier.risk, note:supplier.note, productNote:a.productNote, status:'Manuelle Produktdaten uebernommen', online});
  safe('ship', function(el){ if(manual.shippingCost && !el.value) el.value = String(manual.shippingCost).replace(',','.'); });
  safe('delivery', function(el){ if(manual.delivery && !el.value) el.value = manual.delivery; });
  safe('notes', function(el){
    const extra = [];
    if(manual.image) extra.push('Manuelles Produktbild: ' + manual.image);
    if(manual.category) extra.push('Manuelle Kategorie: ' + manual.category);
    if(extra.length) el.value = el.value ? el.value + '\n' + extra.join('\n') : extra.join('\n');
  });
  setHTML('supplierUseNotice','<p>Manuelle Produktdaten wurden in die Produktmaske uebernommen. Bitte pruefen und erst danach speichern.</p>');
  setSourcingWorkflowStep('4', 'productFormCard');
}
function renderSourceAnalysis(analysis){
  latestSourceAnalysis = analysis;
  const supplier = analysis.supplier || STANDARD_SOURCE_PROFILES.other;
  const online = analysis.online || {};
  const aiActive = isAiFeatureEnabled();
  const onlineOk = !!online.ok;
  const onlineFailed = online.status === 'failed' || onlineOk === false;
  const onlinePending = online.status === 'pending';
  const compliance = ['Enthaelt das Produkt Batterien?','Ist es Elektronik?','Koennte WEEE relevant sein?','Gibt es CE-/Produktsicherheitsanforderungen?','Gibt es Markenlogos oder geschuetzte Begriffe?','Ist das Produkt kosmetisch, medizinisch, lebensmittelnah oder reguliert?','Wie hoch ist das Retourenrisiko?','Ist die Lieferzeit fuer eBay-Kunden akzeptabel?'];
  let html = '<div class="ai-product-card">';
  html += '<div class="score-top"><span class="status ' + riskClass(supplier.risk) + '">Ampel: ' + escapeHtml(supplier.traffic || 'Grau') + '</span><span class="status info">Vorlaeufig</span></div>';
  html += '<div class="pill-row">';
  html += sourceStatusChip('Lokal geprueft','good');
  if(onlinePending) html += sourceStatusChip('Online-Analyse laeuft','warn');
  if(onlineOk) html += sourceStatusChip('Online geprueft','good');
  if(onlineFailed) html += sourceStatusChip('Onlineanalyse fehlgeschlagen','warn');
  html += sourceStatusChip(aiActive ? 'KI aktiv' : 'KI deaktiviert', aiActive ? 'good' : 'info');
  html += sourceStatusChip(aiActive ? 'KI optional' : 'Ohne KI bewertet','info');
  html += sourceStatusChip('Noch nicht gespeichert','warn');
  html += sourceStatusChip('Keine Live-Aktion','good');
  html += '</div>';
  html += renderSourcingRiskVisual(analysis);
  html += '<div class="output-box"><h3>Technische Linkanalyse</h3><div class="ai-mini-grid">';
  [['Erkannter Supplier',supplier.name],['Domain',analysis.domain || 'offen'],['Typ',supplier.type],['Risiko',supplier.risk],['Linkstatus',analysis.valid ? 'Link erkannt' : 'Link fehlt/ungueltig'],['Datenqualitaet',onlineOk ? (online.confidence || 'online geprueft') : 'Link erkannt'],['Online-Status',onlinePending ? 'Online-Analyse laeuft...' : onlineOk ? 'Online geprueft' : onlineFailed ? 'Onlineanalyse nicht verfuegbar' : 'Noch nicht online geprueft'],['Empfehlung','vorlaeufig pruefen']].forEach(function(row){
    html += '<div class="ai-mini-item"><span class="ai-mini-label">' + escapeHtml(row[0]) + '</span><span class="ai-mini-value">' + escapeHtml(row[1] || 'offen') + '</span></div>';
  });
  html += '</div></div>';
  html += '<div class="output-box"><h3>Produktdaten aus Onlineanalyse</h3>';
  if(onlinePending){
    html += '<p>Online-Analyse laeuft...</p>';
  }else{
    html += renderOnlineProductDataMask(online, analysis);
  }
  html += '</div>';
  html += '<div class="output-box"><h3>Supplier-Hinweis</h3><p>' + escapeHtml(supplier.note || 'Supplier pruefen.') + '</p></div>';
  html += '<div class="output-box"><h3>Vor dem Listen pruefen</h3><ul>' + compliance.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') + '</ul></div>';
  html += '<div class="output-box"><h3>KI-Bewertung</h3><p>' + (aiActive ? 'Wähle ChatGPT für die Hauptbewertung oder DeepSeek als günstigere Zweitmeinung. Live-Aktionen bleiben blockiert.' : 'KI ist deaktiviert. Die Produktdaten wurden online geprueft, aber nicht durch KI bewertet.') + '</p><div id="sourcingAiReview" class="muted">Noch keine KI-Bewertung gestartet.</div></div>';
  html += '<div class="copy-row">';
  if(aiActive) html += '<button class="secondary copy-btn" type="button" onclick="prepareAiSourcingPrompt()">KI-Prompt vorbereiten</button><button class="secondary copy-btn" type="button" onclick="startChatGptSourcingReview()">ChatGPT-Bewertung starten</button><button class="secondary copy-btn" type="button" onclick="startDeepSeekSourcingReview()">DeepSeek-Bewertung starten</button>';
  html += '<button class="full copy-btn" type="button" onclick="applyAnalysisToProductForm()">In Produktmaske uebernehmen</button></div></div>';
  setHTML('sourceAnalysisResult', html);
}
async function analyzeSourceOnline(analysis){
  const backendUrl = getSourceBackendUrl();
  const endpoint = backendUrl.replace(/\/$/,'') + '/api/source/analyze';
  try{
    const res = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:analysis.link,supplier:analysis.supplier ? analysis.supplier.name : '',source:'product-procurement'})});
    let data = {};
    try{ data = await res.json(); }catch(err){ data = {}; }
    if(!res.ok || !data.ok){
      return {...data, ok:false, status:'failed', message:data.message || 'Onlineanalyse ist noch nicht eingerichtet.'};
    }
    return {...data, ok:true, status:'done'};
  }catch(err){
    return {ok:false,status:'failed',reason:'backend_unavailable',message:'Onlineanalyse nicht verfuegbar - lokale Pruefung bleibt aktiv.'};
  }
}
async function analyzeSourceLink(){
  const link = getInputValue('analysisLinkInput');
  const productNote = getInputValue('analysisNoteInput');
  if(!link){ setHTML('sourceAnalysisResult','<div class="empty">Bitte Produktlink einfuegen.</div>'); return; }
  const detected = detectSupplierFromUrl(link);
  if(!detected.valid){ setHTML('sourceAnalysisResult','<div class="empty">Ungueltiger Link. Bitte vollstaendige URL pruefen.</div>'); return; }
  const analysis = {...detected, link, productNote, status:'Lokale Analyse - Backend nicht verfuegbar'};
  renderSourceAnalysis(analysis);
  if(detected.supplier && detected.supplier.name === 'Sonstige'){
    setHTML('supplierUseNotice','<p>Unbekannter Supplier - bitte pruefen oder als neuen Supplier speichern.</p>');
  }
  analysis.online = {status:'pending', message:'Online-Analyse laeuft...'};
  renderSourceAnalysis(analysis);
  const online = await analyzeSourceOnline(analysis);
  analysis.online = online;
  analysis.status = online && online.ok ? (isAiFeatureEnabled() ? 'Online geprueft - KI optional' : 'Online geprueft - ohne KI') : 'Lokale Analyse - Backend nicht verfuegbar';
  renderSourceAnalysis(analysis);
}
function prepareAiSourcingPrompt(){
  const a = latestSourceAnalysis;
  if(!a){ return; }
  const supplier = a.supplier || STANDARD_SOURCE_PROFILES.other;
  const prompt = [
    'Bewerte dieses Produkt fuer eBay-Dropshipping.',
    '',
    'Supplier: ' + (supplier.name || 'Unbekannt'),
    'Produktlink: ' + (a.link || ''),
    'Supplier-Typ: ' + (supplier.type || 'Unbekannt'),
    'Risiko-Level: ' + (supplier.risk || 'Unbekannt'),
    'Lieferzeit: ' + (supplier.delivery || 'Unbekannt'),
    'Notizen: ' + (a.productNote || supplier.note || ''),
    '',
    'Bitte pruefe:',
    '- Marge',
    '- Nachfrage',
    '- Konkurrenz',
    '- Lieferzeit',
    '- Retourenrisiko',
    '- Compliance-Risiko',
    '- Listing-Eignung',
    '- Empfehlung: Listen / Beobachten / Ablehnen',
    '',
    'Wichtig:',
    'Nur Analyse und Empfehlung.',
    'Keine Bestellung.',
    'Kein eBay-Posting.',
    'Keine Kundennachricht.',
    'Keine Live-Aktion.',
    '',
    'Nur Pruefung / Vorschau - keine Live-Aktion.'
  ].join('\n');
  setHTML('sourceAnalysisResult', ($('sourceAnalysisResult') ? $('sourceAnalysisResult').innerHTML : '') + '<div class="output-box"><h3>KI-Prompt Vorschau</h3><p id="sourcingAiPromptPreview">' + escapeHtml(prompt) + '</p><div class="copy-row"><button class="secondary copy-btn" data-copy="sourcingAiPromptPreview">Prompt kopieren</button></div></div>');
}
function buildChatGptSourcingPrompt(){
  const a = latestSourceAnalysis;
  if(!a) return '';
  const supplier = a.supplier || STANDARD_SOURCE_PROFILES.other;
  const online = a.online || {};
  return [
    'Bewerte dieses Produkt fuer eBay-Dropshipping im Elyon Seller Tool.',
    '',
    'Wichtig:',
    '- Nur Analyse und Empfehlung.',
    '- Keine Bestellung.',
    '- Kein eBay-Posting.',
    '- Keine Kundennachricht.',
    '- Keine Live-Aktion.',
    '- Nicht automatisch speichern.',
    '',
    'Produktdaten:',
    'Supplier: ' + (supplier.name || 'Unbekannt'),
    'Produktlink: ' + (a.link || ''),
    'Domain: ' + (a.domain || ''),
    'Supplier-Typ: ' + (supplier.type || 'Unbekannt'),
    'Supplier-Risiko: ' + (supplier.risk || 'Unbekannt'),
    'Lieferzeit: ' + (supplier.delivery || 'Unbekannt'),
    'Supplier-Hinweis: ' + (supplier.note || ''),
    'Produktnotiz: ' + (a.productNote || ''),
    '',
    'Onlineanalyse:',
    'Online-Status: ' + (online.status || 'offen'),
    'Online-Titel: ' + (online.title || ''),
    'Online-Preis: ' + (online.price || ''),
    'Waehrung: ' + (online.currency || ''),
    'Verfuegbarkeit: ' + (online.availability || ''),
    'Versand: ' + (online.shipping || ''),
    'Kategorie: ' + (online.category || ''),
    'Confidence: ' + (online.confidence || 'low'),
    '',
    'Bitte antworte strukturiert auf Deutsch mit:',
    '1. Score 0-100',
    '2. Empfehlung: Listen / Beobachten / Ablehnen',
    '3. Hauptgruende',
    '4. Risiken: Marge, Nachfrage, Konkurrenz, Lieferzeit, Retouren, Compliance',
    '5. Fehlende Daten',
    '6. Naechster konkreter Schritt',
    '',
    'Bleibe vorsichtig. Wenn Marge, Marktdaten oder Compliance offen sind, keine harte Listen-Empfehlung geben.'
  ].join('\n');
}
function startChatGptSourcingReview(){
  if(!latestSourceAnalysis){ alert('Bitte zuerst einen Produktlink analysieren.'); return; }
  if(!isAiFeatureEnabled()){ setHTML('sourcingAiReview','KI ist deaktiviert. Bitte KI-Funktionen aktivieren, wenn du ChatGPT verwenden willst.'); return; }
  openAiBillingWarning({
    task:'sourcing_review',
    prompt: buildChatGptSourcingPrompt(),
    resultId:'sourcingAiReview',
    extra:{ model:'openai-mini', source:'product-procurement' }
  });
}
async function startDeepSeekSourcingReview(){
  if(!latestSourceAnalysis){ alert('Bitte zuerst einen Produktlink analysieren.'); return; }
  if(!isAiFeatureEnabled()){ setHTML('sourcingAiReview','KI ist deaktiviert. Bitte KI-Funktionen aktivieren, wenn du DeepSeek verwenden willst.'); return; }
  if(!confirm('DeepSeek-Bewertung starten? Das kann je nach API-Key Kosten verursachen. Es wird keine Bestellung, kein Listing und keine Kundennachricht ausgelöst.')) return;
  const a = latestSourceAnalysis;
  const supplier = a.supplier || STANDARD_SOURCE_PROFILES.other;
  const online = a.online || {};
  incrementAiUsage();
  setHTML('sourcingAiReview','<div class="empty">DeepSeek bewertet das Produkt...</div>');
  try{
    const prompt = buildChatGptSourcingPrompt() + '\n\nBitte gib eine kurze, kritische Zweitmeinung als DeepSeek-Bewertung. Keine Live-Aktion ausführen. Nur Analyse, Einschätzung und konkrete Textvorschläge.';
    const data = await requestAiRouter('sourcing_review', prompt, {
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      allowFallback: true,
      context: {
        source: 'product-procurement',
        products:[{
          name: online.title || supplier.name || 'Produkt aus Produktbeschaffung',
          supplierId: supplier.name || '',
          supplierLink: a.link || '',
          sourceProvider: supplier.name || '',
          sourceType: supplier.type || '',
          sourceRisk: supplier.risk || '',
          sourceDomain: a.domain || '',
          sourceAnalysisStatus: a.status || '',
          sourceOnlineStatus: online.status || '',
          sourceOnlineTitle: online.title || '',
          sourceOnlinePrice: online.price || '',
          sourceOnlineCurrency: online.currency || '',
          sourceOnlineAvailability: online.availability || '',
          sourceOnlineShipping: online.shipping || '',
          sourceOnlineConfidence: online.confidence || '',
          notes: a.productNote || supplier.note || ''
        }],
        summary:{
          total:1,
          missingMarginCount: online.price ? 0 : 1,
          missingDeliveryCount: supplier.delivery ? 0 : 1,
          complianceRiskCount: String(supplier.risk || '').toLowerCase().includes('hoch') ? 1 : 0
        }
      },
      safety: {
        securityMode: true,
        sandboxMode: true,
        autonomyLocked: true,
        requiresLiveAction: false,
        userApproved: false,
      }
    });
    const recommendation = data && data.content ? data.content : 'Keine DeepSeek-Empfehlung erzeugt.';
    const mode = data && data.provider ? data.provider : 'deepseek';
    setHTML('sourcingAiReview','<div class="output-box"><h3>DeepSeek-Bewertung</h3><p>' + escapeHtml(recommendation) + '</p><p class="muted">Modus: ' + escapeHtml(mode) + '. Keine Live-Aktion ausgeführt.</p></div>');
  }catch(err){
    setHTML('sourcingAiReview','<div class="empty">⚠️ ' + escapeHtml(err && err.message ? err.message : 'DeepSeek-Bewertung fehlgeschlagen.') + '</div>');
  }
}
function applyAnalysisToProductForm(){
  const a = latestSourceAnalysis;
  if(!a){ return; }
  const supplier = a.supplier || STANDARD_SOURCE_PROFILES.other;
  const online = a.online || {};
  if(hasOnlineProductData(online)){
    setHTML('supplierUseNotice','<p>Einige Produktdaten wurden online erkannt. Bestehende Eingaben werden nicht automatisch ueberschrieben.</p>');
  }
  syncProductFormFromSource({name:online.title || '', supplier:supplier.name, link:a.link, domain:a.domain, type:supplier.type, risk:supplier.risk, note:supplier.note, productNote:a.productNote, status:a.status || 'Artikelanalyse uebernommen', online});
  setSourcingWorkflowStep('4', 'productFormCard');
}
window.prepareAiSourcingPrompt = prepareAiSourcingPrompt;
window.applyAnalysisToProductForm = applyAnalysisToProductForm;
window.applyManualSourcingDetails = applyManualSourcingDetails;
window.startChatGptSourcingReview = startChatGptSourcingReview;
window.startDeepSeekSourcingReview = startDeepSeekSourcingReview;
function setSourcingWorkflowStep(step, targetId, shouldScroll){
  const root = $('productSearchTab');
  if(!root) return;
  const activeStep = String(step || '1');
  const stepCopy = {
    '1': ['Quelle waehlen', 'Starte mit eBay, einem Supplier, einer manuellen Idee oder optionaler KI-Produktsuche.'],
    '2': ['Produktlink analysieren', 'Fuege den Produktlink ein und lasse Domain, Supplier und erste Online-Daten pruefen.'],
    '3': ['Risiko & Daten pruefen', 'Bewerte Ampel, Supplier-Risiko, Online-Daten und Compliance-Hinweise.'],
    '4': ['In Produktmaske uebernehmen', 'Pruefe die uebernommenen Daten und speichere das Produkt erst bewusst.']
  };
  root.dataset.sourcingActiveStep = activeStep;
  safe('sourcingStepTitle', function(el){ el.textContent = stepCopy[activeStep][0]; });
  safe('sourcingStepText', function(el){ el.textContent = stepCopy[activeStep][1]; });
  safe('sourcingStepCount', function(el){ el.textContent = 'Schritt ' + activeStep + ' von 4'; });
  root.querySelectorAll('[data-sourcing-panel]').forEach(function(panel){
    const allowed = String(panel.dataset.sourcingPanel || '').split(/\s+/).filter(Boolean);
    panel.dataset.sourcingHidden = allowed.includes(activeStep) ? 'false' : 'true';
  });
  root.querySelectorAll('.workflow-step').forEach(function(item){
    item.classList.toggle('active', String(item.dataset.sourcingStep || '') === activeStep);
  });
  root.querySelectorAll('.sourcing-column').forEach(function(column){
    const panels = Array.from(column.querySelectorAll('[data-sourcing-panel]'));
    column.dataset.sourcingHidden = panels.length && panels.every(function(panel){ return panel.dataset.sourcingHidden === 'true'; }) ? 'true' : 'false';
  });
  const target = $(targetId || (activeStep === '4' ? 'productFormCard' : activeStep === '3' ? 'sourceAnalysisResult' : activeStep === '2' ? 'sourceLinkAnalysisBlock' : 'sourcingSourcesCard'));
  if(target && shouldScroll !== false) target.scrollIntoView({behavior:'smooth', block:'start'});
  if(activeStep === '2') safe('analysisLinkInput', input => input.focus({preventScroll:true}));
  if(activeStep === '1') safe('sourceProvider', input => input.focus({preventScroll:true}));
}
function editModalNumber(id){
  const value = Number(getInputValue(id).replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}
function setProductEditValue(id, value){
  safe(id, el => { el.value = value !== undefined && value !== null ? value : ''; });
}
function getProductEditImage(product){
  const images = parseJsonArrayField(product.sourceOnlineImages);
  return String(product.sourceOnlineImage || images[0] || '').trim();
}
function renderProductEditPreview(product){
  const image = getProductEditImage(product);
  const price = [product.sourceOnlinePrice, product.sourceOnlineCurrency].filter(Boolean).join(' ') || (product.sell ? euro(product.sell) : '');
  const imageHtml = image ? '<img src="' + escapeHtml(image) + '" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">' : '<div class="empty" style="min-height:108px;padding:12px">Kein Bild</div>';
  setHTML('productEditPreview', imageHtml + '<div><strong>' + escapeHtml(product.name || 'Unbenanntes Produkt') + '</strong><div class="muted" style="margin-top:6px">' + escapeHtml(price || 'Preis offen') + ' · ' + escapeHtml(product.sourceProvider || product.supplierId || 'Quelle offen') + '</div><div class="pill-row"><span class="pill">Keine Live-Aktion</span><span class="pill">Nur Produktdaten</span></div></div>');
}
function openProductEditModal(product){
  if(!product) return;
  productEditModalId = product.id;
  renderProductEditPreview(product);
  setProductEditValue('editProductName', product.name || '');
  setProductEditValue('editProductStatus', normalizeProductStatus(product.productStatus || product.status || 'Draft', 'Draft'));
  setProductEditValue('editProductPriority', product.priority || 'Normal');
  setProductEditValue('editProductSku', product.sku || '');
  setProductEditValue('editProductSupplierId', product.supplierId || '');
  setProductEditValue('editProductSupplierLink', product.supplierLink || '');
  setProductEditValue('editProductBuy', product.buy || '');
  setProductEditValue('editProductShip', product.ship || '');
  setProductEditValue('editProductSell', product.sell || '');
  setProductEditValue('editProductTargetProfit', product.targetProfit || '');
  setProductEditValue('editProductFee', product.fee || '');
  setProductEditValue('editProductRiskBuffer', product.riskBuffer || '');
  setProductEditValue('editProductSales', product.sales || '');
  setProductEditValue('editProductCompetition', product.competition || '');
  setProductEditValue('editProductDelivery', product.delivery || '');
  setProductEditValue('editProductRisk', product.risk || 'low');
  setProductEditValue('editProductNotes', product.notes || '');
  safe('productEditModal', el => { el.classList.remove('hidden'); el.setAttribute('aria-hidden','false'); });
  setTimeout(()=>safe('editProductName', el => el.focus({preventScroll:true})), 30);
}
function closeProductEditModal(){
  productEditModalId = null;
  safe('productEditModal', el => { el.classList.add('hidden'); el.setAttribute('aria-hidden','true'); });
}
function saveProductEditModal(){
  const product = products.find(item => String(item.id) === String(productEditModalId));
  if(!product){ closeProductEditModal(); return; }
  const sku = getInputValue('editProductSku').toUpperCase();
  if(sku && products.some(item => String(item.id) !== String(product.id) && String(item.sku || '').trim().toUpperCase() === sku)){
    if(!confirm('Diese SKU existiert bereits. Trotzdem speichern?')) return;
  }
  const status = normalizeProductStatus(getInputValue('editProductStatus') || 'Draft', 'Draft');
  const next = normalizeProductRecord({
    ...product,
    name: getInputValue('editProductName') || 'Unbenanntes Produkt',
    status,
    productStatus: status,
    priority: getInputValue('editProductPriority') || 'Normal',
    sku,
    supplierId: getInputValue('editProductSupplierId'),
    supplierLink: getInputValue('editProductSupplierLink'),
    buy: editModalNumber('editProductBuy'),
    ship: editModalNumber('editProductShip'),
    sell: editModalNumber('editProductSell'),
    targetProfit: editModalNumber('editProductTargetProfit') || appSettings.profit,
    fee: editModalNumber('editProductFee') || appSettings.fees,
    riskBuffer: editModalNumber('editProductRiskBuffer') || appSettings.buffer,
    sales: editModalNumber('editProductSales'),
    competition: editModalNumber('editProductCompetition'),
    delivery: editModalNumber('editProductDelivery'),
    risk: getInputValue('editProductRisk') || 'low',
    notes: getInputValue('editProductNotes'),
    updated: new Date().toLocaleDateString('de-DE'),
    updatedAt: new Date().toISOString()
  });
  products = products.map(item => String(item.id) === String(product.id) ? next : item);
  save();
  closeProductEditModal();
}
function editProduct(id){
  const p=products.find(x=>String(x.id)===String(id)); if(!p) return;
  openProductEditModal(p);
}
function prepareProductForEbayDraft(id){
  const product = products.find(function(item){ return String(item.id) === String(id); });
  if(!product){
    alert('Produkt nicht gefunden.');
    return;
  }
  const existing = normalizeEbayListingDraftRecord(latestEbayListingDraft || loadStoredEbayListingDraft() || {});
  const title = String(product.listingTitle || product.title || product.name || '').trim();
  const descriptionParts = [
    String(product.listingDescription || product.description || '').trim(),
    String(product.notes || '').trim()
  ].filter(Boolean);
  const description = descriptionParts.join('\n\n');
  const featureParts = [
    product.sku ? 'SKU ' + product.sku : '',
    product.sourceType ? 'Quelle ' + product.sourceType : '',
    product.sourceOnlineCategory ? 'Kategorie ' + product.sourceOnlineCategory : '',
    product.sourceOnlineAvailability ? 'Verfügbarkeit ' + product.sourceOnlineAvailability : ''
  ].filter(Boolean);
  const keywordParts = [
    String(product.sourceOnlineCategory || '').trim(),
    String(product.sourceProvider || '').trim(),
    String(product.sourceDomain || '').trim(),
    String(product.priority || '').trim()
  ].filter(Boolean);
  const imageList = [];
  if(product.sourceOnlineImage) imageList.push(String(product.sourceOnlineImage).trim());
  try{
    const extraImages = JSON.parse(product.sourceOnlineImages || '[]');
    if(Array.isArray(extraImages)){
      extraImages.forEach(function(src){
        const value = String(src || '').trim();
        if(value && !imageList.includes(value)) imageList.push(value);
      });
    }
  }catch(err){}
  const itemSpecifics = String(product.sourceOnlineDetails || '').trim();
  const notes = [
    product.buy > 0 ? 'Einkaufspreis: ' + euro(product.buy) : '',
    product.sell > 0 ? 'Verkaufspreis: ' + euro(product.sell) : '',
    product.targetProfit > 0 ? 'Marge/Zielgewinn: ' + euro(product.targetProfit) : '',
    product.ship > 0 ? 'Versandkosten: ' + euro(product.ship) : '',
    product.delivery ? 'Lieferzeit: ' + product.delivery + ' Tage' : '',
    product.sourceProvider || product.supplierId ? 'Supplier: ' + (product.sourceProvider || product.supplierId) : '',
    product.supplierLink ? 'Produktlink: ' + product.supplierLink : '',
    product.sourceOnlineCategory ? 'Kategorie: ' + product.sourceOnlineCategory : '',
    itemSpecifics ? 'Artikelmerkmale: ' + itemSpecifics : '',
    imageList.length ? 'Bilder: ' + imageList.join(', ') : ''
  ].filter(Boolean).join('\n');
  const nextStatus = normalizeProductStatus(product.productStatus || product.status || 'Draft', 'Draft');
  const nextDraft = normalizeEbayListingDraftRecord({
    ...existing,
    source: 'product-board',
    productId: String(product.id),
    productStatus: nextStatus,
    status: nextStatus,
    buy: Number(product.buy || 0) || 0,
    sell: Number(product.sell || 0) || 0,
    ship: Number(product.ship || 0) || 0,
    margin: Number(product.targetProfit || product.margin || 0) || 0,
    supplier: String(product.sourceProvider || product.supplierId || '').trim(),
    supplierLink: String(product.supplierLink || '').trim(),
    category: String(product.sourceOnlineCategory || '').trim(),
    images: imageList,
    itemSpecifics: itemSpecifics,
    delivery: Number(product.delivery || 0) || 0,
    briefing: {
      ...(existing.briefing || {}),
      mainKeyword: String(product.mainKeyword || product.keyword || product.sourceOnlineCategory || product.name || '').trim(),
      name: title,
      feature: featureParts.join(', '),
      use: String(product.audience || product.use || 'eBay Listing').trim(),
      pain: String(product.sourceNote || product.notes || 'Aus Produktliste übernommen').trim(),
      tone: existing.briefing && existing.briefing.tone ? existing.briefing.tone : 'neutral',
      keywords: keywordParts.join(', '),
      mode: existing.briefing && existing.briefing.mode ? existing.briefing.mode : 'hybrid',
      price: Number(product.sell || 0) || 0,
      margin: Number(product.targetProfit || product.margin || 0) || 0,
      supplier: String(product.sourceProvider || product.supplierId || '').trim(),
      supplierLink: String(product.supplierLink || '').trim(),
      shipping: Number(product.ship || 0) || 0,
      buy: Number(product.buy || 0) || 0,
      category: String(product.sourceOnlineCategory || '').trim(),
      itemSpecifics: itemSpecifics,
      images: imageList,
      deliveryTime: Number(product.delivery || 0) || 0
    },
    draft: {
      ...(existing.draft || {}),
      title: title || 'eBay Listing Entwurf',
      description: description || 'Beschreibung aus Produktliste übernehmen und ergänzen.',
      notes: notes || 'Produkt aus der Produktliste übernommen.'
    },
    generated: {
      ...(existing.generated || {}),
      title: title || (existing.generated && existing.generated.title) || 'eBay Listing Entwurf',
      description: description || (existing.generated && existing.generated.description) || '',
      keywords: keywordParts.join(', '),
      titleVariants: existing.generated && existing.generated.titleVariants ? existing.generated.titleVariants : ''
    },
    updatedAt: new Date().toISOString()
  });
  applyEbayListingDraftToForm(nextDraft);
  latestEbayListingDraft = nextDraft;
  persistEbayListingDraft(nextDraft);
  showTab('ebayListingTab');
  genCalc();
  refreshEbayListingDraftPreview();
  toast('Produkt in den eBay-Draft übernommen.');
}
function prepareBrowserImportForEbayDraft(importId){
  const item = browserImports.find(function(entry){ return String(entry.id) === String(importId); });
  if(!item){
    alert('Browser Import nicht gefunden.');
    return;
  }
  const existing = normalizeEbayListingDraftRecord(latestEbayListingDraft || loadStoredEbayListingDraft() || {});
  const imageList = [item.image].concat(Array.isArray(item.images) ? item.images : []).map(function(src){
    return String(src || '').trim();
  }).filter(Boolean);
  const shippingText = item.shipping && typeof item.shipping === 'object'
    ? [item.shipping.cost, item.shipping.deliveryTime, item.shipping.shipsFrom, item.shipping.text].filter(Boolean).join(' · ')
    : '';
  const itemSpecifics = item.productDetails && typeof item.productDetails === 'object'
    ? Object.entries(item.productDetails).slice(0, 12).map(function(entry){
        return String(entry[0] || '') + ': ' + String(entry[1] || '');
      }).join(' | ')
    : '';
  const nextDraft = normalizeEbayListingDraftRecord({
    ...existing,
    source: 'browser-import',
    importId: String(item.id),
    productStatus: 'Draft',
    status: 'Draft',
    supplier: String(item.supplier || item.linkedSupplierName || item.linkedSupplierId || '').trim(),
    supplierLink: String(item.url || '').trim(),
    category: String(item.category || '').trim(),
    images: imageList,
    itemSpecifics: itemSpecifics,
    briefing: {
      ...(existing.briefing || {}),
      mainKeyword: String(item.category || item.title || '').trim(),
      name: String(item.title || 'Browser Import').trim(),
      feature: [
        item.rating ? 'Rating ' + item.rating : '',
        item.reviewsCount ? 'Bewertungen ' + item.reviewsCount : '',
        item.soldCount ? 'Verkäufe ' + item.soldCount : '',
        item.availability ? 'Verfügbarkeit ' + item.availability : ''
      ].filter(Boolean).join(', '),
      use: 'eBay Listing',
      pain: 'Aus Browser Import übernommen',
      tone: existing.briefing && existing.briefing.tone ? existing.briefing.tone : 'neutral',
      keywords: [item.category, item.supplier, item.domain].filter(Boolean).join(', '),
      mode: existing.briefing && existing.briefing.mode ? existing.briefing.mode : 'hybrid',
      supplier: String(item.supplier || item.linkedSupplierName || item.linkedSupplierId || '').trim(),
      supplierLink: String(item.url || '').trim(),
      shipping: shippingText,
      category: String(item.category || '').trim(),
      itemSpecifics: itemSpecifics,
      images: imageList
    },
    draft: {
      ...(existing.draft || {}),
      title: String(item.title || 'eBay Listing Entwurf').trim(),
      description: String(item.description || 'Beschreibung aus Browser Import übernehmen und ergänzen.').trim(),
      notes: [
        item.price ? 'Preis: ' + [item.price, item.currency].filter(Boolean).join(' ') : '',
        shippingText ? 'Versand: ' + shippingText : '',
        item.supplier ? 'Supplier: ' + item.supplier : '',
        item.url ? 'Produktlink: ' + item.url : '',
        item.category ? 'Kategorie: ' + item.category : '',
        itemSpecifics ? 'Artikelmerkmale: ' + itemSpecifics : '',
        imageList.length ? 'Bilder: ' + imageList.join(', ') : ''
      ].filter(Boolean).join('\n')
    },
    generated: {
      ...(existing.generated || {}),
      title: String(item.title || 'eBay Listing Entwurf').trim(),
      description: String(item.description || '').trim(),
      keywords: [item.category, item.supplier, item.domain].filter(Boolean).join(', '),
      titleVariants: existing.generated && existing.generated.titleVariants ? existing.generated.titleVariants : ''
    },
    updatedAt: new Date().toISOString()
  });
  applyEbayListingDraftToForm(nextDraft);
  latestEbayListingDraft = nextDraft;
  persistEbayListingDraft(nextDraft);
  showTab('ebayListingTab');
  genCalc();
  refreshEbayListingDraftPreview();
  toast('Browser Import in den eBay-Draft übernommen.');
}
function removeProduct(id){ products=products.filter(p=>p.id!==id); save(); }
function duplicateProduct(id){ const o=products.find(p=>p.id===id); if(!o) return; products.push({...o,id:Date.now(),name:o.name+' Kopie',created:new Date().toLocaleDateString('de-DE')}); save(); }
function toggleShopifyCandidate(id){
  products = products.map(p => p.id === id ? {...p, shopifyCandidate: !p.shopifyCandidate, shopifyMarkedAt: !p.shopifyCandidate ? new Date().toLocaleDateString('de-DE') : ''} : p);
  save();
}
function stopProduct(id){
  products = products.map(p => p.id === id ? normalizeProductRecord({...p,productStatus:'Archiviert',status:'Archiviert',stoppedAt:new Date().toLocaleDateString('de-DE'),updatedAt:new Date().toISOString()}) : p);
  save();
}
function clearAll(){ if(confirm('Wirklich alle Produkte löschen?')){ products=[]; save(); } }
function downloadCSV(rows,name){ const csv=rows.map(r=>r.map(cell=>'"'+String((cell !== undefined && cell !== null) ? cell : '').replaceAll('"','""')+'"').join(';')).join('\n'); const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=name; link.click(); }
function exportCSV(){
  const rows=[['Name','SKU','Lieferanten-ID','eBay-Artikelnummer','Lieferanten-Link','Status','Priorität','EK','Versand','VK','Gewinn','Score','Ampel','Empfohlener VK','Lieferzeit','Anbieter','Verkäufe','Risiko','Quelle','Supplier-Typ','Supplier-Risiko','Source-Domain','Analyse-Status','Source-Hinweis','SEO Titel','Beschreibung','Notizen','Produkt-Status','Listing-Score','Issues','CreatedAt','UpdatedAt','LastCheckedAt']];
  products.forEach(p=>{
    const c=calcProduct(p),s=statusFromScore(c.score);
    rows.push([
      p.name,
      p.sku||'',
      p.supplierId||'',
      p.ebayItemId||'',
      p.supplierLink||'',
      p.status,
      p.priority,
      p.buy,
      p.ship,
      p.sell,
      c.profit.toFixed(2),
      c.score,
      s.label,
      c.recommendedPrice.toFixed(2),
      p.delivery,
      p.competition,
      p.sales,
      p.risk,
      p.sourceProvider||'',
      p.sourceType||'',
      p.sourceRisk||'',
      p.sourceDomain||'',
      p.sourceAnalysisStatus||'',
      p.sourceNote||'',
      seoTitle(p.name),
      description(p.name),
      p.notes,
      p.productStatus || p.status || 'Draft',
      Number(p.listingScore || 0),
      Array.isArray(p.issues) ? p.issues.join(' | ') : (p.issues || ''),
      p.createdAt || '',
      p.updatedAt || '',
      p.lastCheckedAt || '',
    ]);
  });
  downloadCSV(rows,'elyon-produktliste.csv');
}
function detectCsvDelimiter(line){
  const text = String(line || '');
  let inQuotes = false;
  let semicolons = 0;
  let commas = 0;
  for(let i=0;i<text.length;i++){
    const ch = text[i];
    if(ch === '"' && text[i+1] === '"'){ i++; continue; }
    if(ch === '"'){ inQuotes = !inQuotes; continue; }
    if(inQuotes) continue;
    if(ch === ';') semicolons++;
    if(ch === ',') commas++;
  }
  return semicolons >= commas ? ';' : ',';
}
function parseCSVLine(line, delimiter){ let res=[],cur='',q=false; const sep = delimiter || detectCsvDelimiter(line); for(let i=0;i<line.length;i++){let ch=line[i]; if(ch==='"'&&line[i+1]==='"'){cur+='"';i++;} else if(ch==='"'){q=!q;} else if(ch===sep&&!q){res.push(cur);cur='';} else {cur+=ch;}} res.push(cur); return res; }
function nextImportSku(existingSkuSet){
  let num = 1;
  while(true){
    const sku = 'ELY-' + String(num).padStart(4,'0');
    if(!existingSkuSet.has(sku)){
      existingSkuSet.add(sku);
      return sku;
    }
    num++;
  }
}
function normalizeImportNumber(value){
  const text = String(value === undefined || value === null ? '' : value).trim();
  if(!text) return 0;
  const cleaned = text
    .replace(/\s+/g,'')
    .replace(/[€$]/g,'')
    .replace(/\./g,'')
    .replace(/,/g,'.')
    .replace(/[^0-9.\-]/g,'');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}
function firstImportValue(obj, keys){
  for(let i=0;i<keys.length;i++){
    const key = keys[i];
    if(Object.prototype.hasOwnProperty.call(obj, key)){
      const value = obj[key];
      if(String(value === undefined || value === null ? '' : value).trim() !== '') return value;
    }
  }
  return '';
}
function normalizeImportHeader(value){
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ä/g,'ae')
    .replace(/ö/g,'oe')
    .replace(/ü/g,'ue')
    .replace(/ß/g,'ss')
    .replace(/[()[\]._-]+/g,' ')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function createNormalizedImportRow(obj){
  const raw = obj && typeof obj === 'object' ? obj : {};
  const next = {};
  Object.keys(raw).forEach(function(key){
    const original = String(key || '').trim();
    const normalized = normalizeImportHeader(original);
    if(original && !Object.prototype.hasOwnProperty.call(next, original)) next[original] = raw[key];
    if(normalized && !Object.prototype.hasOwnProperty.call(next, normalized)) next[normalized] = raw[key];
  });
  return next;
}
function buildImportDraftFromRows(rows,sourceLabel){
  const normalizedRows = Array.isArray(rows) ? rows.filter(function(row){
    if(!row || typeof row !== 'object') return false;
    return Object.values(createNormalizedImportRow(row)).some(function(value){
      return String(value === undefined || value === null ? '' : value).trim() !== '';
    });
  }) : [];

  if(normalizedRows.length < 1) throw new Error('CSV enthält keine Produktdaten.');

  const existingSkuSet = new Set(products.map(function(p){ return String(p.sku || '').trim().toUpperCase(); }).filter(Boolean));
  const seenInImport = new Set();
  const draft = [];

  normalizedRows.forEach(function(obj, index){
    const normalizedObj = createNormalizedImportRow(obj);
    const importedName = String(firstImportValue(normalizedObj, ['Bezeichnung','Name','Titel','Produktname','Artikelname','Produkt','Artikel','Artikelbezeichnung']) || '').trim();
    const importedArticleId = String(firstImportValue(normalizedObj, ['SKU','Sku','sku','Artikel-ID','Artikel ID','Artikelnummer','Artikel Nummer','Artikel-Nr.','Artikel-Nr','Artikel Nr','ArtikelNr']) || '').trim();
    const importedEbayLink = String(firstImportValue(normalizedObj, ['Ebay Link','eBay Link','eBay URL','Link','URL']) || '').trim();
    const importedSupplier = String(firstImportValue(normalizedObj, ['Lieferanten-ID','Lieferanten Id','Supplier ID','Supplier','Anbieter-ID','Lieferant']) || '').trim();
    const importedBuy = normalizeImportNumber(firstImportValue(normalizedObj, ['EK','Preis EK','Einkaufspreis','Kosten','Preis Einkauf']));
    const importedSell = normalizeImportNumber(firstImportValue(normalizedObj, ['VK','Preis VK (ebay)','Preis VK','Verkaufspreis','Verkaufspreis eBay','Ebay Preis']));
    if(!importedName && !importedArticleId && !importedEbayLink && !importedSupplier && importedBuy === 0 && importedSell === 0){
      return;
    }

    let sku = String(firstImportValue(normalizedObj, ['SKU','Sku','sku','Artikel-ID','Artikel ID','Artikelnummer','Artikel Nummer','Artikel-Nr.','Artikel-Nr','Artikel Nr','ArtikelNr']) || '').trim().toUpperCase();
    let importStatus = 'bereit';
    let importMessage = 'wird importiert';

    if(!sku){
      sku = nextImportSku(existingSkuSet);
      importMessage = 'SKU automatisch erstellt';
    }else if(existingSkuSet.has(sku) || seenInImport.has(sku)){
      importStatus = 'skip';
      importMessage = 'existiert bereits';
    }
    seenInImport.add(sku);

    const name = importedName || 'Importiertes Produkt';
    const supplierId = String(firstImportValue(normalizedObj, ['Lieferanten-ID','Lieferanten Id','Supplier ID','Supplier','Anbieter-ID']) || '').trim();
    const ebayItemId = String(firstImportValue(normalizedObj, ['eBay-Artikelnummer','eBay Artikelnummer','eBay Nummer','eBay-ID']) || '').trim();
    const supplierLink = String(firstImportValue(normalizedObj, ['Lieferanten-Link','Lieferanten Link','Link','URL']) || '').trim();
    const status = String(firstImportValue(normalizedObj, ['Status','Typ']) || 'Draft').trim() || 'Draft';
    const priority = String(firstImportValue(normalizedObj, ['Priorität','Prioritaet','Priorität ','Prio']) || 'Normal').trim() || 'Normal';
    const buy = normalizeImportNumber(firstImportValue(normalizedObj, ['EK','Preis EK','Einkaufspreis','Kosten','Preis Einkauf']));
    const ship = normalizeImportNumber(firstImportValue(normalizedObj, ['Versand','Versand mind.','Versand ab','Versandkosten','Shipping']));
    const sell = normalizeImportNumber(firstImportValue(normalizedObj, ['VK','Preis VK (ebay)','Preis VK','Verkaufspreis','Verkaufspreis eBay','Ebay Preis']));
    const delivery = normalizeImportNumber(firstImportValue(normalizedObj, ['Lieferzeit','Lieferzeit Tage','Lieferzeit in Tagen','Tage']));
    const competition = normalizeImportNumber(firstImportValue(normalizedObj, ['Anbieter','Konkurrenz','Kategorie']));
    const sales = normalizeImportNumber(firstImportValue(normalizedObj, ['Verkäufe','Verkaeufe','Sales']));
    const risk = String(firstImportValue(normalizedObj, ['Risiko','Risk']) || 'low').trim() || 'low';
    const productStatus = normalizeProductStatus(firstImportValue(normalizedObj, ['Produkt-Status','Product Status','productStatus','Status','Typ']) || 'Draft', 'Draft');
    const listingScore = normalizeImportNumber(firstImportValue(normalizedObj, ['Listing-Score','listingScore','Score']));
    const issuesRaw = firstImportValue(normalizedObj, ['Issues','issue','Probleme','Prüfhinweise','Check Issues']);
    const notesParts = [];
    const eBayFees = firstImportValue(normalizedObj, ['Ebay gebühren','eBay gebühren','Ebay Gebühren','eBay Gebühren']);
    const targetProfit = normalizeImportNumber(firstImportValue(normalizedObj, ['Zielgewinn','Gewinnziel']));
    const recommendedPrice = firstImportValue(normalizedObj, ['Emph. Zielpreis','Empf. Zielpreis','Empfohlener Zielpreis','Zielpreis']);
    if(String(firstImportValue(normalizedObj, ['Typ']) || '').trim()) notesParts.push('Typ: ' + String(firstImportValue(normalizedObj, ['Typ'])));
    if(String(eBayFees || '').trim()) notesParts.push('eBay Gebühren: ' + String(eBayFees));
    if(String(firstImportValue(normalizedObj, ['Gewinn']) || '').trim()) notesParts.push('Gewinn: ' + String(firstImportValue(normalizedObj, ['Gewinn'])));
    if(String(targetProfit || '').trim()) notesParts.push('Zielgewinn: ' + String(targetProfit));
    if(String(recommendedPrice || '').trim()) notesParts.push('Empf. Zielpreis: ' + String(recommendedPrice));

    const product = {
      id: Date.now()+index,
      name: name,
      sku: sku,
      supplierId: supplierId,
      ebayItemId: ebayItemId,
      supplierLink: supplierLink,
      status: status,
      priority: priority,
      buy: buy,
      ship: ship,
      sell: sell,
      targetProfit: targetProfit || 7,
      fee: normalizeImportNumber(eBayFees) || 15,
      riskBuffer: 5,
      delivery: delivery,
      competition: competition,
      sales: sales,
      risk: risk,
      productStatus: productStatus,
      listingScore: listingScore || 0,
      issues: normalizeIssueList(issuesRaw),
      lastCheckedAt: String(firstImportValue(normalizedObj, ['lastCheckedAt','Last Checked At','Letzte Prüfung']) || '').trim(),
      createdAt: parseLooseDateIso(firstImportValue(normalizedObj, ['createdAt','Created At','Erstellt Am']) || '', new Date().toISOString()),
      updatedAt: parseLooseDateIso(firstImportValue(normalizedObj, ['updatedAt','Updated At','Aktualisiert Am']) || '', new Date().toISOString()),
      notes: String(firstImportValue(normalizedObj, ['Notizen','Notiz','Bemerkung']) || '').trim(),
      created: new Date().toLocaleDateString('de-DE'),
      importSource: sourceLabel || 'CSV'
    };
    if(notesParts.length){
      product.notes = [product.notes].concat(notesParts).filter(Boolean).join(' | ');
    }
    draft.push({product:normalizeProductRecord(product),status:importStatus,message:importMessage});
  });

  return draft;
}
function csvToImportDraft(text,sourceLabel){
  const cleanText = String(text || '').trim();
  if(!cleanText) throw new Error('Keine CSV-Daten erhalten.');

  const normalizedText = cleanText.split(String.fromCharCode(13)).join('');
  const lines = normalizedText.split(String.fromCharCode(10)).filter(function(line){ return line.trim(); });
  if(lines.length < 2) throw new Error('CSV enthält keine Produktdaten.');

  const header = parseCSVLine(lines[0]).map(function(x){ return x.trim(); });
  const rows = [];
  for(let i=1;i<lines.length;i++){
    const cols = parseCSVLine(lines[i]);
    const obj = {};
    header.forEach(function(h,idx){ obj[h] = cols[idx] || ''; });
    rows.push(obj);
  }
  return buildImportDraftFromRows(rows, sourceLabel || 'CSV');
}
function xlsxToImportDraft(arrayBuffer,sourceLabel){
  if(typeof XLSX === 'undefined'){
    throw new Error('XLSX-Bibliothek konnte nicht geladen werden.');
  }
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const preferredSheet = workbook.SheetNames.find(function(name){
    return String(name || '').trim().toLowerCase() === 'inventar';
  }) || workbook.SheetNames[0];
  if(!preferredSheet) throw new Error('Excel-Datei enthält keine Tabellenblätter.');
  const sheet = workbook.Sheets[preferredSheet];
  if(!sheet) throw new Error('Tabellenblatt konnte nicht gelesen werden.');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if(!rows.length) throw new Error('Excel enthält keine Produktdaten.');
  return buildImportDraftFromRows(rows, sourceLabel || ('Excel: ' + preferredSheet));
}
function showCsvImportPreview(draft){
  pendingCsvImport = Array.isArray(draft) ? draft : [];
  const ready = pendingCsvImport.filter(function(item){ return item.status !== 'skip'; }).length;
  const skipped = pendingCsvImport.filter(function(item){ return item.status === 'skip'; }).length;
  let html = '';
  html += '<div class="dashboard"><div class="metric"><small>Gefunden</small><strong>'+pendingCsvImport.length+'</strong></div><div class="metric"><small>Import bereit</small><strong>'+ready+'</strong></div><div class="metric"><small>Übersprungen</small><strong>'+skipped+'</strong></div><div class="metric"><small>Modus</small><strong>Vorschau</strong></div></div>';
  if(!pendingCsvImport.length){
    html += '<p>Keine importierbaren Produkte gefunden.</p>';
  }else{
    html += '<div class="products">' + pendingCsvImport.slice(0,50).map(function(item){
      const p = item.product;
      const cls = item.status === 'skip' ? 'bad' : 'good';
      return '<article class="product-card small-card"><div><div class="product-title">'+p.name+'</div><div class="muted">SKU: '+p.sku+' · '+item.message+'</div><div class="pill-row"><span class="pill">EK: '+euro(p.buy)+'</span><span class="pill">VK: '+euro(p.sell)+'</span><span class="pill">Lieferzeit: '+(p.delivery||0)+' Tage</span></div></div><div class="score-wrap"><span class="status '+cls+'">'+(item.status==='skip'?'wird übersprungen':'bereit')+'</span></div></article>';
    }).join('') + '</div>';
    if(pendingCsvImport.length > 50) html += '<p class="hint">Es werden nur die ersten 50 Einträge in der Vorschau angezeigt.</p>';
  }
  setHTML('csvImportPreview',html);
  safe('csvImportPreviewModal',function(el){ el.classList.remove('hidden'); });
}
function confirmCsvImport(){
  const items = pendingCsvImport.filter(function(item){ return item.status !== 'skip'; }).map(function(item){ return item.product; });
  if(!items.length){ alert('Keine neuen Produkte zum Importieren.'); return; }
  products = products.concat(items);
  pendingCsvImport = [];
  save();
  safe('csvImportPreviewModal',function(el){ el.classList.add('hidden'); });
  safe('csvImport',function(el){ el.value=''; });
  alert(items.length + ' Produkte importiert.');
}
function cancelCsvImport(){
  pendingCsvImport = [];
  safe('csvImportPreviewModal',function(el){ el.classList.add('hidden'); });
  safe('csvImport',function(el){ el.value=''; });
}
async function importCSV(e){
  const file=e.target.files[0];
  if(!file) return;
  const name = String(file.name || '').toLowerCase();
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
  if(isExcel){
    try{
      await ensureXlsxLibrary();
    }catch(err){
      alert(err.message || 'XLSX-Bibliothek konnte nicht geladen werden.');
      safe('csvImport',function(el){ el.value=''; });
      return;
    }
  }
  const reader=new FileReader();
  reader.onload=function(ev){
    try{
      const draft = isExcel
        ? xlsxToImportDraft(ev.target.result,'Lokale Excel-Datei')
        : csvToImportDraft(String(ev.target.result||''),'Lokale CSV-Datei');
      showCsvImportPreview(draft);
    }catch(err){
      alert(err.message || (isExcel ? 'Excel konnte nicht gelesen werden.' : 'CSV konnte nicht gelesen werden.'));
      safe('csvImport',function(el){ el.value=''; });
    }
  };
  reader.onerror=function(){
    alert(isExcel ? 'Excel-Datei konnte nicht gelesen werden.' : 'CSV-Datei konnte nicht gelesen werden.');
    safe('csvImport',function(el){ el.value=''; });
  };
  if(isExcel){
    reader.readAsArrayBuffer(file);
  }else{
    reader.readAsText(file,'UTF-8');
  }
}
function toggleCsvImportMenu(){
  safe('csvImportMenu',function(el){ el.classList.toggle('hidden'); });
}
function openLocalCsvImport(){
  safe('googleSheetImportBox',function(el){ el.classList.add('hidden'); });
  safe('csvImportMenu',function(el){ el.classList.add('hidden'); });
  safe('csvImport',function(el){ el.click(); });
}
function showGoogleSheetImport(){
  safe('googleSheetImportBox',function(el){ el.classList.toggle('hidden'); });
}
function parseGoogleSheetLink(input){
  const raw = String(input || '').trim();
  if(!raw) throw new Error('Bitte Google-Sheets-Link einfügen.');
  let parsed;
  try{
    parsed = new URL(raw);
  }catch(err){
    throw new Error('Das sieht nicht wie ein gültiger Google-Sheets-Link aus.');
  }
  const standardMatch = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  const publishedMatch = parsed.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);
  if(!standardMatch && !publishedMatch) throw new Error('Das sieht nicht wie ein gültiger Google-Sheets-Link aus.');
  const gid = parsed.searchParams.get('gid') || ((parsed.hash || '').match(/gid=([0-9]+)/) || [])[1] || '0';
  if(publishedMatch){
    return { kind:'published', publishedId:publishedMatch[1], gid:gid };
  }
  return { kind:'standard', spreadsheetId:standardMatch[1], gid:gid };
}
function googleSheetCsvCandidates(input){
  const parsed = parseGoogleSheetLink(input);
  if(parsed.kind === 'published'){
    const base = 'https://docs.google.com/spreadsheets/d/e/' + parsed.publishedId + '/pub';
    return [
      base + '?output=csv',
      base + '?gid=' + parsed.gid + '&single=true&output=csv',
      base + '?gid=' + parsed.gid + '&output=csv'
    ].filter(function(value,index,list){ return list.indexOf(value) === index; });
  }
  return [
    'https://docs.google.com/spreadsheets/d/' + parsed.spreadsheetId + '/export?format=csv&gid=' + parsed.gid,
    'https://docs.google.com/spreadsheets/d/' + parsed.spreadsheetId + '/gviz/tq?tqx=out:csv&gid=' + parsed.gid,
    'https://docs.google.com/spreadsheets/d/' + parsed.spreadsheetId + '/pub?output=csv&gid=' + parsed.gid
  ].filter(function(value,index,list){ return list.indexOf(value) === index; });
}
async function loadGoogleSheetCSV(){
  try{
    const input = $('googleSheetUrl') ? $('googleSheetUrl').value : '';
    const candidates = googleSheetCsvCandidates(input);
    let text = '';
    let lastError = '';
    for(let i=0;i<candidates.length;i++){
      try{
        const response = await fetch(candidates[i]);
        if(!response.ok){
          lastError = 'HTTP ' + response.status;
          continue;
        }
        const nextText = await response.text();
        if(nextText && nextText.trim() && !nextText.toLowerCase().includes('<html')){
          text = nextText;
          break;
        }
        lastError = 'Keine CSV-Daten geliefert';
      }catch(fetchErr){
        lastError = fetchErr && fetchErr.message ? fetchErr.message : 'Unbekannter Ladefehler';
      }
    }
    if(!text) throw new Error('Google Sheet konnte nicht geladen werden. Prüfe, ob es öffentlich freigegeben ist. ' + (lastError ? 'Details: ' + lastError : ''));
    const draft = csvToImportDraft(text,'Google Sheets');
    safe('csvImportMenu',function(el){ el.classList.add('hidden'); });
    showCsvImportPreview(draft);
  }catch(err){
    alert(err.message || 'Google Sheet konnte nicht importiert werden.');
  }
}
function getReturnStatsForProduct(productId){
  const linkedReturns = returns.filter(r => String(r.productId || '') === String(productId));
  return {
    count: linkedReturns.length,
    loss: linkedReturns.reduce((sum,r)=>sum+(+r.loss||0),0),
    open: linkedReturns.filter(r=>!['Abgeschlossen','Erstattet'].includes(r.status)).length
  };
}
function renderReturnProductOptions(){
  const select = $('retProductId');
  if(!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Kein Produkt verknüpfen</option>' + products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  select.value = current;
}
function renderSaleProductOptions(){
  const select = $('saleProductId');
  if(!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Kein Produkt ausgewählt</option>' + products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  select.value = current;
}
function renderShippingSaleOptions(){
  const select = $('shippingSaleId');
  if(!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Neue Bestellung / keine Auswahl</option>' + sales.map(s => {
    const order = s.orderNo ? ' · ' + s.orderNo : '';
    const status = s.shippingStatus ? ' · ' + s.shippingStatus : '';
    return '<option value="'+s.id+'">'+s.product+order+status+'</option>';
  }).join('');
  select.value = current;
}
function getDeepValue(obj, path){
  if(!obj || !path) return undefined;
  return String(path).split('.').reduce(function(acc, key){
    if(acc === undefined || acc === null) return undefined;
    if(/^\d+$/.test(key)) return acc[Number(key)];
    return acc[key];
  }, obj);
}
function firstDeepText(obj, paths){
  for(const path of paths){
    const value = getDeepValue(obj, path);
    if(value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}
function escapeHtml(text){
  return String(text || '').replace(/[&<>"']/g, function(ch){
    return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch];
  });
}
function extractShippingAddress(source){
  const addressSource = getDeepValue(source, 'shippingAddress')
    || getDeepValue(source, 'fulfillmentStartInstructions.0.shippingStep.shipTo.contactAddress')
    || getDeepValue(source, 'fulfillmentStartInstructions.0.shippingStep.shipTo.address')
    || getDeepValue(source, 'shipTo.contactAddress')
    || getDeepValue(source, 'shipTo.address')
    || getDeepValue(source, 'deliveryAddress')
    || {};
  const recipientName = firstDeepText(source, [
    'shipTo.fullName',
    'fulfillmentStartInstructions.0.shippingStep.shipTo.fullName',
    'shippingAddress.fullName',
    'shippingAddress.name',
    'shippingAddress.recipient',
    'shippingAddress.contactName',
    'buyer.fullName',
    'buyer.name',
    'buyer.username',
    'buyerUsername',
    'recipientName',
    'recipient',
    'fullName',
    'name'
  ]) || firstDeepText(addressSource, ['fullName','name','recipient','contactName']);
  const address1 = firstDeepText(addressSource, ['addressLine1','address1','street1','street','streetAddress','line1']);
  const address2 = firstDeepText(addressSource, ['addressLine2','address2','street2','line2']);
  const postalCode = firstDeepText(addressSource, ['postalCode','zipCode','zipcode','zip','postal']);
  const city = firstDeepText(addressSource, ['city','town']);
  const country = firstDeepText(addressSource, ['countryCode','country','countryName']);
  const lines = [];
  if(address1) lines.push(address1);
  if(address2) lines.push(address2);
  const cityLine = [postalCode, city].filter(Boolean).join(' ');
  if(cityLine) lines.push(cityLine);
  if(country) lines.push(country);
  return {
    recipientName,
    address1,
    address2,
    postalCode,
    city,
    country,
    addressText: lines.join('\n')
  };
}
function shippingAddressSummary(sale){
  const name = String(sale?.customerName || sale?.shipToRecipientName || '').trim();
  const hint = String(sale?.customerAddressHint || sale?.shipToAddressHint || '').trim();
  const address = String(composeSaleAddressText(sale) || sale?.shipToAddress || '').trim();
  const parts = [];
  if(name) parts.push(name);
  if(hint) parts.push(hint);
  if(address) parts.push(address.replace(/\n+/g, ', '));
  return parts.join(' · ');
}
function formatShippingAddressBlock(name, hint, addressText){
  const lines = [];
  const cleanName = String(name || '').trim();
  const cleanHint = String(hint || '').trim();
  const cleanAddress = String(addressText || '').trim();
  if(cleanName) lines.push('<strong>' + escapeHtml(cleanName) + '</strong>');
  if(cleanHint) lines.push('<span class="muted">' + escapeHtml(cleanHint) + '</span>');
  if(cleanAddress) lines.push(escapeHtml(cleanAddress).replace(/\n/g, '<br>'));
  return lines.length ? '<div class="output-box"><h3>Lieferadresse</h3><p>' + lines.join('<br>') + '</p></div>' : '';
}
function composeSaleAddressText(sale){
  if(!sale) return '';
  const direct = String(sale.shipToAddress || '').trim();
  if(direct) return direct;
  const lines = [];
  const street = String(sale.shipToStreet || '').trim();
  const postal = String(sale.shipToPostalCode || '').trim();
  const city = String(sale.shipToCity || '').trim();
  const country = String(sale.shipToCountry || '').trim();
  if(street) lines.push(street);
  const cityLine = [postal, city].filter(Boolean).join(' ');
  if(cityLine) lines.push(cityLine);
  if(country) lines.push(country);
  return lines.join('\n');
}
function saleCustomerSummary(sale){
  if(!sale) return '';
  const parts = [];
  const name = String(sale.customerName || sale.shipToRecipientName || '').trim();
  const email = String(sale.customerEmail || '').trim();
  const phone = String(sale.customerPhone || '').trim();
  const hint = String(sale.customerAddressHint || sale.shipToAddressHint || '').trim();
  const address = composeSaleAddressText(sale);
  if(name) parts.push('Kunde: ' + name);
  if(email) parts.push('E-Mail: ' + email);
  if(phone) parts.push('Telefon: ' + phone);
  if(hint) parts.push('Hinweis: ' + hint);
  if(address) parts.push('Adresse: ' + address.replace(/\n+/g, ', '));
  return parts.join(' · ');
}
function todayInputDate(){
  const d = new Date();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return d.getFullYear()+'-'+m+'-'+day;
}
function shippingIssueText(carrier,trackingNo,status){
  const issues=[];
  const no=String(trackingNo||'').trim();
  if((status==='Versendet'||status==='Zugestellt') && !no) issues.push('Trackingnummer fehlt trotz Versandstatus.');
  if(no && no.length<8) issues.push('Trackingnummer wirkt sehr kurz.');
  if(String(carrier||'')==='Sonstiges' && no) issues.push('Für Sonstiges kann kein sicherer Tracking-Link erzeugt werden.');
  return issues;
}
function renderShippingPreview(){
  const selectedSaleId = $('shippingSaleId') ? $('shippingSaleId').value : '';
  const selectedSale = selectedSaleId ? sales.find(function(s){ return String(s.id) === String(selectedSaleId); }) : null;
  const carrier = $('saleCarrier') ? $('saleCarrier').value : 'DHL';
  const trackingNo = $('saleTrackingNo') ? $('saleTrackingNo').value.trim() : '';
  const status = $('saleShippingStatus') ? $('saleShippingStatus').value : 'Noch nicht versendet';
  const recipientName = $('saleShipRecipientName') ? $('saleShipRecipientName').value.trim() : (selectedSale?.customerName || selectedSale?.shipToRecipientName || '');
  const addressHint = $('saleShipAddressHint') ? $('saleShipAddressHint').value.trim() : (selectedSale?.customerAddressHint || selectedSale?.shipToAddressHint || '');
  const addressText = $('saleShipAddress') ? $('saleShipAddress').value.trim() : (composeSaleAddressText(selectedSale) || selectedSale?.shipToAddress || '');
  const url = trackingUrl(carrier,trackingNo);
  const issues = shippingIssueText(carrier,trackingNo,status);
  let html='<h3>Tracking-Vorschau</h3>';
  html+='<div class="pill-row"><span class="pill">Dienstleister: '+carrier+'</span><span class="pill">Status: '+status+'</span>'+(trackingNo?'<span class="pill">Tracking: '+trackingNo+'</span>':'')+'</div>';
  html += formatShippingAddressBlock(recipientName, addressHint, addressText) || '<div class="output-box"><h3>Lieferadresse</h3><p class="muted">Noch keine Lieferadresse importiert. Sie wird aus der ausgewählten Bestellung übernommen, wenn vorhanden.</p></div>';
  if(url) html+='<p><a href="'+url+'" target="_blank" rel="noopener">Sendung verfolgen öffnen</a></p>';
  if(!url && trackingNo) html+='<p>Für diese Kombination konnte kein direkter Tracking-Link erstellt werden.</p>';
  if(!trackingNo) html+='<p>Trackingnummer eintragen, dann erscheint hier der passende Link.</p>';
  if(issues.length) html+='<div class="output-box"><h3>Hinweise</h3><ul>'+issues.map(i=>'<li>'+i+'</li>').join('')+'</ul></div>';
  setHTML('shippingPreview',html);
}
function renderShippingCockpit(){
  const notSent = sales.filter(function(s){ return (s.shippingStatus || 'Noch nicht versendet') === 'Noch nicht versendet'; }).length;
  const sent = sales.filter(function(s){ return (s.shippingStatus || '') === 'Versendet'; }).length;
  const delivered = sales.filter(function(s){ return (s.shippingStatus || '') === 'Zugestellt'; }).length;
  const missing = sales.filter(function(s){ return !String(s.trackingNo || '').trim() && !['Zugestellt','Storniert'].includes(s.status || ''); }).length;

  safe('shipNotSentCount', function(el){ el.textContent = notSent; });
  safe('shipSentCount', function(el){ el.textContent = sent; });
  safe('shipDeliveredCount', function(el){ el.textContent = delivered; });
  safe('shipMissingTrackingCount', function(el){ el.textContent = missing; });

  const filter = $('shippingFilter') ? $('shippingFilter').value : 'all';
  const items = sales.filter(function(s){
    const ship = s.shippingStatus || 'Noch nicht versendet';
    if(filter === 'all') return true;
    if(filter === 'missing') return !String(s.trackingNo || '').trim();
    return ship === filter;
  });

  if(!items.length){
    setHTML('shippingTodoList','<div class="empty">Keine Versand-To-dos für diesen Filter.</div>');
    renderShippingPreview();
    return;
  }

  const cards = items.map(function(s){
    const url = trackingUrl(s.carrier, s.trackingNo);
    const issues = shippingIssueText(s.carrier, s.trackingNo, s.shippingStatus || 'Noch nicht versendet');
    const cls = (s.shippingStatus === 'Problem' || issues.length) ? 'bad' : (s.shippingStatus === 'Zugestellt' ? 'good' : 'warn');
    let html = '';
    html += '<article class="product-card small-card">';
    html += '<div>';
    html += '<div class="product-title">' + (s.product || 'Unbekanntes Produkt') + '</div>';
    html += '<div class="muted">' + (s.orderNo || 'ohne Order-ID') + ' · ' + (s.carrier || 'DHL') + ' · ' + (s.shippingStatus || 'Noch nicht versendet') + '</div>';
    const addressBlock = formatShippingAddressBlock(s.shipToRecipientName, s.shipToAddressHint, s.shipToAddress);
    if(addressBlock) html += addressBlock;
    html += '<div class="pill-row">';
    html += '<span class="pill">Status: ' + (s.status || 'Bezahlt') + '</span>';
    html += '<span class="pill">Tracking: ' + (s.trackingNo || 'fehlt') + '</span>';
    if(s.shipDate) html += '<span class="pill">Datum: ' + s.shipDate + '</span>';
    html += '</div>';
    if(url) html += '<div class="output-box"><p><a href="' + url + '" target="_blank" rel="noopener">Tracking öffnen</a></p></div>';
    if(issues.length) html += '<div class="output-box"><h3>Hinweis</h3><p>' + issues.join(String.fromCharCode(10)) + '</p></div>';
    html += '</div>';
    html += '<div class="score-wrap"><span class="status ' + cls + '">' + (s.shippingStatus || 'Noch nicht versendet') + '</span></div>';
    html += '<div class="actions">';
    html += '<button class="secondary" data-shipping-load="' + s.id + '">Bearbeiten</button>';
    html += '<button class="secondary" data-shipping-status="Versendet" data-shipping-id="' + s.id + '">Versendet</button>';
    html += '<button class="secondary" data-shipping-status="Zugestellt" data-shipping-id="' + s.id + '">Zugestellt</button>';
    html += '<button class="secondary" data-shipping-status="Problem" data-shipping-id="' + s.id + '">Problem</button>';
    html += '</div>';
    html += '</article>';
    return html;
  }).join('');

  setHTML('shippingTodoList', cards);
  renderShippingPreview();
}
function clearShippingFields(){
  safe('shippingSaleId',el=>el.value='');
  safe('saleCarrier',el=>el.value='DHL');
  safe('saleShippingStatus',el=>el.value='Noch nicht versendet');
  safe('saleTrackingNo',el=>el.value='');
  safe('saleShipDate',el=>el.value='');
  safe('saleShipRecipientName',el=>el.value='');
  safe('saleShipAddressHint',el=>el.value='');
  safe('saleShipAddress',el=>el.value='');
  renderShippingPreview();
}
function fillShippingFromSelectedSale(){
  const id = $('shippingSaleId') ? $('shippingSaleId').value : '';
  const sale = sales.find(s=>String(s.id)===String(id));
  if(!sale){ clearShippingFields(); return; }
  safe('saleCarrier',el=>el.value=sale.carrier||'DHL');
  safe('saleShippingStatus',el=>el.value=sale.shippingStatus||'Noch nicht versendet');
  safe('saleTrackingNo',el=>el.value=sale.trackingNo||'');
  safe('saleShipDate',el=>el.value=sale.shipDate||'');
  safe('saleShipRecipientName',el=>el.value=sale.customerName || sale.shipToRecipientName || '');
  safe('saleShipAddressHint',el=>el.value=sale.customerAddressHint || sale.shipToAddressHint || '');
  safe('saleShipAddress',el=>el.value=composeSaleAddressText(sale) || sale.shipToAddress || '');
  renderShippingPreview();
}
function saveShippingForSelectedSale(){
  const id = $('shippingSaleId') ? $('shippingSaleId').value : '';
  if(!id){ alert('Bitte zuerst eine Bestellung auswählen.'); return; }
  const shipStatus = $('saleShippingStatus')?.value || 'Noch nicht versendet';
  const existing = sales.find(s=>String(s.id)===String(id));
  const shipDate = $('saleShipDate')?.value || ((shipStatus==='Versendet'||shipStatus==='Zugestellt') && existing && !existing.shipDate ? todayInputDate() : '');
  sales = sales.map(s=>String(s.id)===String(id) ? {
    ...s,
    carrier: $('saleCarrier')?.value || 'DHL',
    shippingStatus: shipStatus,
    trackingNo: $('saleTrackingNo')?.value.trim() || '',
    shipDate: shipDate,
    customerName: $('saleShipRecipientName')?.value.trim() || s.customerName || '',
    customerAddressHint: $('saleShipAddressHint')?.value.trim() || s.customerAddressHint || '',
    shipToRecipientName: $('saleShipRecipientName')?.value.trim() || s.shipToRecipientName || '',
    shipToAddressHint: $('saleShipAddressHint')?.value.trim() || s.shipToAddressHint || '',
    shipToStreet: s.shipToStreet || '',
    shipToPostalCode: s.shipToPostalCode || '',
    shipToCity: s.shipToCity || '',
    shipToCountry: s.shipToCountry || '',
    shipToAddress: $('saleShipAddress')?.value.trim() || composeSaleAddressText(s) || '',
    status: (shipStatus==='Versendet' || shipStatus==='Zugestellt') ? shipStatus : s.status
  } : s);
  saveSales();
  renderShippingSaleOptions();
  safe('shippingSaleId',el=>el.value=id);
  fillShippingFromSelectedSale();
  renderShippingCockpit();
  alert('Versanddaten gespeichert.');
}
function setShippingStatusForSale(id,status){
  sales = sales.map(s=>String(s.id)===String(id) ? {...s,shippingStatus:status,status:(status==='Versendet'||status==='Zugestellt')?status:s.status,shipDate:(status==='Versendet'||status==='Zugestellt')?(s.shipDate||todayInputDate()):s.shipDate} : s);
  saveSales();
  renderShippingSaleOptions();
  renderShippingCockpit();
}
function applyQuickShippingStatus(status){
  safe('saleShippingStatus',el=>el.value=status);
  if((status==='Versendet'||status==='Zugestellt') && $('saleShipDate') && !$('saleShipDate').value) $('saleShipDate').value=todayInputDate();
  renderShippingPreview();
}
function handleShippingClick(event){
  const loadBtn=event.target.closest('[data-shipping-load]');
  if(loadBtn){ safe('shippingSaleId',el=>el.value=loadBtn.dataset.shippingLoad); fillShippingFromSelectedSale(); return; }
  const statusBtn=event.target.closest('[data-shipping-status]');
  if(statusBtn){ setShippingStatusForSale(statusBtn.dataset.shippingId,statusBtn.dataset.shippingStatus); return; }
  const quickBtn=event.target.closest('[data-shipping-quick]');
  if(quickBtn){ applyQuickShippingStatus(quickBtn.dataset.shippingQuick); return; }
}
function getSalesStatsForProduct(productId){
  const linkedSales = sales.filter(s => String(s.productId || '') === String(productId));
  return {
    count: linkedSales.reduce((sum,s)=>sum+(+s.qty||1),0),
    revenue: linkedSales.reduce((sum,s)=>sum+(+s.price||0)*(+s.qty||1),0),
    profit: linkedSales.reduce((sum,s)=>sum+(+s.profit||0),0)
  };
}
function returnPillsForProduct(p,c){
  const rs = getReturnStatsForProduct(p.id);
  const ss = getSalesStatsForProduct(p.id);
  let html = '';
  if(p.sku) html += `<span class="pill">SKU: ${p.sku}</span>`;
  if(p.supplierId) html += `<span class="pill">Supplier-ID: ${p.supplierId}</span>`;
  if(p.ebayItemId) html += `<span class="pill">eBay-ID: ${p.ebayItemId}</span>`;
  html += `<span class="pill">EK+Versand: ${euro(c.totalCost)}</span>`;
  html += `<span class="pill">VK: ${euro(p.sell)}</span>`;
  html += `<span class="pill">Gewinn: ${euro(c.profit)}</span>`;
  html += `<span class="pill">Empf. VK: ${euro(c.recommendedPrice)}</span>`;
  html += `<span class="pill">Lieferzeit: ${p.delivery||0} Tage</span>`;
  if(ss.count){
    html += `<span class="pill">Verkauft: ${ss.count}</span>`;
    html += `<span class="pill">Sales-Gewinn: ${euro(ss.profit)}</span>`;
  }
  if(rs.count){
    html += `<span class="pill">Retouren: ${rs.count}</span>`;
    html += `<span class="pill">Retourenverlust: ${euro(rs.loss)}</span>`;
    if(rs.open) html += `<span class="pill">Offen: ${rs.open}</span>`;
  }
  return html;
}
function returnCompactPillsForProduct(p,c){
  const rs=getReturnStatsForProduct(p.id), ss=getSalesStatsForProduct(p.id);
  let html='';
  if(p.sku) html+=`<span class="pill">${p.sku}</span>`;
  html+=`<span class="pill">VK: ${euro(p.sell)}</span>`;
  html+=`<span class="pill">Gewinn: ${euro(c.profit)}</span>`;
  html+=`<span class="pill">${p.delivery||0} Tage</span>`;
  if(ss.count) html+=`<span class="pill">Sales: ${ss.count}</span>`;
  if(rs.count) html+=`<span class="pill">Retouren: ${rs.count}</span>`;
  return html;
}
function productHealth(p){
  const c=calcProduct(p), ss=getSalesStatsForProduct(p.id), rs=getReturnStatsForProduct(p.id), net=ss.profit-rs.loss, issues=productDataIssues(p);
  let score=100;
  if(c.score<65) score-=18;
  if(c.score<40) score-=18;
  if(issues.length) score-=Math.min(25,issues.length*6);
  if(rs.count>0) score-=12;
  if(rs.loss>0) score-=Math.min(25,Math.round(rs.loss));
  if(net<0) score-=20;
  if((+p.delivery||0)>14) score-=10;
  if(p.risk==='high') score-=15;
  if(normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft')==='Archiviert') score=20;
  score=Math.max(0,Math.min(100,score));
  const cls=score>=75?'good':score>=50?'warn':'bad';
  const label=score>=75?'🟢 Gesund':score>=50?'🟡 Beobachten':'🔴 Kritisch';
  const text=score>=75?'Produkt wirkt stabil.':score>=50?'Produkt weiter prüfen.':'Erst Ursache klären, nicht weiter pushen.';
  return {score,cls,label,text,issues};
}
function productDecisionReportText(p){
  const c = calcProduct(p);
  const status = statusFromScore(c.score);
  const health = productHealth(p);
  const salesStats = getSalesStatsForProduct(p.id);
  const returnStats = getReturnStatsForProduct(p.id);
  const net = salesStats.profit - returnStats.loss;
  const issues = productDataIssues(p);
  const strengths = [];
  const warnings = [];
  const nextSteps = [];

  if(c.profit >= (+appSettings.goProfit || 10)) strengths.push('Gewinnziel erreicht: ' + euro(c.profit) + ' erwarteter Gewinn pro Verkauf.');
  else if(c.profit > 0) warnings.push('Gewinn ist positiv, aber noch knapp: ' + euro(c.profit) + '.');
  else warnings.push('Produkt ist aktuell unprofitabel oder bei 0 Gewinn.');

  if((+p.delivery || 0) > 0 && (+p.delivery || 0) <= (+appSettings.maxDelivery || 14)) strengths.push('Lieferzeit wirkt akzeptabel: ' + (p.delivery || 0) + ' Tage.');
  if((+p.delivery || 0) > (+appSettings.maxDelivery || 14)) warnings.push('Lieferzeit ist hoch: ' + (p.delivery || 0) + ' Tage.');

  if((+p.competition || 0) > 0 && (+p.competition || 0) <= (+appSettings.maxSellers || 40)) strengths.push('Konkurrenz wirkt noch überschaubar: ' + (p.competition || 0) + ' Anbieter.');
  if((+p.competition || 0) > (+appSettings.maxSellers || 40)) warnings.push('Viele Anbieter: möglicher Preiskampf.');

  if((+p.sales || 0) >= 15) strengths.push('Nachfrage-Indikator vorhanden: ca. ' + (p.sales || 0) + ' Verkäufe geschätzt.');
  if((+p.sales || 0) < 5) warnings.push('Nachfrage noch schwach oder unklar.');

  if(p.risk === 'high') warnings.push('Hohes Risiko: Elektro/Batterie/WEEE/Markenrecht unbedingt prüfen.');
  if(p.risk === 'medium') warnings.push('Mittleres Risiko: rechtliche und qualitative Punkte prüfen.');
  if(p.risk === 'low') strengths.push('Risiko aktuell niedrig eingestuft.');

  if(salesStats.count > 0) strengths.push('Echte Verkäufe erfasst: ' + salesStats.count + ' Stück, Sales-Gewinn ' + euro(salesStats.profit) + '.');
  else warnings.push('Noch keine echten Verkäufe im Tool erfasst. Bewertung ist bisher theoretisch.');

  if(returnStats.count > 0) warnings.push('Retouren vorhanden: ' + returnStats.count + ', Verlust ' + euro(returnStats.loss) + '.');
  if(returnStats.open > 0) warnings.push('Offene Retouren: ' + returnStats.open + '.');

  issues.forEach(function(issue){ warnings.push('Stammdaten-Lücke: ' + issue + '.'); });

  if(c.score >= 65 && health.score >= 70){
    nextSteps.push('Listing vorbereiten und vor Veröffentlichung eBay-Checkliste nutzen.');
    nextSteps.push('Preis mit empfohlenem VK vergleichen: ' + euro(c.recommendedPrice) + '.');
  }else if(c.score >= 40){
    nextSteps.push('Produkt weiter prüfen: Konkurrenz, Lieferzeit, Lieferantenlink und Marge verbessern.');
    nextSteps.push('Noch nicht aggressiv skalieren. Erst Daten sammeln.');
  }else{
    nextSteps.push('Produkt eher stoppen oder komplett neu kalkulieren.');
    nextSteps.push('Nur weiterverfolgen, wenn sich EK, Lieferzeit oder Nachfrage deutlich verbessern.');
  }

  const line = String.fromCharCode(10);
  const lines = [];
  lines.push('Produkt-Entscheidungsbericht');
  lines.push('Erstellt am: ' + new Date().toLocaleDateString('de-DE'));
  lines.push('');
  lines.push('Produkt: ' + (p.name || 'Unbenanntes Produkt'));
  lines.push('SKU: ' + (p.sku || 'fehlt'));
  lines.push('Status im Tool: ' + normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft'));
  lines.push('Priorität: ' + (p.priority || 'Normal'));
  lines.push('Ampel: ' + status.label);
  lines.push('Produkt-Score: ' + c.score + '/100');
  lines.push('Gesundheit: ' + health.score + '/100 - ' + health.label);
  lines.push('');
  lines.push('Kalkulation');
  lines.push('EK + Versand: ' + euro(c.totalCost));
  lines.push('Aktueller VK: ' + euro(p.sell));
  lines.push('Gebühr: ' + euro(c.fee));
  lines.push('Risikopuffer: ' + euro(c.buffer));
  lines.push('Erwarteter Gewinn: ' + euro(c.profit));
  lines.push('Empfohlener VK für Zielgewinn: ' + euro(c.recommendedPrice));
  lines.push('');
  lines.push('Markt & Risiko');
  lines.push('Verkäufe geschätzt: ' + (p.sales || 0));
  lines.push('Anbieter/Konkurrenz: ' + (p.competition || 0));
  lines.push('Lieferzeit: ' + (p.delivery || 0) + ' Tage');
  lines.push('Risiko-Kategorie: ' + (p.risk || 'low'));
  if(p.sourceProvider || p.sourceRisk || p.sourceType || p.sourceDomain){
    lines.push('');
    lines.push('Produktbeschaffung');
    lines.push('Quelle/Supplier: ' + (p.sourceProvider || p.supplierId || 'offen'));
    lines.push('Supplier-Typ: ' + (p.sourceType || 'offen'));
    lines.push('Supplier-Risiko: ' + (p.sourceRisk || 'offen'));
    lines.push('Domain: ' + (p.sourceDomain || 'offen'));
    lines.push('Analyse-Status: ' + (p.sourceAnalysisStatus || 'offen'));
    if(p.sourceNote) lines.push('Supplier-Hinweis: ' + p.sourceNote);
    if(p.sourceProductNote) lines.push('Produktnotiz aus Beschaffung: ' + p.sourceProductNote);
  }
  lines.push('');
  lines.push('Echte Tool-Daten');
  lines.push('Verkauft laut Tool: ' + salesStats.count);
  lines.push('Sales-Gewinn laut Tool: ' + euro(salesStats.profit));
  lines.push('Retouren laut Tool: ' + returnStats.count);
  lines.push('Retourenverlust laut Tool: ' + euro(returnStats.loss));
  lines.push('Netto nach Retouren: ' + euro(net));
  lines.push('');
  lines.push('Warum gut?');
  if(strengths.length) strengths.forEach(function(s){ lines.push('- ' + s); });
  else lines.push('- Noch keine starken positiven Signale erkannt.');
  lines.push('');
  lines.push('Achtung / Prüfen');
  if(warnings.length) warnings.forEach(function(w){ lines.push('- ' + w); });
  else lines.push('- Keine akuten Warnungen erkannt.');
  lines.push('');
  lines.push('Nächster Schritt');
  nextSteps.forEach(function(step){ lines.push('- ' + step); });
  lines.push('');
  lines.push('Notizen');
  lines.push(p.notes || 'Keine Notizen hinterlegt.');
  return lines.join(line);
}
function productDecisionReport(id){
  const p = products.find(function(item){ return String(item.id) === String(id); });
  if(!p){ alert('Produkt nicht gefunden.'); return; }
  const text = productDecisionReportText(p);
  const safeText = text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  setHTML('productReportPreview','<p>' + safeText + '</p>');
  safe('productReportModal',function(el){ el.dataset.productId = p.id; el.classList.remove('hidden'); });
}
function closeProductReportModal(){
  safe('productReportModal',function(el){ el.classList.add('hidden'); });
}
function downloadProductReport(){
  const modal = $('productReportModal');
  const id = modal ? modal.dataset.productId : '';
  const p = products.find(function(item){ return String(item.id) === String(id); });
  if(!p){ alert('Kein Produktbericht ausgewählt.'); return; }
  const text = productDecisionReportText(p);
  const blob = new Blob([text],{type:'text/plain;charset=utf-8'});
  const link = document.createElement('a');
  const cleanName = String(p.name || 'produkt').replace(/[^a-zA-Z0-9-_]/g,'_').slice(0,60);
  link.href = URL.createObjectURL(blob);
  link.download = 'produkt-entscheidungsbericht-' + cleanName + '.txt';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function isAiFeatureEnabled(){
  if(typeof appSettings === 'object' && appSettings){
    if(typeof appSettings.aiEnabled === 'boolean') return appSettings.aiEnabled;
    if(typeof appSettings.openAiTools === 'boolean') return appSettings.openAiTools;
    if(typeof appSettings.openAiEnabled === 'boolean') return appSettings.openAiEnabled;
  }

  const storageKeys = ['elyonAiEnabled', 'elyonOpenAiTools', 'elyonOpenAiEnabled'];
  for(const key of storageKeys){
    const raw = localStorage.getItem(key);
    if(raw === null || raw === undefined) continue;
    return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
  }

  return true;
}

const PRODUCT_DECISION_GO_THRESHOLD = 60;
const PRODUCT_DECISION_TEST_THRESHOLD = 30;
const runningProductAiIds = new Set();
let productAiDelegationBound = false;

function normalizeProductAiDecision(value){
  const raw = value && typeof value === 'object' ? value : {};
  const score = clampScore(raw.score);
  const decisionRaw = String(raw.decision || '').trim().toUpperCase();
  const decision = ['GO', 'TEST', 'NO'].includes(decisionRaw)
    ? decisionRaw
    : score >= PRODUCT_DECISION_GO_THRESHOLD
      ? 'GO'
      : score >= PRODUCT_DECISION_TEST_THRESHOLD
        ? 'TEST'
        : 'NO';
  const riskLevelRaw = String(raw.riskLevel || '').trim().toLowerCase();
  const riskLevel = ['low', 'medium', 'high'].includes(riskLevelRaw)
    ? riskLevelRaw
    : decision === 'GO'
      ? 'low'
      : decision === 'TEST'
        ? 'medium'
        : 'high';
  const complianceRaw = String(raw.compliance || '').trim().toLowerCase();
  const compliance = ['green', 'yellow', 'red'].includes(complianceRaw)
    ? complianceRaw
    : riskLevel === 'low'
      ? 'green'
      : riskLevel === 'medium'
        ? 'yellow'
        : 'red';
  const profitVerdictRaw = String(raw.profitVerdict || '').trim().toLowerCase();
  const profitVerdict = ['good', 'tight', 'bad'].includes(profitVerdictRaw)
    ? profitVerdictRaw
    : decision === 'GO'
      ? 'good'
      : decision === 'TEST'
        ? 'tight'
        : 'bad';
  const warnings = uniqueCleanList(raw.warnings || raw.riskWarnings || []).slice(0, 8);
  const nextSteps = uniqueCleanList(raw.nextSteps || raw.actions || []).slice(0, 8);
  const shortSummary = String(raw.shortSummary || raw.summary || '').trim().slice(0, 260);
  const publishReady = raw.publishReady === true || (decision === 'GO' && compliance === 'green' && riskLevel === 'low');

  return {
    score,
    decision,
    riskLevel,
    compliance,
    profitVerdict,
    publishReady,
    shortSummary,
    warnings,
    nextSteps,
  };
}

function parseProductAiDecisionJson(value){
  if(!value) return null;
  if(typeof value === 'object'){
    if(value.score !== undefined || value.decision || value.riskLevel || value.compliance || value.profitVerdict) return value;
    if(value.result){
      const parsedResult = parseProductAiDecisionJson(value.result);
      if(parsedResult) return parsedResult;
    }
    if(value.aiDecision){
      const parsedDecision = parseProductAiDecisionJson(value.aiDecision);
      if(parsedDecision) return parsedDecision;
    }
    if(value.content){
      const parsedContent = parseProductAiDecisionJson(value.content);
      if(parsedContent) return parsedContent;
    }
    if(value.message){
      const parsedMessage = parseProductAiDecisionJson(value.message);
      if(parsedMessage) return parsedMessage;
    }
    return null;
  }

  const rawText = String(value || '').trim();
  if(!rawText) return null;
  const candidates = [
    rawText,
    rawText.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim(),
  ];
  const firstObject = rawText.indexOf('{');
  const lastObject = rawText.lastIndexOf('}');
  if(firstObject >= 0 && lastObject > firstObject){
    candidates.push(rawText.slice(firstObject, lastObject + 1));
  }

  for(const candidate of candidates){
    try{
      const parsed = JSON.parse(candidate);
      if(parsed && typeof parsed === 'object') return parsed;
    }catch(err){
      // Anbieter liefern gelegentlich Markdown oder Erklaertext; naechsten Kandidaten versuchen.
    }
  }
  return null;
}

function normalizeProductAiDecisionResponse(response){
  const parsed = parseProductAiDecisionJson(response);
  if(parsed) return normalizeProductAiDecision(parsed);

  const content = String(response && (response.content || response.output || response.text || response.message || '') || '').trim();
  const fallbackUsed = response && (response.fallbackUsed === true || response.provider === 'local');
  if(fallbackUsed){
    return normalizeProductAiDecision({
      score: 0,
      decision: 'NO',
      riskLevel: 'high',
      compliance: 'red',
      profitVerdict: 'bad',
      shortSummary: 'KI-Anbieter war nicht erreichbar. Die Produktpruefung wurde nicht live ausgefuehrt.',
      warnings: [content || 'KI-Anbieter nicht erreichbar oder API-Key pruefen.'],
      nextSteps: ['API-Status pruefen und KI-Pruefung erneut starten.'],
    });
  }

  if(content){
    return normalizeProductAiDecision({
      score: 45,
      decision: 'TEST',
      riskLevel: 'medium',
      compliance: 'yellow',
      profitVerdict: 'tight',
      shortSummary: content.slice(0, 240),
      warnings: ['KI-Antwort war nicht als klares JSON formatiert. Ergebnis bitte manuell gegenpruefen.'],
      nextSteps: ['Produktdaten pruefen und KI-Pruefung bei Bedarf erneut starten.'],
    });
  }

  throw new Error('KI hat keine verwertbare Antwort geliefert.');
}

function getProductAiDecision(product){
  return normalizeProductAiDecision(product && (product.aiDecision || product.ai || {}));
}

function hasProductAiDecision(product){
  const decision = product && (product.aiDecision || product.ai);
  return !!decision && typeof decision === 'object' && (
    decision.decision ||
    decision.shortSummary ||
    decision.score !== undefined ||
    (Array.isArray(decision.warnings) && decision.warnings.length) ||
    (Array.isArray(decision.nextSteps) && decision.nextSteps.length)
  );
}

function productAiDecisionStatusClass(decision){
  if(decision === 'GO') return 'good';
  if(decision === 'TEST') return 'warn';
  return 'bad';
}

function productAiComplianceClass(compliance){
  if(compliance === 'green') return 'ai-compliance-green';
  if(compliance === 'yellow') return 'ai-compliance-yellow';
  return 'ai-compliance-red';
}

function productAiComplianceLabel(compliance){
  if(compliance === 'green') return '🟢 Grün';
  if(compliance === 'yellow') return '🟡 Gelb';
  return '🔴 Rot';
}

function productAiDecisionLabel(decision){
  if(decision === 'GO') return 'GO';
  if(decision === 'TEST') return 'TEST';
  if(decision === 'NO') return 'NO';
  return 'KI ungeprüft';
}

function productAiRiskLabel(riskLevel){
  if(riskLevel === 'low') return 'niedrig';
  if(riskLevel === 'medium') return 'mittel';
  if(riskLevel === 'high') return 'hoch';
  return 'offen';
}

function productAiProfitLabel(verdict){
  if(verdict === 'good') return 'gut';
  if(verdict === 'tight') return 'knapp';
  if(verdict === 'bad') return 'schlecht';
  return 'offen';
}

function getProductAiUiId(prefix, productId){
  return prefix + '_' + String(productId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function setProductAiButtonState(productId, loading){
  const button = $(getProductAiUiId('productAiBtn', productId));
  if(!button) return;
  if(!button.dataset.originalLabel){
    button.dataset.originalLabel = button.textContent || 'KI prüfen';
  }
  button.disabled = !!loading;
  button.textContent = loading ? 'KI prüft...' : button.dataset.originalLabel;
}

function buildProductDecisionPayload(product){
  const buy = Number(product && product.buy) || 0;
  const ship = Number(product && product.ship) || 0;
  const sell = Number(product && product.sell) || 0;
  const margin = Math.round(((sell - buy - ship) || 0) * 100) / 100;
  const marginPercent = sell > 0 ? Math.round(((margin / sell) * 1000)) / 10 : 0;
  return {
    product: {
      id: product && product.id ? product.id : '',
      name: String(product && (product.name || product.title || '')).trim(),
      sku: String(product && product.sku || '').trim(),
      category: String(product && (product.category || product.type || product.productType || '')).trim(),
      supplier: String(product && (product.supplierName || product.supplier || product.supplierId || '')).trim(),
      supplierId: String(product && (product.supplierId || product.supplierID || '')).trim(),
      description: String(product && (product.description || product.listingDescription || product.shortDescription || product.summary || '')).trim(),
      buy,
      ship,
      sell,
      margin,
      marginPercent,
      delivery: Number(product && product.delivery) || 0,
      competition: Number(product && product.competition) || 0,
      risk: String(product && (product.risk || product.riskLevel || product.riskLabel || '')).trim(),
      complianceHints: {
        electronics: Boolean(product && (product.electronics || product.electronic || product.isElectronics)),
        battery: Boolean(product && (product.battery || product.hasBattery || product.containsBattery)),
        brandRisk: Boolean(product && (product.brandRisk || product.markenrisiko)),
        lucidRisk: Boolean(product && (product.lucidRisk || product.packagingRisk)),
        weeeRisk: Boolean(product && (product.weeeRisk || product.wasteElectricalRisk)),
        battRisk: Boolean(product && (product.battRisk || product.batteryRisk)),
      },
    },
  };
}

function buildProductDecisionPrompt(product){
  const payload = buildProductDecisionPayload(product);
  return [
    'Pruefe dieses einzelne Produkt fuer eine interne Kauf- und Listing-Entscheidung.',
    'Antworte ausschliesslich mit validem JSON. Kein Markdown, keine Code-Fences, keine Erklaerung ausserhalb von JSON.',
    'Schema: {"score":0-100,"decision":"GO|TEST|NO","riskLevel":"low|medium|high","compliance":"green|yellow|red","profitVerdict":"good|tight|bad","publishReady":false,"shortSummary":"kurz","warnings":["..."],"nextSteps":["..."]}',
    'Nenne kurze Warnungen und naechste Schritte, keine langen Fliesstexte.',
    'Keine automatische Veröffentlichung, keine Bestellungen, nur Beratung.',
    'Achte besonders auf Produktname, Einkaufspreis, Verkaufspreis, Versandkosten, Marge, Lieferzeit, Supplier, Kategorie, Beschreibung, Wettbewerb und Compliance-Themen wie Elektronik, Akku, Batterie, CE, Markenrisiko, LUCID, WEEE und BATT.',
    '',
    'Daten:',
    JSON.stringify(payload, null, 2),
  ].join('\n');
}

function renderProductAiMiniCard(product){
  const decision = getProductAiDecision(product);
  const hasDecision = hasProductAiDecision(product);
  const statusClass = hasDecision ? productAiDecisionStatusClass(decision.decision) : 'ai-status-ghost';
  const complianceClass = hasDecision ? productAiComplianceClass(decision.compliance) : 'ai-status-ghost';
  const complianceLabel = hasDecision ? productAiComplianceLabel(decision.compliance) : '⚪ Offen';
  const summary = hasDecision
    ? (decision.shortSummary || 'Keine Kurz-Zusammenfassung vorhanden.')
    : (isAiFeatureEnabled() ? 'Noch keine KI-Produktprüfung gespeichert.' : 'KI ist aktuell deaktiviert.');
  const warning = hasDecision
    ? (decision.warnings[0] || 'Keine Warnung gemeldet.')
    : (isAiFeatureEnabled() ? 'Warte auf die erste KI-Prüfung.' : 'Bitte KI-Funktionen aktivieren, um das Produkt prüfen zu lassen.');
  const nextStep = hasDecision
    ? (decision.nextSteps[0] || 'Nächsten Schritt manuell festlegen.')
    : (isAiFeatureEnabled() ? 'Jetzt auf „KI prüfen“ klicken.' : 'OpenAI-Tools oder KI-Funktionen aktivieren.');
  const scoreValue = hasDecision ? decision.score : '—';
  const decisionLabel = hasDecision ? productAiDecisionLabel(decision.decision) : 'KI ungeprüft';
  const profitVerdictLabel = hasDecision ? decision.profitVerdict : '—';
  const progressStyle = hasDecision ? 'width:' + decision.score + '%' : 'width:12%';
  const aiHint = isAiFeatureEnabled()
    ? ''
    : '<div class="ai-compact-note">KI-Funktionen sind derzeit deaktiviert oder OpenAI-Tools sind aus.</div>';
  const lowScoreHint = hasDecision && (decision.decision === 'NO' || decision.score < PRODUCT_DECISION_TEST_THRESHOLD)
    ? '<div class="ai-compact-note">Hinweis: Auch wenn der Score schwach ist, kannst du das Produkt trotzdem manuell prüfen oder klein testen, wenn Lieferant, Marge oder Nachfrage einen zweiten Blick wert sind.</div>'
    : '';

  let html = '';
  html += '<div class="ai-product-card" id="' + getProductAiUiId('productAiCard', product.id) + '">';
  html += '<div class="score-top"><span class="status ' + statusClass + '">' + decisionLabel + '</span><span class="score-number">' + scoreValue + '</span></div>';
  html += '<div class="progress"><div class="bar" style="' + progressStyle + '"></div></div>';
  html += '<div class="pill-row" style="margin-top:10px">';
  html += '<span class="status ' + complianceClass + '">' + complianceLabel + '</span>';
  html += '<span class="pill">Marge: ' + escapeHtml(hasDecision ? productAiProfitLabel(profitVerdictLabel) : 'offen') + '</span>';
  html += '</div>';
  html += '<div class="ai-mini-grid">';
  html += '<div class="ai-mini-item"><span class="ai-mini-label">Risikostufe</span><span class="ai-mini-value">' + escapeHtml(hasDecision ? productAiRiskLabel(decision.riskLevel) : 'offen') + '</span></div>';
  html += '<div class="ai-mini-item"><span class="ai-mini-label">Freigabe</span><span class="ai-mini-value">' + (hasDecision && decision.publishReady ? 'Ja' : 'Nein') + '</span></div>';
  html += '<div class="ai-mini-item"><span class="ai-mini-label">Wichtigste Warnung</span><span class="ai-mini-value">' + escapeHtml(warning) + '</span></div>';
  html += '<div class="ai-mini-item"><span class="ai-mini-label">Nächster Schritt</span><span class="ai-mini-value">' + escapeHtml(nextStep) + '</span></div>';
  html += '</div>';
  html += '<div class="ai-mini-summary">';
  html += '<p><span class="ai-mini-label">Kurzfassung</span><span class="ai-mini-value">' + escapeHtml(summary) + '</span></p>';
  html += '</div>';
  html += lowScoreHint;
  html += aiHint;
  html += '</div>';
  return html;
}

function showProductAiNotice(message){
  if(typeof toast === 'function'){
    toast(message);
  }else{
    alert(message);
  }
}

function bindProductAiDelegation(){
  if(productAiDelegationBound) return;
  productAiDelegationBound = true;
  document.addEventListener('click', function(event){
    const target = event && event.target;
    const button = target && target.closest ? target.closest('[data-product-ai-action="check"], button[id^="productAiBtn_"]') : null;
    if(!button) return;
    event.preventDefault();
    event.stopPropagation();
    if(event.stopImmediatePropagation) event.stopImmediatePropagation();
    const fallbackId = String(button.id || '').replace(/^productAiBtn_/, '');
    triggerProductDecision(button.getAttribute('data-product-id') || fallbackId || '');
  }, true);
}

async function executeProductDecisionTask(productId){
  const productKey = String(productId || '');
  if(!isAiFeatureEnabled()){
    showProductAiNotice('KI-Funktionen sind deaktiviert oder OpenAI-Tools sind aus. Bitte aktiviere sie zuerst.');
    return;
  }

  const product = products.find(function(item){ return String(item.id) === productKey; });
  if(!product){
    showProductAiNotice('Produkt nicht gefunden.');
    return;
  }

  if(runningProductAiIds.has(productKey)){
    showProductAiNotice('KI-Prüfung läuft bereits. Bitte kurz warten.');
    return;
  }

  runningProductAiIds.add(productKey);
  setProductAiButtonState(productKey, true);
  showProductAiNotice('KI-Prüfung gestartet. Einen Moment bitte...');
  const cardId = getProductAiUiId('productAiCard', productKey);
  setHTML(cardId, '<div class="ai-product-card"><div class="score-top"><span class="status ai-status-ghost">KI prüft...</span><span class="score-number">…</span></div><div class="progress"><div class="bar" style="width:24%"></div></div><div class="ai-compact-note">Die Prüfung läuft gerade über /api/ai-router mit task=product_decision.</div></div>');

  try{
    const productPayload = buildProductDecisionPayload(product).product;
    const response = await requestCentralAi('product_decision', buildProductDecisionPrompt(product), {
      context: { product: productPayload },
    });
    const normalized = normalizeProductAiDecisionResponse(response);
    const savedAt = new Date().toISOString();
    products = products.map(function(item){
      if(String(item.id) !== productKey) return item;
      return normalizeProductRecord({
        ...item,
        aiDecision: {
          ...normalized,
          savedAt,
          source: 'api/ai-router',
          task: 'product_decision',
        },
        ai: {
          ...normalized,
          savedAt,
          source: 'api/ai-router',
          task: 'product_decision',
        },
        aiDecisionAt: savedAt,
        updatedAt: savedAt,
        updated: new Date().toLocaleDateString('de-DE'),
      });
    });
    save();
    showProductAiNotice('KI Produktprüfung gespeichert: ' + normalized.decision + ' · Score ' + normalized.score + '/100');
  }catch(err){
    const message = err && err.message ? err.message : 'KI Produktprüfung fehlgeschlagen.';
    showProductAiNotice(message);
  }finally{
    runningProductAiIds.delete(productKey);
    setProductAiButtonState(productKey, false);
    render();
  }
}

function triggerProductDecision(productId){
  executeProductDecisionTask(productId);
}

function browserImportField(label, value){
  const text = String(value || '').trim();
  if(!text) return '';
  return '<div class="browser-import-field"><small>' + escapeHtml(label) + '</small><strong>' + escapeHtml(text) + '</strong></div>';
}
function renderBrowserProductImportPanel(p){
  if(!p.sourceOnlineTitle && !p.sourceOnlineImage && !p.sourceOnlineDescription && !p.sourceOnlinePrice && !p.sourceOnlineCategory && !p.sourceOnlineShipping) return '';
  const importImages = parseJsonArrayField(p.sourceOnlineImages);
  const image = String(p.sourceOnlineImage || importImages[0] || '').trim();
  const imageHtml = image
    ? '<img class="browser-product-image" src="' + escapeHtml(image) + '" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">'
    : '<div class="empty browser-product-image-fallback">Kein Bild</div>';
  const price = [p.sourceOnlinePrice, p.sourceOnlineCurrency].filter(Boolean).join(' ');
  const fields = [
    browserImportField('Preis', price),
    browserImportField('Verfügbarkeit', cleanAvailabilityText(p.sourceOnlineAvailability)),
    browserImportField('Versand', p.sourceOnlineShipping),
    browserImportField('Kategorie', p.sourceOnlineCategory),
    browserImportField('Rating', p.sourceOnlineRating),
    browserImportField('Bewertungen', p.sourceOnlineReviews),
    browserImportField('Verkäufe', p.sourceOnlineSold),
    browserImportField('Geprüft', p.sourceOnlineCheckedAt)
  ].filter(Boolean).join('');
  let html = '<div class="browser-import-panel">';
  html += '<div class="browser-product-head">' + imageHtml + '<div class="browser-product-main">';
  html += '<h3 style="margin:0 0 8px">Browser Import</h3>';
  html += '<div class="product-title browser-product-title">' + escapeHtml(p.sourceOnlineTitle || p.name || 'Importiertes Produkt') + '</div>';
  if(p.supplierLink) html += '<a class="browser-product-url" href="' + escapeHtml(p.supplierLink) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(p.supplierLink) + '</a>';
  html += '<div class="browser-import-grid">' + fields + '</div>';
  html += '</div></div>';
  if(p.sourceOnlineDescription) html += '<details class="output-box browser-import-description"><summary>Artikelbeschreibung anzeigen</summary><p>' + escapeHtml(p.sourceOnlineDescription) + '</p></details>';
  if(importImages.length > 1) html += '<div class="browser-import-gallery" style="margin-top:12px">' + importImages.slice(1,7).map(src => '<img src="' + escapeHtml(src) + '" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()" style="width:52px;height:52px;object-fit:cover;border-radius:12px;border:1px solid rgba(255,255,255,.12)">').join('') + '</div>';
  html += '</div>';
  return html;
}

function renderProductAiTinyBadge(product){
  const hasDecision = hasProductAiDecision(product);
  const decision = getProductAiDecision(product);
  const label = hasDecision ? productAiDecisionLabel(decision.decision) : 'KI ungeprüft';
  const cls = hasDecision ? productAiDecisionStatusClass(decision.decision) : 'ai-status-ghost';
  const score = hasDecision ? ' · ' + decision.score + '/100' : '';
  const title = hasDecision
    ? 'KI-Prüfung gespeichert'
    : (isAiFeatureEnabled() ? 'Noch nicht geprüft. Klicke auf KI prüfen.' : 'KI-Funktionen sind deaktiviert.');
  return '<span class="status ' + cls + '" title="' + escapeHtml(title) + '">' + escapeHtml(label + score) + '</span>';
}

function productCardHTML(p,small=false){
  const c = calcProduct(p);
  const s = statusFromScore(c.score);
  const ebayReady = c.score >= 65;
  const health = productHealth(p);
  const lifecycle = productStatusMeta(p.productStatus || p.status || 'Draft');
  const ss = getSalesStatsForProduct(p.id);
  const rs = getReturnStatsForProduct(p.id);
  const net = ss.profit - rs.loss;
  const isBrowserImport = p.sourceType === 'chrome_extension' || p.sourceProvider === 'browser-import';
  const cardClass = (small ? 'product-card small-card' : 'product-card') + (isBrowserImport ? ' browser-product-card' : '');
  const shopifyText = p.shopifyCandidate ? 'Shopify entfernen' : 'Für Shopify merken';
  const shopifyInfo = p.shopifyCandidate ? ' · Shopify-Kandidat seit ' + (p.shopifyMarkedAt || 'markiert') : '';
  let detailHtml = '';
  detailHtml += '<details class="details-box">';
  detailHtml += '<summary>Details anzeigen</summary>';
  detailHtml += '<div class="pill-row">' + returnPillsForProduct(p,c) + '</div>';
  if(p.sourceProvider || p.sourceRisk || p.sourceType || p.sourceDomain){
    detailHtml += '<div class="output-box"><h3>Produktbeschaffung</h3><p>Quelle: ' + escapeHtml(p.sourceProvider || p.supplierId || 'offen') + '\nTyp: ' + escapeHtml(p.sourceType || 'offen') + '\nRisiko: ' + escapeHtml(p.sourceRisk || 'offen') + '\nDomain: ' + escapeHtml(p.sourceDomain || 'offen') + '\nAnalyse: ' + escapeHtml(p.sourceAnalysisStatus || 'offen') + (p.sourceNote ? '\nHinweis: ' + escapeHtml(p.sourceNote) : '') + '</p></div>';
  }
  detailHtml += renderBrowserProductImportPanel(p);
  detailHtml += '<div class="output-box"><h3>SEO-Titel</h3><p>' + seoTitle(p.name) + '</p></div>';
  if(p.supplierLink){
    detailHtml += '<div class="output-box"><h3>Lieferanten-Link</h3><p>' + p.supplierLink + '</p></div>';
  }
  if(p.notes){
    detailHtml += '<div class="output-box"><h3>Notizen</h3><p>' + p.notes + '</p></div>';
  }
  detailHtml += '</details>';

  let html = '';
  html += '<article class="' + cardClass + '">';
  html += '<div class="' + (isBrowserImport ? 'browser-product-main' : '') + '">';
  if(isBrowserImport && (p.sourceOnlineImage || parseJsonArrayField(p.sourceOnlineImages)[0])){
    const thumb = p.sourceOnlineImage || parseJsonArrayField(p.sourceOnlineImages)[0];
    html += '<div class="browser-product-head" style="margin-bottom:12px"><img class="browser-product-image" src="' + escapeHtml(thumb) + '" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()"><div>';
    html += '<div class="product-title browser-product-title">' + escapeHtml((p.priority || 'Normal') + ' · ' + p.name) + '</div>';
    html += '<div class="muted">Importiertes Produkt aus der Browser Extension</div></div></div>';
  }else{
    html += '<div class="product-title">' + escapeHtml((p.priority || 'Normal') + ' · ' + p.name) + '</div>';
  }
  html += '<div class="muted">Status: ' + escapeHtml(lifecycle.label) + ' · Erstellt: ' + (p.created || '') + ' · ' + s.text + shopifyInfo + '</div>';
  html += '<div class="pill-row"><span class="status ' + lifecycle.cls + '">' + escapeHtml(lifecycle.label) + '</span>' + returnCompactPillsForProduct(p,c) + '<span class="pill">Netto: ' + euro(net) + '</span><span class="status '+health.cls+'">'+health.label+'</span>' + (p.sourceProvider ? '<span class="pill">Quelle: ' + escapeHtml(p.sourceProvider) + '</span>' : '') + (p.sourceRisk ? '<span class="status ' + riskClass(p.sourceRisk) + '">Supplier: ' + escapeHtml(p.sourceRisk) + '</span>' : '') + '</div>';
  html += renderProductAiMiniCard(p);
  html += detailHtml;
  html += '</div>';
  html += '<div class="score-wrap ' + (isBrowserImport ? 'browser-product-side' : '') + '">';
  html += '<div class="score-top"><span class="status ' + s.cls + '">' + s.label + '</span><span class="score-number">' + c.score + '</span></div>';
  html += '<div class="progress"><div class="bar" style="width:' + c.score + '%"></div></div>';
  html += '<div class="muted" style="margin-top:8px">Score von 100</div>';
  html += '<div class="muted" style="margin-top:8px">Gesundheit: '+health.score+'/100 · '+health.text+'</div>';
  if(ebayReady){
    html += '<button style="margin-top:12px;width:100%" onclick="prepareProductForEbayDraft(\'' + escapeHtml(String(p.id)) + '\')">Zu eBay Listing</button>';
  }else{
    html += '<div class="muted" style="margin-top:12px">eBay-Verbindung wird ab Score 65 hervorgehoben.</div>';
  }
  html += '</div>';
  html += '<div class="actions">';
  html += '<button class="secondary" id="' + getProductAiUiId('productAiBtn', p.id) + '" onclick="triggerProductDecision(' + JSON.stringify(String(p.id)) + ')">KI prüfen</button>';
  html += '<button class="' + (ebayReady ? '' : 'secondary') + '" onclick="prepareProductForEbayDraft(\'' + escapeHtml(String(p.id)) + '\')">' + (ebayReady ? 'eBay Listing vorbereiten' : 'Für eBay vorbereiten') + '</button>';
  html += '<button class="secondary" onclick="editProduct(' + p.id + ')">Bearbeiten</button>';
  html += '<button class="secondary" onclick="toggleShopifyCandidate(' + p.id + ')">' + shopifyText + '</button>';
  html += '<button class="secondary" onclick="duplicateProduct(' + p.id + ')">Duplizieren</button>';
  html += '<button class="secondary" onclick="productDecisionReport(' + p.id + ')">📄 Bericht erstellen</button>';
  html += '<button class="danger" onclick="stopProduct(' + p.id + ')">Archivieren</button>';
  html += '<button class="danger" onclick="removeProduct(' + p.id + ')">Löschen</button>';
  html += '</div>';
  html += '</article>';
  return html;
}
function kanbanProductCardHTML(p){
  const c = calcProduct(p);
  const lifecycle = productStatusMeta(p.productStatus || p.status || 'Draft');
  const isBrowserImport = p.sourceType === 'chrome_extension' || p.sourceProvider === 'browser-import';
  if(!isBrowserImport) return productCardHTML(p,true);
  const images = parseJsonArrayField(p.sourceOnlineImages);
  const thumb = String(p.sourceOnlineImage || images[0] || '').trim();
  const price = [p.sourceOnlinePrice, p.sourceOnlineCurrency].filter(Boolean).join(' ') || (p.buy ? euro(p.buy) : '');
  let html = '<article class="kanban-mini-card">';
  html += thumb
    ? '<img src="' + escapeHtml(thumb) + '" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">'
    : '<div class="empty" style="width:76px;min-height:76px;padding:8px">Kein Bild</div>';
  html += '<div class="kanban-mini-body">';
  html += '<div class="kanban-mini-title">' + escapeHtml(p.name || 'Browser Import') + '</div>';
  html += '<div class="kanban-mini-meta"><span>' + escapeHtml(price || 'Preis offen') + '</span><span>Score ' + c.score + '</span></div>';
  html += '<div class="pill-row"><span class="status ' + lifecycle.cls + '">' + escapeHtml(lifecycle.label) + '</span>' + renderProductAiTinyBadge(p) + '<span class="pill">' + escapeHtml(p.sourceProvider || 'browser-import') + '</span></div>';
  html += '</div>';
  html += '<div class="kanban-mini-actions">';
  html += '<button class="secondary" onclick="prepareProductForEbayDraft(\'' + escapeHtml(String(p.id)) + '\')">eBay</button>';
  html += '<button class="secondary" onclick="editProduct(' + p.id + ')">Bearbeiten</button>';
  html += '<button class="secondary" id="' + getProductAiUiId('productAiBtn', p.id) + '" onclick="triggerProductDecision(' + JSON.stringify(String(p.id)) + ')">KI prüfen</button>';
  html += '<button class="secondary" onclick="toggleProductView()">Liste</button>';
  html += '<button class="danger" onclick="removeProduct(' + p.id + ')">Löschen</button>';
  html += '</div>';
  html += '</article>';
  return html;
}
let productViewMode = localStorage.getItem('elyonProductViewMode') || 'list';
function dashboardProductScore(p){
  const c = calcProduct(p);
  const ss = getSalesStatsForProduct(p.id);
  const rs = getReturnStatsForProduct(p.id);
  const net = ss.profit - rs.loss;
  return c.score + Math.min(25, ss.count * 5) + Math.min(20, Math.max(0, net)) - Math.min(25, rs.loss);
}
function parseDEDate(value){
  if(!value) return null;
  const parts = String(value).split('.');
  if(parts.length < 3) return null;
  const day = parseInt(parts[0],10);
  const month = parseInt(parts[1],10)-1;
  const year = parseInt(parts[2],10);
  const date = new Date(year,month,day);
  return isNaN(date.getTime()) ? null : date;
}
function isWithinLastDays(value,days){
  const date = parseDEDate(value);
  if(!date) return false;
  const now = new Date();
  const start = new Date(now.getFullYear(),now.getMonth(),now.getDate()-days+1);
  return date >= start;
}
function renderWeeklyReport(){
  const weekProducts = products.filter(p=>isWithinLastDays(p.created,7));
  const weekSales = sales.filter(s=>isWithinLastDays(s.created,7));
  const weekReturns = returns.filter(r=>isWithinLastDays(r.created,7));
  const weekShopifyReturns = shopifyReturns.filter(r=>isWithinLastDays(r.created,7));
  const allWeekReturns = weekReturns.concat(weekShopifyReturns);
  const weekRevenue = weekSales.reduce((sum,s)=>sum+(+s.price||0)*(+s.qty||1),0);
  const weekSalesProfit = weekSales.reduce((sum,s)=>sum+(+s.profit||0),0);
  const weekReturnLoss = allWeekReturns.reduce((sum,r)=>sum+(+r.loss||0),0);
  const weekNet = weekSalesProfit - weekReturnLoss;
  const weekGo = weekProducts.filter(p=>calcProduct(p).score>=65).length;
  const weekOpenReturns = allWeekReturns.filter(r=>!isReturnClosed(r.status)).length;
  const cls = weekNet > 0 ? 'good' : weekNet < 0 ? 'bad' : 'warn';
  let focus = 'Diese Woche ruhig weiter Daten sammeln: 1 Produkt prüfen, 1 Listing verbessern, Backup exportieren.';
  if(weekProducts.length===0) focus = 'Diese Woche: mindestens 1 neues Produkt sauber prüfen und kalkulieren.';
  if(weekGo>0 && weekSales.length===0) focus = 'Listing-Kandidat vorhanden: Listing vorbereiten, aber klein und kontrolliert testen.';
  if(weekOpenReturns>0) focus = 'Offene Retouren zuerst klären, bevor du neue Produkte aggressiver testest.';
  if(weekNet<0) focus = 'Netto negativ: Kosten, Retouren und Produktqualität prüfen.';

  let html='';
  html += '<div class="dashboard">';
  html += '<div class="metric"><small>Neue Produkte</small><strong>'+weekProducts.length+'</strong></div>';
  html += '<div class="metric"><small>Listing-Kandidaten</small><strong>'+weekGo+'</strong></div>';
  html += '<div class="metric"><small>Verkäufe</small><strong>'+weekSales.length+'</strong></div>';
  html += '<div class="metric"><small>Netto</small><strong>'+euro(weekNet)+'</strong></div>';
  html += '</div>';
  html += '<div class="dashboard">';
  html += '<div class="metric"><small>Umsatz</small><strong>'+euro(weekRevenue)+'</strong></div>';
  html += '<div class="metric"><small>Sales-Gewinn</small><strong>'+euro(weekSalesProfit)+'</strong></div>';
  html += '<div class="metric"><small>Retouren</small><strong>'+allWeekReturns.length+'</strong></div>';
  html += '<div class="metric"><small>Retourenverlust</small><strong>'+euro(weekReturnLoss)+'</strong></div>';
  html += '</div>';
  html += '<div class="output-box"><h3>Wochenfazit</h3><p><span class="status '+cls+'">Netto diese Woche: '+euro(weekNet)+'</span></p><p>'+focus+'</p></div>';
  setHTML('weeklyReport',html);
}
function productDataIssues(p){
  const issues=[];
  if(!String(p.sku||'').trim()) issues.push('SKU fehlt');
  if(!String(p.supplierLink||'').trim()) issues.push('Lieferanten-Link fehlt');
  if((+p.buy||0)<=0) issues.push('EK fehlt');
  if((+p.sell||0)<=0) issues.push('VK fehlt');
  if((+p.delivery||0)<=0) issues.push('Lieferzeit fehlt');
  if(!String(p.sourceProvider||p.supplierId||'').trim()) issues.push('Quelle/Supplier fehlt');
  if(String(p.sourceRisk||'').toLowerCase().includes('hoch')) issues.push('Supplier-Risiko hoch');
  return issues;
}
function duplicateSkuList(){
  const map={};
  products.forEach(p=>{
    const sku=String(p.sku||'').trim().toUpperCase();
    if(!sku) return;
    if(!map[sku]) map[sku]=[];
    map[sku].push(p.name||'Unbenannt');
  });
  return Object.entries(map).filter(([,names])=>names.length>1).map(([sku,names])=>({sku,names}));
}
function getDraftFocusRecords(){
  const productDrafts = products.filter(function(p){
    const status = normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft');
    return ['Recherche','Draft','SEO prüfen'].includes(status);
  }).map(function(p){
    return {type:'product', data:p};
  });
  const rawDraft = latestEbayListingDraft || loadStoredEbayListingDraft();
  if(rawDraft){
    const storedDraft = normalizeEbayListingDraftRecord(rawDraft);
    const hasDraftContent = !!(storedDraft.briefing || storedDraft.draft || storedDraft.generated);
    if(hasDraftContent || storedDraft.savedAt || storedDraft.updatedAt){
      productDrafts.push({type:'draft', data:storedDraft});
    }
  }
  return productDrafts;
}
function getFocusRecordFields(record){
  if(!record) return {};
  if(record.type === 'draft'){
    const d = record.data || {};
    return {
      title: String(d.draft?.title || d.generated?.title || '').trim(),
      description: String(d.draft?.description || d.generated?.description || '').trim(),
      mainKeyword: String(d.briefing?.mainKeyword || '').trim(),
      features: String(d.briefing?.feature || '').trim(),
      audience: String(d.briefing?.use || '').trim(),
      price: Number(d.briefing?.price || d.price || d.sell || 0) || 0,
      margin: Number(d.briefing?.margin || d.margin || d.targetProfit || 0) || 0,
      supplierLink: String(d.briefing?.supplierLink || d.supplierLink || '').trim(),
      deliveryTime: Number(d.briefing?.deliveryTime || d.delivery || 0) || 0,
      status: normalizeProductStatus(d.productStatus || d.status || 'Draft', 'Draft'),
    };
  }
  const p = record.data || record;
  return {
    title: String(p.listingTitle || p.title || p.name || '').trim(),
    description: String(p.listingDescription || p.description || p.notes || '').trim(),
    mainKeyword: String(p.mainKeyword || p.keyword || p.gMainKeyword || '').trim(),
    features: String(p.features || p.feature || p.gFeature || p.notes || '').trim(),
    audience: String(p.audience || p.use || p.gUse || '').trim(),
    price: Number(p.sell || p.price || 0) || 0,
    margin: Number(p.targetProfit || p.margin || p.listingMargin || 0) || 0,
    supplierLink: String(p.supplierLink || '').trim(),
    deliveryTime: Number(p.delivery || p.deliveryTime || 0) || 0,
    status: normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft'),
  };
}
function getTodayFocusData(){
  const draftRecords = getDraftFocusRecords();
  let missingTitle = 0;
  let missingDescription = 0;
  let missingKeyword = 0;
  draftRecords.forEach(function(record){
    const fields = getFocusRecordFields(record);
    if(!fields.title || fields.title.length < 25) missingTitle++;
    if(!fields.description || fields.description.length < 180) missingDescription++;
    if(!fields.mainKeyword) missingKeyword++;
  });
  const seoCheckCount = products.filter(function(p){
    return normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft') === 'SEO prüfen';
  }).length + (latestEbayListingDraft && normalizeProductStatus(latestEbayListingDraft.productStatus || latestEbayListingDraft.status || 'Draft', 'Draft') === 'SEO prüfen' ? 1 : 0);
  const ebayReadyCount = products.filter(function(p){
    return normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft') === 'eBay Ready';
  }).length + (latestEbayListingDraft && normalizeProductStatus(latestEbayListingDraft.productStatus || latestEbayListingDraft.status || 'Draft', 'Draft') === 'eBay Ready' ? 1 : 0);
  const problemCount = products.filter(function(p){
    return normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft') === 'Archiviert';
  }).length + (latestEbayListingDraft && normalizeProductStatus(latestEbayListingDraft.productStatus || latestEbayListingDraft.status || 'Draft', 'Draft') === 'Archiviert' ? 1 : 0);
  const trackingMissingCount = sales.filter(function(s){
    const ship = String(s.shippingStatus || 'Noch nicht versendet');
    return ship !== 'Zugestellt' && ship !== 'Storniert' && (ship !== 'Versendet' || !String(s.trackingNo || '').trim());
  }).length + pendingEbayOrdersImport.filter(function(s){
    const ship = String(s.shippingStatus || 'Noch nicht versendet');
    return ship !== 'Zugestellt' && ship !== 'Storniert' && (ship !== 'Versendet' || !String(s.trackingNo || '').trim());
  }).length;
  return {
    draftCount: draftRecords.length,
    missingTitle,
    missingDescription,
    missingKeyword,
    seoCheckCount,
    ebayReadyCount,
    trackingMissingCount,
    problemCount,
  };
}
function getSmartDailyFocus(){
  const stats = getTodayFocusData();
  if(stats.problemCount > 0) return 'Heute zuerst: ' + stats.problemCount + ' Produkt(e) mit Status Archiviert prüfen.';
  if(stats.missingKeyword > 0) return 'Heute zuerst: ' + stats.missingKeyword + ' Draft(s) brauchen noch ein Hauptkeyword.';
  if(stats.missingTitle > 0) return 'Heute: ' + stats.missingTitle + ' Draft(s) haben noch keinen sauberen Titel.';
  if(stats.missingDescription > 0) return 'Heute: ' + stats.missingDescription + ' Draft(s) brauchen noch eine Beschreibung.';
  if(stats.seoCheckCount > 0) return 'Heute: ' + stats.seoCheckCount + ' Produkt(e) auf SEO prüfen.';
  if(stats.ebayReadyCount > 0) return 'Heute: ' + stats.ebayReadyCount + ' Produkt(e) als eBay Ready behandeln.';
  if(stats.trackingMissingCount > 0) return 'Heute: ' + stats.trackingMissingCount + ' Bestellung(en) ohne Trackingnummer prüfen.';
  const openReturnCount = returns.filter(function(r){ return !isReturnClosed(r.status); }).length + shopifyReturns.filter(function(r){ return !isReturnClosed(r.status); }).length;
  const duplicates = duplicateSkuList();
  const missingSku = products.filter(function(p){ return !String(p.sku || '').trim(); }).length;
  const incomplete = products.filter(function(p){ return productDataIssues(p).length > 0; }).length;
  const goProducts = products.filter(function(p){ return calcProduct(p).score >= 65; });
  const goWithoutSales = goProducts.filter(function(p){ return getSalesStatsForProduct(p.id).count === 0; }).length;

  if(products.length === 0) return 'Heute: 1 neues Produkt vollständig prüfen und sauber kalkulieren.';
  if(openReturnCount > 0) return 'Heute zuerst: ' + openReturnCount + ' offene Retoure(n) klären. Danach Versand und Rechnungen prüfen.';
  if(duplicates.length > 0) return 'Heute: doppelte SKU prüfen: ' + duplicates[0].sku + '.';
  if(missingSku > 0) return 'Heute: SKU bei ' + missingSku + ' Produkt(en) ergänzen.';
  if(incomplete > 0) return 'Heute: Stammdaten bei ' + incomplete + ' Produkt(en) vervollständigen.';
  if(goWithoutSales > 0) return 'Heute: 1 Listing-Kandidat sauber fürs eBay-Listing vorbereiten.';
  if(goProducts.length === 0) return 'Heute: 1 neues Produkt suchen, bis ein klarer Listing-Kandidat entsteht.';
  return 'Heute: ruhig weiterarbeiten - 1 Produkt prüfen, 1 Listing verbessern, dann ein frisches Backup exportieren.';
}
function renderTodayFocusDashboard(){
  const box = $('dailyChecklist');
  if(!box) return;
  const stats = getTodayFocusData();
  const summary = getSmartDailyFocus();
  const todayHtml =
    '<div class="dashboard">' +
      '<div class="metric"><small>Drafts ohne Titel</small><strong>' + stats.missingTitle + '</strong></div>' +
      '<div class="metric"><small>Drafts ohne Beschreibung</small><strong>' + stats.missingDescription + '</strong></div>' +
      '<div class="metric"><small>Drafts ohne Hauptkeyword</small><strong>' + stats.missingKeyword + '</strong></div>' +
      '<div class="metric"><small>Orders ohne Tracking</small><strong>' + stats.trackingMissingCount + '</strong></div>' +
    '</div>' +
    '<div class="dashboard" style="margin-top:12px">' +
      '<div class="metric"><small>🔎 SEO prüfen</small><strong>' + stats.seoCheckCount + '</strong></div>' +
      '<div class="metric"><small>✅ eBay Ready</small><strong>' + stats.ebayReadyCount + '</strong></div>' +
      '<div class="metric"><small>🗂️ Archiviert</small><strong>' + stats.problemCount + '</strong></div>' +
      '<div class="metric"><small>Aktive Drafts</small><strong>' + stats.draftCount + '</strong></div>' +
    '</div>' +
    '<div class="output-box" style="margin-top:14px"><h3>Fokus</h3><p>' + escapeHtml(summary) + '</p></div>';
  box.innerHTML = todayHtml;
}

function parseAnyDate(value){
  if(!value) return null;
  if(value instanceof Date && !isNaN(value.getTime())) return value;
  const text = String(value).trim();
  const dotParts = text.split('.');
  if(dotParts.length === 3){
    const day = Number(dotParts[0]);
    const month = Number(dotParts[1]) - 1;
    const year = Number(dotParts[2]);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }
  const isoParts = text.slice(0,10).split('-');
  if(isoParts.length === 3){
    const year = Number(isoParts[0]);
    const month = Number(isoParts[1]) - 1;
    const day = Number(isoParts[2]);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(text);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function isWithinCurrentMonth(value){
  const date = parseAnyDate(value);
  if(!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function currentMonthLabel(){
  return new Date().toLocaleDateString('de-DE', {month:'long', year:'numeric'});
}
function buildMonthlyReportData(){
  const monthSales = sales.filter(function(s){ return isWithinCurrentMonth(s.created); });
  const monthReturns = returns.filter(function(r){ return isWithinCurrentMonth(r.created); });
  const monthShopifyReturns = shopifyReturns.filter(function(r){ return isWithinCurrentMonth(r.created); });
  const allReturns = monthReturns.concat(monthShopifyReturns);
  const monthInvoices = invoices.filter(function(inv){ return isWithinCurrentMonth(inv.date); });
  const revenue = monthSales.reduce(function(sum,s){ return sum + ((+s.price||0) * (+s.qty||1)); },0);
  const goodsCost = monthSales.reduce(function(sum,s){ return sum + ((+s.cost||0) * (+s.qty||1)); },0);
  const platformFees = monthSales.reduce(function(sum,s){ return sum + ((+s.fees||0) * (+s.qty||1)); },0);
  const documentedExpenses = goodsCost + platformFees;
  const salesProfit = monthSales.reduce(function(sum,s){ return sum + (+s.profit||0); },0);
  const returnLoss = allReturns.reduce(function(sum,r){ return sum + (+r.loss||0); },0);
  const internalResult = salesProfit - returnLoss;
  const openOrders = monthSales.filter(function(s){ return !['Abgeschlossen','Storniert'].includes(s.status||'Bezahlt'); }).length;
  const missingInvoices = monthSales.filter(function(s){ return !findInvoiceBySaleId(s.id); }).length;
  const missingOrderNo = monthSales.filter(function(s){ return !String(s.orderNo||'').trim(); }).length;
  const missingTracking = monthSales.filter(function(s){ return !String(s.trackingNo||'').trim() && !['Storniert','Abgeschlossen'].includes(s.status||''); }).length;
  const openReturns = allReturns.filter(function(r){ return !isReturnClosed(r.status); }).length;
  return {monthSales,monthReturns,monthShopifyReturns,allReturns,monthInvoices,revenue,goodsCost,platformFees,documentedExpenses,salesProfit,returnLoss,internalResult,openOrders,missingInvoices,missingOrderNo,missingTracking,openReturns};
}
function monthlyReportPlainText(){
  const d = buildMonthlyReportData();
  const lines = [];
  lines.push('Monatsbericht Jobcenter / Finanzamt - ' + currentMonthLabel());
  lines.push('');
  lines.push('Hinweis: Arbeitsübersicht aus dem Elyon Seller Tool. Ersetzt keine offizielle EKS, keine EÜR und keine Steuerberatung. Belege/Rechnungen/Kontoauszüge separat aufbewahren.');
  lines.push('');
  lines.push('Zusammenfassung');
  lines.push('Bestellungen: ' + d.monthSales.length);
  lines.push('Betriebseinnahmen / Umsatz: ' + euro(d.revenue));
  lines.push('Wareneinsatz / EK inkl. Versand: ' + euro(d.goodsCost));
  lines.push('Plattform- und Zahlungsgebühren: ' + euro(d.platformFees));
  lines.push('Dokumentierte Betriebsausgaben: ' + euro(d.documentedExpenses));
  lines.push('Retouren/Erstattungen/Kulanz laut Tool: ' + euro(d.returnLoss));
  lines.push('Internes Monatsergebnis: ' + euro(d.internalResult));
  lines.push('Rechnungen: ' + d.monthInvoices.length);
  lines.push('Offene Bestellungen: ' + d.openOrders);
  lines.push('Offene Retouren: ' + d.openReturns);
  lines.push('');
  lines.push('Beleg-Check');
  lines.push('Fehlende Rechnungen: ' + d.missingInvoices);
  lines.push('Fehlende Order-ID: ' + d.missingOrderNo);
  lines.push('Tracking fehlt: ' + d.missingTracking);
  lines.push('');
  lines.push('Bestellliste');
  d.monthSales.forEach(function(s){
    const inv = findInvoiceBySaleId(s.id);
    lines.push((s.created||'') + ' | ' + (s.platform||'eBay') + ' | ' + (s.orderNo||'ohne Order-ID') + ' | ' + (s.product||'') + ' | Umsatz ' + euro((+s.price||0)*(+s.qty||1)) + ' | Kosten ' + euro(((+s.cost||0)+(+s.fees||0))*(+s.qty||1)) + ' | Gewinn ' + euro(+s.profit||0) + ' | Rechnung ' + (inv?inv.number:'fehlt'));
  });
  if(!d.monthSales.length) lines.push('Keine Bestellungen im aktuellen Monat erfasst.');
  return lines.join(String.fromCharCode(10));
}
function renderMonthlyReport(){
  const d = buildMonthlyReportData();
  const cls = d.internalResult > 0 ? 'good' : d.internalResult < 0 ? 'bad' : 'warn';
  const issues = [];
  if(d.missingInvoices>0) issues.push(d.missingInvoices+' Bestellung(en) ohne Rechnung im Tool.');
  if(d.missingOrderNo>0) issues.push(d.missingOrderNo+' Bestellung(en) ohne Order-ID.');
  if(d.missingTracking>0) issues.push(d.missingTracking+' Bestellung(en) ohne Trackingnummer.');
  if(d.openReturns>0) issues.push(d.openReturns+' offene Retoure(n).');
  if(!issues.length) issues.push('Keine akuten Lücken im Tool erkannt. Belege trotzdem separat prüfen.');
  let html='';
  html += '<div class="output-box"><h3>Monat: '+currentMonthLabel()+'</h3><p>Arbeitsübersicht für Jobcenter/Finanzamt. Belege, Kontoauszüge und offizielle Formulare separat aufbewahren/ausfüllen.</p></div>';
  html += '<div class="dashboard">';
  html += '<div class="metric"><small>Bestellungen</small><strong>'+d.monthSales.length+'</strong></div>';
  html += '<div class="metric"><small>Betriebseinnahmen</small><strong>'+euro(d.revenue)+'</strong></div>';
  html += '<div class="metric"><small>Ausgaben dokumentiert</small><strong>'+euro(d.documentedExpenses)+'</strong></div>';
  html += '<div class="metric"><small>Internes Ergebnis</small><strong>'+euro(d.internalResult)+'</strong></div>';
  html += '</div>';
  html += '<div class="dashboard">';
  html += '<div class="metric"><small>Wareneinsatz/EK</small><strong>'+euro(d.goodsCost)+'</strong></div>';
  html += '<div class="metric"><small>Gebühren</small><strong>'+euro(d.platformFees)+'</strong></div>';
  html += '<div class="metric"><small>Retouren/Erstattungen</small><strong>'+euro(d.returnLoss)+'</strong></div>';
  html += '<div class="metric"><small>Rechnungen</small><strong>'+d.monthInvoices.length+'</strong></div>';
  html += '</div>';
  html += '<div class="dashboard">';
  html += '<div class="metric"><small>Offene Bestellungen</small><strong>'+d.openOrders+'</strong></div>';
  html += '<div class="metric"><small>Offene Retouren</small><strong>'+d.openReturns+'</strong></div>';
  html += '<div class="metric"><small>Rechnung fehlt</small><strong>'+d.missingInvoices+'</strong></div>';
  html += '<div class="metric"><small>Order-ID fehlt</small><strong>'+d.missingOrderNo+'</strong></div>';
  html += '</div>';
  html += '<div class="output-box"><h3>Monatsfazit</h3><p><span class="status '+cls+'">Internes Ergebnis: '+euro(d.internalResult)+'</span></p><p>'+issues.join(String.fromCharCode(10))+'</p></div>';
  html += '<div class="output-box"><h3>Beleg- und Konformitäts-Hinweis</h3><ul><li>Für das Jobcenter zählt der Nachweis der tatsächlichen Einnahmen und Ausgaben im relevanten Zeitraum. Dieser Bericht ist eine Arbeitsübersicht, nicht die offizielle EKS.</li><li>Für das Finanzamt dient der Bericht als Vorübersicht für Einnahmen/Ausgaben. Maßgeblich bleiben deine Belege, Rechnungen, Kontoauszüge und die offizielle EÜR/Steuererklärung.</li><li>Als Kleinunternehmer keine Umsatzsteuer ausweisen; Beträge im Tool werden als Bruttowerte geführt.</li></ul></div>';
  html += '<div class="output-box"><h3>Bestellliste im Monat</h3>';
  if(d.monthSales.length){
    html += '<ul>'+d.monthSales.map(function(s){
      const inv=findInvoiceBySaleId(s.id);
      return '<li>'+s.created+' · '+(s.platform||'eBay')+' · '+(s.orderNo||'ohne Order-ID')+' · '+s.product+' · Umsatz '+euro((+s.price||0)*(+s.qty||1))+' · Gewinn '+euro(+s.profit||0)+' · Rechnung: '+(inv?inv.number:'fehlt')+'</li>';
    }).join('')+'</ul>';
  }else{
    html += '<p>Keine Bestellungen im aktuellen Monat erfasst.</p>';
  }
  html += '</div>';
  setHTML('monthlyReport',html);
}
function exportMonthlyReportCSV(){
  const d = buildMonthlyReportData();
  const rows = [
    ['Monatsbericht Jobcenter/Finanzamt', currentMonthLabel()],
    ['Hinweis','Arbeitsuebersicht aus dem Elyon Seller Tool; ersetzt keine offizielle EKS/EUER/Steuerberatung.'],
    [],
    ['Kennzahl','Wert'],
    ['Bestellungen', d.monthSales.length],
    ['Betriebseinnahmen/Umsatz', d.revenue.toFixed(2)],
    ['Wareneinsatz/EK inkl. Versand', d.goodsCost.toFixed(2)],
    ['Plattform-/Zahlungsgebuehren', d.platformFees.toFixed(2)],
    ['Dokumentierte Betriebsausgaben', d.documentedExpenses.toFixed(2)],
    ['Retouren/Erstattungen/Kulanz laut Tool', d.returnLoss.toFixed(2)],
    ['Internes Monatsergebnis', d.internalResult.toFixed(2)],
    ['Rechnungen', d.monthInvoices.length],
    ['Offene Bestellungen', d.openOrders],
    ['Offene Retouren', d.openReturns],
    ['Rechnung fehlt', d.missingInvoices],
    ['Order-ID fehlt', d.missingOrderNo],
    ['Tracking fehlt', d.missingTracking],
    [],
    ['Datum','Plattform','Order-ID','Produkt','Umsatz','EK+Versand','Gebuehren','Gewinn','Rechnung','Status','Versandstatus']
  ];
  d.monthSales.forEach(function(s){
    const inv = findInvoiceBySaleId(s.id);
    rows.push([s.created||'',s.platform||'eBay',s.orderNo||'',s.product||'',((+s.price||0)*(+s.qty||1)).toFixed(2),((+s.cost||0)*(+s.qty||1)).toFixed(2),((+s.fees||0)*(+s.qty||1)).toFixed(2),(+s.profit||0).toFixed(2),inv?inv.number:'',s.status||'',s.shippingStatus||'']);
  });
  downloadCSV(rows,'elyon-monatsbericht-jobcenter-finanzamt.csv');
}
function copyToClipboardSafe(text, successMessage){
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly','readonly');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  area.style.top = '0';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.focus();
  area.select();
  area.setSelectionRange(0, area.value.length);

  let ok = false;
  try{
    ok = document.execCommand('copy');
  }catch(err){
    ok = false;
  }

  document.body.removeChild(area);

  if(ok){
    alert(successMessage || 'Kopiert.');
  }else{
    alert('Kopieren wurde vom Browser blockiert. Nutze bitte stattdessen den Download-Button.');
  }
}
function copyMonthlyReportText(){
  copyToClipboardSafe(monthlyReportPlainText(),'Monatsbericht kopiert.');
}
function buildEKSDraftText(){
  const d = buildMonthlyReportData();
  const line = String.fromCharCode(10);
  const lines = [];
  lines.push('EKS-Entwurf / Monatszusammenfassung fuer das Jobcenter');
  lines.push('Monat: ' + currentMonthLabel());
  lines.push('');
  lines.push('Wichtiger Hinweis:');
  lines.push('Dies ist kein offizielles Jobcenter-Formular und ersetzt nicht die Anlage EKS. Die Angaben muessen anhand von Belegen, Kontoauszuegen und der offiziellen Anlage EKS geprueft und uebertragen werden.');
  lines.push('');
  lines.push('1. Art der Erklaerung');
  lines.push('[ ] vorlaeufige EKS');
  lines.push('[ ] abschliessende EKS');
  lines.push('Bewilligungszeitraum: bitte aus dem Jobcenter-Bescheid uebernehmen.');
  lines.push('');
  lines.push('2. Taetigkeit / Betrieb');
  lines.push('Taetigkeit: Online-Handel / eBay / Dropshipping-Vorbereitung');
  lines.push('Plattformen laut Tool: eBay / Shopify / Manuell je nach Bestellung');
  lines.push('');
  lines.push('3. Betriebseinnahmen im Monat');
  lines.push('Anzahl Bestellungen: ' + d.monthSales.length);
  lines.push('Betriebseinnahmen / Umsatz brutto laut Tool: ' + euro(d.revenue));
  lines.push('Hinweis: Zahlungseingaenge mit Kontoauszug / Plattformabrechnung abgleichen.');
  lines.push('');
  lines.push('4. Betriebsausgaben im Monat');
  lines.push('Wareneinsatz / Einkauf inkl. Versand laut Tool: ' + euro(d.goodsCost));
  lines.push('Plattform- und Zahlungsgebuehren laut Tool: ' + euro(d.platformFees));
  lines.push('Dokumentierte Betriebsausgaben gesamt laut Tool: ' + euro(d.documentedExpenses));
  lines.push('Hinweis: Nur tatsaechlich betriebliche und belegbare Ausgaben uebernehmen.');
  lines.push('');
  lines.push('5. Retouren / Erstattungen / Minderungen');
  lines.push('Retourenverlust / Erstattungen / Kulanz laut Tool: ' + euro(d.returnLoss));
  lines.push('Offene Retouren: ' + d.openReturns);
  lines.push('');
  lines.push('6. Vorlaeufiges internes Ergebnis');
  lines.push('Internes Monatsergebnis laut Tool: ' + euro(d.internalResult));
  lines.push('Rechenweg: Umsatz minus dokumentierte Kosten/Gebuehren minus Retourenverlust.');
  lines.push('');
  lines.push('7. Beleg-Check');
  lines.push('Fehlende Rechnungen im Tool: ' + d.missingInvoices);
  lines.push('Fehlende Order-ID im Tool: ' + d.missingOrderNo);
  lines.push('Fehlendes Tracking im Tool: ' + d.missingTracking);
  lines.push('');
  lines.push('8. Anlagen / Nachweise, die du beilegen oder bereithalten solltest');
  lines.push('[ ] Kontoauszuege Geschaeftskonto / Zahlungseingaenge');
  lines.push('[ ] eBay-Abrechnungen / Zahlungsberichte');
  lines.push('[ ] Einkaufsbelege / Lieferantenrechnungen');
  lines.push('[ ] Gebuehrennachweise');
  lines.push('[ ] Rechnungen aus deinem Tool');
  lines.push('[ ] Retouren- und Erstattungsnachweise');
  lines.push('[ ] Versand-/Trackingnachweise, falls relevant');
  lines.push('');
  lines.push('9. Bestelluebersicht aus dem Tool');
  if(d.monthSales.length){
    d.monthSales.forEach(function(s){
      const inv = findInvoiceBySaleId(s.id);
      lines.push('- ' + (s.created||'') + ' | ' + (s.platform||'eBay') + ' | Order: ' + (s.orderNo||'fehlt') + ' | ' + (s.product||'') + ' | Umsatz: ' + euro((+s.price||0)*(+s.qty||1)) + ' | Kosten+Gebuehren: ' + euro(((+s.cost||0)+(+s.fees||0))*(+s.qty||1)) + ' | Gewinn: ' + euro(+s.profit||0) + ' | Rechnung: ' + (inv?inv.number:'fehlt'));
    });
  }else{
    lines.push('Keine Bestellungen im aktuellen Monat erfasst.');
  }
  lines.push('');
  lines.push('10. Offene Punkte vor Abgabe');
  if(d.missingInvoices>0) lines.push('- Rechnungen im Tool pruefen/erstellen.');
  if(d.missingOrderNo>0) lines.push('- Fehlende Order-IDs nachtragen.');
  if(d.openReturns>0) lines.push('- Offene Retouren klaeren.');
  if(!d.missingInvoices && !d.missingOrderNo && !d.openReturns) lines.push('- Keine akuten Luecken erkannt. Trotzdem Belege pruefen.');
  return lines.join(line);
}
function renderEKSDraft(){
  const text = buildEKSDraftText();
  const safeText = text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  setHTML('eksDraftPreview','<h3>EKS-Entwurf</h3><p>'+safeText+'</p>');
}
function downloadEKSDraft(){
  const text = buildEKSDraftText();
  const blob = new Blob([text],{type:'text/plain;charset=utf-8'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'eks-entwurf-' + new Date().toISOString().slice(0,10) + '.txt';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
function renderDashboardDetails(){
  const totalRevenue = sales.reduce((sum,s)=>sum+(+s.price||0)*(+s.qty||1),0);
  const salesProfit = sales.reduce((sum,s)=>sum+(+s.profit||0),0);
  const returnLoss = returns.reduce((sum,r)=>sum+(+r.loss||0),0);
  const netProfit = salesProfit - returnLoss;
  const openReturns = returns.filter(r=>!['Abgeschlossen','Erstattet'].includes(r.status)).length;

  safe('dRevenue',el=>el.textContent=euro(totalRevenue));
  safe('dSalesProfit',el=>el.textContent=euro(salesProfit));
  safe('dReturnLoss',el=>el.textContent=euro(returnLoss));
  safe('dNetProfit',el=>el.textContent=euro(netProfit));
  safe('dOpenReturns',el=>el.textContent=openReturns);

  const warnings=[];
  const incompleteProducts = products.filter(p=>productDataIssues(p).length>0);
  const missingSkuCount = products.filter(p=>!String(p.sku||'').trim()).length;
  const missingSupplierLinkCount = products.filter(p=>!String(p.supplierLink||'').trim()).length;
  const duplicates = duplicateSkuList();

  if(openReturns>0) warnings.push('Du hast '+openReturns+' offene Retoure(n). Erst klären, bevor du aggressiver testest.');
  if(incompleteProducts.length>0) warnings.push('Daten-Qualität: '+incompleteProducts.length+' Produkt(e) haben unvollständige Stammdaten.');
  if(missingSkuCount>0) warnings.push('SKU fehlt bei '+missingSkuCount+' Produkt(en).');
  if(missingSupplierLinkCount>0) warnings.push('Lieferanten-Link fehlt bei '+missingSupplierLinkCount+' Produkt(en).');
  if(duplicates.length>0) warnings.push('SKU-Duplikat: '+duplicates.map(d=>d.sku+' ('+d.names.length+'x)').join(', ')+'. Bitte prüfen.');
  const backupWarning=backupWarningText();
  if(backupWarning) warnings.push('Backup: '+backupWarning);
  if(returnLoss>0) warnings.push('Retourenverlust bisher: '+euro(returnLoss)+'. Prüfe Produkte mit hohen Rückgaben.');
  if(products.length>0 && sales.length===0) warnings.push('Noch keine echten Verkäufe erfasst. Gewinne sind aktuell noch Theorie.');
  if(products.filter(p=>calcProduct(p).score>=65).length===0 && products.length>0) warnings.push('Noch kein klarer Listing-Kandidat. Weiter prüfen, nicht blind listen.');
  if(netProfit<0) warnings.push('Netto-Gewinn ist negativ. Kosten/Retouren prüfen.');
  setHTML('dWarnings', '<p>'+(warnings.length ? warnings.join(String.fromCharCode(10)) : 'Keine akuten Warnungen. Ruhig weiterarbeiten.')+'</p>');

  if(products.length){
    const top=[...products].sort((a,b)=>dashboardProductScore(b)-dashboardProductScore(a))[0];
    const c=calcProduct(top), ss=getSalesStatsForProduct(top.id), rs=getReturnStatsForProduct(top.id), net=ss.profit-rs.loss, status=statusFromScore(c.score);
    setHTML('dTopProduct','<div class="product-title">'+top.name+'</div><div class="pill-row"><span class="pill">Score: '+c.score+'</span><span class="pill">'+status.label+'</span><span class="pill">Sales: '+ss.count+'</span><span class="pill">Netto: '+euro(net)+'</span><span class="pill">Retouren: '+rs.count+'</span></div><div class="output-box"><h3>Einordnung</h3><p>'+(ss.count?'Echtes Verkaufsfeedback vorhanden.':'Noch kein Verkauf erfasst – erst testen, dann bewerten.')+'</p></div>');
  } else {
    setHTML('dTopProduct','<div class="empty">Noch kein Top-Produkt.</div>');
  }

  const candidates=products.filter(p=>p.shopifyCandidate);
  if(candidates.length){
    setHTML('dShopifyList','<ul>'+candidates.slice(0,6).map(p=>'<li>'+p.name+(p.shopifyMarkedAt?' · seit '+p.shopifyMarkedAt:'')+'</li>').join('')+'</ul>');
  } else {
    setHTML('dShopifyList','<div class="empty">Noch keine Shopify-Kandidaten markiert.</div>');
  }
  renderWeeklyReport();
  renderMonthlyReport();
}
function saveBrowserImports(){
  browserImports = normalizeBrowserImportsCollection(browserImports);
  localStorage.setItem('elyonBrowserImports', JSON.stringify(browserImports));
}
function browserImportDisclosureHTML(title, html){
  if(!html) return '';
  return '<div class="browser-import-section"><button type="button" class="browser-import-section-toggle" data-import-toggle>' + escapeHtml(title) + '</button><div class="browser-import-section-content">' + html + '</div></div>';
}
function toggleBrowserImportSection(button){
  const section = button && button.closest ? button.closest('.browser-import-section') : null;
  if(section) section.classList.toggle('open');
}
function upsertBrowserImportItem(item){
  const nextItem = normalizeBrowserImportRecord(item);
  const existingIndex = browserImports.findIndex(entry => String(entry.url || '') === String(nextItem.url || ''));
  if(existingIndex >= 0){
    browserImports = browserImports.map((entry, index) => index === existingIndex ? {...entry, ...nextItem, updatedAt:new Date().toISOString()} : entry);
    saveBrowserImports();
    return {status:'updated', item: browserImports[existingIndex]};
  }
  browserImports = [nextItem, ...browserImports];
  saveBrowserImports();
  return {status:'saved', item: nextItem};
}
function renderBrowserImports(){
  const box = $('browserImportsList');
  const countEl = $('browserImportsCount');
  const badgeEl = $('browserImportsBadge');
  if(countEl) countEl.textContent = browserImports.length;
  if(badgeEl) badgeEl.textContent = (browserImports.length ? `${browserImports.length} Browser Imports` : 'Noch keine Browser Imports') + ' · Server';
  if(!box) return;
  if(!browserImports.length){
    box.innerHTML = '<div class="empty">Noch keine Browser Imports gespeichert.</div>';
    return;
  }
  box.innerHTML = browserImports.slice(0, 20).map(item => {
    const linked = item.linkedSupplierName || item.linkedSupplierId || '-';
    const imageList = [item.image].concat(Array.isArray(item.images) ? item.images : []).filter(Boolean);
    const mainImage = imageList[0] || '';
    const imageHtml = mainImage ? '<img src="' + escapeHtml(mainImage) + '" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()" style="width:72px;height:72px;object-fit:cover;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(2,6,23,.4)">' : '<div class="empty" style="width:72px;min-height:72px;padding:10px">Kein Bild</div>';
    const shippingText = item.shipping && typeof item.shipping === 'object' ? [item.shipping.cost, item.shipping.deliveryTime, item.shipping.shipsFrom, item.shipping.text].filter(Boolean).join(' · ') : '';
    const availabilityText = String(item.availability || '').slice(0, 180);
    const detailRows = Object.entries(item.productDetails || {}).slice(0,12).map(([key,value]) => '<li><strong>' + escapeHtml(key) + ':</strong> ' + escapeHtml(String(value || '')) + '</li>').join('');
    const variantRows = (item.variants || []).slice(0,12).map(variant => '<span class="pill">' + escapeHtml(typeof variant === 'string' ? variant : (variant.label || variant.name || JSON.stringify(variant))) + '</span>').join('');
    const ai = item.aiPrepared && typeof item.aiPrepared === 'object' ? item.aiPrepared : null;
    const aiBulletRows = ai && Array.isArray(ai.bulletPoints) ? ai.bulletPoints.slice(0,10).map(text => '<li>' + escapeHtml(text) + '</li>').join('') : '';
    const aiDetailRows = ai && ai.technicalDetails && typeof ai.technicalDetails === 'object' ? Object.entries(ai.technicalDetails).slice(0,12).map(([key,value]) => '<li><strong>' + escapeHtml(key) + ':</strong> ' + escapeHtml(String(value || '')) + '</li>').join('') : '';
    const aiWarnings = ai ? (Array.isArray(ai.supplierWarnings) ? ai.supplierWarnings : []).concat(Array.isArray(ai.complianceHints) ? ai.complianceHints : []) : [];
    const aiWarningRows = aiWarnings.slice(0,12).map(text => '<span class="pill bad">' + escapeHtml(text) + '</span>').join('');
    const aiHtml = ai
      ? '<div class="output-box"><h3>KI-Struktur fuer Elyon</h3>' +
          '<p><strong>' + escapeHtml(ai.cleanTitle || item.title || 'KI-Titel offen') + '</strong></p>' +
          (ai.elyonSummary ? '<p>' + escapeHtml(ai.elyonSummary) + '</p>' : '') +
          (ai.cleanDescription ? '<p>' + escapeHtml(ai.cleanDescription) + '</p>' : '') +
          (aiBulletRows ? '<h4>Bulletpoints</h4><ul>' + aiBulletRows + '</ul>' : '') +
          (aiDetailRows ? '<h4>Technische Details</h4><ul>' + aiDetailRows + '</ul>' : '') +
          (aiWarningRows ? '<div class="pill-row">' + aiWarningRows + '</div>' : '') +
          '<p class="muted">Provider: ' + escapeHtml(item.aiProvider || '-') + ' · Modell: ' + escapeHtml(item.aiModel || '-') + ' · Vertrauen: ' + escapeHtml(String(ai.confidence || 0)) + '/100</p>' +
        '</div>'
      : (item.aiStatus ? '<div class="output-box"><h3>KI-Struktur</h3><p class="muted">' + escapeHtml(item.aiStatus === 'not_available' ? 'KI nicht verfuegbar. Originaldaten wurden gespeichert.' : (item.aiError || item.aiStatus)) + '</p></div>' : '');
    const extraRows = [
      item.category ? '<span class="pill">Kategorie: ' + escapeHtml(item.category) + '</span>' : '',
      availabilityText ? '<span class="pill">Verfügbarkeit: ' + escapeHtml(availabilityText) + (String(item.availability || '').length > 180 ? '…' : '') + '</span>' : '',
      item.rating ? '<span class="pill">Rating: ' + escapeHtml(item.rating) + '</span>' : '',
      item.reviewsCount ? '<span class="pill">Bewertungen: ' + escapeHtml(item.reviewsCount) + '</span>' : '',
      item.soldCount ? '<span class="pill">Verkäufe: ' + escapeHtml(item.soldCount) + '</span>' : '',
      shippingText ? '<span class="pill">Versand: ' + escapeHtml(shippingText) + '</span>' : ''
    ].filter(Boolean).join('');
    const complianceRows = (item.complianceRisks || []).map(risk => '<span class="pill bad">' + escapeHtml(risk) + '</span>').join('');
    const galleryRows = imageList.slice(0,6).map(src => '<img src="' + escapeHtml(src) + '" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()" style="width:46px;height:46px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,.12)">').join('');
    return '<div class="product-card small-card browser-import-card" data-browser-import-id="' + escapeHtml(item.id) + '">' +
      '<div class="browser-import-layout">' +
      '<div style="display:flex;gap:14px;align-items:flex-start;min-width:0">' +
        imageHtml +
        '<div class="browser-import-body" style="flex:1">' +
          '<div class="product-title browser-import-title">' + escapeHtml(item.title || 'Unbekanntes Produkt') + '</div>' +
          '<div class="muted browser-import-muted">Preis: ' + escapeHtml([item.price, item.currency].filter(Boolean).join(' ')) + ' · Supplier: ' + escapeHtml(item.supplier || '-') + '</div>' +
          '<div class="muted browser-import-muted">Domain: ' + escapeHtml(item.domain || '-') + '</div>' +
          '<div class="muted browser-import-url">URL: ' + escapeHtml(item.url || '-') + '</div>' +
          (extraRows ? '<div class="pill-row">' + extraRows + '</div>' : '') +
          (complianceRows ? '<div class="pill-row"><span class="pill">Compliance</span>' + complianceRows + '</div>' : '') +
          (galleryRows ? '<div class="browser-import-gallery">' + galleryRows + '</div>' : '') +
          browserImportDisclosureHTML('Varianten anzeigen', variantRows ? '<div class="pill-row">' + variantRows + '</div>' : '') +
          browserImportDisclosureHTML('Produktdetails anzeigen', detailRows ? '<ul>' + detailRows + '</ul>' : '') +
          browserImportDisclosureHTML('KI-Struktur anzeigen', aiHtml) +
          browserImportDisclosureHTML('Artikelbeschreibung anzeigen', item.description ? '<p>' + escapeHtml(item.description) + '</p>' : '') +
          '<div class="pill-row">' +
            '<span class="pill">Import: ' + escapeHtml(item.importedAt || '-') + '</span>' +
            '<span class="pill">Status: ' + escapeHtml(item.status || 'new') + '</span>' +
            '<span class="pill">Linked Supplier: ' + escapeHtml(linked) + '</span>' +
          '</div>' +
        '</div>' +
      '</div></div>' +
      '<div class="actions">' +
        '<button type="button" data-browser-action="board" data-browser-id="' + escapeHtml(item.id) + '">Ins Produktboard übernehmen</button>' +
        '<button type="button" class="secondary" data-browser-action="draft" data-browser-id="' + escapeHtml(item.id) + '">Für eBay vorbereiten</button>' +
        '<button type="button" class="secondary" data-browser-action="link" data-browser-id="' + escapeHtml(item.id) + '">Mit Supplier verknüpfen</button>' +
        '<button type="button" class="secondary" data-browser-action="risk" data-browser-id="' + escapeHtml(item.id) + '">Risiko prüfen</button>' +
        '<button type="button" class="secondary" data-browser-action="margin" data-browser-id="' + escapeHtml(item.id) + '">Marge kalkulieren</button>' +
        '<button type="button" class="danger" data-browser-action="discard" data-browser-id="' + escapeHtml(item.id) + '">Verwerfen</button>' +
      '</div></div>' +
    '</div>';
  }).join('');

  box.querySelectorAll('[data-browser-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-browser-id');
      const action = btn.getAttribute('data-browser-action');
      const item = browserImports.find(entry => String(entry.id) === String(id));
      if(!item) return;

      if(action === 'draft'){
        prepareBrowserImportForEbayDraft(id);
        return;
      }

      if(action === 'board'){
        const itemShippingText = item.shipping && typeof item.shipping === 'object' ? [item.shipping.cost, item.shipping.deliveryTime, item.shipping.shipsFrom, item.shipping.text].filter(Boolean).join(' · ') : '';
        const ai = item.aiPrepared && typeof item.aiPrepared === 'object' ? item.aiPrepared : {};
        const cleanTitle = ai.cleanTitle || item.title || 'Browser Import';
        const cleanDescription = ai.cleanDescription || item.description || '';
        const product = normalizeProductRecord({
          id: Date.now(),
          name: cleanTitle,
          supplier: item.supplier || '',
          supplierId: item.linkedSupplierId || '',
          supplierLink: item.url || '',
          sourceProvider: 'browser-import',
          sourceType: 'chrome_extension',
          sourceDomain: item.domain || '',
          notes: item.notes || '',
          description: cleanDescription,
          sales: item.soldCount || '',
          competition: item.reviewsCount || '',
          delivery: item.shipping?.deliveryTime || '',
          risk: (item.complianceRisks || []).length ? 'high' : 'low',
          productStatus: 'Draft',
          status: 'Draft',
          sourceNote: 'Aus Browser Import uebernommen',
          sourceOnlineTitle: item.title || '',
          sourceOnlinePrice: item.price || '',
          sourceOnlineCurrency: item.currency || '',
          sourceOnlineImage: item.image || '',
          sourceOnlineDescription: item.description || '',
          sourceOnlineAiDescription: cleanDescription,
          sourceOnlineAiSummary: ai.elyonSummary || '',
          sourceOnlineAiPrepared: JSON.stringify(ai || {}),
          sourceOnlineAvailability: cleanAvailabilityText(item.availability || ''),
          sourceOnlineShipping: itemShippingText || '',
          sourceOnlineCategory: item.category || '',
          sourceOnlineRating: item.rating || '',
          sourceOnlineReviews: item.reviewsCount || '',
          sourceOnlineSold: item.soldCount || '',
          sourceOnlineVariants: JSON.stringify(item.variants || []),
          sourceOnlineImages: JSON.stringify(item.images || []),
          sourceOnlineDetails: JSON.stringify(item.productDetails || {}),
          sourceOnlineCompliance: (item.complianceRisks || []).join(', '),
          sourceOnlineCheckedAt: item.importedAt || new Date().toISOString()
        });
        products = [product, ...products.filter(p => String(p.sku || '') !== String(product.sku || '') || String(p.name || '') !== String(product.name || ''))];
        save();
        showTab('productListTab');
        alert('Browser Import ins Produktboard uebernommen.');
        return;
      }

      if(action === 'link'){
        const supplier = (suppliers || []).find(s => String(s.id || '').trim() === String(item.linkedSupplierId || '').trim() || String(s.name || '').trim().toLowerCase() === String(item.supplier || '').trim().toLowerCase());
        const canonical = supplier ? supplier.id || supplier.supplierId || supplier.name : (item.linkedSupplierId || item.supplier || '');
        browserImports = browserImports.map(entry => String(entry.id) === String(id) ? {...entry, linkedSupplierId: canonical, linkedSupplierName: supplier ? (supplier.name || supplier.title || canonical) : (entry.linkedSupplierName || entry.supplier || '')} : entry);
        saveBrowserImports();
        renderBrowserImports();
        alert('Supplier-Verknuepfung vorbereitet.');
        return;
      }

      if(action === 'risk'){
        showTab('productAnalysisTab');
        safe('rName', el => el.value = item.title || '');
        safe('rCost', el => { if(!el.value) el.value = ''; });
        safe('rRisk', el => { if(item.domain.includes('amazon') || item.domain.includes('aliexpress')) el.value = 'medium'; });
        alert('Risiko-Pruefung vorbereitet.');
        return;
      }

      if(action === 'margin'){
        showTab('financeTab');
        safe('fProductName', el => el.value = item.title || '');
        safe('fSupplierName', el => el.value = item.supplier || '');
        alert('Marge-Kalkulation vorbereitet.');
        return;
      }

      if(action === 'discard'){
        if(!confirm('Browser Import wirklich verwerfen?')) return;
        btn.disabled = true;
        try{
          await fetch('/api/extension/import-product', {
            method:'DELETE',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({id:item.id, url:item.url})
          });
        }catch(err){
          console.warn('Browser Import konnte serverseitig nicht geloescht werden', err);
        }
        browserImports = browserImports.filter(entry => String(entry.id) !== String(id));
        saveBrowserImports();
        renderBrowserImports();
        alert('Browser Import verworfen.');
      }
    });
  });
  box.querySelectorAll('[data-import-toggle]').forEach(btn => {
    btn.addEventListener('click', () => toggleBrowserImportSection(btn));
  });
}
async function hydrateBrowserImportsFromBackend(){
  try{
    const response = await fetch('/api/extension/import-product', { method:'GET' });
    if(!response.ok) return;
    const data = await response.json().catch(() => null);
    const items = normalizeBrowserImportsCollection(Array.isArray(data?.items) ? data.items : []);
    browserImportsStorage = data?.storage || browserImportsStorage;
    if(!items.length && browserImports.length){
      renderBrowserImports();
      return;
    }
    browserImports = items;
    saveBrowserImports();
    renderBrowserImports();
  }catch(err){
    console.warn('Browser Imports konnten nicht geladen werden', err);
    renderBrowserImports();
  }
}
function render(){
  const stats = products.map(calcProduct);
  const total = products.length;
  const avg = total ? stats.reduce((s,c)=>s+c.profit,0)/total : 0;
  const best = total ? Math.max(...stats.map(c=>c.score)) : 0;
  const go = stats.filter(c=>c.score>=65).length;
  const shopifyCandidates = products.filter(p=>p.shopifyCandidate).length;

  safe('dTotal',el=>el.textContent=total);
  safe('dAvg',el=>el.textContent=euro(avg));
  safe('dBest',el=>el.textContent=best);
  safe('dGo',el=>el.textContent=go);
  safe('dShopifyCandidates',el=>el.textContent=shopifyCandidates);
  renderDashboardDetails();
  renderBrowserImports();

  const next = getSmartDailyFocus();
  safe('dNext',el=>el.textContent=next);
  renderTodayFocusDashboard();

  safe('totalProducts',el=>el.textContent=total);
  safe('avgProfit',el=>el.textContent=euro(avg));
  safe('bestScore',el=>el.textContent=`${best}/100`);
  safe('goCount',el=>el.textContent=go);
  safe('testCount',el=>el.textContent=stats.filter(c=>c.score>=40&&c.score<65).length);
  safe('noCount',el=>el.textContent=stats.filter(c=>c.score<40).length);

  const list=$('list'); if(!list) return;
  const search=($('search')?.value||'').toLowerCase(), filter=$('filter')?.value||'all', sort=$('sort')?.value||'score';
  let items=[...products].filter(p=>String(p.name || '').toLowerCase().includes(search));
  items=items.filter(p=>{
    const st=statusFromScore(calcProduct(p).score).key;
    const ai = getProductAiDecision(p);
    const hasAi = hasProductAiDecision(p);
    if(filter==='shopify') return !!p.shopifyCandidate;
    if(filter==='winner') return dashboardProductScore(p)>=75;
    if(filter==='kill') return normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft')==='Archiviert';
    if(filter==='ai-unchecked') return !hasAi;
    if(filter==='ai-go') return hasAi && ai.decision==='GO';
    if(filter==='ai-test') return hasAi && ai.decision==='TEST';
    if(filter==='ai-no') return hasAi && ai.decision==='NO';
    if(filter==='ai-compliance') return hasAi && (ai.compliance==='yellow' || ai.compliance==='red');
    return filter==='all'||st===filter;
  });
  items.sort((a,b)=>{const ca=calcProduct(a),cb=calcProduct(b); if(sort==='profit') return cb.profit-ca.profit; if(sort==='name') return (a.name||'').localeCompare(b.name||''); return cb.score-ca.score;});

  if(!items.length){ list.innerHTML='<div class="empty">Noch keine passenden Produkte.</div>'; return; }

  if(productViewMode==='kanban'){
    const baseGroups=['Recherche','Draft','SEO prüfen','eBay Ready','Live','Verkauft','Versand offen','Abgeschlossen','Archiviert'];
    const extraGroups=[...new Set(items.map(p=>normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft')).filter(g=>!baseGroups.includes(g)))];
    const groups=[...baseGroups,...extraGroups];
    const activeGroups = groups.filter(g=>items.some(p=>normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft')===g));
    const emptyGroups = groups.filter(g=>!activeGroups.includes(g));
    const shellClass = 'kanban-shell' + (activeGroups.length === 1 ? ' kanban-single' : '');
    list.innerHTML='<div class="'+shellClass+'"><div class="kanban-board">'+activeGroups.map(g=>{
      const groupItems=items.filter(p=>normalizeProductStatus(p.productStatus || p.status || 'Draft', 'Draft')===g);
      const columnClass = 'kanban-column kanban-column-' + String(g || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return '<div class="'+columnClass+'"><h3><span>'+escapeHtml(g)+'</span><span class="kanban-count">'+groupItems.length+'</span></h3><div class="kanban-column-cards">'+groupItems.map(p=>kanbanProductCardHTML(p)).join('')+'</div></div>';
    }).join('')+'</div>'+(emptyGroups.length?'<div class="kanban-empty-strip"><span class="kanban-empty-pill">Leere Phasen:</span>'+emptyGroups.map(g=>'<span class="kanban-empty-pill">'+escapeHtml(g)+'</span>').join('')+'</div>':'')+'</div>';
  } else {
    list.innerHTML=items.map(p=>productCardHTML(p,false)).join('');
  }
}
function setProductFilter(value){ safe('filter',el=>{el.value=value;}); render(); }
function toggleProductView(){ productViewMode=productViewMode==='list'?'kanban':'list'; localStorage.setItem('elyonProductViewMode',productViewMode); safe('toggleViewBtn',el=>el.textContent=productViewMode==='list'?'Kanban-Ansicht':'Listen-Ansicht'); render(); }
function scrollToProductForm(){ showTab('productSearchTab'); setTimeout(()=>{ const el=$('productFormCard'); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); },60); }
function runResearchCheck(){ const cost=n('rCost'),my=n('rMyPrice'),feePct=n('rFee'),bufPct=n('rBuffer'),low=n('rLow'),avg=n('rAvg'),sellers=n('rSellers'),sold=n('rSold'),delivery=n('rDelivery'),risk=$('rRisk')?.value||'low'; const profit=my-cost-my*(feePct/100)-my*(bufPct/100),breakEven=cost/(1-((feePct+bufPct)/100)); let score=0,reasons=[]; if(profit>=10){score+=28;reasons.push('starker Gewinn nach Gebühren');}else if(profit>=5){score+=18;reasons.push('brauchbarer Gewinn');}else if(profit>0){score+=7;reasons.push('Gewinn knapp');}else reasons.push('Verlust oder fast kein Gewinn'); if(avg&&my<=avg){score+=18;reasons.push('Preis am/unter Durchschnitt');}else if(avg){score+=6;reasons.push('Preis über Durchschnitt');} if(low&&my<=low*1.1){score+=8;reasons.push('nah am günstigsten Anbieter');}else if(low)reasons.push('deutlich teurer als günstigster Anbieter'); if(sold>=50){score+=20;reasons.push('Nachfrage stark');}else if(sold>=15){score+=12;reasons.push('Nachfrage vorhanden');}else reasons.push('Nachfrage schwach/unklar'); if(sellers>0&&sellers<=15){score+=14;reasons.push('Konkurrenz überschaubar');}else if(sellers<=40){score+=8;reasons.push('Konkurrenz mittel');}else reasons.push('viel Konkurrenz'); if(delivery>0&&delivery<=7){score+=8;reasons.push('Lieferzeit stark');}else if(delivery<=14){score+=4;reasons.push('Lieferzeit okay');}else reasons.push('Lieferzeit riskant'); if(risk==='low'){score+=8;reasons.push('Risiko niedrig');}else if(risk==='medium'){score+=3;reasons.push('Risiko mittel');}else{score-=12;reasons.push('hohes Risiko: WEEE/Batt prüfen');} score=Math.max(0,Math.min(100,Math.round(score))); const s=statusFromScore(score); setHTML('researchResult',`<div class="score-top"><span class="status ${s.cls}">${s.label}</span><span class="score-number">${score}/100</span></div><div class="progress"><div class="bar" style="width:${score}%"></div></div><div class="big-result">${euro(profit)}</div><div class="muted">Gewinn nach Gebühren & Puffer</div><div class="dashboard" style="margin-top:16px"><div class="metric"><small>Break-even</small><strong>${euro(breakEven)}</strong></div><div class="metric"><small>Dein Preis</small><strong>${euro(my)}</strong></div><div class="metric"><small>Ø Markt</small><strong>${euro(avg)}</strong></div><div class="metric"><small>Anbieter</small><strong>${sellers}</strong></div></div><div class="output-box"><h3>Warum?</h3><ul>${reasons.map(r=>`<li>${r}</li>`).join('')}</ul></div>`); }
function legalCheck(){ let points=0,w=[]; if($('lBattery')?.checked){points+=25;w.push('Batterie/Akku: BattG/EPR prüfen.');} if($('lElectric')?.checked){points+=30;w.push('Elektrogerät: WEEE/EAR-Pflicht möglich.');} if($('lBrand')?.checked){points+=25;w.push('Marke/Logo: Markenrecht/Designrecht prüfen.');} if($('lCosmetic')?.checked){points+=25;w.push('Kosmetik/Lebensmittel/Medizin/Körperkontakt: hohe Anforderungen.');} if($('lFragile')?.checked){points+=10;w.push('Zerbrechlich/Retouren: mehr Puffer einplanen.');} if($('lPackaging')?.checked){w.push('Verpackung: LUCID/Duales System beachten.');} let cls=points>=50?'bad':points>=20?'warn':'good',label=points>=50?'🔴 Hochriskant':points>=20?'🟡 Prüfen':'🟢 Niedriges Risiko'; setHTML('legalResult',`<span class="status ${cls}">${label}</span><div class="output-box"><h3>Hinweise</h3><ul>${w.map(x=>`<li>${x}</li>`).join('')||'<li>Keine besonderen Warnungen.</li>'}</ul></div>`); }
function roundPrice(v,type){ if(type==='x99') return Math.floor(v)+0.99; if(type==='x49') return Math.floor(v)+0.49; return v; }
function priceCalc(){ const cost=n('pCost'),fees=n('pFees'),profits=[n('pProfit1'),n('pProfit2'),n('pProfit3')],round=$('pRound')?.value||'none'; const rows=profits.map(pr=>{const raw=(cost+pr)/(1-fees/100),final=roundPrice(raw,round);return`<div class="metric"><small>${euro(pr)} Gewinn</small><strong>${euro(final)}</strong></div>`;}).join(''); const be=cost/(1-fees/100); setHTML('priceResult',`<div class="metric"><small>Break-even</small><strong>${euro(roundPrice(be,round))}</strong></div><div class="mini-grid" style="margin-top:12px">${rows}</div>`); }
function budgetCalc(){ const budget=n('bBudget'),cost=n('bCost'),risk=n('bRisk'),qty=n('bQty')||1; const per=cost*qty,maxByBudget=cost?Math.floor(budget/per):0,maxByRisk=risk?Math.floor(budget/risk):maxByBudget; setHTML('budgetResult',`<div class="dashboard"><div class="metric"><small>Kosten je Produkt-Test</small><strong>${euro(per)}</strong></div><div class="metric"><small>Max. Tests</small><strong>${maxByBudget}</strong></div><div class="metric"><small>Risiko-Limit</small><strong>${maxByRisk}</strong></div><div class="metric"><small>Rest nach 1 Test</small><strong>${euro(budget-per)}</strong></div></div><div class="output-box"><h3>Empfehlung</h3><p>${per>budget?'Zu teuer für dein Testbudget.':'Klein testen, nicht direkt skalieren. Erst Daten sammeln.'}</p></div>`); }
function initListing(){ const box=$('listingChecks'); if(!box) return; box.innerHTML=listingItems.map((x,i)=>`<div class="checkrow"><input type="checkbox" id="c${i}"><label for="c${i}">${x}</label></div>`).join(''); }
function getSmartListingCheckState(){
  const title = getInputValue('listingTitle') || getGeneratedTitle() || getInputValue('gName') || '';
  const description = getInputValue('listingBody') || (($('generatedDescriptionValue') && $('generatedDescriptionValue').textContent.trim()) || '');
  const mainKeyword = getInputValue('gMainKeyword');
  const features = getInputValue('gFeature');
  const audience = getInputValue('gUse');
  const notes = getInputValue('listingNotes');
  const supplierLink = getInputValue('supplierLink');
  const deliveryTime = n('delivery') || n('deliveryTime');
  const buy = n('buy');
  const sell = n('sell');
  const targetProfit = n('targetProfit');
  const fee = n('fee');
  const riskBuffer = n('riskBuffer');
  const status = normalizeProductStatus(getInputValue('productStatus') || (latestEbayListingDraft && latestEbayListingDraft.productStatus) || 'Draft', 'Draft');
  const issues = [];
  const positives = [];
  let score = 0;

  if(title){
    score += 15;
    positives.push('Titel vorhanden');
    if(title.length < 25){
      issues.push('Titel ist zu kurz.');
    }else if(title.length <= 80){
      score += 15;
      positives.push('Titel-Länge passt');
    }else{
      issues.push('Titel ist länger als 80 Zeichen.');
    }
  }else{
    issues.push('Titel fehlt.');
  }

  if(mainKeyword){
    score += 15;
    positives.push('Hauptkeyword vorhanden');
  }else{
    issues.push('Hauptkeyword fehlt.');
  }

  if(description){
    score += 15;
    positives.push('Beschreibung vorhanden');
    if(description.length >= 250){
      score += 10;
      positives.push('Beschreibung ist lang genug');
    }else{
      issues.push('Beschreibung ist noch zu kurz.');
    }
  }else{
    issues.push('Beschreibung fehlt.');
  }

  if(features){
    score += 10;
    positives.push('Features vorhanden');
  }else{
    issues.push('Features fehlen.');
  }

  if(audience){
    score += 10;
    positives.push('Zielgruppe vorhanden');
  }else{
    issues.push('Zielgruppe fehlt.');
  }

  if(buy > 0 && sell > 0){
    score += 5;
    positives.push('Preis/Marge gepflegt');
  }else{
    issues.push('Preis oder Marge fehlt.');
  }

  if(supplierLink){
    score += 5;
    positives.push('Supplier-Link vorhanden');
  }else{
    issues.push('Supplier-Link fehlt.');
  }

  if(deliveryTime > 0){
    score += 5;
    positives.push('Lieferzeit vorhanden');
  }else{
    issues.push('Liefer-/Versandzeit fehlt.');
  }

  if(PRODUCT_STATUS_VALUES.includes(status)){
    score += 5;
    positives.push('Status gesetzt');
  }else{
    issues.push('Status fehlt oder ist ungültig.');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const tier = score >= 85 ? {cls:'good', label:'Grün: eBay Ready'} : score >= 60 ? {cls:'warn', label:'Gelb: fast bereit'} : {cls:'bad', label:'Rot: nicht bereit'};
  return {
    score,
    issues: Array.from(new Set(issues)),
    positives,
    tier,
    canMarkReady: score >= 85,
    title,
    description,
    mainKeyword,
    features,
    audience,
    notes,
    supplierLink,
    deliveryTime,
    status,
  };
}
function updateCurrentListingDraftWithCheck(checkState){
  const existing = normalizeEbayListingDraftRecord(latestEbayListingDraft || loadStoredEbayListingDraft() || {});
  const next = normalizeEbayListingDraftRecord({
    ...existing,
    listingScore: checkState.score,
    issues: checkState.issues,
    lastCheckedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  latestEbayListingDraft = next;
  localStorage.setItem(EBAY_LISTING_DRAFT_KEY, JSON.stringify(next));
  renderEbayListingDraftPreview(next, 'Listing geprüft.');
  render();
  return next;
}
function markEbayReadyFromListing(){
  const checkState = getSmartListingCheckState();
  if(!checkState.canMarkReady){
    alert('Der Listing-Check ist noch nicht hoch genug, um eBay Ready zu markieren.');
    return;
  }
  const existing = normalizeEbayListingDraftRecord(latestEbayListingDraft || loadStoredEbayListingDraft() || {});
  const next = normalizeEbayListingDraftRecord({
    ...existing,
    productStatus: 'eBay Ready',
    status: 'eBay Ready',
    listingScore: Math.max(85, checkState.score),
    issues: checkState.issues,
    lastCheckedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  latestEbayListingDraft = next;
  localStorage.setItem(EBAY_LISTING_DRAFT_KEY, JSON.stringify(next));
  renderEbayListingDraftPreview(next, 'Als eBay Ready markiert.');
  toast('Draft als eBay Ready markiert.');
  render();
}
function listingCheck(){
  let done=0;
  listingItems.forEach((_,i)=>{ if($('c'+i)?.checked) done++; });
  const pct=Math.round(done/listingItems.length*100);
  const checkState = getSmartListingCheckState();
  const scoreCls = checkState.tier.cls;
  const manualCls = pct>=90?'good':pct>=70?'warn':'bad';
  const issueList = checkState.issues.length ? checkState.issues.map(function(issue){ return '<li>' + escapeHtml(issue) + '</li>'; }).join('') : '<li>Keine offenen Punkte erkannt.</li>';
  const positiveList = checkState.positives.length ? checkState.positives.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') : '<li>Noch keine klaren Pluspunkte erkannt.</li>';
  const readyHtml = checkState.canMarkReady
    ? '<button class="full" type="button" onclick="markEbayReadyFromListing()">Als eBay Ready markieren</button>'
    : '<p class="hint">Für eBay Ready fehlen noch Punkte. Liste unten zeigt dir genau welche.</p>';
  setHTML('listingResult',
    '<div class="dashboard">' +
      '<div class="metric"><small>Manuell geprüft</small><strong>' + pct + '%</strong></div>' +
      '<div class="metric"><small>Smart Score</small><strong>' + checkState.score + '/100</strong></div>' +
      '<div class="metric"><small>Status</small><strong>' + escapeHtml(checkState.tier.label) + '</strong></div>' +
      '<div class="metric"><small>Ready?</small><strong>' + (checkState.canMarkReady ? 'Ja' : 'Nein') + '</strong></div>' +
    '</div>' +
    '<div class="progress" style="margin-top:14px"><div class="bar" style="width:' + checkState.score + '%"></div></div>' +
    '<div class="output-box"><h3>Prüfstatus</h3><p>' + (checkState.canMarkReady ? 'Bereit zum Listen. Vor dem Upload nur noch final prüfen.' : (checkState.score >= 60 ? 'Fast fertig, letzte Punkte prüfen.' : 'Noch nicht listen. Erst die offenen Punkte schließen.')) + '</p></div>' +
    '<div class="output-box"><h3>Fehlende Punkte</h3><ul>' + issueList + '</ul></div>' +
    '<div class="output-box"><h3>Was bereits gut ist</h3><ul>' + positiveList + '</ul></div>' +
    '<div class="output-box"><h3>Checkliste</h3><p class="status ' + manualCls + '">' + pct + '% manuell abgehakt</p><p class="hint" style="margin-top:10px">Die klassische Checkliste bleibt erhalten, der Smart-Score ergänzt sie nur.</p></div>' +
    '<div class="check-actions" style="margin-top:14px">' + readyHtml + '</div>'
  );
  updateCurrentListingDraftWithCheck(checkState);
}
function resetListing(){ listingItems.forEach((_,i)=>safe('c'+i,el=>el.checked=false)); setHTML('listingResult','<div class="empty">Noch nicht geprüft.</div>'); }
function trackingCalc(){ const views=n('tViews'),sales=n('tSales'),sell=n('tSell'),cost=n('tCost'),a=n('tPriceA'),b=n('tPriceB'); const conv=views?sales/views*100:0, profitPer=sell-cost,totalProfit=profitPer*sales; let label='🔴 Schwach',cls='bad',msg='Noch kein Gewinner. Erst Daten sammeln oder Angebot verbessern.'; if(sales>=5&&conv>=2&&totalProfit>20){label='🟢 Gewinner-Kandidat';cls='good';msg='Produkt zeigt echte Stärke. Beobachten und vorsichtig skalieren.';} else if(sales>=1&&conv>=1){label='🟡 Test läuft';cls='warn';msg='Noch nicht sicher. Mehr Daten sammeln, Preis/Bilder/Titel testen.';} let ab=''; if(a&&b) ab=`Preis A: ${euro(a)} · Preis B: ${euro(b)} — beobachte, welcher Preis mehr Verkäufe bringt.`; setHTML('trackingResult',`<span class="status ${cls}">${label}</span><div class="dashboard" style="margin-top:16px"><div class="metric"><small>Conversion</small><strong>${conv.toFixed(2)}%</strong></div><div class="metric"><small>Gewinn/Stück</small><strong>${euro(profitPer)}</strong></div><div class="metric"><small>Gesamtgewinn</small><strong>${euro(totalProfit)}</strong></div><div class="metric"><small>Verkäufe</small><strong>${sales}</strong></div></div><div class="output-box"><h3>Bewertung</h3><p>${msg}\n${ab}</p></div>`); }
function financeCalc(){ const revenue=n('fRevenue'),goods=n('fGoods'),fees=n('fFees'),other=n('fOther'); const profit=revenue-goods-fees-other, margin=revenue?profit/revenue*100:0, cls=profit>=0?'good':'bad'; setHTML('financeResult',`<span class="status ${cls}">${profit>=0?'🟢 Gewinn':'🔴 Verlust'}</span><div class="dashboard" style="margin-top:16px"><div class="metric"><small>Umsatz</small><strong>${euro(revenue)}</strong></div><div class="metric"><small>Kosten</small><strong>${euro(goods+fees+other)}</strong></div><div class="metric"><small>Gewinn</small><strong>${euro(profit)}</strong></div><div class="metric"><small>Marge</small><strong>${margin.toFixed(1)}%</strong></div></div><div class="output-box"><h3>Notiz</h3><p>${$('fNote')?.value||'Keine Notiz.'}</p></div>`); }
function warningCalc(){ let warnings=[],points=0; const profit=n('wProfit'),sellers=n('wSellers'),delivery=n('wDelivery'),ret=$('wReturn')?.value||'low'; if(profit<3){points+=25;warnings.push('Gewinn unter 3 €: sehr knapp, lohnt oft nicht.');} else if(profit<7){points+=10;warnings.push('Gewinn unter 7 €: nur testen, wenn Risiko niedrig ist.');} if(sellers>50){points+=20;warnings.push('Viele Anbieter: Preiskampf möglich.');} if(delivery>14){points+=20;warnings.push('Lieferzeit über 14 Tage: erhöhtes Kunden-/Retourenrisiko.');} if(ret==='high'){points+=20;warnings.push('Hohes Retourenrisiko: mehr Puffer nötig.');} else if(ret==='medium'){points+=10;warnings.push('Mittleres Retourenrisiko: vorsichtig kalkulieren.');} if($('wElectric')?.checked){points+=30;warnings.push('Elektro/Batterie/WEEE möglich: erst rechtlich klären.');} if($('wBrand')?.checked){points+=30;warnings.push('Marke/Logo/Designrecht möglich: nicht blind listen.');} const cls=points>=50?'bad':points>=20?'warn':'good', label=points>=50?'🔴 Stop / prüfen':points>=20?'🟡 Vorsicht':'🟢 Sieht okay aus'; setHTML('warningResult',`<span class="status ${cls}">${label}</span><div class="output-box"><h3>Warnungen</h3><ul>${warnings.map(w=>`<li>${w}</li>`).join('')||'<li>Keine starken Warnungen erkannt.</li>'}</ul></div>`); }
function normalizeText(text){
  let output = String(text || '').trim();
  while(output.includes('  ')) output = output.replaceAll('  ',' ');
  return output;
}
function titleScore(title, mainKeyword, keywords){
  const lower = String(title || '').toLowerCase();
  const main = (mainKeyword || '').toLowerCase().trim();
  const kwList = (keywords || '').split(',').map(k=>k.trim().toLowerCase()).filter(Boolean);
  const riskyWords = ['original','offiziell','apple','samsung','nike','adidas','medizinisch','heilend','garantiert','bester','nummer 1','nr. 1','zertifiziert'];
  let tips = [];
  let warnings = [];

  let seoScore = 0;
  if(main && lower.startsWith(main)) seoScore += 40;
  else tips.push('Hauptkeyword möglichst ganz vorne platzieren.');
  const usedKeywords = kwList.filter(k => lower.includes(k));
  seoScore += Math.min(35, usedKeywords.length * 8);
  if(usedKeywords.length < 2) tips.push('Mehr relevante Keywords natürlich einbauen.');
  if('0123456789'.split('').some(num => title.includes(num))) seoScore += 15;
  else tips.push('Konkrete Angaben wie Größe, Menge oder Modell helfen oft.');
  if(title.length >= 45 && title.length <= 80) seoScore += 10;

  let clickScore = 0;
  const triggerWords = ['neu','premium','praktisch','set','upgrade','angebot','pro','leicht','kompakt','schnell'];
  if(triggerWords.some(word => lower.includes(word))) clickScore += 35;
  if(title.length >= 50 && title.length <= 75) clickScore += 25;
  if(usefulFeatureWords(title)) clickScore += 25;
  if(!title.includes('!!') && !title.includes('??')) clickScore += 15;
  else tips.push('Keine übertriebenen Sonderzeichen verwenden.');

  let legalScore = 100;
  riskyWords.forEach(word => {
    if(lower.includes(word)){
      legalScore -= 20;
      warnings.push('Riskantes Wort prüfen: ' + word);
    }
  });

  let mobileScore = 0;
  if(title.length <= 80) mobileScore += 40;
  else tips.push('Titel ist über 80 Zeichen und muss gekürzt werden.');
  if(title.length >= 45) mobileScore += 20;
  if(main && title.slice(0,40).toLowerCase().includes(main)) mobileScore += 25;
  else tips.push('Hauptkeyword sollte in den ersten 40 Zeichen sichtbar sein.');
  if(title.slice(0,40).length >= 25) mobileScore += 15;

  seoScore = Math.max(0, Math.min(100, Math.round(seoScore)));
  clickScore = Math.max(0, Math.min(100, Math.round(clickScore)));
  legalScore = Math.max(0, Math.min(100, Math.round(legalScore)));
  mobileScore = Math.max(0, Math.min(100, Math.round(mobileScore)));
  const score = Math.round((seoScore + clickScore + legalScore + mobileScore) / 4);
  const charStatus = title.length > 80 ? 'Zu lang' : title.length < 45 ? 'Eher kurz' : 'Gut';

  return {score, tips, warnings, seoScore, clickScore, legalScore, mobileScore, charCount:title.length, charStatus};
}
function usefulFeatureWords(title){
  const lower = String(title || '').toLowerCase();
  return ['mit','für','set','usb','app','rgb','pro','mini','kompakt','wasserdicht','kabellos','wiederaufladbar'].some(w => lower.includes(w));
}
function shortenTitle(title){
  let words = normalizeText(title).split(' ').filter(Boolean);
  const filler = ['und','oder','mit','für','das','der','die','den','eine','einer','top'];
  words = words.filter((word, index) => index < 4 || !filler.includes(word.toLowerCase()));
  let shortened = words.join(' ');
  while(shortened.length > 80 && words.length > 3){
    words.pop();
    shortened = words.join(' ');
  }
  return shortened.slice(0,80).trim();
}
function keywordIdeas(mainKeyword, product, use){
  const base = [mainKeyword, product, use].filter(Boolean).join(' ').toLowerCase();
  const ideas = [];
  if(mainKeyword) ideas.push(mainKeyword, `${mainKeyword} Set`, `${mainKeyword} Neu`, `${mainKeyword} Zubehör`);
  if(base.includes('led')) ideas.push('RGB Lichtband','LED Beleuchtung','Gaming Licht','Zimmer Deko','Lichterkette');
  if(base.includes('küche')) ideas.push('Küchenhelfer','Haushalt','praktisch','Organizer');
  if(base.includes('auto')) ideas.push('Auto Zubehör','KFZ','Innenraum','praktisch');
  if(base.includes('hund') || base.includes('katze')) ideas.push('Haustier Zubehör','Tierbedarf','Pflege','praktisch');
  return [...new Set(ideas.filter(Boolean))].slice(0,12);
}
function buildDescription(product, feature, use, pain, tone){
  const line = String.fromCharCode(10);
  const hook = pain ? `Kennst du das? ${pain}. Dieses Produkt hilft dir, genau das einfach zu verbessern.` : `Eine praktische Lösung für ${use || 'deinen Alltag'}.`;
  const premium = tone === 'premium' ? 'hochwertige Optik, modernes Design und einfache Nutzung' : 'einfache Nutzung, praktische Anwendung und gutes Preis-Leistungs-Verhältnis';
  return [
    hook,
    '',
    'Highlights:',
    `✓ ${feature || 'Praktische Funktionen für den Alltag'}`,
    `✓ Ideal für ${use || 'Zuhause, Alltag und unterwegs'}`,
    `✓ ${premium}`,
    '✓ Schnell einsatzbereit und einfach zu verwenden',
    '',
    'Warum dieses Produkt?',
    'Es verbindet Nutzen, einfache Anwendung und einen fairen Preis. Perfekt, wenn du eine unkomplizierte Lösung suchst.',
    '',
    'Hinweis:',
    'Bitte prüfe vor dem Kauf die Produktdetails, Maße und Varianten.',
    '',
    'Jetzt bestellen und direkt profitieren.'
  ].join(line);
}
function buildAdvancedDescription(product, feature, use, pain, tone, type, length, scope, notice){
  const line = String.fromCharCode(10);
  const name = product || 'Dieses Produkt';
  const targetUse = use || 'Alltag, Zuhause oder unterwegs';
  const features = feature || 'praktische Funktionen, einfache Nutzung und modernes Design';
  const customerPain = pain || 'du eine einfache und zuverlässige Lösung suchst';
  const packageScope = scope || 'Lieferumfang bitte anhand der Artikeldetails prüfen.';
  const importantNotice = notice || 'Bitte prüfe vor dem Kauf Maße, Varianten, Kompatibilität und Lieferumfang.';
  const premiumLine = tone === 'premium' ? 'Die Beschreibung setzt bewusst auf eine hochwertige, klare und seriöse Darstellung.' : '';

  let intro = name + ' ist eine praktische Lösung für ' + targetUse + '.';
  if(type === 'benefit') intro = 'Mit ' + name + ' bekommst du eine einfache Möglichkeit, ' + customerPain + ' zu verbessern.';
  if(type === 'trust') intro = name + ' wird klar und transparent beschrieben, damit du vor dem Kauf genau weißt, was du bekommst.';
  if(type === 'simple') intro = name + ' ist praktisch, leicht verständlich und direkt einsatzbereit.';

  let lines = [];
  lines.push(intro);
  if(premiumLine) lines.push(premiumLine);
  lines.push('');
  lines.push('Vorteile:');
  lines.push('✓ ' + features);
  lines.push('✓ Geeignet für: ' + targetUse);
  lines.push('✓ Einfache Nutzung im Alltag');
  lines.push('✓ Gute Wahl, wenn ' + customerPain);

  if(length !== 'short'){
    lines.push('');
    lines.push('Warum dieses Produkt?');
    lines.push('Das Produkt verbindet praktischen Nutzen mit einer unkomplizierten Anwendung. Es eignet sich besonders für Käufer, die eine einfache, funktionale und faire Lösung suchen.');
  }

  if(length === 'long'){
    lines.push('');
    lines.push('Ausführliche Beschreibung:');
    lines.push(name + ' wurde für Käufer entwickelt, die nicht lange suchen möchten, sondern eine praktische und verständliche Lösung brauchen. Der Fokus liegt auf einfacher Anwendung, klarem Nutzen und einer möglichst unkomplizierten Nutzung im Alltag. Besonders geeignet ist das Produkt für ' + targetUse + '.');
    lines.push('');
    lines.push('So hilft dir das Produkt:');
    lines.push('Wenn ' + customerPain + ', kann dieses Produkt eine sinnvolle Unterstützung sein. Es hilft dabei, den gewünschten Nutzen schneller zu erreichen und den Alltag einfacher, ordentlicher oder angenehmer zu gestalten. Die wichtigsten Eigenschaften sind: ' + features + '.');
    lines.push('');
    lines.push('Anwendung:');
    lines.push('Die Nutzung ist bewusst einfach gehalten. Wähle vor dem Kauf die passende Variante, Größe, Farbe oder Ausführung aus und prüfe die Angaben in der Artikelbeschreibung. Nach Erhalt solltest du das Produkt kurz kontrollieren und entsprechend der Produktangaben verwenden.');
    lines.push('');
    lines.push('Warum sich der Kauf lohnt:');
    lines.push('Dieses Angebot eignet sich besonders für Käufer, die Wert auf eine einfache Lösung, faire Darstellung und klare Produktinformationen legen. Du erhältst ein Produkt, das praktisch eingesetzt werden kann und nicht unnötig kompliziert ist. Dadurch eignet es sich sowohl für den eigenen Gebrauch als auch als Geschenkidee, sofern es zum jeweiligen Einsatzzweck passt.');
    lines.push('');
    lines.push('Vor dem Kauf beachten:');
    lines.push('Bitte vergleiche die Produktangaben sorgfältig mit deinem gewünschten Einsatzzweck. Prüfe insbesondere Maße, Variante, Kompatibilität, Farbe, Material, Lieferumfang und eventuelle Hinweise. So vermeidest du Fehlkäufe und stellst sicher, dass das Produkt wirklich zu deiner Erwartung passt.');
  }

  lines.push('');
  lines.push('Lieferumfang / Hinweis:');
  lines.push(packageScope);
  lines.push('');
  lines.push('Wichtiger Hinweis:');
  lines.push(importantNotice);
  lines.push('');
  lines.push('Jetzt bestellen und bequem liefern lassen.');
  return lines.join(line);
}
function descriptionGeneratorCalc(){
  const product = $('gName') && $('gName').value.trim() ? $('gName').value.trim() : 'Produkt';
  const feature = $('gFeature') && $('gFeature').value.trim() ? $('gFeature').value.trim() : '';
  const use = $('gUse') && $('gUse').value.trim() ? $('gUse').value.trim() : '';
  const pain = $('gPain') && $('gPain').value.trim() ? $('gPain').value.trim() : '';
  const tone = $('gTone') ? $('gTone').value : 'neutral';
  const type = $('descType') ? $('descType').value : 'ebay';
  const length = $('descLength') ? $('descLength').value : 'normal';
  const scope = $('descScope') && $('descScope').value.trim() ? $('descScope').value.trim() : '';
  const notice = $('descNotice') && $('descNotice').value.trim() ? $('descNotice').value.trim() : '';
  const text = buildAdvancedDescription(product, feature, use, pain, tone, type, length, scope, notice);
  const safeText = text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  let html = '';
  html += '<div class="output-box"><h3>Fertige Beschreibung</h3><p id="separateDescriptionValue">' + safeText + '</p>';
  html += '<button class="secondary copy-btn" data-copy="separateDescriptionValue">Beschreibung kopieren</button></div>';
  html += '<div class="output-box"><h3>Hinweis</h3><p>Beschreibung vor dem Einstellen prüfen: Maße, Lieferumfang, Varianten, rechtliche Angaben und Plattform-Regeln müssen stimmen.</p></div>';
  setHTML('descGenResult',html);
  setInputValue('listingBody', text);
  if(!getInputValue('listingNotes')){
    setInputValue('listingNotes', 'Separate Beschreibungsgenerator-Version erstellt.\nTyp: ' + type + '\nLänge: ' + length);
  }
  refreshEbayListingDraftPreview();
}
function getGeneratedTitle(){
  const el = $('generatedTitleValue');
  return el ? el.textContent : '';
}
function getGeneratedDescription(){
  const el = $('generatedDescriptionValue');
  return el ? el.textContent : '';
}
function clampScore(value){
  const number = Number(value);
  if(!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}
function uniqueCleanList(items){
  return Array.from(new Set((Array.isArray(items) ? items : []).map(function(item){
    return String(item || '').trim();
  }).filter(Boolean)));
}
function readListingOptimizerInput(){
  const currentTitle = getGeneratedTitle();
  const currentDescription = getGeneratedDescription();
  const input = {
    mainKeyword: $('gMainKeyword') && $('gMainKeyword').value.trim() ? $('gMainKeyword').value.trim() : '',
    productName: $('gName') && $('gName').value.trim() ? $('gName').value.trim() : '',
    features: $('gFeature') && $('gFeature').value.trim() ? $('gFeature').value.trim() : '',
    targetUse: $('gUse') && $('gUse').value.trim() ? $('gUse').value.trim() : '',
    painPoint: $('gPain') && $('gPain').value.trim() ? $('gPain').value.trim() : '',
    tone: $('gTone') ? $('gTone').value : 'neutral',
    titleMode: $('gMode') ? $('gMode').value : 'hybrid',
    seoKeywords: $('gKeywords') && $('gKeywords').value.trim() ? $('gKeywords').value.trim() : '',
    descriptionLength: $('descLength') ? $('descLength').value : 'normal',
    descriptionType: $('descType') ? $('descType').value : 'ebay',
    packageScope: $('descScope') && $('descScope').value.trim() ? $('descScope').value.trim() : '',
    importantNotice: $('descNotice') && $('descNotice').value.trim() ? $('descNotice').value.trim() : '',
    currentTitle: currentTitle,
    currentDescription: currentDescription,
  };

  return {
    mode: 'regenerate',
    product: input,
    requestedMode: 'regenerate',
  };
}
const AI_REQUEST_STORAGE_KEY = 'elyon_ai_requests';
const AI_REQUEST_DATE_KEY = 'elyon_ai_date';
const AI_REQUEST_COST_PER_REQUEST = 0.005;
const AI_REQUEST_COOLDOWN_MS = 3000;
const AI_BUTTON_META = [
  { id: 'aiImproveBtn', label: 'Mit KI verbessern' },
  { id: 'aiRegenerateBtn', label: 'KI neu generieren' },
  { id: 'aiCheckBtn', label: 'Listing prüfen' },
  { id: 'aiSearchImproveBtn', label: 'Suche mit KI verbessern' },
  { id: 'aiSearchAnalyzeBtn', label: 'Produktidee prüfen' },
  { id: 'aiSearchBillingBtn', label: 'KI-Kostenwarnung' },
  { id: 'aiTitleBtn', label: 'Titel mit KI' },
  { id: 'aiTagsBtn', label: 'SEO / Tags mit KI' },
  { id: 'aiDescBtn', label: 'Beschreibung mit KI' },
  { id: 'aiScoreBtn', label: 'Produktanalyse mit KI' },
];
let aiLoadingButtonId = '';
const aiCooldownEndsByButton = {};
const aiCooldownTimersByButton = {};
let aiDashboardCache = {
  checkedAt: '',
  provider: 'Unbekannt',
  model: 'Unbekannt',
  status: 'Ungeprüft',
  fallback: 'Aus',
  security: 'Unbekannt',
  sandbox: 'Unbekannt',
  autonomy: 'Unbekannt',
  detail: 'Noch keine KI-Prüfung ausgeführt.',
};

function getLocalDateKey(date){
  const value = date instanceof Date ? date : new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}
function getAiUsageState(){
  const today = getLocalDateKey();
  try{
    const savedDate = localStorage.getItem(AI_REQUEST_DATE_KEY) || '';
    const savedCount = parseInt(localStorage.getItem(AI_REQUEST_STORAGE_KEY) || '0', 10);
    if(savedDate !== today){
      localStorage.setItem(AI_REQUEST_DATE_KEY, today);
      localStorage.setItem(AI_REQUEST_STORAGE_KEY, '0');
      return { date: today, count: 0 };
    }
    return { date: savedDate || today, count: Number.isFinite(savedCount) ? savedCount : 0 };
  }catch(error){
    if(!window.__elyonAiUsageFallback){
      window.__elyonAiUsageFallback = { date: today, count: 0 };
    }
    const fallback = window.__elyonAiUsageFallback;
    if(fallback.date !== today){
      fallback.date = today;
      fallback.count = 0;
    }
    return fallback;
  }
}
function setAiUsageState(count){
  const nextCount = Math.max(0, Math.floor(Number(count) || 0));
  const today = getLocalDateKey();
  try{
    localStorage.setItem(AI_REQUEST_DATE_KEY, today);
    localStorage.setItem(AI_REQUEST_STORAGE_KEY, String(nextCount));
  }catch(error){
    window.__elyonAiUsageFallback = { date: today, count: nextCount };
  }
  return nextCount;
}
function incrementAiUsage(){
  const state = getAiUsageState();
  const nextCount = setAiUsageState(state.count + 1);
  renderAiUsageStatus();
  return nextCount;
}
function getAiEstimatedCost(count){
  return (Math.max(0, Number(count) || 0) * AI_REQUEST_COST_PER_REQUEST).toFixed(2);
}
function getAiUsageWarning(count){
  if(count > 100) return '⚠ AI Limit fast erreicht';
  if(count > 50) return '⚠ Hohe KI-Nutzung erkannt';
  return '';
}
function renderAiUsageStatus(){
  const state = getAiUsageState();
  const estimatedCost = getAiEstimatedCost(state.count);
  const warning = getAiUsageWarning(state.count);
  const statusClass = state.count > 100 ? 'ai-level-bad' : state.count > 50 ? 'ai-level-warn' : 'ai-level-good';
  const html = [
    '<div class="ai-usage-main">',
    '<strong>AI Requests heute: ' + state.count + '</strong>',
    '<span class="ai-usage-meta">Geschätzte Kosten: ~' + estimatedCost.replace('.', ',') + ' $</span>',
    '</div>',
    '<span class="ai-usage-warning ' + statusClass + '">' + escapeHtml(warning || 'Niedrige Nutzung') + '</span>'
  ].join('');
  setHTML('aiUsageStatus', html);
}
function updateAiDashboardUi(data){
  const dash = data || aiDashboardCache;
  aiDashboardCache = dash;
  safe('aiDashProvider', el => el.textContent = dash.provider || 'Unbekannt');
  safe('aiDashModel', el => el.textContent = dash.model || 'Unbekannt');
  safe('aiDashStatus', el => el.textContent = dash.status || 'Ungeprüft');
  safe('aiDashFallback', el => el.textContent = dash.fallback || 'Aus');
  safe('aiDashSecurity', el => el.textContent = dash.security || 'Unbekannt');
  safe('aiDashSandbox', el => el.textContent = dash.sandbox || 'Unbekannt');
  safe('aiDashAutonomy', el => el.textContent = dash.autonomy || 'Unbekannt');
  safe('aiDashCheckedAt', el => el.textContent = dash.checkedAt || 'Noch nie');
  safe('aiDashboardResult', el => {
    el.innerHTML = '<p><strong>' + escapeHtml(dash.status || 'Ungeprüft') + '</strong></p><p>' + escapeHtml(dash.detail || 'Noch keine KI-Prüfung ausgeführt.') + '</p>';
  });
}
async function refreshAiDashboardStatus(){
  const now = new Date().toLocaleString('de-DE');
  const settings = JSON.parse(localStorage.getItem('elyonSettings') || '{}');
  const defaults = getGlobalAiDefaults();
  const securityMode = settings.securityMode !== false;
  const sandboxMode = settings.sandboxMode !== false;
  const autonomyLocked = settings.autonomyLocked !== false;
  let provider = defaults.provider;
  let model = defaults.model;
  let status = 'Ungeprüft';
  let fallback = settings.aiAllowFallback === false ? 'Aus' : 'An';
  let detail = 'Die Übersicht zeigt lokale Einstellungen und den Backend-Status.';

  try{
    const response = await fetch('/api/env-check');
    const data = await response.json().catch(() => ({}));
    const openaiReady = !!(data && data.readiness && data.readiness.openai && data.readiness.openai.ready);
    const deepseekReady = !!(data && data.readiness && data.readiness.deepseek && data.readiness.deepseek.ready);

    if(provider === 'deepseek'){
      status = deepseekReady ? 'Bereit' : 'Key fehlt';
      model = defaults.model;
      detail = deepseekReady ? 'DeepSeek ist laut Backend-Check bereit.' : 'DeepSeek ist im Backend noch nicht vollständig eingerichtet.';
    }else if(provider === 'openai'){
      status = openaiReady ? 'Bereit' : 'Key fehlt';
      model = defaults.model;
      detail = openaiReady ? 'OpenAI ist laut Backend-Check bereit.' : 'OpenAI ist im Backend noch nicht vollständig eingerichtet.';
    }else{
      status = 'Lokal';
      model = 'local-fallback';
      detail = 'Lokaler Fallback ist aktiv oder als sicherer Ersatz vorgesehen.';
    }

    updateAiDashboardUi({
      checkedAt: now,
      provider: provider || 'openai',
      model,
      status,
      fallback,
      security: securityMode ? 'Aktiv' : 'Aus',
      sandbox: sandboxMode ? 'Aktiv' : 'Aus',
      autonomy: autonomyLocked ? 'Gesperrt' : 'Frei',
      detail,
    });
  }catch(error){
    updateAiDashboardUi({
      checkedAt: now,
      provider,
      model,
      status: 'Fehler',
      fallback,
      security: securityMode ? 'Aktiv' : 'Aus',
      sandbox: sandboxMode ? 'Aktiv' : 'Aus',
      autonomy: autonomyLocked ? 'Gesperrt' : 'Frei',
      detail: error && error.message ? error.message : 'Status konnte nicht geladen werden.',
    });
  }
}
async function testAiRouterProvider(provider){
  const defaults = getGlobalAiDefaults();
  const task = provider === 'deepseek' ? 'dashboard_deepseek_test' : provider === 'qwen' ? 'dashboard_qwen_test' : 'dashboard_openai_test';
  const prompt = provider === 'deepseek' ? 'Kurzer DeepSeek Dashboard-Test.' : provider === 'qwen' ? 'Kurzer Qwen Dashboard-Test.' : 'Kurzer OpenAI Dashboard-Test.';
  const payload = {
    provider: provider,
    task: task,
    prompt: prompt,
    model: defaults.model,
    allowFallback: true,
    safety: {
      securityMode: true,
      sandboxMode: true,
      autonomyLocked: true,
      requiresLiveAction: false,
      userApproved: false,
    },
  };
  try{
    const response = await fetch('/api/ai-router', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    updateAiDashboardUi({
      checkedAt: new Date().toLocaleString('de-DE'),
      provider: data.provider || provider,
      model: data.model || defaults.model,
      status: data.ok ? 'OK' : (data.error && data.error.type ? String(data.error.type) : 'Fehler'),
      fallback: data.fallbackUsed ? 'An' : 'Aus',
      security: 'Aktiv',
      sandbox: 'Aktiv',
      autonomy: 'Gesperrt',
      detail: data.ok ? (data.content || 'Verbindung erfolgreich.') : ((data.error && data.error.message) || 'Verbindung fehlgeschlagen.'),
    });
  }catch(error){
    updateAiDashboardUi({
      checkedAt: new Date().toLocaleString('de-DE'),
      provider,
      model: defaults.model,
      status: 'Fehler',
      fallback: 'An',
      security: 'Aktiv',
      sandbox: 'Aktiv',
      autonomy: 'Gesperrt',
      detail: error && error.message ? error.message : 'Verbindung fehlgeschlagen.',
    });
  }
}
function refreshAiButtonStates(){
  const now = Date.now();
  AI_BUTTON_META.forEach(function(button){
    const el = $(button.id);
    if(!el) return;
    if(!el.dataset.originalLabel) el.dataset.originalLabel = button.label;
    const cooldownLeft = Math.max(0, (aiCooldownEndsByButton[button.id] || 0) - now);
    const isLoading = !!aiLoadingButtonId;
    const isLoadingButton = aiLoadingButtonId && aiLoadingButtonId === button.id;
    if(isLoading){
      el.disabled = true;
      el.textContent = isLoadingButton ? 'KI arbeitet...' : (el.dataset.originalLabel || button.label);
      return;
    }
    if(cooldownLeft > 0){
      el.disabled = true;
      el.textContent = 'Bitte warten...';
      return;
    }
    el.disabled = false;
    el.textContent = el.dataset.originalLabel || button.label;
  });
}
function setAiButtonsLoading(isLoading, activeId, cooldownId){
  aiLoadingButtonId = isLoading ? (activeId || '') : '';
  refreshAiButtonStates();
  if(!isLoading && cooldownId){
    startAiCooldown(cooldownId);
  }
}
function startAiCooldown(buttonId){
  if(!buttonId) return;
  aiCooldownEndsByButton[buttonId] = Date.now() + AI_REQUEST_COOLDOWN_MS;
  if(aiCooldownTimersByButton[buttonId]){
    clearTimeout(aiCooldownTimersByButton[buttonId]);
  }
  refreshAiButtonStates();
  aiCooldownTimersByButton[buttonId] = setTimeout(function(){
    delete aiCooldownEndsByButton[buttonId];
    delete aiCooldownTimersByButton[buttonId];
    refreshAiButtonStates();
  }, AI_REQUEST_COOLDOWN_MS);
}
let pendingAiAction = null;
function openAiBillingWarning(action, mode){
  if(action && typeof action === 'object'){
    pendingAiAction = action;
  }else{
    pendingAiAction = {
      action: action || 'listing',
      mode: mode || 'regenerate',
    };
  }
  safe('aiBillingModal', function(el){ el.classList.remove('hidden'); });
}
function closeAiBillingWarning(){
  pendingAiAction = null;
  safe('aiBillingModal', function(el){ el.classList.add('hidden'); });
}
function proceedAiBillingAction(){
  const action = pendingAiAction && pendingAiAction.action ? pendingAiAction.action : 'listing';
  const task = pendingAiAction && pendingAiAction.task ? pendingAiAction.task : null;
  const mode = pendingAiAction && pendingAiAction.mode ? pendingAiAction.mode : 'regenerate';
  const payload = pendingAiAction || {};
  closeAiBillingWarning();
  if(task){
    executeCentralAiTask(payload);
    return;
  }
  if(action === 'product-search'){
    executeAiProductSearch(mode);
    return;
  }
  runAiListingOptimizer(mode);
}
async function postJsonWithTimeout(url, payload, timeoutMs){
  const controller = new AbortController();
  const timeoutId = setTimeout(function(){ controller.abort(); }, timeoutMs || 30000);
  try{
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify(payload || {}),
    });
    const rawText = await response.text();
    if(!rawText || !rawText.trim()){
      throw new Error('Leere Antwort vom Server.');
    }
    let data = null;
    try{
      data = JSON.parse(rawText);
    }catch(parseError){
      if(!response.ok){
        throw new Error(rawText.slice(0, 240) || ('HTTP ' + response.status));
      }
      throw new Error('Ungültige JSON-Antwort vom Server.');
    }
    if(!response.ok || !data || data.ok === false){
      throw new Error((data && (data.error || data.message)) ? (data.error || data.message) : ('Request fehlgeschlagen: HTTP ' + response.status));
    }
    return data;
  }catch(error){
    if(error && error.name === 'AbortError'){
      throw new Error('Timeout: Die KI hat nicht rechtzeitig geantwortet.');
    }
    if(error && error.message && /failed to fetch|network|networkerror/i.test(error.message)){
      throw new Error('Netzwerkfehler bei der Anfrage.');
    }
    throw error;
  }finally{
    clearTimeout(timeoutId);
  }
}
function normalizeAiRouterProvider(extra){
  const rawProvider = extra && typeof extra.provider === 'string' ? extra.provider.trim().toLowerCase() : '';
  const rawModel = extra && typeof extra.model === 'string' ? extra.model.trim().toLowerCase() : '';
  if (rawProvider === 'openai' || rawProvider === 'deepseek' || rawProvider === 'qwen' || rawProvider === 'local') return rawProvider;
  if (rawModel === 'deepseek') return 'deepseek';
  if (rawModel === 'qwen') return 'qwen';
  return 'openai';
}
function normalizeAiRouterModel(provider, extra){
  const rawModel = extra && typeof extra.model === 'string' ? extra.model.trim().toLowerCase() : '';
  if (provider === 'deepseek') {
    if (rawModel === 'deepseek-mini') return 'deepseek-v4-flash';
    if (rawModel === 'deepseek-standard') return 'deepseek-v4-pro';
    if (rawModel === 'deepseek-chat') return 'deepseek-chat';
    if (rawModel === 'deepseek-reasoner') return 'deepseek-reasoner';
    if (rawModel === 'deepseek-v4-flash') return 'deepseek-v4-flash';
    if (rawModel === 'deepseek-v4-pro') return 'deepseek-v4-pro';
    if (rawModel && rawModel !== 'deepseek') return rawModel;
    return 'deepseek-v4-flash';
  }
  if (provider === 'qwen') {
    if (rawModel === 'qwen-plus') return 'qwen-plus';
    if (rawModel === 'qwen-flash') return 'qwen-flash';
    if (rawModel === 'qwen-max') return 'qwen-max';
    if (rawModel && rawModel !== 'qwen') return rawModel;
    return 'qwen-plus';
  }
  if (rawModel === 'openai-mini') return 'gpt-4o-mini';
  if (rawModel === 'openai-standard') return 'gpt-4o';
  if (rawModel && rawModel !== 'deepseek') return rawModel;
  return 'gpt-4o-mini';
}
function buildAiRouterSafety(extra){
  const safety = extra && typeof extra.safety === 'object' ? { ...extra.safety } : {};
  return {
    securityMode: safety.securityMode !== false,
    sandboxMode: safety.sandboxMode !== false,
    autonomyLocked: safety.autonomyLocked !== false,
    requiresLiveAction: safety.requiresLiveAction === true,
    userApproved: safety.userApproved === true,
  };
}
function getGlobalAiDefaults(){
  const settings = JSON.parse(localStorage.getItem('elyonSettings') || '{}');
  const provider = settings.aiProvider || (settings.aiEnabled === false ? 'local' : 'openai');
  return {
    provider,
    model: settings.aiModel || (provider === 'deepseek' ? 'deepseek-v4-flash' : provider === 'qwen' ? 'qwen-plus' : 'gpt-4o-mini'),
    allowFallback: settings.aiAllowFallback !== false,
  };
}
async function requestAiRouter(task, prompt, extra){
  incrementAiUsage();
  const provider = normalizeAiRouterProvider(extra || {});
  const payload = {
    provider,
    task: task,
    prompt: prompt,
    model: normalizeAiRouterModel(provider, extra || {}),
    allowFallback: extra && extra.allowFallback !== undefined ? !!extra.allowFallback : true,
    context: extra && extra.context && typeof extra.context === 'object' ? extra.context : {},
    safety: buildAiRouterSafety(extra || {}),
  };
  if (Array.isArray(extra && extra.messages)) {
    payload.messages = extra.messages;
  }
  return postJsonWithTimeout('/api/ai-router', payload, 30000);
}
async function requestCentralAi(task, prompt, extra){
  const defaults = getGlobalAiDefaults();
  const incoming = extra && typeof extra === 'object' ? extra : {};
  return requestAiRouter(task, prompt, {
    ...incoming,
    provider: incoming.provider || defaults.provider,
    model: incoming.model || defaults.model,
    allowFallback: incoming.allowFallback !== undefined ? incoming.allowFallback : defaults.allowFallback,
  });
}
function readAiProductSearchInput(){
  const query = $('aiSearchQuery') && $('aiSearchQuery').value.trim() ? $('aiSearchQuery').value.trim() : '';
  return {
    query: query || (($('name') && $('name').value.trim()) ? $('name').value.trim() : ''),
    product: {
      name: $('name') && $('name').value.trim() ? $('name').value.trim() : '',
      sku: $('sku') && $('sku').value.trim() ? $('sku').value.trim() : '',
      supplierId: $('supplierId') && $('supplierId').value.trim() ? $('supplierId').value.trim() : '',
      notes: $('notes') && $('notes').value.trim() ? $('notes').value.trim() : '',
      buy: n('buy') || 0,
      ship: n('ship') || 0,
      sell: n('sell') || 0,
      competition: n('competition') || 0,
      delivery: n('delivery') || 0,
      risk: $('risk') ? $('risk').value : 'low',
    }
  };
}
function buildAiTitlePrompt(){
  const main = $('gMainKeyword') && $('gMainKeyword').value.trim() ? $('gMainKeyword').value.trim() : '';
  const name = $('gName') && $('gName').value.trim() ? $('gName').value.trim() : '';
  const feat = $('gFeature') && $('gFeature').value.trim() ? $('gFeature').value.trim() : '';
  const use = $('gUse') && $('gUse').value.trim() ? $('gUse').value.trim() : '';
  const pain = $('gPain') && $('gPain').value.trim() ? $('gPain').value.trim() : '';
  const tone = $('gTone') ? $('gTone').value : 'neutral';
  const kw = $('gKeywords') && $('gKeywords').value.trim() ? $('gKeywords').value.trim() : '';
  return [
    'Erstelle einen optimierten eBay-Titel fuer einen deutschen Shop.',
    'Maximal 80 Zeichen.',
    'Keine falschen Markenversprechen, keine unsicheren Zertifizierungen.',
    'Optional auch Untertitel, SEO-Keywords und Risikohinweise.',
    '',
    'Produktdaten:',
    JSON.stringify({ main, name, feat, use, pain, tone, kw }, null, 2)
  ].join('\n');
}
function buildAiDescriptionPrompt(){
  const product = $('gName') && $('gName').value.trim() ? $('gName').value.trim() : 'Produkt';
  const feature = $('gFeature') && $('gFeature').value.trim() ? $('gFeature').value.trim() : '';
  const use = $('gUse') && $('gUse').value.trim() ? $('gUse').value.trim() : '';
  const pain = $('gPain') && $('gPain').value.trim() ? $('gPain').value.trim() : '';
  const tone = $('gTone') ? $('gTone').value : 'neutral';
  const type = $('descType') ? $('descType').value : 'ebay';
  const length = $('descLength') ? $('descLength').value : 'normal';
  const scope = $('descScope') && $('descScope').value.trim() ? $('descScope').value.trim() : '';
  const notice = $('descNotice') && $('descNotice').value.trim() ? $('descNotice').value.trim() : '';
  return [
    'Erstelle eine ausfuehrliche, seriöse eBay-Beschreibung.',
    'Nutze Bulletpoints, klare Vorteile und sichere Formulierungen.',
    '',
    'Produktdaten:',
    JSON.stringify({ product, feature, use, pain, tone, type, length, scope, notice }, null, 2)
  ].join('\n');
}
function buildAiTagsPrompt(){
  const main = $('gMainKeyword') && $('gMainKeyword').value.trim() ? $('gMainKeyword').value.trim() : '';
  const name = $('gName') && $('gName').value.trim() ? $('gName').value.trim() : '';
  const feat = $('gFeature') && $('gFeature').value.trim() ? $('gFeature').value.trim() : '';
  const use = $('gUse') && $('gUse').value.trim() ? $('gUse').value.trim() : '';
  const kw = $('gKeywords') && $('gKeywords').value.trim() ? $('gKeywords').value.trim() : '';
  return [
    'Erstelle SEO-Keywords, Synonyme und Titelideen fuer eBay.',
    'Keine Marken erfinden, keine unsicheren Versprechen.',
    '',
    'Produktdaten:',
    JSON.stringify({ main, name, feat, use, kw }, null, 2)
  ].join('\n');
}
function buildAiProductScorePrompt(){
  const product = $('rName') && $('rName').value.trim() ? $('rName').value.trim() : '';
  const cost = n('rCost') || 0;
  const price = n('rMyPrice') || 0;
  const fee = n('rFee') || 15;
  const buffer = n('rBuffer') || 5;
  const low = n('rLow') || 0;
  const avg = n('rAvg') || 0;
  const high = n('rHigh') || 0;
  const sellers = n('rSellers') || 0;
  const sold = n('rSold') || 0;
  const delivery = n('rDelivery') || 0;
  const risk = $('rRisk') ? $('rRisk').value : 'low';
  return [
    'Bewerte die Produktidee mit Score, Risiken und einer kurzen Empfehlung.',
    'Achte auf Konkurrenz, Marge, Lieferzeit und moegliche Risiken wie Batterie/WEEE/LUCID/EPR.',
    '',
    'Produktdaten:',
    JSON.stringify({ product, cost, price, fee, buffer, low, avg, high, sellers, sold, delivery, risk }, null, 2)
  ].join('\n');
}
function renderAiTitleTaskResult(data){
  const payload = data && data.result ? data.result : data;
  const title = String(payload && payload.title ? payload.title : '').trim();
  const subtitle = String(payload && payload.subtitle ? payload.subtitle : '').trim();
  const keywords = uniqueCleanList(payload && payload.seoKeywords ? payload.seoKeywords : []);
  const warnings = uniqueCleanList(payload && payload.riskWarnings ? payload.riskWarnings : []);
  const score = payload && payload.score ? payload.score : {};
  const titleScore = clampScore(score.title);
  const seoScore = clampScore(score.seo);
  const riskScore = clampScore(score.risk);
  const totalScore = clampScore(score.total !== undefined && score.total !== null ? score.total : Math.round((titleScore + seoScore + riskScore) / 3));
  safe('generatedTitleValue', function(el){ el.textContent = title || el.textContent; });
  let html = '';
  html += '<div class="score-top"><span class="status good">Titel KI · ' + totalScore + '/100</span><span class="score-number">' + totalScore + '</span></div>';
  html += '<div class="dashboard" style="margin-top:16px"><div class="metric"><small>Titel</small><strong>' + titleScore + '</strong></div><div class="metric"><small>SEO</small><strong>' + seoScore + '</strong></div><div class="metric"><small>Risiko</small><strong>' + riskScore + '</strong></div><div class="metric"><small>Modus</small><strong>Titel</strong></div></div>';
  html += '<div class="output-box"><h3>Optimierter Titel</h3><p>' + escapeHtml(title || 'Kein Titel erzeugt') + '</p></div>';
  html += '<div class="output-box"><h3>Untertitel</h3><p>' + escapeHtml(subtitle || 'Kein Untertitel vorgeschlagen.') + '</p></div>';
  html += '<div class="output-box"><h3>SEO-Keywords</h3><p>' + escapeHtml(keywords.join(', ') || 'Keine Keywords erzeugt.') + '</p></div>';
  html += '<div class="output-box"><h3>Risiko-Hinweise</h3><ul>' + (warnings.length ? warnings.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') : '<li>Keine Risiko-Hinweise gemeldet.</li>') + '</ul></div>';
  setHTML('aiResult', html);
}
function renderAiDescriptionTaskResult(data){
  const payload = data && data.result ? data.result : data;
  const description = String(payload && payload.description ? payload.description : '').trim();
  const bulletPoints = uniqueCleanList(payload && payload.bulletPoints ? payload.bulletPoints : []);
  const keywords = uniqueCleanList(payload && payload.seoKeywords ? payload.seoKeywords : []);
  const warnings = uniqueCleanList(payload && payload.riskWarnings ? payload.riskWarnings : []);
  const score = payload && payload.score ? payload.score : {};
  const titleScore = clampScore(score.title);
  const seoScore = clampScore(score.seo);
  const descScore = clampScore(score.description);
  const riskScore = clampScore(score.risk);
  const totalScore = clampScore(score.total !== undefined && score.total !== null ? score.total : Math.round((titleScore + seoScore + descScore + riskScore) / 4));
  safe('separateDescriptionValue', function(el){ el.textContent = description || el.textContent; });
  let html = '';
  html += '<div class="score-top"><span class="status good">Beschreibung KI · ' + totalScore + '/100</span><span class="score-number">' + totalScore + '</span></div>';
  html += '<div class="dashboard" style="margin-top:16px"><div class="metric"><small>Titel</small><strong>' + titleScore + '</strong></div><div class="metric"><small>SEO</small><strong>' + seoScore + '</strong></div><div class="metric"><small>Text</small><strong>' + descScore + '</strong></div><div class="metric"><small>Risiko</small><strong>' + riskScore + '</strong></div></div>';
  html += '<div class="output-box"><h3>Beschreibung</h3><p>' + escapeHtml(description || 'Keine Beschreibung erzeugt.') + '</p></div>';
  html += '<div class="output-box"><h3>Bulletpoints</h3><ul>' + (bulletPoints.length ? bulletPoints.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') : '<li>Keine Bulletpoints erzeugt.</li>') + '</ul></div>';
  html += '<div class="output-box"><h3>SEO-Keywords</h3><p>' + escapeHtml(keywords.join(', ') || 'Keine Keywords erzeugt.') + '</p></div>';
  html += '<div class="output-box"><h3>Risiko-Hinweise</h3><ul>' + (warnings.length ? warnings.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') : '<li>Keine Risiko-Hinweise gemeldet.</li>') + '</ul></div>';
  setHTML('descGenResult', html);
}
function renderAiTagsTaskResult(data){
  const payload = data && data.result ? data.result : data;
  const keywords = uniqueCleanList(payload && payload.seoKeywords ? payload.seoKeywords : []);
  const titleIdeas = uniqueCleanList(payload && payload.titleIdeas ? payload.titleIdeas : []);
  const warnings = uniqueCleanList(payload && payload.riskWarnings ? payload.riskWarnings : []);
  const score = payload && payload.score ? payload.score : {};
  const titleScore = clampScore(score.title);
  const seoScore = clampScore(score.seo);
  const riskScore = clampScore(score.risk);
  const totalScore = clampScore(score.total !== undefined && score.total !== null ? score.total : Math.round((titleScore + seoScore + riskScore) / 3));
  safe('generatedKeywordsValue', function(el){ el.textContent = keywords.join(', ') || el.textContent; });
  let html = '';
  html += '<div class="score-top"><span class="status good">SEO / Tags KI · ' + totalScore + '/100</span><span class="score-number">' + totalScore + '</span></div>';
  html += '<div class="dashboard" style="margin-top:16px"><div class="metric"><small>Titel</small><strong>' + titleScore + '</strong></div><div class="metric"><small>SEO</small><strong>' + seoScore + '</strong></div><div class="metric"><small>Risiko</small><strong>' + riskScore + '</strong></div><div class="metric"><small>Modus</small><strong>Tags</strong></div></div>';
  html += '<div class="output-box"><h3>SEO-Keywords</h3><p>' + escapeHtml(keywords.join(', ') || 'Keine Keywords erzeugt.') + '</p></div>';
  html += '<div class="output-box"><h3>Titelideen</h3><ul>' + (titleIdeas.length ? titleIdeas.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') : '<li>Keine Titelideen erzeugt.</li>') + '</ul></div>';
  html += '<div class="output-box"><h3>Risiko-Hinweise</h3><ul>' + (warnings.length ? warnings.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') : '<li>Keine Risiko-Hinweise gemeldet.</li>') + '</ul></div>';
  setHTML('aiResult', html);
}
function renderAiProductScoreTaskResult(data){
  const payload = data && data.result ? data.result : data;
  const summary = String(payload && payload.summary ? payload.summary : '').trim();
  const recommendation = String(payload && payload.recommendation ? payload.recommendation : '').trim();
  const warnings = uniqueCleanList(payload && payload.riskWarnings ? payload.riskWarnings : []);
  const score = payload && payload.score ? payload.score : {};
  const titleScore = clampScore(score.title);
  const seoScore = clampScore(score.seo);
  const descScore = clampScore(score.description);
  const riskScore = clampScore(score.risk);
  const totalScore = clampScore(score.total !== undefined && score.total !== null ? score.total : Math.round((titleScore + seoScore + descScore + riskScore) / 4));
  const cls = totalScore >= 75 ? 'good' : totalScore >= 50 ? 'warn' : 'bad';
  let html = '';
  html += '<div class="score-top"><span class="status ' + cls + '">Produktanalyse KI · ' + totalScore + '/100</span><span class="score-number">' + totalScore + '</span></div>';
  html += '<div class="dashboard" style="margin-top:16px"><div class="metric"><small>Titel</small><strong>' + titleScore + '</strong></div><div class="metric"><small>SEO</small><strong>' + seoScore + '</strong></div><div class="metric"><small>Beschreibung</small><strong>' + descScore + '</strong></div><div class="metric"><small>Risiko</small><strong>' + riskScore + '</strong></div></div>';
  html += '<div class="output-box"><h3>Zusammenfassung</h3><p>' + escapeHtml(summary || 'Keine Zusammenfassung erzeugt.') + '</p></div>';
  html += '<div class="output-box"><h3>Empfehlung</h3><p>' + escapeHtml(recommendation || 'Keine Empfehlung erzeugt.') + '</p></div>';
  html += '<div class="output-box"><h3>Risiko-Hinweise</h3><ul>' + (warnings.length ? warnings.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') : '<li>Keine Risiko-Hinweise gemeldet.</li>') + '</ul></div>';
  setHTML('researchResult', html);
}
async function executeCentralAiTask(config){
  const task = config && config.task ? config.task : '';
  const prompt = config && config.prompt ? config.prompt : '';
  const buttonId = config && config.buttonId ? config.buttonId : '';
  const resultId = config && config.resultId ? config.resultId : '';
  if(!task || !prompt) return;
  if(buttonId){
    setAiButtonsLoading(true, buttonId);
  }
  if(resultId){
    setHTML(resultId, '<div class="empty">KI läuft...</div>');
  }
  try{
    const data = await requestCentralAi(task, prompt, config && config.extra ? config.extra : {});
    if(task === 'title'){
      renderAiTitleTaskResult(data);
    }else if(task === 'description'){
      renderAiDescriptionTaskResult(data);
    }else if(task === 'tags'){
      renderAiTagsTaskResult(data);
    }else if(task === 'product_score'){
      renderAiProductScoreTaskResult(data);
    }else if(resultId){
      const result = data && data.result ? data.result : (data && data.output_text ? data.output_text : '');
      setHTML(resultId, '<div class="output-box"><h3>Router-Einschätzung</h3><p>' + escapeHtml(String(result || 'Keine KI-Antwort erzeugt.')) + '</p></div>');
    }
  }catch(err){
    const message = err && err.message ? err.message : 'Unbekannter KI-Fehler';
    if(resultId){
      setHTML(resultId, '<div class="empty">⚠️ ' + escapeHtml(message) + '</div>');
    }else{
      alert(message);
    }
  }finally{
    setAiButtonsLoading(false, '', buttonId);
  }
}
function renderAiProductSearchResult(data, mode){
  const payload = data && data.result ? data.result : data;
  const query = String(payload && payload.query ? payload.query : '').trim();
  const recommendedQuery = String(payload && payload.recommendedQuery ? payload.recommendedQuery : '').trim();
  const queryExpansion = uniqueCleanList(payload && payload.queryExpansion ? payload.queryExpansion : []);
  const searchAngles = uniqueCleanList(payload && payload.searchAngles ? payload.searchAngles : []);
  const titleIdeas = uniqueCleanList(payload && payload.titleIdeas ? payload.titleIdeas : []);
  const riskWarnings = uniqueCleanList(payload && payload.riskWarnings ? payload.riskWarnings : []);
  const score = payload && payload.score ? payload.score : {};
  const searchScore = clampScore(score.searchPotential);
  const competitionScore = clampScore(score.competition);
  const riskScore = clampScore(score.risk);
  const totalScore = clampScore(score.total !== undefined && score.total !== null ? score.total : Math.round((searchScore + competitionScore + riskScore) / 3));
  const scoreClass = totalScore >= 75 ? 'good' : totalScore >= 50 ? 'warn' : 'bad';
  const modeLabel = mode === 'analyze' ? 'Produktidee prüfen' : 'Suche mit KI verbessern';
  const expansionList = queryExpansion.length ? queryExpansion.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') : '<li>Keine Keyword-Varianten erzeugt.</li>';
  const angleList = searchAngles.length ? searchAngles.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') : '<li>Keine Suchwinkel erzeugt.</li>';
  const titleList = titleIdeas.length ? titleIdeas.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') : '<li>Keine Titelideen erzeugt.</li>';
  const warningList = riskWarnings.length ? riskWarnings.map(function(item){ return '<li>' + escapeHtml(item) + '</li>'; }).join('') : '<li>Keine Risiko-Hinweise gemeldet.</li>';
  let html = '';
  html += '<div class="score-top"><span class="status ' + scoreClass + '">KI Such-Score: ' + totalScore + '/100</span><span class="score-number">' + totalScore + '</span></div>';
  html += '<div class="dashboard" style="margin-top:16px">';
  html += '<div class="metric"><small>Suchpotenzial</small><strong>' + searchScore + '</strong></div>';
  html += '<div class="metric"><small>Konkurrenz</small><strong>' + competitionScore + '</strong></div>';
  html += '<div class="metric"><small>Risiko</small><strong>' + riskScore + '</strong></div>';
  html += '<div class="metric"><small>Modus</small><strong>' + escapeHtml(modeLabel) + '</strong></div>';
  html += '</div>';
  html += '<div class="output-box"><h3>Ausgangsbegriff</h3><p id="aiSearchQueryValue">' + escapeHtml(query || 'Kein Suchbegriff') + '</p><div class="copy-row"><button class="secondary copy-btn" data-copy="aiSearchQueryValue">Suchbegriff kopieren</button></div></div>';
  html += '<div class="output-box"><h3>Empfohlene Suchbegriffe</h3><ul id="aiSearchKeywordsValue">' + expansionList + '</ul><div class="copy-row"><button class="secondary copy-btn" data-copy="aiSearchKeywordsValue">Keywords kopieren</button></div></div>';
  html += '<div class="output-box"><h3>Suchwinkel / Nischen</h3><ul>' + angleList + '</ul></div>';
  html += '<div class="output-box"><h3>Titelideen für die Suche</h3><ul id="aiSearchTitlesValue">' + titleList + '</ul><div class="copy-row"><button class="secondary copy-btn" data-copy="aiSearchTitlesValue">Titelideen kopieren</button></div></div>';
  html += '<div class="output-box"><h3>Risiko- und Markt-Hinweise</h3><ul>' + warningList + '</ul></div>';
  if(recommendedQuery){
    html += '<div class="output-box"><h3>Empfohlene Kernsuche</h3><p id="aiSearchRecommendedValue">' + escapeHtml(recommendedQuery) + '</p><div class="copy-row"><button class="secondary copy-btn" data-copy="aiSearchRecommendedValue">Empfehlung kopieren</button></div></div>';
  }
  setHTML('aiSearchResult', html);
}
function startAiProductSearch(mode){
  openAiBillingWarning('product-search', mode);
}
async function executeAiProductSearch(mode){
  const payload = readAiProductSearchInput();
  payload.mode = mode;
  payload.requestedMode = mode;
  incrementAiUsage();
  setAiButtonsLoading(true, mode === 'analyze' ? 'aiSearchAnalyzeBtn' : 'aiSearchImproveBtn');
  setHTML('aiSearchResult', '<div class="empty">KI-Produktsuche läuft...</div>');
  try{
    const data = await postJsonWithTimeout('/api/ai/product-search', payload, 30000);
    renderAiProductSearchResult(data, mode);
  }catch(err){
    const message = err && err.message ? err.message : 'Unbekannter KI-Fehler';
    setHTML('aiSearchResult', '<div class="empty">⚠️ ' + escapeHtml(message) + '</div>');
  }finally{
    setAiButtonsLoading(false, '', mode === 'analyze' ? 'aiSearchAnalyzeBtn' : 'aiSearchImproveBtn');
  }
}
function renderAiListingResult(data, mode){
  const payload = data && data.result ? data.result : data;
  const title = String(payload && payload.title ? payload.title : '').trim().slice(0, 80);
  const subtitle = String(payload && payload.subtitle ? payload.subtitle : '').trim();
  const bulletPoints = uniqueCleanList(payload && payload.bulletPoints ? payload.bulletPoints : []);
  const description = String(payload && payload.description ? payload.description : '').trim();
  const seoKeywords = uniqueCleanList(payload && payload.seoKeywords ? payload.seoKeywords : []);
  const riskWarnings = uniqueCleanList(payload && payload.riskWarnings ? payload.riskWarnings : []);
  const score = payload && payload.score ? payload.score : {};
  const titleScoreValue = clampScore(score.title);
  const seoScoreValue = clampScore(score.seo);
  const descriptionScoreValue = clampScore(score.description);
  const riskScoreValue = clampScore(score.risk);
  const totalScoreValue = clampScore(score.total !== undefined && score.total !== null ? score.total : Math.round((titleScoreValue + seoScoreValue + descriptionScoreValue + riskScoreValue) / 4));
  const scoreClass = totalScoreValue >= 75 ? 'good' : totalScoreValue >= 50 ? 'warn' : 'bad';
  const bulletList = bulletPoints.length ? bulletPoints.map(function(point){
    return '<li>' + escapeHtml(point) + '</li>';
  }).join('') : '<li>Noch keine Bulletpoints erzeugt.</li>';
  const warningList = riskWarnings.length ? riskWarnings.map(function(point){
    return '<li>' + escapeHtml(point) + '</li>';
  }).join('') : '<li>Keine Risikohinweise gemeldet.</li>';
  const keywordsText = seoKeywords.join(', ');
  const modeLabel = mode === 'check' ? 'Listing-Prüfung' : mode === 'improve' ? 'KI-Optimierung auf Basis deines Entwurfs' : 'KI-Neugenerierung';
  let html = '';
  html += '<div class="score-top"><span class="status ' + scoreClass + '">KI Score: ' + totalScoreValue + '/100</span><span class="score-number">' + totalScoreValue + '</span></div>';
  html += '<div class="dashboard" style="margin-top:16px">';
  html += '<div class="metric"><small>Titel</small><strong>' + titleScoreValue + '</strong></div>';
  html += '<div class="metric"><small>SEO</small><strong>' + seoScoreValue + '</strong></div>';
  html += '<div class="metric"><small>Beschreibung</small><strong>' + descriptionScoreValue + '</strong></div>';
  html += '<div class="metric"><small>Risiko</small><strong>' + riskScoreValue + '</strong></div>';
  html += '</div>';
  html += '<div class="output-box"><h3>KI-Modus</h3><p>' + escapeHtml(modeLabel) + '</p></div>';
  html += '<div class="output-box"><h3>Optimierter Titel</h3><p class="title-hero" id="aiListingTitleValue">' + escapeHtml(title || 'Kein Titel erzeugt') + '</p><div class="copy-row"><button class="secondary copy-btn" data-copy="aiListingTitleValue">Titel kopieren</button></div></div>';
  html += '<div class="output-box"><h3>Untertitel</h3><p>' + escapeHtml(subtitle || 'Kein Untertitel vorgeschlagen.') + '</p></div>';
  html += '<div class="output-box"><h3>Bulletpoints</h3><ul id="aiListingBulletsValue">' + bulletList + '</ul><div class="copy-row"><button class="secondary copy-btn" data-copy="aiListingBulletsValue">Bulletpoints kopieren</button></div></div>';
  html += '<div class="output-box"><h3>Ausführliche Beschreibung</h3><p id="aiListingDescriptionValue">' + escapeHtml(description || 'Keine Beschreibung erzeugt.') + '</p><div class="copy-row"><button class="secondary copy-btn" data-copy="aiListingDescriptionValue">Beschreibung kopieren</button></div></div>';
  html += '<div class="output-box"><h3>SEO-Keywords</h3><p id="aiListingSeoValue">' + escapeHtml(keywordsText || 'Keine Keywords erzeugt.') + '</p><div class="copy-row"><button class="secondary copy-btn" data-copy="aiListingSeoValue">Keywords kopieren</button></div></div>';
  html += '<div class="output-box"><h3>Risiko-Hinweise</h3><ul id="aiListingRiskValue">' + warningList + '</ul></div>';
  setHTML('aiResult', html);
}
async function runAiListingOptimizer(mode){
  const buttons = {
    improve: 'aiImproveBtn',
    regenerate: 'aiRegenerateBtn',
    check: 'aiCheckBtn',
  };
  const payload = readListingOptimizerInput();
  payload.mode = mode;
  payload.requestedMode = mode;
  payload.product.currentTitle = getGeneratedTitle();
  payload.product.currentDescription = getGeneratedDescription();
  incrementAiUsage();
  setAiButtonsLoading(true, buttons[mode] || buttons.regenerate);
  setHTML('aiResult', '<div class="empty">KI-Analyse läuft...</div>');

  try{
    const data = await postJsonWithTimeout('/api/ai/listing-optimizer', payload, 30000);
    renderAiListingResult(data, mode);
  }catch(err){
    const message = err && err.message ? err.message : 'Unbekannter KI-Fehler';
    setHTML('aiResult', '<div class="empty">⚠️ ' + escapeHtml(message) + '</div>');
  }finally{
    setAiButtonsLoading(false, '', buttons[mode] || buttons.regenerate);
  }
}
function copyTextById(id){
  const el = $(id);
  const text = el ? el.textContent : '';
  if(!text){ alert('Noch kein Text zum Kopieren.'); return; }
  copyToClipboardSafe(text,'Kopiert.');
}
const EBAY_LISTING_DRAFT_KEY = 'elyonEbayListingDraft';
let latestEbayListingDraft = null;

function getInputValue(id){
  const el = $(id);
  return el && typeof el.value === 'string' ? el.value.trim() : '';
}

function setInputValue(id, value){
  const el = $(id);
  if(el && typeof el.value === 'string'){
    el.value = value || '';
  }
}

function getDraftTimestamp(iso){
  if(!iso) return 'unbekannt';
  const date = new Date(iso);
  if(Number.isNaN(date.getTime())) return 'unbekannt';
  return date.toLocaleString('de-DE');
}

function getEbayListingDraftFromState(baseDraft){
  const existing = normalizeEbayListingDraftRecord(baseDraft || latestEbayListingDraft || loadStoredEbayListingDraft() || {});
  const title = getInputValue('listingTitle') || getGeneratedTitle() || getInputValue('gName') || 'eBay Listing Entwurf';
  const description = getInputValue('listingBody') || (($('generatedDescriptionValue') && $('generatedDescriptionValue').textContent.trim()) || '');
  const notes = getInputValue('listingNotes');
  const keywords = (($('generatedKeywordsValue') && $('generatedKeywordsValue').textContent.trim()) || getInputValue('gKeywords')) || '';
  const titleVariants = ($('generatedTitleVariants') && $('generatedTitleVariants').textContent.trim()) || '';
  const generatedTitle = ($('generatedTitleValue') && $('generatedTitleValue').textContent.trim()) || title;
  const generatedDescription = (($('generatedDescriptionValue') && $('generatedDescriptionValue').textContent.trim()) || description);
  const generatedKeywords = (($('generatedKeywordsValue') && $('generatedKeywordsValue').textContent.trim()) || keywords);
  return normalizeEbayListingDraftRecord({
    ...existing,
    savedAt: existing.savedAt || new Date().toISOString(),
    source: 'local-draft',
    briefing: {
      mainKeyword: getInputValue('gMainKeyword'),
      name: getInputValue('gName'),
      feature: getInputValue('gFeature'),
      use: getInputValue('gUse'),
      pain: getInputValue('gPain'),
      tone: getInputValue('gTone') || 'neutral',
      keywords: getInputValue('gKeywords'),
      mode: getInputValue('gMode') || 'hybrid',
    },
    draft: {
      title,
      description: generatedDescription,
      notes,
    },
    generated: {
      title: generatedTitle,
      description: generatedDescription,
      keywords: generatedKeywords,
      titleVariants,
    },
    updatedAt: new Date().toISOString(),
  });
}

function renderEbayListingDraftPreview(draft, statusMessage){
  const statusBox = $('listingDraftStatus');
  const previewBox = $('listingDraftPreview');

  if(statusBox){
    if(!draft){
      statusBox.innerHTML = '<p>Noch kein Draft gespeichert.</p>';
    }else{
      const name = draft.briefing?.name || 'Produkt';
      const updated = getDraftTimestamp(draft.updatedAt || draft.savedAt);
      const created = getDraftTimestamp(draft.createdAt || draft.savedAt);
      const status = productStatusMeta(draft.productStatus || draft.status || 'Draft');
      statusBox.innerHTML =
        '<p><strong>' + escapeHtml(statusMessage || 'Draft bereit.') + '</strong></p>' +
        '<p class="hint">Produkt: ' + escapeHtml(name) + '</p>' +
        '<p class="hint">Status: ' + escapeHtml(status.label) + '</p>' +
        '<p class="hint">Listing-Score: ' + escapeHtml(String(draft.listingScore || 0)) + '/100</p>' +
        '<p class="hint">Issues: ' + escapeHtml(String(Array.isArray(draft.issues) ? draft.issues.length : 0)) + '</p>' +
        '<p class="hint">Letzte Prüfung: ' + escapeHtml(draft.lastCheckedAt ? getDraftTimestamp(draft.lastCheckedAt) : 'noch keine') + '</p>' +
        '<p class="hint">Erstellt: ' + escapeHtml(created) + ' · Aktualisiert: ' + escapeHtml(updated) + '</p>' +
        '<p class="hint">Modus: ' + escapeHtml(draft.briefing?.mode || 'hybrid') + '</p>';
    }
  }

  if(previewBox){
    if(!draft){
      previewBox.innerHTML = '<h3>Draft-Vorschau</h3><p>Noch kein Entwurf geladen.</p>';
      return;
    }
    const title = draft.draft?.title || draft.generated?.title || 'Kein Titel';
    const description = draft.draft?.description || draft.generated?.description || 'Keine Beschreibung';
    const notes = draft.draft?.notes || 'Keine Notizen';
    const keywords = draft.generated?.keywords || draft.briefing?.keywords || 'Keine Keywords';
    const status = productStatusMeta(draft.productStatus || draft.status || 'Draft');
    previewBox.innerHTML =
      '<h3>Draft-Vorschau</h3>' +
      '<p><strong>Status:</strong> ' + escapeHtml(status.label) + '</p>' +
      '<p><strong>Listing-Score:</strong> ' + escapeHtml(String(draft.listingScore || 0)) + '/100</p>' +
      '<p><strong>Issues:</strong> ' + escapeHtml(String(Array.isArray(draft.issues) ? draft.issues.length : 0)) + '</p>' +
      '<p><strong>Titel:</strong><br>' + escapeHtml(title) + '</p>' +
      '<p><strong>Beschreibung:</strong><br>' + escapeHtml(description).replace(/\n/g, '<br>') + '</p>' +
      '<p><strong>Keywords:</strong><br>' + escapeHtml(keywords).replace(/\n/g, '<br>') + '</p>' +
      '<p><strong>Notizen:</strong><br>' + escapeHtml(notes).replace(/\n/g, '<br>') + '</p>' +
      '<p><strong>Letzte Prüfung:</strong><br>' + escapeHtml(draft.lastCheckedAt ? getDraftTimestamp(draft.lastCheckedAt) : 'noch keine') + '</p>';
  }
}

function applyEbayListingDraftToForm(draft){
  if(!draft) return;
  const briefing = draft.briefing || {};
  setInputValue('gMainKeyword', briefing.mainKeyword || '');
  setInputValue('gName', briefing.name || '');
  setInputValue('gFeature', briefing.feature || '');
  setInputValue('gUse', briefing.use || '');
  setInputValue('gPain', briefing.pain || '');
  setInputValue('gTone', briefing.tone || 'neutral');
  setInputValue('gKeywords', briefing.keywords || '');
  setInputValue('gMode', briefing.mode || 'hybrid');
  setInputValue('listingTitle', draft.draft?.title || draft.generated?.title || '');
  setInputValue('listingBody', draft.draft?.description || draft.generated?.description || '');
  setInputValue('listingNotes', draft.draft?.notes || '');
}

function loadStoredEbayListingDraft(){
  const raw = localStorage.getItem(EBAY_LISTING_DRAFT_KEY);
  if(!raw) return null;
  try{
    const parsed = JSON.parse(raw);
    if(parsed && typeof parsed === 'object') return normalizeEbayListingDraftRecord(parsed);
  }catch(err){
    return null;
  }
  return null;
}

function persistEbayListingDraft(draft){
  const normalized = normalizeEbayListingDraftRecord(draft);
  localStorage.setItem(EBAY_LISTING_DRAFT_KEY, JSON.stringify(normalized));
  latestEbayListingDraft = normalized;
  renderEbayListingDraftPreview(normalized, 'Draft gespeichert.');
  render();
}

function saveEbayListingDraft(){
  const draft = getEbayListingDraftFromState(latestEbayListingDraft || loadStoredEbayListingDraft() || {});
  const checkState = getSmartListingCheckState();
  persistEbayListingDraft({
    ...draft,
    listingScore: checkState.score,
    issues: checkState.issues,
    lastCheckedAt: new Date().toISOString(),
  });
  toast('Draft gespeichert.');
}

function loadEbayListingDraft(){
  const draft = loadStoredEbayListingDraft();
  if(!draft){
    alert('Noch kein gespeicherter Listing-Draft vorhanden.');
    return;
  }
  latestEbayListingDraft = normalizeEbayListingDraftRecord(draft);
  applyEbayListingDraftToForm(latestEbayListingDraft);
  renderEbayListingDraftPreview(latestEbayListingDraft, 'Draft geladen.');
  render();
  toast('Draft geladen.');
}

function exportEbayListingDraft(){
  const draft = latestEbayListingDraft || loadStoredEbayListingDraft() || getEbayListingDraftFromState();
  if(!draft){
    alert('Kein Draft zum Exportieren vorhanden.');
    return;
  }
  downloadJSON(draft, 'elyon-ebay-draft-' + new Date().toISOString().slice(0,10) + '.json');
  toast('Draft exportiert.');
}

function formatEbayListingDraftText(draft){
  const briefing = draft?.briefing || {};
  const title = draft?.draft?.title || draft?.generated?.title || '';
  const description = draft?.draft?.description || draft?.generated?.description || '';
  const keywords = draft?.generated?.keywords || briefing.keywords || '';
  const notes = draft?.draft?.notes || '';
  const variants = draft?.generated?.titleVariants || '';
  const status = productStatusMeta(draft?.productStatus || draft?.status || 'Draft');
  const issues = Array.isArray(draft?.issues) ? draft.issues : [];
  return [
    'Elyon eBay Draft',
    'Zeitstempel: ' + getDraftTimestamp(draft?.savedAt),
    'Status: ' + status.label,
    'Listing-Score: ' + String(draft?.listingScore || 0) + '/100',
    'Letzte Prüfung: ' + (draft?.lastCheckedAt ? getDraftTimestamp(draft.lastCheckedAt) : 'noch keine'),
    'Issues: ' + String(issues.length),
    'Produkt: ' + (briefing.name || 'n/a'),
    '',
    'Titel',
    title,
    '',
    'Beschreibung',
    description,
    '',
    'Keywords',
    keywords,
    '',
    'Notizen',
    notes,
    '',
    'Titelvarianten',
    variants,
    '',
    'Issues',
    issues.length ? issues.join('\n') : 'Keine offenen Punkte.'
  ].join('\n');
}

function copyEbayListingDraft(){
  const draft = latestEbayListingDraft || loadStoredEbayListingDraft() || getEbayListingDraftFromState();
  const text = formatEbayListingDraftText(draft);
  if(!text.trim()){
    alert('Noch kein Draft zum Kopieren vorhanden.');
    return;
  }
  copyToClipboardSafe(text, 'Draft kopiert.');
}

function refreshEbayListingDraftPreview(){
  latestEbayListingDraft = getEbayListingDraftFromState(latestEbayListingDraft || loadStoredEbayListingDraft() || {});
  renderEbayListingDraftPreview(latestEbayListingDraft, 'Arbeitsstand aktualisiert.');
}

function showGenPanel(panelId, button){
  document.querySelectorAll('.gen-panel').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.gen-tab-btn').forEach(function(b){ b.classList.remove('active'); });
  safe(panelId, function(el){ el.classList.add('active'); });
  if(button) button.classList.add('active');
}
function genCalc(){
  const main = $('gMainKeyword') && $('gMainKeyword').value.trim() ? $('gMainKeyword').value.trim() : '';
  const name = $('gName') && $('gName').value.trim() ? $('gName').value.trim() : 'Produkt';
  const kw = $('gKeywords') && $('gKeywords').value.trim() ? $('gKeywords').value.trim() : '';
  const use = $('gUse') && $('gUse').value.trim() ? $('gUse').value.trim() : '';
  const feat = $('gFeature') && $('gFeature').value.trim() ? $('gFeature').value.trim() : '';
  const mode = $('gMode') ? $('gMode').value : 'hybrid';
  const tone = $('gTone') ? $('gTone').value : 'neutral';
  const pain = $('gPain') && $('gPain').value.trim() ? $('gPain').value.trim() : '';
  const line = String.fromCharCode(10);

  let toneWord = 'Neu';
  if(tone === 'premium') toneWord = 'Premium';
  if(tone === 'deal') toneWord = 'Top Angebot';
  if(tone === 'practical') toneWord = 'Praktisch';

  const seoTitle = normalizeText((main || name) + ' ' + feat + ' ' + use);
  const salesTitle = normalizeText(toneWord + ' ' + name + ' fuer ' + use + ' ' + feat);
  const hybridTitle = normalizeText((main || name) + ' ' + feat + ' - ' + use + ' ' + toneWord);
  const mobileTitle = normalizeText((main || name) + ' ' + feat).slice(0,80);

  let chosen = hybridTitle;
  if(mode === 'seo') chosen = seoTitle;
  if(mode === 'sales') chosen = salesTitle;
  if(mode === 'mobile') chosen = mobileTitle;

  const scored = titleScore(chosen, main || name, kw);
  const mobilePreview = chosen.slice(0,40);
  const ideas = keywordIdeas(main, name, use).concat(kw.split(',').map(function(k){ return k.trim(); }).filter(Boolean));
  const cleanIdeas = Array.from(new Set(ideas)).filter(Boolean).slice(0,14);
  const desc = buildDescription(name, feat, use, pain, tone);
  const cls = scored.score>=75 ? 'good' : scored.score>=50 ? 'warn' : 'bad';
  const charCls = scored.charCount>80 ? 'bad' : scored.charCount<45 ? 'warn' : 'good';
  const legalCls = scored.legalScore>=80 ? 'good' : scored.legalScore>=50 ? 'warn' : 'bad';
  const meterWidth = Math.min(100, Math.round((scored.charCount / 80) * 100));
  const titleVariants = 'SEO: ' + seoTitle + line + 'Sales: ' + salesTitle + line + 'Hybrid: ' + hybridTitle + line + 'Mobil: ' + mobileTitle;
  const warningList = scored.warnings.length ? scored.warnings.map(function(w){ return '<li>' + w + '</li>'; }).join('') : '<li>Keine auffaelligen Risiko-Woerter erkannt.</li>';
  const tipList = scored.tips.length ? scored.tips.map(function(t){ return '<li>' + t + '</li>'; }).join('') : '<li>Titel sieht solide aus.</li>';

  let html = '';
  html += '<div class="score-top"><span class="status ' + cls + '">Gesamt Score: ' + scored.score + '/100</span><span class="score-number">' + scored.score + '</span></div>';
  html += '<div class="progress"><div class="bar" style="width:' + scored.score + '%"></div></div>';
  html += '<div class="dashboard" style="margin-top:16px">';
  html += '<div class="metric"><small>SEO</small><strong>' + scored.seoScore + '</strong></div>';
  html += '<div class="metric"><small>Klick</small><strong>' + scored.clickScore + '</strong></div>';
  html += '<div class="metric"><small>Recht</small><strong>' + scored.legalScore + '</strong></div>';
  html += '<div class="metric"><small>Mobil</small><strong>' + scored.mobileScore + '</strong></div>';
  html += '</div>';
  html += '<div class="output-box"><h3>Empfohlener Titel</h3><p class="title-hero" id="generatedTitleValue">' + chosen + '</p>';
  html += '<div class="char-meter"><div style="width:' + meterWidth + '%"></div></div>';
  html += '<div class="copy-row"><span class="status ' + charCls + '">' + scored.charCount + '/80 Zeichen - ' + scored.charStatus + '</span>';
  html += '<button class="secondary copy-btn" data-copy="generatedTitleValue">Titel kopieren</button>';
  html += '<button class="secondary copy-btn" data-action="shorten-title">Auf 80 Zeichen kuerzen</button></div></div>';
  html += '<div class="gen-tabs">';
  html += '<button class="gen-tab-btn active" data-panel="genPanelTitles">Titel</button>';
  html += '<button class="gen-tab-btn" data-panel="genPanelKeywords">Keywords</button>';
  html += '<button class="gen-tab-btn" data-panel="genPanelDescription">Beschreibung</button>';
  html += '<button class="gen-tab-btn" data-panel="genPanelHints">Hinweise</button>';
  html += '</div>';
  html += '<div id="genPanelTitles" class="gen-panel active">';
  html += '<div class="output-box"><h3>Mobile Vorschau - erste 40 Zeichen</h3><p>' + mobilePreview + (chosen.length>40?'...':'') + '</p></div>';
  html += '<div class="output-box"><h3>A/B Titelvarianten</h3><p id="generatedTitleVariants">' + titleVariants + '</p><button class="secondary copy-btn" data-copy="generatedTitleVariants">Varianten kopieren</button></div></div>';
  html += '<div id="genPanelKeywords" class="gen-panel"><div class="output-box"><h3>Keyword-Ideen</h3><p id="generatedKeywordsValue">' + (cleanIdeas.join(', ') || 'Keine Keywords generiert.') + '</p><button class="secondary copy-btn" data-copy="generatedKeywordsValue">Keywords kopieren</button></div></div>';
  html += '<div id="genPanelDescription" class="gen-panel"><div class="output-box"><h3>Beschreibung</h3><p id="generatedDescriptionValue">' + desc + '</p><button class="secondary copy-btn" data-copy="generatedDescriptionValue">Beschreibung kopieren</button></div></div>';
  html += '<div id="genPanelHints" class="gen-panel"><div class="output-box"><h3>Risiko-Woerter / Safe Check</h3><p><span class="status ' + legalCls + '">Rechts-Sicherheit: ' + scored.legalScore + '/100</span></p><ul>' + warningList + '</ul></div><div class="output-box"><h3>Verbesserungshinweise</h3><ul>' + tipList + '</ul></div></div>';

  setHTML('genResult', html);
  setInputValue('listingTitle', chosen);
  setInputValue('listingBody', desc);
  if(!getInputValue('listingNotes')){
    setInputValue('listingNotes', 'Keywords: ' + cleanIdeas.join(', ') + '\nModus: ' + mode + '\nScore: ' + scored.score + '/100');
  }
  refreshEbayListingDraftPreview();
}
function handleGeneratorClick(event){
  const tabButton = event.target.closest('.gen-tab-btn');
  if(tabButton && tabButton.dataset.panel){
    showGenPanel(tabButton.dataset.panel, tabButton);
    return;
  }
  const copyButton = event.target.closest('[data-copy]');
  if(copyButton && copyButton.dataset.copy){
    copyTextById(copyButton.dataset.copy);
    return;
  }
  const actionButton = event.target.closest('[data-action="shorten-title"]');
  if(actionButton){
    shortenGeneratedTitle();
  }
}
function shortenGeneratedTitle(){
  let current = getGeneratedTitle();
  if(!current){ genCalc(); current = getGeneratedTitle(); }
  if(!current) return;
  const short = shortenTitle(current);
  safe('generatedTitleValue',function(el){ el.textContent=short; });
  const scored = titleScore(short, ($('gMainKeyword') && $('gMainKeyword').value.trim()) || ($('gName') && $('gName').value.trim()) || '', ($('gKeywords') && $('gKeywords').value.trim()) || '');
  alert('Gekuerzter Titel: ' + short + ' (' + scored.charCount + '/80 Zeichen)');
}
function bind(id,event,handler){ safe(id,el=>el.addEventListener(event,handler)); }
function applySettings(){
  document.body.classList.toggle('light', appSettings.theme === 'light');
  document.body.classList.remove('design-midnight','design-aurora','design-emerald','design-slate');
  if(appSettings.designPreset && appSettings.designPreset !== 'classic'){
    document.body.classList.add('design-' + appSettings.designPreset);
  }
  safe('targetProfit',el=>el.value=appSettings.profit);
  safe('fee',el=>el.value=appSettings.fees);
  safe('riskBuffer',el=>el.value=appSettings.buffer);
  safe('bBudget',el=>el.value=appSettings.budget);
  safe('setProfit',el=>el.value=appSettings.profit);
  safe('setFees',el=>el.value=appSettings.fees);
  safe('setBuffer',el=>el.value=appSettings.buffer);
  safe('setBudget',el=>el.value=appSettings.budget);
  safe('setMode',el=>el.value=appSettings.mode);
  safe('setGoProfit',el=>el.value=appSettings.goProfit);
  safe('setMaxDelivery',el=>el.value=appSettings.maxDelivery);
  safe('setMaxSellers',el=>el.value=appSettings.maxSellers);
  safe('setSafeMode',el=>el.checked=appSettings.safeMode);
  safe('setAvoidElectronics',el=>el.checked=appSettings.avoidElectronics);
  safe('setLucidReminder',el=>el.checked=appSettings.lucidReminder);
  safe('setAiEnabled',el=>el.checked=appSettings.aiEnabled !== false);
  safe('setAiProvider',el=>el.value=appSettings.aiProvider || 'openai');
  safe('setAiModel',el=>el.value=appSettings.aiModel || 'gpt-4o-mini');
  safe('setMarket',el=>el.value=appSettings.market);
  safe('setTheme',el=>el.value=appSettings.theme);
  safe('setDesignPreset',el=>el.value=appSettings.designPreset || 'classic');
  safe('setStart',el=>el.value=resolveTabId(appSettings.start || 'dashboardTab'));
}
function readSettingsFromForm(){
  return {
    profit:n('setProfit')||7,
    fees:n('setFees')||15,
    buffer:n('setBuffer')||5,
    budget:n('setBudget')||50,
    mode:$('setMode')?.value||'balanced',
    goProfit:n('setGoProfit')||10,
    maxDelivery:n('setMaxDelivery')||14,
    maxSellers:n('setMaxSellers')||40,
    safeMode: (function(){ const el = $('setSafeMode'); return !!(el && el.checked); })(),
    avoidElectronics: (function(){ const el = $('setAvoidElectronics'); return !!(el && el.checked); })(),
    lucidReminder: (function(){ const el = $('setLucidReminder'); return !!(el && el.checked); })(),
    aiEnabled: (function(){ const el = $('setAiEnabled'); return !!(el && el.checked); })(),
    aiProvider:$('setAiProvider')?.value||'openai',
    aiModel:$('setAiModel')?.value||'gpt-4o-mini',
    market:$('setMarket')?.value||'DE',
    theme:$('setTheme')?.value||'dark',
    designPreset:$('setDesignPreset')?.value||'classic',
    start:resolveTabId($('setStart')?.value||'dashboardTab')
  };
}
function saveSettings(){
  appSettings = { ...defaultSettings, ...readSettingsFromForm() };
  localStorage.setItem('elyonSettings', JSON.stringify(appSettings));
  applySettings();
  render();
  alert('Einstellungen gespeichert und angewendet ✅');
}
function resetSettings(){
  if(!confirm('Einstellungen wirklich zurücksetzen?')) return;
  appSettings = {...defaultSettings};
  localStorage.setItem('elyonSettings', JSON.stringify(appSettings));
  applySettings();
  render();
}
function exportSettings(){
  const rows=[['Setting','Value'],...Object.entries(appSettings)];
  downloadCSV(rows,'elyon-einstellungen.csv');
}
function downloadJSON(data,name){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8;'});
  const link=document.createElement('a');
  link.href=URL.createObjectURL(blob);
  link.download=name;
  link.click();
}
function lastBackupText(){
  const iso=localStorage.getItem('elyonLastBackupAt');
  if(!iso) return 'Noch nie';
  const diff=Math.floor((Date.now()-new Date(iso).getTime())/86400000);
  if(diff<=0) return 'Heute';
  if(diff===1) return 'Gestern';
  return 'Vor '+diff+' Tagen';
}
function backupWarningText(){
  const iso=localStorage.getItem('elyonLastBackupAt');
  if(!iso) return 'Noch kein Komplett-Backup exportiert. Bitte Backup erstellen.';
  const diff=Math.floor((Date.now()-new Date(iso).getTime())/86400000);
  if(diff>=7) return 'Letztes Backup ist '+diff+' Tage alt. Bitte neues Backup exportieren.';
  return '';
}
function exportFullBackup(){
  const data={
    app:'Elyon Seller Tool',
    version:'1.0',
    exportedAt:new Date().toISOString(),
    products: normalizeProductsCollection(products),
    browserImports,
    sales,
    suppliers: loadStoredArray('elyonSuppliers'),
    runningCosts: loadStoredArray('elyonCosts'),
    returns,
    shopifyReturns,
    invoices,
    listingDraft: latestEbayListingDraft || loadStoredEbayListingDraft(),
    settings:appSettings,
    invoiceSettings:invoiceSettings,
    aiAgentsSettings: localStorage.getItem('elyon_ai_agents_settings') || '',
    googleSheetsSync:{
      urlEncrypted: localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.urlEncrypted) || '',
      tokenEncrypted: localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.tokenEncrypted) || '',
      url: localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.url) || '',
      lastInventorySyncAt: localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.inventoryAt) || '',
      lastSupplierSyncAt: localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.supplierAt) || '',
      lastSalesSyncAt: localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.salesAt) || '',
      lastCostsSyncAt: localStorage.getItem(GOOGLE_SHEETS_SYNC_KEYS.costsAt) || '',
    }
  };
  downloadJSON(data,'elyon-komplett-backup.json');
  localStorage.setItem('elyonLastBackupAt',new Date().toISOString());
  render();
}
function importFullBackup(e){
  const file=e.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=function(ev){
    try{
      const data=JSON.parse(String(ev.target.result||'{}'));
      if(!confirm('Backup wirklich wiederherstellen? Aktuelle lokale Daten werden ersetzt.')) return;
      products=normalizeProductsCollection(Array.isArray(data.products)?data.products:[]);
      browserImports=normalizeBrowserImportsCollection(Array.isArray(data.browserImports)?data.browserImports:[]);
      sales=Array.isArray(data.sales)?data.sales:[];
      suppliers=Array.isArray(data.suppliers)?data.suppliers:[];
      runningCosts=Array.isArray(data.runningCosts)?data.runningCosts:[];
      returns=Array.isArray(data.returns)?data.returns:[];
      shopifyReturns=Array.isArray(data.shopifyReturns)?data.shopifyReturns:[];
      invoices=Array.isArray(data.invoices)?data.invoices:[];
      appSettings={...defaultSettings,...(data.settings||{})};
      invoiceSettings={...defaultInvoiceSettings,...(data.invoiceSettings||{})};
      if(data.googleSheetsSync && typeof data.googleSheetsSync === 'object'){
        if(data.googleSheetsSync.urlEncrypted !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.urlEncrypted, String(data.googleSheetsSync.urlEncrypted || ''));
        if(data.googleSheetsSync.url !== undefined) void setStoredGoogleSheetsSyncUrl(String(data.googleSheetsSync.url || ''));
        if(data.googleSheetsSync.tokenEncrypted !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.tokenEncrypted, String(data.googleSheetsSync.tokenEncrypted || ''));
        if(data.googleSheetsSync.token !== undefined) void setStoredGoogleSheetsSyncToken(String(data.googleSheetsSync.token || ''));
        if(data.googleSheetsSync.lastInventorySyncAt !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.inventoryAt, String(data.googleSheetsSync.lastInventorySyncAt || ''));
        if(data.googleSheetsSync.lastSupplierSyncAt !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.supplierAt, String(data.googleSheetsSync.lastSupplierSyncAt || ''));
        if(data.googleSheetsSync.lastSalesSyncAt !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.salesAt, String(data.googleSheetsSync.lastSalesSyncAt || ''));
        if(data.googleSheetsSync.lastCostsSyncAt !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.costsAt, String(data.googleSheetsSync.lastCostsSyncAt || ''));
      }
      localStorage.setItem('elyonProducts',JSON.stringify(products));
      localStorage.setItem('elyonSales',JSON.stringify(sales));
      localStorage.setItem('elyonSuppliers',JSON.stringify(suppliers));
      localStorage.setItem('elyonCosts',JSON.stringify(runningCosts));
      localStorage.setItem('elyonReturns',JSON.stringify(returns));
      localStorage.setItem('elyonShopifyReturns',JSON.stringify(shopifyReturns));
      localStorage.setItem('elyonInvoices',JSON.stringify(invoices));
      if(data.listingDraft){
        localStorage.setItem(EBAY_LISTING_DRAFT_KEY, JSON.stringify(normalizeEbayListingDraftRecord(data.listingDraft)));
      }
      localStorage.setItem('elyonSettings',JSON.stringify(appSettings));
      localStorage.setItem('elyonInvoiceSettings',JSON.stringify(invoiceSettings));
      if(data.aiAgentsSettings !== undefined){
        localStorage.setItem('elyon_ai_agents_settings', String(data.aiAgentsSettings || ''));
      }
      applySettings();
      applyInvoiceSettings();
      renderGoogleSheetsSyncStatus();
      render();
      renderReturns();
      renderShopifyReturns();
      renderReturnsOverview();
      renderSales();
  renderSaleProductOptions();
  renderShippingCockpit();
  renderInvoiceOverview();
      renderReturnProductOptions();
      renderBrowserImports();
      if(typeof window.reloadVirtualAgentsSettings === 'function'){
        window.reloadVirtualAgentsSettings();
      }
      alert('Backup wurde wiederhergestellt.');
      safe('fullBackupImport',el=>el.value='');
    }catch(err){
      alert('Backup konnte nicht gelesen werden. Bitte JSON-Datei prüfen.');
      console.error(err);
    }
  };
  reader.readAsText(file,'UTF-8');
}
function padInvoiceNumber(num){ return String(num).padStart(4,'0'); }
function buildInvoiceNumber(){
  const prefix = invoiceSettings.prefix || 'RE';
  const year = invoiceSettings.useYear === 'yes' ? '-' + new Date().getFullYear() : '';
  const num = padInvoiceNumber(invoiceSettings.nextNumber || 1);
  return prefix + year + '-' + num;
}
function findInvoiceBySaleId(saleId){ return invoices.find(inv=>String(inv.saleId)===String(saleId)); }
function getInvoiceAmount(invoice){
  const sale = sales.find(s=>String(s.id)===String(invoice.saleId));
  if(!sale) return 0;
  return (+sale.price || 0) * (+sale.qty || 1);
}
function invoiceMatchesFilter(invoice,search,statusFilter){
  const sale = sales.find(s=>String(s.id)===String(invoice.saleId));
  const term = String(search||'').toLowerCase().trim();
  const status = invoice.status || 'erstellt';
  if(statusFilter && statusFilter !== 'all' && status !== statusFilter) return false;
  if(!term) return true;
  const haystack = [invoice.number, invoice.date, status, sale ? sale.product : '', sale ? sale.orderNo : '', sale ? sale.platform : ''].join(' ').toLowerCase();
  return haystack.includes(term);
}
function updateInvoiceStatus(invoiceId,status){
  invoices = invoices.map(function(inv){
    return String(inv.id)===String(invoiceId) ? {...inv,status:status} : inv;
  });
  saveInvoices();
}
function downloadInvoiceById(invoiceId){
  showInvoice(invoiceId);
  setTimeout(function(){ downloadInvoiceHTML(); }, 100);
}
function renderInvoiceOverview(){
  const list = $('invoiceList');
  if(!list) return;
  const search = $('invoiceSearch') ? $('invoiceSearch').value : '';
  const statusFilter = $('invoiceStatusFilter') ? $('invoiceStatusFilter').value : 'all';
  const total = invoices.reduce(function(sum,inv){ return sum + getInvoiceAmount(inv); },0);
  const open = invoices.filter(function(inv){ return (inv.status || 'erstellt') === 'erstellt'; }).length;
  const cancelled = invoices.filter(function(inv){ return (inv.status || 'erstellt') === 'storniert'; }).length;
  safe('invoiceCount',function(el){ el.textContent = invoices.length; });
  safe('invoiceTotal',function(el){ el.textContent = euro(total); });
  safe('invoiceOpenCount',function(el){ el.textContent = open; });
  safe('invoiceCancelledCount',function(el){ el.textContent = cancelled; });
  const visible = invoices.filter(function(inv){ return invoiceMatchesFilter(inv,search,statusFilter); });
  if(!visible.length){
    setHTML('invoiceList','<div class="empty">Keine Rechnung passt zu diesem Filter.</div>');
    return;
  }
  const html = visible.map(function(inv){
    const sale = sales.find(function(s){ return String(s.id)===String(inv.saleId); });
    const amount = getInvoiceAmount(inv);
    const status = inv.status || 'erstellt';
    const cls = status === 'bezahlt' ? 'good' : status === 'storniert' ? 'bad' : 'warn';
    let card = '';
    card += '<article class="product-card small-card">';
    card += '<div>';
    card += '<div class="product-title">' + inv.number + '</div>';
    card += '<div class="muted">' + (inv.date || '') + ' · Status: ' + status + '</div>';
    if(sale){
      card += '<div class="pill-row">';
      card += '<span class="pill">Order: ' + (sale.orderNo || 'ohne Order-ID') + '</span>';
      card += '<span class="pill">Produkt: ' + (sale.product || '') + '</span>';
      card += '<span class="pill">Plattform: ' + (sale.platform || 'eBay') + '</span>';
      card += '</div>';
    }else{
      card += '<div class="pill-row"><span class="pill">Zugehörige Bestellung fehlt</span></div>';
    }
    card += '</div>';
    card += '<div class="score-wrap"><span class="status ' + cls + '">' + euro(amount) + '</span></div>';
    card += '<div class="actions">';
    card += '<button class="secondary" data-invoice-open="' + inv.id + '">Anzeigen</button>';
    card += '<button class="secondary" data-invoice-download-id="' + inv.id + '">HTML herunterladen</button>';
    card += '<button class="secondary" data-invoice-status="bezahlt" data-invoice-id="' + inv.id + '">Bezahlt</button>';
    card += '<button class="secondary" data-invoice-status="erstellt" data-invoice-id="' + inv.id + '">Offen</button>';
    card += '<button class="danger" data-invoice-status="storniert" data-invoice-id="' + inv.id + '">Storniert</button>';
    card += '</div>';
    card += '</article>';
    return card;
  }).join('');
  setHTML('invoiceList',html);
}
function handleInvoiceOverviewClick(event){
  const openBtn = event.target.closest('[data-invoice-open]');
  if(openBtn){ showInvoice(Number(openBtn.dataset.invoiceOpen)); return; }
  const downloadBtn = event.target.closest('[data-invoice-download-id]');
  if(downloadBtn){ downloadInvoiceById(Number(downloadBtn.dataset.invoiceDownloadId)); return; }
  const statusBtn = event.target.closest('[data-invoice-status]');
  if(statusBtn){ updateInvoiceStatus(Number(statusBtn.dataset.invoiceId),statusBtn.dataset.invoiceStatus); return; }
}
function createInvoiceForSale(saleId){
  const sale = sales.find(s=>String(s.id)===String(saleId));
  if(!sale){ alert('Bestellung nicht gefunden.'); return; }
  let invoice = findInvoiceBySaleId(saleId);
  if(!invoice){
    invoice = {
      id:Date.now(),
      saleId:sale.id,
      number:buildInvoiceNumber(),
      date:new Date().toLocaleDateString('de-DE'),
      status:'erstellt',
      createdAt:new Date().toISOString()
    };
    invoices.push(invoice);
    invoiceSettings.nextNumber = (+invoiceSettings.nextNumber || 1) + 1;
    localStorage.setItem('elyonInvoiceSettings', JSON.stringify(invoiceSettings));
    saveInvoices();
    applyInvoiceSettings();
  }
  showInvoice(invoice.id);
  renderSales();
}
function invoiceHTML(invoice,sale){
  const qty = +sale.qty || 1;
  const net = (+sale.price || 0) * qty;
  const sellerAddress = String(invoiceSettings.sellerAddress || '').split(String.fromCharCode(13)).join('').split(String.fromCharCode(10)).join('<br>');
  const sellerName = invoiceSettings.sellerName || 'Bitte Verkäuferdaten in Einstellungen eintragen';
  const taxId = invoiceSettings.taxId ? '<div class="invoice-taxid">'+invoiceSettings.taxId+'</div>' : '';
  const paymentNote = invoiceSettings.paymentNote || 'Bereits über Plattform bezahlt.';
  const footerNote = (invoiceSettings.footerNote || '').trim();
  const kleinunternehmer = invoiceSettings.smallBusiness === 'yes' ? 'Kleinunternehmer gemäß § 19 UStG. Es wird keine Umsatzsteuer ausgewiesen.' : '';
  const buyer = sale.customerName || sale.shipToRecipientName || sale.buyerRef || 'Käufer / Plattform-Bestellung';
  const buyerAddress = formatShippingAddressBlock(sale.customerName || sale.shipToRecipientName || '', sale.customerAddressHint || sale.shipToAddressHint || '', composeSaleAddressText(sale) || sale.shipToAddress || '');
  const contactLine = [sale.customerEmail ? 'E-Mail: ' + sale.customerEmail : '', sale.customerPhone ? 'Telefon: ' + sale.customerPhone : ''].filter(Boolean).join(' · ');
  let html='';
  html+='<div class="invoice-top"><div class="invoice-sender"><div class="invoice-label">Absender</div><h1>Rechnung</h1><p><strong>'+sellerName+'</strong><br>'+sellerAddress+'</p>'+taxId+'</div><div class="invoice-meta"><div class="invoice-label">Belegdaten</div><div class="invoice-number">'+invoice.number+'</div><div class="invoice-date">Datum: '+invoice.date+'</div></div></div>';
  html+='<div class="invoice-box"><h3>Rechnung an</h3><p><strong>'+buyer+'</strong><br>Order-ID: '+(sale.orderNo||'ohne Order-ID')+'<br>Plattform: '+(sale.platform||'eBay')+'</p>'+(contactLine ? '<p>'+contactLine+'</p>' : '')+'</div>';
  if(buyerAddress) html += buyerAddress;
  html+='<table class="invoice-table"><thead><tr><th>Position</th><th>Menge</th><th>Einzelpreis</th><th>Gesamt</th></tr></thead><tbody><tr><td>'+sale.product+'</td><td>'+qty+'</td><td>'+euro(sale.price)+'</td><td>'+euro(net)+'</td></tr></tbody></table>';
  html+='<div class="invoice-total">Rechnungsbetrag: '+euro(net)+'</div>';
  html+='<div class="invoice-footer"><p>'+paymentNote+'</p>'+(kleinunternehmer ? '<p>'+kleinunternehmer+'</p>' : '')+(footerNote ? '<p>'+footerNote+'</p>' : '')+'</div>';
  html+='<p class="muted" style="color:#475569;margin-top:14px">Interne Notiz: Gewinn laut Tool '+euro(sale.profit)+'. Diese Zeile dient nur deiner Kontrolle.</p>';
  return html;
}
function showInvoice(invoiceId){
  const invoice = invoices.find(inv=>String(inv.id)===String(invoiceId));
  if(!invoice){ alert('Rechnung nicht gefunden.'); return; }
  const sale = sales.find(s=>String(s.id)===String(invoice.saleId));
  if(!sale){ alert('Zugehörige Bestellung nicht gefunden.'); return; }
  setHTML('invoicePreview', invoiceHTML(invoice,sale));
  safe('invoiceModal',el=>el.classList.remove('hidden'));
}
function closeInvoiceModal(){
  safe('invoiceModal',el=>el.classList.add('hidden'));
}
function getCurrentInvoiceHTMLDocument(){
  const content = $('invoicePreview') ? $('invoicePreview').innerHTML : '';
  const parts = [];
  parts.push('<!doctype html><html lang="de"><head><meta charset="UTF-8"><title>Rechnung</title>');
  parts.push('<style>');
  parts.push('body{font-family:Arial,sans-serif;color:#111827;background:#fff;margin:0;padding:24px;line-height:1.45}');
  parts.push('.page{max-width:794px;margin:0 auto;background:#fff;color:#111827}');
  parts.push('.invoice-top{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;align-items:start;margin-bottom:18px}');
  parts.push('.invoice-sender,.invoice-meta,.invoice-footer{border:1px solid #e5e7eb;border-radius:12px;background:#fff;padding:16px;page-break-inside:avoid;break-inside:avoid}');
  parts.push('.invoice-meta{text-align:right;background:#f8fafc}');
  parts.push('.invoice-label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:8px}');
  parts.push('.invoice-number{font-size:22px;font-weight:900;letter-spacing:-.03em}.invoice-date{margin-top:8px;color:#334155}');
  parts.push('h1{font-size:34px;margin:0 0 8px;color:#111827}h2,h3,p{color:#111827}');
  parts.push('.invoice-box{border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-top:16px;background:#fff;page-break-inside:avoid;break-inside:avoid}');
  parts.push('.invoice-table{width:100%;border-collapse:collapse;margin-top:18px}');
  parts.push('.invoice-table th,.invoice-table td{border-bottom:1px solid #e5e7eb;padding:11px 9px;text-align:left;color:#111827}');
  parts.push('.invoice-table th{background:#f8fafc}.invoice-table th:last-child,.invoice-table td:last-child{text-align:right}');
  parts.push('.invoice-total{text-align:right;font-size:22px;font-weight:900;margin-top:20px;color:#111827}.muted{color:#64748b!important;font-size:12px}.invoice-footer{margin-top:18px;color:#334155;font-size:12px;line-height:1.5}.invoice-footer p{margin:0 0 6px}');
  parts.push('@page{size:A4;margin:12mm}');
  parts.push('@media print{body{padding:0}.page{max-width:none;width:100%}.invoice-meta{text-align:right}}');
  parts.push('</style></head><body><div class="page">');
  parts.push(content);
  parts.push('</div></body></html>');
  return parts.join('');
}
function printInvoice(){
  const preview = $('invoicePreview');
  if(!preview || !preview.innerHTML.trim() || preview.textContent.includes('Noch keine Rechnung')){
    alert('Keine Rechnung ausgewählt.');
    return;
  }
  const html = getCurrentInvoiceHTMLDocument();
  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=980,height=1200');
  if(!printWindow){
    alert('Druckfenster konnte nicht geöffnet werden. Bitte Popups erlauben.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  const triggerPrint = function(){
    try{
      printWindow.focus();
      printWindow.print();
      setTimeout(function(){ try{ printWindow.close(); }catch(err){} }, 500);
    }catch(err){
      alert('Druck konnte nicht gestartet werden: ' + (err && err.message ? err.message : 'unbekannter Fehler'));
    }
  };
  if(printWindow.document.readyState === 'complete') triggerPrint();
  else printWindow.onload = triggerPrint;
}
function downloadInvoiceHTML(){
  const preview = $('invoicePreview');
  if(!preview || !preview.innerHTML.trim() || preview.textContent.includes('Noch keine Rechnung')){
    alert('Keine Rechnung ausgewählt.');
    return;
  }
  const html = getCurrentInvoiceHTMLDocument();
  const blob = new Blob([html],{type:'text/html;charset=utf-8'});
  const link = document.createElement('a');
  const invoiceTitle = preview.querySelector('strong') ? preview.querySelector('strong').textContent.trim() : 'rechnung';
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = invoiceTitle.replace(/[^a-zA-Z0-9-_]/g,'_') + '.html';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(function(){
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    alert('Rechnungsdatei wurde vorbereitet. Falls kein Download startet, prüfe Popups/Downloads im Browser.');
  },300);
}
function handleInvoiceModalClick(event){
  const target = event.target;
  if(!target) return;
  if(target.id === 'printInvoiceBtn') printInvoice();
  if(target.id === 'downloadInvoiceHtmlBtn') downloadInvoiceHTML();
  if(target.id === 'closeInvoiceBtn') closeInvoiceModal();
}
function updateSalePreview(){
  const price = n('salePrice');
  const cost = n('saleCost');
  const fees = n('saleFees');
  const qty = n('saleQty') || 1;
  const revenue = price * qty;
  const totalCost = (cost + fees) * qty;
  const profit = revenue - totalCost;
  const cls = profit > 10 ? 'good' : profit > 0 ? 'warn' : 'bad';
  let text = 'Fülle Verkaufspreis, Kosten, Gebühren und Stückzahl aus.';
  if(price > 0){
    text = profit > 10 ? 'Starker Verkauf. Sauber dokumentieren und Produkt weiter beobachten.' : profit > 0 ? 'Gewinn vorhanden, aber Kosten/Gebühren weiter im Blick behalten.' : 'Achtung: Dieser Verkauf wäre negativ oder bei 0 €. Prüfe Kosten, Gebühren und Preis.';
  }
  let html = '';
  html += '<h3>Gewinn-Vorschau</h3>';
  html += '<p><span class="status '+cls+'">Erwarteter Gewinn: '+euro(profit)+'</span></p>';
  html += '<div class="pill-row"><span class="pill">Umsatz: '+euro(revenue)+'</span><span class="pill">Kosten gesamt: '+euro(totalCost)+'</span><span class="pill">Stück: '+qty+'</span></div>';
  html += '<p>'+text+'</p>';
  setHTML('salePreview',html);
}
function addSale(){
  const productId = $('saleProductId')?.value || '';
  const linkedProduct = products.find(p => String(p.id) === String(productId));
  const price = n('salePrice');
  const cost = n('saleCost');
  const fees = n('saleFees');
  const qty = n('saleQty') || 1;
  const profit = (price - cost - fees) * qty;
  const formShippingStatus = $('saleFormShippingStatus')?.value || 'Noch nicht versendet';
  const formShipDate = $('saleFormShipDate')?.value || ((formShippingStatus==='Versendet'||formShippingStatus==='Zugestellt') ? todayInputDate() : '');
  const customerName = $('saleCustomerName')?.value.trim() || '';
  const customerEmail = $('saleCustomerEmail')?.value.trim() || '';
  const customerPhone = $('saleCustomerPhone')?.value.trim() || '';
  const customerAddressHint = $('saleCustomerAddressHint')?.value.trim() || '';
  const shipToStreet = $('saleShipStreet')?.value.trim() || '';
  const shipToPostalCode = $('saleShipPostalCode')?.value.trim() || '';
  const shipToCity = $('saleShipCity')?.value.trim() || '';
  const shipToCountry = $('saleShipCountry')?.value.trim() || '';
  const shipToAddress = composeSaleAddressText({
    shipToStreet,
    shipToPostalCode,
    shipToCity,
    shipToCountry
  });
  const item = {
    id: Date.now(),
    productId,
    product: linkedProduct?.name || 'Unbekanntes Produkt',
    price,
    cost,
    fees,
    qty,
    profit,
    platform: $('salePlatform')?.value || 'eBay',
    status: $('saleStatus')?.value || 'Bezahlt',
    orderNo: $('saleOrderNo')?.value.trim() || '',
    buyerRef: $('saleBuyerRef')?.value.trim() || '',
    customerName,
    customerEmail,
    customerPhone,
    customerAddressHint,
    shipToRecipientName: customerName || '',
    shipToAddressHint: customerAddressHint,
    shipToStreet,
    shipToPostalCode,
    shipToCity,
    shipToCountry,
    shipToAddress,
    returnFlag: $('saleReturnFlag')?.value || 'no',
    carrier: $('saleFormCarrier')?.value || 'DHL',
    shippingStatus: formShippingStatus,
    trackingNo: $('saleFormTrackingNo')?.value.trim() || '',
    shipDate: formShipDate,
    note: $('saleNote')?.value.trim() || '',
    created: new Date().toLocaleDateString('de-DE')
  };
  sales.push(item);
  saveSales();
  runOrderWorkflowForSale(item, 'verkauf gespeichert');
   ['salePrice','saleCost','saleFees','saleOrderNo','saleBuyerRef','saleCustomerName','saleCustomerEmail','saleCustomerPhone','saleCustomerAddressHint','saleShipStreet','saleShipPostalCode','saleShipCity','saleShipCountry','saleNote'].forEach(id=>safe(id,el=>el.value=''));
  safe('saleQty',el=>el.value=1);
  safe('salePlatform',el=>el.value='eBay');
  safe('saleStatus',el=>el.value='Bezahlt');
  safe('saleReturnFlag',el=>el.value='no');
  safe('saleFormCarrier',el=>el.value='DHL');
  safe('saleFormShippingStatus',el=>el.value='Noch nicht versendet');
  safe('saleFormTrackingNo',el=>el.value='');
  safe('saleFormShipDate',el=>el.value='');
  updateSalePreview();
}
function removeSale(id){ sales = sales.filter(s=>s.id!==id); saveSales(); }
function trackingUrl(carrier,trackingNo){
  const no = encodeURIComponent(String(trackingNo||'').trim());
  const c = String(carrier||'').toLowerCase();
  if(!no) return '';
  if(c.includes('dhl')) return 'https://www.dhl.de/de/privatkunden/dhl-sendungsverfolgung.html?piececode='+no;
  if(c.includes('post')) return 'https://www.deutschepost.de/sendung/simpleQuery.html?locale=de_DE&form.sendungsnummer='+no;
  if(c.includes('hermes')) return 'https://www.myhermes.de/empfangen/sendungsverfolgung/?su='+no;
  if(c.includes('dpd')) return 'https://tracking.dpd.de/status/de_DE/parcel/'+no;
  if(c.includes('gls')) return 'https://gls-group.com/DE/de/paketverfolgung?match='+no;
  if(c.includes('ups')) return 'https://www.ups.com/track?tracknum='+no;
  return '';
}
function orderMatchesFilter(order,search,statusFilter,returnFilter){
  const term = String(search||'').toLowerCase().trim();
  const haystack = [
    order.product,
    order.orderNo,
    order.buyerRef,
    order.customerName,
    order.customerEmail,
    order.customerPhone,
    order.shipToRecipientName,
    order.shipToAddressHint,
    order.shipToStreet,
    order.shipToPostalCode,
    order.shipToCity,
    order.shipToCountry,
    order.shipToAddress,
    order.platform,
    order.status
  ].join(' ').toLowerCase();
  if(term && !haystack.includes(term)) return false;
  if(statusFilter && statusFilter !== 'all' && order.status !== statusFilter) return false;
  if(returnFilter && returnFilter !== 'all' && (order.returnFlag || 'no') !== returnFilter) return false;
  return true;
}
function updateSaleStatus(id,status){
  sales = sales.map(s=>s.id===id ? {...s,status:status} : s);
  saveSales();
}
function updateSaleReturnFlag(id,flag){
  sales = sales.map(s=>s.id===id ? {...s,returnFlag:flag} : s);
  saveSales();
}
function updateSaleShippingStatus(id,status){
  sales = sales.map(s=>s.id===id ? {...s,shippingStatus:status,status:(status==='Versendet' ? 'Versendet' : s.status)} : s);
  saveSales();
}
function handleSalesClick(event){
  const deleteBtn = event.target.closest('[data-sale-delete]');
  if(deleteBtn){ removeSale(Number(deleteBtn.dataset.saleDelete)); return; }
  const statusBtn = event.target.closest('[data-sale-status]');
  if(statusBtn){ updateSaleStatus(Number(statusBtn.dataset.saleId),statusBtn.dataset.saleStatus); return; }
  const returnBtn = event.target.closest('[data-sale-return]');
  if(returnBtn){ updateSaleReturnFlag(Number(returnBtn.dataset.saleId),returnBtn.dataset.saleReturn); return; }
  const shipBtn = event.target.closest('[data-sale-ship]');
  if(shipBtn){ updateSaleShippingStatus(Number(shipBtn.dataset.saleId),shipBtn.dataset.saleShip); return; }
  const invoiceCreateBtn = event.target.closest('[data-invoice-create]');
  if(invoiceCreateBtn){ createInvoiceForSale(Number(invoiceCreateBtn.dataset.invoiceCreate)); return; }
  const invoiceShowBtn = event.target.closest('[data-invoice-show]');
  if(invoiceShowBtn){ showInvoice(Number(invoiceShowBtn.dataset.invoiceShow)); return; }
}
function renderSales(){
  renderSaleProductOptions();
  renderShippingSaleOptions();
  renderShippingCockpit();
  syncEbayOrdersImportPanels();
  const list = $('salesList');
  const summary = $('salesSummary');
  if(!list || !summary) return;
  if(!sales.length){
    summary.className='empty';
    summary.textContent='Noch kein Verkauf erfasst.';
    list.innerHTML='';
    return;
  }
  const totalQty = sales.reduce(function(sum,s){ return sum+(+s.qty||1); },0);
  const totalRevenue = sales.reduce(function(sum,s){ return sum+(+s.price||0)*(+s.qty||1); },0);
  const totalProfit = sales.reduce(function(sum,s){ return sum+(+s.profit||0); },0);
  const avgProfit = totalQty ? totalProfit / totalQty : 0;
  const openOrders = sales.filter(function(s){ return !['Abgeschlossen','Storniert'].includes(s.status || 'Bezahlt'); }).length;
  const openReturns = sales.filter(function(s){ return (s.returnFlag || 'no') === 'open'; }).length;
  summary.className='dashboard';
  summary.innerHTML='<div class="metric"><small>Bestellungen</small><strong>'+totalQty+'</strong></div><div class="metric"><small>Umsatz</small><strong>'+euro(totalRevenue)+'</strong></div><div class="metric"><small>Gewinn</small><strong>'+euro(totalProfit)+'</strong></div><div class="metric"><small>Offen / Retoure</small><strong>'+openOrders+' / '+openReturns+'</strong></div>';
  const searchValue = $('orderSearch') ? $('orderSearch').value : '';
  const statusFilter = $('orderStatusFilter') ? $('orderStatusFilter').value : 'all';
  const returnFilter = $('orderReturnFilter') ? $('orderReturnFilter').value : 'all';
  const visibleSales = sales.filter(function(s){ return orderMatchesFilter(s,searchValue,statusFilter,returnFilter); });
  if(!visibleSales.length){ list.innerHTML='<div class="empty">Keine Bestellung passt zu diesem Filter.</div>'; return; }
  list.innerHTML=visibleSales.map(function(s){
    const cls=s.profit>10?'good':s.profit>0?'warn':'bad';
    const linked=products.find(function(p){ return String(p.id)===String(s.productId||''); });
    const customerSummary = saleCustomerSummary(s);
    let html='';
    html+='<article class="product-card">';
    html+='<div><div class="product-title">'+s.product+'</div>';
    html+='<div class="muted">'+s.created;
    html+=' · Plattform: '+(s.platform||'eBay');
    html+=' · Status: '+(s.status||'Bezahlt');
    if(linked) html+=' · Verknüpft mit: '+linked.name;
    if(s.orderNo) html+=' · Bestellung: '+s.orderNo;
    if(s.buyerRef) html+=' · Käufer-Ref: '+s.buyerRef;
    html+='</div>'; 
    if(customerSummary) html+='<div class="muted" style="margin-top:8px">'+escapeHtml(customerSummary)+'</div>';
    html+='<div class="pill-row"><span class="pill">VK: '+euro(s.price)+'</span><span class="pill">Kosten: '+euro(s.cost)+'</span><span class="pill">Gebühren: '+euro(s.fees)+'</span><span class="pill">Stück: '+s.qty+'</span>';
    if(s.orderNo) html+='<span class="pill">Order: '+s.orderNo+'</span>';
    html+='<span class="pill">Plattform: '+(s.platform||'eBay')+'</span>';
    html+='<span class="pill">Status: '+(s.status||'Bezahlt')+'</span>';
    html+='<span class="pill">Retoure: '+((s.returnFlag==='open')?'offen':(s.returnFlag==='done')?'abgeschlossen':'nein')+'</span>';
    html+='<span class="pill">Versand: '+(s.shippingStatus||'Noch nicht versendet')+'</span>';
    if(s.carrier) html+='<span class="pill">'+s.carrier+'</span>';
    if(s.trackingNo) html+='<span class="pill">Tracking: '+s.trackingNo+'</span>';
    if(s.shipDate) html+='<span class="pill">Versanddatum: '+s.shipDate+'</span>';
    html+='</div>';
    const tUrl = trackingUrl(s.carrier,s.trackingNo);
    if(tUrl) html+='<div class="output-box"><h3>Tracking</h3><p><a href="'+tUrl+'" target="_blank" rel="noopener">Sendung verfolgen</a></p></div>';
    if(s.note) html+='<div class="output-box"><h3>Notiz</h3><p>'+s.note+'</p></div>';
    html+='</div>';
    html+='<div class="score-wrap"><span class="status '+cls+'">Gewinn: '+euro(s.profit)+'</span></div>';
    const invoice=findInvoiceBySaleId(s.id);
    html+='<div class="actions"><button class="secondary" data-sale-status="Versendet" data-sale-id="'+s.id+'">Versendet</button><button class="secondary" data-sale-status="Abgeschlossen" data-sale-id="'+s.id+'">Abschließen</button><button class="secondary" data-sale-status="Problemfall" data-sale-id="'+s.id+'">Problemfall</button><button class="secondary" data-sale-return="open" data-sale-id="'+s.id+'">Retoure offen</button><button class="secondary" data-sale-return="done" data-sale-id="'+s.id+'">Retoure erledigt</button><button class="secondary" data-sale-ship="Versendet" data-sale-id="'+s.id+'">Als versendet</button><button class="secondary" data-sale-ship="Zugestellt" data-sale-id="'+s.id+'">Zugestellt</button>'+(invoice?'<button class="secondary" data-invoice-show="'+invoice.id+'">Rechnung anzeigen</button>':'<button class="secondary" data-invoice-create="'+s.id+'">Rechnung erstellen</button>')+'<button class="danger" data-sale-delete="'+s.id+'">Löschen</button></div>';
    html+='</article>';
    return html;
  }).join('');
}
function addReturn(){
  const sell=n('retSell'), cost=n('retCost'), back=n('retBackCost'), refund=n('retRefund'), fees=n('retFeesLost');
  const linkedProductId = $('retProductId')?.value || '';
  const linkedProduct = products.find(p => String(p.id) === String(linkedProductId));
  const loss = refund + back + fees - Math.max(0, sell - cost);
  const item={id:Date.now(),productId:linkedProductId,product:$('retProduct')?.value.trim()||linkedProduct?.name||'Unbenannte Retoure',sell,cost,back,refund,fees,resell:$('retResell')?.value||'maybe',reason:$('retReason')?.value||'Sonstiges',status:$('retStatus')?.value||'Angefragt',note:$('retNote')?.value.trim()||'',loss,created:new Date().toLocaleDateString('de-DE')};
  returns.push(item);
  saveReturns();
  ['retProduct','retSell','retCost','retBackCost','retRefund','retFeesLost','retNote'].forEach(id=>safe(id,el=>el.value=''));
  safe('retProductId',el=>el.value='');
}
function removeReturn(id){ returns=returns.filter(r=>r.id!==id); saveReturns(); }
function isReturnClosed(status){ return ['Abgeschlossen','Erstattet'].includes(status); }
function isReturnProblem(r){
  const info = returnInsight(r.reason,r.resell,+r.loss||0,r.status);
  return r.status === 'Problemfall' || info.score < 50;
}
function returnMatchesFilter(r,statusFilter,reasonFilter){
  if(reasonFilter && reasonFilter !== 'all' && r.reason !== reasonFilter) return false;
  if(statusFilter === 'open') return !isReturnClosed(r.status);
  if(statusFilter === 'closed') return isReturnClosed(r.status);
  if(statusFilter === 'problem') return isReturnProblem(r);
  return true;
}
function updateReturnStatus(type,id,status){
  if(type === 'ebay'){
    returns = returns.map(r => r.id === id ? {...r,status} : r);
    saveReturns();
    return;
  }
  shopifyReturns = shopifyReturns.map(r => r.id === id ? {...r,status} : r);
  saveShopifyReturns();
}
function handleReturnActionClick(event){
  const btn = event.target.closest('[data-return-action]');
  if(!btn) return;
  const type = btn.dataset.returnType;
  const id = Number(btn.dataset.returnId);
  const action = btn.dataset.returnAction;
  if(action === 'close') updateReturnStatus(type,id,'Abgeschlossen');
  if(action === 'problem') updateReturnStatus(type,id,'Problemfall');
  if(action === 'delete'){
    if(type === 'ebay') removeReturn(id);
    if(type === 'shopify') removeShopifyReturn(id);
  }
}
function renderReturns(){
  renderReturnProductOptions();
  const list=$('returnsList'); const summary=$('returnsSummary'); if(!list||!summary)return;
  if(!returns.length){summary.className='empty';summary.textContent='Noch keine Retoure erfasst.';list.innerHTML='';return;}
  const totalLoss=returns.reduce((s,r)=>s+(+r.loss||0),0);
  const open=returns.filter(r=>!isReturnClosed(r.status)).length;
  const problem=returns.filter(r=>isReturnProblem(r)).length;
  summary.className='dashboard';
  summary.innerHTML='<div class="metric"><small>Retouren</small><strong>'+returns.length+'</strong></div><div class="metric"><small>Offen</small><strong>'+open+'</strong></div><div class="metric"><small>Problemfälle</small><strong>'+problem+'</strong></div><div class="metric"><small>Gesamtverlust</small><strong>'+euro(totalLoss)+'</strong></div>';

  const statusFilter = $('returnStatusFilter') ? $('returnStatusFilter').value : 'all';
  const reasonFilter = $('returnReasonFilter') ? $('returnReasonFilter').value : 'all';
  const visibleReturns = returns.filter(r=>returnMatchesFilter(r,statusFilter,reasonFilter));
  if(!visibleReturns.length){ list.innerHTML='<div class="empty">Keine eBay-Retoure passt zu diesem Filter.</div>'; render(); return; }

  list.innerHTML=visibleReturns.map(r=>{
    const insight=returnInsight(r.reason,r.resell,+r.loss||0,r.status);
    const linkedProduct=products.find(p=>String(p.id)===String(r.productId||''));
    const linkedText = linkedProduct ? ' · Verknüpft mit: '+linkedProduct.name : '';
    const noteBlock = r.note ? '<div class="output-box"><h3>Notiz</h3><p>'+r.note+'</p></div>' : '';
    const productIdPill = linkedProduct ? '<span class="pill">SKU: '+(linkedProduct.sku||'keine SKU')+'</span>' : '';
    let html='';
    html += '<article class="product-card">';
    html += '<div><div class="product-title">↩️ '+r.product+'</div>';
    html += '<div class="muted">'+r.created+' · '+r.reason+' · Status: '+r.status+linkedText+'</div>';
    html += '<div class="pill-row"><span class="pill">VK: '+euro(r.sell)+'</span><span class="pill">Erstattung: '+euro(r.refund)+'</span><span class="pill">Rückversand: '+euro(r.back)+'</span><span class="pill">Wiederverkaufbar: '+r.resell+'</span>'+productIdPill+'</div>';
    html += noteBlock;
    html += '<div class="output-box"><h3>Ursache & Aktion</h3><p>'+insight.cause+String.fromCharCode(10)+insight.action+'</p></div>';
    html += '</div>';
    html += '<div class="score-wrap"><span class="status '+insight.cls+'">'+insight.label+': '+insight.score+'/100</span><div class="muted" style="margin-top:10px">Verlust: '+euro(r.loss)+'</div></div>';
    html += '<div class="actions"><button class="secondary" data-return-action="close" data-return-type="ebay" data-return-id="'+r.id+'">Abschließen</button><button class="secondary" data-return-action="problem" data-return-type="ebay" data-return-id="'+r.id+'">Problemfall</button><button class="danger" data-return-action="delete" data-return-type="ebay" data-return-id="'+r.id+'">Löschen</button></div>';
    html += '</article>';
    return html;
  }).join('');
  render();
}
function addShopifyReturn(){
  const sell=n('shRetSell'), cost=n('shRetCost'), refund=n('shRetRefund'), back=n('shRetBackCost'), fees=n('shRetFeesLost'), ads=n('shRetAdsLost');
  const grossProfit = Math.max(0, sell - cost);
  const loss = refund + back + fees + ads - grossProfit;
  const item={
    id:Date.now(),
    product:$('shRetProduct')?.value.trim()||'Unbenannte Shopify-Retoure',
    sell,cost,refund,back,fees,ads,loss,
    resell:$('shRetResell')?.value||'maybe',
    reason:$('shRetReason')?.value||'Sonstiges',
    status:$('shRetStatus')?.value||'Angefragt',
    note:$('shRetNote')?.value.trim()||'',
    created:new Date().toLocaleDateString('de-DE')
  };
  shopifyReturns.push(item);
  saveShopifyReturns();
  ['shRetProduct','shRetSell','shRetCost','shRetRefund','shRetBackCost','shRetFeesLost','shRetAdsLost','shRetNote'].forEach(id=>safe(id,el=>el.value=''));
}
function removeShopifyReturn(id){ shopifyReturns=shopifyReturns.filter(r=>r.id!==id); saveShopifyReturns(); }
function returnInsight(reason, resell, loss, status){
  let score = 100;
  let action = 'Kosten beobachten und sauber dokumentieren.';
  let cause = 'Normale Retoure / Kundenerwartung prüfen.';
  if(loss > 0) score -= 15;
  if(loss > 10) score -= 20;
  if(loss > 25) score -= 20;
  if(status === 'Problemfall') score -= 25;
  if(resell === 'maybe') score -= 8;
  if(resell === 'no') score -= 18;

  if(reason === 'Artikel defekt'){
    score -= 25;
    cause = 'Produktqualität / Lieferant prüfen.';
    action = 'Produkt nicht weiter pushen, Lieferant prüfen und Defektquote beobachten.';
  } else if(reason === 'Beschreibung/Bilder unklar' || reason === 'Landingpage/Beschreibung unklar'){
    score -= 18;
    cause = 'Listing-/Produktseiten-Problem.';
    action = 'Titel, Bilder, Beschreibung, Maße, Varianten und Erwartung klarer machen.';
  } else if(reason === 'Zu spät geliefert'){
    score -= 18;
    cause = 'Lieferzeit-/Supplier-Problem.';
    action = 'Lieferzeit realistischer angeben oder Lieferant wechseln.';
  } else if(reason === 'Falscher Artikel'){
    score -= 20;
    cause = 'Fulfillment-/Supplier-Fehler.';
    action = 'Bestellprozess, SKU, Lieferanten-ID und Produktvariante prüfen.';
  } else if(reason === 'Kunde gefällt es nicht'){
    score -= 8;
    cause = 'Erwartung oder Produktnutzen nicht stark genug.';
    action = 'Bilder, Nutzenversprechen und Zielgruppe prüfen.';
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const cls = score >= 75 ? 'good' : score >= 50 ? 'warn' : 'bad';
  const label = score >= 75 ? 'Harmlos' : score >= 50 ? 'Beobachten' : 'Problemfall';
  return {score, cls, label, cause, action};
}
function topReasonText(allReturns){
  if(!allReturns.length) return 'Noch keine Daten.';
  const counts = {};
  allReturns.forEach(r=>{ const key=r.reason||'Sonstiges'; counts[key]=(counts[key]||0)+1; });
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  return top ? top[0] + ' (' + top[1] + 'x)' : 'Noch keine Daten.';
}
function problemProductRankingHTML(){
  const grouped = {};
  returns.forEach(r=>{
    const name = r.product || 'Unbekannt';
    if(!grouped[name]) grouped[name]={platform:'eBay',count:0,loss:0,open:0};
    grouped[name].count++;
    grouped[name].loss += +r.loss||0;
    if(!['Abgeschlossen','Erstattet'].includes(r.status)) grouped[name].open++;
  });
  shopifyReturns.forEach(r=>{
    const name = r.product || 'Unbekannt';
    if(!grouped[name]) grouped[name]={platform:'Shopify',count:0,loss:0,open:0};
    if(grouped[name].platform !== 'Shopify') grouped[name].platform = 'eBay/Shopify';
    grouped[name].count++;
    grouped[name].loss += +r.loss||0;
    if(!['Abgeschlossen','Erstattet'].includes(r.status)) grouped[name].open++;
  });
  const rows = Object.entries(grouped).sort((a,b)=>b[1].loss-a[1].loss || b[1].count-a[1].count).slice(0,5);
  if(!rows.length) return 'Noch keine archivierten Produkte erkannt.';
  return '<ul>'+rows.map(([name,data])=>'<li><strong>'+name+'</strong> · '+data.platform+' · '+data.count+' Retoure(n) · Verlust: '+euro(data.loss)+' · offen: '+data.open+'</li>').join('')+'</ul>';
}
function renderReturnsOverview(){
  const ebayLoss = returns.reduce((sum,r)=>sum+(+r.loss||0),0);
  const shopifyLoss = shopifyReturns.reduce((sum,r)=>sum+(+r.loss||0),0);
  const allReturns = [...returns, ...shopifyReturns];
  const totalLoss = ebayLoss + shopifyLoss;
  const ebayOpen = returns.filter(r=>!['Abgeschlossen','Erstattet'].includes(r.status)).length;
  const shopifyOpen = shopifyReturns.filter(r=>!['Abgeschlossen','Erstattet'].includes(r.status)).length;
  const openTotal = ebayOpen + shopifyOpen;
  const problemTotal = allReturns.filter(r=>{
    const info = returnInsight(r.reason,r.resell,+r.loss||0,r.status);
    return info.score < 50 || r.status === 'Problemfall';
  }).length;
  safe('returnsOverviewTotalCount',el=>el.textContent=allReturns.length);
  safe('returnsOverviewOpenCount',el=>el.textContent=openTotal);
  safe('returnsOverviewProblemCount',el=>el.textContent=problemTotal);
  safe('returnsOverviewTotalLoss',el=>el.textContent=euro(totalLoss));
  safe('returnsOverviewEbayCount',el=>el.textContent=returns.length);
  safe('returnsOverviewEbayLoss',el=>el.textContent=euro(ebayLoss));
  safe('returnsOverviewShopifyCount',el=>el.textContent=shopifyReturns.length);
  safe('returnsOverviewShopifyLoss',el=>el.textContent=euro(shopifyLoss));
  let hint='Noch keine Retouren erfasst.';
  if(allReturns.length){
    hint='Offen: '+openTotal+' · Problemfälle: '+problemTotal+' · Gesamtverlust: '+euro(totalLoss)+'.';
    if(problemTotal>0) hint += ' Erst Ursache klären, bevor du das betroffene Produkt weiter testest.';
  }
  safe('returnsOverviewHint',el=>el.textContent=hint);
  safe('returnsOverviewTopReason',el=>el.textContent=topReasonText(allReturns));
  setHTML('returnsProblemRanking', problemProductRankingHTML());
}
function showReturnsPanel(panelId, button){
  document.querySelectorAll('.returns-panel').forEach(panel=>panel.classList.remove('active'));
  document.querySelectorAll('.returns-tab-btn').forEach(btn=>btn.classList.remove('active'));
  safe(panelId,el=>el.classList.add('active'));
  if(button) button.classList.add('active');
  renderReturnsOverview();
}
function renderShopifyReturns(){
  const list=$('shopifyReturnsList');
  const summary=$('shopifyReturnsSummary');
  if(!list||!summary)return;
  if(!shopifyReturns.length){
    summary.className='empty';
    summary.textContent='Noch keine Shopify-Retoure erfasst.';
    list.innerHTML='';
    return;
  }
  const totalLoss=shopifyReturns.reduce((sum,r)=>sum+(+r.loss||0),0);
  const adsLost=shopifyReturns.reduce((sum,r)=>sum+(+r.ads||0),0);
  const open=shopifyReturns.filter(r=>!isReturnClosed(r.status)).length;
  const problem=shopifyReturns.filter(r=>isReturnProblem(r)).length;
  summary.className='dashboard';
  summary.innerHTML='<div class="metric"><small>Shopify-Retouren</small><strong>'+shopifyReturns.length+'</strong></div><div class="metric"><small>Offen</small><strong>'+open+'</strong></div><div class="metric"><small>Ads-Verlust</small><strong>'+euro(adsLost)+'</strong></div><div class="metric"><small>Gesamtverlust</small><strong>'+euro(totalLoss)+'</strong></div>';

  const statusFilter = $('shopifyReturnStatusFilter') ? $('shopifyReturnStatusFilter').value : 'all';
  const reasonFilter = $('shopifyReturnReasonFilter') ? $('shopifyReturnReasonFilter').value : 'all';
  const visibleReturns = shopifyReturns.filter(r=>returnMatchesFilter(r,statusFilter,reasonFilter));
  if(!visibleReturns.length){ list.innerHTML='<div class="empty">Keine Shopify-Retoure passt zu diesem Filter.</div>'; return; }

  list.innerHTML=visibleReturns.map(r=>{
    const insight=returnInsight(r.reason,r.resell,+r.loss||0,r.status);
    const noteBlock=r.note?'<div class="output-box"><h3>Notiz</h3><p>'+r.note+'</p></div>':'';
    let html='';
    html += '<article class="product-card">';
    html += '<div><div class="product-title">'+r.product+'</div>';
    html += '<div class="muted">'+r.created+' · '+r.reason+' · Status: '+r.status+'</div>';
    html += '<div class="pill-row"><span class="pill">VK: '+euro(r.sell)+'</span><span class="pill">Erstattung: '+euro(r.refund)+'</span><span class="pill">Ads verloren: '+euro(r.ads)+'</span><span class="pill">Wiederverkaufbar: '+r.resell+'</span></div>';
    html += noteBlock;
    html += '<div class="output-box"><h3>Ursache & Aktion</h3><p>'+insight.cause+String.fromCharCode(10)+insight.action+'</p></div>';
    html += '</div>';
    html += '<div class="score-wrap"><span class="status '+insight.cls+'">'+insight.label+': '+insight.score+'/100</span><div class="muted" style="margin-top:10px">Verlust: '+euro(r.loss)+'</div></div>';
    html += '<div class="actions"><button class="secondary" data-return-action="close" data-return-type="shopify" data-return-id="'+r.id+'">Abschließen</button><button class="secondary" data-return-action="problem" data-return-type="shopify" data-return-id="'+r.id+'">Problemfall</button><button class="danger" data-return-action="delete" data-return-type="shopify" data-return-id="'+r.id+'">Löschen</button></div>';
    html += '</article>';
    return html;
  }).join('');
}
function shopifyPageCalc(){
  const product = $('shProduct')?.value.trim() || 'Produkt';
  const audience = $('shAudience')?.value.trim() || 'deine Kunden';
  const benefit = $('shBenefit')?.value.trim() || 'mehr Komfort im Alltag';
  const features = $('shFeatures')?.value.trim() || 'praktische Funktionen';
  const pain = $('shPain')?.value.trim() || 'ein Problem im Alltag';
  const faq = [
    'Frage: Für wen ist das Produkt geeignet?',
    'Antwort: Für ' + audience + '.',
    '',
    'Frage: Was ist der Hauptnutzen?',
    'Antwort: ' + benefit + '.',
    '',
    'Frage: Was sollte ich vor dem Kauf prüfen?',
    'Antwort: Maße, Varianten, Lieferumfang und Kompatibilität.'
  ].join(String.fromCharCode(10));
  const html = '<div class="output-box"><h3>Hook</h3><p>Mach aus ' + pain + ' eine einfache Lösung: ' + product + ' hilft dir dabei, ' + benefit + ' zu erreichen.</p></div>'+
    '<div class="output-box"><h3>Bulletpoints</h3><ul><li>Ideal für ' + audience + '</li><li>' + features + '</li><li>Fokus auf: ' + benefit + '</li><li>Einfach, praktisch und schnell nutzbar</li></ul></div>'+
    '<div class="output-box"><h3>Beschreibung</h3><p>' + product + ' ist ideal für ' + audience + ', wenn du ' + benefit + ' willst. Die wichtigsten Vorteile: ' + features + '. Dadurch wird das Produkt zu einer einfachen Lösung für dein Problem: ' + pain + '.</p></div>'+
    '<div class="output-box"><h3>FAQ</h3><p>' + faq + '</p></div>'+
    '<div class="output-box"><h3>Call-to-Action</h3><p>Jetzt bestellen und ' + benefit + ' erleben.</p></div>';
  setHTML('shopifyPageResult', html);
}
function shopifyAdCalc(){
  const price=n('adPrice'), cost=n('adCost'), feePct=n('adFeePct'), fixed=n('adFixed'), target=n('adTargetProfit'), spend=n('adSpend');
  const paymentFees = price * (feePct/100) + fixed;
  const profitBeforeAds = price - cost - paymentFees;
  const maxAds = profitBeforeAds - target;
  const profitAfterAds = profitBeforeAds - spend;
  const roasBreakEven = profitBeforeAds>0 ? price / profitBeforeAds : 0;
  const cls = profitAfterAds>=target?'good':profitAfterAds>0?'warn':'bad';
  setHTML('shopifyAdResult','<span class="status '+cls+'">Gewinn nach Ads: '+euro(profitAfterAds)+'</span><div class="dashboard" style="margin-top:16px"><div class="metric"><small>Gewinn vor Ads</small><strong>'+euro(profitBeforeAds)+'</strong></div><div class="metric"><small>Max. Ads</small><strong>'+euro(maxAds)+'</strong></div><div class="metric"><small>Gebühren</small><strong>'+euro(paymentFees)+'</strong></div><div class="metric"><small>Break-even ROAS</small><strong>'+roasBreakEven.toFixed(2)+'</strong></div></div>');
}
function shopifyLandingCalc(){
  const ids=['lpHook','lpImage','lpBenefit','lpCTA','lpTrust','lpShipping','lpReturns','lpFAQ'];
  const labels=['Hook','Bild','Nutzen','CTA','Trust','Versandinfo','Rückgabeinfo','FAQ'];
  const done=ids.filter(id=>$(id)?.checked).length;
  const score=Math.round(done/ids.length*100);
  const missing=ids.map((id,i)=>$(id)?.checked?null:labels[i]).filter(Boolean);
  const cls=score>=80?'good':score>=60?'warn':'bad';
  setHTML('shopifyLandingResult','<span class="status '+cls+'">Landingpage Score: '+score+'/100</span><div class="progress" style="margin-top:14px"><div class="bar" style="width:'+score+'%"></div></div><div class="output-box"><h3>Fehlt noch</h3><p>'+(missing.length?missing.join(', '):'Sieht stark aus.')+'</p></div>');
}
function shopifyStoreScore(){
  const wow=n('opWow'), problem=n('opProblem'), visual=n('opVisual'), margin=n('opMargin');
  let score=(wow+problem+visual+margin)*2.5;
  const ret=$('opReturn')?.value||'low';
  const legal=$('opLegal')?.value||'low';
  if(ret==='medium')score-=8; if(ret==='high')score-=18;
  if(legal==='medium')score-=10; if(legal==='high')score-=25;
  score=Math.max(0,Math.min(100,Math.round(score)));
  const cls=score>=75?'good':score>=50?'warn':'bad';
  const label=score>=75?'Shopify TEST möglich':score>=50?'Erst weiter validieren':'Nicht für Shopify geeignet';
  setHTML('shopifyStoreResult','<span class="status '+cls+'">'+label+' - '+score+'/100</span><div class="progress" style="margin-top:14px"><div class="bar" style="width:'+score+'%"></div></div><div class="output-box"><h3>Einordnung</h3><p>eBay bleibt dein Markttest. Shopify lohnt sich erst, wenn Nachfrage, Marge und Risiko zusammenpassen.</p></div>');
}
function makeSettingsDropdowns(){
  const modal = $('settingsModal');
  if(!modal) return;
  modal.querySelectorAll('.settings-section:not(.settings-dropdown)').forEach(section=>{
    const title = section.querySelector('h3');
    if(!title) return;
    const details = document.createElement('details');
    details.className = 'settings-section settings-dropdown';
    const summary = document.createElement('summary');
    summary.textContent = title.textContent;
    const content = document.createElement('div');
    content.className = 'settings-dropdown-content';
    Array.from(section.childNodes).forEach(node=>{
      if(node !== title) content.appendChild(node);
    });
    details.appendChild(summary);
    details.appendChild(content);
    section.replaceWith(details);
  });

  modal.querySelectorAll('.settings-dropdown').forEach(dropdown=>{
    if(dropdown.dataset.accordionReady === 'yes') return;
    dropdown.dataset.accordionReady = 'yes';
    dropdown.addEventListener('toggle',()=>{
      if(!dropdown.open) return;
      const parent = dropdown.parentElement;
      if(!parent) return;
      Array.from(parent.children).forEach(other=>{
        if(other !== dropdown && other.classList && other.classList.contains('settings-dropdown')){
          other.open = false;
        }
      });
    });
  });
}
function bindEvents(){
  document.body.classList.remove('print-invoice');
  makeSettingsDropdowns();
  bindProductAiDelegation();
  bind('settingsBtn','click',openIntegrations);
  bind('startLauncherBtn','click',openStartLauncher);
  bind('closeStartLauncherBtn','click',closeStartLauncher);
  bind('startRecommendedBtn','click',e=>openStartTarget(e.currentTarget.dataset.startTarget || 'ebay'));
  bind('enterEbayAreaBtn','click',()=>enterStartArea('ebay'));
  bind('enterShopifyAreaBtn','click',()=>enterStartArea('shopify'));
  bind('enterBackofficeAreaBtn','click',()=>enterStartArea('backoffice'));
  bind('startQuickProduct','click',()=>startQuickAction('product'));
  bind('startQuickSale','click',()=>startQuickAction('sale'));
  bind('startQuickShipping','click',()=>startQuickAction('shipping'));
  bind('startOpenOrdersBtn','click',openOrders);
  bind('startQuickInvoice','click',()=>startQuickAction('invoice'));
  bind('startQuickReturn','click',()=>startQuickAction('return'));
  bind('startBackupNowBtn','click',exportFullBackup);
  bind('closeSettings','click',()=>safe('settingsModal',el=>el.classList.add('hidden')));
  bind('saveSettings','click',saveSettings);
  bind('resetSettings','click',resetSettings);
  bind('saveGoogleSheetsSyncBtn','click',saveGoogleSheetsSyncSettings);
  bind('googleSheetsSyncToggleTokenVisibilityBtn','click',()=>{
    const input = $('googleSheetsSyncToken');
    setGoogleSheetsSyncTokenVisibility(!(input && input.type === 'text'));
  });
  bind('syncInventoryGoogleSheetsBtn','click',syncInventoryToGoogleSheet);
  bind('syncSuppliersGoogleSheetsBtn','click',syncSuppliersToGoogleSheet);
  bind('syncSalesGoogleSheetsBtn','click',syncSalesToGoogleSheet);
  bind('clearLocalSalesGoogleSheetsBtn','click',clearLocalSalesGoogleSheets);
  bind('syncSalesGoogleSheetsShortcutBtn','click',syncSalesToGoogleSheetShortcut);
  bind('syncCostsGoogleSheetsBtn','click',syncCostsToGoogleSheet);
  bind('syncAllGoogleSheetsBtn','click',syncAllToGoogleSheet);
  bind('loadAllGoogleSheetsBtn','click',loadAllFromGoogleSheet);
  bind('reconcileAllGoogleSheetsBtn','click',function(){ reconcileAllGoogleSheets({ silent:false }); });
  bind('googleSheetsAutoSyncEnabled','change',saveGoogleSheetsAutoSyncSettings);
  bind('googleSheetsAutoSyncInterval','change',saveGoogleSheetsAutoSyncSettings);
  bind('backupSettings','click',exportSettings);
  bind('fullBackupExport','click',exportFullBackup);
  bind('fullBackupImportBtn','click',()=>safe('fullBackupImport',el=>el.click()));
  bind('fullBackupImport','change',importFullBackup);
  bind('dashboardBtn','click',showDashboard);
  bind('ordersBtn','click',openOrders);
  bind('launcherNewProduct','click',scrollToProductForm);
  bind('launcherBoard','click',openProductBoard);
  bind('launcherGenerator','click',openGenerator);
  bind('launcherSales','click',openSalesAssistant);
  bind('launcherReturns','click',openReturnsCenter);
  bind('launcherBackup','click',exportFullBackup);
  bind('returnsBtn','click',()=>showTab('returnsTab'));
  bind('shopifyMenu','change',e=>showShopifyTool(e.target.value));
  bind('mainMenu','change',e=>{
    const value = e.target.value;
    if(value === 'importTab'){ openImportCheck(); return; }
    if(value === 'marketCheckTab'){ openMarketCheck(); return; }
    if(value === 'financeTab'){ openFinanceTool(); return; }
    if(value === 'listingCheckTab'){ openListingCheck(); return; }
    if(value === 'productStatusTab'){ openProductStatus(); return; }
    showTab(value);
  });
  bind('importBtn','click',toggleCsvImportMenu);
  bind('localCsvImportBtn','click',openLocalCsvImport);
  bind('googleCsvImportBtn','click',showGoogleSheetImport);
  bind('loadGoogleSheetBtn','click',loadGoogleSheetCSV);
  bind('confirmCsvImportBtn','click',confirmCsvImport);
  bind('cancelCsvImportBtn','click',cancelCsvImport);
  bind('csvImport','change',importCSV);
  bind('exportBtn','click',exportCSV);
  bind('clearBtn','click',clearAll);
  bind('addProductBtn','click',addProduct);
  bind('cancelEditProductBtn','click',clearProductForm);
  bind('productEditSaveBtn','click',saveProductEditModal);
  bind('productEditCancelBtn','click',closeProductEditModal);
  bind('productEditCloseBtn','click',closeProductEditModal);
  safe('productEditModal', el => el.addEventListener('click', event => { if(event.target === el) closeProductEditModal(); }));
  bind('search','input',render);
  bind('filter','change',render);
  bind('sort','change',render);
  bind('newProductBtn','click',scrollToProductForm);
  bind('winnerFilterBtn','click',()=>setProductFilter('winner'));
  bind('shopifyFilterBtn','click',()=>setProductFilter('shopify'));
  bind('killFilterBtn','click',()=>setProductFilter('kill'));
  bind('toggleViewBtn','click',toggleProductView);
  bind('browserImportsRefreshBtn','click',()=>hydrateBrowserImportsFromBackend());
  bind('browserImportsOpenBtn','click',()=>showTab('productListTab'));
  bind('researchBtn','click',runResearchCheck);
  bind('legalBtn','click',legalCheck);
  bind('priceBtn','click',priceCalc);
  bind('budgetBtn','click',budgetCalc);
  bind('listingBtn','click',listingCheck);
  bind('resetListingBtn','click',resetListing);
  bind('trackingBtn','click',trackingCalc);
  bind('financeBtn','click',financeCalc);
  bind('warningBtn','click',warningCalc);
  bind('monthlyReportExportBtn','click',exportMonthlyReportCSV);
  bind('monthlyReportCopyBtn','click',copyMonthlyReportText);
  bind('eksDraftBtn','click',renderEKSDraft);
  bind('eksDraftDownloadBtn','click',downloadEKSDraft);
  bind('genBtn','click',genCalc);
  bind('shortenTitleBtn','click',shortenGeneratedTitle);
  bind('descGenBtn','click',descriptionGeneratorCalc);
  bind('listingDraftSaveBtn','click',saveEbayListingDraft);
  bind('listingDraftLoadBtn','click',loadEbayListingDraft);
  bind('listingDraftExportBtn','click',exportEbayListingDraft);
  bind('listingDraftCopyBtn','click',copyEbayListingDraft);
  ['gMainKeyword','gName','gFeature','gUse','gPain','gKeywords','listingTitle','listingBody','listingNotes'].forEach(function(id){
    bind(id,'input',refreshEbayListingDraftPreview);
  });
  bind('gTone','change',refreshEbayListingDraftPreview);
  bind('gMode','change',refreshEbayListingDraftPreview);
  bind('aiImproveBtn','click',()=>openAiBillingWarning('listing','improve'));
  bind('aiRegenerateBtn','click',()=>openAiBillingWarning('listing','regenerate'));
  bind('aiCheckBtn','click',()=>openAiBillingWarning('listing','check'));
  bind('aiBillingInfoBtn','click',()=>openAiBillingWarning('listing','regenerate'));
  bind('aiSearchImproveBtn','click',()=>startAiProductSearch('improve'));
  bind('aiSearchAnalyzeBtn','click',()=>startAiProductSearch('analyze'));
  bind('aiSearchBillingBtn','click',()=>openAiBillingWarning('product-search','improve'));
  bind('aiTitleBtn','click',()=>openAiBillingWarning({
    task:'title',
    prompt: buildAiTitlePrompt(),
    buttonId:'aiTitleBtn',
    resultId:'aiResult'
  }));
  bind('aiTagsBtn','click',()=>openAiBillingWarning({
    task:'tags',
    prompt: buildAiTagsPrompt(),
    buttonId:'aiTagsBtn',
    resultId:'aiResult'
  }));
  bind('aiDescBtn','click',()=>openAiBillingWarning({
    task:'description',
    prompt: buildAiDescriptionPrompt(),
    buttonId:'aiDescBtn',
    resultId:'descGenResult'
  }));
  bind('aiScoreBtn','click',()=>openAiBillingWarning({
    task:'product_score',
    prompt: buildAiProductScorePrompt(),
    buttonId:'aiScoreBtn',
    resultId:'researchResult'
  }));
  bind('aiBillingProceedBtn','click',proceedAiBillingAction);
  bind('aiBillingCloseBtn','click',closeAiBillingWarning);
  safe('genResult', el => el.addEventListener('click', handleGeneratorClick));
  safe('descGenResult', el => el.addEventListener('click', handleGeneratorClick));
  safe('aiResult', el => el.addEventListener('click', handleGeneratorClick));
  safe('aiSearchResult', el => el.addEventListener('click', handleGeneratorClick));
  safe('sourceAnalysisResult', el => el.addEventListener('click', handleGeneratorClick));
  safe('productSearchTab', el => el.addEventListener('click', function(event){
    const btn = event.target.closest('[data-sourcing-jump]');
    if(!btn) return;
    setSourcingWorkflowStep(btn.dataset.sourcingStep || '1', btn.dataset.sourcingJump);
  }));
  safe('aiBillingModal', el => el.addEventListener('click', function(event){
    if(event.target === el) closeAiBillingWarning();
  }));
  document.querySelectorAll('.returns-tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>showReturnsPanel(btn.dataset.returnsPanel,btn));
  });
  safe('returnsTab', el => el.addEventListener('click', handleReturnActionClick));
  bind('returnAddBtn','click',addReturn);
  bind('returnStatusFilter','change',renderReturns);
  bind('returnReasonFilter','change',renderReturns);
  bind('shopifyReturnStatusFilter','change',renderShopifyReturns);
  bind('shopifyReturnReasonFilter','change',renderShopifyReturns);
  bind('shopifyReturnAddBtn','click',addShopifyReturn);
  bind('shopifyPageBtn','click',shopifyPageCalc);
  bind('shopifyAdBtn','click',shopifyAdCalc);
  bind('shopifyLandingBtn','click',shopifyLandingCalc);
  bind('shopifyStoreBtn','click',shopifyStoreScore);
  bind('saveIntegrationSettingsBtn','click',saveIntegrationSettings);
  bind('testBackendBtn','click',testBackendConnection);
  bind('ebayConnectPlanBtn','click',prepareEbayIntegration);
  bind('cjConnectPlanBtn','click',prepareCjIntegration);
  bind('setSaveIntegrationSettingsBtn','click',saveIntegrationSettings);
  bind('setTestBackendBtn','click',testBackendConnection);
  bind('setEbayConnectPlanBtn','click',prepareEbayIntegration);
  bind('setCjConnectPlanBtn','click',prepareCjIntegration);
  bind('resetIntegrationSettingsBtn','click',resetIntegrationSettings);
  bind('apiOpenSettingsBtn','click',openIntegrations);
  bind('openAiDashboardBtn','click',openAiDashboard);
  bind('closeAiDashboardBtn','click',()=>safe('aiDashboardModal',el=>el.classList.add('hidden')));
  bind('aiDashRefreshBtn','click',refreshAiDashboardStatus);
  bind('aiDashTestOpenAiBtn','click',()=>testAiRouterProvider('openai'));
  bind('aiDashTestDeepSeekBtn','click',()=>testAiRouterProvider('deepseek'));
  bind('aiDashCloseBtn','click',()=>safe('aiDashboardModal',el=>el.classList.add('hidden')));
  safe('aiDashboardModal', el => el.addEventListener('click', function(event){
    if(event.target === el){
      el.classList.add('hidden');
    }
  }));
  bind('cjSearchBtn','click',searchCjProducts);
  safe('cjSearchResult', el => el.addEventListener('click', function(event){
    const btn = event.target.closest('[data-cj-copy]');
    if(btn) copyCjProductToForm(btn.dataset.cjCopy);
    const draftBtn = event.target.closest('[data-cj-draft]');
    if(draftBtn) copyCjProductToDraft(draftBtn.dataset.cjDraft);
  }));
  bind('ebayCompetitionBtn','click',searchEbayCompetition);
  bind('ebaySearchBtn','click',ebaySuche);
  bind('sourceImportBtn','click',sourceImport);
  bind('manualSourceBtn','click',manualSourceImport);
  bind('analyzeSourceBtn','click',analyzeSourceLink);
  bind('addSupplierBtn','click',function(){ openSupplierForm(); });
  safe('mySuppliersList', function(el){
    el.addEventListener('click', function(event){
      const btn = event.target.closest('[data-supplier-action]');
      const card = event.target.closest('[data-supplier-id]');
      if(!btn || !card) return;
      const id = card.dataset.supplierId;
      if(btn.dataset.supplierAction === 'use') useSupplierAsSource(id);
      if(btn.dataset.supplierAction === 'edit') openSupplierForm(id);
      if(btn.dataset.supplierAction === 'disable') disableSupplier(id);
    });
  });
  bind('ebayOrdersPreviewBtn','click',previewEbayOrders);
  bind('ebayOrdersImportBtn','click',importPreviewedEbayOrders);
  bind('ebayOrdersPreviewBtnOrders','click',previewEbayOrders);
  bind('ebayOrdersImportBtnOrders','click',importPreviewedEbayOrders);
  bind('saveInvoiceSettingsBtn','click',saveInvoiceSettings);
  bind('closeInvoiceBtn','click',closeInvoiceModal);
  bind('closeProductReportBtn','click',closeProductReportModal);
  bind('downloadProductReportBtn','click',downloadProductReport);
  bind('printInvoiceBtn','click',printInvoice);
  bind('downloadInvoiceHtmlBtn','click',downloadInvoiceHTML);
  safe('invoiceModal', el => el.addEventListener('click', handleInvoiceModalClick));
  bind('addSaleBtn','click',addSale);
  bind('saleFormShippingStatus','change',()=>{
    const status = $('saleFormShippingStatus') ? $('saleFormShippingStatus').value : '';
    if((status==='Versendet'||status==='Zugestellt') && $('saleFormShipDate') && !$('saleFormShipDate').value) $('saleFormShipDate').value=todayInputDate();
  });
  bind('shippingSaleId','change',fillShippingFromSelectedSale);
  bind('saveShippingBtn','click',saveShippingForSelectedSale);
  bind('clearShippingBtn','click',clearShippingFields);
  bind('shippingFilter','change',renderShippingCockpit);
  bind('invoiceSearch','input',renderInvoiceOverview);
  bind('invoiceStatusFilter','change',renderInvoiceOverview);
  safe('invoiceList', el => el.addEventListener('click', handleInvoiceOverviewClick));
  bind('saleCarrier','change',renderShippingPreview);
  bind('saleShippingStatus','change',renderShippingPreview);
  bind('saleTrackingNo','input',renderShippingPreview);
  bind('saleShipDate','change',renderShippingPreview);
  safe('automationTab', el => el.addEventListener('click', handleShippingClick));
  ['salePrice','saleCost','saleFees','saleQty'].forEach(id=>safe(id,el=>el.addEventListener('input',updateSalePreview)));
  bind('orderSearch','input',renderSales);
  bind('orderStatusFilter','change',renderSales);
  bind('orderReturnFilter','change',renderSales);
  safe('salesList', el => el.addEventListener('click', handleSalesClick));
}
function runSelfTests(){
  console.assert(!!$('dashboardTab'), 'dashboardTab muss existieren');
  console.assert(!!$('productSearchTab'), 'productSearchTab muss existieren');
  console.assert(!!$('productListTab'), 'productListTab muss existieren');
  console.assert(!!$('productAnalysisTab'), 'productAnalysisTab muss existieren');
  console.assert(!!$('ebayListingTab'), 'ebayListingTab muss existieren');
  console.assert(!!$('ordersTab'), 'ordersTab muss existieren');
  console.assert(!!$('automationTab'), 'automationTab muss existieren');
  console.assert(!!$('settingsTab'), 'settingsTab muss existieren');
  console.assert(!!$('shopifyTab'), 'shopifyTab muss existieren');
  console.assert(!!$('shippingTab'), 'shippingTab muss existieren');
  console.assert(!!$('invoiceTab'), 'invoiceTab muss existieren');
  console.assert(!!$('apiImportTab'), 'apiImportTab muss existieren');
  console.assert(!!$('startLauncherModal'), 'Schnellmenü Modal muss existieren');
    console.assert(typeof openStartLauncher === 'function', 'Schnellmenü öffnen Funktion sollte existieren');
    console.assert(typeof renderStartDashboard === 'function', 'Schnellstart-Status sollte existieren');
    console.assert(typeof getStartRecentEbayOrders === 'function', 'Neue Bestellungen im Schnellstart sollten existieren');
  console.assert(typeof startQuickAction === 'function', 'Schnellstart-Aktionen sollten existieren');
  console.assert(!!$('shopifyMenu'), 'shopifyMenu muss existieren');
  console.assert(!!$('shopifyPageSection'), 'Shopify Produktseiten-Sektion muss existieren');
  console.assert(!!$('shopifyAdSection'), 'Shopify Ad-Sektion muss existieren');
  console.assert(!!$('shopifyLandingSection'), 'Shopify Landingpage-Sektion muss existieren');
  console.assert(!!$('shopifyStoreSection'), 'Shopify Store-Sektion muss existieren');
  console.assert(calcProduct({buy:5,ship:2,sell:20,fee:15,riskBuffer:5,sales:20,competition:10,delivery:7,risk:'low'}).score > 0, 'Score sollte berechnet werden');
  const parsed=parseCSVLine('"Name";"VK";"Notiz mit ; Semikolon"');
  console.assert(parsed.length===3 && parsed[2].includes('Semikolon'), 'CSV Parser sollte Semikolons in Quotes können');
  console.assert(typeof euro(10)==='string' && euro(10).includes('10'), 'Euro-Formatierung sollte String liefern');
  console.assert(defaultSettings.profit===7, 'Default Gewinnziel sollte 7 sein');
  console.assert(typeof appSettings==='object', 'App Settings sollten geladen sein');
  console.assert(Array.isArray(returns), 'Retouren sollten als Array geladen werden');
  console.assert(Array.isArray(shopifyReturns), 'Shopify Retouren sollten als Array geladen werden');
  console.assert(!!$('shopifyReturnsSummary'), 'Shopify Retouren-Auswertung sollte existieren');
  console.assert(!!$('returnsOverviewPanel'), 'Retouren Übersicht sollte existieren');
  console.assert(typeof showReturnsPanel === 'function', 'Retouren Tab Funktion sollte existieren');
  console.assert(typeof updateReturnStatus === 'function', 'Retouren Status Update sollte existieren');
  console.assert(typeof returnMatchesFilter === 'function', 'Retouren Filterlogik sollte existieren');
  console.assert(typeof handleReturnActionClick === 'function', 'Retouren Klickhandler sollte existieren');
  console.assert(Array.isArray(sales), 'Verkäufe sollten als Array geladen werden');
  console.assert(typeof getSalesStatsForProduct === 'function', 'Sales-Stats Funktion sollte existieren');
  console.assert(typeof titleScore === 'function', 'Titel-Score Funktion sollte existieren');
  console.assert(shortenTitle('Dies ist ein sehr langer Testtitel mit sehr vielen unnoetigen Worten und Begriffen fuer eBay Listings und Kunden').length <= 80, 'Titel-Kuerzung sollte maximal 80 Zeichen liefern');
  console.assert(typeof handleGeneratorClick === 'function', 'Generator Click Handler sollte existieren');
  console.assert(typeof descriptionGeneratorCalc === 'function', 'Beschreibungsgenerator sollte existieren');
  console.assert(!!$('descGenBtn'), 'Beschreibungsgenerator Button sollte existieren');
  console.assert(!!$('aiImproveBtn'), 'KI-Verbessern Button sollte existieren');
  console.assert(!!$('aiRegenerateBtn'), 'KI-Neugenerieren Button sollte existieren');
  console.assert(!!$('aiCheckBtn'), 'Listing-pruefen Button sollte existieren');
  console.assert(!!$('aiBillingInfoBtn'), 'KI-Kostenwarnung Button sollte existieren');
  console.assert(!!$('aiBillingModal'), 'KI-Kostenwarnungs-Modal sollte existieren');
  console.assert(!!$('aiResult'), 'KI Ergebnisbereich sollte existieren');
  console.assert(!!$('aiTitleBtn'), 'KI Titel Button sollte existieren');
  console.assert(!!$('aiTagsBtn'), 'KI SEO/Tags Button sollte existieren');
  console.assert(!!$('aiDescBtn'), 'KI Beschreibung Button sollte existieren');
  console.assert(!!$('aiScoreBtn'), 'KI Produktanalyse Button sollte existieren');
  console.assert(!!$('aiUsageStatus'), 'AI Statusanzeige sollte existieren');
  console.assert(typeof triggerProductDecision === 'function', 'KI Produktprüfung Handler sollte existieren');
  console.assert(typeof executeProductDecisionTask === 'function', 'KI Produktprüfung Ausführung sollte existieren');
  console.assert(!!document.querySelector('#filter option[value="ai-unchecked"]'), 'KI Produktfilteroptionen sollten existieren');
  console.assert(!!$('googleSheetsSyncUrl'), 'Google Sheets Sync URL Feld sollte existieren');
  console.assert(!!$('googleSheetsSyncToken'), 'Google Sheets Sync Token Feld sollte existieren');
  console.assert(!!$('googleSheetsSyncStatus'), 'Google Sheets Sync Status sollte existieren');
  console.assert(!!$('aiSearchQuery'), 'KI Produktsuche Eingabe sollte existieren');
  console.assert(!!$('aiSearchImproveBtn'), 'KI Produktsuche verbessern Button sollte existieren');
  console.assert(!!$('aiSearchAnalyzeBtn'), 'KI Produktsuche prüfen Button sollte existieren');
  console.assert(!!$('aiSearchBillingBtn'), 'KI Produktsuche Kostenwarnung Button sollte existieren');
  console.assert(!!$('aiSearchResult'), 'KI Produktsuche Ergebnisbereich sollte existieren');
  console.assert(typeof syncToGoogleSheet === 'function', 'Google Sheets Sync Funktion sollte existieren');
  console.assert(typeof syncInventoryToGoogleSheet === 'function', 'Inventar Sync Funktion sollte existieren');
  console.assert(typeof syncSuppliersToGoogleSheet === 'function', 'Supplier Sync Funktion sollte existieren');
  console.assert(typeof syncSalesToGoogleSheet === 'function', 'Sales Sync Funktion sollte existieren');
  console.assert(typeof syncCostsToGoogleSheet === 'function', 'Kosten Sync Funktion sollte existieren');
  console.assert(typeof syncAllToGoogleSheet === 'function', 'Alles-Sync Funktion sollte existieren');
  console.assert(!!$('sku'), 'SKU Feld sollte existieren');
  console.assert(!!$('supplierId'), 'Lieferanten-ID Feld sollte existieren');
  console.assert(!!$('ebayItemId'), 'eBay Artikelnummer Feld sollte existieren');
  console.assert(!!$('supplierLink'), 'Lieferanten-Link Feld sollte existieren');
  console.assert(typeof exportFullBackup === 'function', 'Komplett-Backup Export sollte existieren');
  console.assert(typeof importFullBackup === 'function', 'Komplett-Backup Import sollte existieren');
  console.assert(typeof csvToImportDraft === 'function', 'CSV Import Draft Funktion sollte existieren');
  console.assert(typeof importCSV === 'function', 'Lokale CSV Import Funktion sollte bestehen bleiben');
  console.assert(typeof loadGoogleSheetCSV === 'function', 'Google Sheets CSV Import sollte existieren');
  console.assert(typeof productCardHTML === 'function', 'Produktkarten Funktion sollte existieren');
  console.assert(typeof productDecisionReport === 'function', 'Produkt-Entscheidungsbericht sollte existieren');
  console.assert(typeof downloadProductReport === 'function', 'Produktbericht Download sollte existieren');
  console.assert(typeof toggleProductView === 'function', 'Produktansicht Toggle sollte existieren');
  console.assert(typeof renderWeeklyReport === 'function', 'Wochenbericht Funktion sollte existieren');
  console.assert(typeof renderMonthlyReport === 'function', 'Monatsbericht Funktion sollte existieren');
  console.assert(typeof exportMonthlyReportCSV === 'function', 'Monatsbericht CSV Export sollte existieren');
  console.assert(typeof buildMonthlyReportData === 'function', 'Monatsbericht Datenfunktion sollte existieren');
  console.assert(typeof renderEKSDraft === 'function', 'EKS-Entwurf Generator sollte existieren');
  console.assert(typeof downloadEKSDraft === 'function', 'EKS-Entwurf Download sollte existieren');
  console.assert(typeof copyToClipboardSafe === 'function', 'Sichere Kopierfunktion sollte existieren');
  console.assert(!!$('weeklyReport'), 'Wochenbericht Bereich sollte existieren');
  console.assert(typeof productDataIssues === 'function', 'Daten-Qualitätscheck sollte existieren');
  console.assert(typeof duplicateSkuList === 'function', 'SKU-Duplikat-Warnung sollte existieren');
  console.assert(typeof getSmartDailyFocus === 'function', 'Intelligenter Tagesfokus sollte existieren');
  console.assert(typeof getTodayFocusData === 'function', 'Tageszentrale Datenfunktion sollte existieren');
  console.assert(typeof renderTodayFocusDashboard === 'function', 'Tageszentrale Renderfunktion sollte existieren');
  console.assert(typeof editProduct === 'function', 'Produkt bearbeiten sollte existieren');
  console.assert(typeof stopProduct === 'function', 'Produkt stoppen sollte existieren');
  console.assert(!!$('productStatus'), 'Produkt-Status Feld sollte existieren');
  console.assert(typeof getSmartListingCheckState === 'function', 'Smart Listing Check sollte existieren');
  console.assert(typeof markEbayReadyFromListing === 'function', 'eBay Ready Markierung sollte existieren');
  console.assert(typeof productHealth === 'function', 'Produkt-Gesundheitsstatus sollte existieren');
  console.assert(!!$('saleOrderNo'), 'Bestellnummer Feld im Verkaufslog sollte existieren');
  console.assert(!!$('saleFormCarrier'), 'Versanddienstleister im Verkaufsassistenten sollte existieren');
  console.assert(!!$('saleFormTrackingNo'), 'Trackingnummer im Verkaufsassistenten sollte existieren');
  console.assert(typeof backupWarningText === 'function', 'Backup-Erinnerung sollte existieren');
  console.assert(!!$('launcherNewProduct'), 'Schnellstart Neues Produkt sollte existieren');
  console.assert(!!$('launcherBackup'), 'Schnellstart Backup sollte existieren');
  console.assert(!!$('setDesignPreset'), 'Design-Varianten sollten in Einstellungen existieren');
  console.assert(!!$('setAiEnabled'), 'KI-Funktionen Schalter sollten in Einstellungen existieren');
  console.assert(!!$('setIntBackendUrl'), 'Integrationen sollten in Einstellungen existieren');
  console.assert(typeof makeSettingsDropdowns === 'function', 'Settings Dropdown Funktion sollte existieren');
  console.assert(typeof renderIntegrationStatus === 'function', 'Integrationen Status Funktion sollte existieren');
  console.assert(typeof openApiImport === 'function', 'Datenimport & API öffnen Funktion sollte existieren');
  console.assert(typeof fetchBackendJSON === 'function', 'Backend Fetch Funktion sollte existieren');
  console.assert(typeof searchCjProducts === 'function', 'CJ Produktsuche sollte existieren');
  console.assert(typeof searchEbayCompetition === 'function', 'eBay Konkurrenzsuche sollte existieren');
  console.assert(typeof ebaySuche === 'function', 'eBay Search Funktion sollte existieren');
  console.assert(!!$('ebaySearchBtn'), 'eBay Search Button sollte existieren');
  console.assert(typeof previewEbayOrders === 'function', 'eBay Bestellimport-Vorschau sollte existieren');
  console.assert(typeof resetIntegrationSettings === 'function', 'Integrationen Reset Funktion sollte existieren');
  console.assert(typeof handleSalesClick === 'function', 'Verkaufs-Assistent Klickhandler sollte existieren');
  console.assert(typeof updateSaleStatus === 'function', 'Bestellstatus Schnellfunktion sollte existieren');
  console.assert(typeof orderMatchesFilter === 'function', 'Bestellfilter sollte existieren');
  console.assert(typeof trackingUrl === 'function', 'Tracking-Link Funktion sollte existieren');
  console.assert(typeof updateSaleShippingStatus === 'function', 'Versandstatus Funktion sollte existieren');
  console.assert(typeof renderShippingSaleOptions === 'function', 'Versand-Bestellauswahl sollte existieren');
  console.assert(typeof saveShippingForSelectedSale === 'function', 'Versanddaten speichern Funktion sollte existieren');
  console.assert(typeof renderShippingCockpit === 'function', 'Versand-Cockpit sollte existieren');
  console.assert(typeof handleShippingClick === 'function', 'Versand-Klickhandler sollte existieren');
  console.assert(typeof shippingIssueText === 'function', 'Versand-Plausibilitätscheck sollte existieren');
  console.assert(typeof updateSalePreview === 'function', 'Gewinn-Vorschau im Verkaufs-Assistenten sollte existieren');
  console.assert(typeof createInvoiceForSale === 'function', 'Rechnungserstellung sollte existieren');
  console.assert(typeof buildInvoiceNumber === 'function', 'Fortlaufende Rechnungsnummer sollte existieren');
  console.assert(typeof renderInvoiceOverview === 'function', 'Rechnungsübersicht sollte existieren');
  console.assert(typeof handleInvoiceOverviewClick === 'function', 'Rechnungsübersicht Klickhandler sollte existieren');
  console.assert(!!$('invoiceModal'), 'Rechnungsmodal sollte existieren');
  console.assert(typeof downloadInvoiceHTML === 'function', 'Rechnungs-HTML-Download sollte existieren');
  console.assert(typeof closeInvoiceModal === 'function', 'Rechnungsmodal schließen sollte existieren');
  console.assert(typeof handleInvoiceModalClick === 'function', 'Rechnungsmodal Klickhandler sollte existieren');
}
document.addEventListener('DOMContentLoaded',()=>{
  initListing();
  bindEvents();
  applySettings();
  applyInvoiceSettings();
  refreshGoogleSheetsSyncSettingsForm().then(renderGoogleSheetsSyncStatus);
  renderAiUsageStatus();
  refreshAiDashboardStatus();
  refreshAiButtonStates();
  const storedEbayDraft = loadStoredEbayListingDraft();
  if(storedEbayDraft){
    latestEbayListingDraft = storedEbayDraft;
    applyEbayListingDraftToForm(storedEbayDraft);
    renderEbayListingDraftPreview(storedEbayDraft, 'Gespeicherter Draft geladen.');
  }else{
    renderEbayListingDraftPreview(null);
  }
  showTab('dashboardTab');
  resetMenusToLabNames();
  safe('toggleViewBtn',el=>el.textContent=productViewMode==='list'?'Kanban-Ansicht':'Listen-Ansicht');
  render();
  renderReturns();
  renderShopifyReturns();
  renderReturnsOverview();
  renderSales();
  renderSaleProductOptions();
  updateSalePreview();
  renderIntegrationStatus();
  refreshSourceProviderOptions();
  renderSupplierCards();
  renderBrowserImports();
  hydrateBrowserImportsFromBackend();
  setSourcingWorkflowStep('1', null, false);
  if(localStorage.getItem('elyonShowStartLauncher') !== 'no') openStartLauncher();
  runSelfTests();
});
  async function searchEbayCompetitionLegacyA(){
  const input = document.getElementById('ebayCompetitionKeyword');
  const keyword = input && input.value.trim() ? input.value.trim() : '';

  if(!keyword){
    alert('Bitte eBay Suchbegriff eingeben.');
    return;
  }

  const box = document.getElementById('ebayCompetitionResult');
  if(!box){
    alert('Ergebnisbox für eBay Konkurrenz nicht gefunden.');
    return;
  }

  box.innerHTML = '<p>eBay Marktdaten werden geladen...</p>';

  try{
    const backendUrl = getBackendUrl();
    if(!backendUrl){
      box.innerHTML = '<p>⚠️ Bitte zuerst die Backend URL speichern.</p>';
      return;
    }
    const params = new URLSearchParams({ q: keyword, limit: '20' });
    const res = await fetch(backendUrl + '/api/ebay/search?' + params.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*'
      }
    });

    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    let rawText = '';
    let data = null;
    try{
      rawText = await res.text();
      data = rawText && contentType.includes('application/json') ? JSON.parse(rawText) : null;
    }catch(parseErr){
      data = null;
    }

    const responseText = rawText || '';
    if(!res.ok){
      const detailMessage = data && (data.error || data.message) ? (data.error || data.message) : responseText || 'Backend-Fehler';
      const statusLabel = 'HTTP ' + res.status + (res.statusText ? ' ' + res.statusText : '');
      throw new Error(statusLabel + ' · ' + detailMessage + (data && data.details ? ' · ' + (typeof data.details === 'string' ? data.details : JSON.stringify(data.details)) : ''));
    }
    if(!data){
      throw new Error('Unerwartete Antwort von /api/ebay/search' + (responseText ? ' · ' + responseText : ''));
    }
    if(data.ok === false){
      const detailsText = typeof data.details === 'string' ? data.details : (data.details ? JSON.stringify(data.details) : '');
      throw new Error((data.status ? 'HTTP ' + data.status + ' · ' : '') + (data.error || data.message || 'eBay Search Fehler') + (detailsText ? ' · ' + detailsText : ''));
    }

    const items = data.items || data.itemSummaries || data.results || [];

    if(!items.length){
      box.innerHTML = '<p>Keine eBay Daten gefunden.</p>';
      return;
    }

    const prices = items
      .map(function(item){
        if(item.price && item.price.value) return Number(item.price.value);
        if(item.price) return Number(item.price);
        if(item.currentPrice) return Number(item.currentPrice);
        return 0;
      })
      .filter(function(price){
        return price > 0;
      });

    const low = prices.length ? Math.min.apply(null, prices) : 0;
    const high = prices.length ? Math.max.apply(null, prices) : 0;
    const avg = prices.length
      ? prices.reduce(function(sum, price){ return sum + price; }, 0) / prices.length
      : 0;

    let html = '';
    html += '<h3>eBay Konkurrenz / Marktdaten</h3>';
    html += '<p class="hint">Datenquelle: /api/ebay/search. Die Konkurrenzwerte werden im Tool berechnet.</p>';

    html += '<div class="dashboard">';
    html += '<div class="metric"><small>Treffer</small><strong>' + items.length + '</strong></div>';
    html += '<div class="metric"><small>Niedrig</small><strong>' + low.toFixed(2) + ' €</strong></div>';
    html += '<div class="metric"><small>Ø Preis</small><strong>' + avg.toFixed(2) + ' €</strong></div>';
    html += '<div class="metric"><small>Hoch</small><strong>' + high.toFixed(2) + ' €</strong></div>';
    html += '</div>';

    html += '<div class="products">';

    items.slice(0,8).forEach(function(item){
      const title = item.title || item.name || 'eBay Treffer';
      const price = item.price && item.price.value ? item.price.value : (item.price || item.currentPrice || '-');
      const currency = item.price && item.price.currency ? item.price.currency : '';
      const condition = item.condition || '-';
      const url = item.itemWebUrl || item.itemAffiliateWebUrl || item.url || '';

      html += '<article class="product-card small-card">';
      html += '<div>';
      html += '<div class="product-title">' + title + '</div>';
      html += '<div class="muted">Preis: ' + price + ' ' + currency + ' · Zustand: ' + condition + '</div>';

      if(url){
        html += '<div class="output-box"><p><a href="' + url + '" target="_blank" rel="noopener">Auf eBay ansehen</a></p></div>';
      }

      html += '</div>';
      html += '<div class="score-wrap"><span class="status warn">Konkurrenz</span></div>';
      html += '</article>';
    });

    html += '</div>';

    box.innerHTML = html;

  }catch(err){
    const message = err && err.message ? err.message : 'Backend nicht erreichbar';
    box.innerHTML =
      '<p>⚠️ eBay Konkurrenz Fehler: ' + message + '</p>' +
      '<p class="hint">Diese Funktion nutzt /api/ebay/search?q=...&limit=20</p>';
  }
}
  async function searchEbayCompetitionLegacyB(){
  const input = document.getElementById('ebayCompetitionKeyword');
  const keyword = input && input.value.trim() ? input.value.trim() : '';

  if(!keyword){
    alert('Bitte eBay Suchbegriff eingeben.');
    return;
  }

  const box = document.getElementById('ebayCompetitionResult');
  if(!box){
    alert('Ergebnisbox für eBay Marktdaten nicht gefunden.');
    return;
  }

  box.innerHTML = '<p>eBay Marktdaten werden geladen...</p>';

  try{
    const backendUrl = getBackendUrl();
    if(!backendUrl){
      box.innerHTML = '<p>Bitte zuerst die Backend URL speichern.</p><p class="hint">Diese Funktion nutzt /api/ebay/search?q=...&limit=20 und braucht eine erreichbare Backend/API-Verbindung.</p>';
      return;
    }
    const res = await fetch(
      backendUrl + '/api/ebay/search?q=' + encodeURIComponent(keyword) + '&limit=20'
    );

    const data = await res.json();

    if(!res.ok){
      throw new Error(data.error || data.message || 'Backend-Fehler');
    }

    const items = data.items || data.itemSummaries || data.results || [];

    if(!items.length){
      box.innerHTML = '<p>Keine eBay Daten gefunden.</p>';
      return;
    }

    const prices = items
      .map(function(item){
        if(item.price && item.price.value) return Number(item.price.value);
        if(item.price) return Number(item.price);
        if(item.currentPrice) return Number(item.currentPrice);
        return 0;
      })
      .filter(function(price){
        return price > 0;
      });

    const low = prices.length ? Math.min.apply(null, prices) : 0;
    const high = prices.length ? Math.max.apply(null, prices) : 0;
    const avg = prices.length
      ? prices.reduce(function(sum, price){ return sum + price; }, 0) / prices.length
      : 0;

    let html = '';
    html += '<h3>eBay Marktdaten / Konkurrenz</h3>';
    html += '<p class="hint">Datenquelle: /api/ebay/search. Die Konkurrenzwerte werden im Tool berechnet.</p>';

    html += '<div class="dashboard">';
    html += '<div class="metric"><small>Treffer</small><strong>' + items.length + '</strong></div>';
    html += '<div class="metric"><small>Niedrig</small><strong>' + low.toFixed(2) + ' €</strong></div>';
    html += '<div class="metric"><small>Ø Preis</small><strong>' + avg.toFixed(2) + ' €</strong></div>';
    html += '<div class="metric"><small>Hoch</small><strong>' + high.toFixed(2) + ' €</strong></div>';
    html += '</div>';

    html += '<div class="products">';

    items.slice(0,8).forEach(function(item){
      const title = item.title || item.name || 'eBay Treffer';
      const price = item.price && item.price.value ? item.price.value : (item.price || item.currentPrice || '-');
      const currency = item.price && item.price.currency ? item.price.currency : '';
      const condition = item.condition || '-';
      const url = item.itemWebUrl || item.itemAffiliateWebUrl || item.url || '';

      html += '<article class="product-card small-card">';
      html += '<div>';
      html += '<div class="product-title">' + title + '</div>';
      html += '<div class="muted">Preis: ' + price + ' ' + currency + ' · Zustand: ' + condition + '</div>';

      if(url){
        html += '<div class="output-box"><p><a href="' + url + '" target="_blank" rel="noopener">Auf eBay ansehen</a></p></div>';
      }

      html += '</div>';
      html += '<div class="score-wrap"><span class="status warn">Konkurrenz</span></div>';
      html += '</article>';
    });

    html += '</div>';

    box.innerHTML = html;

  }catch(err){
    box.innerHTML =
      '<p>⚠️ eBay Marktdaten Fehler: ' + err.message + '</p>' +
      '<p class="hint">Diese Funktion nutzt /api/ebay/search?q=...&limit=20</p>';
  }
}
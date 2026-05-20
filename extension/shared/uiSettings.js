const UI_SETTINGS_KEY = "elyon_extension_ui_settings";

export const DEFAULT_UI_SETTINGS = {
  overlayEnabled: true,
  autoOpenOverlay: false,
  showImagePreview: true,
  autoSaveResearch: false,
  rememberOverlayPosition: true,
  showCommandBarHints: true,
  showTabCountBadges: true,
  notifyOnBackendFallback: true,
  compactPopup: false
};

function normalizeSettings(settings = {}) {
  return {
    overlayEnabled: settings.overlayEnabled !== false,
    autoOpenOverlay: settings.autoOpenOverlay === true,
    showImagePreview: settings.showImagePreview !== false,
    autoSaveResearch: settings.autoSaveResearch === true,
    rememberOverlayPosition: settings.rememberOverlayPosition !== false,
    showCommandBarHints: settings.showCommandBarHints !== false,
    showTabCountBadges: settings.showTabCountBadges !== false,
    notifyOnBackendFallback: settings.notifyOnBackendFallback !== false,
    compactPopup: settings.compactPopup === true
  };
}

export async function getUISettings() {
  try {
    const result = await chrome.storage.local.get(UI_SETTINGS_KEY);
    return normalizeSettings({ ...DEFAULT_UI_SETTINGS, ...(result[UI_SETTINGS_KEY] || {}) });
  } catch {
    return normalizeSettings(DEFAULT_UI_SETTINGS);
  }
}

export async function setUISettings(nextSettings = {}) {
  const current = await getUISettings();
  const merged = normalizeSettings({ ...current, ...nextSettings });
  await chrome.storage.local.set({ [UI_SETTINGS_KEY]: merged });
  return merged;
}

export async function resetUISettings() {
  await chrome.storage.local.set({ [UI_SETTINGS_KEY]: DEFAULT_UI_SETTINGS });
  return DEFAULT_UI_SETTINGS;
}

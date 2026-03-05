export const STORAGE_SELECTED_GROUP_IDS_KEY = "selectedGroupIds";
export const STORAGE_MONITOR_CONFIG_KEY = "monitorConfig";
export const STORAGE_PROFILES_KEY = "savedProfiles";
export const STORAGE_LOADED_GROUPS_KEY = "loadedGroups";
export const STORAGE_GLOBAL_FREQUENCY_KEY = "globalMonitorFrequency";
export const STORAGE_LANGUAGE_KEY = "uiLanguage";
export const STORAGE_PLAN_STATE_KEY = "planState";
export const STORAGE_LICENSE_SESSION_KEY = "licenseSession";
export const STORAGE_LICENSE_EMAIL_KEY = "licenseEmail";
export const STORAGE_DEVICE_ID_KEY = "deviceId";
export const STORAGE_TERMS_ACCEPTANCE_KEY = "termsAcceptance";
export const STORAGE_ONBOARDING_STATE_KEY = "onboardingState";
export const STORAGE_NOTIFICATION_SETTINGS_KEY = "notificationSettingsGlobal";
export const STORAGE_GUIDED_TIPS_DISMISSED_KEY = "guidedTipsDismissed";
export const PLAN_CACHE_TTL_MS = 30 * 60 * 1000;

// Fixed Supabase project config
export const SUPABASE_URL = "https://hfnwpzglvbzkvhrcwmet.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbndwemdsdmJ6a3ZocmN3bWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY0NTMzOTAsImV4cCI6MjAyMjAyOTM5MH0.JeVIhCebEoMB81D43Yd0zS3yN-XF88Zkr4nVjEhpVSM";
export const GUMROAD_PRODUCT_URL =
  "https://theviniciusmartin.gumroad.com/l/gavcoc";
export const LICENSE_ACCESS_FUNCTION_PATH = "/functions/v1/validate-license";

export const PROFILE_WIZARD_STEPS = [
  "name",
  "watch",
  "exclude",
  "summary",
];

export const ORB_STATES = [
  "idle",
  "connecting",
  "monitoring",
  "lead",
  "error",
  "fb-disconnected",
  "paused",
];

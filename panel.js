function qs(id) {
  return document.getElementById(id);
}

function qsa(selector) {
  return Array.from(document.querySelectorAll(selector));
}

const STORAGE_SELECTED_GROUP_IDS_KEY = "selectedGroupIds";
const STORAGE_MONITOR_CONFIG_KEY = "monitorConfig";
const STORAGE_PROFILES_KEY = "savedProfiles";
const STORAGE_LOADED_GROUPS_KEY = "loadedGroups";
const STORAGE_GLOBAL_FREQUENCY_KEY = "globalMonitorFrequency";
const STORAGE_LANGUAGE_KEY = "uiLanguage";
const STORAGE_PLAN_STATE_KEY = "planState";
const STORAGE_AUTH_SESSION_KEY = "authSession";
const STORAGE_AUTH_EMAIL_KEY = "authEmail";
const STORAGE_ONBOARDING_STATE_KEY = "onboardingState";
const PLAN_CACHE_TTL_MS = 30 * 60 * 1000;

// Fixed Supabase project config
const SUPABASE_URL = "https://hfnwpzglvbzkvhrcwmet.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmbndwemdsdmJ6a3ZocmN3bWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDY0NTMzOTAsImV4cCI6MjAyMjAyOTM5MH0.JeVIhCebEoMB81D43Yd0zS3yN-XF88Zkr4nVjEhpVSM";

let selectedGroupIds = new Set();
const lastLoadedGroups = new Map();
let isGroupFetchRunning = false;
let isMonitorRunning = false;
let savedProfiles = [];
let selectedProfileId = "";
let leadsHistory = [];
let orbStateTimeout = null;
let currentLanguage = "en";
let technicalLogEntries = [];
let authPollingTimer = null;
let sleepScheduleState = null;
let onboardingState = "welcome";
let fbConnectFailures = 0;
let isFacebookConnected = false;
let welcomeNudgeTimer = null;
let onboardAlertFrequency = { min: 5, max: 10 };
let globalMonitorFrequency = { min: 5, max: 10 };
let onboardWatchKeywords = [];
let onboardExcludeKeywords = [];
let currentGuidedActions = [];
let guidedCommandHistory = [];
let guidedHistoryCursor = -1;
let onboardingAutoGroupLoadAttempted = false;
let onboardingGroupsProgress = {
  started: false,
  lastCount: 0,
  lastAnnouncedAt: 0,
};
let isCheckingFacebookLogin = false;
const PROFILE_WIZARD_STEPS = [
  "name",
  "watch",
  "exclude",
  "summary",
];
let currentProfileWizardStep = "name";

const ORB_STATES = [
  "idle",
  "connecting",
  "monitoring",
  "lead",
  "error",
  "fb-disconnected",
  "paused",
];

const I18N = {
  en: {
    "brand.tagline": "Catch clients before your competitors do.",
    "footer.fb_status": "FB status",
    "footer.log": "</> Log",
    "status.checking_fb": "checking Facebook session...",
    "btn.upgrade": "Upgrade",
    "btn.maybe_later": "Maybe later",
    "btn.new": "New",
    "btn.delete": "Delete",
    "btn.check_login": "Check Login",
    "btn.fetch_token": "Fetch Token",
    "btn.all_tokens": "All Tokens",
    "btn.profile_age": "Profile Age",
    "common.checking": "Checking...",
    "common.none": "None",
    "tab.home": "🏠 Home",
    "tab.groups": "👥 Groups",
    "tab.alerts": "🎯 Alerts",
    "tab.leads": "📌 Leads",
    "tab.settings": "⚙️ Settings",
    "tab.help": "❓ Help",
    "hero.title": "Monitoring command center",
    "hero.subtitle":
      "Direct leads from Facebook groups. Zero fluff. Fast execution.",
    "home.guided_setup": "Guided Setup",
    "home.live_monitoring": "Live Monitoring",
    "home.activity_log": "Activity Log",
    "home.performance": "Performance Overview",
    "home.system_idle": "System idle",
    "home.system_running": "System running",
    "home.top_groups": "Top groups by leads",
    "home.weekly_trend": "Weekly trend",
    "home.no_group_data": "No lead data yet.",
    "home.leads_7d": "{count} leads in last 7 days",
    "settings.diagnostics": "Diagnostics",
    "groups.search": "Search groups...",
    "groups.load": "Load groups",
    "groups.load_title": "Load Groups",
    "groups.stop": "Stop",
    "groups.select_visible": "Select visible",
    "groups.clear": "Clear",
    "groups.title": "Groups",
    "groups.show_selected_only": "show selected only",
    "groups.no_match": "No groups match \"{term}\".",
    "groups.no_loaded_auto": "No groups loaded yet. Loading will start automatically.",
    "groups.loaded_count": "Loaded: {count}",
    "groups.selected_count": "Selected: {count}",
    "groups.visible_count": "{count} visible",
    "groups.visible_for_count": "{count} visible for \"{term}\"",
    "groups.no_groups_hint": "Looks like you're not in any groups, or Facebook didn't load them yet.",
    "groups.no_visible_filters": "No groups visible with current filters.",
    "groups.none_selected_yet": "No groups selected yet.",
    "groups.select_at_least_one": "Select at least one group.",
    "groups.selected_summary": "{count} selected: {names}",
    "groups.count": "{count} group(s)",
    "groups.select_group": "Select group",
    "groups.fetching": "loading...",
    "groups.error_short": "error",
    "onboard.alert_title": "Configure your first alert",
    "onboard.alert_subtitle": "One simple form. No tab switching.",
    "onboard.alert_name_ph": "e.g. Photography clients",
    "onboard.watch_title": "Watch for (positive keywords)",
    "onboard.exclude_title": "Exclude words (negative keywords)",
    "onboard.keyword_input_ph": "Type and press Enter or comma",
    "onboard.after_setup_title": "After setup",
    "onboard.after_setup_body":
      "Check frequency, sleep schedule and notifications are configured in Settings.",
    "onboard.groups_auto_hint": "Groups are loaded automatically when this step opens.",
    "onboard.groups_loaded": "Loaded: {count}",
    "onboard.groups_selected": "Selected: {count}",
    "onboard.auto_loading": "Loading groups automatically...",
    "onboard.keyword_min": "Keyword must have at least 2 characters.",
    "onboard.keyword_max": "Maximum 20 keywords reached.",
    "onboard.create_save_first": "Create and save one alert first.",
    "onboard.monitoring_active_now": "Monitoring is active now.",
    "onboard.ready_to_monitor": "Ready to monitor.",
    "onboard.monitoring_control": "Monitoring Control",
    "onboard.fb_prompt":
      "Let's pull your groups, but first confirm: are you logged into Facebook on this device?",
    "onboard.fb_checking": "Checking your Facebook login...",
    "onboard.fb_not_connected":
      "Facebook not connected yet. Please log in and try again.",
    "onboard.fb_no_problem":
      "No problem. Open Facebook, log in, then click 'Yes, I'm logged in'.",
    "onboard.groups_pick":
      "Perfect. Choose one or more groups below to monitor.",
    "onboard.continue_bg_loading":
      "Continuing with selected groups. Remaining groups keep loading in background.",
    "onboard.select_group_first": "Select at least one group first.",
    "onboard.alert_ready": "Great. You already have an active alert draft.",
    "onboard.alert_create_first": "Create at least one alert to continue.",
    "onboard.welcome1": "Hello! Welcome to GrabClientsNow.",
    "onboard.welcome2": "I will help you set everything up in a few quick steps.",
    "onboard.welcome_nudge": "Whenever you're ready — just click Get started.",
    "onboard.connect1":
      "First, I need Facebook open in another Chrome tab. That's how I access your groups — no password needed.",
    "onboard.connect2":
      "Done. Log in if needed, then come back here.",
    "onboard.connect_fail":
      "Still having trouble. Tab may be closed or session expired.",
    "onboard.groups1":
      "Which groups do you want to monitor? Select as many as you'd like.",
    "onboard.alert1": "Now configure your first alert.",
    "onboard.alert2":
      "After this, you configure frequency, sleep schedule and notifications in Settings.",
    "onboard.ready1": "You're live. I'll notify you the moment I find a match.",
    "onboard.turn_on_monitoring": "Turn ON monitoring",
    "onboard.turn_off_monitoring": "Turn OFF monitoring",
    "onboard.watch_ph": "Watch for words (comma/new line)",
    "onboard.exclude_ph": "Exclude words (comma/new line)",
    "onboard.freq_default": "Frequency: every 5-10 min",
    "profiles.builder": "Alert Builder",
    "profiles.saved": "Saved Alerts",
    "profiles.none_selected": "none selected",
    "profiles.question_name": "What do you want to call this alert?",
    "profiles.watch_ph":
      "looking for, anyone recommend, need help with",
    "profiles.exclude_ph": "Exclude words",
    "profiles.skip_watch": "Skip - notify me about all posts",
    "profiles.skip": "Skip",
    "profiles.all_posts": "all posts",
    "profiles.configured_in_settings": "configured in Settings",
    "profiles.name_required": "Give this alert a name.",
    "profiles.name_max_40": "Alert name max length is 40 characters.",
    "profiles.hint_descriptive":
      "Hint: use a descriptive name to find this alert faster.",
    "profiles.duplicate_overwrite":
      "Duplicate name detected. Overwriting alert \"{name}\".",
    "profiles.saved_ok": "✅ Alert saved successfully.",
    "profiles.select_to_delete": "Select an alert to delete.",
    "profiles.removed": "🗑️ Alert removed.",
    "profiles.none_saved": "No saved alerts.",
    "profiles.active_label": "active",
    "profiles.name_label": "Alert name",
    "profiles.watch_label": "Watch for words",
    "profiles.exclude_label": "Exclude words",
    "profiles.frequency_label": "Check frequency",
    "profiles.notify_label": "Notifications",
    "monitor.select_alert": "Select an alert",
    "monitor.start": "Start Monitoring",
    "monitor.stop": "Stop Monitoring",
    "monitor.idle": "idle",
    "monitor.waiting": "waiting...",
    "settings.language": "Language",
    "settings.language_hint": "Applies instantly across the extension UI.",
    "settings.account": "Account",
    "settings.data": "Data",
    "settings.debug": "Debug",
    "help.title": "Help & Support",
    "help.support_title": "Support Chat",
    "help.support_body":
      "Open live chat and include your technical log for faster support.",
    "help.feature_title": "Suggest a Feature",
    "help.feature_body": "Share your feature request directly by email.",
    "help.partner_title": "Partnerships & Affiliates",
    "help.partner_body":
      "Business integrations, white-label or affiliate program inquiries.",
    "help.support_cta": "Open live chat",
    "help.feature_cta": "Send suggestion",
    "help.partner_cta": "Contact team",
    "help.aff_title": "Affiliate Program",
    "help.aff_body": "Earn 50% commission per sale, no earnings cap.",
    "help.aff_cta": "Join affiliate program",
    "msg.log_copied": "Technical log copied to clipboard.",
    "msg.log_copy_failed": "Failed to copy technical log: {error}",
    "msg.history_cleared": "Lead history cleared.",
    "msg.history_clear_failed": "Failed to clear lead history: {error}",
    "msg.csv_soon": "CSV export will be enabled in a next phase.",
    "msg.csv_empty": "No leads to export with current filters.",
    "msg.csv_ok": "CSV exported with {count} lead(s).",
    "msg.signed_out": "Signed out.",
    "msg.sleep_saved": "Sleep schedule saved.",
    "msg.sleep_save_failed": "Failed to save sleep schedule: {error}",
    "msg.session_not_active":
      "Session not active yet. Click the magic link and try again.",
    "msg.upgrade_soon":
      "Stripe upgrade flow integration will be enabled in a next phase.",
    "status.monitoring": "monitoring...",
    "status.stopped": "stopped",
    "status.starting": "starting...",
    "status.sleep_mode": "sleep mode",
    "status.checking_now": "checking now...",
    "status.next_check": "next check: ~{mins} min",
    "status.waiting": "waiting...",
    "status.logged": "Logged",
    "status.not_logged": "Not logged",
    "log.groups_loaded_so_far": "groups loaded so far: {count}",
    "log.groups_stream_done":
      "✅ Group fetch finished{stopped}. Total: {total}",
    "log.stopped_suffix": " (stopped)",
    "log.groups_stream_failed": "❌ groupsStream failed: {error}",
    "log.monitor_stopped": "🛑 Monitoring stopped.",
    "log.warmup_done": "⏱️ Warmup complete. Next check in ~{mins} min",
    "log.checked_posts":
      "⏱️ Checked {polled} posts, {matched} matches. Next in ~{mins} min",
    "log.debug_cycle":
      "📥 Debug cycle: {posts} post(s) in selected groups / {feed} total feed{profile}",
    "log.monitor_error": "❌ Monitor error: {error}",
    "log.posts_received":
      "✅ {total} posts received ({selected} in selected groups)",
    "log.new_matches": "🔔 {count} new match(es){profile}",
    "log.no_new_posts_selected": "No new posts from selected groups.",
    "log.logged_as_user": "✅ Logged in as userId={userId}",
    "log.not_logged_facebook": "❌ Not logged in to Facebook",
    "log.not_logged": "❌ Not logged in",
    "log.fetching_token": "Fetching fb_dtsg...",
    "log.token_not_found": "❌ token not found — are you logged into Facebook?",
    "log.fetching_all_tokens": "Fetching all tokens...",
    "log.token_missing": "❌ {key}: not found",
    "log.error_generic": "❌ Error: {error}",
    "log.user_id_short": "✅ userId={userId}",
    "log.cycle_started": "Cycle started.",
    "log.creation_date": "✅ Creation date: {date}",
    "log.creation_date_failed": "❌ Could not fetch creation date",
    "log.stop_groups_requested": "⏹️ Stop group fetch requested...",
    "log.load_groups_first": "Load groups before selecting.",
    "log.selection_saved": "Selection saved: visible groups marked.",
    "log.selection_cleared": "Selection cleared.",
    "log.select_alert_first": "Select an alert before starting monitoring.",
    "log.alert_not_found": "Selected alert no longer exists. Choose another.",
    "log.select_one_group_before_monitor":
      "Select at least 1 group before starting monitoring.",
    "log.start_monitor_failed": "❌ Failed to start monitoring: {error}",
    "log.sleep_mode_active":
      "🌙 Sleep mode active. Monitoring will resume automatically at the configured time.",
    "log.sleep_mode_ended": "☀️ Sleep mode ended.",
    "log.monitor_started": "✅ Monitoring started.",
    "btn.back": "Back",
    "btn.next": "Next",
    "btn.save_alert": "Save Alert",
    "btn.start_monitoring": "Start monitoring",
    "kw.watch_for": "Watch for",
    "kw.exclude_words": "Exclude words",
    "leads.title": "Leads",
    "leads.all_alerts": "All alerts",
    "leads.filter_ph": "Filter by text/person/group",
    "leads.selected_groups_only": "selected groups only",
    "leads.count_7d": "{count} lead(s) in 7 days",
    "leads.empty_7d": "No lead history (last 7 days).",
    "leads.meta_profile": " • alert: {profile}",
    "leads.link_post": "Post link",
    "leads.link_person": "Person profile",
    "leads.link_group": "Group link",
    "leads.no_text": "(no text)",
    "data.export_csv_soon": "Export CSV (soon)",
    "data.clear_lead_history": "Clear Lead History",
    "debug.view_technical_log": "View Technical Log",
    "overlay.technical_log": "Technical Log",
    "overlay.copy_all": "Copy all",
    "overlay.clear": "Clear",
    "overlay.close": "Close",
    "overlay.empty": "[empty]",
    "account.not_signed_in": "Not signed in",
    "account.sign_out": "Sign out",
    "settings.sleep_title": "Monitor Sleep Schedule",
    "settings.sleep_note":
      "Sleep schedule pauses monitoring during rest hours to reduce detection risk. Keep this ON for safer account behavior.",
    "settings.sleep_enable": "Enable sleep schedule",
    "settings.timezone_auto": "Timezone: auto",
    "settings.timezone_label": "Timezone: {timezone}",
    "settings.active_from": "Active from",
    "settings.to": "to",
    "settings.sleep_save": "Save Sleep Schedule",
    "settings.frequency_title": "Check frequency (global)",
    "settings.frequency_note":
      "One global setting for all alerts. Lower intervals are faster but increase detection risk.",
    "settings.freq_15_20_title": "🕐 Every 15-20 min",
    "settings.freq_15_20_desc": "Most discreet · Safest option",
    "settings.freq_5_10_title": "✅ Every 5-10 min",
    "settings.freq_5_10_desc": "Recommended balance · Pro",
    "settings.freq_3_5_title": "🔄 Every 3-5 min",
    "settings.freq_3_5_desc": "Elevated risk · Pro",
    "settings.freq_1_3_title": "⚡ Every 1-3 min",
    "settings.freq_1_3_desc": "Highest risk · Pro",
    "settings.frequency_current": "Current: every {min}-{max} min",
    "settings.notifications_title": "Notifications (global)",
    "settings.notifications_note":
      "Applies to all alerts. You can combine multiple channels.",
    "settings.notify_browser": "🔔 Browser notifications",
    "settings.notify_webhook": "🔗 Webhook (Pro)",
    "settings.notify_slack": "💬 Slack (Pro)",
    "settings.notify_in_app": "🔕 In-app only",
    "sugg.looking_for": "looking for",
    "sugg.anyone_recommend": "anyone recommend",
    "sugg.need_help_with": "need help with",
    "sugg.best_blank": "best ___",
    "sugg.looking_to_hire": "looking to hire",
    "sugg.recommendations_for": "recommendations for",
    "sugg.alternatives_to": "alternatives to",
    "sugg.review": "review",
    "sugg.selling": "selling",
    "sugg.for_sale": "for sale",
    "sugg.hiring": "hiring",
    "sugg.job_post": "job post",
    "sugg.spam": "spam",
    "sugg.partnership": "partnership",
    "plan.pro": "Pro active. Lifetime access unlocked.",
    "plan.free": "Free plan active. Upgrade to unlock all features.",
    "plan.trial": "Trial active. Ends in {time}.",
    "plan.expired": "Trial expired. You're on free plan now.",
    "auth.missing_config":
      "Supabase config missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in panel.js.",
    "auth.title": "Welcome to GrabClientsNow",
    "auth.copy": "Enter your email to get started.",
    "auth.email_ph": "you@email.com",
    "auth.continue": "Continue",
    "auth.clicked_link": "I clicked the link",
    "auth.resend": "Resend email",
    "auth.change_email": "Use a different email",
    "auth.magic_sent":
      "Magic link sent. Check your email and click the sign-in link.",
    "auth.checking": "Checking session...",
    "auth.connected": "Signed in as {email}.",
    "auth.invalid_email": "Enter a valid email address.",
    "auth.new_user_local": "New email detected. Trial started locally, proceeding to onboarding.",
    "plan.block_alerts": "Free plan allows only 1 alert.",
    "plan.block_groups": "Free plan allows up to 3 groups per alert.",
    "plan.block_keywords":
      "Free plan limits: 5 watch words and 3 exclude words.",
    "plan.block_frequency": "Free plan only allows 15–20 minute frequency.",
  },
  "pt-br": {
    "brand.tagline": "Capture clientes antes dos seus concorrentes.",
    "footer.fb_status": "Status FB",
    "footer.log": "</> Log",
    "status.checking_fb": "checando sessão do Facebook...",
    "btn.upgrade": "Upgrade",
    "btn.maybe_later": "Depois",
    "btn.new": "Novo",
    "btn.delete": "Excluir",
    "btn.check_login": "Verificar Login",
    "btn.fetch_token": "Buscar Token",
    "btn.all_tokens": "Todos Tokens",
    "btn.profile_age": "Idade do Perfil",
    "common.checking": "Verificando...",
    "common.none": "Nenhum",
    "tab.home": "🏠 Início",
    "tab.groups": "👥 Grupos",
    "tab.alerts": "🎯 Alertas",
    "tab.leads": "📌 Leads",
    "tab.settings": "⚙️ Configurações",
    "tab.help": "❓ Ajuda",
    "hero.title": "Central de monitoramento",
    "hero.subtitle": "Leads diretos de grupos do Facebook. Sem enrolação.",
    "home.guided_setup": "Setup Guiado",
    "home.live_monitoring": "Monitoramento Ao Vivo",
    "home.activity_log": "Log de Atividade",
    "home.performance": "Visão de Performance",
    "home.system_idle": "Sistema parado",
    "home.system_running": "Sistema rodando",
    "home.top_groups": "Top grupos por leads",
    "home.weekly_trend": "Tendência semanal",
    "home.no_group_data": "Sem dados de leads ainda.",
    "home.leads_7d": "{count} leads nos últimos 7 dias",
    "settings.diagnostics": "Diagnóstico",
    "groups.search": "Buscar grupos...",
    "groups.load": "Carregar grupos",
    "groups.select_visible": "Selecionar visíveis",
    "groups.clear": "Limpar",
    "onboard.alert_title": "Configure seu primeiro alerta",
    "onboard.alert_name_ph": "ex.: Clientes de fotografia",
    "onboard.watch_ph": "Include words (vírgula ou linha)",
    "onboard.exclude_ph": "Exclude words (vírgula ou linha)",
    "onboard.freq_default": "Frequência: a cada 5-10 min",
    "profiles.builder": "Construtor de Alertas",
    "profiles.saved": "Alertas Salvos",
    "profiles.name_label": "Nome do alerta",
    "profiles.watch_label": "Include words",
    "profiles.exclude_label": "Exclude words",
    "profiles.frequency_label": "Frequência de checagem",
    "profiles.notify_label": "Notificações",
    "monitor.select_alert": "Selecione um alerta",
    "monitor.start": "Iniciar Monitoramento",
    "monitor.stop": "Parar Monitoramento",
    "settings.language": "Idioma",
    "settings.language_hint":
      "Aplicação instantânea em toda a interface da extensão.",
    "settings.data": "Dados",
    "settings.debug": "Debug",
    "help.title": "Ajuda e Suporte",
    "help.support_title": "Chat de Suporte",
    "help.support_body":
      "Abra o chat ao vivo e envie o log técnico para acelerar o suporte.",
    "help.feature_title": "Sugerir Funcionalidade",
    "help.feature_body":
      "Envie sua sugestão de melhoria diretamente por e-mail.",
    "help.partner_title": "Parcerias e Afiliados",
    "help.partner_body":
      "Integrações, white-label e dúvidas sobre o programa de afiliados.",
    "help.support_cta": "Abrir chat ao vivo",
    "help.feature_cta": "Enviar sugestão",
    "help.partner_cta": "Falar com time",
    "help.aff_title": "Programa de Afiliados",
    "help.aff_body": "Ganhe 50% de comissão por venda, sem teto.",
    "help.aff_cta": "Entrar no programa",
    "msg.log_copied": "Log técnico copiado para a área de transferência.",
    "msg.log_copy_failed": "Falha ao copiar log técnico: {error}",
    "msg.history_cleared": "Histórico de leads limpo.",
    "msg.history_clear_failed": "Falha ao limpar histórico de leads: {error}",
    "msg.csv_soon": "Exportação CSV será ampliada na próxima fase.",
    "msg.csv_empty": "Não há leads para exportar com os filtros atuais.",
    "msg.csv_ok": "CSV exportado com {count} lead(s).",
    "plan.pro": "Pro ativo. Acesso vitalício liberado.",
    "plan.free": "Plano Free ativo. Faça upgrade para desbloquear tudo.",
    "plan.trial": "Trial ativo. Termina em {time}.",
    "plan.expired": "Trial expirado. Você está no plano Free.",
    "auth.missing_config":
      "Config do Supabase ausente. Defina SUPABASE_URL e SUPABASE_ANON_KEY no panel.js.",
    "auth.title": "Bem-vindo ao GrabClientsNow",
    "auth.copy": "Digite seu e-mail para começar.",
    "auth.email_ph": "voce@email.com",
    "auth.continue": "Continuar",
    "auth.clicked_link": "Já cliquei no link",
    "auth.resend": "Reenviar e-mail",
    "auth.change_email": "Usar outro e-mail",
    "auth.magic_sent":
      "Link mágico enviado. Confira seu e-mail e clique para entrar.",
    "auth.checking": "Verificando sessão...",
    "auth.connected": "Conectado como {email}.",
    "auth.invalid_email": "Informe um e-mail válido.",
    "auth.new_user_local": "E-mail novo detectado. Trial iniciado localmente, seguindo para onboarding.",
    "plan.block_alerts": "Plano Free permite apenas 1 alerta.",
    "plan.block_groups": "Plano Free permite até 3 grupos por alerta.",
    "plan.block_keywords": "Limites Free: 5 palavras include e 3 exclude.",
    "plan.block_frequency":
      "Plano Free permite apenas frequência de 15–20 min.",
    "groups.load_title": "Carregar Grupos",
    "groups.stop": "Parar",
    "groups.title": "Grupos",
    "groups.show_selected_only": "mostrar apenas selecionados",
    "groups.no_match": "Nenhum grupo corresponde a \"{term}\".",
    "groups.no_loaded_auto":
      "Nenhum grupo carregado ainda. O carregamento começa automaticamente.",
    "groups.loaded_count": "Carregados: {count}",
    "groups.selected_count": "Selecionados: {count}",
    "groups.visible_count": "{count} visível(is)",
    "groups.visible_for_count": "{count} visível(is) para \"{term}\"",
    "groups.no_groups_hint":
      "Parece que você não está em grupos, ou o Facebook ainda não carregou.",
    "groups.no_visible_filters": "Nenhum grupo visível com os filtros atuais.",
    "groups.none_selected_yet": "Nenhum grupo selecionado ainda.",
    "groups.select_at_least_one": "Selecione ao menos um grupo.",
    "groups.selected_summary": "{count} selecionado(s): {names}",
    "groups.count": "{count} grupo(s)",
    "groups.select_group": "Selecionar grupo",
    "groups.fetching": "carregando...",
    "groups.error_short": "erro",
    "onboard.alert_subtitle": "Um formulário simples. Sem trocar de aba.",
    "onboard.watch_title": "Include words (palavras positivas)",
    "onboard.exclude_title": "Exclude words (palavras negativas)",
    "onboard.keyword_input_ph": "Digite e pressione Enter ou vírgula",
    "onboard.after_setup_title": "Depois do setup",
    "onboard.after_setup_body":
      "Frequência, sleep schedule e notificações ficam em Configurações.",
    "onboard.groups_auto_hint":
      "Os grupos são carregados automaticamente quando esta etapa abre.",
    "onboard.groups_loaded": "Carregados: {count}",
    "onboard.groups_selected": "Selecionados: {count}",
    "onboard.auto_loading": "Carregando grupos automaticamente...",
    "onboard.keyword_min": "A palavra deve ter no mínimo 2 caracteres.",
    "onboard.keyword_max": "Máximo de 20 palavras atingido.",
    "onboard.create_save_first": "Crie e salve um alerta primeiro.",
    "onboard.monitoring_active_now": "Monitoramento ativo agora.",
    "onboard.ready_to_monitor": "Pronto para monitorar.",
    "onboard.monitoring_control": "Controle de Monitoramento",
    "onboard.fb_prompt":
      "Vamos puxar seus grupos, mas antes confirme: você está logado no Facebook neste dispositivo?",
    "onboard.fb_checking": "Verificando seu login no Facebook...",
    "onboard.fb_not_connected":
      "Facebook ainda não conectado. Faça login e tente novamente.",
    "onboard.fb_no_problem":
      "Sem problemas. Abra o Facebook, faça login e depois clique em 'Sim, estou logado'.",
    "onboard.groups_pick":
      "Perfeito. Escolha 1 ou mais grupos abaixo para monitorar.",
    "onboard.continue_bg_loading":
      "Continuando com os grupos já selecionados. O restante segue carregando em background.",
    "onboard.select_group_first": "Selecione ao menos um grupo primeiro.",
    "onboard.alert_ready": "Perfeito. Você já tem um rascunho de alerta ativo.",
    "onboard.alert_create_first": "Crie pelo menos um alerta para continuar.",
    "onboard.welcome1": "Hello! Bem-vindo ao GrabClientsNow.",
    "onboard.welcome2": "Eu vou te ajudar no setup em poucos passos.",
    "onboard.welcome_nudge": "Quando quiser, é só clicar em Começar.",
    "onboard.connect1":
      "Primeiro, preciso do Facebook aberto em outra aba do Chrome. Assim acesso seus grupos sem senha.",
    "onboard.connect2":
      "Feito. Faça login se precisar e volte aqui para continuar.",
    "onboard.connect_fail":
      "Ainda com problema. A aba pode estar fechada ou a sessão expirada.",
    "onboard.groups1":
      "Quais grupos você quer monitorar? Selecione quantos quiser.",
    "onboard.alert1": "Agora configure seu primeiro alerta.",
    "onboard.alert2":
      "Depois você ajusta frequência, sleep schedule e notificações em Configurações.",
    "onboard.ready1":
      "Tudo certo, estou monitorando! Vou te avisar no momento em que eu encontrar um match.",
    "onboard.turn_on_monitoring": "Ligar monitoramento",
    "onboard.turn_off_monitoring": "Parar monitoramento",
    "profiles.none_selected": "nenhum selecionado",
    "profiles.question_name": "Como você quer chamar este alerta?",
    "profiles.watch_ph":
      "looking for, anyone recommend, need help with",
    "profiles.exclude_ph": "Exclude words",
    "profiles.skip_watch": "Pular - me notifique sobre todos os posts",
    "profiles.skip": "Pular",
    "profiles.all_posts": "todos os posts",
    "profiles.configured_in_settings": "configurado em Configurações",
    "profiles.name_required": "Dê um nome para este alerta.",
    "profiles.name_max_40": "O nome do alerta deve ter no máximo 40 caracteres.",
    "profiles.hint_descriptive":
      "Dica: use um nome descritivo para achar esse alerta mais rápido.",
    "profiles.duplicate_overwrite":
      "Nome duplicado detectado. Sobrescrevendo alerta \"{name}\".",
    "profiles.saved_ok": "✅ Alerta salvo com sucesso.",
    "profiles.select_to_delete": "Selecione um alerta para excluir.",
    "profiles.removed": "🗑️ Alerta removido.",
    "profiles.none_saved": "Nenhum alerta salvo.",
    "profiles.active_label": "ativo",
    "monitor.idle": "parado",
    "monitor.waiting": "aguardando...",
    "settings.account": "Conta",
    "msg.signed_out": "Sessão encerrada.",
    "msg.sleep_saved": "Sleep schedule salvo.",
    "msg.sleep_save_failed": "Falha ao salvar sleep schedule: {error}",
    "msg.session_not_active":
      "Sessão ainda não está ativa. Clique no link mágico e tente novamente.",
    "msg.upgrade_soon":
      "Integração de upgrade com Stripe será ligada na próxima fase.",
    "status.monitoring": "monitorando...",
    "status.stopped": "parado",
    "status.starting": "iniciando...",
    "status.sleep_mode": "modo repouso",
    "status.checking_now": "checando agora...",
    "status.next_check": "próxima checagem: ~{mins} min",
    "status.waiting": "aguardando...",
    "status.logged": "Logado",
    "status.not_logged": "Não logado",
    "log.groups_loaded_so_far": "grupos carregados até agora: {count}",
    "log.groups_stream_done":
      "✅ Busca de grupos finalizada{stopped}. Total: {total}",
    "log.stopped_suffix": " (interrompida)",
    "log.groups_stream_failed": "❌ groupsStream falhou: {error}",
    "log.monitor_stopped": "🛑 Monitoramento parado.",
    "log.warmup_done": "⏱️ Warmup concluído. Próxima checagem em ~{mins} min",
    "log.checked_posts":
      "⏱️ Checados {polled} posts, {matched} matches. Próxima em ~{mins} min",
    "log.debug_cycle":
      "📥 Debug ciclo: {posts} post(s) em grupos selecionados / {feed} total feed{profile}",
    "log.monitor_error": "❌ Erro no monitor: {error}",
    "log.posts_received":
      "✅ {total} posts recebidos ({selected} em grupos selecionados)",
    "log.new_matches": "🔔 {count} novo(s) match(es){profile}",
    "log.no_new_posts_selected": "Nenhum post novo dos grupos selecionados.",
    "log.logged_as_user": "✅ Logado como userId={userId}",
    "log.not_logged_facebook": "❌ Não logado no Facebook",
    "log.not_logged": "❌ Não logado",
    "log.fetching_token": "Buscando fb_dtsg...",
    "log.token_not_found": "❌ token não encontrado — está logado no Facebook?",
    "log.fetching_all_tokens": "Buscando todos os tokens...",
    "log.token_missing": "❌ {key}: não encontrado",
    "log.error_generic": "❌ Erro: {error}",
    "log.user_id_short": "✅ userId={userId}",
    "log.cycle_started": "Ciclo iniciado.",
    "log.creation_date": "✅ Data de criação: {date}",
    "log.creation_date_failed": "❌ Não foi possível obter data de criação",
    "log.stop_groups_requested": "⏹️ Parada da busca solicitada...",
    "log.load_groups_first": "Busque os grupos antes de selecionar.",
    "log.selection_saved": "Seleção salva: grupos visíveis marcados.",
    "log.selection_cleared": "Seleção limpa.",
    "log.select_alert_first": "Selecione um alerta antes de iniciar monitoramento.",
    "log.alert_not_found":
      "Alerta selecionado não existe mais. Escolha outro.",
    "log.select_one_group_before_monitor":
      "Selecione ao menos 1 grupo antes de iniciar monitoramento.",
    "log.start_monitor_failed": "❌ Falha ao iniciar monitoramento: {error}",
    "log.sleep_mode_active":
      "🌙 Sleep mode ativo. Monitor será retomado automaticamente no horário configurado.",
    "log.sleep_mode_ended": "☀️ Sleep mode finalizado.",
    "log.monitor_started": "✅ Monitoramento iniciado.",
    "btn.back": "Voltar",
    "btn.next": "Próximo",
    "btn.save_alert": "Salvar alerta",
    "btn.start_monitoring": "Iniciar monitoramento",
    "kw.watch_for": "Include words",
    "kw.exclude_words": "Exclude words",
    "leads.title": "Leads",
    "leads.all_alerts": "Todos os alertas",
    "leads.filter_ph": "Filtrar por texto/pessoa/grupo",
    "leads.selected_groups_only": "somente grupos selecionados",
    "leads.count_7d": "{count} lead(s) em 7 dias",
    "leads.empty_7d": "Nenhum lead no histórico (últimos 7 dias).",
    "leads.meta_profile": " • alerta: {profile}",
    "leads.link_post": "Link do Post",
    "leads.link_person": "Perfil da Pessoa",
    "leads.link_group": "Link do Grupo",
    "leads.no_text": "(sem texto)",
    "data.export_csv_soon": "Exportar CSV (em breve)",
    "data.clear_lead_history": "Limpar Histórico de Leads",
    "debug.view_technical_log": "Ver Log Técnico",
    "overlay.technical_log": "Log Técnico",
    "overlay.copy_all": "Copiar tudo",
    "overlay.clear": "Limpar",
    "overlay.close": "Fechar",
    "overlay.empty": "[vazio]",
    "account.not_signed_in": "Não conectado",
    "account.sign_out": "Sair",
    "settings.sleep_title": "Monitor Sleep Schedule",
    "settings.sleep_note":
      "O sleep schedule pausa o monitoramento nas horas de descanso para reduzir risco de detecção. Deixe ligado para mais segurança.",
    "settings.sleep_enable": "Ativar sleep schedule",
    "settings.timezone_auto": "Timezone: automático",
    "settings.timezone_label": "Timezone: {timezone}",
    "settings.active_from": "Ativo de",
    "settings.to": "até",
    "settings.sleep_save": "Salvar Sleep Schedule",
    "settings.frequency_title": "Frequência de checagem (global)",
    "settings.frequency_note":
      "Uma configuração global para todos os alertas. Intervalos menores são mais rápidos, mas aumentam o risco.",
    "settings.freq_15_20_title": "🕐 A cada 15-20 min",
    "settings.freq_15_20_desc": "Mais discreto · Mais seguro",
    "settings.freq_5_10_title": "✅ A cada 5-10 min",
    "settings.freq_5_10_desc": "Equilíbrio recomendado · Pro",
    "settings.freq_3_5_title": "🔄 A cada 3-5 min",
    "settings.freq_3_5_desc": "Risco elevado · Pro",
    "settings.freq_1_3_title": "⚡ A cada 1-3 min",
    "settings.freq_1_3_desc": "Maior risco · Pro",
    "settings.frequency_current": "Atual: a cada {min}-{max} min",
    "settings.notifications_title": "Notificações (global)",
    "settings.notifications_note":
      "Vale para todos os alertas. Você pode combinar múltiplos canais.",
    "settings.notify_browser": "🔔 Notificações do navegador",
    "settings.notify_webhook": "🔗 Webhook (Pro)",
    "settings.notify_slack": "💬 Slack (Pro)",
    "settings.notify_in_app": "🔕 Somente no app",
    "sugg.looking_for": "procurando",
    "sugg.anyone_recommend": "alguém recomenda",
    "sugg.need_help_with": "preciso de ajuda com",
    "sugg.best_blank": "melhor ___",
    "sugg.looking_to_hire": "procurando contratar",
    "sugg.recommendations_for": "recomendações para",
    "sugg.alternatives_to": "alternativas para",
    "sugg.review": "review",
    "sugg.selling": "vendendo",
    "sugg.for_sale": "à venda",
    "sugg.hiring": "contratando",
    "sugg.job_post": "vaga",
    "sugg.spam": "spam",
    "sugg.partnership": "parceria",
  },
};

function appendLog(logId, text, type = "") {
  const log = qs(logId);
  if (!log) return;
  const line = document.createElement("div");
  line.className = type;
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${text}`;
  line.textContent = entry;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
  technicalLogEntries.push({ ts: time, text, type });
  if (technicalLogEntries.length > 2000) {
    technicalLogEntries = technicalLogEntries.slice(-2000);
  }
  renderTechnicalLogOverlay();
}

function renderTechnicalLogOverlay() {
  const body = qs("logOverlayBody");
  if (!body) return;
  body.innerHTML = "";
  if (!technicalLogEntries.length) {
    body.textContent = translate("overlay.empty");
    return;
  }
  for (const item of technicalLogEntries) {
    const row = document.createElement("div");
    row.style.color =
      item.type === "err"
        ? "var(--error)"
        : item.type === "warn"
          ? "var(--warn)"
          : item.type === "ok"
            ? "var(--green)"
            : "var(--text-muted)";
    row.textContent = `[${item.ts}] ${item.text}`;
    body.appendChild(row);
  }
  body.scrollTop = body.scrollHeight;
}

function toggleTechnicalLogOverlay(open) {
  const overlay = qs("logOverlay");
  if (!overlay) return;
  overlay.classList.toggle("open", !!open);
}

function formatTechnicalLogForClipboard() {
  return technicalLogEntries
    .map((item) => `[${item.ts}] ${item.text}`)
    .join("\n");
}

function translate(key, vars = {}) {
  const raw = I18N[currentLanguage]?.[key] || I18N.en[key] || key;
  return Object.entries(vars).reduce((acc, [k, v]) => {
    return acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }, raw);
}

function applyI18n() {
  document.documentElement.lang =
    currentLanguage === "pt-br" ? "pt-BR" : "en-US";
  qsa("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = translate(key);
  });
  qsa("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;
    el.setAttribute("placeholder", translate(key));
  });

  const languageSelect = qs("languageSelect");
  if (languageSelect) languageSelect.value = currentLanguage;
  const authLanguageSelect = qs("authLanguageSelect");
  if (authLanguageSelect) authLanguageSelect.value = currentLanguage;
  qsa(".btn").forEach((btn) => {
    btn.dataset.label = btn.textContent;
  });
}

function activateTab(tabName) {
  qsa(".tab-btn").forEach((b) => b.classList.remove("active"));
  const activeButton = qsa(".tab-btn").find((b) => b.dataset.tab === tabName);
  if (activeButton) activeButton.classList.add("active");
  qsa(".panel").forEach((p) => {
    p.classList.toggle("active", p.dataset.panel === tabName);
  });
  if (tabName === "profiles") {
    selectedProfileId = "";
    qs("profileEditorName").value = "";
    qs("profileEditorPositive").value = "";
    qs("profileEditorNegative").value = "";
    qs("profileEditorMin").value = String(globalMonitorFrequency.min);
    qs("profileEditorMax").value = String(globalMonitorFrequency.max);
    currentProfileWizardStep = "name";
    renderProfiles();
    updateMonitorProfilePreview();
    updateProfileKeywordPreview();
    renderProfileWizard();
  }
}

async function setOnboardingState(nextState) {
  onboardingState = nextState;
  if (nextState !== "groups") {
    onboardingAutoGroupLoadAttempted = false;
    onboardingGroupsProgress = { started: false, lastCount: 0, lastAnnouncedAt: 0 };
  }
  await chrome.storage.local.set({ [STORAGE_ONBOARDING_STATE_KEY]: nextState });
  renderOnboardingChat();
}

function onboardingStepRank(state) {
  const order = {
    welcome: 0,
    fb_connect: 1,
    groups: 2,
    alert: 3,
    ready: 4,
  };
  return order[String(state)] ?? 0;
}

function deriveOnboardingStateFromContext() {
  if (isMonitorRunning) return "ready";
  if (savedProfiles.length > 0) return "ready";
  if (selectedGroupIds.size > 0) return "alert";
  if (isFacebookConnected) return "groups";
  return "welcome";
}

async function loadOnboardingState() {
  const data = await chrome.storage.local.get([STORAGE_ONBOARDING_STATE_KEY]);
  const value = String(data?.[STORAGE_ONBOARDING_STATE_KEY] || "").trim();
  const allowed = new Set(["welcome", "fb_connect", "groups", "alert", "ready"]);
  onboardingState = allowed.has(value) ? value : "welcome";
}

async function refreshOnboardingStateFromContext() {
  const derived = deriveOnboardingStateFromContext();

  if (onboardingState === "ready" && derived !== "ready") {
    await setOnboardingState(derived);
    return;
  }

  // Não avança automaticamente de grupos -> alerta ao marcar o primeiro grupo.
  // O usuário precisa confirmar explicitamente pelo botão de continuar.
  if (onboardingState === "groups" && derived === "alert") {
    renderOnboardingChat();
    return;
  }

  if (onboardingStepRank(derived) > onboardingStepRank(onboardingState)) {
    await setOnboardingState(derived);
    return;
  }

  renderOnboardingChat();
}

function setHomeOperationalVisibility(show) {
  ["cardMonitoring", "cardInsights"].forEach((id) => {
    const el = qs(id);
    if (!el) return;
    el.classList.toggle("hidden", !show);
  });
}

function addAgentMessage(container, text, muted = false, typing = true) {
  const row = document.createElement("div");
  row.className = `agent-msg${muted ? " muted" : ""}`;
  container.appendChild(row);
  const content = String(text || "");
  if (!typing || content.length < 2) {
    row.textContent = content;
    return;
  }
  row.classList.add("typing");
  let idx = 0;
  const timer = setInterval(() => {
    idx += 1;
    row.textContent = content.slice(0, idx);
    if (idx >= content.length) {
      clearInterval(timer);
      row.classList.remove("typing");
    }
  }, 14);
}

function clearWelcomeNudgeTimer() {
  if (!welcomeNudgeTimer) return;
  clearTimeout(welcomeNudgeTimer);
  welcomeNudgeTimer = null;
}

function scheduleWelcomeNudge() {
  clearWelcomeNudgeTimer();
  if (onboardingState !== "welcome") return;
  welcomeNudgeTimer = setTimeout(() => {
    if (onboardingState !== "welcome") return;
    const feed = qs("agentFeed");
    if (!feed) return;
    const alreadyHasNudge = Array.from(feed.querySelectorAll(".agent-msg")).some(
      (el) =>
        el.textContent?.includes("Whenever you're ready") ||
        el.textContent?.includes("Quando quiser"),
    );
    if (!alreadyHasNudge) {
      addAgentMessage(feed, getOnboardingCopy().welcomeNudge, true);
    }
  }, 30000);
}

function getSelectedGroupNamesSummary(limit = 5) {
  const selected = Array.from(selectedGroupIds)
    .map((id) => lastLoadedGroups.get(String(id))?.name)
    .filter(Boolean);
  if (!selected.length) {
    return translate("groups.none_selected_yet");
  }
  if (selected.length <= limit) return selected.join(", ");
  const first = selected.slice(0, limit).join(", ");
  return currentLanguage === "pt-br"
    ? `${first} e mais ${selected.length - limit}`
    : `${first} and ${selected.length - limit} more`;
}

function getOnboardingCopy() {
  return {
    welcome1: translate("onboard.welcome1"),
    welcome2: translate("onboard.welcome2"),
    welcomeNudge: translate("onboard.welcome_nudge"),
    connect1: translate("onboard.connect1"),
    connect2: translate("onboard.connect2"),
    connectFail: translate("onboard.connect_fail"),
    groups1: translate("onboard.groups1"),
    alert1: translate("onboard.alert1"),
    alert2: translate("onboard.alert2"),
    ready1: translate("onboard.ready1"),
  };
}

function updateOnboardingWorkspaceVisibility() {
  const workspace = qs("onboardingWorkspace");
  const groupsPanel = qs("onboardGroupsPanel");
  const alertPanel = qs("onboardAlertPanel");
  if (!workspace || !groupsPanel || !alertPanel) return;

  const showWorkspace = onboardingState === "groups" || onboardingState === "alert";
  workspace.classList.toggle("show", showWorkspace);
  groupsPanel.classList.toggle("active", onboardingState === "groups");
  alertPanel.classList.toggle("active", onboardingState === "alert");
}

function renderOnboardingGroupsList() {
  const list = qs("onboardGroupsList");
  const info = qs("onboardGroupsInfo");
  if (!list || !info) return;

  const search = String(qs("onboardGroupsSearch")?.value || "")
    .trim()
    .toLowerCase();
  list.innerHTML = "";

  const groups = Array.from(lastLoadedGroups.values()).filter((g) => {
    if (!search) return true;
    return String(g?.name || "").toLowerCase().includes(search);
  });

  groups.forEach((g) => {
    const row = createGroupCard(g);
    list.appendChild(row);
  });

  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = search
      ? translate("groups.no_match", { term: search })
      : translate("groups.no_loaded_auto");
    list.appendChild(empty);
  }

  const loadedEl = qs("onboardGroupsLoadedCount");
  const selectedEl = qs("onboardGroupsSelectedCount");
  if (loadedEl) loadedEl.textContent = translate("groups.loaded_count", { count: lastLoadedGroups.size });
  if (selectedEl) selectedEl.textContent = translate("groups.selected_count", { count: selectedGroupIds.size });
  info.textContent = groups.length
    ? translate("groups.visible_count", { count: groups.length })
    : (search
      ? translate("groups.visible_for_count", { count: 0, term: search })
      : translate("groups.visible_count", { count: 0 }));
}

function maybeAutoLoadOnboardingGroups() {
  if (onboardingState !== "groups") return;
  if (onboardingAutoGroupLoadAttempted) return;
  if (isGroupFetchRunning) return;
  onboardingAutoGroupLoadAttempted = true;
  onboardingGroupsProgress.started = true;
  onboardingGroupsProgress.lastCount = 0;
  onboardingGroupsProgress.lastAnnouncedAt = Date.now();
  appendLog("logGeneral", translate("onboard.auto_loading"), "ok");
  setTimeout(() => {
    const loadMain = qs("btnGetGroups");
    if (loadMain) loadMain.click();
  }, 120);
}

function syncOnboardingAlertFromSelectedProfile() {
  const profile = getProfileById(selectedProfileId);
  if (profile) {
    qs("onboardAlertName").value = String(profile.name || "");
    onboardWatchKeywords = Array.isArray(profile.positiveKeywords)
      ? profile.positiveKeywords.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    onboardExcludeKeywords = Array.isArray(profile.negativeKeywords)
      ? profile.negativeKeywords.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    onboardAlertFrequency = {
      min: Number(globalMonitorFrequency?.min) || 5,
      max: Number(globalMonitorFrequency?.max) || 10,
    };
  } else {
    const defaults =
      Number(globalMonitorFrequency?.min) > 0
        ? globalMonitorFrequency
        : getDefaultFrequencyForPlan();
    qs("onboardAlertName").value = "";
    onboardWatchKeywords = [];
    onboardExcludeKeywords = [];
    onboardAlertFrequency = { min: defaults.min, max: defaults.max };
  }
  renderOnboardKeywordChips("watch");
  renderOnboardKeywordChips("exclude");
  const freqText = qs("onboardAlertFreqText");
  if (freqText) {
    freqText.textContent = translate("settings.frequency_current", {
      min: onboardAlertFrequency.min,
      max: onboardAlertFrequency.max,
    });
  }
  const freqWarn = qs("onboardFreqWarning");
  if (freqWarn) freqWarn.textContent = "";
}

function normalizeOnboardKeyword(value) {
  return String(value || "").trim().toLowerCase();
}

function renderOnboardKeywordChips(kind) {
  const isWatch = kind === "watch";
  const list = isWatch ? onboardWatchKeywords : onboardExcludeKeywords;
  const container = qs(isWatch ? "onboardWatchChips" : "onboardExcludeChips");
  const hidden = qs(isWatch ? "onboardAlertWatch" : "onboardAlertExclude");
  if (!container || !hidden) return;
  container.innerHTML = "";
  hidden.value = list.join(", ");

  list.forEach((kw, idx) => {
    const chip = document.createElement("span");
    chip.className = `tag-chip ${isWatch ? "pos" : "neg"}`;
    chip.textContent = kw;
    const close = document.createElement("button");
    close.textContent = "×";
    close.addEventListener("click", () => {
      list.splice(idx, 1);
      renderOnboardKeywordChips(kind);
    });
    chip.appendChild(close);
    container.appendChild(chip);
  });
}

function addOnboardKeyword(kind, rawValue) {
  const value = normalizeOnboardKeyword(rawValue);
  const isWatch = kind === "watch";
  const list = isWatch ? onboardWatchKeywords : onboardExcludeKeywords;
  const container = qs(isWatch ? "onboardWatchChips" : "onboardExcludeChips");
  if (!value) return false;
  if (value.length < 2) {
    appendLog("logGeneral", translate("onboard.keyword_min"), "warn");
    return false;
  }
  if (list.length >= 20) {
    appendLog("logGeneral", translate("onboard.keyword_max"), "warn");
    return false;
  }
  const existingIndex = list.findIndex((item) => normalizeOnboardKeyword(item) === value);
  if (existingIndex >= 0) {
    const existingChip = container?.children?.[existingIndex];
    if (existingChip) {
      existingChip.classList.add("flash");
      setTimeout(() => existingChip.classList.remove("flash"), 450);
    }
    return false;
  }
  list.push(value);
  renderOnboardKeywordChips(kind);
  return true;
}

function normalizeGuidedText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function renderGuidedHistory() {
  const box = qs("guidedHistory");
  if (!box) return;
  box.innerHTML = "";
  const items = guidedCommandHistory.slice(0, 5);
  items.forEach((cmd) => {
    const chip = document.createElement("span");
    chip.className = "guided-history-chip";
    chip.textContent = cmd;
    box.appendChild(chip);
  });
}

function rememberGuidedCommand(label) {
  const value = String(label || "").trim();
  if (!value) return;
  guidedCommandHistory = [
    value,
    ...guidedCommandHistory.filter((item) => item !== value),
  ].slice(0, 20);
  guidedHistoryCursor = -1;
  renderGuidedHistory();
}

function runGuidedAction(action) {
  if (!action || typeof action.onClick !== "function") return;
  rememberGuidedCommand(action.label);
  const input = qs("guidedPromptInput");
  if (input) input.value = "";
  action.onClick();
}

function getFilteredGuidedActions(query = "") {
  const q = normalizeGuidedText(query).trim();
  if (!q) return currentGuidedActions;
  return currentGuidedActions.filter((action) => {
    const label = normalizeGuidedText(action?.label);
    const keywords = normalizeGuidedText(
      Array.isArray(action?.keywords)
        ? action.keywords.join(" ")
        : action?.keywords || "",
    );
    return label.includes(q) || keywords.includes(q);
  });
}

function renderAgentActionsByQuery(query = "") {
  const box = qs("agentActions");
  if (!box) return;
  box.innerHTML = "";
  const filtered = getFilteredGuidedActions(query);

  filtered.forEach((action) => {
    const btn = document.createElement("button");
    btn.className = `btn ${action.kind || "btn-gray"} agent-option`;
    if (action.hint) btn.title = action.hint;
    if (action.disabled) btn.disabled = true;
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = action.icon || "•";
    const label = document.createElement("span");
    label.textContent = action.label;
    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener("click", () => runGuidedAction(action));
    box.appendChild(btn);
  });
}

function setAgentActions(actions) {
  currentGuidedActions = Array.isArray(actions) ? actions : [];
  const query = String(qs("guidedPromptInput")?.value || "");
  renderAgentActionsByQuery(query);
}

function renderOnboardingChat() {
  const copy = getOnboardingCopy();
  const feed = qs("agentFeed");
  const guidedTitle = qs("guidedSetupTitle");
  const guidedCard = qs("cardGuidedSetup");
  if (!feed) return;
  feed.innerHTML = "";
  clearWelcomeNudgeTimer();

  const showOperational = onboardingState === "ready";
  setHomeOperationalVisibility(showOperational);
  updateOnboardingWorkspaceVisibility();
  if (guidedCard) guidedCard.classList.toggle("guided-ready", showOperational);
  if (guidedTitle) {
    guidedTitle.textContent = showOperational
      ? translate("onboard.monitoring_control")
      : translate("home.guided_setup");
  }
  const guidedInput = qs("guidedPromptInput");
  if (guidedInput) {
    const placeholderByState = {
      welcome: currentLanguage === "pt-br"
        ? "Digite para começar..."
        : "Type to start...",
      fb_connect: currentLanguage === "pt-br"
        ? "Confirme login no Facebook..."
        : "Confirm Facebook login...",
      groups: currentLanguage === "pt-br"
        ? "Selecione 1 ou mais grupos..."
        : "Select one or more groups...",
      alert: currentLanguage === "pt-br"
        ? "Crie seu primeiro alerta..."
        : "Create your first alert...",
      ready: currentLanguage === "pt-br"
        ? "Ligar monitoramento..."
        : "Turn on monitoring...",
    };
    guidedInput.placeholder = placeholderByState[onboardingState] ||
      (currentLanguage === "pt-br"
        ? "Digite o que você quer fazer..."
        : "Type what you want to do...");
    if (document.activeElement !== guidedInput) {
      guidedInput.value = "";
    }
  }

  if (onboardingState === "welcome") {
    addAgentMessage(feed, copy.welcome1);
    addAgentMessage(feed, copy.welcome2);
    setAgentActions([
      {
        label: translate("btn.next"),
        kind: "btn-green",
        icon: "▶",
        keywords: currentLanguage === "pt-br"
          ? ["continuar", "comecar", "iniciar"]
          : ["continue", "start", "begin"],
        onClick: async () => setOnboardingState("fb_connect"),
      },
    ]);
    scheduleWelcomeNudge();
    return;
  }

  if (onboardingState === "fb_connect") {
    addAgentMessage(feed, translate("onboard.fb_prompt"));
    setAgentActions([
      {
        label: isCheckingFacebookLogin
          ? translate("common.checking")
          : (currentLanguage === "pt-br" ? "Sim, estou logado" : "Yes, I'm logged in"),
        kind: "btn-green",
        icon: "✅",
        disabled: isCheckingFacebookLogin,
        keywords: currentLanguage === "pt-br"
          ? ["sim", "logado", "continuar"]
          : ["yes", "logged", "continue"],
        onClick: () => {
          if (isCheckingFacebookLogin) return;
          isCheckingFacebookLogin = true;
          addAgentMessage(
            feed,
            translate("onboard.fb_checking"),
            true,
            false,
          );
          renderOnboardingChat();
          chrome.runtime.sendMessage({ type: "checkLogin" }, async (response) => {
            isCheckingFacebookLogin = false;
            if (response?.loggedIn) {
              setLoginStatus(true, `Logged as ${response.userId}`);
              await setOnboardingState("groups");
              return;
            }
            fbConnectFailures += 1;
            appendLog("logGeneral", translate("onboard.fb_not_connected"), "warn");
            if (fbConnectFailures >= 3) {
              addAgentMessage(feed, copy.connectFail, true);
              toggleTechnicalLogOverlay(true);
            }
            renderOnboardingChat();
          });
        },
      },
      {
        label: currentLanguage === "pt-br" ? "Não, ainda não" : "No, not yet",
        kind: "btn-gray",
        icon: "❌",
        disabled: isCheckingFacebookLogin,
        keywords: currentLanguage === "pt-br"
          ? ["nao", "não", "ainda nao", "nao logado"]
          : ["no", "not yet", "not logged"],
        onClick: () => {
          addAgentMessage(
            feed,
            translate("onboard.fb_no_problem"),
            true,
          );
        },
      },
      {
        label: currentLanguage === "pt-br" ? "Abrir Facebook agora" : "Open Facebook now",
        kind: "btn-gray",
        icon: "🌐",
        disabled: isCheckingFacebookLogin,
        keywords: currentLanguage === "pt-br"
          ? ["facebook", "abrir", "login"]
          : ["facebook", "open", "login"],
        onClick: async () => {
          await chrome.tabs.create({ url: "https://www.facebook.com/" });
        },
      },
    ]);
    return;
  }

  if (onboardingState === "groups") {
    maybeAutoLoadOnboardingGroups();
    addAgentMessage(feed, translate("onboard.groups_pick"));
    renderOnboardingGroupsList();
    setAgentActions([
      {
        label: currentLanguage === "pt-br" ? "Já selecionei os grupos" : "I've selected groups",
        kind: "btn-green",
        icon: "👥",
        keywords: currentLanguage === "pt-br"
          ? ["grupos", "selecionar", "continuar"]
          : ["groups", "selected", "continue"],
        onClick: async () => {
          if (selectedGroupIds.size < 1) {
            appendLog("logGeneral", translate("onboard.select_group_first"), "warn");
            return;
          }
          if (isGroupFetchRunning) {
            appendLog(
              "logGeneral",
              translate("onboard.continue_bg_loading"),
              "info",
            );
          }
          await setOnboardingState("alert");
        },
      },
    ]);
    return;
  }

  if (onboardingState === "alert") {
    addAgentMessage(feed, copy.alert1);
    addAgentMessage(feed, copy.alert2, true);
    addAgentMessage(
      feed,
      selectedProfileId
        ? translate("onboard.alert_ready")
        : translate("onboard.alert_create_first"),
      true,
    );
    syncOnboardingAlertFromSelectedProfile();
    setAgentActions([
      {
        label: currentLanguage === "pt-br" ? "Concluir setup" : "Finish setup",
        kind: "btn-green",
        icon: "🚀",
        keywords: currentLanguage === "pt-br"
          ? ["concluir", "finalizar", "setup", "alerta"]
          : ["finish", "setup", "alert", "save"],
        onClick: async () => {
          const name = String(qs("onboardAlertName")?.value || "").trim();
          const watch = onboardWatchKeywords.join(", ");
          const exclude = onboardExcludeKeywords.join(", ");
          qs("profileEditorName").value = name;
          qs("profileEditorPositive").value = watch;
          qs("profileEditorNegative").value = exclude;
          qs("profileEditorMin").value = String(globalMonitorFrequency.min);
          qs("profileEditorMax").value = String(globalMonitorFrequency.max);

          const ok = await saveProfileFromEditor();
          if (!ok) {
            appendLog("logGeneral", translate("onboard.create_save_first"), "warn");
            return;
          }
          await setOnboardingState("ready");
        },
      },
      {
        label: currentLanguage === "pt-br" ? "Pular esta parte" : "Skip this part",
        kind: "btn-gray",
        icon: "⏭",
        keywords: currentLanguage === "pt-br"
          ? ["pular", "skip", "depois"]
          : ["skip", "later", "continue"],
        onClick: async () => {
          const fallbackName =
            currentLanguage === "pt-br"
              ? `Alerta ${savedProfiles.length + 1}`
              : `Alert ${savedProfiles.length + 1}`;
          qs("onboardAlertName").value = String(qs("onboardAlertName")?.value || "").trim() || fallbackName;
          onboardWatchKeywords = [];
          onboardExcludeKeywords = [];
          renderOnboardKeywordChips("watch");
          renderOnboardKeywordChips("exclude");
          qs("profileEditorName").value = qs("onboardAlertName").value;
          qs("profileEditorPositive").value = "";
          qs("profileEditorNegative").value = "";
          qs("profileEditorMin").value = String(globalMonitorFrequency.min);
          qs("profileEditorMax").value = String(globalMonitorFrequency.max);
          const ok = await saveProfileFromEditor();
          if (!ok) return;
          await setOnboardingState("ready");
        },
      },
    ]);
    return;
  }

  addAgentMessage(feed, isMonitorRunning
    ? translate("onboard.monitoring_active_now")
    : translate("onboard.ready_to_monitor"),
  );
  setAgentActions([
    {
      label: isMonitorRunning
        ? translate("onboard.turn_off_monitoring")
        : translate("onboard.turn_on_monitoring"),
      kind: `btn-green btn-monitor-main`,
      icon: isMonitorRunning ? "⏹" : "▶",
      keywords: currentLanguage === "pt-br"
        ? ["monitorar", "ligar", "desligar", "iniciar", "parar"]
        : ["monitoring", "turn on", "turn off", "start", "stop"],
      onClick: () => {
        if (isMonitorRunning) qs("btnStopMonitor").click();
        else qs("btnStartMonitor").click();
      },
    },
  ]);
}

async function loadLanguage() {
  const data = await chrome.storage.local.get([STORAGE_LANGUAGE_KEY]);
  const value = String(data?.[STORAGE_LANGUAGE_KEY] || "en").toLowerCase();
  currentLanguage = value === "pt-br" ? "pt-br" : "en";
  applyI18n();
}

async function setLanguage(nextLanguage) {
  currentLanguage = nextLanguage === "pt-br" ? "pt-br" : "en";
  await chrome.storage.local.set({ [STORAGE_LANGUAGE_KEY]: currentLanguage });
  applyI18n();
  renderPlanBanner();
  renderOnboardingChat();
  renderOnboardingGroupsList();
  renderProfiles();
  renderLeads();
  updateSelectedGroupCount();
  renderProfileWizard();
  renderHomeInsights();
}

function formatRemainingTime(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function loadPlanState() {
  const data = await chrome.storage.local.get([STORAGE_PLAN_STATE_KEY]);
  const plan = data?.[STORAGE_PLAN_STATE_KEY];
  if (plan && typeof plan === "object") return plan;
  const defaultPlan = {
    plan: "trial",
    trialEnd: Date.now() + 48 * 60 * 60 * 1000,
  };
  await chrome.storage.local.set({ [STORAGE_PLAN_STATE_KEY]: defaultPlan });
  return defaultPlan;
}

let cachedPlanState = null;

function renderPlanBanner() {
  const banner = qs("planBanner");
  const text = qs("planBannerText");
  if (!banner || !text || !cachedPlanState) return;

  banner.classList.remove("show", "warn", "pro", "free");
  const now = Date.now();
  const plan = String(cachedPlanState.plan || "free");
  const trialEnd = Number(cachedPlanState.trialEnd) || 0;

  if (plan === "pro") {
    banner.classList.add("show", "pro");
    text.textContent = translate("plan.pro");
    return;
  }

  if (plan === "trial") {
    if (trialEnd > now) {
      banner.classList.add("show", "warn");
      text.textContent = translate("plan.trial", {
        time: formatRemainingTime(trialEnd - now),
      });
      return;
    }
    banner.classList.add("show", "free");
    text.textContent = translate("plan.expired");
    return;
  }

  banner.classList.add("show", "free");
  text.textContent = translate("plan.free");
}

function getSupabaseConfig() {
  return {
    url: String(SUPABASE_URL || "").trim(),
    anonKey: String(SUPABASE_ANON_KEY || "").trim(),
  };
}

async function getAuthSession() {
  const data = await chrome.storage.local.get([STORAGE_AUTH_SESSION_KEY]);
  return data?.[STORAGE_AUTH_SESSION_KEY] || null;
}

async function setAuthSession(session) {
  await chrome.storage.local.set({ [STORAGE_AUTH_SESSION_KEY]: session });
}

async function clearAuthSession() {
  await chrome.storage.local.remove([
    STORAGE_AUTH_SESSION_KEY,
    STORAGE_AUTH_EMAIL_KEY,
  ]);
}

function setAuthGateVisible(show) {
  const gate = qs("authGate");
  if (!gate) return;
  gate.classList.toggle("show", !!show);
}

function appendAuthGateLog(message, type = "info") {
  appendLog("logAuthGate", message, type);
}

function authHeaders(config, bearer = "") {
  const headers = {
    apikey: config.anonKey,
    "Content-Type": "application/json",
  };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return headers;
}

async function sendMagicLink(email, createUser = true) {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    throw new Error(translate("auth.missing_config"));
  }
  const redirectTo = chrome.identity?.getRedirectURL?.("auth") || undefined;
  const response = await fetch(`${config.url}/auth/v1/otp`, {
    method: "POST",
    headers: authHeaders(config),
    body: JSON.stringify({
      email,
      create_user: createUser,
      should_create_user: createUser,
      options: redirectTo ? { email_redirect_to: redirectTo } : {},
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `OTP request failed (${response.status})`);
  }
}

async function fetchAuthUser(accessToken) {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey || !accessToken) return null;
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: "GET",
    headers: authHeaders(config, accessToken),
  });
  if (!response.ok) return null;
  return await response.json();
}

async function fetchPlanFromCloud(userId, accessToken) {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey || !userId || !accessToken) return null;
  const url = new URL(`${config.url}/rest/v1/users`);
  url.searchParams.set("id", `eq.${userId}`);
  url.searchParams.set("select", "plan,trial_end,purchase_date,updated_at");
  url.searchParams.set("limit", "1");
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      ...authHeaders(config, accessToken),
      Prefer: "return=representation",
    },
  });
  if (!response.ok) return null;
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  const next = {
    plan: row.plan || "free",
    trialEnd: row.trial_end ? new Date(row.trial_end).getTime() : 0,
    purchaseDate: row.purchase_date ? new Date(row.purchase_date).getTime() : 0,
    cachedAt: Date.now(),
    source: "supabase",
  };
  await chrome.storage.local.set({ [STORAGE_PLAN_STATE_KEY]: next });
  return next;
}

function isPlanCacheFresh(state) {
  const ts = Number(state?.cachedAt) || 0;
  return ts > 0 && Date.now() - ts < PLAN_CACHE_TTL_MS;
}

function resolvePlanLevel() {
  const plan = String(cachedPlanState?.plan || "free");
  const now = Date.now();
  const trialEnd = Number(cachedPlanState?.trialEnd) || 0;
  if (plan === "pro") return "pro";
  if (plan === "trial" && trialEnd > now) return "trial";
  return "free";
}

function enforcePlanForAlertSave(payload) {
  const level = resolvePlanLevel();
  if (level === "pro" || level === "trial") return { ok: true };
  if (!selectedProfileId && savedProfiles.length >= 1) {
    return { ok: false, error: translate("plan.block_alerts") };
  }
  if (
    (payload.positiveKeywords || []).length > 5 ||
    (payload.negativeKeywords || []).length > 3
  ) {
    return { ok: false, error: translate("plan.block_keywords") };
  }
  return { ok: true };
}

function enforcePlanForMonitorStart(payload) {
  const level = resolvePlanLevel();
  if (level === "pro" || level === "trial") return { ok: true };
  if (
    Array.isArray(payload.selectedGroupIds) &&
    payload.selectedGroupIds.length > 3
  ) {
    return { ok: false, error: translate("plan.block_groups") };
  }
  if (Number(payload.minMinutes) < 15 || Number(payload.maxMinutes) < 15) {
    return { ok: false, error: translate("plan.block_frequency") };
  }
  return { ok: true };
}

async function syncAlertsFromCloud() {
  const session = await getAuthSession();
  if (!session?.accessToken || !session?.userId) return;
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) return;

  const url = new URL(`${config.url}/rest/v1/alerts`);
  url.searchParams.set("user_id", `eq.${session.userId}`);
  url.searchParams.set(
    "select",
    "id,name,group_ids,watch_keywords,exclude_keywords,frequency_min,frequency_max,is_active",
  );
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: authHeaders(config, session.accessToken),
  });
  if (!response.ok) return;
  const rows = await response.json();
  if (!Array.isArray(rows)) return;

  const cloudProfiles = rows
    .filter((r) => r.is_active !== false)
    .map((r) => ({
      id: String(r.id),
      name: String(r.name || "Alert"),
      positiveKeywords: Array.isArray(r.watch_keywords) ? r.watch_keywords : [],
      negativeKeywords: Array.isArray(r.exclude_keywords)
        ? r.exclude_keywords
        : [],
      minMinutes: Number(r.frequency_min) || 15,
      maxMinutes: Number(r.frequency_max) || 20,
      groupIds: Array.isArray(r.group_ids)
        ? r.group_ids.map((v) => String(v))
        : [],
      updatedAt: String(r.updated_at || ""),
    }));
  const localMap = new Map(
    savedProfiles.map((p) => [
      String(p.id),
      { ...p, updatedAt: String(p.updatedAt || "") },
    ]),
  );
  const merged = new Map();
  const localToPush = [];

  for (const cloud of cloudProfiles) {
    const local = localMap.get(cloud.id);
    if (!local) {
      merged.set(cloud.id, cloud);
      continue;
    }
    const localTs = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
    const cloudTs = cloud.updatedAt ? new Date(cloud.updatedAt).getTime() : 0;
    if (localTs > cloudTs) {
      merged.set(local.id, local);
      localToPush.push(local);
    } else {
      merged.set(cloud.id, cloud);
    }
    localMap.delete(cloud.id);
  }

  for (const remainingLocal of localMap.values()) {
    merged.set(remainingLocal.id, remainingLocal);
    localToPush.push(remainingLocal);
  }

  savedProfiles = Array.from(merged.values());
  await persistProfiles();
  renderProfiles();
  appendLog(
    "logGeneral",
    `Cloud sync: ${cloudProfiles.length} cloud / ${savedProfiles.length} merged alert(s).`,
    "ok",
  );

  for (const profile of localToPush) {
    await upsertAlertToCloud(profile);
  }
}

async function upsertAlertToCloud(profile) {
  const session = await getAuthSession();
  const config = getSupabaseConfig();
  if (
    !session?.accessToken ||
    !session?.userId ||
    !config.url ||
    !config.anonKey
  )
    return;

  const payload = {
    id: profile.id,
    user_id: session.userId,
    name: profile.name,
    group_ids: Array.from(selectedGroupIds),
    watch_keywords: profile.positiveKeywords || [],
    exclude_keywords: profile.negativeKeywords || [],
    frequency_min: Number(profile.minMinutes) || 15,
    frequency_max: Number(profile.maxMinutes) || 20,
    is_active: true,
    updated_at: profile.updatedAt || new Date().toISOString(),
  };

  await fetch(`${config.url}/rest/v1/alerts`, {
    method: "POST",
    headers: {
      ...authHeaders(config, session.accessToken),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });
}

function renderSleepDaysSelector(days = []) {
  const row = qs("sleepDaysRow");
  if (!row) return;
  row.innerHTML = "";
  const labels = [
    { day: 1, label: "Mon" },
    { day: 2, label: "Tue" },
    { day: 3, label: "Wed" },
    { day: 4, label: "Thu" },
    { day: 5, label: "Fri" },
    { day: 6, label: "Sat" },
    { day: 0, label: "Sun" },
  ];
  labels.forEach(({ day, label }) => {
    const wrap = document.createElement("label");
    wrap.className = "muted";
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "4px";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "sleep-day";
    input.value = String(day);
    input.checked = days.includes(day);
    wrap.appendChild(input);
    wrap.appendChild(document.createTextNode(label));
    row.appendChild(wrap);
  });
}

function timePartsToString(hour, minute) {
  const hh = String(Number(hour) || 0).padStart(2, "0");
  const mm = String(Number(minute) || 0).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseTimeString(value, fallbackHour, fallbackMinute) {
  const [h, m] = String(value || "").split(":");
  const hour = Number.isFinite(Number(h)) ? Number(h) : fallbackHour;
  const minute = Number.isFinite(Number(m)) ? Number(m) : fallbackMinute;
  return { hour, minute };
}

async function loadSleepScheduleUi() {
  chrome.runtime.sendMessage({ type: "getSleepSchedule" }, (response) => {
    if (!response?.success) return;
    const schedule = response.schedule || {};
    sleepScheduleState = schedule;
    qs("sleepEnabled").checked = !!schedule.enabled;
    qs("sleepStartTime").value = timePartsToString(
      schedule.startHour,
      schedule.startMinute,
    );
    qs("sleepEndTime").value = timePartsToString(
      schedule.endHour,
      schedule.endMinute,
    );
    qs("sleepTimezone").textContent = translate("settings.timezone_label", {
      timezone:
        schedule.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "auto",
    });
    renderSleepDaysSelector(
      Array.isArray(schedule.days) ? schedule.days : [1, 2, 3, 4, 5, 6, 0],
    );
  });
}

async function deactivateAlertInCloud(alertId) {
  const session = await getAuthSession();
  const config = getSupabaseConfig();
  if (
    !session?.accessToken ||
    !session?.userId ||
    !config.url ||
    !config.anonKey ||
    !alertId
  )
    return;
  const url = new URL(`${config.url}/rest/v1/alerts`);
  url.searchParams.set("id", `eq.${alertId}`);
  url.searchParams.set("user_id", `eq.${session.userId}`);
  await fetch(url.toString(), {
    method: "PATCH",
    headers: authHeaders(config, session.accessToken),
    body: JSON.stringify({
      is_active: false,
      updated_at: new Date().toISOString(),
    }),
  });
}

function getFilteredLeads() {
  const profileFilter = qs("leadsProfileFilter")?.value || "";
  const textFilter = String(qs("leadsTextFilter")?.value || "")
    .trim()
    .toLowerCase();
  const onlySelectedGroups = !!qs("leadsOnlySelectedGroups")?.checked;

  let filtered = [...leadsHistory];
  if (profileFilter) {
    filtered = filtered.filter(
      (lead) => String(lead.profileName || "") === profileFilter,
    );
  }
  if (onlySelectedGroups) {
    filtered = filtered.filter((lead) =>
      selectedGroupIds.has(String(lead.group_id || "")),
    );
  }
  if (textFilter) {
    filtered = filtered.filter((lead) => {
      const haystack = [
        lead.group_name,
        lead.poster_name,
        lead.post_text,
        lead.marketplace_text,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return haystack.includes(textFilter);
    });
  }
  return filtered;
}

function setLoginStatus(ok, label) {
  isFacebookConnected = !!ok;
  const el = qs("loginStatus");
  const dotColor = ok ? "var(--green)" : "#ff8800";
  el.innerHTML = `<span class="status-dot" style="background:${dotColor}"></span> ${label}`;
  const footerDot = qs("fbFooterDot");
  const footerText = qs("fbFooterText");
  if (footerDot) footerDot.style.background = ok ? "var(--green)" : "#ff8800";
  if (footerText)
    footerText.textContent = ok
      ? "Facebook connected"
      : "Facebook disconnected";
  if (!ok && !isMonitorRunning) setOrbState("fb-disconnected");
  if (ok && !isMonitorRunning) setOrbState("idle");
}

function setOrbState(state) {
  const orb = qs("monitorOrb");
  if (!orb || !ORB_STATES.includes(state)) return;
  ORB_STATES.forEach((s) => orb.classList.remove(s));
  orb.classList.add(state);

  if (orbStateTimeout) {
    clearTimeout(orbStateTimeout);
    orbStateTimeout = null;
  }

  if (state === "lead") {
    orbStateTimeout = setTimeout(() => {
      setOrbState(isMonitorRunning ? "monitoring" : "idle");
    }, 2000);
  }
}

function setButtonLoading(id, loading) {
  const btn = qs(id);
  if (!btn) return;
  btn.disabled = !!loading;
  btn.textContent = loading ? `⏳ ${translate("status.waiting")}` : btn.dataset.label;
}

function setGroupFetchState(running) {
  isGroupFetchRunning = running;
  qs("btnGetGroups").disabled = running;
  qs("btnStopGroups").disabled = !running;
  qs("btnGetGroups").textContent = running
    ? `⏳ ${translate("groups.fetching")}`
    : qs("btnGetGroups").dataset.label;
}

function setMonitorState(running, label) {
  isMonitorRunning = running;
  qs("btnStartMonitor").disabled = running;
  qs("btnStopMonitor").disabled = !running;
  const status = qs("monitorStatus");
  status.textContent = label || (running ? translate("status.monitoring") : translate("status.stopped"));
  status.style.color = running ? "var(--green)" : "var(--text-muted)";
  setOrbState(running ? "monitoring" : "paused");
  if (!running) {
    qs("monitorNextRun").textContent = translate("monitor.waiting");
  }
  renderHomeInsights();
}

function updateSelectedGroupCount() {
  qs("selectedGroupCount").textContent =
    translate("groups.selected_count", { count: selectedGroupIds.size });
  const summary = qs("groupsSelectionSummary");
  if (summary) {
    summary.textContent = selectedGroupIds.size
      ? translate("groups.selected_summary", {
        count: selectedGroupIds.size,
        names: getSelectedGroupNamesSummary(),
      })
      : translate("groups.select_at_least_one");
  }
}

function updateLeadsCount() {
  const count = Array.isArray(leadsHistory) ? leadsHistory.length : 0;
  qs("leadsCount").textContent = translate("leads.count_7d", { count });
}

function renderHomeInsights() {
  const status = qs("homeSystemStatus");
  const summary = qs("homeLeadsSummary");
  const topGroups = qs("homeTopGroups");
  const trendSvg = qs("homeTrendChart");
  const trendMeta = qs("homeTrendMeta");
  if (!status || !summary || !topGroups || !trendSvg || !trendMeta) return;

  const dotColor = isMonitorRunning ? "var(--green)" : "var(--warn)";
  status.innerHTML = `<span class="status-dot" style="background:${dotColor}"></span> ${
    isMonitorRunning ? translate("home.system_running") : translate("home.system_idle")
  }`;

  const recent = Array.isArray(leadsHistory) ? leadsHistory : [];
  summary.textContent = translate("home.leads_7d", { count: recent.length });

  const byGroup = new Map();
  recent.forEach((lead) => {
    const name = String(lead?.group_name || "Unknown");
    byGroup.set(name, (byGroup.get(name) || 0) + 1);
  });
  const top = Array.from(byGroup.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  topGroups.innerHTML = "";
  if (!top.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = translate("home.no_group_data");
    topGroups.appendChild(empty);
  } else {
    top.forEach(([name, count], idx) => {
      const row = document.createElement("div");
      row.textContent = `${idx + 1}. ${name} — ${count}`;
      topGroups.appendChild(row);
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - i));
    return { day, count: 0 };
  });
  recent.forEach((lead) => {
    const ts = Number(lead?.detectedAt) || 0;
    if (!ts) return;
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    const idx = buckets.findIndex((b) => b.day.getTime() === d.getTime());
    if (idx >= 0) buckets[idx].count += 1;
  });

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const w = 360;
  const h = 130;
  const padX = 18;
  const padY = 14;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const step = innerW / Math.max(1, buckets.length - 1);

  const points = buckets
    .map((b, i) => {
      const x = padX + i * step;
      const y = padY + innerH - (b.count / max) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  trendSvg.innerHTML = `
    <polyline points="${padX},${padY + innerH} ${w - padX},${padY + innerH}" stroke="var(--border)" stroke-width="1" fill="none" />
    <polyline points="${points}" stroke="var(--cyan)" stroke-width="2.5" fill="none" />
  `;

  buckets.forEach((b, i) => {
    const x = padX + i * step;
    const y = padY + innerH - (b.count / max) * innerH;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", String(x));
    c.setAttribute("cy", String(y));
    c.setAttribute("r", "2.8");
    c.setAttribute("fill", "var(--green)");
    trendSvg.appendChild(c);
  });

  const lastLabel = buckets[buckets.length - 1];
  trendMeta.textContent = `${max} max/day • ${lastLabel.count} today`;
}

function applyGroupsVisibilityFilter() {
  const searchTerm = String(qs("groupsSearch")?.value || "")
    .trim()
    .toLowerCase();
  const onlySelected = !!qs("groupsOnlySelected")?.checked;
  let visibleCount = 0;
  qsa("#groupsList .group-card").forEach((card) => {
    const gid = card.dataset.groupId || "";
    const group = lastLoadedGroups.get(String(gid));
    const name = String(group?.name || "").toLowerCase();
    const matchesSearch = !searchTerm || name.includes(searchTerm);
    const matchesSelected = !onlySelected || selectedGroupIds.has(String(gid));
    const visible = matchesSearch && matchesSelected;
    card.style.display = visible ? "" : "none";
    if (visible) visibleCount += 1;
  });

  const empty = qs("groupsEmptyState");
  if (empty) {
    const totalLoaded = lastLoadedGroups.size;
    if (totalLoaded === 0) {
      empty.style.display = "";
      empty.textContent = translate("groups.no_groups_hint");
    } else if (visibleCount === 0 && searchTerm) {
      empty.style.display = "";
      empty.textContent = translate("groups.no_match", { term: searchTerm });
    } else if (visibleCount === 0) {
      empty.style.display = "";
      empty.textContent = translate("groups.no_visible_filters");
    } else {
      empty.style.display = "none";
      empty.textContent = "";
    }
  }
  renderOnboardingGroupsList();
}

async function loadSelectedGroupIds() {
  const data = await chrome.storage.local.get([STORAGE_SELECTED_GROUP_IDS_KEY]);
  const ids = Array.isArray(data?.[STORAGE_SELECTED_GROUP_IDS_KEY])
    ? data[STORAGE_SELECTED_GROUP_IDS_KEY]
    : [];
  selectedGroupIds = new Set(ids.map((id) => String(id)));
  updateSelectedGroupCount();
}

async function persistSelectedGroupIds() {
  await chrome.storage.local.set({
    [STORAGE_SELECTED_GROUP_IDS_KEY]: Array.from(selectedGroupIds),
  });
  updateSelectedGroupCount();
  applyGroupsVisibilityFilter();
  void refreshOnboardingStateFromContext();
}

async function persistLoadedGroups() {
  await chrome.storage.local.set({
    [STORAGE_LOADED_GROUPS_KEY]: Array.from(lastLoadedGroups.values()),
  });
}

async function loadPersistedGroups() {
  const data = await chrome.storage.local.get([STORAGE_LOADED_GROUPS_KEY]);
  const groups = Array.isArray(data?.[STORAGE_LOADED_GROUPS_KEY])
    ? data[STORAGE_LOADED_GROUPS_KEY]
    : [];
  if (!groups.length) return;

  groups.forEach((g) => {
    const key = String(g.id);
    lastLoadedGroups.set(key, g);
    upsertGroupCard(g);
  });
  qs("groupCount").textContent = translate("groups.count", { count: groups.length });
}

function fallbackAvatarDataUri() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36">` +
    `<rect width="36" height="36" fill="#e2e8f0"/>` +
    `</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function createGroupCard(g) {
  const card = document.createElement("div");
  card.className = "group-card";
  card.dataset.groupId = String(g.id);
  card.tabIndex = 0;

  const img = document.createElement("img");
  img.src = g.image || fallbackAvatarDataUri();
  img.alt = g.name || translate("groups.title");
  img.addEventListener("error", () => {
    img.src = fallbackAvatarDataUri();
  });

  const top = document.createElement("div");
  top.className = "group-top";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = g.name || translate("common.none");

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${g.privacy || ""} · ${g.members || ""} · ID: ${g.id ?? ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "group-select";
  checkbox.checked = selectedGroupIds.has(String(g.id));
  checkbox.title = translate("groups.select_group");
  const applySelectionState = (selected) => {
    checkbox.checked = selected;
    card.classList.toggle("selected", selected);
  };
  applySelectionState(checkbox.checked);

  let toggleBusy = false;
  const toggleSelection = async () => {
    if (toggleBusy) return;
    toggleBusy = true;
    const groupId = String(g.id);
    const next = !selectedGroupIds.has(groupId);
    if (next) selectedGroupIds.add(groupId);
    else selectedGroupIds.delete(groupId);
    applySelectionState(next);
    await persistSelectedGroupIds();
    setTimeout(() => {
      toggleBusy = false;
    }, 80);
  };

  card.addEventListener("click", async () => {
    await toggleSelection();
  });
  checkbox.style.pointerEvents = "none";
  card.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    await toggleSelection();
  });
  const info = document.createElement("div");
  info.className = "info";
  info.appendChild(name);
  info.appendChild(meta);

  top.appendChild(img);
  top.appendChild(checkbox);
  card.appendChild(top);
  card.appendChild(info);

  return card;
}

function upsertGroupCard(g) {
  const key = String(g.id);
  const existing = qs("groupsList").querySelector(`[data-group-id="${key}"]`);
  if (existing) return;
  qs("groupsList").appendChild(createGroupCard(g));
}

function renderGroupsLoadingSkeleton(count = 8) {
  const list = qs("groupsList");
  list.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const sk = document.createElement("div");
    sk.className = "group-card skeleton";
    sk.innerHTML =
      `<div class="group-top"><div class="thumb"></div><div class="group-select"></div></div>` +
      `<div><div class="bar"></div><div class="bar short"></div></div>`;
    list.appendChild(sk);
  }
}

function formatLeadDate(ts) {
  const date = new Date(Number(ts) || Date.now());
  return date.toLocaleString();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const txt = String(value || "").trim();
    if (txt) return txt;
  }
  return "";
}

function buildLink(label, href) {
  const a = document.createElement("a");
  a.textContent = label;
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function renderLeads() {
  const list = qs("leadsList");
  list.innerHTML = "";
  const filtered = getFilteredLeads();

  qs("leadsCount").textContent = translate("leads.count_7d", {
    count: filtered.length,
  });

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = translate("leads.empty_7d");
    list.appendChild(empty);
    return;
  }

  filtered.forEach((lead) => {
    const card = document.createElement("div");
    card.className = "lead-card";

    const head = document.createElement("div");
    head.className = "lead-head";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "lead-title";
    title.textContent = `${lead.group_name || translate("groups.title")} • ${lead.poster_name || translate("common.none")}`;
    const meta = document.createElement("div");
    meta.className = "lead-meta";
    meta.textContent = `${formatLeadDate(lead.detectedAt)}${
      lead.profileName
        ? translate("leads.meta_profile", { profile: lead.profileName })
        : ""
    }`;
    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "lead-meta";
    right.textContent = lead.post_type || "";

    head.appendChild(left);
    head.appendChild(right);

    const text = document.createElement("div");
    text.className = "lead-text";
    text.textContent = firstNonEmpty(
      lead.post_text,
      lead.marketplace_text,
      translate("leads.no_text"),
    );

    const links = document.createElement("div");
    links.className = "lead-links";
    if (lead.post_url)
      links.appendChild(buildLink(translate("leads.link_post"), lead.post_url));
    if (lead.user_profile_url) {
      links.appendChild(
        buildLink(translate("leads.link_person"), lead.user_profile_url),
      );
    }
    if (lead.group_url)
      links.appendChild(buildLink(translate("leads.link_group"), lead.group_url));

    card.appendChild(head);
    card.appendChild(text);
    card.appendChild(links);
    list.appendChild(card);
  });
}

async function refreshLeadsHistory() {
  chrome.runtime.sendMessage({ type: "getLeadHistory" }, (response) => {
    if (!response?.success) {
      appendLog(
        "logPosts",
        `❌ Falha ao carregar histórico: ${response?.error}`,
        "err",
      );
      return;
    }
    leadsHistory = Array.isArray(response.leads) ? response.leads : [];
    const profileSelect = qs("leadsProfileFilter");
    if (profileSelect) {
      const previous = profileSelect.value;
      const profileNames = Array.from(
        new Set(
          leadsHistory
            .map((lead) => String(lead.profileName || "").trim())
            .filter(Boolean),
        ),
      );
      profileSelect.innerHTML = `<option value="">${translate("leads.all_alerts")}</option>`;
      profileNames.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        profileSelect.appendChild(opt);
      });
      profileSelect.value = profileNames.includes(previous) ? previous : "";
    }
    renderLeads();
    renderHomeInsights();
  });
}

function parseKeywordsInput(value) {
  return String(value || "")
    .split(/[\n,]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function renderKeywordPreview(targetId, keywords, kind) {
  const container = qs(targetId);
  container.innerHTML = "";
  if (!keywords.length) {
    const empty = document.createElement("div");
    empty.className = "kw-empty";
    empty.textContent = translate("common.none");
    container.appendChild(empty);
    return;
  }
  keywords.forEach((kw) => {
    const chip = document.createElement("span");
    chip.className = `kw-chip ${kind}`;
    chip.textContent = kw;
    container.appendChild(chip);
  });
}

function updateProfileKeywordPreview() {
  const pos = parseKeywordsInput(qs("profileEditorPositive").value);
  const neg = parseKeywordsInput(qs("profileEditorNegative").value);
  renderKeywordPreview("profilePreviewPos", pos, "pos");
  renderKeywordPreview("profilePreviewNeg", neg, "neg");
  updateProfileSummaryCard();
}

function updateMonitorProfilePreview() {
  const profile = getProfileById(selectedProfileId);
  const pos = profile?.positiveKeywords || [];
  const neg = profile?.negativeKeywords || [];
  renderKeywordPreview("monitorPreviewPos", pos, "pos");
  renderKeywordPreview("monitorPreviewNeg", neg, "neg");
}

function buildMonitorConfigFromUi() {
  const selected = getProfileById(selectedProfileId);
  return {
    profileName: selected?.name || "",
    positiveKeywords: selected?.positiveKeywords || [],
    negativeKeywords: selected?.negativeKeywords || [],
    minMinutes: Number(globalMonitorFrequency?.min) || 5,
    maxMinutes: Number(globalMonitorFrequency?.max) || 10,
    selectedProfileId: selectedProfileId || "",
  };
}

async function persistMonitorConfigFromUi() {
  const config = buildMonitorConfigFromUi();
  await chrome.storage.local.set({ [STORAGE_MONITOR_CONFIG_KEY]: config });
}

async function loadMonitorConfigToUi() {
  const data = await chrome.storage.local.get([STORAGE_MONITOR_CONFIG_KEY]);
  const config = data?.[STORAGE_MONITOR_CONFIG_KEY] || {};
  selectedProfileId = config.selectedProfileId || "";
}

async function fetchFacebookSettingsHtml() {
  const res = await fetch("https://www.facebook.com/settings", {
    method: "GET",
    credentials: "include",
  });
  return await res.text();
}

function setupTabs() {
  qsa(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.tab);
    });
  });
}

function setupSidebarTooltips() {
  const tooltip = qs("sidebarTooltip");
  if (!tooltip) return;

  let showTimer = null;
  let activeButton = null;

  const hide = () => {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    tooltip.classList.remove("show");
    activeButton = null;
  };

  qsa(".tab-btn").forEach((btn) => {
    const text = btn.textContent?.trim() || "";

    btn.addEventListener("mouseenter", () => {
      if (window.innerWidth > 480) return;
      if (showTimer) clearTimeout(showTimer);
      activeButton = btn;
      showTimer = setTimeout(() => {
        if (!activeButton) return;
        const rect = activeButton.getBoundingClientRect();
        tooltip.textContent = text;
        tooltip.style.left = `${Math.round(rect.right + 8)}px`;
        tooltip.style.top = `${Math.round(rect.top + rect.height / 2 - 14)}px`;
        tooltip.classList.add("show");
      }, 300);
    });

    btn.addEventListener("mouseleave", hide);
    btn.addEventListener("click", hide);
  });

  window.addEventListener("resize", hide);
  window.addEventListener("scroll", hide, { passive: true });
}

function setupOnboardingWorkspaceActions() {
  const loadBtn = qs("btnOnboardLoadGroups");
  const selectBtn = qs("btnOnboardSelectVisible");
  const clearBtn = qs("btnOnboardClearGroups");
  const searchInput = qs("onboardGroupsSearch");

  if (loadBtn) {
    loadBtn.addEventListener("click", () => {
      qs("btnGetGroups").click();
    });
  }
  if (selectBtn) {
    selectBtn.addEventListener("click", async () => {
      const search = String(searchInput?.value || "")
        .trim()
        .toLowerCase();
      for (const g of lastLoadedGroups.values()) {
        const matches =
          !search || String(g?.name || "").toLowerCase().includes(search);
        if (matches) selectedGroupIds.add(String(g.id));
      }
      await persistSelectedGroupIds();
      renderOnboardingGroupsList();
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      selectedGroupIds.clear();
      await persistSelectedGroupIds();
      renderOnboardingGroupsList();
    });
  }
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderOnboardingGroupsList();
    });
  }

  const watchInput = qs("onboardWatchInput");
  const excludeInput = qs("onboardExcludeInput");

  const bindKeywordInput = (inputEl, kind) => {
    if (!inputEl) return;
    const commit = () => {
      const value = String(inputEl.value || "").trim();
      if (!value) return;
      addOnboardKeyword(kind, value);
      inputEl.value = "";
    };
    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        commit();
      }
    });
    inputEl.addEventListener("blur", commit);
  };

  bindKeywordInput(watchInput, "watch");
  bindKeywordInput(excludeInput, "exclude");

  qsa(".onboard-watch-suggestion").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      addOnboardKeyword("watch", btn.dataset.value || "");
    });
  });

  qsa(".onboard-exclude-suggestion").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      addOnboardKeyword("exclude", btn.dataset.value || "");
    });
  });

  qs("btnOpenSettingsFrequency")?.addEventListener("click", () => {
    activateTab("settings");
    qs("globalFrequencySelect")?.focus();
  });

  const guidedInput = qs("guidedPromptInput");
  if (guidedInput) {
    guidedInput.addEventListener("input", () => {
      renderAgentActionsByQuery(guidedInput.value);
    });
    guidedInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const first = getFilteredGuidedActions(guidedInput.value)[0];
        if (first) runGuidedAction(first);
        return;
      }
      if (event.key === "ArrowUp") {
        if (!guidedCommandHistory.length) return;
        event.preventDefault();
        guidedHistoryCursor = Math.min(
          guidedCommandHistory.length - 1,
          guidedHistoryCursor + 1,
        );
        guidedInput.value = guidedCommandHistory[guidedHistoryCursor] || "";
        renderAgentActionsByQuery(guidedInput.value);
        return;
      }
      if (event.key === "ArrowDown") {
        if (!guidedCommandHistory.length) return;
        event.preventDefault();
        guidedHistoryCursor = Math.max(-1, guidedHistoryCursor - 1);
        guidedInput.value =
          guidedHistoryCursor === -1
            ? ""
            : guidedCommandHistory[guidedHistoryCursor] || "";
        renderAgentActionsByQuery(guidedInput.value);
      }
    });
  }
}

function getProfileById(id) {
  return savedProfiles.find((p) => p.id === id);
}

async function persistProfiles() {
  await chrome.storage.local.set({ [STORAGE_PROFILES_KEY]: savedProfiles });
}

function profileKeywordsSummary(profile) {
  const pos = (profile.positiveKeywords || []).length;
  const neg = (profile.negativeKeywords || []).length;
  return `${pos} ${translate("kw.watch_for").toLowerCase()} · ${neg} ${translate("kw.exclude_words").toLowerCase()}`;
}

function appendKeywordToEditor(targetId, value) {
  const el = qs(targetId);
  if (!el) return;
  const current = String(el.value || "").trim();
  const next = current ? `${current}, ${value}` : value;
  el.value = next;
  updateProfileKeywordPreview();
}

function getWizardStepIndex(step) {
  const idx = PROFILE_WIZARD_STEPS.indexOf(step);
  return idx >= 0 ? idx : 0;
}

function updateProfileNameCounter() {
  const input = qs("profileEditorName");
  const counter = qs("profileNameCounter");
  if (!input || !counter) return;
  const size = String(input.value || "").length;
  counter.textContent = `${size}/40`;
}

function updateFrequencyCardSelection(min, max) {
  qsa(".freq-card").forEach((card) => {
    const cardMin = Number(card.dataset.min) || 0;
    const cardMax = Number(card.dataset.max) || 0;
    card.classList.toggle("active", cardMin === min && cardMax === max);
  });
}

function getWizardLocaleCopy() {
  const pt = currentLanguage === "pt-br";
  return {
    stepLabel: pt ? "Etapa {current} de {total}" : "Step {current} of {total}",
    questions: {
      name: pt
        ? "Como você quer chamar este alerta?"
        : "What do you want to call this alert?",
      watch: pt
        ? "Quais palavras alguém usaria quando precisa do que você oferece?"
        : "What words would someone use when they need what you offer?",
      exclude: pt
        ? "Tem palavras que significam que NÃO é lead?"
        : "Any words that mean it is NOT a lead?",
      summary: pt ? "Aqui está seu alerta." : "Here is your alert summary.",
    },
    hints: {
      name: pt
        ? "Máximo 40 caracteres."
        : "Maximum 40 characters.",
      watch: pt
        ? "Dica: [Skip] aumenta bastante o volume."
        : "Tip: [Skip] can generate high volume.",
      exclude: pt
        ? "Use exclusões para reduzir ruído."
        : "Use exclude words to reduce noise.",
      summary: pt
        ? "Revise antes de iniciar."
        : "Review before starting.",
    },
    btnBack: pt ? "Voltar" : "Back",
    btnNext: pt ? "Próximo" : "Next",
    btnSave: pt ? "Salvar alerta" : "Save alert",
    btnStart: pt ? "Iniciar monitoramento" : "Start monitoring",
    skipWatch: pt ? "Pular - me notifique sobre todos os posts" : "Skip - notify me about all posts",
    skipExclude: pt ? "Pular" : "Skip",
    freeFrequencyLock: pt
      ? "Plano Free permite apenas 15-20 min."
      : "Free plan only allows 15-20 min.",
    freeNotifyLock: pt
      ? "Webhook e Slack são recursos Pro. Upgrade único, uso vitalício."
      : "Webhook and Slack are Pro features. Upgrade once, use forever.",
    skipWatchWarn: pt
      ? "Você escolheu monitorar sem palavras include. Volume pode ficar alto."
      : "You chose to monitor without watch words. Volume can be high.",
  };
}

function applyWizardPlanLocks() {
  const level = resolvePlanLevel();
  const isFree = level === "free";

  qsa(".freq-card").forEach((card) => {
    const proOnly = card.dataset.proOnly === "1";
    card.classList.toggle("locked", isFree && proOnly);
    const title = card.querySelector(".title");
    if (!title) return;
    const existing = title.querySelector(".lock-badge");
    if (existing) existing.remove();
    if (isFree && proOnly) {
      const badge = document.createElement("span");
      badge.className = "lock-badge";
      badge.textContent = "Pro";
      title.appendChild(badge);
    }
  });

  ["notifyWebhookWrap", "notifySlackWrap"].forEach((id) => {
    const wrap = qs(id);
    if (!wrap) return;
    wrap.classList.toggle("locked", isFree);
  });

  const notifyWebhook = qs("notifyWebhook");
  const notifySlack = qs("notifySlack");
  if (notifyWebhook) {
    notifyWebhook.disabled = isFree;
    if (isFree) notifyWebhook.checked = false;
  }
  if (notifySlack) {
    notifySlack.disabled = isFree;
    if (isFree) notifySlack.checked = false;
  }
}

function updateProfileSummaryCard() {
  const box = qs("profileSummaryCard");
  if (!box) return;
  const name = String(qs("profileEditorName")?.value || "").trim() || "(unnamed)";
  const watch = parseKeywordsInput(qs("profileEditorPositive")?.value || "");
  const exclude = parseKeywordsInput(qs("profileEditorNegative")?.value || "");

  box.innerHTML =
    `<div><strong>${translate("profiles.name_label")}:</strong> ${name}</div>` +
    `<div><strong>${translate("groups.title")}:</strong> ${selectedGroupIds.size}</div>` +
    `<div><strong>${translate("kw.watch_for")}:</strong> ${watch.join(", ") || translate("profiles.all_posts")}</div>` +
    `<div><strong>${translate("kw.exclude_words")}:</strong> ${exclude.join(", ") || translate("common.none")}</div>` +
    `<div><strong>${translate("settings.frequency_title")} / ${translate("settings.notifications_title")}:</strong> ${translate("profiles.configured_in_settings")}</div>`;
}

function getDefaultFrequencyForPlan() {
  const level = resolvePlanLevel();
  if (level === "free") return { min: 15, max: 20 };
  return { min: 5, max: 10 };
}

function frequencyPairFromString(value) {
  const [minRaw, maxRaw] = String(value || "").split("-");
  const min = Number(minRaw) || 5;
  const max = Number(maxRaw) || 10;
  return { min, max };
}

function frequencyPairToString(min, max) {
  return `${Number(min) || 5}-${Number(max) || 10}`;
}

async function loadGlobalMonitorFrequency() {
  const data = await chrome.storage.local.get([STORAGE_GLOBAL_FREQUENCY_KEY]);
  const saved = data?.[STORAGE_GLOBAL_FREQUENCY_KEY];
  if (saved && typeof saved === "object") {
    globalMonitorFrequency = {
      min: Number(saved.min) || 5,
      max: Number(saved.max) || 10,
    };
  } else {
    globalMonitorFrequency = getDefaultFrequencyForPlan();
    await chrome.storage.local.set({
      [STORAGE_GLOBAL_FREQUENCY_KEY]: globalMonitorFrequency,
    });
  }
  renderGlobalFrequencyUi();
}

async function persistGlobalMonitorFrequency(next) {
  globalMonitorFrequency = {
    min: Number(next?.min) || 5,
    max: Number(next?.max) || 10,
  };
  await chrome.storage.local.set({
    [STORAGE_GLOBAL_FREQUENCY_KEY]: globalMonitorFrequency,
  });
  renderGlobalFrequencyUi();
}

function renderGlobalFrequencyUi() {
  const cards = qsa(".settings-freq-card");
  const hint = qs("globalFrequencyHint");
  if (!cards.length || !hint) return;

  const level = resolvePlanLevel();
  const isFree = level === "free";
  cards.forEach((card) => {
    const min = Number(card.dataset.min) || 0;
    const max = Number(card.dataset.max) || 0;
    const proOnly = card.dataset.proOnly === "1";
    card.classList.toggle("locked", isFree && proOnly);
    card.classList.toggle(
      "active",
      min === globalMonitorFrequency.min && max === globalMonitorFrequency.max,
    );
  });

  if (isFree && globalMonitorFrequency.min < 15) {
    globalMonitorFrequency = { min: 15, max: 20 };
    cards.forEach((card) => {
      const min = Number(card.dataset.min) || 0;
      const max = Number(card.dataset.max) || 0;
      card.classList.toggle("active", min === 15 && max === 20);
    });
  }

  hint.textContent = translate("settings.frequency_current", {
    min: globalMonitorFrequency.min,
    max: globalMonitorFrequency.max,
  });
  if (qs("profileEditorMin")) qs("profileEditorMin").value = String(globalMonitorFrequency.min);
  if (qs("profileEditorMax")) qs("profileEditorMax").value = String(globalMonitorFrequency.max);
  onboardAlertFrequency = {
    min: globalMonitorFrequency.min,
    max: globalMonitorFrequency.max,
  };
  const onboardFreqText = qs("onboardAlertFreqText");
  if (onboardFreqText) {
    onboardFreqText.textContent = translate("settings.frequency_current", {
      min: globalMonitorFrequency.min,
      max: globalMonitorFrequency.max,
    });
  }
}

function renderProfileWizard() {
  const copy = getWizardLocaleCopy();
  const step = currentProfileWizardStep;
  const idx = getWizardStepIndex(step) + 1;
  const total = PROFILE_WIZARD_STEPS.length;
  const pill = qs("profileWizardPill");
  const question = qs("profileWizardQuestion");
  const hint = qs("profileWizardHint");
  const btnPrev = qs("btnProfilePrevStep");
  const btnNext = qs("btnProfileNextStep");
  const btnSave = qs("btnSaveProfile");
  const btnStart = qs("btnProfileStartMonitoring");
  const btnSkipWatch = qs("btnProfileSkipWatch");
  const btnSkipExclude = qs("btnProfileSkipExclude");

  if (pill) {
    pill.textContent = copy.stepLabel
      .replace("{current}", String(idx))
      .replace("{total}", String(total));
  }

  if (question) question.textContent = copy.questions[step] || "";
  if (hint) hint.textContent = copy.hints[step] || "";

  const stepMap = {
    name: "profileStepName",
    watch: "profileStepWatch",
    exclude: "profileStepExclude",
    summary: "profileStepSummary",
  };
  Object.entries(stepMap).forEach(([name, id]) => {
    const el = qs(id);
    if (!el) return;
    el.classList.toggle("active", name === step);
  });

  if (btnPrev) btnPrev.style.display = idx === 1 ? "none" : "";
  if (btnNext) btnNext.style.display = step === "summary" ? "none" : "";
  if (btnSave) btnSave.style.display = step === "summary" ? "" : "none";
  if (btnStart) btnStart.style.display = step === "summary" ? "" : "none";
  if (btnPrev) btnPrev.textContent = copy.btnBack;
  if (btnNext) btnNext.textContent = copy.btnNext;
  if (btnSave) btnSave.textContent = copy.btnSave;
  if (btnStart) btnStart.textContent = copy.btnStart;
  if (btnSkipWatch) btnSkipWatch.textContent = copy.skipWatch;
  if (btnSkipExclude) btnSkipExclude.textContent = copy.skipExclude;

  updateProfileNameCounter();
  updateProfileSummaryCard();
  applyWizardPlanLocks();
}

function goProfileWizardStep(delta) {
  const current = getWizardStepIndex(currentProfileWizardStep);
  const target = Math.max(
    0,
    Math.min(PROFILE_WIZARD_STEPS.length - 1, current + delta),
  );
  currentProfileWizardStep = PROFILE_WIZARD_STEPS[target];
  renderProfileWizard();
}

function validateCurrentProfileWizardStep() {
  if (currentProfileWizardStep === "name") {
    const name = String(qs("profileEditorName")?.value || "").trim();
    if (!name) {
      appendLog("logGeneral", translate("profiles.name_required"), "warn");
      return false;
    }
    if (name.length > 40) {
      appendLog("logGeneral", translate("profiles.name_max_40"), "warn");
      return false;
    }
  }

  return true;
}

function renderProfiles() {
  const list = qs("profilesList");
  list.innerHTML = "";

  if (!savedProfiles.length) {
    list.innerHTML = `<div class="muted">${translate("profiles.none_saved")}</div>`;
  } else {
    savedProfiles.forEach((profile) => {
      const item = document.createElement("div");
      item.className = `profile-item ${profile.id === selectedProfileId ? "active" : ""}`;
      item.innerHTML =
        `<div class="title">${profile.name}</div>` +
        `<div class="meta">${profileKeywordsSummary(profile)}</div>`;
      item.addEventListener("click", () => {
        selectProfile(profile.id, true);
      });
      list.appendChild(item);
    });
  }

  const select = qs("monitorProfileSelect");
  const previous = select.value;
  select.innerHTML = `<option value="">${translate("monitor.select_alert")}</option>`;
  savedProfiles.forEach((profile) => {
    const opt = document.createElement("option");
    opt.value = profile.id;
    opt.textContent = profile.name;
    select.appendChild(opt);
  });
  select.value = selectedProfileId || previous || "";

  const badge = qs("activeProfileBadge");
  const selected = getProfileById(selectedProfileId);
  badge.textContent = selected
    ? `${translate("profiles.active_label")}: ${selected.name}`
    : translate("profiles.none_selected");
  renderLeads();
  const current = getProfileById(selectedProfileId);
  if (current) {
    const nameInput = qs("profileEditorName");
    if (nameInput) nameInput.value = String(current.name || "");
  }
}

function selectProfile(profileId, syncMonitorFields) {
  selectedProfileId = profileId || "";
  const profile = getProfileById(selectedProfileId);

  if (profile) {
    qs("profileEditorName").value = profile.name;
    qs("profileEditorPositive").value = (profile.positiveKeywords || []).join(
      ", ",
    );
    qs("profileEditorNegative").value = (profile.negativeKeywords || []).join(
      ", ",
    );
    qs("profileEditorMin").value = String(globalMonitorFrequency.min);
    qs("profileEditorMax").value = String(globalMonitorFrequency.max);
    updateFrequencyCardSelection(
      Number(globalMonitorFrequency.min) || 5,
      Number(globalMonitorFrequency.max) || 10,
    );

    if (syncMonitorFields) void persistMonitorConfigFromUi();
  } else {
    qs("profileEditorMin").value = String(globalMonitorFrequency.min);
    qs("profileEditorMax").value = String(globalMonitorFrequency.max);
    updateFrequencyCardSelection(globalMonitorFrequency.min, globalMonitorFrequency.max);
  }

  renderProfiles();
  updateMonitorProfilePreview();
  updateProfileKeywordPreview();
  updateProfileSummaryCard();
  renderProfileWizard();
  void refreshOnboardingStateFromContext();
}

async function loadProfiles() {
  const data = await chrome.storage.local.get([STORAGE_PROFILES_KEY]);
  savedProfiles = Array.isArray(data?.[STORAGE_PROFILES_KEY])
    ? data[STORAGE_PROFILES_KEY]
    : [];
  renderProfiles();
}

async function saveProfileFromEditor() {
  const name = qs("profileEditorName").value.trim();
  if (!name) {
    appendLog("logGeneral", translate("profiles.name_required"), "warn");
    return false;
  }
  if (name.length > 40) {
    appendLog("logGeneral", translate("profiles.name_max_40"), "warn");
    return false;
  }
  const genericNames = new Set(["test", "aaa"]);
  if (genericNames.has(name.toLowerCase())) {
    appendLog("logGeneral", translate("profiles.hint_descriptive"), "info");
  }

  const positiveKeywords = parseKeywordsInput(
    qs("profileEditorPositive").value,
  );
  const negativeKeywords = parseKeywordsInput(
    qs("profileEditorNegative").value,
  );
  const minMinutes = Number(globalMonitorFrequency.min) || 5;
  const maxMinutes = Number(globalMonitorFrequency.max) || 10;
  qs("profileEditorMin").value = String(minMinutes);
  qs("profileEditorMax").value = String(maxMinutes);

  const planCheck = enforcePlanForAlertSave({
    positiveKeywords,
    negativeKeywords,
    minMinutes,
    maxMinutes,
  });
  if (!planCheck.ok) {
    appendLog("logGeneral", planCheck.error, "warn");
    return false;
  }

  if (!selectedProfileId) {
    const duplicate = savedProfiles.find(
      (p) => String(p.name || "").trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      selectedProfileId = duplicate.id;
      appendLog(
        "logGeneral",
        translate("profiles.duplicate_overwrite", { name: duplicate.name }),
        "warn",
      );
    }
  }

  if (selectedProfileId) {
    const idx = savedProfiles.findIndex((p) => p.id === selectedProfileId);
    if (idx >= 0) {
      savedProfiles[idx] = {
        ...savedProfiles[idx],
        name,
        positiveKeywords,
        negativeKeywords,
        minMinutes,
        maxMinutes,
        updatedAt: new Date().toISOString(),
      };
    }
  } else {
    selectedProfileId = `${Date.now()}`;
    savedProfiles.push({
      id: selectedProfileId,
      name,
      positiveKeywords,
      negativeKeywords,
      minMinutes,
      maxMinutes,
      updatedAt: new Date().toISOString(),
    });
  }

  await persistProfiles();
  const profile = getProfileById(selectedProfileId);
  if (profile) await upsertAlertToCloud(profile);
  selectProfile(selectedProfileId, true);
  appendLog("logGeneral", translate("profiles.saved_ok"), "ok");
  await refreshOnboardingStateFromContext();
  updateProfileSummaryCard();
  return true;
}

function setupProfileActions() {
  qs("btnNewProfile").addEventListener("click", () => {
    selectedProfileId = "";
    qs("profileEditorName").value = "";
    qs("profileEditorPositive").value = "";
    qs("profileEditorNegative").value = "";
    qs("profileEditorMin").value = String(globalMonitorFrequency.min);
    qs("profileEditorMax").value = String(globalMonitorFrequency.max);
    updateFrequencyCardSelection(globalMonitorFrequency.min, globalMonitorFrequency.max);
    currentProfileWizardStep = "name";
    renderProfiles();
    updateMonitorProfilePreview();
    updateProfileKeywordPreview();
    renderProfileWizard();
  });

  qs("btnSaveProfile").addEventListener("click", async () => {
    await saveProfileFromEditor();
  });

  qs("btnDeleteProfile").addEventListener("click", async () => {
    if (!selectedProfileId) {
      appendLog("logGeneral", translate("profiles.select_to_delete"), "warn");
      return;
    }

    const deletingId = selectedProfileId;
    savedProfiles = savedProfiles.filter((p) => p.id !== selectedProfileId);
    selectedProfileId = "";
    qs("profileEditorName").value = "";
    qs("profileEditorPositive").value = "";
    qs("profileEditorNegative").value = "";
    qs("profileEditorMin").value = String(globalMonitorFrequency.min);
    qs("profileEditorMax").value = String(globalMonitorFrequency.max);
    updateFrequencyCardSelection(globalMonitorFrequency.min, globalMonitorFrequency.max);
    await persistProfiles();
    await deactivateAlertInCloud(deletingId);
    renderProfiles();
    updateMonitorProfilePreview();
    updateProfileKeywordPreview();
    await persistMonitorConfigFromUi();
    appendLog("logGeneral", translate("profiles.removed"), "warn");
    await refreshOnboardingStateFromContext();
  });

  qs("monitorProfileSelect").addEventListener("change", async (event) => {
    const profileId = event.target.value || "";
    if (!profileId) {
      selectedProfileId = "";
      renderProfiles();
      updateMonitorProfilePreview();
      await persistMonitorConfigFromUi();
      return;
    }
    selectProfile(profileId, true);
  });

  qs("btnProfilePrevStep").addEventListener("click", () => {
    goProfileWizardStep(-1);
  });

  qs("btnProfileNextStep").addEventListener("click", () => {
    if (!validateCurrentProfileWizardStep()) return;
    goProfileWizardStep(1);
  });

  qs("btnProfileStartMonitoring").addEventListener("click", async () => {
    const ok = await saveProfileFromEditor();
    if (!ok) return;
    activateTab("home");
    qs("btnStartMonitor").click();
  });

  qs("btnProfileSkipWatch").addEventListener("click", () => {
    const copy = getWizardLocaleCopy();
    appendLog("logGeneral", copy.skipWatchWarn, "warn");
    if (currentProfileWizardStep === "watch") goProfileWizardStep(1);
  });

  qs("btnProfileSkipExclude").addEventListener("click", () => {
    if (currentProfileWizardStep === "exclude") goProfileWizardStep(1);
  });

  qs("profileEditorName").addEventListener("input", () => {
    updateProfileNameCounter();
    updateProfileSummaryCard();
  });

  qsa(".profile-watch-suggestion").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      appendKeywordToEditor("profileEditorPositive", btn.dataset.value || "");
      updateProfileSummaryCard();
    });
  });

  qsa(".profile-exclude-suggestion").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      appendKeywordToEditor("profileEditorNegative", btn.dataset.value || "");
      updateProfileSummaryCard();
    });
  });

  qsa(".freq-card").forEach((card) => {
    card.addEventListener("click", () => {
      const copy = getWizardLocaleCopy();
      const level = resolvePlanLevel();
      const proOnly = card.dataset.proOnly === "1";
      if (level === "free" && proOnly) {
        appendLog("logGeneral", copy.freeFrequencyLock, "warn");
        const warning = qs("profileFrequencyWarning");
        if (warning) warning.textContent = copy.freeFrequencyLock;
        return;
      }

      const min = Number(card.dataset.min) || 5;
      const max = Number(card.dataset.max) || 10;
      qs("profileEditorMin").value = String(min);
      qs("profileEditorMax").value = String(max);
      updateFrequencyCardSelection(min, max);

      const warning = qs("profileFrequencyWarning");
      const highRisk = min <= 5;
      if (level === "free" && min < 15) {
        if (warning) {
          warning.textContent = copy.freeFrequencyLock;
        }
      } else if (warning) {
        warning.textContent = highRisk
          ? "Frequent checks increase detection risk. Use with caution."
          : "Monitoring runs in background. No need to keep this window open.";
      }
      updateProfileSummaryCard();
    });
  });

  ["notifyBrowser", "notifyWebhook", "notifySlack", "notifyInApp"].forEach(
    (id) => {
      const el = qs(id);
      if (!el) return;
      el.addEventListener("change", () => {
        const copy = getWizardLocaleCopy();
        const level = resolvePlanLevel();
        if (
          level === "free" &&
          (id === "notifyWebhook" || id === "notifySlack") &&
          el.checked
        ) {
          el.checked = false;
          appendLog("logGeneral", copy.freeNotifyLock, "warn");
        }
        updateProfileSummaryCard();
      });
    },
  );
}

function resolveMonitorPayload() {
  const config = buildMonitorConfigFromUi();

  return {
    ...config,
    selectedGroupIds: Array.from(selectedGroupIds),
  };
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "backgroundLog") {
    appendLog("logGeneral", message.message, "info");
  }

  if (message?.type === "error") {
    appendLog(
      "logGeneral",
      `[ERRO ${message.severity}] ${message.errorMessage}`,
      "err",
    );
  }

  if (message?.type === "groupsFetched") {
    setOrbState("connecting");
    appendLog(
      "logGeneral",
      translate("log.groups_loaded_so_far", { count: message.count }),
      "info",
    );
  }

  if (message?.type === "groupsChunk") {
    const hasSkeleton = !!qs("groupsList").querySelector(
      ".group-card.skeleton",
    );
    if (hasSkeleton) qs("groupsList").innerHTML = "";
    const chunk = Array.isArray(message.groups) ? message.groups : [];
    chunk.forEach((g) => {
      const key = String(g.id);
      lastLoadedGroups.set(key, g);
      upsertGroupCard(g);
    });
    qs("groupCount").textContent = translate("groups.count", {
      count: message.count || lastLoadedGroups.size,
    });
    updateSelectedGroupCount();
    applyGroupsVisibilityFilter();
    void persistLoadedGroups();
  }

  if (message?.type === "groupsStreamDone") {
    setGroupFetchState(false);
    setOrbState(isMonitorRunning ? "monitoring" : "idle");
    if (message.success) {
      appendLog(
        "logGeneral",
        translate("log.groups_stream_done", {
          stopped: message.stopped ? translate("log.stopped_suffix") : "",
          total: message.total || lastLoadedGroups.size,
        }),
        "ok",
      );
    } else {
      appendLog(
        "logGeneral",
        translate("log.groups_stream_failed", { error: message.error }),
        "err",
      );
    }
    onboardingGroupsProgress.started = false;
  }

  if (message?.type === "monitorState") {
    setMonitorState(
      !!message.running,
      message.running ? translate("status.monitoring") : translate("status.stopped"),
    );
    if (!message.running) appendLog("logPosts", translate("log.monitor_stopped"), "warn");
    void refreshOnboardingStateFromContext();
  }

  if (message?.type === "monitorSleep") {
    if (message.active) {
      setOrbState("paused");
      appendLog("logPosts", message.message || translate("log.sleep_mode_active"), "warn");
    } else {
      setOrbState(isMonitorRunning ? "monitoring" : "idle");
      appendLog("logPosts", message.message || translate("log.sleep_mode_ended"), "ok");
    }
  }

  if (message?.type === "monitorTick") {
    if (message.phase === "start") {
      setOrbState("connecting");
      appendLog("logGeneral", message.message || translate("log.cycle_started"), "info");
      qs("monitorNextRun").textContent = translate("status.checking_now");
      return;
    }
    const mins = Math.round((Number(message.nextDelayMs) || 0) / 60000);
    qs("monitorNextRun").textContent = translate("status.next_check", { mins });
    if (message.warmup) {
      setOrbState("monitoring");
      appendLog(
        "logPosts",
        translate("log.warmup_done", { mins }),
        "info",
      );
    } else {
      setOrbState("monitoring");
      appendLog(
        "logPosts",
        translate("log.checked_posts", {
          polled: message.polledCount,
          matched: message.matchedCount,
          mins,
        }),
        "info",
      );
    }
  }

  if (message?.type === "monitorMatches") {
    setOrbState("lead");
    const matches = Array.isArray(message.matches) ? message.matches : [];
    if (!matches.length) return;
    appendLog(
      "logPosts",
      translate("log.new_matches", {
        count: matches.length,
        profile: message.profileName ? ` [${message.profileName}]` : "",
      }),
      "ok",
    );
    matches.slice(0, 10).forEach((p) => {
      const txt = (p.post_text || p.marketplace_text || "").slice(0, 110);
      appendLog(
        "logPosts",
        `  → ${p.group_name} | ${p.poster_name}: ${txt}`,
        "info",
      );
    });
    void refreshLeadsHistory();
  }

  if (message?.type === "monitorRawPosts") {
    const posts = Array.isArray(message.posts) ? message.posts : [];
    const feedTotal = Number(message.fetchedTotal) || posts.length;
    appendLog(
      "logPosts",
      translate("log.debug_cycle", {
        posts: posts.length,
        feed: feedTotal,
        profile: message.profileName ? ` [${message.profileName}]` : "",
      }),
      "info",
    );

    posts.forEach((p) => {
      const txt = (p.post_text || p.marketplace_text || "")
        .replace(/\s+/g, " ")
        .trim();
      const snippet = txt ? txt.slice(0, 120) : "(sem texto)";
      appendLog(
        "logPosts",
        `  • ${p.group_name || translate("groups.title")} | ${p.poster_name || translate("common.none")} | ${p.post_type || "post"} | ${snippet}`,
        "info",
      );
    });
  }

  if (message?.type === "monitorError") {
    setOrbState("error");
    appendLog("logPosts", translate("log.monitor_error", { error: message.error }), "err");
  }

  if (message?.type === "take_profiles") {
    if (message.good) {
      const posts = Array.isArray(message.latest_posts)
        ? message.latest_posts
        : [];
      const filteredPosts =
        selectedGroupIds.size > 0
          ? posts.filter((p) => selectedGroupIds.has(String(p.group_id)))
          : posts;

      appendLog(
        "logPosts",
        translate("log.posts_received", {
          total: posts.length,
          selected: filteredPosts.length,
        }),
        "ok",
      );

      if (filteredPosts.length) {
        filteredPosts.slice(0, 8).forEach((p) => {
          const txt = (p.post_text || p.marketplace_text || "").slice(0, 100);
          appendLog(
            "logPosts",
            `🔔 [${p.post_type}] ${p.poster_name} em ${p.group_name}: ${txt}`,
            "info",
          );
        });
      } else {
        appendLog(
          "logPosts",
          translate("log.no_new_posts_selected"),
          "warn",
        );
      }
    } else {
      appendLog("logPosts", `❌ ${message.error_msg}`, "err");
    }
    setButtonLoading("btnGetPosts", false);
  }
});

qsa(".btn").forEach((btn) => {
  btn.dataset.label = btn.textContent;
});

setupTabs();
setupSidebarTooltips();
setupOnboardingWorkspaceActions();
setupProfileActions();
renderProfileWizard();

chrome.runtime.sendMessage({ type: "checkLogin" }, (response) => {
  if (response?.loggedIn) {
    setLoginStatus(true, `${translate("status.logged")}: ${response.userId}`);
    appendLog("logAuth", translate("log.logged_as_user", { userId: response.userId }), "ok");
  } else {
    setLoginStatus(false, translate("status.not_logged"));
    appendLog("logAuth", translate("log.not_logged_facebook"), "err");
  }
  void refreshOnboardingStateFromContext();
});

qs("btnCheckLogin").addEventListener("click", () => {
  setButtonLoading("btnCheckLogin", true);
  chrome.runtime.sendMessage({ type: "checkLogin" }, (response) => {
    setButtonLoading("btnCheckLogin", false);
    if (response?.loggedIn) {
      setLoginStatus(true, `${translate("status.logged")}: ${response.userId}`);
      appendLog("logAuth", translate("log.user_id_short", { userId: response.userId }), "ok");
    } else {
      setLoginStatus(false, translate("status.not_logged"));
      appendLog("logAuth", translate("log.not_logged"), "err");
    }
    void refreshOnboardingStateFromContext();
  });
});

qs("btnGetToken").addEventListener("click", async () => {
  setButtonLoading("btnGetToken", true);
  appendLog("logAuth", translate("log.fetching_token"), "info");
  try {
    const html = await fetchFacebookSettingsHtml();
    const match = html.match(
      /"DTSGInitialData",\s*\[[^\]]*\],\s*\{[^{}]*"token"\s*:\s*"([^"]+)"[^{}]*\}/,
    );
    if (match?.[1])
      appendLog("logAuth", `✅ fb_dtsg: ${match[1].substring(0, 30)}...`, "ok");
    else
      appendLog(
        "logAuth",
        translate("log.token_not_found"),
        "err",
      );
  } catch (e) {
    appendLog(
      "logAuth",
      translate("log.error_generic", { error: e?.message || String(e) }),
      "err",
    );
  }
  setButtonLoading("btnGetToken", false);
});

qs("btnGetAllTokens").addEventListener("click", async () => {
  setButtonLoading("btnGetAllTokens", true);
  appendLog("logAuth", translate("log.fetching_all_tokens"), "info");
  try {
    const html = await fetchFacebookSettingsHtml();
    const tokens = {
      lsd: html.match(/"token":\s*"([^"]+)"/)?.[1],
      userId: html.match(/"actorId":\s*"([^"]+)"/)?.[1],
      dtsg: html.match(
        /"DTSGInitialData",\s*\[[^\]]*\],\s*\{[^{}]*"token"\s*:\s*"([^"]+)"[^{}]*\}/,
      )?.[1],
      rev: html.match(/"consistency":\s*\{"rev":\s*(\d+)\}/)?.[1],
      hsi: html.match(/"hsi":\s*"([^"]+)"/)?.[1],
    };

    Object.entries(tokens).forEach(([k, v]) => {
      if (v)
        appendLog("logAuth", `✅ ${k}: ${String(v).substring(0, 40)}`, "ok");
      else appendLog("logAuth", translate("log.token_missing", { key: k }), "err");
    });
  } catch (e) {
    appendLog(
      "logAuth",
      translate("log.error_generic", { error: e?.message || String(e) }),
      "err",
    );
  }
  setButtonLoading("btnGetAllTokens", false);
});

qs("btnGetDate").addEventListener("click", () => {
  setButtonLoading("btnGetDate", true);
  chrome.runtime.sendMessage({ type: "getCreationDate" }, (response) => {
    setButtonLoading("btnGetDate", false);
    const el = qs("creationDate");
    if (response?.success) {
      el.textContent = response.creationDate;
      el.style.display = "inline-flex";
      appendLog(
        "logGeneral",
        translate("log.creation_date", { date: response.creationDate }),
        "ok",
      );
    } else {
      el.style.display = "none";
      appendLog(
        "logGeneral",
        translate("log.creation_date_failed"),
        "err",
      );
    }
  });
});

qs("btnGetGroups").addEventListener("click", () => {
  setGroupFetchState(true);
  renderGroupsLoadingSkeleton();
  lastLoadedGroups.clear();
  void chrome.storage.local.set({ [STORAGE_LOADED_GROUPS_KEY]: [] });
  qs("groupCount").textContent = translate("groups.fetching");

  chrome.runtime.sendMessage({ type: "startGroupsStream" }, (response) => {
    if (!response?.success) {
      setGroupFetchState(false);
      qs("groupCount").textContent = translate("groups.error_short");
      appendLog(
        "logGeneral",
        translate("log.groups_stream_failed", { error: response?.error }),
        "err",
      );
    }
  });
});

qs("btnStopGroups").addEventListener("click", () => {
  if (!isGroupFetchRunning) return;
  chrome.runtime.sendMessage({ type: "stopGroupsStream" }, () => {
    appendLog("logGeneral", translate("log.stop_groups_requested"), "warn");
  });
});

qs("btnSelectAllGroups").addEventListener("click", async () => {
  if (!lastLoadedGroups.size) {
    appendLog("logGeneral", translate("log.load_groups_first"), "warn");
    return;
  }
  qsa("#groupsList .group-card").forEach((card) => {
    if (card.style.display === "none") return;
    const gid = String(card.dataset.groupId || "");
    if (gid) selectedGroupIds.add(gid);
  });
  await persistSelectedGroupIds();
  qsa(".group-select").forEach((el) => {
    const card = el.closest(".group-card");
    if (!card || card.style.display === "none") return;
    el.checked = true;
    card.classList.add("selected");
  });
  appendLog("logGeneral", translate("log.selection_saved"), "ok");
});

qs("btnClearGroupSelection").addEventListener("click", async () => {
  selectedGroupIds.clear();
  await persistSelectedGroupIds();
  qsa(".group-select").forEach((el) => {
    el.checked = false;
    const card = el.closest(".group-card");
    if (card) card.classList.remove("selected");
  });
  appendLog("logGeneral", translate("log.selection_cleared"), "warn");
});

qs("btnStartMonitor").addEventListener("click", async () => {
  if (!selectedProfileId) {
    appendLog(
      "logPosts",
      translate("log.select_alert_first"),
      "warn",
    );
    return;
  }
  if (!getProfileById(selectedProfileId)) {
    appendLog(
      "logPosts",
      translate("log.alert_not_found"),
      "err",
    );
    return;
  }

  if (selectedGroupIds.size === 0) {
    appendLog(
      "logPosts",
      translate("log.select_one_group_before_monitor"),
      "warn",
    );
    return;
  }

  const payload = resolveMonitorPayload();
  const planCheck = enforcePlanForMonitorStart(payload);
  if (!planCheck.ok) {
    appendLog("logPosts", planCheck.error, "warn");
    return;
  }

  await persistMonitorConfigFromUi();
  setMonitorState(true, translate("status.starting"));

  chrome.runtime.sendMessage(
    { type: "startPostMonitor", payload },
    (response) => {
      if (!response?.success) {
        setMonitorState(false, translate("status.stopped"));
        appendLog(
          "logPosts",
          translate("log.start_monitor_failed", {
            error: response?.error || translate("common.none"),
          }),
          "err",
        );
        return;
      }
      if (response?.sleeping) {
        setMonitorState(false, translate("status.sleep_mode"));
        setOrbState("paused");
        appendLog(
          "logPosts",
          translate("log.sleep_mode_active"),
          "warn",
        );
        return;
      }
      appendLog("logPosts", translate("log.monitor_started"), "ok");
      void setOnboardingState("ready");
    },
  );
});

async function updateAccountUi() {
  const session = await getAuthSession();
  const accountStatus = qs("accountStatus");
  if (!accountStatus) return;
  if (session?.email) {
    accountStatus.textContent = translate("auth.connected", {
      email: session.email,
    });
  } else {
    accountStatus.textContent = translate("account.not_signed_in");
  }
}

async function maybeRefreshPlanFromCloud() {
  const session = await getAuthSession();
  if (!session?.accessToken || !session?.userId) return;
  if (cachedPlanState && isPlanCacheFresh(cachedPlanState)) return;
  const fresh = await fetchPlanFromCloud(session.userId, session.accessToken);
  if (fresh) cachedPlanState = fresh;
  renderPlanBanner();
  renderProfileWizard();
  renderGlobalFrequencyUi();
}

async function handleAuthContinue() {
  const email = String(qs("authEmail")?.value || "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    appendAuthGateLog(translate("auth.invalid_email"), "warn");
    return;
  }
  try {
    // Existing account path: send magic link only for already-registered email.
    await sendMagicLink(email, false);
    await chrome.storage.local.set({ [STORAGE_AUTH_EMAIL_KEY]: email });
    appendAuthGateLog(translate("auth.magic_sent"), "ok");
    qs("authWaitRow").style.display = "flex";
    qs("btnAuthResend").disabled = true;
    setTimeout(() => {
      qs("btnAuthResend").disabled = false;
    }, 60000);
  } catch (err) {
    // New account path: skip magic-link wait and continue to next stage with local trial.
    const raw = String(err?.message || "");
    const isLikelyNewEmail =
      /user|not found|signup|email|otp|invalid/i.test(raw) ||
      raw.includes("400") ||
      raw.includes("422");

    if (!isLikelyNewEmail) {
      appendAuthGateLog(raw || String(err), "err");
      return;
    }

    const trialState = {
      plan: "trial",
      trialEnd: Date.now() + 3 * 24 * 60 * 60 * 1000,
      cachedAt: Date.now(),
      source: "local",
    };
    cachedPlanState = trialState;

    await chrome.storage.local.set({
      [STORAGE_AUTH_EMAIL_KEY]: email,
      [STORAGE_PLAN_STATE_KEY]: trialState,
    });
    await setAuthSession({
      email,
      authMode: "local_trial",
      checkedAt: Date.now(),
    });

    await updateAccountUi();
    renderPlanBanner();
    setAuthGateVisible(false);
    appendLog("logGeneral", translate("auth.new_user_local"), "ok");
  }
}

async function checkAuthSessionFromSupabase() {
  const session = await getAuthSession();
  if (!session?.accessToken) return false;
  appendAuthGateLog(translate("auth.checking"), "info");
  const user = await fetchAuthUser(session.accessToken);
  if (!user?.id) return false;

  const nextSession = {
    ...session,
    userId: user.id,
    email: user.email || session.email || "",
    checkedAt: Date.now(),
  };
  await setAuthSession(nextSession);
  setAuthGateVisible(false);
  await updateAccountUi();
  await maybeRefreshPlanFromCloud();
  await syncAlertsFromCloud();
  appendLog(
    "logGeneral",
    translate("auth.connected", { email: nextSession.email || "user" }),
    "ok",
  );
  return true;
}

async function bootstrapAuthGate() {
  const hash = String(window.location.hash || "");
  if (hash.includes("access_token=")) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const accessToken = params.get("access_token") || "";
    const refreshToken = params.get("refresh_token") || "";
    const expiresIn = Number(params.get("expires_in") || 0);
    if (accessToken) {
      await setAuthSession({
        accessToken,
        refreshToken,
        expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : 0,
      });
      history.replaceState(null, "", window.location.pathname);
    }
  }

  const session = await getAuthSession();
  if (session?.email) {
    qs("authEmail").value = session.email;
  } else {
    const data = await chrome.storage.local.get([STORAGE_AUTH_EMAIL_KEY]);
    qs("authEmail").value = String(data?.[STORAGE_AUTH_EMAIL_KEY] || "");
  }

  if (!session?.accessToken) {
    if (session?.authMode === "local_trial" && session?.email) {
      setAuthGateVisible(false);
      await updateAccountUi();
      return;
    }
    setAuthGateVisible(true);
    return;
  }

  const ok = await checkAuthSessionFromSupabase();
  setAuthGateVisible(!ok);
}

qs("btnStopMonitor").addEventListener("click", () => {
  if (!isMonitorRunning) return;
  chrome.runtime.sendMessage({ type: "stopPostMonitor" }, () => {
    setMonitorState(false, translate("status.stopped"));
  });
});

qs("btnOpenTechLog").addEventListener("click", () => {
  toggleTechnicalLogOverlay(true);
});

qs("btnOpenTechLogSettings").addEventListener("click", () => {
  toggleTechnicalLogOverlay(true);
});

qs("btnCloseTechLog").addEventListener("click", () => {
  toggleTechnicalLogOverlay(false);
});

qs("logOverlay").addEventListener("click", (event) => {
  if (event.target?.id === "logOverlay") toggleTechnicalLogOverlay(false);
});

qs("btnCopyTechLog").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(formatTechnicalLogForClipboard());
    appendLog("logGeneral", translate("msg.log_copied"), "ok");
  } catch (err) {
    appendLog(
      "logGeneral",
      translate("msg.log_copy_failed", { error: err?.message || String(err) }),
      "err",
    );
  }
});

qs("btnClearTechLog").addEventListener("click", () => {
  technicalLogEntries = [];
  renderTechnicalLogOverlay();
});

qs("btnClearHistory").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "clearLeadHistory" }, (response) => {
    if (response?.success) {
      leadsHistory = [];
      renderLeads();
      renderHomeInsights();
      appendLog("logGeneral", translate("msg.history_cleared"), "ok");
    } else {
      appendLog(
        "logGeneral",
        translate("msg.history_clear_failed", {
          error: response?.error || translate("common.none"),
        }),
        "err",
      );
    }
  });
});

qs("btnExportCsv").addEventListener("click", () => {
  const leads = getFilteredLeads();
  if (!leads.length) {
    appendLog("logGeneral", translate("msg.csv_empty"), "warn");
    return;
  }

  const headers = [
    "detected_at",
    "profile_name",
    "group_id",
    "group_name",
    "poster_name",
    "post_type",
    "post_text",
    "marketplace_text",
    "post_url",
    "group_url",
    "user_profile_url",
    "post_id",
  ];

  const escapeCsv = (value) => {
    const raw = String(value ?? "");
    if (raw.includes('"') || raw.includes(",") || raw.includes("\n")) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };

  const lines = [headers.join(",")];
  for (const lead of leads) {
    const row = [
      new Date(Number(lead.detectedAt) || Date.now()).toISOString(),
      lead.profileName,
      lead.group_id,
      lead.group_name,
      lead.poster_name,
      lead.post_type,
      lead.post_text,
      lead.marketplace_text,
      lead.post_url,
      lead.group_url,
      lead.user_profile_url,
      lead.post_id,
    ].map(escapeCsv);
    lines.push(row.join(","));
  }

  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  anchor.href = url;
  anchor.download = `grabclientsnow-leads-${stamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  appendLog(
    "logGeneral",
    translate("msg.csv_ok", { count: leads.length }),
    "ok",
  );
});

qs("btnPlanUpgrade").addEventListener("click", () => {
  appendLog("logGeneral", translate("msg.upgrade_soon"), "info");
});

qs("btnPlanMaybeLater").addEventListener("click", () => {
  const banner = qs("planBanner");
  if (banner) banner.classList.remove("show");
});

qs("btnSignOut").addEventListener("click", async () => {
  await clearAuthSession();
  await updateAccountUi();
  setAuthGateVisible(true);
  appendLog("logGeneral", translate("msg.signed_out"), "warn");
});

qs("btnSaveSleepSchedule").addEventListener("click", () => {
  const start = parseTimeString(qs("sleepStartTime").value, 22, 0);
  const end = parseTimeString(qs("sleepEndTime").value, 7, 0);
  const days = qsa(".sleep-day")
    .filter((el) => el.checked)
    .map((el) => Number(el.value));
  const schedule = {
    enabled: !!qs("sleepEnabled").checked,
    startHour: start.hour,
    startMinute: start.minute,
    endHour: end.hour,
    endMinute: end.minute,
    days: days.length ? days : [1, 2, 3, 4, 5, 6, 0],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };

  chrome.runtime.sendMessage(
    { type: "setSleepSchedule", schedule },
    (response) => {
      if (response?.success) {
        sleepScheduleState = response.schedule;
        appendLog("logGeneral", translate("msg.sleep_saved"), "ok");
        loadSleepScheduleUi();
        return;
      }
      appendLog(
        "logGeneral",
        translate("msg.sleep_save_failed", {
          error: response?.error || translate("common.none"),
        }),
        "err",
      );
    },
  );
});

qs("btnAuthContinue").addEventListener("click", async () => {
  await handleAuthContinue();
});

qs("btnAuthResend").addEventListener("click", async () => {
  const email = String(qs("authEmail").value || "")
    .trim()
    .toLowerCase();
  if (!email) return;
  try {
    await sendMagicLink(email, false);
    appendAuthGateLog(translate("auth.magic_sent"), "ok");
    qs("btnAuthResend").disabled = true;
    setTimeout(() => {
      qs("btnAuthResend").disabled = false;
    }, 60000);
  } catch (err) {
    appendAuthGateLog(err?.message || String(err), "err");
  }
});

qs("btnAuthCheckSession").addEventListener("click", async () => {
  const ok = await checkAuthSessionFromSupabase();
  if (!ok)
    appendAuthGateLog(
      translate("msg.session_not_active"),
      "warn",
    );
});

qs("btnAuthChangeEmail").addEventListener("click", () => {
  qs("authWaitRow").style.display = "none";
});

qs("languageSelect").addEventListener("change", async (event) => {
  await setLanguage(String(event.target.value || "en").toLowerCase());
});

qs("authLanguageSelect").addEventListener("change", async (event) => {
  await setLanguage(String(event.target.value || "en").toLowerCase());
});

qs("groupsOnlySelected").addEventListener("change", () => {
  applyGroupsVisibilityFilter();
});

qs("groupsSearch").addEventListener("input", () => {
  applyGroupsVisibilityFilter();
});

qsa(".settings-freq-card").forEach((card) => {
  card.addEventListener("click", async () => {
    const pair = {
      min: Number(card.dataset.min) || 5,
      max: Number(card.dataset.max) || 10,
    };
    const level = resolvePlanLevel();
    const proOnly = card.dataset.proOnly === "1";
    if (level === "free" && proOnly) {
      appendLog("logGeneral", translate("plan.block_frequency"), "warn");
      await persistGlobalMonitorFrequency({ min: 15, max: 20 });
      return;
    }
    await persistGlobalMonitorFrequency(pair);
  });
});

["leadsProfileFilter", "leadsTextFilter", "leadsOnlySelectedGroups"].forEach(
  (id) => {
    qs(id).addEventListener("input", () => {
      renderLeads();
    });
    qs(id).addEventListener("change", () => {
      renderLeads();
    });
  },
);

["profileEditorPositive", "profileEditorNegative"].forEach((id) => {
  qs(id).addEventListener("input", () => {
    updateProfileKeywordPreview();
  });
});

["profileEditorMin", "profileEditorMax"].forEach((id) => {
  qs(id).addEventListener("change", () => {
    updateProfileKeywordPreview();
  });
});

(async () => {
  await loadLanguage();
  await loadOnboardingState();
  cachedPlanState = await loadPlanState();
  renderPlanBanner();
  await updateAccountUi();
  await bootstrapAuthGate();
  await maybeRefreshPlanFromCloud();
  await loadGlobalMonitorFrequency();
  await loadSleepScheduleUi();
  await loadSelectedGroupIds();
  await loadMonitorConfigToUi();
  await loadProfiles();
  await loadPersistedGroups();
  await refreshLeadsHistory();
  updateMonitorProfilePreview();
  updateProfileKeywordPreview();
  renderProfileWizard();

  if (selectedProfileId && getProfileById(selectedProfileId)) {
    selectProfile(selectedProfileId, true);
  }

  chrome.runtime.sendMessage({ type: "getPostMonitorState" }, (response) => {
    if (response?.success) {
      if (response.sleepModeActive) {
        setMonitorState(false, "sleep mode");
        setOrbState("paused");
      } else {
        setMonitorState(
          !!response.running,
          response.running ? translate("status.monitoring") : translate("status.stopped"),
        );
      }
    } else {
      setMonitorState(false, translate("status.stopped"));
    }
    void refreshOnboardingStateFromContext();
  });

  await refreshOnboardingStateFromContext();
  renderGuidedHistory();

  if (authPollingTimer) clearInterval(authPollingTimer);
  authPollingTimer = setInterval(async () => {
    if (qs("authGate")?.classList.contains("show")) {
      await checkAuthSessionFromSupabase();
    }
    await maybeRefreshPlanFromCloud();
  }, 3000);
})();

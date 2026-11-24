import { attribution, landing, landingCampaign } from "./campaign.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5d66nZO2_n4PuqrLA5Gt2Nl1xxyqBxvo",
  projectId: "focusflight-official-website",
  appId: "1:957634322245:web:6853d6fd4d9229ac14a82c",
  measurementId: "G-4LRMF0HD72",
};

const isLive = landing.hostname === "focus.flights" || landing.hostname === "www.focus.flights";
const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(landing.hostname);
const debug = isLocal && landing.searchParams.get("analytics_debug") === "1";

function track() {
  // Keep campaign tags for GA4 acquisition reports and omit other URL parameters.
  // Restored attribution belongs on events, not in a synthetic tagged page URL.
  const pageLocation = new URL(landing.origin);
  pageLocation.pathname = landing.pathname;
  for (const [key, value] of Object.entries(landingCampaign ?? {})) {
    pageLocation.searchParams.set(`utm_${key}`, value);
  }

  const analyticsReady = Promise.all([
    import("https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/13.4.0/firebase-analytics.js"),
  ]).then(async ([{ initializeApp }, { initializeAnalytics, isSupported, logEvent }]) => {
    if (!await isSupported()) return;
    const analytics = initializeAnalytics(initializeApp(firebaseConfig), {
      config: {
        page_location: pageLocation.href,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        ...(debug && { debug_mode: true }),
      },
    });
    const log = (name, params) => logEvent(analytics, name, {
      ...params,
      ...(debug && { debug_mode: true }),
    });
    if (landingCampaign?.medium === "kol" && landingCampaign.source) log("kol_landing", attribution);
    return log;
  }).catch(error => {
    if (debug) console.warn("FocusFlight Analytics failed to initialize", error);
  });

  function trackStoreClick(event) {
    const link = event.target.closest?.("a[data-app-store]");
    if (!link) return;
    const url = new URL(link.href);
    const params = {
      ...attribution,
      campaign_token: url.searchParams.get("ct") ?? attribution.campaign_token,
      cta_placement: link.dataset.appStore,
      target_platform: url.searchParams.get("platform") ?? "auto",
    };
    void analyticsReady.then(log => log?.("app_store_click", params));
  }

  document.addEventListener("click", trackStoreClick, { capture: true });
  document.addEventListener("auxclick", event => {
    if (event.button === 1) trackStoreClick(event);
  }, { capture: true });
}

if (isLive || debug) track();

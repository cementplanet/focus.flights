const firebaseConfig = {
  apiKey: "AIzaSyD5d66nZO2_n4PuqrLA5Gt2Nl1xxyqBxvo",
  projectId: "focusflight-official-website",
  appId: "1:957634322245:web:6853d6fd4d9229ac14a82c",
  measurementId: "G-4LRMF0HD72",
};

const landing = new URL(location.href);
const isLive = landing.hostname === "focus.flights" || landing.hostname === "www.focus.flights";
const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(landing.hostname);
const debug = isLocal && landing.searchParams.get("analytics_debug") === "1";

function campaignValue(name) {
  const value = landing.searchParams.get(name)?.toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,59}$/.test(value ?? "") ? value : undefined;
}

function track() {
  const shortLinkKol = landing.pathname.match(/^\/c\/([a-z0-9][a-z0-9_-]{0,59})\/?$/i)?.[1].toLowerCase();
  const source = shortLinkKol ?? campaignValue("utm_source");
  const medium = shortLinkKol ? "kol" : campaignValue("utm_medium");
  const campaign = campaignValue("utm_campaign");
  const kol = medium === "kol" && source;
  const attribution = kol ? { kol_id: kol } : {};
  if (kol && campaign) attribution.kol_campaign = campaign;

  // Keep campaign tags for GA4 acquisition reports and omit other URL parameters.
  const pageLocation = new URL(landing.origin);
  pageLocation.pathname = landing.pathname;
  const campaignTags = { utm_source: source, utm_medium: medium, utm_campaign: campaign };
  for (const [name, value] of Object.entries(campaignTags)) {
    if (value) pageLocation.searchParams.set(name, value);
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
    if (kol) log("kol_landing", attribution);
    return log;
  }).catch(error => {
    if (debug) console.warn("FocusFlight Analytics failed to initialize", error);
  });

  function trackStoreClick(event) {
    const link = event.target.closest?.("a[data-app-store]");
    if (!link) return;
    const params = { ...attribution, cta_placement: link.dataset.appStore };
    void analyticsReady.then(log => log?.("app_store_click", params));
  }

  document.addEventListener("click", trackStoreClick, { capture: true });
  document.addEventListener("auxclick", event => {
    if (event.button === 1) trackStoreClick(event);
  }, { capture: true });
}

if (isLive || debug) track();

// Storefront codes from the country and region picker on apps.apple.com.
const storefronts = new Set(`
  ae af ag ai al am ao ar at au az ba bb be bf bg bh bj bm bn bo br bs bt bw by bz
  ca cd cg ch ci cl cm cn co cr cv cy cz de dk dm do dz ec ee eg es fi fj fm fr
  ga gb gd ge gh gm gr gt gw gy hk hn hr hu id ie il in iq is it jm jo jp ke kg
  kh kn kr kw ky kz la lb lc lk lr lt lu lv ly ma md me mg mk ml mm mn mo mr ms
  mt mu mv mw mx my mz na ne ng ni nl no np nr nz om pa pe pg ph pk pl pt pw py
  qa ro rs ru rw sa sb sc se sg si sk sl sn sr st sv sz tc td th tj tm tn to tr
  tt tw tz ua ug us uy uz vc ve vg vn vu xk ye za zm zw
`.trim().split(/\s+/));

function preferredStorefront(languages, timeZone) {
  // Apple's mainland web store can send links for other storefronts to its homepage.
  const mainlandTimeZones = ["Asia/Shanghai", "Asia/Chongqing", "Asia/Chungking",
    "Asia/Harbin", "Asia/Urumqi", "Asia/Kashgar", "PRC"];
  if (mainlandTimeZones.includes(timeZone)) return "cn";

  const locales = [];
  for (const language of languages) {
    try { locales.push(new Intl.Locale(language)); }
    catch { continue; }
  }

  const regions = [...locales.map(locale => locale.region),
    ...locales.map(locale => locale.maximize().region)];
  return regions.map(region => region?.toLowerCase()).find(region => storefronts.has(region)) ?? "us";
}

const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
const storefront = preferredStorefront(languages, Intl.DateTimeFormat().resolvedOptions().timeZone);
for (const link of document.querySelectorAll("a[data-app-store]")) {
  const url = new URL(link.href);
  url.pathname = url.pathname.replace(/^\/us\//, `/${storefront}/`);
  link.href = url.href;
}

(() => {
  if (location.pathname !== "/" && location.pathname !== "/index.html") return;

  function supportedLanguage(language) {
    const [base, ...subtags] = language.toLowerCase().split("-");
    if (["en", "ja", "ko"].includes(base)) return base;
    if (base !== "zh") return undefined;
    if (subtags.includes("hans")) return "zh-CN";
    if (subtags.some(tag => tag === "hk" || tag === "mo")) return "zh-HK";
    if (subtags.includes("hant") || subtags.includes("tw")) return "zh-TW";
    return "zh-CN";
  }

  const preferences = navigator.languages?.length ? navigator.languages : [navigator.language];
  const language = preferences.map(supportedLanguage).find(Boolean);
  if (language && language !== "en") {
    location.replace("/" + language + "/" + location.search + location.hash);
  }
})();

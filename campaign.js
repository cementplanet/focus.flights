// Public App Store Connect provider token for Cement Planet LTD.
export const providerToken = "127167114";
export const landing = new URL(location.href);
const storageKey = "focusflight.campaign.v1";

function campaignValue(value) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  return /^[a-z0-9][a-z0-9_-]{0,59}$/.test(normalized) ? normalized : undefined;
}

function normalizeCampaign(values) {
  const campaign = {};
  for (const key of ["source", "medium", "campaign", "content"]) {
    const value = campaignValue(values?.[key]);
    if (value) campaign[key] = value;
  }
  return Object.keys(campaign).length ? campaign : undefined;
}

export function parseCampaign(url) {
  const kol = url.pathname.match(/^\/c\/([a-z0-9][a-z0-9_-]{0,59})\/?$/i)?.[1];
  return normalizeCampaign({
    source: kol ?? url.searchParams.get("utm_source"),
    medium: kol ? "kol" : url.searchParams.get("utm_medium"),
    campaign: url.searchParams.get("utm_campaign"),
    content: url.searchParams.get("utm_content"),
  });
}

export function campaignTokenFor(campaign) {
  if (!campaign) return "website";
  const { source, medium, campaign: name, content } = campaign;
  const kol = medium === "kol" && source;
  // Dots separate fields because campaign values themselves cannot contain dots.
  let token = kol ? `kol_${source}` : `web_${source ?? "unknown"}.${medium ?? "unknown"}`;
  if (name || content) token += `.${name ?? ""}`;
  if (content) token += `.${content}`;
  if (token.length <= 30) return token;

  // Keep long names distinct within Apple's 30-character limit (FNV-1a 64-bit).
  let hash = 14695981039346656037n;
  for (const character of token) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(character.charCodeAt(0))) * 1099511628211n);
  }
  return `${token.slice(0, 16)}_${hash.toString(36).padStart(13, "0")}`;
}

export const landingCampaign = parseCampaign(landing);
let campaign = landingCampaign;
try {
  if (campaign) sessionStorage.setItem(storageKey, JSON.stringify(campaign));
  else campaign = normalizeCampaign(JSON.parse(sessionStorage.getItem(storageKey)));
} catch {
  // Links still work when storage is blocked or a saved value is invalid.
}

export const campaignToken = campaignTokenFor(campaign);
export const attribution = { campaign_token: campaignToken };
for (const [key, value] of Object.entries(campaign ?? {})) {
  attribution[`campaign_${key === "campaign" ? "name" : key}`] = value;
}
if (campaign?.medium === "kol" && campaign.source) {
  attribution.kol_id = campaign.source;
  if (campaign.campaign) attribution.kol_campaign = campaign.campaign;
}

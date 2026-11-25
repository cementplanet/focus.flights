const destination = new URL(document.getElementById("continue").href);
const landing = new URL(window.location.href);

landing.pathname = destination.pathname;
for (const [key, value] of destination.searchParams) {
  landing.searchParams.set(key, value);
}

window.location.replace(landing.href);

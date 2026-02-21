export function qs(id) {
  return document.getElementById(id);
}

export function qsa(selector) {
  return Array.from(document.querySelectorAll(selector));
}

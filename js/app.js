import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const STATUS_FLOW = ["ORDER_PLACED", "CONFIRMED", "PREPARING", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED"];
export const DELIVERY_FLOW = ["ACCEPTED", "PICKED_UP", "ON_THE_WAY", "ARRIVED", "DELIVERED"];

export function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

export function label(value) {
  return String(value || "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function toast(message, type = "success") {
  let wrap = qs(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.textContent = message;
  wrap.appendChild(item);
  setTimeout(() => item.remove(), 4200);
}

export function setLoading(node, isLoading, text = "Loading...") {
  if (!node) return;
  node.innerHTML = isLoading ? `<div class="loader">${text}</div>` : "";
}

export function emptyState(title, text) {
  return `<div class="empty"><strong>${title}</strong><span>${text}</span></div>`;
}

export function requireConfig() {
  const ok = !SUPABASE_URL.includes("YOUR_PROJECT") && !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
  if (!ok) {
    toast("Add your Supabase URL and anon key in js/config.js", "error");
  }
  return ok;
}

window.addEventListener("offline", () => toast("You are offline. Changes will not sync until the connection returns.", "error"));
window.addEventListener("online", () => toast("Connection restored."));

export function routeForRole(role) {
  if (role === "ADMIN") return "/admin/dashboard.html";
  if (role === "DELIVERY_GUY") return "/delivery/dashboard.html";
  return "/customer/dashboard.html";
}

export function statusTimeline(status) {
  const active = STATUS_FLOW.indexOf(status);
  return `<div class="timeline">${STATUS_FLOW.map((step, index) => `
    <div class="timeline-step ${index <= active ? "done" : ""}">
      <span></span><p>${label(step)}</p>
    </div>`).join("")}</div>`;
}

export function distanceKm(a, b) {
  if (!a || !b) return null;
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}

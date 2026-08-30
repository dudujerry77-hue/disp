import { distanceKm, qs, supabase, toast } from "./app.js";

let watchId = null;

export function stopWatching() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

export function startCustomerSharing(orderId, onPoint) {
  return startWatch(async ({ lat, lng }) => {
    onPoint?.({ lat, lng });
    const { error } = await supabase.from("deliveries").update({ customer_lat: lat, customer_lng: lng, sharing_active: true }).eq("order_id", orderId);
    if (error) toast(error.message, "error");
  });
}

export function startDriverSharing(orderId, onPoint) {
  return startWatch(async ({ lat, lng }) => {
    onPoint?.({ lat, lng });
    const { error } = await supabase.from("deliveries").update({ driver_lat: lat, driver_lng: lng }).eq("order_id", orderId);
    if (error) toast(error.message, "error");
  });
}

function startWatch(onLocation) {
  if (!("geolocation" in navigator)) {
    toast("GPS is not available on this device.", "error");
    return false;
  }
  stopWatching();
  watchId = navigator.geolocation.watchPosition(
    (position) => onLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
    (error) => toast(`Location permission/update failed: ${error.message}`, "error"),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }
  );
  return true;
}

export async function clearTracking(orderId) {
  stopWatching();
  await supabase.from("deliveries").update({
    sharing_active: false,
    customer_lat: null,
    customer_lng: null,
    driver_lat: null,
    driver_lng: null
  }).eq("order_id", orderId);
}

export class MiniMap {
  constructor(selector) {
    this.root = qs(selector);
    this.points = {};
    this.zoom = 1;
    this.root.innerHTML = `<div class="map-toolbar"><button data-zoom-in>+</button><button data-zoom-out>-</button></div><svg class="route"></svg><div class="marker customer">Customer</div><div class="marker driver">Driver</div>`;
    this.root.querySelector("[data-zoom-in]").onclick = () => this.setZoom(this.zoom + 0.15);
    this.root.querySelector("[data-zoom-out]").onclick = () => this.setZoom(this.zoom - 0.15);
  }

  setZoom(value) {
    this.zoom = Math.max(0.7, Math.min(1.8, value));
    this.root.style.setProperty("--zoom", this.zoom);
  }

  setPoint(type, point) {
    if (!point?.lat || !point?.lng) return;
    this.points[type] = point;
    this.render();
  }

  render() {
    const customer = this.points.customer;
    const driver = this.points.driver;
    const all = [customer, driver].filter(Boolean);
    if (!all.length) return;
    const minLat = Math.min(...all.map((p) => p.lat)) - 0.01;
    const maxLat = Math.max(...all.map((p) => p.lat)) + 0.01;
    const minLng = Math.min(...all.map((p) => p.lng)) - 0.01;
    const maxLng = Math.max(...all.map((p) => p.lng)) + 0.01;
    const toXY = (p) => ({
      x: ((p.lng - minLng) / Math.max(maxLng - minLng, 0.001)) * 76 + 12,
      y: (1 - (p.lat - minLat) / Math.max(maxLat - minLat, 0.001)) * 68 + 16
    });
    for (const type of ["customer", "driver"]) {
      const marker = this.root.querySelector(`.${type}`);
      if (!this.points[type]) continue;
      const { x, y } = toXY(this.points[type]);
      marker.style.left = `${x}%`;
      marker.style.top = `${y}%`;
      marker.classList.add("visible");
    }
    const svg = this.root.querySelector("svg");
    if (customer && driver) {
      const a = toXY(customer);
      const b = toXY(driver);
      svg.innerHTML = `<line x1="${a.x}%" y1="${a.y}%" x2="${b.x}%" y2="${b.y}%" />`;
      const km = distanceKm(customer, driver);
      const dist = qs("#distance");
      if (dist && km) dist.textContent = `${km.toFixed(2)} km away`;
    }
  }
}

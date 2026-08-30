import { label, qs, statusTimeline, supabase, toast } from "./app.js";
import { clearTracking, MiniMap, startCustomerSharing, startDriverSharing, stopWatching } from "./location.js";

export async function initTracking(role) {
  const orderId = new URLSearchParams(location.search).get("id");
  const panel = qs("#trackingPanel");
  if (!orderId) {
    panel.innerHTML = `<div class="empty">Missing order id.</div>`;
    return;
  }
  const map = new MiniMap("#map");
  let order = await loadOrder(orderId);
  renderTracking(panel, order, role);
  updateMap(map, order?.deliveries);

  panel.addEventListener("click", (event) => {
    if (!event.target.closest("#shareLocation")) return;
    if (role === "customer") startCustomerSharing(orderId, (point) => map.setPoint("customer", point));
    if (role === "delivery") startDriverSharing(orderId, (point) => map.setPoint("driver", point));
    toast("Location sharing started");
  });

  supabase.channel(`tracking-${orderId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `order_id=eq.${orderId}` }, (payload) => {
      updateMap(map, payload.new);
      renderDeliveryState(payload.new);
      if (payload.new?.status === "DELIVERED" || payload.new?.sharing_active === false) stopWatching();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, async (payload) => {
      if (payload.new.status === "DELIVERED" || payload.new.status === "CANCELLED") {
        await clearTracking(orderId);
        toast("Tracking stopped for this order.");
      }
      order = await loadOrder(orderId);
      renderTracking(panel, order, role);
    })
    .subscribe();
}

async function loadOrder(orderId) {
  const { data, error } = await supabase.from("orders").select("*, order_items(*), deliveries(*)").eq("id", orderId).single();
  if (error) throw error;
  return data;
}

function renderTracking(panel, order, role) {
  const isActive = ["PICKED_UP", "OUT_FOR_DELIVERY"].includes(order.status);
  panel.innerHTML = `<div class="row between"><div><span class="muted">Order #${order.id.slice(0, 8)}</span><h2>${label(order.status)}</h2></div><span id="distance" class="pill">Waiting for GPS</span></div>
    ${statusTimeline(order.status)}
    <p><strong>Address:</strong> ${order.delivery_address}</p>
    <p><strong>Items:</strong> ${order.order_items.map((i) => `${i.quantity}x ${i.product_name}`).join(", ")}</p>
    <p id="deliveryState">Delivery status: ${label(order.deliveries?.status || "ASSIGNED")}</p>
    ${isActive ? `<button class="btn" id="shareLocation">${role === "customer" ? "Share My Location" : "Start Delivery Tracking"}</button>` : `<div class="empty compact">Tracking starts when this order is out for delivery.</div>`}`;
}

function renderDeliveryState(delivery) {
  const node = qs("#deliveryState");
  if (node) node.textContent = `Delivery status: ${label(delivery?.status || "ASSIGNED")}`;
}

function updateMap(map, delivery) {
  if (!delivery) return;
  map.setPoint("customer", { lat: delivery.customer_lat, lng: delivery.customer_lng });
  map.setPoint("driver", { lat: delivery.driver_lat, lng: delivery.driver_lng });
}

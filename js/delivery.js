import { bindLogout, requireRole } from "./auth.js";
import { DELIVERY_FLOW, emptyState, label, qs, setLoading, supabase, toast } from "./app.js";
import { clearTracking, startDriverSharing } from "./location.js";

async function boot() {
  const profile = await requireRole(["DELIVERY_GUY"]);
  if (!profile) return;
  bindLogout();
  if (qs("#deliveries")) loadDeliveries();
  if (qs("#markDelivered") || qs("#startDriverGps")) initDeliveryTracking();
  supabase.channel("delivery-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => { if (qs("#deliveries")) loadDeliveries(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => { if (qs("#deliveries")) loadDeliveries(); })
    .subscribe();
}

async function loadDeliveries() {
  const node = qs("#deliveries");
  setLoading(node, true, "Loading assigned deliveries...");
  const { data, error } = await supabase.from("deliveries").select("*, orders(*, order_items(*), profiles(full_name, phone))").order("updated_at", { ascending: false });
  if (error) return node.innerHTML = emptyState("Could not load deliveries", error.message);
  if (!data.length) return node.innerHTML = emptyState("No assigned deliveries", "New assignments from admins will appear here in real time.");
  node.innerHTML = data.map((d) => `<article class="order-card delivery-card">
    <div class="row between"><div><h3>#${d.order_id.slice(0, 8)} · ${d.orders.profiles?.full_name || "Customer"}</h3><p>${d.orders.delivery_address}</p></div><span class="status">${label(d.status)}</span></div>
    <div class="order-items">${d.orders.order_items.map((i) => `<span>${i.quantity}x ${i.product_name}</span>`).join("")}</div>
    <p>${d.orders.delivery_instructions || "No delivery instructions."}</p>
    <div class="row wrap">
      <a class="btn small" href="/delivery/tracking.html?id=${d.order_id}">Start Delivery</a>
      ${DELIVERY_FLOW.map((s) => `<button class="btn ghost small" data-order="${d.order_id}" data-status="${s}">${label(s)}</button>`).join("")}
    </div>
  </article>`).join("");
  node.querySelectorAll("[data-status]").forEach((b) => b.onclick = () => updateDeliveryStatus(b.dataset.order, b.dataset.status));
}

async function updateDeliveryStatus(orderId, status) {
  const deliveryStatus = await supabase.from("deliveries").update({ status }).eq("order_id", orderId);
  if (deliveryStatus.error) return toast(deliveryStatus.error.message, "error");
  const orderStatusMap = { ACCEPTED: "OUT_FOR_DELIVERY", PICKED_UP: "PICKED_UP", ON_THE_WAY: "OUT_FOR_DELIVERY", ARRIVED: "OUT_FOR_DELIVERY", DELIVERED: "DELIVERED" };
  const orderStatus = orderStatusMap[status];
  await supabase.from("orders").update({ status: orderStatus }).eq("id", orderId);
  await supabase.from("order_events").insert({ order_id: orderId, status: orderStatus, note: `Delivery guy marked ${label(status)}` });
  if (status === "DELIVERED") await clearTracking(orderId);
  toast("Delivery updated");
  loadDeliveries();
}

async function initDeliveryTracking() {
  const orderId = new URLSearchParams(location.search).get("id");
  qs("#startDriverGps")?.addEventListener("click", () => startDriverSharing(orderId, null));
  qs("#markDelivered")?.addEventListener("click", () => updateDeliveryStatus(orderId, "DELIVERED"));
}

boot();

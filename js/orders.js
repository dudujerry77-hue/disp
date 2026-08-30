import { clearCart, getCart, renderCart } from "./cart.js";
import { emptyState, label, money, qs, setLoading, statusTimeline, supabase, toast } from "./app.js";

export async function placeOrder(profile) {
  const form = qs("#checkoutForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cart = getCart();
    if (!cart.length) return toast("Add at least one item first.", "error");
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const { data: order, error } = await supabase.from("orders").insert({
      customer_id: profile.id,
      delivery_address: form.address.value.trim(),
      delivery_instructions: form.instructions.value.trim(),
      total
    }).select().single();
    if (error) return toast(error.message, "error");
    const items = cart.map((item) => ({ order_id: order.id, product_id: item.id, product_name: item.name, quantity: item.quantity, unit_price: item.price }));
    const { error: itemError } = await supabase.from("order_items").insert(items);
    if (itemError) return toast(itemError.message, "error");
    await supabase.from("order_events").insert({ order_id: order.id, status: "ORDER_PLACED", note: "Order placed by customer" });
    clearCart();
    toast("Order placed successfully");
    location.href = "/customer/orders.html";
  });
  if (form && profile?.address) form.address.value = profile.address;
  renderCart();
}

export async function loadCustomerOrders() {
  const node = qs("#ordersList");
  setLoading(node, true, "Loading orders...");
  const { data, error } = await supabase.from("orders").select("*, deliveries(*), order_items(*)").order("created_at", { ascending: false });
  if (error) return node.innerHTML = emptyState("Could not load orders", error.message);
  renderOrders(node, data, true);
  subscribeOrders(() => loadCustomerOrders());
}

export function renderOrders(node, orders, customer = false) {
  if (!orders?.length) return node.innerHTML = emptyState("No orders yet", "Orders will appear here as soon as they are placed.");
  node.innerHTML = orders.map((order) => `<article class="order-card">
    <div class="row between"><div><span class="muted">Order</span><h3>#${order.id.slice(0, 8)}</h3></div><span class="status">${label(order.status)}</span></div>
    ${statusTimeline(order.status)}
    <div class="order-items">${(order.order_items || []).map((i) => `<span>${i.quantity}x ${i.product_name}</span>`).join("")}</div>
    <div class="row between"><strong>${money(order.total)}</strong><div class="row">
      ${customer && ["ORDER_PLACED", "CONFIRMED"].includes(order.status) ? `<button class="btn ghost small" data-cancel="${order.id}">Cancel</button>` : ""}
      ${customer && order.status === "OUT_FOR_DELIVERY" ? `<a class="btn small" href="/customer/tracking.html?id=${order.id}">Track Delivery</a>` : ""}
      <a class="btn ghost small" href="/customer/order-details.html?id=${order.id}">Details</a>
    </div></div>
  </article>`).join("");
  node.querySelectorAll("[data-cancel]").forEach((button) => button.onclick = () => cancelOrder(button.dataset.cancel));
}

export async function loadOrderDetails(role = "customer") {
  const id = new URLSearchParams(location.search).get("id");
  const node = qs("#orderDetails");
  if (!id) return node.innerHTML = emptyState("Missing order", "No order id was provided.");
  const { data: order, error } = await supabase.from("orders").select("*, order_items(*), deliveries(*, profiles(full_name, phone))").eq("id", id).single();
  if (error) return node.innerHTML = emptyState("Order unavailable", error.message);
  node.innerHTML = `<section class="panel"><div class="row between"><h2>Order #${order.id.slice(0, 8)}</h2><span class="status">${label(order.status)}</span></div>
    ${statusTimeline(order.status)}
    <p><strong>Address:</strong> ${order.delivery_address}</p>
    <p><strong>Instructions:</strong> ${order.delivery_instructions || "None"}</p>
    <div class="table">${order.order_items.map((i) => `<div><span>${i.product_name}</span><span>${i.quantity} x ${money(i.unit_price)}</span></div>`).join("")}</div>
    <h3>Total ${money(order.total)}</h3>
    ${order.status === "OUT_FOR_DELIVERY" && role === "customer" ? `<a class="btn" href="/customer/tracking.html?id=${order.id}">Track Delivery</a>` : ""}
  </section>`;
}

async function cancelOrder(id) {
  if (!confirm("Cancel this order?")) return;
  const { error } = await supabase.from("orders").update({ status: "CANCELLED" }).eq("id", id);
  if (error) return toast(error.message, "error");
  await supabase.from("order_events").insert({ order_id: id, status: "CANCELLED", note: "Cancelled by customer" });
  toast("Order cancelled");
  loadCustomerOrders();
}

export function subscribeOrders(callback) {
  return supabase.channel(`orders-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, callback)
    .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, callback)
    .subscribe();
}

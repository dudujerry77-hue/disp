import { bindLogout, requireRole } from "./auth.js";
import { emptyState, label, money, qs, setLoading, supabase, toast } from "./app.js";
import { bindProductForm, loadProducts } from "./products.js";

let drivers = [];

async function boot() {
  const profile = await requireRole(["ADMIN"]);
  if (!profile) return;
  bindLogout();
  if (qs("#stats")) loadStats();
  if (qs("#adminProducts")) loadAdminProducts();
  if (qs("#adminOrders")) loadAdminOrders();
  supabase.channel("admin-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => { if (qs("#stats")) loadStats(); if (qs("#adminOrders")) loadAdminOrders(); })
    .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => { if (qs("#stats")) loadStats(); if (qs("#adminOrders")) loadAdminOrders(); })
    .subscribe();
}

async function loadStats() {
  const [orders, products] = await Promise.all([
    supabase.from("orders").select("status"),
    supabase.from("products").select("id")
  ]);
  const rows = orders.data || [];
  qs("#stats").innerHTML = [
    ["Total orders", rows.length],
    ["Pending", rows.filter((o) => ["ORDER_PLACED", "CONFIRMED"].includes(o.status)).length],
    ["Preparing", rows.filter((o) => o.status === "PREPARING").length],
    ["Active deliveries", rows.filter((o) => ["PICKED_UP", "OUT_FOR_DELIVERY"].includes(o.status)).length],
    ["Completed", rows.filter((o) => o.status === "DELIVERED").length],
    ["Products", (products.data || []).length]
  ].map(([k, v]) => `<div class="stat"><span>${k}</span><strong>${v}</strong></div>`).join("");
}

async function loadAdminProducts() {
  await loadProducts("#adminProducts", true);
  bindProductForm(loadAdminProducts);
  const { data } = await supabase.from("products").select("*").order("created_at", { ascending: false });
  qs("#adminProducts").innerHTML = (data || []).map((p) => `<article class="product-card admin-line">
    <img src="${p.image_url}" alt="${p.name}"><div><h3>${p.name}</h3><p>${p.description}</p><div class="row between"><strong>${money(p.price)}</strong><span>${p.available ? "Available" : "Disabled"}</span></div></div>
    <div class="stack"><button class="btn small" data-edit="${p.id}">Edit</button><button class="btn ghost danger small" data-delete="${p.id}">Delete</button></div>
  </article>`).join("");
  qs("#adminProducts").querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => fillProduct(data.find((p) => p.id === b.dataset.edit)));
  qs("#adminProducts").querySelectorAll("[data-delete]").forEach((b) => b.onclick = () => deleteProduct(b.dataset.delete));
}

function fillProduct(p) {
  const form = qs("#productForm");
  form.product_id.value = p.id;
  form.name.value = p.name;
  form.description.value = p.description;
  form.price.value = p.price;
  form.category.value = p.category;
  form.image_url.value = p.image_url;
  form.available.checked = p.available;
  form.scrollIntoView({ behavior: "smooth" });
}

async function deleteProduct(id) {
  if (!confirm("Delete this product? Existing order history will keep item names.")) return;
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return toast(error.message, "error");
  toast("Product deleted");
  loadAdminProducts();
}

async function loadAdminOrders() {
  setLoading(qs("#adminOrders"), true, "Loading orders...");
  const driverResult = await supabase.from("profiles").select("id, full_name").eq("role", "DELIVERY_GUY");
  drivers = driverResult.data || [];
  const { data, error } = await supabase.from("orders").select("*, profiles(full_name, phone), order_items(*), deliveries(*)").order("created_at", { ascending: false });
  if (error) return qs("#adminOrders").innerHTML = emptyState("Could not load orders", error.message);
  if (!data.length) return qs("#adminOrders").innerHTML = emptyState("No orders", "Customer orders will appear here.");
  qs("#adminOrders").innerHTML = data.map(adminOrderCard).join("");
  qs("#adminOrders").querySelectorAll("[data-status]").forEach((b) => b.onclick = () => updateStatus(b.dataset.id, b.dataset.status));
  qs("#adminOrders").querySelectorAll("[data-assign]").forEach((select) => select.onchange = () => assignDriver(select.dataset.assign, select.value));
}

function adminOrderCard(order) {
  return `<article class="order-card">
    <div class="row between"><div><h3>#${order.id.slice(0, 8)} · ${order.profiles?.full_name || "Customer"}</h3><p>${order.delivery_address}</p></div><span class="status">${label(order.status)}</span></div>
    <div class="order-items">${order.order_items.map((i) => `<span>${i.quantity}x ${i.product_name}</span>`).join("")}</div>
    <div class="row wrap">
      ${["CONFIRMED", "PREPARING", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].map((s) => `<button class="btn ghost small" data-id="${order.id}" data-status="${s}">${label(s)}</button>`).join("")}
      <select data-assign="${order.id}"><option value="">Assign driver</option>${drivers.map((d) => `<option value="${d.id}" ${order.deliveries?.delivery_guy_id === d.id ? "selected" : ""}>${d.full_name}</option>`).join("")}</select>
      <a class="btn small" href="/admin/order-details.html?id=${order.id}">Open</a>
    </div>
  </article>`;
}

async function updateStatus(id, status) {
  const { error } = await supabase.from("orders").update({ status }).eq("id", id);
  if (error) return toast(error.message, "error");
  await supabase.from("order_events").insert({ order_id: id, status, note: "Updated by admin" });
  toast("Order status updated");
  loadAdminOrders();
}

async function assignDriver(orderId, deliveryGuyId) {
  if (!deliveryGuyId) return;
  const { error } = await supabase.from("deliveries").upsert({ order_id: orderId, delivery_guy_id: deliveryGuyId, status: "ASSIGNED" }, { onConflict: "order_id" });
  if (error) return toast(error.message, "error");
  await updateStatus(orderId, "CONFIRMED");
  toast("Delivery guy assigned");
}

boot();

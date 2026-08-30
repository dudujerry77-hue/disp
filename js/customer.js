import { bindLogout, currentUserProfile, requireRole } from "./auth.js";
import { qs, sitePath, supabase, toast } from "./app.js";
import { renderCart } from "./cart.js";
import { loadProducts } from "./products.js";
import { loadCustomerOrders, loadOrderDetails, placeOrder } from "./orders.js";

async function boot() {
  if (qs("#productGrid")) loadProducts();
  if (qs("#cartItems")) renderCart();

  if (location.pathname.includes("/customer/")) {
    const profile = await requireRole(["CUSTOMER"]);
    if (!profile) return;
    bindLogout();
    if (qs("#checkoutForm")) placeOrder(profile);
    if (qs("#ordersList")) loadCustomerOrders();
    if (qs("#orderDetails")) loadOrderDetails("customer");
    bindProfile(profile);
  } else if (qs("#checkoutForm")) {
    const profile = await currentUserProfile().catch(() => null);
    placeOrder(profile || {});
    qs("#checkoutForm").addEventListener("submit", (event) => {
      if (!profile) {
        event.preventDefault();
        toast("Sign in before placing an order.", "error");
        location.href = sitePath("/login.html");
      }
    }, { capture: true });
  }
}

function bindProfile(profile) {
  const form = qs("#profileForm");
  if (!form) return;
  form.full_name.value = profile.full_name || "";
  form.phone.value = profile.phone || "";
  form.address.value = profile.address || "";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { error } = await supabase.from("profiles").update({
      full_name: form.full_name.value.trim(),
      phone: form.phone.value.trim(),
      address: form.address.value.trim()
    }).eq("id", profile.id);
    if (error) return toast(error.message, "error");
    toast("Profile updated");
  });
}

boot();

import { emptyState, money, qs, setLoading, supabase, toast } from "./app.js";
import { addToCart } from "./cart.js";

export async function loadProducts(containerSelector = "#productGrid", admin = false) {
  const container = qs(containerSelector);
  setLoading(container, true, "Loading products...");
  const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
  if (error) {
    container.innerHTML = emptyState("Products unavailable", error.message);
    return [];
  }
  if (!data.length) {
    container.innerHTML = emptyState("No products yet", "Products added by admins will appear here.");
    return [];
  }
  container.innerHTML = data.map((p) => productCard(p, admin)).join("");
  container.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => addToCart(data.find((p) => p.id === button.dataset.add))));
  return data;
}

function productCard(product, admin) {
  return `<article class="product-card">
    <img src="${product.image_url}" alt="${product.name}">
    <div>
      <div class="row between"><span class="pill">${product.category}</span><span class="${product.available ? "ok" : "danger"}">${product.available ? "Available" : "Unavailable"}</span></div>
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      <div class="row between"><strong>${money(product.price)}</strong>${admin ? "" : `<button class="btn small" data-add="${product.id}" ${product.available ? "" : "disabled"}>Add</button>`}</div>
    </div>
  </article>`;
}

export function bindProductForm(refresh) {
  const form = qs("#productForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = form.image_file?.files?.[0];
    let imageUrl = form.image_url.value.trim();
    if (file) {
      const path = `${crypto.randomUUID()}-${file.name.replaceAll(" ", "-")}`;
      const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file, { upsert: false });
      if (uploadError) return toast(uploadError.message, "error");
      imageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    if (!imageUrl) return toast("Provide an image URL or upload an image file.", "error");
    const payload = {
      name: form.name.value.trim(),
      description: form.description.value.trim(),
      price: Number(form.price.value),
      category: form.category.value.trim(),
      image_url: imageUrl,
      available: form.available.checked
    };
    const id = form.product_id.value;
    const request = id ? supabase.from("products").update(payload).eq("id", id) : supabase.from("products").insert(payload);
    const { error } = await request;
    if (error) return toast(error.message, "error");
    form.reset();
    form.product_id.value = "";
    toast(id ? "Product updated" : "Product added");
    refresh();
  });
}

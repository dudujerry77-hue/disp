import { money, qs, toast } from "./app.js";

const key = "delivery_cart";

export function getCart() {
  return JSON.parse(localStorage.getItem(key) || "[]");
}

export function saveCart(cart) {
  localStorage.setItem(key, JSON.stringify(cart));
  renderCart();
}

export function clearCart() {
  saveCart([]);
}

export function addToCart(product) {
  if (!product?.available) return toast("That product is unavailable.", "error");
  const cart = getCart();
  const existing = cart.find((item) => item.id === product.id);
  if (existing) existing.quantity += 1;
  else cart.push({ id: product.id, name: product.name, price: product.price, image_url: product.image_url, quantity: 1 });
  saveCart(cart);
  toast(`${product.name} added to cart`);
}

export function renderCart() {
  const node = qs("#cartItems");
  const total = qs("#cartTotal");
  if (!node) return;
  const cart = getCart();
  if (!cart.length) {
    node.innerHTML = `<div class="empty compact">Your cart is empty.</div>`;
    if (total) total.textContent = money(0);
    return;
  }
  node.innerHTML = cart.map((item) => `<div class="cart-row">
    <img src="${item.image_url}" alt="">
    <div><strong>${item.name}</strong><span>${money(item.price)}</span></div>
    <div class="qty"><button data-dec="${item.id}">-</button><span>${item.quantity}</span><button data-inc="${item.id}">+</button></div>
    <button class="icon danger" data-remove="${item.id}" aria-label="Remove">x</button>
  </div>`).join("");
  if (total) total.textContent = money(cart.reduce((sum, item) => sum + item.price * item.quantity, 0));
  node.querySelectorAll("[data-inc]").forEach((b) => b.onclick = () => updateQty(b.dataset.inc, 1));
  node.querySelectorAll("[data-dec]").forEach((b) => b.onclick = () => updateQty(b.dataset.dec, -1));
  node.querySelectorAll("[data-remove]").forEach((b) => b.onclick = () => saveCart(cart.filter((item) => item.id !== b.dataset.remove)));
}

function updateQty(id, delta) {
  const cart = getCart().map((item) => item.id === id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0);
  saveCart(cart);
}

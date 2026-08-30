import { routeForRole, sitePath, supabase, toast } from "./app.js";

export async function currentUserProfile() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw error;
  return data;
}

export async function requireRole(allowedRoles) {
  const profile = await currentUserProfile();
  if (!profile) {
    location.href = sitePath(`/login.html?next=${encodeURIComponent(location.pathname)}`);
    return null;
  }
  if (!allowedRoles.includes(profile.role)) {
    toast("You do not have permission to view that page.", "error");
    location.href = routeForRole(profile.role);
    return null;
  }
  return profile;
}

export async function signOut() {
  await supabase.auth.signOut();
  location.href = sitePath("/index.html");
}

export function bindLogout() {
  document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", signOut));
}

export function initLogin(requiredRole = null) {
  const form = document.querySelector("#loginForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    const email = form.email.value.trim();
    const password = form.password.value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    button.disabled = false;
    if (error) return toast(error.message, "error");
    const profile = await currentUserProfile();
    if (requiredRole && profile.role !== requiredRole) {
      await supabase.auth.signOut();
      return toast(`This login is for ${requiredRole.replaceAll("_", " ")} accounts only.`, "error");
    }
    location.href = routeForRole(profile.role);
  });
}

export function initRegister() {
  const form = document.querySelector("#registerForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    const full_name = form.full_name.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name } } });
    button.disabled = false;
    if (error) return toast(error.message, "error");
    toast("Account created. Check your email if confirmation is enabled.");
    location.href = sitePath("/customer/dashboard.html");
  });
}

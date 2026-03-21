import type { Result } from "./types.js";
import { login, logout, verify, requireAdmin, hashPassword } from "./auth.js";
import {
  getUser, createUser, listProducts, getProduct, getOrder, getUserOrders,
  createProduct, deleteProduct, searchProducts, searchUsers,
} from "./db.js";
import { addToCart, checkout, getCart } from "./cart.js";
import { sendEmail, sendSMS, getDeadLetters, retryDeadLetters } from "./notifications.js";
import { validateUser, validateProduct } from "./validate.js";

type Handler = (body: any, token?: string) => Result<any>;

function requireString(val: unknown, name: string): Result<string> {
  if (typeof val !== "string" || val.trim() === "") {
    return { ok: false, error: `${name} must be a non-empty string` };
  }
  return { ok: true, data: val.trim() };
}

function requirePositiveInt(val: unknown, name: string): Result<number> {
  if (!Number.isInteger(val) || (val as number) <= 0) {
    return { ok: false, error: `${name} must be a positive integer` };
  }
  return { ok: true, data: val as number };
}

function requireAuth(token?: string) {
  if (!token) return { ok: false, error: "auth required" } as Result<never>;
  return verify(token);
}

const routes: Record<string, Handler> = {
  "GET /products": () => ({ ok: true, data: listProducts() }),

  "GET /product": (body) => {
    const id = requireString(body?.id, "id");
    if (!id.ok) return id;
    const p = getProduct(id.data);
    if (!p) return { ok: false, error: "not found" };
    return { ok: true, data: p };
  },

  "GET /search/products": (body) => {
    if (!body.q && !body.category)
      return { ok: false, error: "provide q or category" };
    return { ok: true, data: searchProducts(body.q ?? "", body.category) };
  },

  "GET /search/users": (body, token) => {
    const session = requireAuth(token);
    if (!session.ok) return session;
    if (!body.q) return { ok: false, error: "provide q" };
    return { ok: true, data: searchUsers(body.q) };
  },

  "POST /register": (body) => {
    const errors = validateUser(body);
    if (errors.length > 0) return { ok: false, error: errors.join(", ") };
    const password = requireString(body?.password, "password");
    if (!password.ok) return password;
    if (password.data.length < 8) return { ok: false, error: "password must be at least 8 characters" };

    const ok = createUser({
      id: `usr_${Date.now()}`,
      name: body.name,
      email: body.email,
      passwordHash: hashPassword(password.data),
      role: body.role ?? "user",
    });
    if (!ok) return { ok: false, error: "already exists" };
    sendEmail(body.email, "Welcome!", `Hi ${body.name}`);
    return { ok: true, data: { registered: true } };
  },

  "POST /login": (body) => {
    const email = requireString(body?.email, "email");
    if (!email.ok) return email;
    const password = requireString(body?.password, "password");
    if (!password.ok) return password;
    return login(email.data, password.data);
  },

  "POST /logout": (_body, token) => {
    if (!token) return { ok: false, error: "auth required" };
    logout(token);
    return { ok: true, data: { loggedOut: true } };
  },

  "POST /cart/add": (body, token) => {
    const session = requireAuth(token);
    if (!session.ok) return session;
    const productId = requireString(body?.productId, "productId");
    if (!productId.ok) return productId;
    const qty = requirePositiveInt(body?.qty, "qty");
    if (!qty.ok) return qty;
    return addToCart(session.data.userId, productId.data, qty.data);
  },

  "POST /checkout": (_body, token) => {
    const session = requireAuth(token);
    if (!session.ok) return session;
    const result = checkout(session.data.userId);
    if (result.ok) {
      const user = getUser(session.data.userId);
      if (user) {
        sendEmail(user.email, "Order confirmed", `Order ${result.data.id}`);
      }
    }
    return result;
  },

  "GET /cart": (_body, token) => {
    const session = requireAuth(token);
    if (!session.ok) return session;
    const cart = getCart(session.data.userId);
    return { ok: true, data: [...cart.entries()] };
  },

  "GET /orders": (_body, token) => {
    const session = requireAuth(token);
    if (!session.ok) return session;
    return { ok: true, data: getUserOrders(session.data.userId) };
  },

  "GET /order": (body, token) => {
    const session = requireAuth(token);
    if (!session.ok) return session;
    const id = requireString(body?.id, "id");
    if (!id.ok) return id;
    const order = getOrder(id.data);
    if (!order) return { ok: false, error: "not found" };
    if (order.userId !== session.data.userId) {
      return { ok: false, error: "forbidden" };
    }
    return { ok: true, data: order };
  },

  "POST /admin/product": (body, token) => {
    if (!token) return { ok: false, error: "auth required" };
    const auth = requireAdmin(token);
    if (!auth.ok) return auth;
    const errors = validateProduct(body);
    if (errors.length > 0) return { ok: false, error: errors.join(", ") };
    const product = {
      id: `prod_${Date.now()}`,
      name: body.name,
      description: body.description ?? "",
      category: body.category ?? "uncategorized",
      tags: body.tags ?? [],
      price: body.price,
      stock: body.stock,
      imageUrl: body.imageUrl,
      createdAt: Date.now(),
    };
    createProduct(product);
    return { ok: true, data: product };
  },

  "DELETE /admin/product": (body, token) => {
    if (!token) return { ok: false, error: "auth required" };
    const auth = requireAdmin(token);
    if (!auth.ok) return auth;
    const id = requireString(body?.id, "id");
    if (!id.ok) return id;
    const deleted = deleteProduct(id.data);
    if (!deleted) return { ok: false, error: "not found" };
    return { ok: true, data: { deleted: true } };
  },

  "POST /admin/notify": (body, token) => {
    if (!token) return { ok: false, error: "auth required" };
    const auth = requireAdmin(token);
    if (!auth.ok) return auth;
    if (!body.to || !body.subject || !body.body) {
      return { ok: false, error: "missing required fields: to, subject, body" };
    }
    sendEmail(body.to, body.subject, body.body);
    return { ok: true, data: { sent: true } };
  },

  "POST /admin/notify/sms": (body, token) => {
    if (!token) return { ok: false, error: "auth required" };
    const auth = requireAdmin(token);
    if (!auth.ok) return auth;
    if (!body.phone || !body.message) {
      return { ok: false, error: "missing required fields: phone, message" };
    }
    sendSMS(body.phone, body.message);
    return { ok: true, data: { sent: true } };
  },

  "GET /admin/notify/dead-letters": (_body, token) => {
    if (!token) return { ok: false, error: "auth required" };
    const auth = requireAdmin(token);
    if (!auth.ok) return auth;
    return { ok: true, data: getDeadLetters() };
  },

  "POST /admin/notify/retry": (_body, token) => {
    if (!token) return { ok: false, error: "auth required" };
    const auth = requireAdmin(token);
    if (!auth.ok) return auth;
    const count = retryDeadLetters();
    return { ok: true, data: { retried: count } };
  },
};

export function handle(method: string, path: string, body: any, token?: string): Result<any> {
  const key = `${method} ${path}`;
  const handler = routes[key];
  if (!handler) return { ok: false, error: `no route: ${key}` };
  return handler(body, token);
}
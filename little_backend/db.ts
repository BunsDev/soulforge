import type { User, Product, Order } from "./types.js";

const users = new Map<string, User>();
const products = new Map<string, Product>();
const orders = new Map<string, Order>();

export function getUser(id: string): User | undefined {
  return users.get(id);
}

export function getUserByEmail(email: string): User | undefined {
  for (const u of users.values()) {
    if (u.email === email) return u;
  }
  return undefined;
}

export function createUser(user: User) {
  if (getUserByEmail(user.email)) return false;
  users.set(user.id, user);
  return true;
}

export function updateUser(id: string, fields: Partial<Omit<User, "id">>): boolean {
  const user = users.get(id);
  if (!user) return false;
  Object.assign(user, fields);
  return true;
}

export function deleteUser(id: string): boolean {
  return users.delete(id);
}

export function getProduct(id: string) {
  return products.get(id);
}

export function createProduct(p: Product) {
  products.set(p.id, p);
}

export function updateProduct(id: string, fields: Partial<Omit<Product, "id">>): boolean {
  const product = products.get(id);
  if (!product) return false;
  Object.assign(product, fields);
  return true;
}

export function deleteProduct(id: string): boolean {
  return products.delete(id);
}

export function updateStock(productId: string, delta: number): boolean {
  const p = products.get(productId);
  if (!p) return false;
  const newStock = p.stock + delta;
  if (newStock < 0) return false;
  p.stock = newStock;
  return true;
}

export function createOrder(order: Order) {
  orders.set(order.id, order);
}

export function getOrder(id: string) {
  return orders.get(id);
}

export function deleteOrder(id: string): boolean {
  return orders.delete(id);
}

export function getUserOrders(userId: string): Order[] {
  return [...orders.values()].filter((o) => o.userId === userId);
}

export function listProducts(): Product[] {
  return [...products.values()];
}

export function searchProducts(query: string, category?: string): Product[] {
  const q = query.toLowerCase();
  return [...products.values()].filter((p) => {
    const matchesQuery =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q));
    const matchesCategory =
      !category || p.category.toLowerCase() === category.toLowerCase();
    return matchesQuery && matchesCategory;
  });
}

export function searchUsers(query: string): User[] {
  const q = query.toLowerCase();
  return [...users.values()].filter(
    (u) =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
  );
}

export function listUsers(): User[] {
  return [...users.values()];
}
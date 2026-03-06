import { validateUser, type UserInput } from "./validation";

function createUser(input: UserInput): { id: string; name: string; email: string; age: number } {
  const result = validateUser(input);
  if (!result.valid) {
    throw new Error(`Validation failed: ${result.errors.join(", ")}`);
  }
  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    email: input.email.toLowerCase(),
    age: input.age,
  };
}

export { createUser, validateUser, type UserInput };

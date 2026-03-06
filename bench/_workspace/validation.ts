interface UserInput {
  name: string;
  email: string;
  age: number;
}

function validateName(name: string): string | null {
  if (!name || name.trim().length === 0) return "Name is required";
  if (name.length > 100) return "Name too long";
  if (!/^[a-zA-Z\s'-]+$/.test(name)) return "Name contains invalid characters";
  return null;
}

function validateEmail(email: string): string | null {
  if (!email) return "Email is required";
  if (!email.includes("@")) return "Invalid email format";
  if (email.length > 254) return "Email too long";
  const [local, domain] = email.split("@");
  if (!local || !domain || !domain.includes(".")) return "Invalid email format";
  return null;
}

function validateAge(age: number): string | null {
  if (age == null) return "Age is required";
  if (!Number.isInteger(age)) return "Age must be an integer";
  if (age < 0 || age > 150) return "Age out of range";
  return null;
}

function validateUser(input: UserInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nameErr = validateName(input.name);
  if (nameErr) errors.push(nameErr);
  const emailErr = validateEmail(input.email);
  if (emailErr) errors.push(emailErr);
  const ageErr = validateAge(input.age);
  if (ageErr) errors.push(ageErr);
  return { valid: errors.length === 0, errors };
}

export { validateUser, validateName, validateEmail, validateAge, type UserInput };

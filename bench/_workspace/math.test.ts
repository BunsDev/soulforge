import { describe, it, expect } from "bun:test";
import { add, subtract, multiply, divide } from "./math";

describe("add", () => {
  it("should add two positive numbers", () => {
    expect(add(2, 3)).toBe(5);
  });

  it("should add negative numbers", () => {
    expect(add(-2, -3)).toBe(-5);
  });

  it("should add mixed sign numbers", () => {
    expect(add(5, -3)).toBe(2);
  });

  it("should handle zero", () => {
    expect(add(0, 5)).toBe(5);
    expect(add(5, 0)).toBe(5);
    expect(add(0, 0)).toBe(0);
  });

  it("should handle decimals", () => {
    expect(add(1.5, 2.5)).toBe(4);
  });
});

describe("subtract", () => {
  it("should subtract two positive numbers", () => {
    expect(subtract(5, 3)).toBe(2);
  });

  it("should subtract negative numbers", () => {
    expect(subtract(-2, -3)).toBe(1);
  });

  it("should subtract mixed sign numbers", () => {
    expect(subtract(5, -3)).toBe(8);
  });

  it("should handle zero", () => {
    expect(subtract(5, 0)).toBe(5);
    expect(subtract(0, 5)).toBe(-5);
    expect(subtract(0, 0)).toBe(0);
  });

  it("should handle decimals", () => {
    expect(subtract(5.5, 2.5)).toBe(3);
  });
});

describe("multiply", () => {
  it("should multiply two positive numbers", () => {
    expect(multiply(3, 4)).toBe(12);
  });

  it("should multiply negative numbers", () => {
    expect(multiply(-2, -3)).toBe(6);
  });

  it("should multiply mixed sign numbers", () => {
    expect(multiply(5, -3)).toBe(-15);
  });

  it("should handle zero", () => {
    expect(multiply(0, 5)).toBe(0);
    expect(multiply(5, 0)).toBe(0);
    expect(multiply(0, 0)).toBe(0);
  });

  it("should handle decimals", () => {
    expect(multiply(2.5, 4)).toBe(10);
  });

  it("should handle one as identity", () => {
    expect(multiply(1, 42)).toBe(42);
    expect(multiply(42, 1)).toBe(42);
  });
});

describe("divide", () => {
  it("should divide two positive numbers", () => {
    expect(divide(10, 2)).toBe(5);
  });

  it("should divide negative numbers", () => {
    expect(divide(-10, -2)).toBe(5);
  });

  it("should divide mixed sign numbers", () => {
    expect(divide(10, -2)).toBe(-5);
  });

  it("should handle zero numerator", () => {
    expect(divide(0, 5)).toBe(0);
  });

  it("should throw on division by zero", () => {
    expect(() => divide(10, 0)).toThrow("Division by zero");
  });

  it("should handle decimals", () => {
    expect(divide(7.5, 2.5)).toBeCloseTo(3);
  });

  it("should handle one as denominator", () => {
    expect(divide(42, 1)).toBe(42);
  });
});

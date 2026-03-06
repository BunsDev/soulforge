/**
 * Returns the Nth Fibonacci number (0-indexed).
 * fib(0) = 0, fib(1) = 1, fib(5) = 5, fib(10) = 55
 */
function fib(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  let a = 0;
  let b = 1;
  for (let i = 2; i <= n; i++) {
      const temp = a + b;
    a = b;
    b = temp;
    }
  return b;
}

console.log(`fib(0) = ${fib(0)}`);  // expect 0
console.log(`fib(1) = ${fib(1)}`);  // expect 1
console.log(`fib(5) = ${fib(5)}`);  // expect 5
console.log(`fib(10) = ${fib(10)}`); // expect 55

// Self-check
const expected = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
for (let i = 0; i <= 10; i++) {
  const got = fib(i);
  if (got !== expected[i]) {
    console.error(`FAIL: fib(${i}) = ${got}, expected ${expected[i]}`);
    process.exit(1);
  }
}
console.log("All checks passed");

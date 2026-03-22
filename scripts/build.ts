#!/usr/bin/env bun
/**
 * Build script that uses Bun.build() JS API to enable the React Compiler
 * plugin during production builds. The CLI `bun build` does NOT support
 * plugins — only the JS API does.
 *
 * Usage:
 *   bun scripts/build.ts                                          — build to dist/
 *   bun scripts/build.ts --compile                                — build standalone binary
 *   bun scripts/build.ts --compile --outfile=path --target=bun-darwin-aarch64
 */
import { type BunPlugin } from "bun";

// ── React Compiler Plugin ────────────────────────────────────────────
const reactCompilerPlugin: BunPlugin = {
  name: "react-compiler",
  setup(build) {
    build.onLoad({ filter: /src\/.*\.tsx?$/ }, async ({ path, loader }) => {
      const { transformSync } = await import("@babel/core");
      const source = await Bun.file(path).text();
      const result = transformSync(source, {
        filename: path,
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
        parserOpts: { plugins: ["typescript", "jsx"] },
      });
      return { contents: result?.code ?? source, loader };
    });
  },
};

// ── Parse args ───────────────────────────────────────────────────────
const isCompile = process.argv.includes("--compile");

const getFlag = (name: string) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
};

const outfile = getFlag("outfile");
const compileTarget = getFlag("target");

// ── Build ────────────────────────────────────────────────────────────
const start = performance.now();

const result = await Bun.build({
  entrypoints: ["src/boot.tsx"],
  outdir: isCompile ? undefined : "dist",
  target: "bun",
  external: ["react-devtools-core"],
  naming: "[dir]/index.[ext]",
  plugins: [reactCompilerPlugin],
  ...(isCompile && {
    compile: compileTarget ?? true,
    ...(outfile && { outfile }),
  }),
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const elapsed = (performance.now() - start).toFixed(0);
const count = result.outputs.length;
console.log(
  `✓ Built ${count} artifact${count === 1 ? "" : "s"} with React Compiler in ${elapsed}ms`
);
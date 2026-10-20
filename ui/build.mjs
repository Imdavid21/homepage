import { build } from "esbuild";
await build({ entryPoints: ["src/main.jsx"], bundle: true, minify: true, format: "iife", target: "es2020", outfile: "dist/app.js", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, legalComments: "none" });

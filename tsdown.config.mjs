import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  outExtensions: () => ({ js: ".js" }),
  banner: { js: "#!/usr/bin/env node" },
});

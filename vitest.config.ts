import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` lanza al importarse fuera de un Server Component, lo
      // que haría imposible testear services/. En Node la protección no
      // aplica; el import sigue en el código de producción.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
  },
});

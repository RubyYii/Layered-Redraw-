import { defineConfig } from "vite";

const normalized = (id) => id.replaceAll("\\", "/");

export default defineConfig({
  build: {
    // The only larger artifact is Rapier's lazy, embedded WASM compatibility
    // chunk; the eagerly loaded application entry is kept below 500 kB.
    chunkSizeWarningLimit: 3_000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 12_000,
          includeDependenciesRecursively: false,
          groups: [
            {
              name: "schema-runtime",
              test: (id) => {
                const path = normalized(id);
                return path.includes("/pact-cp03-contracts/")
                  || path.includes("/node_modules/ajv/")
                  || path.includes("/node_modules/ajv-formats/");
              },
              priority: 40,
            },
            {
              name: "scene-engine",
              test: (id) => /\/src\/(?:editor|director|camera-editor|simulation-runtime|collision-runtime|interaction-runtime|navigation-runtime|navmesh-runtime|ownership-runtime|motion-runtime)\.js$/.test(normalized(id)),
              priority: 30,
            },
            {
              name: "agent-governance",
              test: (id) => /\/src\/(?:agent-runtime|scene-governance|scene-patch-runtime|cp03\/[^/]+)\.js$/.test(normalized(id)),
              priority: 25,
            },
            {
              name: "project-io",
              test: (id) => /\/src\/(?:model|case-pack-runtime|portable-project-package|project-persistence|interaction-demo)\.js$/.test(normalized(id)),
              priority: 20,
            },
          ],
        },
      },
    },
  },
});

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    // pool=threads (worker_threads, per-file isolated), NOT vmThreads. vmThreads reuses one
    // worker's VM context across files, which leaks vi.mock module registries between files
    // that mock the SAME path with DIFFERENT factories (here: @/lib/agentStream mocked by both
    // ComposeSurface & GeneratingTheater tests; ./llmApi by AIEngineSection & SettingsSurface;
    // ./voiceApi by BrandVoiceSection & SettingsSurface). The collision made a file receive
    // another file's mock instance, so its beforeEach-configured resolved values never reached
    // the component → flaky cross-file waitFor timeouts / null handlers. threads gives true
    // per-file isolation while staying lighter than forks (forks child_process spawn is
    // unreliable in parallel over this NAS mount). Isolation makes parallelism safe, so the old
    // maxWorkers:1 vmThreads-flakiness workaround is gone; cap workers to spare the NAS mount.
    pool: "threads",
    maxWorkers: 2,
    minWorkers: 1,
    isolate: true,
    testTimeout: 30000,
  },
});

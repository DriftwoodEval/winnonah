import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
	},
	resolve: {
		alias: {
			"~": path.resolve(projectRoot, "src"),
			"@components": path.resolve(projectRoot, "src/app/_components"),
			"@ui": path.resolve(projectRoot, "src/app/_components/ui"),
		},
	},
});

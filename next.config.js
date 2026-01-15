/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const { execSync } = await import("node:child_process");

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();
let branchName = "unknown";
try {
	branchName = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
} catch (e) {
	console.log("Could not determine git branch name:", e);
}

const config = {
	env: {
		NEXT_PUBLIC_GIT_BRANCH: branchName,
		NEXT_PUBLIC_COMMIT_HASH: commitHash,
	},
	allowedDevOrigins: ["winnonah.xyz", "*.winnonah.xyz"],
	output: "standalone",
	serverExternalPackages: ["pino", "pino-pretty"],
};

export default config;

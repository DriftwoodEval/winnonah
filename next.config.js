/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const { execSync } = await import("node:child_process");

/**
 * @param {string} command
 * @param {string} envVar
 */
function getGitInfo(command, envVar) {
	if (process.env[envVar]) return process.env[envVar];

	try {
		return execSync(command).toString().trim();
	} catch (e) {
		console.log(`Could not determine git info for ${envVar}:`, e);
		return "unknown";
	}
}

const commitHash = getGitInfo(
	"git rev-parse --short HEAD",
	"NEXT_PUBLIC_COMMIT_HASH",
);
const branchName = getGitInfo(
	"git rev-parse --abbrev-ref HEAD",
	"NEXT_PUBLIC_GIT_BRANCH",
);

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

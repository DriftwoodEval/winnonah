/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import { execSync } from "node:child_process";

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

const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "emr.driftwoodeval.com";

/** @type {import("next").NextConfig} */
const config = {
	env: {
		NEXT_PUBLIC_GIT_BRANCH: branchName,
		NEXT_PUBLIC_COMMIT_HASH: commitHash,
	},
	allowedDevOrigins: [appDomain, `*.${appDomain}`],
	output: "standalone",
	serverExternalPackages: ["pino", "pino-pretty"],
	experimental: {
		optimizePackageImports: ["lucide-react", "lodash"],
	},
};

export default config;

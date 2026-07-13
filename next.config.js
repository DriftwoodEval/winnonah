/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import { execSync } from "node:child_process";
import createMDX from "@next/mdx";

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
const appHost = new URL(`https://${appDomain}`).hostname
	.split(".")
	.slice(-2)
	.join(".");

/** @type {import("next").NextConfig} */
const config = {
	env: {
		NEXT_PUBLIC_GIT_BRANCH: branchName,
		NEXT_PUBLIC_COMMIT_HASH: commitHash,
	},
	allowedDevOrigins: [appDomain, `*.${appHost}`],
	output: "standalone",
	serverExternalPackages: ["pino", "pino-pretty", "sharp"],
	// Next's file tracing doesn't follow sharp's dlopen'd libvips .so, so the
	// standalone build silently drops it. Force it to be included explicitly.
	outputFileTracingIncludes: {
		"/docs/images/**": [
			"./node_modules/.pnpm/@img+sharp-libvips-*/node_modules/@img/sharp-libvips-*/lib/**",
		],
	},
	experimental: {
		optimizePackageImports: [
			"lucide-react",
			"radix-ui",
			"date-fns",
			"@tiptap/core",
			"@tiptap/starter-kit",
		],
	},
};

const withMDX = createMDX({
	options: {
		remarkPlugins: [
			"remark-frontmatter",
			"remark-mdx-frontmatter",
			"remark-gfm",
		],
		rehypePlugins: [
			"rehype-slug",
			["rehype-autolink-headings", { behavior: "append" }],
			[
				"rehype-pretty-code",
				{
					theme: {
						dark: "gruvbox-dark-medium",
						light: "gruvbox-light-medium",
					},
					keepBackground: true,
				},
			],
		],
	},
});

export default withMDX(config);

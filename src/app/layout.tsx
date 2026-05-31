import "~/styles/globals.css";

import { Header } from "@components/layout/Header";
import { Toaster } from "@ui/sonner";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { env } from "~/env";
import { cn } from "~/lib/utils";
import Providers from "./providers";

export const metadata: Metadata = {
	title: {
		default: env.NEXT_PUBLIC_APP_TITLE,
		template: `%s | ${env.NEXT_PUBLIC_APP_TITLE}`,
	},
	description: env.NEXT_PUBLIC_APP_TITLE,
	icons: [{ rel: "icon", url: "/favicon.png" }],
};

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const jetBrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-jetbrains-mono",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			className={cn("h-full", jetBrainsMono.variable, inter.variable)}
			lang="en"
			suppressHydrationWarning
		>
			<body className="flex min-h-screen flex-col bg-background">
				<Providers>
					<Header />
					<main className="flex grow pt-10">{children}</main>
					<Toaster position="top-center" richColors />
				</Providers>
			</body>
		</html>
	);
}

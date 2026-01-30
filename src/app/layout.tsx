import "~/styles/globals.css";

import { Header } from "@components/layout/Header";
import VersionFooter from "@components/shared/VersionFooter";
import { Toaster } from "@ui/sonner";
import type { Metadata } from "next";
import {
	JetBrains_Mono,
	Plus_Jakarta_Sans,
	Source_Serif_4,
} from "next/font/google";
import Providers from "./providers";

export const metadata: Metadata = {
	title: {
		default: "Winnonah",
		template: "%s | Winnonah",
	},
	description: "Winnonah",
	icons: [{ rel: "icon", url: "/favicon.png" }],
};

const plusJakartaSans = Plus_Jakarta_Sans({
	subsets: ["latin"],
	variable: "--font-plus-jakarta-sans",
});

const sourceSerif4 = Source_Serif_4({
	subsets: ["latin"],
	variable: "--font-source-serif-4",
});

const jetBrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-jetbrains-mono",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			className={`${plusJakartaSans.variable} ${sourceSerif4.variable} ${jetBrainsMono.variable} h-full`}
			lang="en"
			suppressHydrationWarning
		>
			<body className="flex min-h-screen flex-col bg-background">
				<Providers>
					<Header />
					<main className="flex grow pt-10">
						{children}
						<VersionFooter />
					</main>
					<Toaster position="top-center" richColors />
				</Providers>
			</body>
		</html>
	);
}

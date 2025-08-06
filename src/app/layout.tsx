import "~/styles/globals.css";

import { Header } from "@components/layout/Header";
import type { Metadata } from "next";
import { Lora, Plus_Jakarta_Sans, Roboto_Mono } from "next/font/google";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
	title: "Winnonah",
	description: "Winnonah",
	icons: [{ rel: "icon", url: "/favicon.png" }],
};

const plusJakartaSans = Plus_Jakarta_Sans({
	subsets: ["latin"],
	variable: "--font-plus-jakarta-sans",
});

const lora = Lora({
	subsets: ["latin"],
	variable: "--font-lora",
});

const robotoMono = Roboto_Mono({
	subsets: ["latin"],
	variable: "--font-roboto-mono",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			className={`${plusJakartaSans.variable} ${lora.variable} ${robotoMono.variable} h-full`}
			lang="en"
		>
			<body className="dark h-full bg-background">
				<TRPCReactProvider>
					<Header />
					{children}
				</TRPCReactProvider>
			</body>
		</html>
	);
}

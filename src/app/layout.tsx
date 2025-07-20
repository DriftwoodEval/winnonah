import "~/styles/globals.css";

import type { Metadata } from "next";
import { Lora, Plus_Jakarta_Sans, Roboto_Mono } from "next/font/google";
import { Header } from "~/app/_components/Header";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
	title: "Schedule Helper",
	description: "Schedule Helper",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
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
			lang="en"
			className={`${plusJakartaSans.variable} ${lora.variable} ${robotoMono.variable} h-full`}
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

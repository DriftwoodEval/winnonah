import "~/styles/globals.css";

import { Header } from "@components/Header";
import { ClientLoadingProvider } from "@context/ClientLoadingContext";
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
			lang="en"
			className={`${plusJakartaSans.variable} ${lora.variable} ${robotoMono.variable} h-full`}
		>
			<body className="dark h-full bg-background">
				<TRPCReactProvider>
					<ClientLoadingProvider>
						<Header />
						{children}
					</ClientLoadingProvider>
				</TRPCReactProvider>
			</body>
		</html>
	);
}

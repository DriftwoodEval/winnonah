import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Header } from "~/app/_components/Header";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
	title: "Schedule Helper",
	description: "Schedule Helper",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${geist.variable} h-full`}>
			<body className="dark h-full bg-background">
				<TRPCReactProvider>
					<Header />
					{children}
				</TRPCReactProvider>
			</body>
		</html>
	);
}

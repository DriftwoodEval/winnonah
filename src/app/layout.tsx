import "~/styles/globals.css";

import type { Metadata } from "next";
import { Geist } from "next/font/google";

import Link from "next/link";
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
		<html lang="en" className={`${geist.variable} h-full overflow-hidden`}>
			<body className="dark h-full bg-background">
				<Link href="/">
					<h1 className="m-2 font-bold text-2xl">Schedule Helper</h1>
				</Link>
				<TRPCReactProvider>{children}</TRPCReactProvider>
			</body>
		</html>
	);
}

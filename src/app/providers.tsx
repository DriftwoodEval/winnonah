"use client";

import { ImageLightboxProvider } from "@components/shared/ImageLightbox";
import { SessionExpiryMonitor } from "@components/shared/SessionExpiryMonitor";
import { SystemUpdateMonitor } from "@components/shared/SystemUpdateMonitor";
import { ThemeProvider } from "@components/shared/ThemeProvider";
import { TooltipProvider } from "@ui/tooltip";
import { SessionProvider } from "next-auth/react";
import { DevRedactionProvider } from "~/app/_components/dev/dev-redaction";
import { TRPCReactProvider } from "~/trpc/react";

const IS_DEV = process.env.NODE_ENV === "development";

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<SessionProvider>
			<SessionExpiryMonitor />
			<TRPCReactProvider>
				<SystemUpdateMonitor />
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					disableTransitionOnChange
					enableSystem
				>
					<TooltipProvider>
						<ImageLightboxProvider>
							{IS_DEV ? (
								<DevRedactionProvider>{children}</DevRedactionProvider>
							) : (
								children
							)}
						</ImageLightboxProvider>
					</TooltipProvider>
				</ThemeProvider>
			</TRPCReactProvider>
		</SessionProvider>
	);
}

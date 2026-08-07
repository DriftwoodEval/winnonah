"use client";

import { IssuesAlert } from "@components/issues/issuesAlert";
import { TaskQueueBubble } from "@components/tasks/TaskQueueBubble";
import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Button } from "@ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { ArrowLeft, Clock, LogIn } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { useMediaQuery } from "~/hooks/use-media-query";
import type { HeaderItemId } from "~/lib/header-items";
import { api } from "~/trpc/react";
import { RedactionToggle } from "../redaction/RedactionToggle";
import { IssueFormLink } from "../shared/IssueFormLink";
import { ThemeSwitcher } from "../shared/ThemeSwitcher";
import { GlobalClientSearch } from "./GlobalClientSearch";
import { HeaderItemsCustomizer } from "./HeaderItemsCustomizer";
import { ImpersonateUserSelect } from "./ImpersonateUserSelect";

export function HeaderActions() {
	const pathname = usePathname();
	const { data: session } = useSession();
	const checkPermission = useCheckPermission();
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const { data: recentClients } = api.users.getRecentClients.useQuery(
		undefined,
		{ enabled: !!session },
	);
	const { data: headerPrefs } = api.users.getHeaderPreferences.useQuery(
		undefined,
		{ enabled: !!session },
	);
	const hiddenItems = new Set(
		(isDesktop ? headerPrefs?.desktop : headerPrefs?.mobile) ?? [],
	);
	const isHidden = (id: HeaderItemId) => hiddenItems.has(id);
	const [avatarOpen, setAvatarOpen] = useState(false);
	const [avatarView, setAvatarView] = useState<"menu" | "customize">("menu");
	const menuItemClass =
		"flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground";

	return (
		<div className="m-2 flex items-center gap-3">
			{session && pathname !== "/" && !isHidden("search") && (
				<GlobalClientSearch />
			)}

			{session && !isHidden("recent-clients") && !!recentClients?.length && (
				<Popover>
					<PopoverTrigger render={<Button size="icon" variant="ghost" />}>
						<Clock className="h-4 w-4" />
						<span className="sr-only">Recent clients</span>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-64 p-2">
						<p className="mb-2 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Recent Clients
						</p>
						<div className="flex flex-col">
							{recentClients.map((client) => (
								<Link
									className="rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
									href={`/clients/${client.hash}`}
									key={client.hash}
								>
									{client.name}
								</Link>
							))}
						</div>
					</PopoverContent>
				</Popover>
			)}

			{session && !isHidden("issues-alert") && <IssuesAlert />}
			{session && !isHidden("task-queue") && <TaskQueueBubble />}

			{(checkPermission("settings:impersonate") ||
				session?.user.isImpersonating) && <ImpersonateUserSelect />}
			{checkPermission("settings:pii-redaction") &&
				!isHidden("redaction-toggle") && <RedactionToggle />}

			{!isHidden("issue-form") && <IssueFormLink />}

			{isDesktop && !isHidden("theme-switcher") && <ThemeSwitcher />}

			{!session && (
				<Button onClick={() => signIn("google")} size="sm" variant="secondary">
					<span className="hidden sm:block">Sign in</span>

					<span className="block sm:hidden">
						<LogIn />
					</span>
				</Button>
			)}

			{session && (
				<Popover
					onOpenChange={(open, eventDetails) => {
						// Hovering a nav dropdown to preview a change auto-focuses
						// that menu, which would otherwise be treated as a dismiss.
						if (
							!open &&
							avatarView === "customize" &&
							eventDetails.reason === "focus-out"
						) {
							eventDetails.cancel();
							return;
						}
						setAvatarOpen(open);
						if (!open) setAvatarView("menu");
					}}
					open={avatarOpen}
				>
					<PopoverTrigger
						render={<Avatar className="cursor-pointer shadow-xs" />}
					>
						<AvatarImage src={session.user?.image ?? ""} />
						<AvatarFallback>
							{session?.user?.name
								? session.user.name
										.split(" ")
										.map((n) => (n ?? "")[0]?.toUpperCase())
										.join("")
								: ""}
						</AvatarFallback>
					</PopoverTrigger>
					{avatarView === "menu" ? (
						<PopoverContent align="end" className="w-56 gap-1 p-1">
							<Link
								className={menuItemClass}
								href="/settings"
								onClick={() => setAvatarOpen(false)}
							>
								Settings
							</Link>
							<button
								className={menuItemClass}
								onClick={() => setAvatarView("customize")}
								type="button"
							>
								Customize Header
							</button>
							<div className="-mx-1 my-1 h-px bg-border" />
							<button
								className={menuItemClass}
								onClick={() => signOut()}
								type="button"
							>
								Sign out
							</button>
							<div className="-mx-1 my-1 h-px bg-border" />
							<p className="px-1.5 py-1 font-mono font-normal text-[10px] text-muted-foreground">
								{process.env.NODE_ENV === "development" ? (
									<span>Branch: {process.env.NEXT_PUBLIC_GIT_BRANCH}</span>
								) : (
									<span>
										<a
											className="hover:underline"
											href={`https://github.com/DriftwoodEval/winnonah/commit/${process.env.NEXT_PUBLIC_COMMIT_HASH}`}
											rel="noopener noreferrer"
											target="_blank"
										>
											{process.env.NEXT_PUBLIC_COMMIT_HASH}
										</a>{" "}
										•{" "}
										{process.env.NEXT_PUBLIC_BUILD_DATE
											? new Date(
													process.env.NEXT_PUBLIC_BUILD_DATE,
												).toLocaleDateString("en-US", {
													year: "2-digit",
													month: "numeric",
													day: "numeric",
												})
											: "n/a"}
									</span>
								)}
							</p>
						</PopoverContent>
					) : (
						<PopoverContent
							align="end"
							className="flex max-h-[75vh] w-[26rem] max-w-[92vw] flex-col gap-3 overflow-y-auto md:max-h-[90vh]"
						>
							<button
								className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
								onClick={() => setAvatarView("menu")}
								type="button"
							>
								<ArrowLeft className="h-3 w-3" />
								Back
							</button>
							<HeaderItemsCustomizer />
						</PopoverContent>
					)}
				</Popover>
			)}
		</div>
	);
}

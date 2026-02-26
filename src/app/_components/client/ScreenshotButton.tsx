"use client";

import { Button } from "@ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Camera, Loader2 } from "lucide-react";
import Image from "next/image";
import { type ReactNode, useState } from "react";
import { api } from "~/trpc/react";

interface ScreenshotButtonProps {
	link: string;
	children?: ReactNode;
	className?: string;
}

export function ScreenshotButton({
	link,
	children,
	className,
}: ScreenshotButtonProps) {
	const [isOpen, setIsOpen] = useState(false);

	const { data, isLoading, error, refetch, isFetching } =
		api.questionnaires.getLatestScreenshot.useQuery(
			{ link },
			{
				enabled: false,
				retry: false,
			},
		);

	const handleFetch = async () => {
		setIsOpen(true);
		if (!data) {
			await refetch();
		}
	};

	return (
		<Popover onOpenChange={setIsOpen} open={isOpen}>
			<PopoverTrigger asChild>
				{children ? (
					<button
						className={className}
						onClick={handleFetch}
						title="View Latest Screenshot"
						type="button"
					>
						{children}
					</button>
				) : (
					<Button
						className="h-8 w-8"
						onClick={handleFetch}
						size="icon"
						title="View Latest Screenshot"
						variant="ghost"
					>
						<Camera className="h-4 w-4" />
					</Button>
				)}
			</PopoverTrigger>
			<PopoverContent className="w-[600px] max-w-[90vw]">
				<div className="grid gap-4">
					<div className="space-y-2">
						<h4 className="font-medium leading-none">Latest Screenshot</h4>
						<p className="text-muted-foreground text-sm">
							What we saw on our last automatic check of this link.
						</p>
					</div>
					<div className="flex min-h-[300px] flex-col items-center justify-center rounded-md border bg-accent/5 p-2">
						{isLoading || isFetching ? (
							<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
						) : error ? (
							<p className="text-destructive text-xs">Error: {error.message}</p>
						) : data?.url ? (
							<div className="w-full space-y-2">
								<Image
									alt="Latest Screenshot"
									className="h-auto w-full rounded border bg-white shadow-md"
									height={800}
									src={data.url}
									unoptimized
									width={1200}
								/>
								<p className="break-all text-center text-[10px] text-muted-foreground">
									{data.url.split("/").pop()}
								</p>
							</div>
						) : (
							<p className="text-muted-foreground text-xs">
								No screenshot found.
							</p>
						)}
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}

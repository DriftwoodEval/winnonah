import { Button, type buttonVariants } from "@ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import type { VariantProps } from "class-variance-authority";
import { ChevronDown } from "lucide-react";
import { cn } from "~/lib/utils";

interface SplitButtonProps
	extends React.ComponentProps<"button">,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
	mainButtonText: string;
	dropdownItems: { label: string; onClick: () => void }[];
}

export function SplitButton({
	className,
	variant,
	size,
	asChild = false,
	mainButtonText,
	dropdownItems,
	...props
}: SplitButtonProps) {
	return (
		<div className={cn("flex items-center", className)}>
			<Button
				className={"rounded-r-none"}
				size={size}
				variant={variant}
				{...props}
			>
				{mainButtonText}
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						className={"rounded-l-none border-l-0 px-2"}
						size={size}
						variant={variant}
					>
						<ChevronDown />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{dropdownItems.map((item) => (
						<DropdownMenuItem key={item.label} onClick={item.onClick}>
							{item.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

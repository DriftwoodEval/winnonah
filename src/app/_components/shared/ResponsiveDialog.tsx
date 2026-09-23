import { Button } from "@ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/dialog";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@ui/drawer";
import { type ReactNode, useState } from "react";
import { useMediaQuery } from "~/hooks/use-media-query";
import { cn } from "~/lib/utils";

interface ResponsiveDialogProps {
	children: ReactNode;
	open?: boolean;
	setOpen?: (open: boolean) => void;
	title: ReactNode;
	description?: string;
	trigger?: React.ReactElement;
	footer?: React.ReactNode;
	className?: string;
	showCloseButton?: boolean;
	initialFocus?: boolean | React.RefObject<HTMLElement | null>;
}

export function ResponsiveDialog({
	children,
	open: externalOpen,
	setOpen: externalSetOpen,
	title,
	description,
	trigger,
	footer,
	className,
	showCloseButton,
	initialFocus,
}: ResponsiveDialogProps) {
	const [internalOpen, setInternalOpen] = useState(false);
	const isDesktop = useMediaQuery("(min-width: 768px)");

	const open = externalOpen !== undefined ? externalOpen : internalOpen;
	const setOpen = externalSetOpen || setInternalOpen;

	if (isDesktop) {
		return (
			<Dialog onOpenChange={setOpen} open={open}>
				{trigger && <DialogTrigger nativeButton={false} render={trigger} />}
				<DialogContent
					className={cn(
						"max-h-[calc(100vh-4rem)] max-w-[min(fit-content,calc(100%-2rem))] overflow-x-hidden overflow-y-scroll",
						className,
					)}
					initialFocus={initialFocus}
				>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						{description && (
							<DialogDescription>{description}</DialogDescription>
						)}
					</DialogHeader>
					{children}
					{footer}
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Drawer onOpenChange={setOpen} open={open}>
			{trigger && <DrawerTrigger nativeButton={false} render={trigger} />}
			<DrawerContent initialFocus={initialFocus}>
				<DrawerHeader className="text-left">
					<DrawerTitle>{title}</DrawerTitle>
					{description && <DrawerDescription>{description}</DrawerDescription>}
				</DrawerHeader>
				<div className="overflow-y-auto px-4">{children}</div>
				<DrawerFooter className="pt-2">
					{footer}
					{showCloseButton && (
						<DrawerClose render={<Button variant="outline">Cancel</Button>} />
					)}
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}

export function useResponsiveDialog(defaultOpen = false) {
	const [open, setOpen] = useState(defaultOpen);

	const openDialog = () => setOpen(true);
	const closeDialog = () => setOpen(false);
	const toggleDialog = () => setOpen(!open);

	return {
		open,
		setOpen,
		openDialog,
		closeDialog,
		toggleDialog,
	};
}

"use client";

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@ui/hover-card";
import { Skeleton } from "@ui/skeleton";
import type { ReactNode } from "react";
import { useClientCardFields } from "~/hooks/use-client-card-fields";
import type { ClientCardFieldId } from "~/lib/clients/client-card";
import { api } from "~/trpc/react";
import { ClientInfoCard } from "./ClientInfoCard";

type ClientRef = { clientId: number } | { clientHash: string };

function ClientHoverCardBody({
	clientRef,
	fields,
}: {
	clientRef: ClientRef;
	fields: ClientCardFieldId[];
}) {
	const { data: client, isError } = api.clients.getCardSummary.useQuery(
		"clientId" in clientRef
			? { id: clientRef.clientId }
			: { hash: clientRef.clientHash },
		{ staleTime: 60 * 1000 },
	);

	if (isError) {
		return (
			<p className="text-muted-foreground text-xs">
				Could not load client info.
			</p>
		);
	}
	if (!client) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-4 w-40" />
				<Skeleton className="h-3 w-24" />
				<Skeleton className="h-3 w-32" />
			</div>
		);
	}
	return <ClientInfoCard client={client} fields={fields} />;
}

type ClientHoverCardProps = {
	clientId?: number | null;
	clientHash?: string | null;
	children: ReactNode;
};

/**
 * Shows a small card of client info when the wrapped client name is hovered.
 * The card's fields come from the user's My Preferences; with none selected,
 * or no client id or hash, the children render unchanged.
 */
export function ClientHoverCard({
	clientId,
	clientHash,
	children,
}: ClientHoverCardProps) {
	const { fields } = useClientCardFields();

	const clientRef: ClientRef | null = clientId
		? { clientId }
		: clientHash
			? { clientHash }
			: null;

	if (!clientRef || !fields || fields.length === 0) return <>{children}</>;

	return (
		<HoverCard closeDelay={100} openDelay={400}>
			<HoverCardTrigger asChild>
				<span>{children}</span>
			</HoverCardTrigger>
			<HoverCardContent>
				<ClientHoverCardBody clientRef={clientRef} fields={fields} />
			</HoverCardContent>
		</HoverCard>
	);
}

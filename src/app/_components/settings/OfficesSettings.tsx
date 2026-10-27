"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { cn } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

type Office = RouterOutputs["offices"]["getAll"][number];
type AddressMatch = RouterOutputs["offices"]["lookupAddress"][number];

// Geocodio scores below this are usually a street or city match, not a
// specific building.
const LOW_ACCURACY = 0.8;

function OfficeDialog({
	office,
	onClose,
}: {
	office: Office | null;
	onClose: () => void;
}) {
	const utils = api.useUtils();
	const [prettyName, setPrettyName] = useState(office?.prettyName ?? "");
	const [query, setQuery] = useState(office?.address ?? "");
	const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
	// The address the person has confirmed; starts as the saved one when editing.
	const [displayAddress, setDisplayAddress] = useState(office?.address ?? "");
	const [locationPhrase, setLocationPhrase] = useState(
		office?.locationPhrase ?? "",
	);
	const [selected, setSelected] = useState<AddressMatch | null>(
		office?.address
			? {
					formattedAddress: office.address,
					latitude: Number(office.latitude),
					longitude: Number(office.longitude),
					accuracy: 1,
				}
			: null,
	);

	const lookup = api.offices.lookupAddress.useQuery(
		{ query: searchedQuery ?? "" },
		{ enabled: searchedQuery !== null, retry: false },
	);

	const onSaved = (message: string) => {
		void utils.offices.getAll.invalidate();
		toast.success(message);
		onClose();
	};
	const create = api.offices.create.useMutation({
		onSuccess: () => onSaved("Office added"),
		onError: (e) => toast.error(e.message),
	});
	const update = api.offices.update.useMutation({
		onSuccess: () => onSaved("Office updated"),
		onError: (e) => toast.error(e.message),
	});

	const save = () => {
		if (!selected) return;
		const fields = {
			prettyName,
			address: displayAddress.trim(),
			locationPhrase: locationPhrase.trim() || null,
			latitude: selected.latitude,
			longitude: selected.longitude,
		};
		if (office) {
			update.mutate({ key: office.key, ...fields });
		} else {
			create.mutate(fields);
		}
	};

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{office ? "Edit Office" : "Add Office"}</DialogTitle>
					<DialogDescription>
						Search for the street address, then pick the match that is right.
						Closest-office rankings use the confirmed location.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="office-name">Name</Label>
						<Input
							id="office-name"
							onChange={(e) => setPrettyName(e.target.value)}
							value={prettyName}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="office-address">Address</Label>
						<form
							className="flex gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								setSearchedQuery(query.trim());
							}}
						>
							<Input
								id="office-address"
								onChange={(e) => setQuery(e.target.value)}
								placeholder="123 Main St, Charleston, SC 29401"
								value={query}
							/>
							<Button
								disabled={query.trim().length < 5 || lookup.isFetching}
								type="submit"
								variant="outline"
							>
								{lookup.isFetching ? "Searching..." : "Look up"}
							</Button>
						</form>
						{lookup.isError && (
							<p className="text-sm text-destructive">
								Address lookup failed. Try again in a moment.
							</p>
						)}
						{lookup.data?.length === 0 && (
							<p className="text-sm text-muted-foreground">
								No matches. Try adding the city and state.
							</p>
						)}
					</div>

					{lookup.data && lookup.data.length > 0 && (
						<div className="space-y-2">
							{lookup.data.map((match) => (
								<button
									className={cn(
										"w-full rounded-md border p-2 text-left text-sm hover:bg-accent",
										selected?.formattedAddress === match.formattedAddress &&
											"border-primary bg-accent",
									)}
									key={`${match.latitude},${match.longitude}`}
									onClick={() => {
										setSelected(match);
										setDisplayAddress(match.formattedAddress);
									}}
									type="button"
								>
									{match.formattedAddress}
								</button>
							))}
						</div>
					)}

					{selected && (
						<div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
							<p className="font-medium">Confirm this location</p>
							<Label htmlFor="office-display-address">
								Address shown to staff (edit to add a suite or unit)
							</Label>
							<Input
								id="office-display-address"
								onChange={(e) => setDisplayAddress(e.target.value)}
								value={displayAddress}
							/>
							<p className="text-muted-foreground">
								{selected.latitude.toFixed(5)}, {selected.longitude.toFixed(5)}{" "}
								<a
									className="underline"
									href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}#map=17/${selected.latitude}/${selected.longitude}`}
									rel="noreferrer"
									target="_blank"
								>
									View on map
								</a>
							</p>
							{selected.accuracy < LOW_ACCURACY && (
								<p className="text-warning">
									This is an approximate match, not an exact building. Check the
									map before saving.
								</p>
							)}
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="office-phrase">Location phrase for messages</Label>
						<Input
							id="office-phrase"
							onChange={(e) => setLocationPhrase(e.target.value)}
							placeholder="at 123 Main St, Suite 100"
							value={locationPhrase}
						/>
						<p className="text-xs text-muted-foreground">
							Fills $LOCATION in message templates. Include the preposition,
							e.g. "at 123 Main St" or "inside Business Center at 123 Main St".
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button onClick={onClose} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={
							!selected ||
							!displayAddress.trim() ||
							!prettyName.trim() ||
							create.isPending ||
							update.isPending
						}
						onClick={save}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default function OfficesSettings() {
	const utils = api.useUtils();
	const can = useCheckPermission();
	const canManageOffices = can("settings:evaluators");
	// `undefined` is closed, `null` is the add form, an office is the edit form.
	const [editing, setEditing] = useState<Office | null | undefined>(undefined);

	const { data: offices } = api.offices.getAll.useQuery({
		includeArchived: true,
	});
	// Archived offices sink to the bottom, each group alphabetical.
	const sortedOffices = offices?.toSorted(
		(a, b) =>
			Number(a.archived) - Number(b.archived) ||
			a.prettyName.localeCompare(b.prettyName),
	);

	const setArchived = api.offices.setArchived.useMutation({
		onSuccess: (_data, variables) => {
			void utils.offices.getAll.invalidate();
			toast.success(
				variables.archived ? "Office archived" : "Office unarchived",
			);
		},
	});

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-4">
				<div className="space-y-1.5">
					<CardTitle>Offices</CardTitle>
					<CardDescription>
						Archived offices no longer appear in office pickers or count toward
						the closest office. Past appointments and availability keep their
						office.
					</CardDescription>
				</div>
				<Button disabled={!canManageOffices} onClick={() => setEditing(null)}>
					Add Office
				</Button>
			</CardHeader>
			<CardContent className="space-y-3">
				{sortedOffices?.map((office) => (
					<div
						className={cn(
							"flex items-center justify-between gap-4",
							office.archived && "opacity-60",
						)}
						key={office.key}
					>
						<div>
							<span className="flex items-center gap-2">
								{office.prettyName}
								{office.archived && <Badge variant="outline">Archived</Badge>}
							</span>
							<span className="block text-sm text-muted-foreground">
								{office.address ?? "No address on file"}
							</span>
							<span className="block text-sm text-muted-foreground italic">
								{office.locationPhrase ?? "No message phrase"}
							</span>
						</div>
						<div className="flex gap-2">
							<Button
								disabled={!canManageOffices}
								onClick={() => setEditing(office)}
								size="sm"
								variant="outline"
							>
								Edit
							</Button>
							<Button
								disabled={!canManageOffices || setArchived.isPending}
								onClick={() =>
									setArchived.mutate({
										key: office.key,
										archived: !office.archived,
									})
								}
								size="sm"
								variant="outline"
							>
								{office.archived ? "Unarchive" : "Archive"}
							</Button>
						</div>
					</div>
				))}
			</CardContent>
			{editing !== undefined && (
				<OfficeDialog office={editing} onClose={() => setEditing(undefined)} />
			)}
		</Card>
	);
}

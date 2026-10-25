"use client";

import { ClientInfoCard } from "@components/client/ClientInfoCard";
import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import { useClientCardFields } from "~/hooks/use-client-card-fields";
import {
	CLIENT_CARD_FIELD_IDS,
	CLIENT_CARD_FIELDS,
	CLIENT_CARD_GROUPS,
	type ClientCardFieldId,
	type ClientCardSummary,
} from "~/lib/clients/client-card";

const SAMPLE_CLIENT: ClientCardSummary = {
	id: 0,
	fullName: "Sample Client",
	dob: "2020-03-14",
	gender: "Female",
	language: "English",
	asdAdhd: "ASD",
	phoneNumber: "8435550123",
	email: "parent@example.com",
	address: "123 Main St, Charleston, SC 29401",
	schoolDistrict: "Charleston County",
	primaryInsurance: "Example_Health",
	secondaryInsurance: ["Example_Secondary"],
	precertExpires: "2027-01-31",
	privatePay: false,
	outstandingBalance: 42.5,
	addedDate: "2026-09-01",
	highPriority: true,
	babyNet: false,
	pause: false,
	autismStop: false,
	pendingQuestionnaires: 2,
	nextAppointment: {
		startTime: new Date("2026-11-12T15:00:00Z"),
		evaluatorName: "Sample Evaluator",
		officeName: "Main Office",
	},
};

export function ClientCardPreferences() {
	const { fields, isLoading, setFields } = useClientCardFields();

	if (isLoading || !fields) return null;

	const toggle = (id: ClientCardFieldId, checked: boolean) => {
		const next = new Set(fields);
		if (checked) {
			next.add(id);
		} else {
			next.delete(id);
		}
		setFields(CLIENT_CARD_FIELD_IDS.filter((fieldId) => next.has(fieldId)));
	};

	return (
		<div className="flex flex-col gap-4">
			<p className="text-muted-foreground text-sm">
				Hover a client's name in lists, dashboards, and schedules to see a small
				card of their info without opening the client page. Choose what it
				shows. Turn every field off to disable the card.
			</p>
			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div className="flex flex-col gap-4">
					{CLIENT_CARD_GROUPS.map((group) => (
						<div className="flex flex-col gap-1" key={group}>
							<p className="px-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{group}
							</p>
							{CLIENT_CARD_FIELDS.filter((field) => field.group === group).map(
								(field) => (
									<div
										className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
										key={field.id}
									>
										<Checkbox
											checked={fields.includes(field.id)}
											id={`client-card-${field.id}`}
											onCheckedChange={(value) =>
												toggle(field.id, value === true)
											}
										/>
										<Label
											className="flex-1 cursor-pointer font-normal text-sm"
											htmlFor={`client-card-${field.id}`}
										>
											{field.label}
										</Label>
									</div>
								),
							)}
						</div>
					))}
				</div>
				<div className="flex flex-col gap-2">
					<p className="font-medium text-sm">Preview</p>
					<div className="w-72 max-w-full rounded-lg bg-popover p-3 text-popover-foreground text-sm shadow-md ring-1 ring-foreground/10">
						<ClientInfoCard client={SAMPLE_CLIENT} fields={fields} />
					</div>
					<p className="text-muted-foreground text-xs">
						Sample data. A real card leaves out fields a client has no value
						for.
					</p>
				</div>
			</div>
		</div>
	);
}

"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "~/lib/utils";
import { Button } from "@ui/button";
import { Calendar } from "@ui/calendar";
import { Input } from "@ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";

interface DateTimePickerProps {
	value?: Date;
	onChange: (date: Date) => void;
	disabled?: boolean;
	hideTime?: boolean;
	minDate?: Date;
}

const DateTimePicker: React.FC<DateTimePickerProps> = ({
	value,
	onChange,
	disabled,
	hideTime,
	minDate,
}) => {
	const [open, setOpen] = React.useState(false);

	const timeString = value ? format(value, "HH:mm:ss") : "00:00:00";

	// --- Handlers ---
	const handleDateSelect = (date: Date | undefined) => {
		if (date) {
			const timeParts = timeString.split(":");
			const hours = parseInt(timeParts[0] || "0", 10);
			const minutes = parseInt(timeParts[1] || "0", 10);
			const seconds = parseInt(timeParts[2] || "0", 10);

			const newDate = new Date(date);
			newDate.setHours(hours, minutes, seconds);
			onChange(newDate);
			setOpen(false);
		}
	};

	const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newTime = e.target.value;
		const timeParts = newTime.split(":").map((p) => parseInt(p, 10));

		const hours = timeParts[0] || 0;
		const minutes = timeParts[1] || 0;
		const seconds = timeParts[2] || 0;

		const dateToModify = value ? new Date(value) : new Date();
		dateToModify.setHours(hours, minutes, seconds);
		onChange(dateToModify);
	};

	const displayValue = value ? format(value, "PP") : "Pick a date";

	return (
		<div className="flex w-full flex-row gap-2">
			{/* Date Picker (Calendar) */}
			<Popover onOpenChange={setOpen} open={open}>
				<PopoverTrigger asChild>
					<Button
						className={cn(
							"w-auto min-w-32 grow justify-start text-left font-normal",
							!value && "text-muted-foreground",
						)}
						disabled={disabled}
						variant="outline"
					>
						<CalendarIcon className="mr-2 h-4 w-4" />
						{displayValue}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-auto p-0">
					<Calendar
						autoFocus
						captionLayout="dropdown"
						disabled={minDate ? (date) => date < minDate : undefined}
						mode="single"
						onSelect={handleDateSelect}
						selected={value}
						defaultMonth={minDate}
					/>
				</PopoverContent>
			</Popover>

			{/* Time Input */}
			{!hideTime && (
				<Input
					className="w-auto min-w-24 shrink-0"
					disabled={disabled}
					onChange={handleTimeChange}
					step="60"
					type="time"
					value={timeString.substring(0, 5)}
				/>
			)}
		</div>
	);
};

export default DateTimePicker;

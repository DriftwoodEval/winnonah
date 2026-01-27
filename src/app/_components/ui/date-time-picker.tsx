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
}

const DateTimePicker: React.FC<DateTimePickerProps> = ({
	value,
	onChange,
	disabled,
	hideTime,
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
		const timeParts = newTime.split(":").map(p => parseInt(p, 10));

		const hours = timeParts[0] || 0;
		const minutes = timeParts[1] || 0;
		const seconds = timeParts[2] || 0;

		const dateToModify = value ? new Date(value) : new Date();
		dateToModify.setHours(hours, minutes, seconds);
		onChange(dateToModify);
	};

	const displayValue = value ? format(value, "PP") : "Pick a date";

	return (
		<div className="flex flex-row gap-2 w-full">
			{/* Date Picker (Calendar) */}
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						className={cn(
							"w-auto min-w-32 justify-start text-left font-normal flex-grow",
							!value && "text-muted-foreground",
						)}
						disabled={disabled}
					>
						<CalendarIcon className="mr-2 h-4 w-4" />
						{displayValue}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-auto p-0" align="start">
					<Calendar
						mode="single"
						selected={value}
						onSelect={handleDateSelect}
						autoFocus
						captionLayout="dropdown"
					/>
				</PopoverContent>
			</Popover>

			{/* Time Input */}
			{!hideTime && (
				<Input
					type="time"
					value={timeString.substring(0, 5)}
					onChange={handleTimeChange}
					step="60"
					className="w-auto min-w-24 flex-shrink-0"
					disabled={disabled}
				/>
			)}
		</div>
	);
};

export default DateTimePicker;

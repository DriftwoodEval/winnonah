"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { addYears, format, parse, isValid, startOfDay } from "date-fns";
import { Calendar } from "@ui/calendar";
import { Input } from "@ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "./input-group";

interface DateTimePickerProps {
	value?: Date;
	onChange: (date: Date) => void;
	disabled?: boolean;
	hideTime?: boolean;
	minDate?: Date;
	startMonth?: Date;
	endMonth?: Date;
}

const DATE_FORMAT = "MM/dd/yy";

// The calendar's month/year caption uses native <select> dropdowns. On some
// browsers/platforms, interacting with the OS-native option list is reported
// to Radix as an "outside" interaction, closing the whole popover before a
// selection can be made. Ignore those so only real outside clicks dismiss it.
function ignoreNativeSelectInteraction(event: {
  target: EventTarget | null;
  preventDefault: () => void;
}) {
  if (event.target instanceof HTMLSelectElement) {
    event.preventDefault();
  }
}

const DateTimePicker: React.FC<DateTimePickerProps> = ({
	value,
	onChange,
	disabled,
	hideTime,
	minDate,
	startMonth,
	endMonth,
}) => {
	const [open, setOpen] = React.useState(false);

	const [inputValue, setInputValue] = React.useState(value ? format(value, DATE_FORMAT) : "");

	React.useEffect(() => {
    if (value) {
      setInputValue(format(value, DATE_FORMAT));
    } else {
      setInputValue("");
    }
  }, [value]);

	// Helper to get current time parts to avoid resetting time when date changes
  const getTimeParts = () => {
    if (!value) return { h: 12, m: 0 };
    return { h: value.getHours(), m: value.getMinutes() };
  };

	const handleDateTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputValue(text);

    // parse() creates a date object based on the format string
    const parsedDate = parse(text, DATE_FORMAT, new Date());

    if (isValid(parsedDate)) {
      // Don't update if it's before minDate. Compare by day only, since
      // minDate carries a time-of-day and same-day selections are valid.
      if (minDate && startOfDay(parsedDate) < startOfDay(minDate)) return;

      // Preserve the existing time when typing a new date
      const { h, m } = getTimeParts();
      parsedDate.setHours(h, m, 0);

      onChange(parsedDate);
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      const { h, m } = getTimeParts();
      const newDate = new Date(date);
      newDate.setHours(h, m, 0);

      setInputValue(format(newDate, DATE_FORMAT));
      onChange(newDate);
      setOpen(false);
    }
  };

  const handleDateBlur = () => {
    const parsed = parse(inputValue, DATE_FORMAT, new Date());
    if (
      !isValid(parsed) ||
      (minDate && startOfDay(parsed) < startOfDay(minDate))
    ) {
      setInputValue(value ? format(value, DATE_FORMAT) : "");
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const timeValue = e.target.value; // Expected "HH:mm"
  if (!timeValue) return;

  const [hoursStr, minutesStr] = timeValue.split(":");
  const hours = parseInt(hoursStr ?? "0", 10);
  const minutes = parseInt(minutesStr ?? "0", 10);

  const dateToModify = value ? new Date(value) : new Date();

  dateToModify.setHours(hours, minutes, 0);
  onChange(dateToModify);
};

	return (
    <div className="flex w-full flex-row gap-2">
      <InputGroup className="grow">
        <InputGroupInput
          placeholder="MM/DD/YYYY"
          value={inputValue}
          onChange={handleDateTyping}
          onBlur={handleDateBlur}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
            }
          }}
        />
        <InputGroupAddon align="inline-end">
          <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
              <InputGroupButton
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                aria-label="Open calendar"
              >
                <CalendarIcon className="h-4 w-4" />
              </InputGroupButton>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              sideOffset={4}
              className="w-auto p-0"
              onFocusOutside={ignoreNativeSelectInteraction}
              onPointerDownOutside={ignoreNativeSelectInteraction}
            >
              <Calendar
                mode="single"
                disabled={
                  minDate
                    ? (date) => startOfDay(date) < startOfDay(minDate)
                    : undefined
                }
                onSelect={handleCalendarSelect}
                selected={value}
                defaultMonth={value || minDate || new Date()}
                autoFocus
								captionLayout="dropdown"
								startMonth={startMonth}
								endMonth={endMonth ?? addYears(new Date(), 10)}
              />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      </InputGroup>

      {!hideTime && (
        <Input
          className="w-auto min-w-[120px] shrink-0"
          disabled={disabled}
          onChange={handleTimeChange}
          type="time"
          // Formats the Date object to HH:mm for the native input
          value={value ? format(value, "HH:mm") : ""}
        />
      )}
    </div>
  );
};

export default DateTimePicker;

"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { Button } from "@ui/button"
import { Calendar } from "@ui/calendar"
import { Label } from "@ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ui/popover"
import { format } from "date-fns"

interface DatePickerProps {
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  labelText: string
  id?: string
}

export function DatePicker({
  value: selectedDate,
  onChange,
  labelText,
  id = 'date-field',
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="font-medium text-sm leading-none">
        {labelText}
      </Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            id={id}
            className="w-48 justify-between font-normal"
          >
            {selectedDate ? format(selectedDate, "PP") : "Select date"}
            <ChevronDownIcon className="ml-2 h-4 w-4" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            captionLayout="label"
            onSelect={(date) => {
              onChange(date)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

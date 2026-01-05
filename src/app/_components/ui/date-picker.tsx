"use client";

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
import { cn } from "~/lib/utils"

interface DatePickerProps {
  id: string
  date: Date | undefined
  setDate: (date: Date | undefined) => void
  label?: string
  disabled?: boolean
  allowClear?: boolean
  placeholder?: string
  flexDirection?: "flex-col" | "flex-row"
}

export function DatePicker({
  id,
  date,
  setDate,
  label,
  disabled = false,
  allowClear = false,
  placeholder = "Select date",
  flexDirection = "flex-col",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className={`flex ${flexDirection} gap-2`}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            id={id}
            className={cn("max-w-32 justify-between font-normal", !date && "text-muted-foreground")}
            disabled={disabled}
          >
            {date ? date.toLocaleDateString() : placeholder}
            <ChevronDownIcon />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(selectedDate) => {
              let newDate = selectedDate;

              if (allowClear && date && selectedDate) {
                const isSameDay = date.getFullYear() === selectedDate.getFullYear() && date.getMonth() === selectedDate.getMonth() && date.getDate() === selectedDate.getDate();
                if (isSameDay) {
                  newDate = undefined;
                }
              }

              setDate(newDate)
              setOpen(false)
            }}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

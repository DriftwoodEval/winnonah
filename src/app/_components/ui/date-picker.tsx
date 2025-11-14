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
import { cn } from "~/lib/utils"

interface DatePickerProps {
  label: string
  id: string
  date: Date | undefined
  setDate: (date: Date | undefined) => void
  disabled?: boolean
  placeholder?: string
  flexDirection?: "flex-col" | "flex-row"
}

export function DatePicker({
  label,
  id,
  date,
  setDate,
  disabled = false,
  placeholder = "Select date",
  flexDirection = "flex-col",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <div className={`flex ${flexDirection} gap-2`}>
      <Label htmlFor={id}>
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            id={id}
            className={cn("w-48 justify-between font-normal", !date && "text-muted-foreground")}
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
              setDate(selectedDate)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

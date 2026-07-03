"use client";

import { Button } from "@ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Separator } from "@ui/separator";
import { ArrowDown, ArrowUp, Settings, X } from "lucide-react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import {
	getWidgetDefaults,
	HOME_WIDGET_DEFS,
	WIDGET_CATEGORY_LABELS,
	type WidgetCategory,
	type WidgetConfig,
} from "~/lib/home-widgets";

interface HomeCustomizerProps {
	widgets: WidgetConfig[];
	onChange: (widgets: WidgetConfig[]) => void;
}

export function HomeCustomizer({ widgets, onChange }: HomeCustomizerProps) {
	const can = useCheckPermission();

	const availableToAdd = HOME_WIDGET_DEFS.filter(
		(def) =>
			!widgets.some((w) => w.id === def.id) &&
			(def.permission === null || can(def.permission)),
	);

	const addWidget = (id: string) => {
		onChange([...widgets, { id, ...getWidgetDefaults(id) }]);
	};

	const removeWidget = (id: string) => {
		onChange(widgets.filter((w) => w.id !== id));
	};

	const moveWidget = (id: string, dir: -1 | 1) => {
		const idx = widgets.findIndex((w) => w.id === id);
		if (idx === -1) return;
		const next = idx + dir;
		if (next < 0 || next >= widgets.length) return;
		const updated = [...widgets];
		const tmp = updated[idx];
		updated[idx] = updated[next] as WidgetConfig;
		updated[next] = tmp as WidgetConfig;
		onChange(updated);
	};

	const updateWidget = (
		id: string,
		patch: Partial<Pick<WidgetConfig, "cols" | "rows">>,
	) => {
		onChange(widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)));
	};

	const labelFor = (id: string) =>
		HOME_WIDGET_DEFS.find((d) => d.id === id)?.label ?? id;

	const defFor = (id: string) => HOME_WIDGET_DEFS.find((d) => d.id === id);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button size="icon" title="Customize home page" variant="outline">
					<Settings className="h-4 w-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80">
				<div className="max-h-[70vh] space-y-3 overflow-y-auto">
					<p className="font-medium text-sm">Home Page Widgets</p>

					<div className="space-y-2">
						{widgets.map((w, idx) => (
							<div className="rounded-md border bg-muted/40 p-2" key={w.id}>
								<div className="mb-2 flex items-center justify-between gap-2">
									<span className="flex-1 font-medium text-sm">
										{labelFor(w.id)}
									</span>
									<div className="flex items-center gap-0.5">
										<Button
											disabled={idx === 0}
											onClick={() => moveWidget(w.id, -1)}
											size="icon-sm"
											variant="ghost"
										>
											<ArrowUp className="h-3 w-3" />
										</Button>
										<Button
											disabled={idx === widgets.length - 1}
											onClick={() => moveWidget(w.id, 1)}
											size="icon-sm"
											variant="ghost"
										>
											<ArrowDown className="h-3 w-3" />
										</Button>
										<Button
											onClick={() => removeWidget(w.id)}
											size="icon-sm"
											variant="ghost"
										>
											<X className="h-3 w-3" />
										</Button>
									</div>
								</div>
								<div className="flex items-center gap-4 text-muted-foreground text-xs">
									<div className="flex items-center gap-1">
										<span>W:</span>
										<Button
											className="h-5 w-5"
											disabled={w.cols <= 1}
											onClick={() => updateWidget(w.id, { cols: w.cols - 1 })}
											size="icon-sm"
											variant="outline"
										>
											−
										</Button>
										<span className="w-3 text-center text-foreground">
											{w.cols}
										</span>
										<Button
											className="h-5 w-5"
											disabled={w.cols >= 4}
											onClick={() => updateWidget(w.id, { cols: w.cols + 1 })}
											size="icon-sm"
											variant="outline"
										>
											+
										</Button>
									</div>
									{!defFor(w.id)?.fixedRows && (
										<div className="flex items-center gap-1">
											<span>H:</span>
											<Button
												className="h-5 w-5"
												disabled={w.rows <= 1}
												onClick={() => updateWidget(w.id, { rows: w.rows - 1 })}
												size="icon-sm"
												variant="outline"
											>
												−
											</Button>
											<span className="w-3 text-center text-foreground">
												{w.rows}
											</span>
											<Button
												className="h-5 w-5"
												disabled={w.rows >= 4}
												onClick={() => updateWidget(w.id, { rows: w.rows + 1 })}
												size="icon-sm"
												variant="outline"
											>
												+
											</Button>
										</div>
									)}
								</div>
							</div>
						))}
					</div>

					{availableToAdd.length > 0 && (
						<>
							<Separator />
							<p className="text-muted-foreground text-xs">Add widgets</p>
							{(Object.keys(WIDGET_CATEGORY_LABELS) as WidgetCategory[]).map(
								(cat) => {
									const defs = availableToAdd.filter((d) => d.category === cat);
									if (defs.length === 0) return null;
									return (
										<div className="space-y-1" key={cat}>
											<p className="px-2 font-medium text-muted-foreground text-xs">
												{WIDGET_CATEGORY_LABELS[cat]}
											</p>
											{defs.map((def) => (
												<button
													className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
													key={def.id}
													onClick={() => addWidget(def.id)}
													type="button"
												>
													<span className="text-muted-foreground">+</span>
													{def.label}
												</button>
											))}
										</div>
									);
								},
							)}
						</>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

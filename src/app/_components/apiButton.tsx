"use client";

import { Button } from "~/app/_components/ui/button";
import { api } from "~/trpc/react";
import { Spinner } from "./ui/spinner";

export function ApiButton({
	age,
	type,
	daeval,
}: { age: number; type: string; daeval: string }) {
	const mutation = api.python.testEndpoint.useMutation();

	const handleButton = () => {
		mutation.mutate({ age, type, daeval });
	};
	return (
		<div>
			<Button onClick={handleButton} disabled={mutation.isPending}>
				Get Q List{" "}
				{mutation.isPending && <Spinner className="text-primary-foreground" />}
			</Button>
			{mutation.data && <div>{JSON.stringify(mutation.data)}</div>}
		</div>
	);
}

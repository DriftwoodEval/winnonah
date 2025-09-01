import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@ui/button";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@ui/form";
import { Input } from "@ui/input";
import { last } from "lodash";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";
import { logger } from "~/lib/logger";
import { api } from "~/trpc/react";

const log = logger.child({ module: "ClientCreateForm" });

const formSchema = z.object({
	firstName: z.string().min(1, "First name is required"),
	lastName: z.string().min(1, "Last name is required"),
});

type ClientCreateFormValues = z.infer<typeof formSchema>;

export default function ClientCreateForm() {
	const router = useRouter();
	const form = useForm<ClientCreateFormValues>({
		resolver: zodResolver(formSchema),
	});

	const createClientMutation = api.clients.createShell.useMutation({
		onSuccess: (data) => {
			router.push(`/clients/${data}`);
		},
		onError: (error) => {
			log.error(error, "Failed to create client");
			toast.error("Failed to create client", {
				description: String(error.message),
			});
		},
	});

	function onSubmit(values: ClientCreateFormValues) {
		createClientMutation.mutate({
			firstName: values.firstName,
			lastName: values.lastName,
		});
	}
	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				<div className="flex flex-col justify-between gap-2 sm:flex-row">
					<FormField
						control={form.control}
						name="firstName"
						render={({ field }) => (
							<FormItem>
								<FormLabel>First Name</FormLabel>
								<Input placeholder="Jay" {...field} />
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="lastName"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Last Name</FormLabel>
								<Input placeholder="Doe" {...field} />
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>

				<Button>Save</Button>
			</form>
		</Form>
	);
}

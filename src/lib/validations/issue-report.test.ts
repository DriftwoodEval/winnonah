import { describe, expect, it } from "vitest";
import { issueReportSubmissionSchema } from "./config";

const base = {
	subject: "Subject",
	body: "Body",
	priority: "Medium",
	ccEmails: [],
	screenshots: [],
};

describe("issueReportSubmissionSchema", () => {
	it("requires a screenshot for bugs", () => {
		expect(
			issueReportSubmissionSchema.safeParse({ ...base, type: "bug" }).success,
		).toBe(false);
	});

	it("allows a feature request without a screenshot", () => {
		expect(
			issueReportSubmissionSchema.safeParse({ ...base, type: "feature" })
				.success,
		).toBe(true);
	});
});

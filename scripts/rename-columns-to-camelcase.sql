-- Standardize snake_case columns to camelCase, matching the majority
-- convention already used elsewhere in the schema (see schema.ts changes
-- in the same PR). Run this BEFORE `pnpm db:push`, so push sees no diff
-- to reconcile -- db:push's rename-detection prompt is interactive and
-- risks a DROP+ADD (data loss) instead of a rename if misread.

-- emr_appointment
ALTER TABLE `emr_appointment` RENAME COLUMN `last_task_completed_date` TO `lastTaskCompletedDate`;
ALTER TABLE `emr_appointment` RENAME COLUMN `due_date_override` TO `dueDateOverride`;
ALTER TABLE `emr_appointment` RENAME COLUMN `report_completed_at` TO `reportCompletedAt`;
ALTER TABLE `emr_appointment` RENAME COLUMN `report_completed_by_email` TO `reportCompletedByEmail`;
ALTER TABLE `emr_appointment` RENAME COLUMN `evaluator_dashboard_archived_at` TO `evaluatorDashboardArchivedAt`;
ALTER TABLE `emr_appointment` RENAME COLUMN `evaluator_dashboard_show_anyway` TO `evaluatorDashboardShowAnyway`;

-- emr_appointment_checkin
ALTER TABLE `emr_appointment_checkin` RENAME COLUMN `arrived_at` TO `arrivedAt`;
ALTER TABLE `emr_appointment_checkin` RENAME COLUMN `arrived_by` TO `arrivedBy`;
ALTER TABLE `emr_appointment_checkin` RENAME COLUMN `arrived_note` TO `arrivedNote`;
ALTER TABLE `emr_appointment_checkin` RENAME COLUMN `started_at` TO `startedAt`;
ALTER TABLE `emr_appointment_checkin` RENAME COLUMN `started_by` TO `startedBy`;
ALTER TABLE `emr_appointment_checkin` RENAME COLUMN `started_note` TO `startedNote`;
ALTER TABLE `emr_appointment_checkin` RENAME COLUMN `left_at` TO `leftAt`;
ALTER TABLE `emr_appointment_checkin` RENAME COLUMN `left_by` TO `leftBy`;
ALTER TABLE `emr_appointment_checkin` RENAME COLUMN `left_note` TO `leftNote`;
ALTER TABLE `emr_appointment_checkin` RENAME COLUMN `updated_at` TO `updatedAt`;

-- emr_appointment_note
ALTER TABLE `emr_appointment_note` RENAME COLUMN `created_at` TO `createdAt`;
ALTER TABLE `emr_appointment_note` RENAME COLUMN `updated_at` TO `updatedAt`;
ALTER TABLE `emr_appointment_note` RENAME COLUMN `updated_by` TO `updatedBy`;

-- emr_appointment_note_history
ALTER TABLE `emr_appointment_note_history` RENAME COLUMN `updated_by` TO `updatedBy`;
ALTER TABLE `emr_appointment_note_history` RENAME COLUMN `created_at` TO `createdAt`;

-- emr_assessment_type
ALTER TABLE `emr_assessment_type` RENAME COLUMN `in_person` TO `inPerson`;

-- emr_client
ALTER TABLE `emr_client` RENAME COLUMN `qual_category` TO `qualCategory`;
ALTER TABLE `emr_client` RENAME COLUMN `payment_category` TO `paymentCategory`;
ALTER TABLE `emr_client` RENAME COLUMN `session_started_at` TO `sessionStartedAt`;
ALTER TABLE `emr_client` RENAME COLUMN `pa_assigned_to` TO `paAssignedTo`;
ALTER TABLE `emr_client` RENAME COLUMN `assessment_data` TO `assessmentData`;

-- emr_client_dashboard_section_history
ALTER TABLE `emr_client_dashboard_section_history` RENAME COLUMN `created_at` TO `createdAt`;

-- emr_evaluator
ALTER TABLE `emr_evaluator` RENAME COLUMN `evaluator_dashboard` TO `evaluatorDashboard`;

-- emr_evaluator_checkin
ALTER TABLE `emr_evaluator_checkin` RENAME COLUMN `arrived_at` TO `arrivedAt`;
ALTER TABLE `emr_evaluator_checkin` RENAME COLUMN `arrived_by` TO `arrivedBy`;
ALTER TABLE `emr_evaluator_checkin` RENAME COLUMN `arrived_note` TO `arrivedNote`;
ALTER TABLE `emr_evaluator_checkin` RENAME COLUMN `left_at` TO `leftAt`;
ALTER TABLE `emr_evaluator_checkin` RENAME COLUMN `left_by` TO `leftBy`;
ALTER TABLE `emr_evaluator_checkin` RENAME COLUMN `left_note` TO `leftNote`;
ALTER TABLE `emr_evaluator_checkin` RENAME COLUMN `updated_at` TO `updatedAt`;

-- emr_external_record
ALTER TABLE `emr_external_record` RENAME COLUMN `created_at` TO `createdAt`;
ALTER TABLE `emr_external_record` RENAME COLUMN `updated_at` TO `updatedAt`;
ALTER TABLE `emr_external_record` RENAME COLUMN `updated_by` TO `updatedBy`;

-- emr_external_record_history
ALTER TABLE `emr_external_record_history` RENAME COLUMN `updated_by` TO `updatedBy`;
ALTER TABLE `emr_external_record_history` RENAME COLUMN `created_at` TO `createdAt`;

-- emr_external_record_request
ALTER TABLE `emr_external_record_request` RENAME COLUMN `hold_until` TO `holdUntil`;
ALTER TABLE `emr_external_record_request` RENAME COLUMN `custom_message` TO `customMessage`;
ALTER TABLE `emr_external_record_request` RENAME COLUMN `created_at` TO `createdAt`;
ALTER TABLE `emr_external_record_request` RENAME COLUMN `created_by` TO `createdBy`;

-- emr_failure
ALTER TABLE `emr_failure` RENAME COLUMN `updated_at` TO `updatedAt`;

-- emr_fax_categorization
ALTER TABLE `emr_fax_categorization` RENAME COLUMN `drive_file_id` TO `driveFileId`;
ALTER TABLE `emr_fax_categorization` RENAME COLUMN `file_name` TO `fileName`;
ALTER TABLE `emr_fax_categorization` RENAME COLUMN `discovered_at` TO `discoveredAt`;
ALTER TABLE `emr_fax_categorization` RENAME COLUMN `llm_category` TO `llmCategory`;
ALTER TABLE `emr_fax_categorization` RENAME COLUMN `extracted_text` TO `extractedText`;
ALTER TABLE `emr_fax_categorization` RENAME COLUMN `llm_raw_output` TO `llmRawOutput`;
ALTER TABLE `emr_fax_categorization` RENAME COLUMN `reviewed_at` TO `reviewedAt`;
ALTER TABLE `emr_fax_categorization` RENAME COLUMN `reviewed_by` TO `reviewedBy`;
ALTER TABLE `emr_fax_categorization` RENAME COLUMN `reprocess_requested_at` TO `reprocessRequestedAt`;
ALTER TABLE `emr_fax_categorization` RENAME COLUMN `last_reprocessed_at` TO `lastReprocessedAt`;

-- emr_fax_categorization_client_link
ALTER TABLE `emr_fax_categorization_client_link` RENAME COLUMN `fax_categorization_id` TO `faxCategorizationId`;
ALTER TABLE `emr_fax_categorization_client_link` RENAME COLUMN `client_id` TO `clientId`;
ALTER TABLE `emr_fax_categorization_client_link` RENAME COLUMN `matched_name` TO `matchedName`;
ALTER TABLE `emr_fax_categorization_client_link` RENAME COLUMN `created_at` TO `createdAt`;
ALTER TABLE `emr_fax_categorization_client_link` RENAME COLUMN `reviewed_by` TO `reviewedBy`;

-- emr_in_person_assessment
ALTER TABLE `emr_in_person_assessment` RENAME COLUMN `updated_at` TO `updatedAt`;

-- emr_in_person_assessment_history
ALTER TABLE `emr_in_person_assessment_history` RENAME COLUMN `created_at` TO `createdAt`;

-- emr_insurance_review
ALTER TABLE `emr_insurance_review` RENAME COLUMN `claimed_user_email` TO `claimedUserEmail`;
ALTER TABLE `emr_insurance_review` RENAME COLUMN `created_at` TO `createdAt`;
ALTER TABLE `emr_insurance_review` RENAME COLUMN `updated_at` TO `updatedAt`;
ALTER TABLE `emr_insurance_review` RENAME COLUMN `updated_by` TO `updatedBy`;
ALTER TABLE `emr_insurance_review` RENAME COLUMN `submitted_to_notes_at` TO `submittedToNotesAt`;

-- emr_insurance_review_history
ALTER TABLE `emr_insurance_review_history` RENAME COLUMN `updated_by` TO `updatedBy`;
ALTER TABLE `emr_insurance_review_history` RENAME COLUMN `created_at` TO `createdAt`;

-- emr_invitation
ALTER TABLE `emr_invitation` RENAME COLUMN `role_id` TO `roleId`;
ALTER TABLE `emr_invitation` RENAME COLUMN `created_at` TO `createdAt`;

-- emr_note
ALTER TABLE `emr_note` RENAME COLUMN `created_at` TO `createdAt`;
ALTER TABLE `emr_note` RENAME COLUMN `updated_at` TO `updatedAt`;
ALTER TABLE `emr_note` RENAME COLUMN `updated_by` TO `updatedBy`;

-- emr_note_history
ALTER TABLE `emr_note_history` RENAME COLUMN `updated_by` TO `updatedBy`;
ALTER TABLE `emr_note_history` RENAME COLUMN `created_at` TO `createdAt`;

-- emr_piecework_report_tracking
ALTER TABLE `emr_piecework_report_tracking` RENAME COLUMN `writer_email` TO `writerEmail`;
ALTER TABLE `emr_piecework_report_tracking` RENAME COLUMN `tracked_date` TO `trackedDate`;

-- emr_python_config
ALTER TABLE `emr_python_config` RENAME COLUMN `updated_at` TO `updatedAt`;

-- emr_questionnaire
ALTER TABLE `emr_questionnaire` RENAME COLUMN `updated_at` TO `updatedAt`;

-- emr_questionnaire_rule
ALTER TABLE `emr_questionnaire_rule` RENAME COLUMN `in_person_assessments` TO `inPersonAssessments`;

-- emr_report_queue_config
ALTER TABLE `emr_report_queue_config` RENAME COLUMN `default_max_claimed_reports` TO `defaultMaxClaimedReports`;

-- emr_role
ALTER TABLE `emr_role` RENAME COLUMN `is_default` TO `isDefault`;
ALTER TABLE `emr_role` RENAME COLUMN `created_at` TO `createdAt`;
ALTER TABLE `emr_role` RENAME COLUMN `updated_at` TO `updatedAt`;

-- emr_scheduling_client
ALTER TABLE `emr_scheduling_client` RENAME COLUMN `created_at` TO `createdAt`;

-- emr_seen_report_folders
ALTER TABLE `emr_seen_report_folders` RENAME COLUMN `notified_at` TO `notifiedAt`;

-- emr_task
ALTER TABLE `emr_task` RENAME COLUMN `progress_current` TO `progressCurrent`;
ALTER TABLE `emr_task` RENAME COLUMN `progress_total` TO `progressTotal`;
ALTER TABLE `emr_task` RENAME COLUMN `started_at` TO `startedAt`;
ALTER TABLE `emr_task` RENAME COLUMN `completed_at` TO `completedAt`;

-- emr_user
ALTER TABLE `emr_user` RENAME COLUMN `role_id` TO `roleId`;
ALTER TABLE `emr_user` RENAME COLUMN `claimed_report_folder` TO `claimedReportFolder`;
ALTER TABLE `emr_user` RENAME COLUMN `max_claimed_reports` TO `maxClaimedReports`;
ALTER TABLE `emr_user` RENAME COLUMN `phone_number` TO `phoneNumber`;
ALTER TABLE `emr_user` RENAME COLUMN `recent_clients` TO `recentClients`;
ALTER TABLE `emr_user` RENAME COLUMN `home_widgets` TO `homeWidgets`;
ALTER TABLE `emr_user` RENAME COLUMN `header_items` TO `headerItems`;
ALTER TABLE `emr_user` RENAME COLUMN `last_seen_changelog_marker` TO `lastSeenChangelogMarker`;
ALTER TABLE `emr_user` RENAME COLUMN `blocked_evaluator_npis` TO `blockedEvaluatorNpis`;

-- emr_work_summary_config
ALTER TABLE `emr_work_summary_config` RENAME COLUMN `evaluator_dashboard_due_date_weeks` TO `evaluatorDashboardDueDateWeeks`;
ALTER TABLE `emr_work_summary_config` RENAME COLUMN `evaluator_dashboard_show_mark_complete` TO `evaluatorDashboardShowMarkComplete`;

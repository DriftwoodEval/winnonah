from datetime import datetime
from typing import Final

# Faxes discovered in the Drive folder before this date are ignored, so the
# rollout doesn't churn through every fax ever received.
FAX_CATEGORIZATION_START_DATE: Final = datetime(2026, 8, 5)

# Single source of truth for the practice's timezone. Used to convert stored
# UTC instants to/from the business's wall-clock time for display and for
# business-hour logic (quiet windows, daily send gates, etc).
BUSINESS_TIMEZONE: Final = "America/New_York"

TEST_NAMES: Final = [
    "Testman Testson",
    "Testman Testson Jr.",
    "Johnny Smonny",
    "Johnny Smonathan",
    "Test Mctest",
    "Test Test",
    "Testing Test",
    "Johnny Test",
    "Barbara Steele",
    "Karen Aston",
    "Test Testerson",
]
TEST_NAMES_LOWER: Final = {n.lower() for n in TEST_NAMES}

# Table Names
TABLE_CLIENT: Final = "emr_client"
TABLE_APPOINTMENT: Final = "emr_appointment"
TABLE_EVALUATOR: Final = "emr_evaluator"
TABLE_SCHOOL_DISTRICT: Final = "emr_school_district"
TABLE_BLOCKED_SCHOOL_DISTRICT: Final = "emr_blocked_school_district"
TABLE_ZIP_CODE: Final = "emr_zip_code"
TABLE_BLOCKED_ZIP_CODE: Final = "emr_blocked_zip_code"
TABLE_INSURANCE: Final = "emr_insurance"
TABLE_INSURANCE_ALIAS: Final = "emr_insurance_alias"
TABLE_EVALUATORS_TO_INSURANCES: Final = "emr_evaluators_to_insurances"
TABLE_OFFICE: Final = "emr_office"
TABLE_USER: Final = "emr_user"
TABLE_ACCOUNT: Final = "emr_account"
TABLE_SESSION: Final = "emr_session"
TABLE_CLIENT_EVAL: Final = "emr_client_eval"
TABLE_PYTHON_CONFIG: Final = "emr_python_config"
TABLE_SEEN_REPORT_FOLDERS: Final = "emr_seen_report_folders"
TABLE_IN_PERSON_ASSESSMENT: Final = "emr_in_person_assessment"
TABLE_QUESTIONNAIRE: Final = "emr_questionnaire"
TABLE_QUESTIONNAIRE_RULE: Final = "emr_questionnaire_rule"
TABLE_APPOINTMENT_REMINDER_SETTINGS: Final = "emr_appointment_reminder_settings"
TABLE_APPOINTMENT_REMINDER_TEMPLATES = "emr_reminder_templates"
TABLE_APPOINTMENT_REMINDER_LOGS = "emr_reminder_logs"
TABLE_APPOINTMENT_REMINDER_REPLIES = "emr_reminder_replies"
TABLE_QUESTIONNAIRE_MSG_LOGS: Final = "emr_questionnaire_msg_logs"
TABLE_FAILURE: Final = "emr_failure"
TABLE_ASSESSMENT_TYPE: Final = "emr_assessment_type"
TABLE_CLIENT_INSURANCE_POLICY: Final = "emr_client_insurance_policy"
TABLE_INSURANCE_REVIEW: Final = "emr_insurance_review"
TABLE_INSURANCE_REVIEW_HISTORY: Final = "emr_insurance_review_history"
TABLE_IN_PERSON_ASSESSMENT_HISTORY: Final = "emr_in_person_assessment_history"
TABLE_NOTE: Final = "emr_note"
TABLE_NOTE_HISTORY: Final = "emr_note_history"
TABLE_TASK: Final = "emr_task"
TABLE_ROLE: Final = "emr_role"
TABLE_EXTERNAL_RECORD: Final = "emr_external_record"
TABLE_EXTERNAL_RECORD_HISTORY: Final = "emr_external_record_history"
TABLE_FAX_CATEGORIZATION: Final = "emr_fax_categorization"
TABLE_FAX_CATEGORIZATION_CLIENT_LINK: Final = "emr_fax_categorization_client_link"
TABLE_BABYNET_REPORT: Final = "emr_babynet_report"
TABLE_OFFICE_DRIVE_TIME: Final = "emr_office_drive_time"
TABLE_REPORT: Final = "emr_report"
TABLE_PIECEWORK_REPORT_TRACKING: Final = "emr_piecework_report_tracking"

# DB to DataFrame Column Mapping
CLIENT_COLUMN_MAPPING: Final = {
    "id": "CLIENT_ID",
    "hash": "HASH",
    "status": "STATUS",
    "asanaId": "ASANA_ID",
    "archivedInAsana": "ARCHIVED_IN_ASANA",
    "driveId": "DRIVE_ID",
    "addedDate": "ADDED_DATE",
    "dob": "DOB",
    "firstName": "FIRSTNAME",
    "lastName": "LASTNAME",
    "preferredName": "PREFERRED_NAME",
    "fullName": "FULL_NAME",
    "address": "ADDRESS",
    "schoolDistrict": "SCHOOL_DISTRICT",
    "latitude": "LATITUDE",
    "longitude": "LONGITUDE",
    "primaryInsurance": "INSURANCE_COMPANYNAME",
    "insuranceNumber": "POLICY_INSURANCENUMBER",
    "secondaryInsurance": "SECONDARY_INSURANCE_COMPANYNAME",
    "precertExpires": "PRECERT_EXPIRES",
    "privatePay": "POLICY_PRIVATEPAY",
    "asdAdhd": "ASD_ADHD",
    "language": "LANGUAGE",
    "paAssignedTo": "PA_ASSIGNED_TO",
    "phoneNumber": "PHONE1",
    "email": "EMAIL",
    "gender": "GENDER",
    "color": "COLOR",
    "highPriority": "HIGH_PRIORITY",
    "babyNet": "BABYNET",
    "autismStop": "AUTISM_STOP",
    "pause": "PAUSE",
    "eiAttends": "EI_ATTENDS",
    "flag": "FLAG",
    "taHash": "TA_HASH",
    "referralSource": "REFERRAL_SOURCE",
}

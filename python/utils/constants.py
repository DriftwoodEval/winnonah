from typing import Final

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
TABLE_CLIENT_EVAL: Final = "emr_client_eval"

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
    "secondaryInsurance": "SECONDARY_INSURANCE_COMPANYNAME",
    "precertExpires": "PRECERT_EXPIRES",
    "privatePay": "POLICY_PRIVATEPAY",
    "asdAdhd": "ASD_ADHD",
    "interpreter": "INTERPRETER",
    "phoneNumber": "PHONE1",
    "email": "EMAIL",
    "gender": "GENDER",
    "color": "COLOR",
    "highPriority": "HIGH_PRIORITY",
    "babyNet": "BABYNET",
    "autismStop": "AUTISM_STOP",
    "eiAttends": "EI_ATTENDS",
    "flag": "FLAG",
    "taHash": "TA_HASH",
}

import utils.selenium as s
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def read_root():
    driver, actions = s.initialize_selenium()
    return {"Hello": "World"}


@app.get("/get_questionnaires")
def get_questionnaires(age: int, type: str, daeval: str):
    vineland = False
    if daeval == "EVAL":
        if type == "ASD":
            if age < 2:  # 1.5
                return "Too young"
            elif age < 6:
                qs = ["DP4", "BASC Preschool", "Conners EC"]
                if vineland:
                    qs.append("ASRS (2-5 Years)")
                else:
                    qs.append("Vineland")
                return qs
            elif age < 12:
                qs = ["BASC Child", "Conners 4"]
                if vineland:
                    qs.append("ASRS (6-18 Years)")
                else:
                    qs.append("Vineland")
                return qs
            elif age < 18:
                qs = [
                    "BASC Adolescent",
                    "Conners 4 Self",
                    "Conners 4",
                ]
                if vineland:
                    qs.append("ASRS (6-18 Years)")
                else:
                    qs.append("Vineland")
                return qs
            elif age < 19:
                qs = ["ABAS 3", "BASC Adolescent", "PAI", "CAARS 2"]
                if vineland:
                    qs.append("ASRS (6-18 Years)")
                else:
                    qs.append("Vineland")
            elif age < 22:
                return ["ABAS 3", "BASC Adolescent", "SRS-2", "CAARS 2", "PAI"]
            else:
                return ["ABAS 3", "SRS-2", "CAARS 2", "PAI"]
    elif daeval == "DA":
        if type == "ASD":
            if age < 2:  # 1.5
                return "Too young"
            elif age < 6:
                return ["ASRS (2-5 Years)"]
            elif age < 7:
                return ["ASRS (6-18 Years)"]
            elif age < 8:
                return ["ASRS (6-18 Years)"]
            elif age < 12:
                return ["ASRS (6-18 Years)"]
            elif age < 18:
                return ["ASRS (6-18 Years)"]
            elif age < 19:
                return ["ASRS (6-18 Years)"]
            elif age < 22:
                return ["SRS Self"]
            else:
                return ["SRS Self"]
        elif type == "ADHD":
            if age < 4:
                return "Too young"
            elif age < 6:
                return ["Conners EC"]
            elif age < 12:
                return ["Conners 4"]
            elif age < 18:
                return ["Conners 4", "Conners 4 Self"]
            else:
                return ["CAARS 2"]
    elif daeval == "DAEVAL":
        if age < 2:  # 1.5
            return "Too young"
        elif age < 6:
            return [
                "ASRS (2-5 Years)",
                "Vineland",
                "DP4",
                "BASC Preschool",
                "Conners EC",
            ]
        elif age < 7:
            return ["ASRS (6-18 Years)", "Vineland", "BASC Child", "Conners 4"]
        elif age < 12:
            return [
                "ASRS (6-18 Years)",
                "Vineland",
                "BASC Child",
                "Conners 4",
            ]
        elif age < 18:
            return [
                "ASRS (6-18 Years)",
                "Vineland",
                "BASC Adolescent",
                "Conners 4 Self",
                "Conners 4",
            ]
        elif age < 19:
            return [
                "ASRS (6-18 Years)",
                "Vineland",
                "ABAS 3",
                "BASC Adolescent",
                "PAI",
                "CAARS 2",
            ]
        elif age < 22:
            return ["SRS Self", "ABAS 3", "BASC Adolescent", "SRS-2", "CAARS 2", "PAI"]
        else:
            return ["SRS Self", "ABAS 3", "SRS-2", "CAARS 2", "PAI"]
    return "Unknown"

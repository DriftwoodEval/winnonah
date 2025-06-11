import utils.selenium as s
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def read_root():
    driver, actions = s.initialize_selenium()
    return {"Hello": "World"}

import utils.webdriving as w
from fastapi import FastAPI

app = FastAPI()


@app.get("/")
def read_root():
    driver, actions = w.initialize_selenium()
    return {"Hello": "World"}

from utils.webdriving import click_element, find_element

SMOKE_PAGE = (
    "data:text/html,"
    "<html><head><title>Smoke Test</title></head>"
    "<body><button id='go' onclick=\"document.getElementById('result').innerText='clicked'\">"
    "Click me</button><p id='result'>waiting</p></body></html>"
)


class TestSeleniumSmoke:
    def test_opens_a_page_and_reads_its_title(self, driver):
        driver.get(SMOKE_PAGE)
        assert driver.title == "Smoke Test"

    def test_finds_and_clicks_an_element(self, driver):
        driver.get(SMOKE_PAGE)
        click_element(driver, "id", "go")
        result = find_element(driver, "id", "result")
        assert result.text == "clicked"

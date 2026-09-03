.PHONY: check test run clean

check:
	@echo "Checking Python environment..."
	@python3 --version
	@echo "Checking required packages..."
	@python3 -c "import pydantic; print('pydantic version:', pydantic.__version__)"
	@echo "Environment check passed."

test:
	@echo "Running all acceptance test cases (T01 - T08)..."
	@pytest tests/test_thesis_update_mvp.py -v

run:
	@echo "FinTrust Thesis Update P0 MVP is served via React Web UI at Port 3000."
	@echo "Run 'npm run dev' or visit web preview."

clean:
	@rm -rf __pycache__ agent/__pycache__ tests/__pycache__ .pytest_cache

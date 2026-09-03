.PHONY: check test run clean

check:
	@make -C project check

test:
	@pytest project/tests/test_thesis_update_mvp.py -v

run:
	@npm run dev

clean:
	@make -C project clean

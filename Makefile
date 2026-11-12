NPM ?= npm
.DEFAULT_GOAL := help
.NOTPARALLEL:
.PHONY: help install dev api build preview test typecheck check verify e2e live doctor release pack models server-status server-logs server-restart backup

help:
	$(NPM) run ops:help
install:
	$(NPM) ci
dev:
	$(NPM) run dev
api:
	$(NPM) run api
build:
	$(NPM) run build
preview:
	$(NPM) run preview
test:
	$(NPM) test
typecheck:
	$(NPM) run typecheck
check:
	$(NPM) run check
verify:
	$(NPM) run verify
e2e:
	$(NPM) run test:e2e
live:
	$(NPM) run test:search:live
doctor:
	$(NPM) run doctor
release:
	$(NPM) run release
pack:
	$(NPM) run release:pack
models:
	ollama pull embeddinggemma:latest
	ollama pull gemma4:e2b
server-status:
	$(NPM) run server:status
server-logs:
	$(NPM) run server:logs
server-restart:
	$(NPM) run server:restart
backup:
	$(NPM) run backup

SECRETCLI = docker exec -it localsecret /usr/bin/secretcli

.PHONY: start-server
start-server: # CTRL+C to stop
	docker run -it --rm \
		-p 26657:26657 -p 26656:26656 -p 1317:1317 -p 5000:5000 -p 9091:9091 \
		-v $$(pwd)/merkle-distributor:/root/code \
		-v $$(pwd)/snip20-reference-impl:/root/secret-secret \
		--name localsecret ghcr.io/scrtlabs/localsecret:v1.5.1

.PHONY: start-server-detached
start-server-detached:
	docker run -d --rm \
		-p 26657:26657 -p 26656:26656 -p 1317:1317 -p 5000:5000 -p 9091:9091 \
		-v $$(pwd)/merkle-distributor:/root/code \
		-v $$(pwd)/snip20-reference-impl:/root/secret-secret \
		--name localsecret ghcr.io/scrtlabs/localsecret:v1.5.1

.PHONY: list-code
list-code:
	$(SECRETCLI) query compute list-code

.PHONY: run-tests
run-tests:
	merkle-distributor/tests/integration.sh

.PHONY: integration-test
integration-test:
	snip20-reference-impl/tests/setup.sh
	merkle-distributor/tests/setup.sh

.PHONY: integration-test-2
integration-test-2:
	npx ts-node deploy/integration.ts

# This is a local build with debug-prints activated. Debug prints only show up
# in the local development chain (see the `start-server` command below)
# and mainnet won't accept contracts built with the feature enabled.
.PHONY: build _build
build: _build compress-wasm
_build:
	RUSTFLAGS='-C link-arg=-s' cargo build --release --target wasm32-unknown-unknown --features="debug-print"

# This is a build suitable for uploading to mainnet.
# Calls to `debug_print` get removed by the compiler.
.PHONY: build-mainnet _build-mainnet
build-mainnet: _build-mainnet compress-wasm
_build-mainnet:
	RUSTFLAGS='-C link-arg=-s' cargo build --release --target wasm32-unknown-unknown
	
# like build-mainnet, but slower and more deterministic
.PHONY: build-mainnet-reproducible
build-mainnet-reproducible:
	docker run --rm -v "$$(pwd)/merkle-distributor":/contract \
		--mount type=volume,source="$$(basename "$$(pwd)/merkle-distributor")_cache",target=/contract/target \
		--mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
		enigmampc/secret-contract-optimizer:1.0.9
	sha256sum merkle-distributor/contract.wasm.gz > merkle-distributor/hash.txt
	docker run --rm -v "$$(pwd)/snip20-reference-impl":/contract \
		--mount type=volume,source="$$(basename "$$(pwd)/snip20-reference-impl")_cache",target=/contract/target \
		--mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
		enigmampc/secret-contract-optimizer:1.0.9
	sha256sum snip20-reference-impl/contract.wasm.gz > snip20-reference-impl/hash.txt

.PHONY: compress-wasm
compress-wasm:
	cp ./target/wasm32-unknown-unknown/release/merkle_distributor.wasm ./merkle-distributor/contract.wasm
	cp ./target/wasm32-unknown-unknown/release/snip20_reference_impl.wasm ./snip20-reference-impl/contract.wasm
	@## The following line is not necessary, may work only on linux (extra size optimization)
	wasm-opt -Os ./merkle-distributor/contract.wasm -o ./merkle-distributor/contract.wasm
	wasm-opt -Os ./snip20-reference-impl/contract.wasm -o ./snip20-reference-impl/contract.wasm
	cat ./merkle-distributor/contract.wasm | gzip -9 > ./merkle-distributor/contract.wasm.gz
	cat ./snip20-reference-impl/contract.wasm | gzip -9 > ./snip20-reference-impl/contract.wasm.gz
	rm ./merkle-distributor/contract.wasm
	rm ./snip20-reference-impl/contract.wasm

.PHONY: schema
schema:
	cargo run --example schema

.PHONY: unit-test
unit-tests:
	cargo unit-test

.PHONY: deploy
deploy:
	npx ts-node deploy/token2testnet.ts
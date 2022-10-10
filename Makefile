SECRETCLI = docker exec -it localsecret /usr/bin/secretcli

all:
	RUSTFLAGS='-C link-arg=-s' cargo build --release --target wasm32-unknown-unknown
	cp ./target/wasm32-unknown-unknown/release/*.wasm ./contract.wasm
	## The following line is not necessary, may work only on linux (extra size optimization)
	wasm-opt -Os ./contract.wasm -o ./contract.wasm
	cat ./contract.wasm | gzip -9 > ./contract.wasm.gz

clean:
	cargo clean
	-rm -f ./contract.wasm ./contract.wasm.gz

.PHONY: start-server
start-server: # CTRL+C to stop
	docker run -it --rm \
		-p 26657:26657 -p 26656:26656 -p 1317:1317 -p 5000:5000 \
		-v $$(pwd):/root/code \
		-v $$(pwd)/secret-secret:/root/secret-secret \
		--name localsecret ghcr.io/scrtlabs/localsecret:v1.5.1-beta.4

.PHONY: start-server-detached
start-server-detached:
	docker run -d --rm \
		-p 26657:26657 -p 26656:26656 -p 1317:1317 -p 5000:5000 \
		-v $$(pwd)/merkle-distributor:/root/code \
		-v $$(pwd)/secret-secret:/root/secret-secret \
		--name localsecret ghcr.io/scrtlabs/localsecret:v1.5.1-beta.4

.PHONY: list-code
list-code:
	$(SECRETCLI) query compute list-code

.PHONY: run-tests
run-tests:
	merkle-distributor/tests/integration.sh

.PHONY: integration-test
integration-test:
	merkle-distributor/tests/setup.sh

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
	docker run --rm -v "$$(pwd)":/contract \
		--mount type=volume,source="$$(basename "$$(pwd)")_cache",target=/contract/target \
		--mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
		enigmampc/secret-contract-optimizer:1.0.9

.PHONY: compress-wasm
compress-wasm:
	cp ./target/wasm32-unknown-unknown/release/*.wasm ./contract.wasm
	@## The following line is not necessary, may work only on linux (extra size optimization)
	wasm-opt -Os ./contract.wasm -o ./contract.wasm
	cat ./contract.wasm | gzip -9 > ./contract.wasm.gz
	mv contract.wasm merkle-distributor/
	mv contract.wasm.gz merkle-distributor/

.PHONY: schema
schema:
	cargo run --example schema

.PHONY: unit-test
unit-tests:
	cargo unit-test
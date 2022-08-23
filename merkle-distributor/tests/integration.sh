#!/bin/bash

set -eu
set -o pipefail # If anything in a pipeline fails, the pipe's exit status is a failure
#set -x # Print all commands for debugging

declare -a KEY=(a b c d)

declare -A FROM=(
    [a]='-y --from a'
    [b]='-y --from b'
    [c]='-y --from c'
    [d]='-y --from d'
)

# This means we don't need to configure the cli since it uses the preconfigured cli in the docker.
# We define this as a function rather than as an alias because it has more flexible expansion behavior.
# In particular, it's not possible to dynamically expand aliases, but `tx_of` dynamically executes whatever
# we specify in its arguments.
function secretcli() {
    docker exec localsecret /usr/bin/secretcli "$@"
}

declare -A ADDRESS=(
    [a]="$(secretcli keys show --address a)"
    [b]="$(secretcli keys show --address b)"
    [c]="$(secretcli keys show --address c)"
    [d]="$(secretcli keys show --address d)"
)

# Just like `echo`, but prints to stderr
function log() {
    echo "$@" >&2
}

# Keep polling the blockchain until the tx completes.
# The first argument is the tx hash.
# The second argument is a message that will be logged after every failed attempt.
# The tx information will be returned.
function wait_for_tx() {
    local tx_hash="$1"
    local message="$2"

    local result

    log "waiting on tx: $tx_hash"
    # secretcli will only print to stdout when it succeeds
    until result="$(secretcli query tx "$tx_hash" 2>/dev/null)"; do
        log "$message"
        sleep 1
    done

    # log out-of-gas events
    if jq -e '.raw_log | startswith("execute contract failed: Out of gas: ") or startswith("out of gas:")' <<<"$result" >/dev/null; then
        log "$(jq -r '.raw_log' <<<"$result")"
    fi

    echo "$result"
}

# Extract the tx_hash from the output of the command
function tx_of() {
    "$@" | jq -r '.txhash'
}

function upload_code() {
    local directory="$1"
    local tx_hash
    local code_id

    tx_hash="$(tx_of secretcli tx compute store "code/$directory/contract.wasm.gz" ${FROM[a]} --gas 10000000)"
    code_id="$(
        wait_for_tx "$tx_hash" 'waiting for contract upload' |
            jq -r '.logs[0].events[0].attributes[] | select(.key == "code_id") | .value'
    )"

    log "uploaded contract #$code_id"

    echo "$code_id"
}

# Generate a label for a contract with a given code id
# This just adds "contract_" before the code id.
function label_by_init_msg() {
    local init_msg="$1"
    local code_id="$2"
    sha256sum <<< "$code_id $init_msg"
}

function instantiate() {
    local code_id="$1"
    local init_msg="$2"

    log 'sending init message:'
    log "${init_msg@Q}"

    local tx_hash
    tx_hash="$(tx_of secretcli tx compute instantiate "$code_id" "$init_msg" --label "$(label_by_init_msg "$init_msg" "$code_id")" ${FROM[a]} --gas 10000000)"
    wait_for_tx "$tx_hash" 'waiting for init to complete'
}

# Send a compute transaction and return the tx hash.
# All arguments to this function are passed directly to `secretcli tx compute execute`.
function compute_execute() {
    tx_of secretcli tx compute execute "$@"
}

# Send a query to the contract.
# All arguments to this function are passed directly to `secretcli query compute query`.
function compute_query() {
    secretcli query compute query "$@"
}

function assert_eq() {
    local left="$1"
    local right="$2"
    local message

    if [[ "$left" != "$right" ]]; then
        if [ -z ${3+x} ]; then
            local lineno="${BASH_LINENO[0]}"
            message="assertion failed on line $lineno - both sides differ. left: ${left@Q}, right: ${right@Q}"
        else
            message="$3"
        fi
        log "$message"
        return 1
    fi

    return 0
}

# This is a wrapper around `wait_for_tx` that also decrypts the response,
# and returns a nonzero status code if the tx failed
function wait_for_compute_tx() {
    local tx_hash="$1"
    local message="$2"
    local return_value=0
    local result
    local decrypted

    result="$(wait_for_tx "$tx_hash" "$message")"
    # log "$result"
    if jq -e '.logs == null' <<<"$result" >/dev/null; then
        return_value=1
    fi
    decrypted="$(secretcli query compute tx "$tx_hash")" || return
    log "$decrypted"
    echo "$decrypted"

    return "$return_value"
}

# This function uploads and instantiates a contract, and returns the new contract's address
function create_contract() {
    local dir="$1"
    local init_msg="$2"

    local code_id
    code_id="$(upload_code "$dir")"

    local init_result
    init_result="$(instantiate "$code_id" "$init_msg")"

    if jq -e '.logs == null' <<<"$init_result" >/dev/null; then
        log "$(secretcli query compute tx "$(jq -r '.txhash' <<<"$init_result")")"
        return 1
    fi

    jq -r '.logs[0].events[0].attributes[] | select(.key == "contract_address") | .value' <<<"$init_result"
}

# This function uploads and instantiates a contract, and returns the new contract's address
function init_contract() {
    local code_id="$1"
    local init_msg="$2"

    local init_result
    init_result="$(instantiate "$code_id" "$init_msg")"

    if jq -e '.logs == null' <<<"$init_result" >/dev/null; then
        log "$(secretcli query compute tx "$(jq -r '.txhash' <<<"$init_result")")"
        return 1
    fi

    jq -r '.logs[0].events[0].attributes[] | select(.key == "contract_address") | .value' <<<"$init_result"
}

function get_generic_err() {
    jq -r '.output_error.generic_err.msg' <<<"$1"
}

function log_test_header() {
    log " # Starting ${FUNCNAME[1]}"
}

function is_claimed() {
    local contract_addr="$1"
    local index="$2"

    local claimed_query='{"is_claimed":{"index":"'"$index"'"}}'
    local claimed_response
    claimed_response="$(compute_query "$contract_addr" "$claimed_query")"
    log "deposit response was: $claimed_response"
    echo "$claimed_response"
}

# Testing the Claim function, which validates a merkle proof against the root and sends the claimed amount
# Proof data is hardcoded and pre-generated separately
function test_claim() {
    local contract_addr="$1"

    log_test_header

    # Wrong index
    local send_message='{"claim":{"index":"1","address":"secret1gs8hau7q8xcya2jum7anj9ap47hw96rmhs2smv","amount":"11","proof":["88f359f9f9d190245e8a0d52959a46992170360d4feacd2ff61d6ef44669203f"]}}'
    local send_response
    tx_hash="$(compute_execute "$distributor_contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    if ! claim_tx="$(wait_for_compute_tx "$tx_hash" "waiting for claim to process")">/dev/null; then
        claim_error="$(get_generic_err "$claim_tx")"
        if ! jq -Re 'startswith("invalid proof")' <<< "$claim_error">/dev/null; then
            log "$claim_error"
            return 1
        fi
    fi

    # Wrong amount
    local send_message='{"claim":{"index":"2","address":"secret1gs8hau7q8xcya2jum7anj9ap47hw96rmhs2smv","amount":"10000","proof":["88f359f9f9d190245e8a0d52959a46992170360d4feacd2ff61d6ef44669203f"]}}'
    local send_response
    tx_hash="$(compute_execute "$distributor_contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    if ! claim_tx="$(wait_for_compute_tx "$tx_hash" "waiting for claim to process")">/dev/null; then
        claim_error="$(get_generic_err "$claim_tx")"
        if ! jq -Re 'startswith("invalid proof")' <<< "$claim_error">/dev/null; then
            log "$claim_error"
            return 1
        fi
    fi

    # Wrong address
    local send_message='{"claim":{"index":"2","address":"secret1kgjjnrtnfgxhfygnqdfj5h0lk26salnuzyfrya","amount":"11","proof":["88f359f9f9d190245e8a0d52959a46992170360d4feacd2ff61d6ef44669203f"]}}'
    local send_response
    tx_hash="$(compute_execute "$distributor_contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    if ! claim_tx="$(wait_for_compute_tx "$tx_hash" "waiting for claim to process")">/dev/null; then
        claim_error="$(get_generic_err "$claim_tx")"
        if ! jq -Re 'startswith("invalid proof")' <<< "$claim_error">/dev/null; then
            log "$claim_error"
            return 1
        fi
    fi

    is_claimed_response=$(is_claimed "$contract_addr" "2")
    assert_eq "$is_claimed_response" "false"

    local send_message='{"claim":{"index":"2","address":"secret1gs8hau7q8xcya2jum7anj9ap47hw96rmhs2smv","amount":"11","proof":["88f359f9f9d190245e8a0d52959a46992170360d4feacd2ff61d6ef44669203f"]}}'
    local send_response
    tx_hash="$(compute_execute "$contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    send_response="$(wait_for_compute_tx "$tx_hash" 'waiting for claim to complete')"
    log "$send_response"

    is_claimed_response=$(is_claimed "$contract_addr" "2")
    assert_eq "$is_claimed_response" "true"

    # Should error "already claimed"
    local send_message='{"claim":{"index":"2","address":"secret1gs8hau7q8xcya2jum7anj9ap47hw96rmhs2smv","amount":"11","proof":["88f359f9f9d190245e8a0d52959a46992170360d4feacd2ff61d6ef44669203f"]}}'
    local send_response
    tx_hash="$(compute_execute "$distributor_contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    if ! claim_tx="$(wait_for_compute_tx "$tx_hash" "waiting for claim to process")">/dev/null; then
        claim_error="$(get_generic_err "$claim_tx")"
        if ! jq -Re 'startswith("drop already claimed")' <<< "$claim_error">/dev/null; then
            log "$claim_error"
            return 1
        fi
    fi

    is_claimed_response=$(is_claimed "$contract_addr" "0")
    assert_eq "$is_claimed_response" "false"

    # Multi level proof
    local send_message='{"claim":{"index":"0","address":"secret1kgjjnrtnfgxhfygnqdfj5h0lk26salnuzyfrya","amount":"100","proof":["6fed0bf91be8e5a13a0518b123f94e686519d6bb01877661eee78f6167407342", "de87d1f2840d1913658a30dd1e0bd1a3cf57e4542bd6f95d2eabddc53d0c6905"]}}'
    local send_response
    tx_hash="$(compute_execute "$contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    send_response="$(wait_for_compute_tx "$tx_hash" 'waiting for claim to complete')"
    log "$send_response"

    # Should error "already claimed"
    local send_message='{"claim":{"index":"0","address":"secret1kgjjnrtnfgxhfygnqdfj5h0lk26salnuzyfrya","amount":"100","proof":["6fed0bf91be8e5a13a0518b123f94e686519d6bb01877661eee78f6167407342", "de87d1f2840d1913658a30dd1e0bd1a3cf57e4542bd6f95d2eabddc53d0c6905"]}}'
    local send_response
    tx_hash="$(compute_execute "$distributor_contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    if ! claim_tx="$(wait_for_compute_tx "$tx_hash" "waiting for claim to process")">/dev/null; then
        claim_error="$(get_generic_err "$claim_tx")"
        if ! jq -Re 'startswith("drop already claimed")' <<< "$claim_error">/dev/null; then
            log "$claim_error"
            return 1
        fi
    fi

    is_claimed_response=$(is_claimed "$contract_addr" "0")
    assert_eq "$is_claimed_response" "true"
}

function main() {
    log '              <####> Starting integration tests <####>'
    log "secretcli version in the docker image is: $(secretcli version)"

    local prng_seed
    prng_seed="$(base64 <<<'enigma')"
    local init_msg

    # Store snip20 code
    local code_id
    code_id="$(upload_code '../secret-secret')"

    log "a address: ${ADDRESS[a]}"

    # secretSCRT init
    init_msg='{"name":"secret-secret","admin":"'"${ADDRESS[a]}"'","symbol":"SSCRT","decimals":6,"initial_balances":[{"address":"'"${ADDRESS[a]}"'", "amount":"999999999999999999999999999999"}],"prng_seed":"'"$prng_seed"'","config":{"public_total_supply":true}}'
    scrt_contract_addr="$(init_contract "$code_id" "$init_msg")"
    scrt_contract_hash="$(secretcli q compute contract-hash "$scrt_contract_addr")"
    scrt_contract_hash="${scrt_contract_hash:2}"

    init_msg='{"token_addr":"'"$scrt_contract_addr"'", "token_hash":"'"$scrt_contract_hash"'", "merkle_root":"44cdb551dd2a331bed89246a24f515d12316740f8b53df8df2d91e96899e3bf7"}'
    distributor_contract_addr="$(create_contract '.' "$init_msg")"

    local send_message='{"send":{"recipient":"'"$distributor_contract_addr"'","amount":"999999999999999999999999999999"}}'
    local send_response
    tx_hash="$(compute_execute "$scrt_contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    send_response="$(wait_for_compute_tx "$tx_hash" 'waiting for send to distributor contract to complete')"
    log "$send_response"

    test_claim "$distributor_contract_addr"
}

main "$@"

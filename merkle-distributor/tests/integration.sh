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
    local send_message='{"claim":{"index":"1","address":"secret1qsjlkyspurmrhmp0fzchtfguqyvzfdwhn9seu6","amount":"200000","proof":["4c4eb3a5007ff5a079de1559429d99307842990d9cfdb43fdd3f543c130a736c", "6126c047a27a2ae4f5b643cd0574490894bc35a20bbb7955b927937f0817ba07", "5a70f4ca1debd8b60edae74fd750f5347ec84506023f222551f9c926760554e7", "faa89bfd105ce6032ec2a77409198b4e8c4f1e065d268252feb90f90e4e8c92f", "73e6b31ca2135fb958929d16e57a639566b1e7e147ca429cd1f51bc0ebf623b7", "ff0d76e0d6a8206bf6d480a5f65629ba31a5537e049c19952286b24e90cc2d6f", "54cd4462c3bc1098a3b15f46b43e98fd9165a8a6d60d8b944dd9ca15e1a2e0a7", "37eb34a046c5bc952343ec0e5553f16408b1fbf747c5512131fed20bdd3a778f", "3d0e2d622cc20c55879eb5347711f7cf94a0282a7cf02179c6f0ce33aefbbbd9", "231f9e40e15b6d8dc7cbedc44fe87ac5be32348d28d2ceb770f10f7277745b44", "52efbcfdc188262b497edfef7aabd5bc57fc2d0549fe4d4c137b0dee6e43ff5a", "4100a6e1fa2e02163be5c0f4ec219bebcb7b600235b496319f6f1f77001589ab", "2235ce444bf5d62a9b99798b29715944fc44d1f4abbd416ff81846f559e5e388", "173223d03daae51a45b1b2d38d4f45030e882ce1c790c5f679d8d8e483efa675", "be8cf40e134a2bad08cb902bcedda49bc82b707ef57ae7b8bb1a2212c3927d1c"]}}'
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
    local send_message='{"claim":{"index":"2","address":"secret1qsjlkyspurmrhmp0fzchtfguqyvzfdwhn9seu6","amount":"250000","proof":["4c4eb3a5007ff5a079de1559429d99307842990d9cfdb43fdd3f543c130a736c", "6126c047a27a2ae4f5b643cd0574490894bc35a20bbb7955b927937f0817ba07", "5a70f4ca1debd8b60edae74fd750f5347ec84506023f222551f9c926760554e7", "faa89bfd105ce6032ec2a77409198b4e8c4f1e065d268252feb90f90e4e8c92f", "73e6b31ca2135fb958929d16e57a639566b1e7e147ca429cd1f51bc0ebf623b7", "ff0d76e0d6a8206bf6d480a5f65629ba31a5537e049c19952286b24e90cc2d6f", "54cd4462c3bc1098a3b15f46b43e98fd9165a8a6d60d8b944dd9ca15e1a2e0a7", "37eb34a046c5bc952343ec0e5553f16408b1fbf747c5512131fed20bdd3a778f", "3d0e2d622cc20c55879eb5347711f7cf94a0282a7cf02179c6f0ce33aefbbbd9", "231f9e40e15b6d8dc7cbedc44fe87ac5be32348d28d2ceb770f10f7277745b44", "52efbcfdc188262b497edfef7aabd5bc57fc2d0549fe4d4c137b0dee6e43ff5a", "4100a6e1fa2e02163be5c0f4ec219bebcb7b600235b496319f6f1f77001589ab", "2235ce444bf5d62a9b99798b29715944fc44d1f4abbd416ff81846f559e5e388", "173223d03daae51a45b1b2d38d4f45030e882ce1c790c5f679d8d8e483efa675", "be8cf40e134a2bad08cb902bcedda49bc82b707ef57ae7b8bb1a2212c3927d1c"]}}'
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
    local send_message='{"claim":{"index":"2","address":"secret1qg6p9uzq4qgepeuwhym4atpk9ccvtscs98rf7f","amount":"200000","proof":["4c4eb3a5007ff5a079de1559429d99307842990d9cfdb43fdd3f543c130a736c", "6126c047a27a2ae4f5b643cd0574490894bc35a20bbb7955b927937f0817ba07", "5a70f4ca1debd8b60edae74fd750f5347ec84506023f222551f9c926760554e7", "faa89bfd105ce6032ec2a77409198b4e8c4f1e065d268252feb90f90e4e8c92f", "73e6b31ca2135fb958929d16e57a639566b1e7e147ca429cd1f51bc0ebf623b7", "ff0d76e0d6a8206bf6d480a5f65629ba31a5537e049c19952286b24e90cc2d6f", "54cd4462c3bc1098a3b15f46b43e98fd9165a8a6d60d8b944dd9ca15e1a2e0a7", "37eb34a046c5bc952343ec0e5553f16408b1fbf747c5512131fed20bdd3a778f", "3d0e2d622cc20c55879eb5347711f7cf94a0282a7cf02179c6f0ce33aefbbbd9", "231f9e40e15b6d8dc7cbedc44fe87ac5be32348d28d2ceb770f10f7277745b44", "52efbcfdc188262b497edfef7aabd5bc57fc2d0549fe4d4c137b0dee6e43ff5a", "4100a6e1fa2e02163be5c0f4ec219bebcb7b600235b496319f6f1f77001589ab", "2235ce444bf5d62a9b99798b29715944fc44d1f4abbd416ff81846f559e5e388", "173223d03daae51a45b1b2d38d4f45030e882ce1c790c5f679d8d8e483efa675", "be8cf40e134a2bad08cb902bcedda49bc82b707ef57ae7b8bb1a2212c3927d1c"]}}'
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

    local send_message='{"claim":{"index":"2","address":"secret1qsjlkyspurmrhmp0fzchtfguqyvzfdwhn9seu6","amount":"200000","proof":["4c4eb3a5007ff5a079de1559429d99307842990d9cfdb43fdd3f543c130a736c", "6126c047a27a2ae4f5b643cd0574490894bc35a20bbb7955b927937f0817ba07", "5a70f4ca1debd8b60edae74fd750f5347ec84506023f222551f9c926760554e7", "faa89bfd105ce6032ec2a77409198b4e8c4f1e065d268252feb90f90e4e8c92f", "73e6b31ca2135fb958929d16e57a639566b1e7e147ca429cd1f51bc0ebf623b7", "ff0d76e0d6a8206bf6d480a5f65629ba31a5537e049c19952286b24e90cc2d6f", "54cd4462c3bc1098a3b15f46b43e98fd9165a8a6d60d8b944dd9ca15e1a2e0a7", "37eb34a046c5bc952343ec0e5553f16408b1fbf747c5512131fed20bdd3a778f", "3d0e2d622cc20c55879eb5347711f7cf94a0282a7cf02179c6f0ce33aefbbbd9", "231f9e40e15b6d8dc7cbedc44fe87ac5be32348d28d2ceb770f10f7277745b44", "52efbcfdc188262b497edfef7aabd5bc57fc2d0549fe4d4c137b0dee6e43ff5a", "4100a6e1fa2e02163be5c0f4ec219bebcb7b600235b496319f6f1f77001589ab", "2235ce444bf5d62a9b99798b29715944fc44d1f4abbd416ff81846f559e5e388", "173223d03daae51a45b1b2d38d4f45030e882ce1c790c5f679d8d8e483efa675", "be8cf40e134a2bad08cb902bcedda49bc82b707ef57ae7b8bb1a2212c3927d1c"]}}'
    local send_response
    tx_hash="$(compute_execute "$contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    send_response="$(wait_for_compute_tx "$tx_hash" 'waiting for claim to complete')"
    log "$send_response"

    # Should be successful
    is_claimed_response=$(is_claimed "$contract_addr" "2")
    assert_eq "$is_claimed_response" "true"

    # Should error "already claimed"
    local send_message='{"claim":{"index":"2","address":"secret1qsjlkyspurmrhmp0fzchtfguqyvzfdwhn9seu6","amount":"200000","proof":["4c4eb3a5007ff5a079de1559429d99307842990d9cfdb43fdd3f543c130a736c", "6126c047a27a2ae4f5b643cd0574490894bc35a20bbb7955b927937f0817ba07", "5a70f4ca1debd8b60edae74fd750f5347ec84506023f222551f9c926760554e7", "faa89bfd105ce6032ec2a77409198b4e8c4f1e065d268252feb90f90e4e8c92f", "73e6b31ca2135fb958929d16e57a639566b1e7e147ca429cd1f51bc0ebf623b7", "ff0d76e0d6a8206bf6d480a5f65629ba31a5537e049c19952286b24e90cc2d6f", "54cd4462c3bc1098a3b15f46b43e98fd9165a8a6d60d8b944dd9ca15e1a2e0a7", "37eb34a046c5bc952343ec0e5553f16408b1fbf747c5512131fed20bdd3a778f", "3d0e2d622cc20c55879eb5347711f7cf94a0282a7cf02179c6f0ce33aefbbbd9", "231f9e40e15b6d8dc7cbedc44fe87ac5be32348d28d2ceb770f10f7277745b44", "52efbcfdc188262b497edfef7aabd5bc57fc2d0549fe4d4c137b0dee6e43ff5a", "4100a6e1fa2e02163be5c0f4ec219bebcb7b600235b496319f6f1f77001589ab", "2235ce444bf5d62a9b99798b29715944fc44d1f4abbd416ff81846f559e5e388", "173223d03daae51a45b1b2d38d4f45030e882ce1c790c5f679d8d8e483efa675", "be8cf40e134a2bad08cb902bcedda49bc82b707ef57ae7b8bb1a2212c3927d1c"]}}'
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

    # # Multi level proof
    # local send_message='{"claim":{"index":"0","address":"secret1kgjjnrtnfgxhfygnqdfj5h0lk26salnuzyfrya","amount":"100","proof":["6fed0bf91be8e5a13a0518b123f94e686519d6bb01877661eee78f6167407342", "de87d1f2840d1913658a30dd1e0bd1a3cf57e4542bd6f95d2eabddc53d0c6905"]}}'
    # local send_response
    # tx_hash="$(compute_execute "$contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    # send_response="$(wait_for_compute_tx "$tx_hash" 'waiting for claim to complete')"
    # log "$send_response"

    # # Should error "already claimed"
    # local send_message='{"claim":{"index":"0","address":"secret1kgjjnrtnfgxhfygnqdfj5h0lk26salnuzyfrya","amount":"100","proof":["6fed0bf91be8e5a13a0518b123f94e686519d6bb01877661eee78f6167407342", "de87d1f2840d1913658a30dd1e0bd1a3cf57e4542bd6f95d2eabddc53d0c6905"]}}'
    # local send_response
    # tx_hash="$(compute_execute "$distributor_contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    # if ! claim_tx="$(wait_for_compute_tx "$tx_hash" "waiting for claim to process")">/dev/null; then
    #     claim_error="$(get_generic_err "$claim_tx")"
    #     if ! jq -Re 'startswith("drop already claimed")' <<< "$claim_error">/dev/null; then
    #         log "$claim_error"
    #         return 1
    #     fi
    # fi

    # is_claimed_response=$(is_claimed "$contract_addr" "0")
    # assert_eq "$is_claimed_response" "true"
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

    # distributor init
    init_msg='{"token_addr":"'"$scrt_contract_addr"'", "token_hash":"'"$scrt_contract_hash"'", "merkle_root":"08a73156193962c44c237448cca7d1d7edb65fea3e8fde85dca5b4cbbac967c5"}'
    distributor_contract_addr="$(create_contract '.' "$init_msg")"

    local send_message='{"send":{"recipient":"'"$distributor_contract_addr"'","amount":"5110600000"}}'
    local send_response
    tx_hash="$(compute_execute "$scrt_contract_addr" "$send_message" ${FROM[a]} --gas 500000)"
    send_response="$(wait_for_compute_tx "$tx_hash" 'waiting for send to distributor contract to complete')"
    log "$send_response"

    test_claim "$distributor_contract_addr"
}

main "$@"

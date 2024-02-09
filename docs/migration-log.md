# AMBER token migration

## Testing

Download code 563 from secret-4. Upload to pulsar-3 and instantiate.

```
secretcli query compute code 563 code563.wasm
secretcli tx compute store code563.wasm --from pulsar --gas 5000000
JSON='{ "name": "Amber", "admin": "secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj", "symbol": "AMBER", "decimals": 6, "initial_balances": [ { "address": "secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj", "amount": "8888000000" } ], "prng_seed": "YW1iZXIgcm9ja3M=", "config": { "public_total_supply": true, "enable_deposit": false, "enable_redeem": false, "enable_mint": false, "enable_burn": false } }'
secretcli tx compute instantiate 3389 "$JSON" --label "amber563 with admin" --from pulsar --admin secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj
```

> code_id: 3389
> contract_address: secret1fx36uxkl3g57emrl92lv3qyuczxpmnlw334kys

Store new token code with migrate function.

```
secretcli tx compute store contract.wasm.gz --gas 5000000 --from pulsar
```

> code_id: 3444
> code_hash: c4f0973fa7842558f6fe8f3c10be275fc0f43512a718594383fe87468bd9b9cf

Call `migrate` function.

```
secretcli tx compute migrate secret1fx36uxkl3g57emrl92lv3qyuczxpmnlw334kys 3444 '{ "migrate": {} }' --from pulsar
```

Verify that contract migration took place.

```
secretcli q compute contract-history secret1fx36uxkl3g57emrl92lv3qyuczxpmnlw334kys
```

Encounter this error when trying to do anything with the contract: `"output_error": "message index 0: snip20_reference_impl::msg::ContractStatusLevel not found"`

Store new token code with migrate function that sets ContractStatusLevel::NormalRun.

```
secretcli tx compute store contract.wasm.gz --gas 5000000 --from pulsar
```

> code_id: 3445

Call `migrate` function.

```
secretcli tx compute migrate secret1fx36uxkl3g57emrl92lv3qyuczxpmnlw334kys 3445 '{ "migrate": {} }' --from pulsar
```

The contract status level error is fixed. I can set my viewing key, but my balance is 0.

Instantiate a new starting contract.

```
secretcli tx compute instantiate 3389 $JSON --label "amber563 with admin 2" --from pulsar --admin secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj
```

> secret1yy7yuk8tnqznw7tltw9mzyjfwetj9xqg7fyn02

Modify the token code and try again.

> code_id: 3496

Try migrating again.

```
secretcli tx compute migrate secret1yy7yuk8tnqznw7tltw9mzyjfwetj9xqg7fyn02 3496 '{ "migrate": {} }' --from pulsar
```

Modify the token code and try again.

> code_id: 3501

Try migrating again.

```
secretcli tx compute migrate secret1yy7yuk8tnqznw7tltw9mzyjfwetj9xqg7fyn02 3501 '{ "migrate": {} }' --from pulsar
```

Balance works! But currently requires a separate execute message to update it.

I still need to look at migrating viewing keys, tx history, allowances...

    ### Note about keys

    old (account is CanonicalAddr):

    ```rust
    key = [to_length_prefixed(b"balances") + account.as_slice()].concat();
    ```

    new (account is Addr):

    ```rust
    key = [b"balances", to_length_prefixed(account.as_str().as_bytes())].concat();
    ```

    multilevel prefixed storage keys look like this:

    let store = ReadonlyPrefixedStorage::multilevel(storage, &[PREFIX_TXS, for_address.as_slice()]);
    key = to_length_prefixed_nested(&[PREFIX_TXS, for_address.as_slice()])
    key = b"\x00\x0ctransactions\x00\x20<somecanonicaladdress>"

    but in the newer version, AppendStore is a static

Modify the token code and try again.

> code_id: 3531

Try migrating again.

```
secretcli tx compute migrate secret1yy7yuk8tnqznw7tltw9mzyjfwetj9xqg7fyn02 3531 '{ "migrate": {} }' --from pulsar
```

Testing reusing old viewing key and balance stores.

> code_id: 3586

```
JSON='{ "name": "Amber", "admin": "secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj", "symbol": "AMBER", "decimals": 6, "initial_balances": [ { "address": "secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj", "amount": "8888000000" } ], "prng_seed": "YW1iZXIgcm9ja3M=", "config": { "public_total_supply": true, "enable_deposit": false, "enable_redeem": false, "enable_mint": false, "enable_burn": false } }'
secretcli tx compute instantiate 3389 "$JSON" --label "amber563 with admin 3" --from pulsar --admin secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj
```

> contract_address: secret1rngq8jlggqwz4pvvn2c2sjl8fus79meg4k7uyj

```
secretcli tx compute migrate secret1rngq8jlggqwz4pvvn2c2sjl8fus79meg4k7uyj 3586 '{ "migrate": {} }' --from pulsar
```

Balance query was deserializing wrong. Made another base contract, with mint and burn enabled this time.

```
JSON='{ "name": "Amber", "admin": "secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj", "symbol": "AMBER", "decimals": 6, "initial_balances": [ { "address": "secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj", "amount": "8888000000" } ], "prng_seed": "YW1iZXIgcm9ja3M=", "config": { "public_total_supply": true, "enable_deposit": true, "enable_redeem": true, "enable_mint": true, "enable_burn": true } }'
secretcli tx compute instantiate 3389 $JSON --label "amber563 with admin 4" --from pulsar --admin secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj
```

> code_id: 3587
> contract_address: secret1ya65zwnnxr8udjvv7lflwqvwrfeskfduqsnqj8

```
secretcli tx compute migrate secret1ya65zwnnxr8udjvv7lflwqvwrfeskfduqsnqj8 3587 '{ "migrate": {} }' --from pulsar
```

Major update! Trying to implement a version where no data migrates. Reuse original key namespaces.

```
JSON='{ "name": "Amber", "admin": "secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj", "symbol": "AMBER", "decimals": 6, "initial_balances": [ { "address": "secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj", "amount": "8888000000" } ], "prng_seed": "YW1iZXIgcm9ja3M=", "config": { "public_total_supply": true, "enable_deposit": true, "enable_redeem": true, "enable_mint": true, "enable_burn": true } }'
secretcli tx compute instantiate 3389 "$JSON" --label "amber563 with admin 6" --from pulsar --admin secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj
```

> code_id: 3714
> contract_address: secret14g3lrc357h33swrx4hh2xfplp25h42myzg70ue

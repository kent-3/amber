# AMBER token migration

## Testing

Download code 563 from secret-4. Upload to pulsar-3 and instantiate.

```
secretcli query compute code 563 code563.wasm
secretcli tx compute store code563.wasm --from pulsar --gas 5000000
JSON='{ "name": "Amber", "admin": "secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj", "symbol": "AMBER", "decimals": 6, "initial_balances": [ { "address": "secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj", "amount": "8888000000" } ], "prng_seed": "YW1iZXIgcm9ja3M=", "config": { "public_total_supply": true, "enable_deposit": false, "enable_redeem": false, "enable_mint": false, "enable_burn": false } }'
secretcli tx compute instantiate 3389 $JSON --label "amber563 with admin" --from pulsar --admin secret1r8w55329ukm802sdy0kr3jd5vq8ugtwt8h9djj
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

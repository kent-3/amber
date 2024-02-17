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
> contract_address: secret19gtpkk25r0c36gtlyrc6repd3q52ngmkpfszw3

Store new token code with migrate function.

```
secretcli tx compute store contract.wasm.gz --gas 5000000 --from pulsar
```

> code_id: 4354

Call `migrate` function.

```
secretcli tx compute migrate secret19gtpkk25r0c36gtlyrc6repd3q52ngmkpfszw3 4354 '{ "migrate": {} }' --from pulsar
```

Verify that contract migration took place.

```
secretcli q compute contract-history secret19gtpkk25r0c36gtlyrc6repd3q52ngmkpfszw3
```

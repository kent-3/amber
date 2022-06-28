import { SecretNetworkClient, grpc } from "secretjs";
import fs from "fs";
import TOML from "@iarna/toml";
import 'dotenv/config' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import

const grpcWebUrl = process.env.GRPC_WEB_URL;

// To create a readonly secret.js client, just pass in a gRPC-web endpoint
const secretjs = await SecretNetworkClient.create({
  grpcWebUrl,
  chainId: "secret-4",
});

// Get all validators
const { validators } = await secretjs.query.staking.validators({ status: "BOND_STATUS_BONDED" }, new grpc.Metadata({"x-cosmos-block-height": "4008888"}))
let operatorAddresses = []
let delegations = []
let result = {}

// For each validator, get all delegator addresses
for (let i = 0; i < validators.length; i++) {
    let validator_address = validators[i].operatorAddress
    operatorAddresses.push(validator_address)
    let delegation = await secretjs.query.staking.validatorDelegations({validatorAddr: validator_address, pagination: {limit:'1000000'}}, new grpc.Metadata({"x-cosmos-block-height": "4008888"}))
    let count = []
    // For each delegator, check if staking amount meets criteria and save KV pair with address and amount
    for (let j = 0; j < delegation.delegationResponses.length; j++) {
        if ((delegation.delegationResponses[j].balance.amount / 1000000) >= process.env.MINIMUM_STAKE) {
            let address = delegation.delegationResponses[j].delegation.delegatorAddress
            let amount = delegation.delegationResponses[j].balance.amount / 1000000
            count.push(address)
            delegations.push(address)
            result[address] = amount    // duplicate addresses are overwritten each loop
        }
    }
    console.log(`${validators[i].description.moniker}: ${count.length}`)
}

console.log(`\n${operatorAddresses.length} validators were queried`)
console.log(`There are ${delegations.length} delegators meet the criteria (warning: not accounting for same address staking to multiple validators)`)
fs.writeFileSync("snapshot/00-bech32.toml",TOML.stringify(result))

// TODO remove disqualified validators
// TODO remove duplicate addresses in delegations[] to double check total
// TODO replace stake amounts with airdrop amounts in the output file
// TODO distinguish AmberDAO delegators to determine bonus
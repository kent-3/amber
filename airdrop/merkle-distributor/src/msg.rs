use cosmwasm_std::{HumanAddr, Uint128};

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, JsonSchema)]
pub struct InitMsg {
    pub token_addr: HumanAddr,
    pub token_hash: String,
    pub merkle_root: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum HandleMsg {
    Claim {
        index: Uint128,
        address: HumanAddr,
        amount: Uint128,
        proof: Vec<String>,
    },
    Retrieve {
        address: HumanAddr,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    IsClaimed { index: Uint128 },
    IsUnclaimed {},
}

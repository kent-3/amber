use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Binary, Uint128};
use secret_toolkit::snip20::Balance;

#[cw_serde]
pub struct InstantiateMsg {
    pub old_token_addr: Addr,
    pub old_token_hash: String,
    pub new_token_addr: Addr,
    pub new_token_hash: String,
}

#[cw_serde]
pub enum ExecuteMsg {
    Receive {
        sender: Addr,
        from: Addr,
        amount: Uint128,
        memo: Option<String>,
        msg: Option<Binary>,
    },
}

#[cw_serde]
pub enum ExecuteAnswer {
    Receive { status: ResponseStatus },
}

#[cw_serde]
pub enum ResponseStatus {
    Success,
    Failure,
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    // GetCount returns the current count as a json-encoded number
    #[returns(BalancesResponse)]
    GetBalances {},
}

// We define a custom struct for each query response
#[cw_serde]
pub struct BalancesResponse {
    pub old_token: Balance,
    pub new_token: Balance,
}

// Messages sent to SNIP-20 contracts
#[cw_serde]
pub enum Snip20Msg {
    RegisterReceive {
        code_hash: String,
        padding: Option<String>,
    },
}

impl Snip20Msg {
    pub fn register_receive(code_hash: String) -> Self {
        Snip20Msg::RegisterReceive {
            code_hash,
            padding: None, // TODO add padding calculation
        }
    }
}

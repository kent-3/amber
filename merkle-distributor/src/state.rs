use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use cosmwasm_std::{Binary, CanonicalAddr, HumanAddr, Storage};
use cosmwasm_storage::{singleton, singleton_read, ReadonlySingleton, Singleton};

pub static CONFIG_KEY: &[u8] = b"config";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct State {
    pub token_addr: HumanAddr,
    pub token_hash: String,
    pub merkle_root: String,
    pub claimed_bitmap: Vec<u128>,
}

pub fn config<S: Storage>(storage: &mut S) -> Singleton<S, State> {
    singleton(storage, CONFIG_KEY)
}

pub fn config_read<S: Storage>(storage: &S) -> ReadonlySingleton<S, State> {
    singleton_read(storage, CONFIG_KEY)
}

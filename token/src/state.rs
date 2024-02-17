//! ```text
//! Key Namespaces:
//!
//! PREFIX_CONFIG
//! |-- KEY_CONSTANTS
//! |   └-- Constants
//! |-- KEY_TOTAL_SUPPLY
//! |   └-- u128
//! |-- KEY_CONTRACT_STATUS
//! |   └-- u8
//! |-- KEY_MINTERS
//! |   └-- Vec<Addr>
//! └-- KEY_TX_COUNT
//!     └-- u64
//!
//! PREFIX_BALANCES
//! |-- CanonicalAddr
//! |   └-- u128
//! |-- CanonicalAddr
//! |   └-- u128
//! └-- CanonicalAddr
//!     └-- u128
//!
//! [PREFIX_ALLOWED + spender_canonical]
//! |-- owner: Addr
//! |-- owner: Addr
//! └-- owner: Addr
//!
//! [PREFIX_ALLOWANCES + owner_canonical]
//! |-- spender_1: CanonicalAddr
//! |   └-- Allowance
//! |-- spender_2: CanonicalAddr
//! |   └-- Allowance
//! └-- spender_3: CanonicalAddr
//!     └-- Allowance
//!
//! PREFIX_VIEW_KEY
//! |-- account: CanonicalAddr
//! |   └-- sha256(key)
//! |-- account: CanonicalAddr
//! |   └-- sha256(key)
//! └-- account: CanonicalAddr
//!     └-- sha256(key)
//!
//! PREFIX_RECEIVERS
//! |-- Addr
//! |   └-- code_hash
//! |-- Addr
//! |   └-- code_hash
//! └-- Addr
//!     └-- code_hash
//!
//! [PREFIX_TXS + addr_canonical]
//! |-- StoredExtendedTx
//! |-- StoredExtendedTx
//! └-- StoredExtendedTx
//!
//! [PREFIX_TRANSFERS + addr_canonical]
//! |-- StoredLegacyTransfer
//! |-- StoredLegacyTransfer
//! └-- StoredLegacyTransfer
//! ```

use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::any::type_name;

use cosmwasm_std::{Addr, CanonicalAddr, Env, StdError, StdResult, Storage};
use cosmwasm_storage::{prefixed, prefixed_read, PrefixedStorage, ReadonlyPrefixedStorage};

use secret_toolkit::crypto::SHA256_HASH_SIZE;
use secret_toolkit::storage::{Keymap, Keyset};

use crate::amber::OneAmberStore;
use crate::msg::{status_level_to_u8, u8_to_status_level, ContractStatusLevel};

pub const KEY_CONSTANTS: &[u8] = b"constants";
pub const KEY_TOTAL_SUPPLY: &[u8] = b"total_supply";
pub const KEY_CONTRACT_STATUS: &[u8] = b"contract_status";
pub const KEY_MINTERS: &[u8] = b"minters";
pub const KEY_TX_COUNT: &[u8] = b"tx-count"; // dash bothers me, but that's how it was

pub const PREFIX_CONFIG: &[u8] = b"config";
pub const PREFIX_BALANCES: &[u8] = b"balances";
pub const PREFIX_ALLOWANCES: &[u8] = b"allowances";
pub const PREFIX_ALLOWED: &[u8] = b"allowed";
pub const PREFIX_VIEW_KEY: &[u8] = b"viewingkey";
pub const PREFIX_RECEIVERS: &[u8] = b"receivers";

// Config

#[derive(Serialize, Debug, Deserialize, Clone, JsonSchema)]
#[cfg_attr(test, derive(Eq, PartialEq))]
pub struct Constants {
    pub name: String,
    pub admin: Addr,
    pub symbol: String,
    pub decimals: u8,
    pub prng_seed: Vec<u8>,
    // privacy configuration
    pub total_supply_is_public: bool,
    // is deposit enabled
    pub deposit_is_enabled: bool,
    // is redeem enabled
    pub redeem_is_enabled: bool,
    // is mint enabled
    pub mint_is_enabled: bool,
    // is burn enabled
    pub burn_is_enabled: bool,
    // the address of this contract, used to validate query permits
    pub contract_address: Addr,
    // coin denoms that are supported for deposit/redeem
    pub supported_denoms: Vec<String>,
}

impl Constants {
    fn update_prng_seed(&mut self, prng_seed: [u8; 32]) -> &mut Self {
        self.prng_seed = prng_seed.to_vec();
        self
    }
}

pub struct ConfigStore {}
impl ConfigStore {
    pub fn load_constants(store: &dyn Storage) -> StdResult<Constants> {
        let config_store = prefixed_read(store, PREFIX_CONFIG);
        let consts_bytes = config_store
            .get(KEY_CONSTANTS)
            .ok_or_else(|| StdError::generic_err("no constants stored in configuration"))?;
        bincode2::deserialize::<Constants>(&consts_bytes)
            .map_err(|e| StdError::serialize_err(type_name::<Constants>(), e))
    }

    pub fn load_total_supply(store: &dyn Storage) -> StdResult<u128> {
        let config_store = prefixed_read(store, PREFIX_CONFIG);
        let supply_bytes = config_store
            .get(KEY_TOTAL_SUPPLY)
            .expect("no total supply stored in config");
        // This unwrap is ok because we know we stored things correctly
        slice_to_u128(&supply_bytes)
    }

    pub fn load_contract_status(store: &dyn Storage) -> StdResult<ContractStatusLevel> {
        let config_store = prefixed_read(store, PREFIX_CONFIG);
        let supply_bytes = config_store
            .get(KEY_CONTRACT_STATUS)
            .expect("no contract status stored in config");

        // These unwraps are ok because we know we stored things correctly
        let status = slice_to_u8(&supply_bytes).unwrap();
        u8_to_status_level(status)
    }

    pub fn load_tx_count(store: &dyn Storage) -> u64 {
        let config_store = prefixed_read(store, PREFIX_CONFIG);
        get_bin_data(config_store, KEY_TX_COUNT).unwrap_or_default()
    }

    pub fn set_constants(store: &mut dyn Storage, constants: &Constants) -> StdResult<()> {
        let mut config_store = prefixed(store, PREFIX_CONFIG);
        set_bin_data(&mut config_store, KEY_CONSTANTS, constants)
    }

    pub fn set_total_supply(store: &mut dyn Storage, supply: &u128) -> StdResult<()> {
        let mut config_store = prefixed(store, PREFIX_CONFIG);
        config_store.set(KEY_TOTAL_SUPPLY, &supply.to_be_bytes());
        Ok(())
    }

    pub fn set_contract_status(
        store: &mut dyn Storage,
        status: &ContractStatusLevel,
    ) -> StdResult<()> {
        let mut config_store = prefixed(store, PREFIX_CONFIG);
        let status_u8 = status_level_to_u8(status);
        config_store.set(KEY_CONTRACT_STATUS, &status_u8.to_be_bytes());
        Ok(())
    }

    pub fn set_tx_count(store: &mut dyn Storage, count: &u64) -> StdResult<()> {
        let mut config_store = prefixed(store, PREFIX_CONFIG);
        set_bin_data(&mut config_store, KEY_TX_COUNT, &count)
    }
}

// old-style functions

fn ser_bin_data<T: Serialize>(obj: &T) -> StdResult<Vec<u8>> {
    bincode2::serialize(&obj).map_err(|e| StdError::serialize_err(type_name::<T>(), e))
}

fn deser_bin_data<T: DeserializeOwned>(data: &[u8]) -> StdResult<T> {
    bincode2::deserialize::<T>(data).map_err(|e| StdError::serialize_err(type_name::<T>(), e))
}

fn set_bin_data<T: Serialize>(
    storage: &mut PrefixedStorage,
    key: &[u8],
    data: &T,
) -> StdResult<()> {
    let bin_data = ser_bin_data(data)?;

    storage.set(key, &bin_data);
    Ok(())
}

fn get_bin_data<T: DeserializeOwned>(storage: ReadonlyPrefixedStorage, key: &[u8]) -> StdResult<T> {
    let bin_data = storage.get(key);

    match bin_data {
        None => Err(StdError::not_found("Key not found in storage")),
        Some(bin_data) => Ok(deser_bin_data(&bin_data)?),
    }
}

// Prng

// Has a separate interface now, but it still lives inside the Constants struct.
// It is stored as a Vec<u8>, but the functions that use it now expect a [u8; 32].

pub struct PrngStore {}
impl PrngStore {
    pub fn load(store: &dyn Storage) -> StdResult<[u8; SHA256_HASH_SIZE]> {
        // This should always work because the seed is sha256 hashed
        ConfigStore::load_constants(store)?
            .prng_seed
            .try_into()
            .map_err(|_err| StdError::generic_err("stored prng_seed was not 32 bytes"))
    }

    pub fn save(store: &mut dyn Storage, prng_seed: [u8; SHA256_HASH_SIZE]) -> StdResult<()> {
        let mut constants = ConfigStore::load_constants(store)?;
        constants.update_prng_seed(prng_seed);
        ConfigStore::set_constants(store, &constants)
    }
}

// Minters

pub struct MintersStore {}
impl MintersStore {
    pub fn load(store: &dyn Storage) -> StdResult<Vec<Addr>> {
        let config_store = prefixed_read(store, PREFIX_CONFIG);
        get_bin_data(config_store, KEY_MINTERS)
    }

    pub fn save(store: &mut dyn Storage, minters_to_set: Vec<Addr>) -> StdResult<()> {
        let mut config_store = prefixed(store, PREFIX_CONFIG);
        set_bin_data(&mut config_store, KEY_MINTERS, &minters_to_set)
    }

    pub fn add_minters(store: &mut dyn Storage, minters_to_add: Vec<Addr>) -> StdResult<()> {
        let mut loaded_minters = Self::load(store)?;
        loaded_minters.extend(minters_to_add);

        Self::save(store, loaded_minters)
    }

    pub fn remove_minters(store: &mut dyn Storage, minters_to_remove: Vec<Addr>) -> StdResult<()> {
        let mut loaded_minters = Self::load(store)?;

        for minter in minters_to_remove {
            loaded_minters.retain(|x| x != &minter);
        }

        Self::save(store, loaded_minters)
    }
}

// Balances

// To avoid balance guessing attacks based on balance overflow we need to perform safe addition and don't expose overflows to the caller.
// Assuming that max of u128 is probably an unreachable balance, we want the addition to be bounded the max of u128
// Currently the logic here is very straight forward yet the existence of the function is mendatory for future changes if needed.
pub fn safe_add(balance: &mut u128, amount: u128) -> u128 {
    // Note that new_amount can be equal to base after this operation.
    // Currently we do nothing maybe on other implementations we will have something to add here
    let prev_balance: u128 = *balance;
    *balance = balance.saturating_add(amount);

    // Won't underflow as the minimal value possible is 0
    *balance - prev_balance
}

pub struct BalancesStore {}
impl BalancesStore {
    fn save(store: &mut dyn Storage, account: &CanonicalAddr, amount: u128) {
        let mut balances = prefixed(store, PREFIX_BALANCES);
        balances.set(account.as_slice(), &amount.to_be_bytes());
    }

    pub fn load(store: &dyn Storage, account: &CanonicalAddr) -> u128 {
        let balances_store = prefixed_read(store, PREFIX_BALANCES);

        let account_bytes = account.as_slice();
        let result = balances_store.get(account_bytes);

        match result {
            // This unwrap is ok because we know we stored things correctly
            Some(balance_bytes) => slice_to_u128(&balance_bytes).unwrap(),
            None => 0,
        }
    }

    pub fn update_balance(
        store: &mut dyn Storage,
        env: &Env,
        account: &CanonicalAddr,
        amount_to_be_updated: u128,
        should_add: bool,
        operation_name: &str,
        decoys: &Option<Vec<CanonicalAddr>>,
        account_random_pos: &Option<usize>,
    ) -> StdResult<()> {
        match decoys {
            None => {
                let mut balance = Self::load(store, account);
                let previous_balance = balance;

                balance = match should_add {
                    true => {
                        safe_add(&mut balance, amount_to_be_updated);
                        balance
                    }
                    false => {
                        if let Some(balance) = balance.checked_sub(amount_to_be_updated) {
                            balance
                        } else {
                            return Err(StdError::generic_err(format!(
                                "insufficient funds to {operation_name}: balance={balance}, required={amount_to_be_updated}",
                            )));
                        }
                    }
                };

                OneAmberStore::update_member(store, account, previous_balance, balance, env)?;

                Self::save(store, account, balance);
                Ok(())
            }
            Some(decoys_vec) => {
                // It should always be set when decoys_vec is set
                let account_pos = account_random_pos.unwrap();

                let mut accounts_to_be_written: Vec<&CanonicalAddr> = vec![];

                let (first_part, second_part) = decoys_vec.split_at(account_pos);
                accounts_to_be_written.extend(first_part);
                accounts_to_be_written.push(account);
                accounts_to_be_written.extend(second_part);

                // In a case where the account is also a decoy somehow
                let mut was_account_updated = false;

                for acc in accounts_to_be_written.iter() {
                    // Always load account balance to obfuscate the real account
                    // Please note that decoys are not always present in the DB. In this case it is ok beacuse load will return 0.
                    let mut acc_balance = Self::load(store, acc);
                    let mut new_balance = acc_balance;

                    let p_balance = acc_balance;

                    if *acc == account && !was_account_updated {
                        was_account_updated = true;
                        new_balance = match should_add {
                            true => {
                                safe_add(&mut acc_balance, amount_to_be_updated);
                                acc_balance
                            }
                            false => {
                                if let Some(balance) = acc_balance.checked_sub(amount_to_be_updated)
                                {
                                    balance
                                } else {
                                    return Err(StdError::generic_err(format!(
                                        "insufficient funds to {operation_name}: balance={acc_balance}, required={amount_to_be_updated}",
                                    )));
                                }
                            }
                        };

                        OneAmberStore::update_member(store, account, p_balance, new_balance, env)?;
                    }
                    Self::save(store, acc, new_balance);
                }

                Ok(())
            }
        }
    }
}

// Allowances
//
// No changes to this section. We probably don't have any existing allowances anyway.

#[derive(Serialize, Debug, Deserialize, Clone, PartialEq, Eq, Default, JsonSchema)]
pub struct Allowance {
    pub amount: u128,
    pub expiration: Option<u64>,
}

impl Allowance {
    pub fn is_expired_at(&self, block: &cosmwasm_std::BlockInfo) -> bool {
        match self.expiration {
            Some(time) => block.time.seconds() >= time,
            None => false, // allowance has no expiration
        }
    }
}

pub static ALLOWANCES: Keymap<Addr, Allowance> = Keymap::new(PREFIX_ALLOWANCES);
pub static ALLOWED: Keyset<Addr> = Keyset::new(PREFIX_ALLOWED);
pub struct AllowancesStore {}
impl AllowancesStore {
    pub fn load(store: &dyn Storage, owner: &Addr, spender: &Addr) -> Allowance {
        ALLOWANCES
            .add_suffix(owner.as_bytes())
            .get(store, &spender.clone())
            .unwrap_or_default()
    }

    pub fn save(
        store: &mut dyn Storage,
        owner: &Addr,
        spender: &Addr,
        allowance: &Allowance,
    ) -> StdResult<()> {
        ALLOWED
            .add_suffix(spender.as_bytes())
            .insert(store, owner)?;
        ALLOWANCES
            .add_suffix(owner.as_bytes())
            .insert(store, spender, allowance)
    }

    pub fn all_allowances(
        store: &dyn Storage,
        owner: &Addr,
        page: u32,
        page_size: u32,
    ) -> StdResult<Vec<(Addr, Allowance)>> {
        ALLOWANCES
            .add_suffix(owner.as_bytes())
            .paging(store, page, page_size)
    }

    pub fn num_allowances(store: &dyn Storage, owner: &Addr) -> u32 {
        ALLOWANCES
            .add_suffix(owner.as_bytes())
            .get_len(store)
            .unwrap_or(0)
    }

    pub fn all_allowed(
        store: &dyn Storage,
        spender: &Addr,
        page: u32,
        page_size: u32,
    ) -> StdResult<Vec<(Addr, Allowance)>> {
        let owners = ALLOWED
            .add_suffix(spender.as_bytes())
            .paging(store, page, page_size)?;
        let owners_allowances = owners
            .into_iter()
            .map(|owner| (owner.clone(), AllowancesStore::load(store, &owner, spender)))
            .collect();
        Ok(owners_allowances)
    }

    pub fn num_allowed(store: &dyn Storage, spender: &Addr) -> u32 {
        ALLOWED
            .add_suffix(spender.as_bytes())
            .get_len(store)
            .unwrap_or(0)
    }

    pub fn is_allowed(store: &dyn Storage, owner: &Addr, spender: &Addr) -> bool {
        ALLOWED
            .add_suffix(spender.as_bytes())
            .contains(store, owner)
    }
}

// Receiver Interface

pub struct ReceiverHashStore {}
impl ReceiverHashStore {
    pub fn may_load(store: &dyn Storage, account: &Addr) -> StdResult<Option<String>> {
        let store = ReadonlyPrefixedStorage::new(store, PREFIX_RECEIVERS);
        store
            .get(account.as_str().as_bytes())
            .map(|data| {
                String::from_utf8(data).map_err(|_err| {
                    StdError::invalid_utf8("stored code hash was not a valid String")
                })
            })
            .transpose()
    }

    pub fn save(store: &mut dyn Storage, account: &Addr, code_hash: String) {
        let mut store = PrefixedStorage::new(store, PREFIX_RECEIVERS);
        store.set(account.as_str().as_bytes(), code_hash.as_bytes())
    }
}

// Helpers

/// Converts 16 bytes value into u128
/// Errors if data found that is not 16 bytes
fn slice_to_u128(data: &[u8]) -> StdResult<u128> {
    match <[u8; 16]>::try_from(data) {
        Ok(bytes) => Ok(u128::from_be_bytes(bytes)),
        Err(_) => Err(StdError::generic_err(
            "Corrupted data found. 16 byte expected.",
        )),
    }
}

/// Converts 1 byte value into u8
/// Errors if data found that is not 1 byte
fn slice_to_u8(data: &[u8]) -> StdResult<u8> {
    if data.len() == 1 {
        Ok(data[0])
    } else {
        Err(StdError::generic_err(
            "Corrupted data found. 1 byte expected.",
        ))
    }
}

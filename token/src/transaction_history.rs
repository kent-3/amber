use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use cosmwasm_std::{Addr, Api, CanonicalAddr, Coin, StdError, StdResult, Storage, Uint128};
use cosmwasm_storage::{PrefixedStorage, ReadonlyPrefixedStorage};

use crate::legacy_support::{AppendStore, AppendStoreMut};
use crate::state::ConfigStore;

const PREFIX_TXS: &[u8] = b"transactions";
const PREFIX_TRANSFERS: &[u8] = b"transfers";

// Note that id is a globally incrementing counter.
// Since it's 64 bits long, even at 50 tx/s it would take
// over 11 billion years for it to rollback. I'm pretty sure
// we'll have bigger issues by then.
#[derive(Serialize, Deserialize, JsonSchema, Clone, Debug)]
pub struct Tx {
    pub id: u64,
    pub from: Addr,
    pub sender: Addr,
    pub receiver: Addr,
    pub coins: Coin,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memo: Option<String>,
    // The block time and block height are optional so that the JSON schema
    // reflects that some SNIP-20 contracts may not include this info.
    pub block_time: Option<u64>,
    pub block_height: Option<u64>,
}

#[derive(Serialize, Deserialize, JsonSchema, Clone, Debug, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TxAction {
    Transfer {
        from: Addr,
        sender: Addr,
        recipient: Addr,
    },
    Mint {
        minter: Addr,
        recipient: Addr,
    },
    Burn {
        burner: Addr,
        owner: Addr,
    },
    Deposit {},
    Redeem {},
    Decoy {
        address: Addr,
    },
}

// Note that id is a globally incrementing counter.
// Since it's 64 bits long, even at 50 tx/s it would take
// over 11 billion years for it to rollback. I'm pretty sure
// we'll have bigger issues by then.
#[derive(Serialize, Deserialize, JsonSchema, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct ExtendedTx {
    pub id: u64,
    pub action: TxAction,
    pub coins: Coin,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memo: Option<String>,
    pub block_time: u64,
    pub block_height: u64,
}

// Stored types:

// REMOVED

/// This type is the stored version of the legacy transfers
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub struct StoredLegacyTransfer {
    id: u64,
    from: CanonicalAddr,
    sender: CanonicalAddr,
    receiver: CanonicalAddr,
    coins: Coin,
    memo: Option<String>,
    block_time: u64,
    block_height: u64,
}

impl StoredLegacyTransfer {
    pub fn into_humanized(self, api: &dyn Api) -> StdResult<Tx> {
        let tx = Tx {
            id: self.id,
            from: api.addr_humanize(&self.from)?,
            sender: api.addr_humanize(&self.sender)?,
            receiver: api.addr_humanize(&self.receiver)?,
            coins: self.coins,
            memo: self.memo,
            block_time: Some(self.block_time),
            block_height: Some(self.block_height),
        };
        Ok(tx)
    }

    fn append_transfer(
        store: &mut dyn Storage,
        tx: &StoredLegacyTransfer,
        for_address: &CanonicalAddr,
    ) -> StdResult<()> {
        let mut store =
            PrefixedStorage::multilevel(store, &[PREFIX_TRANSFERS, for_address.as_slice()]);
        let mut store = AppendStoreMut::attach_or_create(&mut store)?;
        store.push(tx)
    }

    pub fn get_transfers(
        api: &dyn Api,
        storage: &dyn Storage,
        for_address: CanonicalAddr,
        page: u32,
        page_size: u32,
        should_filter_decoys: bool,
    ) -> StdResult<(Vec<Tx>, u64)> {
        let store = ReadonlyPrefixedStorage::multilevel(
            storage,
            &[PREFIX_TRANSFERS, for_address.as_slice()],
        );

        // Try to access the storage of transfers for the account.
        // If it doesn't exist yet, return an empty list of transfers.
        let store = AppendStore::<StoredLegacyTransfer, _>::attach(&store);
        let store = if let Some(result) = store {
            result?
        } else {
            return Ok((vec![], 0));
        };

        // Take `page_size` txs starting from the latest tx, potentially skipping `page * page_size`
        // txs from the start.
        let transfer_iter = store
            .iter()
            .rev()
            .skip((page * page_size) as _)
            .take(page_size as _);

        // The `and_then` here flattens the `StdResult<StdResult<ExtendedTx>>` to an `StdResult<ExtendedTx>`
        let transfers: StdResult<Vec<Tx>> = if should_filter_decoys {
            transfer_iter
                .filter(|transfer| match transfer {
                    Err(_) => true,
                    Ok(t) => t.block_height != 0,
                })
                .map(|tx| tx.map(|tx| tx.into_humanized(api)).and_then(|x| x))
                .collect()
        } else {
            transfer_iter
                .map(|tx| tx.map(|tx| tx.into_humanized(api)).and_then(|x| x))
                .collect()
        };

        transfers.map(|txs| (txs, store.len() as u64))
    }
}

#[derive(Clone, Copy, Debug)]
#[repr(u8)]
enum TxCode {
    Transfer = 0,
    Mint = 1,
    Burn = 2,
    Deposit = 3,
    Redeem = 4,
    Decoy = 255,
}

impl TxCode {
    fn to_u8(self) -> u8 {
        self as u8
    }

    fn from_u8(n: u8) -> StdResult<Self> {
        use TxCode::*;
        match n {
            0 => Ok(Transfer),
            1 => Ok(Mint),
            2 => Ok(Burn),
            3 => Ok(Deposit),
            4 => Ok(Redeem),
            255 => Ok(Decoy),
            other => Err(StdError::generic_err(format!(
                "Unexpected Tx code in transaction history: {other} Storage is corrupted.",
            ))),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
struct StoredTxAction {
    tx_type: u8,
    address1: Option<CanonicalAddr>,
    address2: Option<CanonicalAddr>,
    address3: Option<CanonicalAddr>,
}

impl StoredTxAction {
    fn transfer(from: CanonicalAddr, sender: CanonicalAddr, recipient: CanonicalAddr) -> Self {
        Self {
            tx_type: TxCode::Transfer.to_u8(),
            address1: Some(from),
            address2: Some(sender),
            address3: Some(recipient),
        }
    }
    fn mint(minter: CanonicalAddr, recipient: CanonicalAddr) -> Self {
        Self {
            tx_type: TxCode::Mint.to_u8(),
            address1: Some(minter),
            address2: Some(recipient),
            address3: None,
        }
    }
    fn burn(owner: CanonicalAddr, burner: CanonicalAddr) -> Self {
        Self {
            tx_type: TxCode::Burn.to_u8(),
            address1: Some(burner),
            address2: Some(owner),
            address3: None,
        }
    }
    fn deposit() -> Self {
        Self {
            tx_type: TxCode::Deposit.to_u8(),
            address1: None,
            address2: None,
            address3: None,
        }
    }
    fn redeem() -> Self {
        Self {
            tx_type: TxCode::Redeem.to_u8(),
            address1: None,
            address2: None,
            address3: None,
        }
    }
    fn decoy(recipient: &CanonicalAddr) -> Self {
        Self {
            tx_type: TxCode::Decoy.to_u8(),
            address1: Some(recipient.clone()),
            address2: None,
            address3: None,
        }
    }

    fn into_tx_action(self, api: &dyn Api) -> StdResult<TxAction> {
        let transfer_addr_err = || {
            StdError::generic_err(
                "Missing address in stored Transfer transaction. Storage is corrupt",
            )
        };
        let mint_addr_err = || {
            StdError::generic_err("Missing address in stored Mint transaction. Storage is corrupt")
        };
        let burn_addr_err = || {
            StdError::generic_err("Missing address in stored Burn transaction. Storage is corrupt")
        };
        let decoy_addr_err = || {
            StdError::generic_err("Missing address in stored decoy transaction. Storage is corrupt")
        };

        // In all of these, we ignore fields that we don't expect to find populated
        let action = match TxCode::from_u8(self.tx_type)? {
            TxCode::Transfer => {
                let from = self.address1.ok_or_else(transfer_addr_err)?;
                let sender = self.address2.ok_or_else(transfer_addr_err)?;
                let recipient = self.address3.ok_or_else(transfer_addr_err)?;
                let from = api.addr_humanize(&from)?;
                let sender = api.addr_humanize(&sender)?;
                let recipient = api.addr_humanize(&recipient)?;
                TxAction::Transfer {
                    from,
                    sender,
                    recipient,
                }
            }
            TxCode::Mint => {
                let minter = self.address1.ok_or_else(mint_addr_err)?;
                let recipient = self.address2.ok_or_else(mint_addr_err)?;
                let minter = api.addr_humanize(&minter)?;
                let recipient = api.addr_humanize(&recipient)?;
                TxAction::Mint { minter, recipient }
            }
            TxCode::Burn => {
                let burner = self.address1.ok_or_else(burn_addr_err)?;
                let owner = self.address2.ok_or_else(burn_addr_err)?;
                let burner = api.addr_humanize(&burner)?;
                let owner = api.addr_humanize(&owner)?;
                TxAction::Burn { burner, owner }
            }
            TxCode::Deposit => TxAction::Deposit {},
            TxCode::Redeem => TxAction::Redeem {},
            TxCode::Decoy => {
                let address = self.address1.ok_or_else(decoy_addr_err)?;
                let address = api.addr_humanize(&address)?;
                TxAction::Decoy { address }
            }
        };

        Ok(action)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub struct StoredExtendedTx {
    id: u64,
    action: StoredTxAction,
    coins: Coin,
    memo: Option<String>,
    block_time: u64,
    block_height: u64,
}

impl StoredExtendedTx {
    fn new(
        id: u64,
        action: StoredTxAction,
        coins: Coin,
        memo: Option<String>,
        block: &cosmwasm_std::BlockInfo,
    ) -> Self {
        Self {
            id,
            action,
            coins,
            memo,
            block_time: block.time.seconds(),
            block_height: block.height,
        }
    }

    fn into_humanized(self, api: &dyn Api) -> StdResult<ExtendedTx> {
        Ok(ExtendedTx {
            id: self.id,
            action: self.action.into_tx_action(api)?,
            coins: self.coins,
            memo: self.memo,
            block_time: self.block_time,
            block_height: self.block_height,
        })
    }

    fn from_stored_legacy_transfer(transfer: StoredLegacyTransfer) -> Self {
        let action = StoredTxAction::transfer(transfer.from, transfer.sender, transfer.receiver);
        Self {
            id: transfer.id,
            action,
            coins: transfer.coins,
            memo: transfer.memo,
            block_time: transfer.block_time,
            block_height: transfer.block_height,
        }
    }

    fn append_tx(
        store: &mut dyn Storage,
        tx: &StoredExtendedTx,
        for_address: &CanonicalAddr,
    ) -> StdResult<()> {
        let mut store = PrefixedStorage::multilevel(store, &[PREFIX_TXS, for_address.as_slice()]);
        let mut store = AppendStoreMut::attach_or_create(&mut store)?;
        store.push(tx)
    }

    pub fn get_txs(
        api: &dyn Api,
        storage: &dyn Storage,
        for_address: CanonicalAddr,
        page: u32,
        page_size: u32,
        should_filter_decoys: bool,
    ) -> StdResult<(Vec<ExtendedTx>, u64)> {
        let store =
            ReadonlyPrefixedStorage::multilevel(storage, &[PREFIX_TXS, for_address.as_slice()]);

        // Try to access the storage of txs for the account.
        // If it doesn't exist yet, return an empty list of transfers.
        let store = AppendStore::<StoredExtendedTx, _>::attach(&store);
        let store = if let Some(result) = store {
            result?
        } else {
            return Ok((vec![], 0));
        };

        // Take `page_size` txs starting from the latest tx, potentially skipping `page * page_size`
        // txs from the start.
        let tx_iter = store
            .iter()
            .rev()
            .skip((page * page_size) as _)
            .take(page_size as _);

        // The `and_then` here flattens the `StdResult<StdResult<ExtendedTx>>` to an `StdResult<ExtendedTx>`
        let txs: StdResult<Vec<ExtendedTx>> = if should_filter_decoys {
            tx_iter
                .filter(|tx| match tx {
                    Err(_) => true,
                    Ok(t) => t.action.tx_type != TxCode::Decoy.to_u8(),
                })
                .map(|tx| tx.map(|tx| tx.into_humanized(api)).and_then(|x| x))
                .collect()
        } else {
            tx_iter
                .map(|tx| tx.map(|tx| tx.into_humanized(api)).and_then(|x| x))
                .collect()
        };

        txs.map(|txs| (txs, store.len() as u64))
    }
}

// Storage functions:

fn increment_tx_count(store: &mut dyn Storage) -> StdResult<u64> {
    let id = ConfigStore::load_tx_count(store) + 1;
    ConfigStore::set_tx_count(store, &id)?;
    Ok(id)
}

fn store_tx_with_decoys(
    store: &mut dyn Storage,
    tx: &StoredExtendedTx,
    for_address: &CanonicalAddr,
    block: &cosmwasm_std::BlockInfo,
    decoys: &Option<Vec<CanonicalAddr>>,
    account_random_pos: &Option<usize>,
) -> StdResult<()> {
    let mut index_changer: Option<usize> = None;
    match decoys {
        None => StoredExtendedTx::append_tx(store, tx, for_address)?,
        Some(user_decoys) => {
            // It should always be set when decoys_vec is set
            let account_pos = account_random_pos.unwrap();

            for i in 0..user_decoys.len() + 1 {
                if i == account_pos {
                    StoredExtendedTx::append_tx(store, tx, for_address)?;
                    index_changer = Some(1);
                    continue;
                }

                let index = i - index_changer.unwrap_or_default();
                let decoy_action = StoredTxAction::decoy(&user_decoys[index]);
                let decoy_tx = StoredExtendedTx::new(
                    tx.id,
                    decoy_action,
                    tx.coins.clone(),
                    tx.memo.clone(),
                    block,
                );
                StoredExtendedTx::append_tx(store, &decoy_tx, &user_decoys[index])?;
            }
        }
    }

    Ok(())
}

fn store_transfer_tx_with_decoys(
    store: &mut dyn Storage,
    transfer: StoredLegacyTransfer,
    receiver: &CanonicalAddr,
    decoys: &Option<Vec<CanonicalAddr>>,
    account_random_pos: &Option<usize>,
) -> StdResult<()> {
    let mut index_changer: Option<usize> = None;
    match decoys {
        None => StoredLegacyTransfer::append_transfer(store, &transfer, receiver)?,
        Some(user_decoys) => {
            // It should always be set when decoys_vec is set
            let account_pos = account_random_pos.unwrap();

            for i in 0..user_decoys.len() + 1 {
                if i == account_pos {
                    StoredLegacyTransfer::append_transfer(store, &transfer, receiver)?;
                    index_changer = Some(1);
                    continue;
                }

                let index = i - index_changer.unwrap_or_default();
                let decoy_transfer = StoredLegacyTransfer {
                    id: transfer.id,
                    from: transfer.from.clone(),
                    sender: transfer.sender.clone(),
                    receiver: user_decoys[index].clone(),
                    coins: transfer.coins.clone(),
                    memo: transfer.memo.clone(),
                    block_time: transfer.block_time,
                    block_height: 0, // To identify the decoy
                };
                StoredLegacyTransfer::append_transfer(store, &decoy_transfer, &user_decoys[index])?;
            }
        }
    }

    Ok(())
}

#[allow(clippy::too_many_arguments)] // We just need them
pub fn store_transfer(
    store: &mut dyn Storage,
    owner: &CanonicalAddr,
    sender: &CanonicalAddr,
    receiver: &CanonicalAddr,
    amount: Uint128,
    denom: String,
    memo: Option<String>,
    block: &cosmwasm_std::BlockInfo,
    decoys: &Option<Vec<CanonicalAddr>>,
    account_random_pos: &Option<usize>,
) -> StdResult<()> {
    let id = increment_tx_count(store)?;
    let coins = Coin { denom, amount };
    let transfer = StoredLegacyTransfer {
        id,
        from: owner.clone(),
        sender: sender.clone(),
        receiver: receiver.clone(),
        coins,
        memo,
        block_time: block.time.seconds(),
        block_height: block.height,
    };
    let tx = StoredExtendedTx::from_stored_legacy_transfer(transfer.clone());

    // Write to the owners history if it's different from the other two addresses
    if owner != sender && owner != receiver {
        // cosmwasm_std::debug_print("saving transaction history for owner");
        StoredExtendedTx::append_tx(store, &tx, owner)?;
        StoredLegacyTransfer::append_transfer(store, &transfer, owner)?;
    }
    // Write to the sender's history if it's different from the receiver
    if sender != receiver {
        // cosmwasm_std::debug_print("saving transaction history for sender");
        StoredExtendedTx::append_tx(store, &tx, sender)?;
        StoredLegacyTransfer::append_transfer(store, &transfer, sender)?;
    }

    // Always write to the recipient's history
    // cosmwasm_std::debug_print("saving transaction history for receiver");
    store_tx_with_decoys(store, &tx, receiver, block, decoys, account_random_pos)?;
    store_transfer_tx_with_decoys(store, transfer, receiver, decoys, account_random_pos)?;

    Ok(())
}

#[allow(clippy::too_many_arguments)] // We just need them
pub fn store_mint(
    store: &mut dyn Storage,
    minter: CanonicalAddr,
    recipient: CanonicalAddr,
    amount: Uint128,
    denom: String,
    memo: Option<String>,
    block: &cosmwasm_std::BlockInfo,
    decoys: &Option<Vec<CanonicalAddr>>,
    account_random_pos: &Option<usize>,
) -> StdResult<()> {
    let id = increment_tx_count(store)?;
    let coins = Coin { denom, amount };
    let action = StoredTxAction::mint(minter.clone(), recipient.clone());
    let tx = StoredExtendedTx::new(id, action, coins, memo, block);

    if minter != recipient {
        store_tx_with_decoys(store, &tx, &recipient, block, decoys, account_random_pos)?;
    }

    StoredExtendedTx::append_tx(store, &tx, &minter)?;

    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn store_burn(
    store: &mut dyn Storage,
    owner: CanonicalAddr,
    burner: CanonicalAddr,
    amount: Uint128,
    denom: String,
    memo: Option<String>,
    block: &cosmwasm_std::BlockInfo,
    decoys: &Option<Vec<CanonicalAddr>>,
    account_random_pos: &Option<usize>,
) -> StdResult<()> {
    let id = increment_tx_count(store)?;
    let coins = Coin { denom, amount };
    let action = StoredTxAction::burn(owner.clone(), burner.clone());
    let tx = StoredExtendedTx::new(id, action, coins, memo, block);

    if burner != owner {
        store_tx_with_decoys(store, &tx, &owner, block, decoys, account_random_pos)?;
    }

    StoredExtendedTx::append_tx(store, &tx, &burner)?;
    Ok(())
}

pub fn store_deposit(
    store: &mut dyn Storage,
    recipient: &CanonicalAddr,
    amount: Uint128,
    denom: String,
    block: &cosmwasm_std::BlockInfo,
    decoys: &Option<Vec<CanonicalAddr>>,
    account_random_pos: &Option<usize>,
) -> StdResult<()> {
    let id = increment_tx_count(store)?;
    let coins = Coin { denom, amount };
    let action = StoredTxAction::deposit();
    let tx = StoredExtendedTx::new(id, action, coins, None, block);

    store_tx_with_decoys(store, &tx, recipient, block, decoys, account_random_pos)
}

pub fn store_redeem(
    store: &mut dyn Storage,
    redeemer: &CanonicalAddr,
    amount: Uint128,
    denom: String,
    block: &cosmwasm_std::BlockInfo,
    decoys: &Option<Vec<CanonicalAddr>>,
    account_random_pos: &Option<usize>,
) -> StdResult<()> {
    let id = increment_tx_count(store)?;
    let coins = Coin { denom, amount };
    let action = StoredTxAction::redeem();
    let tx = StoredExtendedTx::new(id, action, coins, None, block);

    store_tx_with_decoys(store, &tx, redeemer, block, decoys, account_random_pos)
}

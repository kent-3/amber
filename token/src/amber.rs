use cosmwasm_std::{CanonicalAddr, StdResult, Storage};
use secret_toolkit::storage::{Keymap, Keyset};

pub static OAC: Keyset<CanonicalAddr> = Keyset::new(b"oac");
pub static TELEGRAM: Keymap<CanonicalAddr, String> = Keymap::new(b"telegram");

pub mod bot {
    use cosmwasm_std::{StdError, StdResult, Storage};
    use secret_toolkit::crypto::sha_256;
    use secret_toolkit::storage::Item;

    pub static BOT_KEY: Item<[u8; 32]> = Item::new(b"bot_key");

    pub fn set_bot_key(store: &mut dyn Storage, key: String) -> StdResult<()> {
        BOT_KEY.save(store, &sha_256(key.as_bytes()))
    }

    pub fn check_bot_key(store: &dyn Storage, key: String) -> StdResult<()> {
        let key_hash = sha_256(key.as_bytes());
        if key_hash == BOT_KEY.load(store)? {
            Ok(())
        } else {
            Err(StdError::generic_err("not authorized"))
        }
    }
}

pub struct OacStore {}
impl OacStore {
    /// Returns the current known number of users with 1+ AMBER.
    pub fn get_member_count(storage: &dyn Storage) -> u32 {
        OAC.get_len(storage).unwrap_or_default()
    }

    /// Add or remove the account key from the OAC Keyset.
    pub fn set_status(
        store: &mut dyn Storage,
        account: &CanonicalAddr,
        previous_balance: u128,
        balance: u128,
    ) -> StdResult<()> {
        Ok(match (previous_balance >= 1, balance >= 1) {
            (false, false) | (true, false) => {
                OAC.remove(store, account)?;
            }
            (true, true) | (false, true) => {
                OAC.insert(store, account)?;
            }
        })
    }

    // Allow anyone to add a handle, regardless of balance.
    pub fn save_telegram_handle(
        storage: &mut dyn Storage,
        account: &CanonicalAddr,
        handle: &String,
    ) -> StdResult<()> {
        TELEGRAM.insert(storage, account, handle)
    }

    // Allow user to remove their handle.
    pub fn remove_telegram_handle(
        storage: &mut dyn Storage,
        account: &CanonicalAddr,
    ) -> StdResult<()> {
        TELEGRAM.remove(storage, account)
    }

    /// Returns only Telegram handles that belong to OAC.
    pub fn get_oac_telegram_handles(storage: &dyn Storage) -> StdResult<Vec<String>> {
        let members = OAC
            .iter(storage)?
            .filter_map(|entry_result| match entry_result {
                Ok(entry) => TELEGRAM.get(storage, &entry),
                Err(_) => None, // Ignore errors and proceed with the next entry
            })
            .collect();

        Ok(members)
    }
}

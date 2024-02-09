use base64::{engine::general_purpose, Engine as _};
use cosmwasm_std::{CanonicalAddr, StdResult, Storage};
use secret_toolkit::storage::{Keymap, Keyset};
use secret_toolkit_crypto::sha_256;

/// A set of accounts with 1+ AMBER.
pub static OAC_MEMBERS: Keyset<CanonicalAddr> = Keyset::new(b"oac");
/// A set of valid codes used to access something.
pub static INVITE_CODES: Keyset<String> = Keyset::new(b"invite_codes");
/// A map of accounts with 1+ AMBER to a unique code used to access something.
pub static OAC_MEMBER_CODES: Keymap<CanonicalAddr, String> = Keymap::new(b"telegram");

// pub mod bot {
//     use cosmwasm_std::{StdError, StdResult, Storage};
//     use secret_toolkit::crypto::sha_256;
//     use secret_toolkit::storage::Item;
//
//     pub static BOT_KEY: Item<[u8; 32]> = Item::new(b"bot_key");
//
//     pub fn set_bot_key(store: &mut dyn Storage, key: String) -> StdResult<()> {
//         BOT_KEY.save(store, &sha_256(key.as_bytes()))
//     }
//
//     pub fn check_bot_key(store: &dyn Storage, key: String) -> StdResult<()> {
//         let key_hash = sha_256(key.as_bytes());
//         if key_hash == BOT_KEY.load(store)? {
//             Ok(())
//         } else {
//             Err(StdError::generic_err("not authorized"))
//         }
//     }
// }

pub struct OacStore {}
impl OacStore {
    /// Returns the current known number of users with 1+ AMBER.
    pub fn get_member_count(storage: &dyn Storage) -> u32 {
        OAC_MEMBERS.get_len(storage).unwrap_or_default()
    }

    /// Add or remove the account key from the OAC Keyset.
    pub fn update_member_status(
        store: &mut dyn Storage,
        account: &CanonicalAddr,
        previous_balance: u128,
        balance: u128,
    ) -> StdResult<()> {
        Ok(match (previous_balance >= 1, balance >= 1) {
            (false, false) | (true, false) => {
                Self::remove_member(store, account)?;
            }
            (true, true) | (false, true) => {
                Self::add_member(store, account)?;
            }
        })
    }

    /// Add account to the set of `OAC_MEMBERS` and generate a new code for them.
    /// The code is stored in separate set for ease of checking.
    /// The code is also stored in a map so it can be retrieved when removing the account.
    fn add_member(storage: &mut dyn Storage, account: &CanonicalAddr) -> StdResult<()> {
        let is_new = OAC_MEMBERS.insert(storage, account)?;
        if is_new {
            let code = sha_256(account.as_slice());
            INVITE_CODES.insert(storage, &general_purpose::STANDARD.encode(code))?;
            OAC_MEMBER_CODES.insert(storage, account, &general_purpose::STANDARD.encode(code))?;
        }
        Ok(())
    }

    /// Remove account from the set of `OAC_MEMBERS`, and remove their associated code from `INVITE_CODES`.
    fn remove_member(storage: &mut dyn Storage, account: &CanonicalAddr) -> StdResult<()> {
        // there should always be a code here, but safety first
        if let Some(code) = OAC_MEMBER_CODES.get(storage, account) {
            INVITE_CODES.remove(storage, &code)?;
        }
        OAC_MEMBER_CODES.remove(storage, account)?;
        OAC_MEMBERS.remove(storage, account)
    }
}

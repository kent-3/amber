use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};

use cosmwasm_std::{CanonicalAddr, Env, StdResult, Storage};
use secret_toolkit::crypto::{sha_256, ContractPrng};
use secret_toolkit::storage::{Keymap, Keyset};

/// A set of accounts with 1+ AMBER.
pub static OAC_MEMBERS: Keyset<CanonicalAddr> = Keyset::new(b"oac");
/// A set of valid codes used to access something.
pub static OAC_INVITE_CODES: Keyset<[u8; 32]> = Keyset::new(b"invite_codes");
/// A map of accounts with 1+ AMBER to a unique code used to access something.
pub static OAC_MEMBER_CODES: Keymap<CanonicalAddr, [u8; 32]> = Keymap::new(b"telegram");

pub struct OneAmberStore {}
impl OneAmberStore {
    /// Returns the current known number of users with 1+ AMBER.
    pub fn get_member_count(storage: &dyn Storage) -> u32 {
        OAC_MEMBERS.get_len(storage).unwrap_or_default()
    }

    pub fn get_code(storage: &dyn Storage, account: &CanonicalAddr) -> Option<String> {
        OAC_MEMBER_CODES
            .get(storage, account)
            .map(|code_bytes| URL_SAFE_NO_PAD.encode(code_bytes))
    }

    /// Given a list of codes, return only the ones that are valid.
    pub fn validate_codes(storage: &dyn Storage, codes: Vec<String>) -> Vec<String> {
        codes
            .into_iter()
            .filter_map(|encoded_code| {
                let decoded_bytes = match URL_SAFE_NO_PAD.decode(encoded_code).ok() {
                    Some(bytes) => bytes,
                    None => return None, // Skip if decoding fails.
                };

                let code_bytes: [u8; 32] = match decoded_bytes.try_into().ok() {
                    Some(array) => array,
                    None => return None, // Skip if conversion fails.
                };

                match OAC_INVITE_CODES.contains(storage, &code_bytes) {
                    true => Some(URL_SAFE_NO_PAD.encode(code_bytes)),
                    false => None,
                }
            })
            .collect::<Vec<String>>()
    }

    pub fn update_member(
        store: &mut dyn Storage,
        account: &CanonicalAddr,
        previous_balance: u128,
        balance: u128,
        env: &Env,
    ) -> StdResult<()> {
        match (previous_balance >= 1_000_000, balance >= 1_000_000) {
            (false, false) | (true, false) => {
                Self::remove_member(store, account)?;
            }
            (true, true) | (false, true) => {
                Self::add_member(store, account, env)?;
            }
        }

        Ok(())
    }

    /// Add account to the set of `OAC_MEMBERS` and generate a new code for them.
    /// The code is stored in separate set for ease of checking.
    /// The code is also stored in a map so it can be retrieved when removing the account.
    fn add_member(storage: &mut dyn Storage, account: &CanonicalAddr, env: &Env) -> StdResult<()> {
        if OAC_MEMBERS.contains(storage, account) {
            return Ok(());
        }

        OAC_MEMBERS.insert(storage, account)?;

        let (_, code) = Self::generate_code(env);
        OAC_INVITE_CODES.insert(storage, &code)?;
        OAC_MEMBER_CODES.insert(storage, account, &code)?;

        Ok(())
    }

    /// Remove account from the set of `OAC_MEMBERS`, and remove their associated code.
    fn remove_member(storage: &mut dyn Storage, account: &CanonicalAddr) -> StdResult<()> {
        if !OAC_MEMBERS.contains(storage, account) {
            return Ok(());
        }

        // there should always be a code here, but safety first
        if let Some(code) = OAC_MEMBER_CODES.get(storage, account) {
            OAC_INVITE_CODES.remove(storage, &code)?;
            OAC_MEMBER_CODES.remove(storage, account)?;
            OAC_MEMBERS.remove(storage, account)?
        }

        Ok(())
    }

    /// Generate a unique code per OAC member, using Secret VRF.
    ///
    /// Example base64 encoded string: `"Lx8NsS2V9HOJstXp321Fh4wI4i9fqSSfb85utUEWos"`.
    fn generate_code(env: &Env) -> (String, [u8; 32]) {
        let mut rng = ContractPrng::from_env(env);
        let rand_slice = rng.rand_bytes();

        let code_bytes = sha_256(&rand_slice);
        let code_string = URL_SAFE_NO_PAD.encode(code_bytes);

        (code_string, code_bytes)
    }
}

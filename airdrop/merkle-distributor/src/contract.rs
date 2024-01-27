use cosmwasm_std::{
    log, to_binary, Api, Binary, Env, Extern, HandleResponse, HumanAddr, InitResponse, Querier,
    StdError, StdResult, Storage, Uint128,
};
use secret_toolkit::snip20;
use secret_toolkit::storage::{TypedStore, TypedStoreMut};

use crate::merkle_proof::{encode_as_merkle_leaf, verify_proof};
use crate::msg::{HandleMsg, InitMsg, QueryMsg};
use crate::state::{config, config_read, State};

use byteorder::{BigEndian, ByteOrder};
use hex::FromHex;
use web3::signing::keccak256;

pub fn init<S: Storage, A: Api, Q: Querier>(
    deps: &mut Extern<S, A, Q>,
    env: Env,
    msg: InitMsg,
) -> StdResult<InitResponse> {
    let state = State {
        token_addr: msg.token_addr,
        token_hash: msg.token_hash,
        merkle_root: msg.merkle_root,
        claimed_bitmap: vec![],
        contract_address: env.contract.address,
        viewing_key: "amber_rocks".to_string(),
        admin: env.message.sender,
    };

    config(&mut deps.storage).save(&state)?;

    Ok(InitResponse {
        messages: vec![snip20::set_viewing_key_msg(
            state.viewing_key,
            None,
            256,
            state.token_hash,
            state.token_addr,
        )?],
        log: vec![],
    })
}

pub fn handle<S: Storage, A: Api, Q: Querier>(
    deps: &mut Extern<S, A, Q>,
    env: Env,
    msg: HandleMsg,
) -> StdResult<HandleResponse> {
    match msg {
        HandleMsg::Claim {
            index,
            address,
            amount,
            proof,
        } => claim(deps, env, index.u128(), address, amount.u128(), proof),
        HandleMsg::Retrieve { address } => retrieve(deps, env, address),
    }
}

pub fn query<S: Storage, A: Api, Q: Querier>(
    deps: &Extern<S, A, Q>,
    msg: QueryMsg,
) -> StdResult<Binary> {
    match msg {
        QueryMsg::IsClaimed { index } => to_binary(&is_claimed(deps, index.u128())),
        QueryMsg::IsUnclaimed {} => to_binary(&is_unclaimed(deps)),
    }
}

pub fn claim<S: Storage, A: Api, Q: Querier>(
    deps: &mut Extern<S, A, Q>,
    _env: Env,
    index: u128,
    address: HumanAddr,
    amount: u128,
    proof: Vec<String>,
) -> StdResult<HandleResponse> {
    let is_claimed = is_claimed(deps, index);
    if is_claimed {
        return Err(StdError::generic_err("drop already claimed"));
    }

    let state = config_read(&deps.storage).load()?;

    let hex_address = deps.api.canonical_address(&address)?;
    let proof_bytes = proof
        .into_iter()
        .map(|p| <[u8; 32]>::from_hex(p).unwrap())
        .collect();
    let root_bytes = <[u8; 32]>::from_hex(state.merkle_root).unwrap();
    let leaf_bytes = keccak256(&encode_as_merkle_leaf(
        index,
        hex_address.as_slice(),
        amount,
    ));
    let valid_proof = verify_proof(proof_bytes, root_bytes, leaf_bytes);
    if !valid_proof {
        return Err(StdError::generic_err("invalid proof"));
    }

    set_claimed(deps, index);

    Ok(HandleResponse {
        messages: vec![snip20::transfer_msg(
            address,
            Uint128(amount),
            None,
            1,
            state.token_hash,
            state.token_addr,
        )?],
        log: vec![log("status", "success")],
        data: None,
    })
}

fn set_claimed<S: Storage, A: Api, Q: Querier>(deps: &mut Extern<S, A, Q>, index: u128) {
    let mut claimed_bitmap = TypedStoreMut::attach(&mut deps.storage);

    let mut claimed_word_index = [0u8; 16];
    BigEndian::write_u128(&mut claimed_word_index, index / 128);

    let mut claimed_word: u128 = claimed_bitmap.load(&claimed_word_index).unwrap_or(0);
    let claimed_bit_index = index % 128;
    claimed_word |= 1 << claimed_bit_index;

    claimed_bitmap
        .store(&claimed_word_index, &claimed_word)
        .unwrap();
}

pub fn is_claimed<S: Storage, A: Api, Q: Querier>(deps: &Extern<S, A, Q>, index: u128) -> bool {
    let claimed_bitmap = TypedStore::attach(&deps.storage);

    let mut claimed_word_index = [0u8; 16];
    BigEndian::write_u128(&mut claimed_word_index, index / 128);

    let claimed_word: u128 = claimed_bitmap.load(&claimed_word_index).unwrap_or(0);
    let claimed_bit_index = index % 128;
    let mask = 1 << claimed_bit_index;

    claimed_word & mask == mask
}

// query the token contract for how many tokens the distributor contract has left
pub fn is_unclaimed<S: Storage, A: Api, Q: Querier>(deps: &Extern<S, A, Q>) -> StdResult<Uint128> {
    let state = config_read(&deps.storage).load()?;

    let response: snip20::BalanceResponse = snip20::QueryMsg::Balance {
        address: state.contract_address,
        key: state.viewing_key,
    }
    .query(&deps.querier, 256, state.token_hash, state.token_addr)?;

    Ok(response.balance.amount)
}

// send unclaimed tokens to target address
pub fn retrieve<S: Storage, A: Api, Q: Querier>(
    deps: &mut Extern<S, A, Q>,
    env: Env,
    address: HumanAddr,
) -> StdResult<HandleResponse> {
    let state = config_read(&deps.storage).load()?;

    if state.admin != env.message.sender {
        return Err(StdError::generic_err("only admin can do that"));
    }

    let response: snip20::BalanceResponse = snip20::QueryMsg::Balance {
        address: state.contract_address,
        key: state.viewing_key,
    }
    .query(
        &deps.querier,
        1,
        state.token_hash.clone(),
        state.token_addr.clone(),
    )?;

    let unclaimed = response.balance.amount;

    Ok(HandleResponse {
        messages: vec![snip20::transfer_msg(
            address,
            unclaimed,
            None,
            1,
            state.token_hash,
            state.token_addr,
        )?],
        log: vec![log("status", "success")],
        data: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::msg::HandleMsg::Claim;
    use cosmwasm_std::from_binary;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, MockApi, MockQuerier, MockStorage};

    fn init_helper() -> (
        StdResult<InitResponse>,
        Extern<MockStorage, MockApi, MockQuerier>,
    ) {
        let mut deps = mock_dependencies(20, &[]);
        let env = mock_env("admin", &[]);

        let init_msg = InitMsg {
            token_addr: Default::default(),
            token_hash: "".to_string(),
            merkle_root: "44cdb551dd2a331bed89246a24f515d12316740f8b53df8df2d91e96899e3bf7"
                .to_string(),
        };

        (init(&mut deps, env, init_msg), deps)
    }

    #[test]
    #[ignore] // Apparently the `canonicalize_address` function doesn't work for real addresses in `MockApi`
    fn test_claim() {
        let (_init_result, mut deps) = init_helper();

        // Externally built MerkleTree
        let address = HumanAddr("secret1gs8hau7q8xcya2jum7anj9ap47hw96rmhs2smv".to_string());
        let claim_msg = Claim {
            index: Uint128(2),
            address,
            amount: Uint128(11),
            proof: vec![
                "88f359f9f9d190245e8a0d52959a46992170360d4feacd2ff61d6ef44669203f".to_string(),
            ],
        };

        let handle_response = handle(&mut deps, mock_env("doesntmatter", &[]), claim_msg).unwrap();
        assert_eq!(handle_response.log[0], log("status", "success"));
    }

    #[test]
    fn test_set_claimed() {
        let (_init_result, mut deps) = init_helper();

        let index: u128 = 1;
        let is_claimed_query = QueryMsg::IsClaimed {
            index: Uint128(index),
        };

        let query_result: bool =
            from_binary(&query(&deps, is_claimed_query.clone()).unwrap()).unwrap();
        assert!(!query_result);

        set_claimed(&mut deps, index);
        let query_result: bool = from_binary(&query(&deps, is_claimed_query).unwrap()).unwrap();
        assert!(query_result);

        let index: u128 = 128;
        let is_claimed_query = QueryMsg::IsClaimed {
            index: Uint128(index),
        };

        let query_result: bool =
            from_binary(&query(&deps, is_claimed_query.clone()).unwrap()).unwrap();
        assert!(!query_result);

        set_claimed(&mut deps, index);
        let query_result: bool = from_binary(&query(&deps, is_claimed_query).unwrap()).unwrap();
        assert!(query_result);

        let index: u128 = 160000;
        let is_claimed_query = QueryMsg::IsClaimed {
            index: Uint128(index),
        };

        let query_result: bool =
            from_binary(&query(&deps, is_claimed_query.clone()).unwrap()).unwrap();
        assert!(!query_result);

        set_claimed(&mut deps, index);
        let query_result: bool = from_binary(&query(&deps, is_claimed_query).unwrap()).unwrap();
        assert!(query_result);

        let index: u128 = u128::MAX;
        let is_claimed_query = QueryMsg::IsClaimed {
            index: Uint128(index),
        };

        let query_result: bool =
            from_binary(&query(&deps, is_claimed_query.clone()).unwrap()).unwrap();
        assert!(!query_result);

        set_claimed(&mut deps, index);
        let query_result: bool = from_binary(&query(&deps, is_claimed_query).unwrap()).unwrap();
        assert!(query_result);
    }
}

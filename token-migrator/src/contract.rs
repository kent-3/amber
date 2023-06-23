use cosmwasm_std::{
    entry_point, to_binary, Addr, Binary, Deps, DepsMut, Env, MessageInfo, Response,
    StdError, StdResult, Uint128,
};
use secret_toolkit::snip20;

use crate::msg::{
    BalancesResponse, ExecuteAnswer, ExecuteMsg, InstantiateMsg, QueryMsg, ResponseStatus::Success,
};
use crate::state::{config, config_read, State};

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> StdResult<Response> {
    let state = State {
        admin: info.sender,
        contract_address: env.contract.address,
        old_token_addr: msg.old_token_addr,
        old_token_hash: msg.old_token_hash,
        old_token_viewing_key: "amber_rocks".to_string(),
        new_token_addr: msg.new_token_addr,
        new_token_hash: msg.new_token_hash,
        new_token_viewing_key: "amber_still_rocks".to_string(),
    };

    config(deps.storage).save(&state)?;

    let msg1 = snip20::set_viewing_key_msg(
        state.old_token_viewing_key,
        None,
        256,
        state.old_token_hash.clone(),
        state.old_token_addr.clone().into_string(),
    )?;

    let msg2 = snip20::set_viewing_key_msg(
        state.new_token_viewing_key,
        None,
        256,
        state.new_token_hash,
        state.new_token_addr.into_string(),
    )?;

    let msg3 = snip20::register_receive_msg(
        env.contract.code_hash,
        None,
        256,
        state.old_token_hash,
        state.old_token_addr.into_string(),
    )?;

    Ok(Response::new()
        .add_messages(vec![msg1, msg2, msg3])
    )
}

#[entry_point]
pub fn execute(deps: DepsMut, env: Env, info: MessageInfo, msg: ExecuteMsg) -> StdResult<Response> {
    match msg {
        ExecuteMsg::Receive { from, amount, .. } => try_receive(deps, env, info, from, amount),
    }
}

pub fn try_receive(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    from: Addr,
    amount: Uint128,
) -> StdResult<Response> {
    let state = config_read(deps.storage).load()?;
    if &state.old_token_addr != &info.sender {
        return Err(StdError::generic_err(format!(
            "{} is not a known SNIP-20 token that this contract registered to",
            info.sender
        )));
    }

    // Transfer an amount of new tokens equal to the old tokens received, 
    // to the same account from which they were sent
    let message = snip20::transfer_msg(
        from.into_string(),
        amount,
        Some("Thanks for migrating".to_string()),
        None,
        256,
        state.new_token_hash,
        state.new_token_addr.into_string(),
    )?;

    Ok(Response::new()
        .add_message(message)
        .set_data(to_binary(&ExecuteAnswer::Receive { status: Success })?))
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetBalances {} => to_binary(&query_balances(deps)?),
    }
}

fn query_balances(deps: Deps) -> StdResult<BalancesResponse> {
    let state = config_read(deps.storage).load()?;

    let old_token = snip20::balance_query(
        deps.querier,
        state.contract_address.clone().into_string(),
        state.old_token_viewing_key,
        256,
        state.old_token_hash,
        state.old_token_addr.into_string(),
    )?;

    let new_token = snip20::balance_query(
        deps.querier,
        state.contract_address.into_string(),
        state.new_token_viewing_key,
        256,
        state.new_token_hash,
        state.new_token_addr.into_string(),
    )?;

    Ok(BalancesResponse {
        old_token,
        new_token,
    })
}

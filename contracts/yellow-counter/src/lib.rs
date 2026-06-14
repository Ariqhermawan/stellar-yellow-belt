#![no_std]

//! Yellow Belt demo: a u32 counter in INSTANCE storage.
//! `increment(by)` reads -> adds -> writes back -> publishes an event;
//! `get()` reads; `reset()` zeroes it. Every write bumps the instance TTL
//! so the contract instance and its storage stay alive.

use soroban_sdk::{contract, contractimpl, symbol_short, Env, Symbol};

// Single instance-storage key for the counter.
const COUNTER: Symbol = symbol_short!("COUNTER");

// TTL bump policy (in ledgers). If the instance has fewer than
// BUMP_THRESHOLD ledgers of life left, extend it to BUMP_TO.
const BUMP_THRESHOLD: u32 = 100_000;
const BUMP_TO: u32 = 600_000;

#[contract]
pub struct CounterContract;

#[contractimpl]
impl CounterContract {
    /// Read current value, add `by`, write it back, emit an event,
    /// and return the new value.
    pub fn increment(env: Env, by: u32) -> u32 {
        let current: u32 = env.storage().instance().get(&COUNTER).unwrap_or(0);
        // overflow-checks = true in the release profile turns wraparound into a trap.
        let new_value: u32 = current + by;

        env.storage().instance().set(&COUNTER, &new_value);

        // Keep the instance (and its storage) alive on every write.
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);

        // Publish an event: topic tuple ("inc",), data = new value.
        env.events().publish((symbol_short!("inc"),), new_value);

        new_value
    }

    /// Return the current counter value (0 if never set).
    pub fn get(env: Env) -> u32 {
        env.storage().instance().get(&COUNTER).unwrap_or(0)
    }

    /// Reset the counter to 0, emit a reset event, bump TTL.
    pub fn reset(env: Env) {
        env.storage().instance().set(&COUNTER, &0u32);
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
        env.events().publish((symbol_short!("reset"),), 0u32);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn increment_get_reset() {
        let env = Env::default();
        let contract_id = env.register(CounterContract, ());
        let client = CounterContractClient::new(&env, &contract_id);

        assert_eq!(client.get(), 0);
        assert_eq!(client.increment(&5), 5);
        assert_eq!(client.increment(&3), 8);
        assert_eq!(client.get(), 8);

        client.reset();
        assert_eq!(client.get(), 0);
    }
}

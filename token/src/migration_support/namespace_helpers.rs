use super::traits::{ReadonlyStorage, Storage};

pub(crate) fn get_with_prefix<S: ReadonlyStorage>(
    storage: &S,
    namespace: &[u8],
    key: &[u8],
) -> Option<Vec<u8>> {
    storage.get(&concat(namespace, key))
}

pub(crate) fn set_with_prefix<S: Storage>(
    storage: &mut S,
    namespace: &[u8],
    key: &[u8],
    value: &[u8],
) {
    storage.set(&concat(namespace, key), value);
}

pub(crate) fn remove_with_prefix<S: Storage>(storage: &mut S, namespace: &[u8], key: &[u8]) {
    storage.remove(&concat(namespace, key));
}

#[inline]
fn concat(namespace: &[u8], key: &[u8]) -> Vec<u8> {
    let mut k = namespace.to_vec();
    k.extend_from_slice(key);
    k
}

#[cfg(test)]
mod test {
    use super::super::length_prefixed::to_length_prefixed;
    use super::*;
    use cosmwasm_std::testing::MockStorage;

    #[test]
    fn prefix_get_set() {
        let mut storage = MockStorage::new();
        let prefix = to_length_prefixed(b"foo");

        set_with_prefix(&mut storage, &prefix, b"bar", b"gotcha");
        let rfoo = get_with_prefix(&storage, &prefix, b"bar");
        assert_eq!(rfoo, Some(b"gotcha".to_vec()));

        // no collisions with other prefixes
        let other_prefix = to_length_prefixed(b"fo");
        let collision = get_with_prefix(&storage, &other_prefix, b"obar");
        assert_eq!(collision, None);
    }
}

use byteorder::{BigEndian, ByteOrder};
use web3::signing::keccak256;

/// Return `true` if `f` is less or equal to `s`
fn is_correct_order(f: [u8; 32], s: [u8; 32]) -> bool {
    for i in 0..32 {
        if f[i] < s[i] {
            return true;
        }

        if f[i] > s[i] {
            return false;
        }
    }

    true
}

pub fn verify_proof(proof: Vec<[u8; 32]>, root: [u8; 32], leaf: [u8; 32]) -> bool {
    let mut computed_hash = leaf;

    for proof_el in proof {
        let mut encoded = vec![];
        if is_correct_order(computed_hash, proof_el) {
            encoded.extend_from_slice(&computed_hash);
            encoded.extend_from_slice(&proof_el);
        } else {
            encoded.extend_from_slice(&proof_el);
            encoded.extend_from_slice(&computed_hash);
        }
        computed_hash = keccak256(&encoded);
    }

    computed_hash == root
}

pub fn encode_as_merkle_leaf(index: u128, addr: &[u8] /*String*/, amount: u128) -> Vec<u8> {
    let mut encoded = vec![];

    // Encode index
    // This essentially encodes it as u256 to match Ethereum encoding
    let mut index_bytes = [0u8; 16];
    BigEndian::write_uint128(&mut index_bytes, index, 16);
    encoded.extend_from_slice(&[0u8; 16]);
    encoded.extend_from_slice(&index_bytes);

    // Encode address
    encoded.extend_from_slice(/*&hex::decode(*/ addr /*).unwrap()*/);

    // Encode amount
    // This essentially encodes it as u256 to match Ethereum encoding
    let mut amount_bytes = [0u8; 16];
    BigEndian::write_uint128(&mut amount_bytes, amount, 16);
    encoded.extend_from_slice(&[0u8; 16]);
    encoded.extend_from_slice(&amount_bytes);

    encoded
}

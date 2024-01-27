import { MerkleTree } from "merkletreejs";
import sha256 from "crypto-js/sha256.js";

const leaves = ['a', 'b', 'c'].map(x => sha256(x))
const tree = new MerkleTree(leaves, sha256)
const root = tree.getRoot().toString('hex')
const leaf = sha256('a')
const proof = tree.getProof(leaf)
console.log(tree.verify(proof, leaf, root)) // true

const badLeaves = ['a', 'x', 'c'].map(x => sha256(x))
const badTree = new MerkleTree(badLeaves, sha256)
const badLeaf = sha256('x')
const badProof = tree.getProof(badLeaf)
console.log(tree.verify(badProof, leaf, root)) // false

console.log(tree.toString())

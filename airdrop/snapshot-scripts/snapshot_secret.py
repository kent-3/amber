import json
import os
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
from functools import partial, wraps
from itertools import zip_longest
from pathlib import Path

import toml
from brownie import Wei, accounts, rpc, web3
from eth_abi import decode_single, encode_single
from eth_abi.packed import encode_abi_packed
from eth_utils import encode_hex
from toolz import valfilter, valmap
from tqdm import tqdm, trange
from click import secho


def cached(path):
    path = Path(path)
    codec = {'.toml': toml, '.json': json}[path.suffix]
    codec_args = {'.json': {'indent': 2}}.get(path.suffix, {})

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if path.exists():
                print('load from cache', path)
                return codec.loads(path.read_text())
            else:
                result = func(*args, **kwargs)
                os.makedirs(path.parent, exist_ok=True)
                path.write_text(codec.dumps(result, **codec_args))
                print('write to cache', path)
                return result

        return wrapper

    return decorator


# def transfers_to_balances(address):
#     balances = Counter()
#     contract = web3.eth.contract(address, abi=DAI.abi)
#     for start in trange(START_BLOCK, SNAPSHOT_BLOCK, 1000):
#         end = min(start + 999, SNAPSHOT_BLOCK)
#         logs = contract.events.Transfer().getLogs(fromBlock=start, toBlock=end)
#         for log in logs:
#             if log['args']['src'] != ZERO_ADDRESS:
#                 balances[log['args']['src']] -= log['args']['wad']
#             if log['args']['dst'] != ZERO_ADDRESS:
#                 balances[log['args']['dst']] += log['args']['wad']

#     return valfilter(bool, dict(balances.most_common()))


class MerkleTree:
    def __init__(self, elements):
        self.elements = sorted(set(web3.keccak(hexstr=el) for el in elements))
        self.layers = MerkleTree.get_layers(self.elements)

    @property
    def root(self):
        return self.layers[-1][0]

    def get_proof(self, el):
        el = web3.keccak(hexstr=el)
        idx = self.elements.index(el)
        proof = []
        for layer in self.layers:
            pair_idx = idx + 1 if idx % 2 == 0 else idx - 1
            if pair_idx < len(layer):
                proof.append(encode_hex(layer[pair_idx]))
            idx //= 2
        return proof

    @staticmethod
    def get_layers(elements):
        layers = [elements]
        while len(layers[-1]) > 1:
            layers.append(MerkleTree.get_next_layer(layers[-1]))
        return layers

    @staticmethod
    def get_next_layer(elements):
        return [MerkleTree.combined_hash(a, b) for a, b in zip_longest(elements[::2], elements[1::2])]

    @staticmethod
    def combined_hash(a, b):
        if a is None:
            return b
        if b is None:
            return a
        return web3.keccak(b''.join(sorted([a, b])))


@cached('snapshot_secret/01-balances.toml')
def step_01():
    os.system("node scripts/bech32_to_bytes.cjs")
    balances = toml.load("snapshot/00-bytes.toml")

    return balances


@cached('snapshot_secret/07-merkle-distribution.json')
def step_07(balances):
    elements = [(index, account, amount)
                for index, (account, amount) in enumerate(balances.items())]
    nodes = [encode_hex(encode_abi_packed(
        ['uint', 'address', 'uint'], el)) for el in elements]
    tree = MerkleTree(nodes)
    distribution = {
        'merkleRoot': encode_hex(tree.root),
        'tokenTotal': hex(sum(balances.values())),
        'claims': {
            user: {'index': index, 'amount': hex(
                amount), 'proof': tree.get_proof(nodes[index])}
            for index, user, amount in elements
        },
    }
    print(f'merkle root: {encode_hex(tree.root)}')
    return distribution


def main():
    token_balances = step_01()
    step_07(token_balances)


main()

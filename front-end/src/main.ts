// @ts-nocheck

import { SecretNetworkClient } from "secretjs";
import { sign } from "curve25519-js";
import axios from 'axios';

interface KeplrWindow extends Window {
  keplr: Function,
  getEnigmaUtils(): Function,
  getOfflineSigner(): Function,
  getOfflineSignerOnlyAmino(_:string): Function,
  enable(_:string): Function,
  getAccounts(): Function,
}

declare let window: KeplrWindow;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

while (
  !window.keplr ||
  !window.getEnigmaUtils ||
  !window.getOfflineSignerOnlyAmino
) {
  await sleep(100);
}

let myAddress: string;
let secretjs: SecretNetworkClient;

const distributorContractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
const amberContractAddress: string = import.meta.env.VITE_SNIP20_ADDRESS;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID;

window.onload = async () => {
  if (!window.getOfflineSigner || !window.keplr) {
    alert("Please install Keplr extension");
  } else {
    if (CHAIN_ID?.includes("secretdev") && keplr.experimentalSuggestChain) {
      try {
        // Keplr v0.6.4 introduces an experimental feature that supports the feature to suggests the chain from a webpage.
        // The code below is not needed for secret-4 or other integrated chains, but may be helpful if you’re adding a custom chain.
        // If the user approves, the chain will be added to the user's Keplr extension.
        // If the user rejects it or the suggested chain information doesn't include the required fields, it will throw an error.
        // If the same chain id is already registered, it will resolve and not require the user interactions.
        // @ts-expect-error
        await window.keplr.experimentalSuggestChain({
          // Chain-id of the testnet chain.
          chainId: "secretdev-1",
          // The name of the chain to be displayed to the user.
          chainName: "Localsecret Testnet",
          rpc: "http://localhost:26657",
          rest: "http://localhost:1317",
          stakeCurrency: {
            coinDenom: "SCRT",
            coinMinimalDenom: "uscrt",
            coinDecimals: 6,
            // coinGeckoId: "secret"
          },
          bip44: {
            coinType: 529,
          },
          bech32Config: {
            bech32PrefixAccAddr: "secret",
            bech32PrefixAccPub: "secretpub",
            bech32PrefixValAddr: "secretvaloper",
            bech32PrefixValPub: "secretvaloperpub",
            bech32PrefixConsAddr: "secretvalcons",
            bech32PrefixConsPub: "secretvalconspub"
          },
          currencies: [{
            coinDenom: "SCRT",
            coinMinimalDenom: "uscrt",
            coinDecimals: 6,
            // coinGeckoId: "secret"
          }],
          feeCurrencies: [{
            coinDenom: "SCRT",
            coinMinimalDenom: "uscrt",
            coinDecimals: 6,
            coinGeckoId: "secret"
          }],
          // (Optional) The number of the coin type.
          // This field is only used to fetch the address from ENS.
          // Ideally, it is recommended to be the same with BIP44 path's coin type.
          // However, some early chains may choose to use the Cosmos Hub BIP44 path of '118'.
          // So, this is separated to support such chains.
          coinType: 529,
          // These gas prices are for pulsar-2
          gasPriceStep: {
              low: 0.1,
              average: 0.25,
              high: 0.4
          },
          features: ["secretwasm", "ibc-go"]
        });
      } catch {
          alert("Failed to suggest the chain");
        }
    } else {
        alert("Please use the recent version of keplr extension"); 
    }
  }

  await window.keplr.enable(CHAIN_ID);

  const keplrOfflineSigner = window.getOfflineSignerOnlyAmino(CHAIN_ID);
  [{ address: myAddress }] = await keplrOfflineSigner.getAccounts();

  secretjs = await SecretNetworkClient.create({
    grpcWebUrl: import.meta.env.VITE_GRPC_URL,
    chainId: CHAIN_ID,
    wallet: keplrOfflineSigner,
    walletAddress: myAddress,
    encryptionUtils: window.getEnigmaUtils(CHAIN_ID),
  });

  
  document.getElementById('claim').disabled = false;
  // document.getElementById('submit').disabled = false;
  // document.getElementById('claim').innerHTML = '';
  
}
const button = document.getElementById('claim');

button!.onclick = async(e) => {
  e.preventDefault();
  document.getElementById('claim').disabled = true;

  await window.keplr.suggestToken(CHAIN_ID, amberContractAddress);

  const myIndex = "0";
  const myAddress = secretjs.address;
  const myAmount = "200000";
  const myProof = ["array", "of", "strings"];

  const claimMsg = {
    claim: {
      // these are not my values, just test values from the actual merkle tree
      index:"2",
      address:"secret1qsjlkyspurmrhmp0fzchtfguqyvzfdwhn9seu6",
      amount:"200000",
      proof:["4c4eb3a5007ff5a079de1559429d99307842990d9cfdb43fdd3f543c130a736c", "6126c047a27a2ae4f5b643cd0574490894bc35a20bbb7955b927937f0817ba07", "5a70f4ca1debd8b60edae74fd750f5347ec84506023f222551f9c926760554e7", "faa89bfd105ce6032ec2a77409198b4e8c4f1e065d268252feb90f90e4e8c92f", "73e6b31ca2135fb958929d16e57a639566b1e7e147ca429cd1f51bc0ebf623b7", "ff0d76e0d6a8206bf6d480a5f65629ba31a5537e049c19952286b24e90cc2d6f", "54cd4462c3bc1098a3b15f46b43e98fd9165a8a6d60d8b944dd9ca15e1a2e0a7", "37eb34a046c5bc952343ec0e5553f16408b1fbf747c5512131fed20bdd3a778f", "3d0e2d622cc20c55879eb5347711f7cf94a0282a7cf02179c6f0ce33aefbbbd9", "231f9e40e15b6d8dc7cbedc44fe87ac5be32348d28d2ceb770f10f7277745b44", "52efbcfdc188262b497edfef7aabd5bc57fc2d0549fe4d4c137b0dee6e43ff5a", "4100a6e1fa2e02163be5c0f4ec219bebcb7b600235b496319f6f1f77001589ab", "2235ce444bf5d62a9b99798b29715944fc44d1f4abbd416ff81846f559e5e388", "173223d03daae51a45b1b2d38d4f45030e882ce1c790c5f679d8d8e483efa675", "be8cf40e134a2bad08cb902bcedda49bc82b707ef57ae7b8bb1a2212c3927d1c"]
    },
  };
  
  const tx = await secretjs.tx.compute.executeContract(
    {
      sender: secretjs.address,
      contractAddress: distributorContractAddress,
      codeHash: import.meta.env.VITE_CONTRACT_CODE_HASH,
      msg: claimMsg,
      sentFunds: [],
    },
    {
      gasLimit: 200000,
    }
  );

  if (tx.code !== 0) {
    alert(
      `Failed with the following error:\n ${tx.rawLog}`
    );
  } else {
    const response = tx.arrayLog?.find(
      (log) => log.type === "wasm" && log.key === "status"
    )!.value;
    alert(response);
  }

  document.getElementById('claim').disabled = false;
}


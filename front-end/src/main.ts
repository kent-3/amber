// @ts-nocheck

import { fromHex, SecretNetworkClient } from "secretjs";
import * as database from './07-merkle-distribution.json';
import { bech32 } from 'bech32';
import { Buffer } from 'buffer/';
import type { Window as KeplrWindow, Keplr } from "@keplr-wallet/types";

interface KeplrWindow extends Window {
  keplr: Function,
  getEnigmaUtils(): Function,
  getOfflineSigner(): Function,
  getOfflineSignerOnlyAmino(_:string): Function,
  enable(_:string): Function,
  getAccounts(): Function,
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Window extends KeplrWindow {}
}
declare let window: KeplrWindow;

// const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// while (
//   !window.keplr ||
//   !window.getEnigmaUtils ||
//   !window.getOfflineSignerOnlyAmino
// ) {
//   await sleep(100);
// }

let myAddress: string;
let secretjs: SecretNetworkClient;

const distributorContractAddress = import.meta.env.VITE_CONTRACT_ADDRESS;
const distributorContractHash = import.meta.env.VITE_CONTRACT_CODE_HASH;
const amberContractAddress: string = import.meta.env.VITE_SNIP20_ADDRESS;
const amberContractHash: string = import.meta.env.VITE_SNIP20_CODE_HASH;
const CHAIN_ID = import.meta.env.VITE_CHAIN_ID;

function bech32ToBytes(address: string): string {
  const bytes = bech32.fromWords(bech32.decode(address).words);
  const buf = Buffer.from(bytes);
  const newKey = "0x" + buf.toString("hex");
  return newKey;
}

// window.onload = async () => {
//   if (!window.getOfflineSigner || !window.keplr) {
//     alert("Please install Keplr extension");
//   } else {
//       // @ts-expect-error
//     if (CHAIN_ID?.includes("secretdev") && keplr.experimentalSuggestChain) {
//       try {
//         // Keplr v0.6.4 introduces an experimental feature that supports the feature to suggests the chain from a webpage.
//         // The code below is not needed for secret-4 or other integrated chains, but may be helpful if you’re adding a custom chain.
//         // If the user approves, the chain will be added to the user's Keplr extension.
//         // If the user rejects it or the suggested chain information doesn't include the required fields, it will throw an error.
//         // If the same chain id is already registered, it will resolve and not require the user interactions.
//         // @ts-expect-error
//         await window.keplr.experimentalSuggestChain({
//           // Chain-id of the testnet chain.
//           chainId: "secretdev-1",
//           // The name of the chain to be displayed to the user.
//           chainName: "Localsecret Testnet",
//           rpc: "http://localhost:26657",
//           rest: "http://localhost:1317",
//           stakeCurrency: {
//             coinDenom: "SCRT",
//             coinMinimalDenom: "uscrt",
//             coinDecimals: 6,
//             // coinGeckoId: "secret"  // uncomment this line to have Keplr show the USD value
//           },
//           bip44: {
//             coinType: 529,
//           },
//           bech32Config: {
//             bech32PrefixAccAddr: "secret",
//             bech32PrefixAccPub: "secretpub",
//             bech32PrefixValAddr: "secretvaloper",
//             bech32PrefixValPub: "secretvaloperpub",
//             bech32PrefixConsAddr: "secretvalcons",
//             bech32PrefixConsPub: "secretvalconspub"
//           },
//           currencies: [{
//             coinDenom: "SCRT",
//             coinMinimalDenom: "uscrt",
//             coinDecimals: 6,
//             // coinGeckoId: "secret"
//           }],
//           feeCurrencies: [{
//             coinDenom: "SCRT",
//             coinMinimalDenom: "uscrt",
//             coinDecimals: 6,
//             coinGeckoId: "secret"
//           }],
//           // (Optional) The number of the coin type.
//           // This field is only used to fetch the address from ENS.
//           // Ideally, it is recommended to be the same with BIP44 path's coin type.
//           // However, some early chains may choose to use the Cosmos Hub BIP44 path of '118'.
//           // So, this is separated to support such chains.
//           coinType: 529,
//           // These gas prices are for pulsar-2
//           gasPriceStep: {
//               low: 0.1,
//               average: 0.25,
//               high: 0.4
//           },
//           features: ["secretwasm", "ibc-go"]
//         });
//       } catch {
//           alert("Failed to suggest the chain");
//         }
//     } else {
//         alert("Please use the recent version of keplr extension"); 
//     }
//   }

//   await window.keplr.enable(CHAIN_ID);

//   const keplrOfflineSigner = window.getOfflineSignerOnlyAmino(CHAIN_ID);
//   [{ address: myAddress }] = await keplrOfflineSigner.getAccounts();

//   secretjs = await SecretNetworkClient.create({
//     grpcWebUrl: import.meta.env.VITE_GRPC_URL,
//     chainId: CHAIN_ID,
//     wallet: keplrOfflineSigner,
//     walletAddress: myAddress,
//     encryptionUtils: window.getEnigmaUtils(CHAIN_ID),
//   });

//   const newKey = bech32ToBytes(secretjs.address);
//   console.log(database.claims[newKey]);  // doesn't work coz my address isn't in the snapshot
//   console.log(database.claims["0x0425fb1201e0f63bec2f48b175a51c011824b5d7"]);
  
//   document.getElementById('claim').disabled = false;
//   // document.getElementById('submit').disabled = false;
//   // document.getElementById('claim').innerHTML = '';
  
// }

document.getElementById('claim').disabled = false;

const button = document.getElementById('claim');

button!.onclick = async(e) => {
  e.preventDefault();
  document.getElementById('claim').disabled = true;

  if (!window.getOfflineSigner || !window.keplr) {
    alert("Please install Keplr extension");
  } else {
      // @ts-expect-error
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
            // coinGeckoId: "secret"  // uncomment this line to have Keplr show the USD value
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
  
  await window.keplr.suggestToken(CHAIN_ID, amberContractAddress);

  const newKey = bech32ToBytes("secret1qsjlkyspurmrhmp0fzchtfguqyvzfdwhn9seu6");  // replace with secretjs.address
  console.log(database.claims[newKey]);  // doesn't work coz my address isn't in the snapshot
  // console.log(database.claims["0x0425fb1201e0f63bec2f48b175a51c011824b5d7"]);

  const myIndex = database.claims[newKey].index;
  const myAmount = parseInt(database.claims[newKey].amount).toString();
  const myProof = database.claims[newKey].proof;

  const claimMsg = {
    claim: {
      // these are not my values, just test values from the actual merkle tree
      index: myIndex,
      address:"secret1qsjlkyspurmrhmp0fzchtfguqyvzfdwhn9seu6",
      amount: myAmount,
      proof: myProof,
    },
  };
  
  const tx = await secretjs.tx.compute.executeContract(
    {
      sender: secretjs.address,
      contractAddress: distributorContractAddress,
      codeHash: distributorContractHash,
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


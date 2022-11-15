import axios from "axios";
import { Wallet, SecretNetworkClient } from "secretjs";
import fs from "fs";
import 'dotenv/config'

var mnemonic: string;
var endpoint: string = "http://localhost:9091";
var chainId: string = "secretdev-1";

// uncomment when using .env file
// mnemonic = process.env.MNEMONIC!;
// endpoint = process.env.GRPC_WEB_URL!;
// chainId = process.env.CHAIN_ID!;


// Returns a client with which we can interact with secret network
const initializeClient = async (endpoint: string, chainId: string) => {
  let wallet: Wallet;
  if (mnemonic) {
    wallet = new Wallet(mnemonic);
  } else {
    wallet = new Wallet();
  }
  const accAddress = wallet.address;
  const client = await SecretNetworkClient.create({
    // Create a client to interact with the network
    grpcWebUrl: endpoint,
    chainId: chainId,
    wallet: wallet,
    walletAddress: accAddress,
  });

  console.log(`\nInitialized client with wallet address: ${accAddress}`);
  return client;
};

const initializeContract = async (
  client: SecretNetworkClient,
  contractPath: string,
) => {
  const wasmCode = fs.readFileSync(contractPath);
  console.log("\nUploading contract");

  const uploadReceipt = await client.tx.compute.storeCode(
    {
      wasmByteCode: wasmCode,
      sender: client.address,
      source: "",
      builder: "",
    },
    {
      gasLimit: 5000000,
    }
  );

  if (uploadReceipt.code !== 0) {
    console.log(
      `Failed to get code id: ${JSON.stringify(uploadReceipt.rawLog)}`
    );
    throw new Error(`Failed to upload contract`);
  }

  const codeIdKv = uploadReceipt.jsonLog![0].events[0].attributes.find(
    (a: any) => {
      return a.key === "code_id";
    }
  );

  console.log(`Upload used \x1b[33m${uploadReceipt.gasUsed}\x1b[0m gas\n`);

  const codeId = Number(codeIdKv!.value);
  console.log("Contract codeId: ", codeId);

  const contractCodeHash = await client.query.compute.codeHash(codeId);
  console.log(`Contract hash: ${contractCodeHash}`);
  
  ///////////////////////////////////
  const init_msg = {
    name: "AmburNFT 3.0",
    symbol: "ffffff",
    entropy: "L bro",
    config: {
      public_token_supply: true,
      public_owner: false,
      enable_sealed_metadata: false,
      unwrapped_metadata_is_private: true,
      minter_may_update_metadata: false,
      owner_may_update_metadata: false,
      enable_burn: true      
    },
    snip20_hash: "db93ffb6ee9d5b924bc8f70e30c73ed809d210bca9b8aaab14eea609b55de166",
    snip20_addr: "secret1gymqy8w5mjhrgk62a5myrrh2ea9xgpvecryn7a",
  };
  ///////////////////////////////////

  const contract = await client.tx.compute.instantiateContract(
    {
      sender: client.address,
      codeId,
      initMsg: init_msg,
      codeHash: contractCodeHash,
      label: "My Contract " + Math.ceil(Math.random() * 10000), // The label should be unique for every contract, add random string in order to maintain uniqueness
    },
    {
      gasLimit: 300000,
    }
  );

  if (contract.code !== 0) {
    throw new Error(
      `Failed to instantiate the contract with the following error ${contract.rawLog}`
    );
  }

  const contractAddress = contract.arrayLog!.find(
    (log) => log.type === "message" && log.key === "contract_address"
  )!.value;

  console.log(`Contract address: ${contractAddress}\n`);

  console.log(`Init used \x1b[33m${contract.gasUsed}\x1b[0m gas`);

  var contractInfo: [string, string] = [contractCodeHash, contractAddress];
  return contractInfo;
};

const getFromFaucet = async (address: string) => {
  await axios.get(`http://localhost:5000/faucet?address=${address}`);
};

async function getScrtBalance(userCli: SecretNetworkClient): Promise<string> {
  let balanceResponse = await userCli.query.bank.balance({
    address: userCli.address,
    denom: "uscrt",
  });
  return balanceResponse.balance!.amount;
}

async function fillUpFromFaucet(
  client: SecretNetworkClient,
  targetBalance: Number
) {
  let balance = await getScrtBalance(client);
  while (Number(balance) < targetBalance) {
    try {
      await getFromFaucet(client.address);
    } catch (e) {
      console.error(`\x1b[2mfailed to get tokens from faucet: ${e}\x1b[0m`);
    }
    balance = await getScrtBalance(client);
  }
  console.error(`got tokens from faucet: ${balance}`);
}

// Initialization procedure
async function initializeAndUploadContract() {

  const client = await initializeClient(endpoint, chainId);

  if (chainId == "secretdev-1") {await fillUpFromFaucet(client, 100_000_000)};
  
  const [contractHash, contractAddress] = await initializeContract(
    client,
    "./amburnft/contract.wasm.gz",
  );

  var clientInfo: [SecretNetworkClient, string, string] = [
    client,
    contractHash,
    contractAddress,
  ];
  return clientInfo;
}

async function mintTx(
  client: SecretNetworkClient,
  snip721Hash: string,
  snip721Address: string,
) {
  const handle_msg = {
    "mint_nft": {
      "token_id": "j7wwT",
      "public_metadata": {
        "extension": {
          "media": [
            {
              "authentication": {
                "key": "",
                "user": ""
              },
              "file_type": "image",
              "extension": "gif",
              "url": "https://ipfs.io/ipfs/bafybeidpthti66dyzigh6h2uaj3korl2bzxdnmcedyajphuc3rrbek2otq/qUlbCfHlKV.gif"
            }
          ],
          "attributes": [
            {
              "trait_type": "amount",
              "value": "0.05"
            }
          ],
          "protected_attributes": [],
          "description": "50000",
          "name": "airdrop",
          "token_subtype": "badge",

        }
      },
      "private_metadata": {
        "extension": {
          "media": [
            {
              "authentication": {
                "user": "",
                "key": "9AvVYZ/80Yk970QonWTHhvM4YpN0mANSUeEw0RNw3WY="
              },
              "extension": "gif",
              "file_type": "image",
              "url": "https://ipfs.io/ipfs/bafybeietvvjxi76r6swxbylg7vlc2z3ukefyuhkt7ffkimv5pfzj32xguy/PQbkPCustq.gif"
            }
          ],
          "attributes": []
        }
      }
    }
  };

  const tx = await client.tx.compute.executeContract(
    {
      sender: client.address,
      contractAddress: snip721Address,
      codeHash: snip721Hash,
      msg: handle_msg,
      sentFunds: [],
    },
    {
      gasLimit: 500000,
    }
  );

  if (tx.code !== 0) {
    throw new Error(
      `Failed with the following error:\n ${tx.rawLog}`
    );
  };

  // const status = tx.arrayLog!.find(
  //     (log) => log.type === "wasm" && log.key === "status"
  //   )!.value;

  // assert(status, "success");

  console.log(`mintTx used \x1b[33m${tx.gasUsed}\x1b[0m gas`);
}

async function burnTx(
  client: SecretNetworkClient,
  snip721Hash: string,
  snip721Address: string,
) {
  const handle_msg = {
    burn_nft: {
      token_id: "j7wwT",
    }
  };

  const tx = await client.tx.compute.executeContract(
    {
      sender: client.address,
      contractAddress: snip721Address,
      codeHash: snip721Hash,
      msg: handle_msg,
      sentFunds: [],
    },
    {
      gasLimit: 500000,
    }
  );

  if (tx.code !== 0) {
    throw new Error(
      `Failed with the following error:\n ${tx.rawLog}`
    );
  };

  // const status = tx.arrayLog!.find(
  //     (log) => log.type === "wasm" && log.key === "status"
  //   )!.value;
  
  // assert(status, "success");

  console.log(`burnTx used \x1b[33m${tx.gasUsed}\x1b[0m gas`);
}

(async () => {
  const [client, contractHash, contractAddress] =
    await initializeAndUploadContract();
    await mintTx(client, contractHash, contractAddress)
    // await burnTx(client, contractHash, contractAddress)
})();
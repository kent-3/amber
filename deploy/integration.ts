import axios from "axios";
import { Wallet, SecretNetworkClient } from "secretjs";
import fs from "fs";
import assert from "assert";
import 'dotenv/config'
 
var mnemonic: string;
var endpoint: string = "http://localhost:9091";
var chainId: string = "secretdev-1";

// uncomment when using .env file
// mnemonic = process.env.MNEMONIC!;
// endpoint = process.env.GRPC_WEB_URL!;
// chainId = process.env.CHAIN_ID!;


// interface Trait {
//   display_type?: string;
//   trait_type?: string;
//   value: string;
//   max_value?: string;
// }
// interface Authentication {
//   key?: string;
//   user?: string;
// }
// interface MediaFile {
//   file_type?: string;
//   extension?: string;
//   authentication?: Authentication;
//   url: string;
// }
// interface Extension {
//   image?: string;
//   image_data?: string;
//   external_url?: string;
//   description?: string;
//   name?: string;
//   attributes?: Trait[];
//   media?: MediaFile[];
//   protected_attributes: string[];
// }
// interface Metadata {
//   token_uri?: string;
//   extension?: Extension;
// }


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

const initializeSnip20 = async (
  client: SecretNetworkClient,
  contractPath: string,
) => {
  const wasmCode = fs.readFileSync(contractPath);
  console.log("\nUploading contract");

  const uploadReceipt = await client.tx.compute.storeCode(
    {
      wasmByteCode: wasmCode,
      sender: client.address,
      source: "https://github.com/kent-3/amber/archive/refs/tags/v0.1.0-beta.tar.gz",
      builder: "enigmampc/secret-contract-optimizer:1.0.9",
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

  const init_msg = { 
    name: "secret-secret",
    admin: client.address,
    symbol: "SSCRT",
    decimals: 6,
    initial_balances:[{"address": client.address, "amount":"8888000000"}],
    prng_seed: Buffer.from("amber rocks").toString('base64'),
    config:{"public_total_supply":true}
  };

  const contract = await client.tx.compute.instantiateContract(
    {
      sender: client.address,
      codeId,
      initMsg: init_msg,
      codeHash: contractCodeHash,
      label: "My SNIP20" + Math.ceil(Math.random() * 10000), // The label should be unique for every contract, add random string in order to maintain uniqueness
    },
    {
      gasLimit: 5000000,
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

const initializeSnip721 = async (
  client: SecretNetworkClient,
  contractPath: string,
) => {
  const wasmCode = fs.readFileSync(contractPath);
  console.log("\nUploading contract");

  const uploadReceipt = await client.tx.compute.storeCode(
    {
      wasmByteCode: wasmCode,
      sender: client.address,
      source: "https://github.com/kent-3/amber/archive/refs/tags/v0.1.0-beta.tar.gz",
      builder: "enigmampc/secret-contract-optimizer:1.0.9",
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

  const init_msg = {
    name: "AmburNFT",
    symbol: "ffffff",
    entropy: "L bro",
    config: {
      public_token_supply: true,
      public_owner: false,
      enable_sealed_metadata: false,
      unwrapped_metadata_is_private: true,
      minter_may_update_metadata: true,
      owner_may_update_metadata: false,
      enable_burn: true      
    },
  };
  const contract = await client.tx.compute.instantiateContract(
    {
      sender: client.address,
      codeId,
      initMsg: init_msg,
      codeHash: contractCodeHash,
      label: "My SNIP721" + Math.ceil(Math.random() * 10000), // The label should be unique for every contract, add random string in order to maintain uniqueness
    },
    {
      gasLimit: 5000000,
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

const initializeDistributorContract = async (
  client: SecretNetworkClient,
  contractPath: string,
  snip20Hash: string,
  snip20Address: string,
) => {
  const wasmCode = fs.readFileSync(contractPath);
  console.log("\nUploading example contract");

  const uploadReceipt = await client.tx.compute.storeCode(
    {
      wasmByteCode: wasmCode,
      sender: client.address,
      source: "https://github.com/kent-3/amber/archive/refs/tags/v0.1.0-beta.tar.gz",
      builder: "enigmampc/secret-contract-optimizer:1.0.9",
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
  
  const init_msg = {
    token_addr: snip20Address,
    token_hash: snip20Hash,
    merkle_root: "08a73156193962c44c237448cca7d1d7edb65fea3e8fde85dca5b4cbbac967c5",
  };

  const contract = await client.tx.compute.instantiateContract(
    {
      sender: client.address,
      codeId,
      initMsg: init_msg,
      codeHash: contractCodeHash,
      label: "merkle-distributor" + Math.ceil(Math.random() * 10000), // The label should be unique for every contract, add random string in order to maintain uniqueness
    },
    {
      gasLimit: 5000000,
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
  
  const [snip20Hash, snip20Address] = await initializeSnip20(
    client,
    "./snip20-reference-impl/contract.wasm.gz",
  );

  const [distributorHash, distributorAddress] = await initializeDistributorContract(
    client,
    "./merkle-distributor/contract.wasm.gz",
    snip20Hash,
    snip20Address,
  );

  const [snip721Hash, snip721Address] = await initializeSnip721(
    client,
    "./amburnft/contract.wasm.gz",
  );

  var clientInfo: [SecretNetworkClient, string, string, string, string, string, string] = [
    client,
    snip20Hash,
    snip20Address,
    distributorHash,
    distributorAddress,
    snip721Hash,
    snip721Address
  ];
  return clientInfo;
}

async function sendTx(
  client: SecretNetworkClient,
  snip20Hash: string,
  snip20Address: string,
  distributorHash: string,
  distributorAddress: string,
) {
  const handle_msg = {
    send:{
        recipient: distributorAddress,
        amount: "5110600000"
    }
  };

  const tx = await client.tx.compute.executeContract(
    {
      sender: client.address,
      contractAddress: snip20Address,
      codeHash: snip20Hash,
      msg: handle_msg,
      sentFunds: [],
    },
    {
      gasLimit: 200000,
    }
  );

  if (tx.code !== 0) {
    throw new Error(
      `Failed with the following error:\n ${tx.rawLog}`
    );
  };

  console.log(`sendTx used \x1b[33m${tx.gasUsed}\x1b[0m gas`);
}

async function fund721Tx(
  client: SecretNetworkClient,
  snip20Hash: string,
  snip20Address: string,
  distributorHash: string,
  distributorAddress: string,
  snip721Hash: string,
  snip721Address: string,
) {
  const handle_msg = {
    send:{
        recipient: snip721Address,
        amount: "44000000"
    }
  };

  const tx = await client.tx.compute.executeContract(
    {
      sender: client.address,
      contractAddress: snip20Address,
      codeHash: snip20Hash,
      msg: handle_msg,
      sentFunds: [],
    },
    {
      gasLimit: 200000,
    }
  );

  if (tx.code !== 0) {
    throw new Error(
      `Failed with the following error:\n ${tx.rawLog}`
    );
  };

  console.log(`sendTx used \x1b[33m${tx.gasUsed}\x1b[0m gas`);
}

async function claimTx(
    client: SecretNetworkClient,
    snip20Hash: string,
    snip20Address: string,
    distributorHash: string,
    distributorAddress: string,
  ) {
    const handle_msg = {
        claim:{
            index:"2",
            address:"secret1qsjlkyspurmrhmp0fzchtfguqyvzfdwhn9seu6",
            amount:"200000",
            proof:["4c4eb3a5007ff5a079de1559429d99307842990d9cfdb43fdd3f543c130a736c", "6126c047a27a2ae4f5b643cd0574490894bc35a20bbb7955b927937f0817ba07", "5a70f4ca1debd8b60edae74fd750f5347ec84506023f222551f9c926760554e7", "faa89bfd105ce6032ec2a77409198b4e8c4f1e065d268252feb90f90e4e8c92f", "73e6b31ca2135fb958929d16e57a639566b1e7e147ca429cd1f51bc0ebf623b7", "ff0d76e0d6a8206bf6d480a5f65629ba31a5537e049c19952286b24e90cc2d6f", "54cd4462c3bc1098a3b15f46b43e98fd9165a8a6d60d8b944dd9ca15e1a2e0a7", "37eb34a046c5bc952343ec0e5553f16408b1fbf747c5512131fed20bdd3a778f", "3d0e2d622cc20c55879eb5347711f7cf94a0282a7cf02179c6f0ce33aefbbbd9", "231f9e40e15b6d8dc7cbedc44fe87ac5be32348d28d2ceb770f10f7277745b44", "52efbcfdc188262b497edfef7aabd5bc57fc2d0549fe4d4c137b0dee6e43ff5a", "4100a6e1fa2e02163be5c0f4ec219bebcb7b600235b496319f6f1f77001589ab", "2235ce444bf5d62a9b99798b29715944fc44d1f4abbd416ff81846f559e5e388", "173223d03daae51a45b1b2d38d4f45030e882ce1c790c5f679d8d8e483efa675", "be8cf40e134a2bad08cb902bcedda49bc82b707ef57ae7b8bb1a2212c3927d1c"]
        }
    };
  
    const tx = await client.tx.compute.executeContract(
      {
        sender: client.address,
        contractAddress: distributorAddress,
        codeHash: distributorHash,
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

    const status = tx.arrayLog!.find(
        (log) => log.type === "wasm" && log.key === "status"
      )!.value;

    assert(status, "success");
  
    console.log(`claimTx used \x1b[33m${tx.gasUsed}\x1b[0m gas`);
  }
  
  async function retrieveTx(
    client: SecretNetworkClient,
    snip20Hash: string,
    snip20Address: string,
    distributorHash: string,
    distributorAddress: string,
  ) {
    const handle_msg = {
      retrieve:{ 
        address: client.address,
      }
    };
  
    const tx = await client.tx.compute.executeContract(
      {
        sender: client.address,
        contractAddress: distributorAddress,
        codeHash: distributorHash,
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

    const status = tx.arrayLog!.find(
        (log) => log.type === "wasm" && log.key === "status"
      )!.value;

    assert(status, "success");
  
    console.log(`retrieveTx used \x1b[33m${tx.gasUsed}\x1b[0m gas`);
  }

  async function retrieveTxFail(
    client: SecretNetworkClient,
    snip20Hash: string,
    snip20Address: string,
    distributorHash: string,
    distributorAddress: string,
  ) {
    const handle_msg = {
      retrieve:{ 
        address: client.address,
      }
    };
  
    const tx = await client.tx.compute.executeContract(
      {
        sender: client.address,
        contractAddress: distributorAddress,
        codeHash: distributorHash,
        msg: handle_msg,
        sentFunds: [],
      },
      {
        gasLimit: 500000,
      }
    );
  
    assert(tx.rawLog, 'failed to execute message; message index: 0: {"generic_err":{"msg":"only admin can do that"}}: execute contract failed')
  
    console.log(`retrieveTxFail used \x1b[33m${tx.gasUsed}\x1b[0m gas\n`);
  }

async function query_claimed(
  client: SecretNetworkClient,
  distributorHash: string,
  distributorAddress: string,
): Promise<boolean> {
  const query_msg = { is_claimed: { index: "2" } };

  const response = (await client.query.compute.queryContract({
    contractAddress: distributorAddress,
    codeHash: distributorHash,
    query: query_msg,
  })) as boolean;

  console.log(`query claimed response: ${response}`);
  return response
}

async function query_unclaimed(
  client: SecretNetworkClient,
  distributorHash: string,
  distributorAddress: string,
): Promise<string> {
  interface Result {
    Ok: string
  }
  const query_msg = { is_unclaimed: {} };

  const response = (await client.query.compute.queryContract({
    contractAddress: distributorAddress,
    codeHash: distributorHash,
    query: query_msg,
  })) as Result;

  console.log(`query unclaimed response: ${response.Ok}`);
  return response.Ok
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
          "name": "airdrop"
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

async function test_distributor_stuff(
  client: SecretNetworkClient,
  snip20Hash: string,
  snip20Address: string,
  distributorHash: string,
  distributorAddress: string,
) {
  await sendTx(client, snip20Hash, snip20Address, distributorHash, distributorAddress);
  const query1 = await query_unclaimed(client, distributorHash, distributorAddress);
  assert(query1, "5110600000")
  await claimTx(client, snip20Hash, snip20Address, distributorHash, distributorAddress);
  const query2 = await query_unclaimed(client, distributorHash, distributorAddress);
  assert(query2, "5110600000")
  if (chainId == "secretdev-1") {
    const differentClient = await initializeClient(endpoint, chainId);
    await fillUpFromFaucet(differentClient, 100_000_000);
    await retrieveTxFail(differentClient, snip20Hash, snip20Address, distributorHash, distributorAddress);
  }
  
  await retrieveTx(client, snip20Hash, snip20Address, distributorHash, distributorAddress);
  await query_claimed(client, distributorHash, distributorAddress);
  const query3 = await query_unclaimed(client, distributorHash, distributorAddress);
  assert(query3, "0")
}

async function test_nft_stuff(
  client: SecretNetworkClient,
  snip20Hash: string,
  snip20Address: string,
  distributorHash: string,
  distributorAddress: string,
  snip721Hash: string,
  snip721Address: string,
) {
  await fund721Tx(client, snip20Hash, snip20Address, distributorHash, distributorAddress, snip721Hash, snip721Address)
  await mintTx(client, snip721Hash, snip721Address)
  await burnTx(client, snip721Hash, snip721Address)
}

async function runTestFunction(
  tester: (
    client: SecretNetworkClient,
    snip20Hash: string,
    snip20Address: string,
    depositorHash: string,
    depositorAddress: string,
    snip721Hash: string,
    snip721Address: string,
  ) => void,
  client: SecretNetworkClient,
  snip20Hash: string,
  snip20Address: string,
  depositorHash: string,
  depositorAddress: string,
  snip721Hash: string,
  snip721Address: string,
) {
  console.log(`\n[  \x1b[35mTEST\x1b[0m  ] ${tester.name}\n`);
  await tester(client, snip20Hash, snip20Address, depositorHash, depositorAddress, snip721Hash, snip721Address);
  console.log(`\n[   \x1b[32mOK\x1b[0m   ] ${tester.name}\n`);
}

(async () => {
  const [client, snip20Hash, snip20Address, depositorHash, depositorAddress, snip721Hash, snip721Address] =
    await initializeAndUploadContract();

  await runTestFunction(
    test_distributor_stuff,
    client,
    snip20Hash, 
    snip20Address, 
    depositorHash, 
    depositorAddress,
    snip721Hash,
    snip721Address,
  );
  await runTestFunction(
    test_nft_stuff,
    client,
    snip20Hash, 
    snip20Address, 
    depositorHash, 
    depositorAddress,
    snip721Hash,
    snip721Address,
  );
})();
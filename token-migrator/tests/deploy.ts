import fs from "fs";
import axios from "axios";
import { Wallet, SecretNetworkClient } from "secretjs";
import * as contracts from "../../messages/contracts.json";
import "dotenv/config";

var mnemonic: string;
var endpoint: string = "http://localhost:1317";
var chainId: string = "secretdev-1";

// uncomment when using .env file
mnemonic = process.env.MNEMONIC!;
endpoint = process.env.LCD_URL!;
chainId = process.env.CHAIN_ID!;

interface ContractInfo {
  contract_address: string;
  code_hash: string;
  code_id: number;
  creator: string;
  label: string;
}

const oldAmber: ContractInfo = contracts.original_amber_testnet;

// Returns a client with which we can interact with secret network
const initializeClient = async (endpoint: string, chainId: string) => {
  let wallet: Wallet;
  if (mnemonic) {
    wallet = new Wallet(mnemonic);
  } else {
    wallet = new Wallet();
  }
  const accAddress = wallet.address;
  const client = new SecretNetworkClient({
    // Create a client to interact with the network
    url: endpoint,
    chainId: chainId,
    wallet: wallet,
    walletAddress: accAddress,
  });

  console.log(`\nInitialized client with wallet address: ${accAddress}`);

  return client;
};

const initializeSnip20 = async (
  client: SecretNetworkClient,
  contractPath: string
) => {
  const wasmCode = fs.readFileSync(contractPath);
  console.log("\nUploading SNIP20 contract");

  const uploadReceipt = await client.tx.compute.storeCode(
    {
      wasm_byte_code: wasmCode,
      sender: client.address,
      source: "",
      // "https://github.com/kent-3/amber/archive/refs/tags/v0.1.0-beta.tar.gz",
      builder: "",
      // "enigmampc/secret-contract-optimizer:1.0.9",
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

  const { code_hash: contractCodeHash } =
    await client.query.compute.codeHashByCodeId({ code_id: codeId.toString() });
  console.log(`Contract hash: ${contractCodeHash}`);

  const init_msg = {
    name: "Amber",
    admin: client.address,
    symbol: "AMBER",
    decimals: 6,
    initial_balances: [{ address: client.address, amount: "8888000000" }],
    prng_seed: Buffer.from("amber rocks").toString("base64"),
    config: { public_total_supply: true },
  };

  const contract = await client.tx.compute.instantiateContract(
    {
      sender: client.address,
      code_id: codeId.toString(),
      init_msg: init_msg,
      code_hash: contractCodeHash,
      label: "amber" + Math.ceil(Math.random() * 10000), // The label should be unique for every contract, add random string in order to maintain uniqueness
    },
    {
      gasLimit: 4000000,
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
  console.log(`Instantiate used \x1b[33m${contract.gasUsed}\x1b[0m gas`);
  console.log(`Instantiate TX hash: ${contract.transactionHash}\n`);

  var contractInfo: [string, string] = [contractCodeHash!, contractAddress];
  return contractInfo;
};

const initializeMigratorContract = async (
  client: SecretNetworkClient,
  contractPath: string,
  snip25Hash: string,
  snip25Address: string
) => {
  const wasmCode = fs.readFileSync(contractPath);
  console.log("\nUploading migrator contract");

  const uploadReceipt = await client.tx.compute.storeCode(
    {
      wasm_byte_code: wasmCode,
      sender: client.address,
      source: "",
      // "https://github.com/kent-3/amber/archive/refs/tags/v0.1.0-beta.tar.gz",
      builder: "",
      // "enigmampc/secret-contract-optimizer:1.0.9",
    },
    {
      gasLimit: 2000000,
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

  const { code_hash: contractCodeHash } =
    await client.query.compute.codeHashByCodeId({ code_id: codeId.toString() });
  console.log(`Contract hash: ${contractCodeHash}`);

  const init_msg = {
    old_token_addr: oldAmber.contract_address,
    old_token_hash: oldAmber.code_hash,
    new_token_addr: snip25Address,
    new_token_hash: snip25Hash,
  };

  const contract = await client.tx.compute.instantiateContract(
    {
      sender: client.address,
      code_id: codeId.toString(),
      init_msg: init_msg,
      code_hash: contractCodeHash,
      label: "amber-migrator" + Math.ceil(Math.random() * 10000), // The label should be unique for every contract, add random string in order to maintain uniqueness
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
  console.log(`Instantiate used \x1b[33m${contract.gasUsed}\x1b[0m gas`);
  console.log(`Instantiate TX hash: ${contract.transactionHash}\n`);

  var contractInfo: [string, string] = [contractCodeHash!, contractAddress];
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
  return balanceResponse.balance?.amount!;
}

async function fillUpFromFaucet(
  client: SecretNetworkClient,
  targetBalance: number
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

  if (chainId == "secretdev-1") {
    await fillUpFromFaucet(client, 100_000_000);
  }

  const [snip25Hash, snip25Address] = await initializeSnip20(
    client,
    "./tests/snip25.wasm.gz"
  );

  const [migratorHash, migratorAddress] = await initializeMigratorContract(
    client,
    "./contract.wasm.gz",
    snip25Hash,
    snip25Address
  );

  const clientInfo: [SecretNetworkClient, string, string, string, string] = [
    client,
    snip25Hash,
    snip25Address,
    migratorHash,
    migratorAddress,
  ];
  return clientInfo;
}

async function setViewingKeys(
  client: SecretNetworkClient,
  snip25Hash: string,
  snip25Address: string
) {
  // setting my own vk for old token
  await client.tx.snip20
    .setViewingKey(
      {
        sender: client.address,
        contract_address: oldAmber.contract_address,
        code_hash: oldAmber.code_hash,
        msg: {
          set_viewing_key: {
            key: "amber_rocks",
          },
        },
      },
      {
        gasLimit: 100_000,
      }
    )
    .then((tx) =>
      console.log(`old token set vk tx hash: ${tx.transactionHash}`)
    );
  // setting my own vk for new token
  await client.tx.snip20
    .setViewingKey(
      {
        sender: client.address,
        contract_address: snip25Address,
        code_hash: snip25Hash,
        msg: {
          set_viewing_key: {
            key: "amber_still_rocks",
          },
        },
      },
      {
        gasLimit: 100_000,
      }
    )
    .then((tx) =>
      console.log(`new token set vk tx hash: ${tx.transactionHash}`)
    );

  // check my balances
  const {
    balance: { amount: oldAmberBalance },
  } = await client.query.snip20.getBalance({
    contract: {
      address: oldAmber.contract_address,
      code_hash: oldAmber.code_hash,
    },
    address: client.address,
    auth: {
      key: "amber_rocks",
    },
  });
  console.log(oldAmberBalance);

  const {
    balance: { amount: newAmberBalance },
  } = await client.query.snip20.getBalance({
    contract: {
      address: snip25Address,
      code_hash: snip25Hash,
    },
    address: client.address,
    auth: {
      key: "amber_still_rocks",
    },
  });
  console.log(newAmberBalance);
}

async function sendTx(
  client: SecretNetworkClient,
  snip20Hash: string,
  snip20Address: string,
  recipient: string,
  amount: string
) {
  const handle_msg = {
    send: {
      recipient,
      amount,
    },
  };

  const tx = await client.tx.compute.executeContract(
    {
      sender: client.address,
      contract_address: snip20Address,
      code_hash: snip20Hash,
      msg: handle_msg,
      sent_funds: [],
    },
    {
      gasLimit: 200000,
    }
  );

  if (tx.code !== 0) {
    throw new Error(`Failed with the following error:\n ${tx.rawLog}`);
  }

  console.log(`sendTx used \x1b[33m${tx.gasUsed}\x1b[0m gas`);
}

async function query_migrator(
  client: SecretNetworkClient,
  migratorHash: string,
  migratorAddress: string
) {
  const response = (await client.query.compute.queryContract({
    contract_address: migratorAddress,
    code_hash: migratorHash,
    query: { get_balances: {} },
  })) as { old_token: { amount: string }; new_token: { amount: string } };

  return response;
}

(async () => {
  const [client, snip25Hash, snip25Address, migratorHash, migratorAddress] =
    await initializeAndUploadContract();
  // set my viewing keys and check my current balances
  await setViewingKeys(client, snip25Hash, snip25Address);
  // send 100 AMBER (new) to Migrator contract
  await sendTx(client, snip25Hash, snip25Address, migratorAddress, "8888000000");
  // check the balances of the Migrator contract
  await query_migrator(client, migratorHash, migratorAddress).then((response) =>
    console.log(response)
  );
})();

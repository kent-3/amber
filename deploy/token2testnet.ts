import axios from "axios";
import { Wallet, SecretNetworkClient, fromUtf8 } from "secretjs";
import fs from "fs";
import assert from "assert";
import 'dotenv/config'

var mnemonic: string;
var endpoint: string = "http://localhost:9091";
var chainId: string = "secretdev-1";
var ADMIN_ADDRESS: string;

// uncomment when using .env file
// mnemonic = process.env.MNEMONIC!;
// endpoint = process.env.GRPC_WEB_URL!;
// chainId = process.env.CHAIN_ID!;
// ADMIN_ADDRESS = process.env.ADMIN_ADDRESS!;


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
      source: "",
      builder: "",
    },
    {
      gasLimit: 3000000,
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

  ///////////////////////////////////////////////////////////////////////
  const init_msg = { 
    name: "Amber",
    admin: client.address,
    symbol: "AMBER",
    decimals: 6,
    initial_balances:[{"address": client.address, "amount":"8888000000"}],
    prng_seed: Buffer.from("amber rocks").toString('base64'),
    config:{
        /// Indicates whether the total supply is public or should be kept secret.
        /// default: False
        "public_total_supply": true,
        /// Indicates whether deposit functionality should be enabled
        /// default: False
        "enable_deposit": false,
        /// Indicates whether redeem functionality should be enabled
        /// default: False
        "enable_redeem": false,
        /// Indicates whether mint functionality should be enabled
        /// default: False
        "enable_mint": false,
        /// Indicates whether burn functionality should be enabled
        /// default: False
        "enable_burn": false,
    }
  };
  ///////////////////////////////////////////////////////////////////////

  const contract = await client.tx.compute.instantiateContract(
    {
      sender: client.address,
      codeId,
      initMsg: init_msg,
      codeHash: contractCodeHash,
      label: "amber_test " + Math.ceil(Math.random() * 10000),  // The label should be unique for every contract, add random string in order to maintain uniqueness
    },
    {
      gasLimit: 2000000,
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

const initializeContract = async (
  client: SecretNetworkClient,
  contractPath: string,
  snip20Hash: string,
  snip20Address: string,
) => {
  const wasmCode = fs.readFileSync(contractPath);
  console.log("\nUploading distributor contract");

  const uploadReceipt = await client.tx.compute.storeCode(
    {
      wasmByteCode: wasmCode,
      sender: client.address,
      source: "",
      builder: "",
    },
    {
      gasLimit: 3000000,
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
      label: "merkle-distributor " + Math.ceil(Math.random() * 10000), // The label should be unique for every contract, add random string in order to maintain uniqueness
    },
    {
      gasLimit: 2000000,
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
  
  const [distributorHash, distributorAddress] = await initializeContract(
    client,
    "./merkle-distributor/contract.wasm.gz",
    snip20Hash,
    snip20Address,
  );

  var clientInfo: [SecretNetworkClient, string, string, string, string] = [
    client,
    snip20Hash,
    snip20Address,
    distributorHash,
    distributorAddress,
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

async function test_init_tx(
  client: SecretNetworkClient,
  snip20Hash: string,
  snip20Address: string,
  distributorHash: string,
  distributorAddress: string
) {
  await sendTx(client, snip20Hash, snip20Address, distributorHash, distributorAddress);
}

async function runTestFunction(
  tester: (
    client: SecretNetworkClient,
    snip20Hash: string,
    snip20Address: string,
    depositorHash: string,
    depositorAddress: string,
  ) => void,
  client: SecretNetworkClient,
  snip20Hash: string,
  snip20Address: string,
  depositorHash: string,
  depositorAddress: string,
) {
  console.log(`\n[  \x1b[35mTEST\x1b[0m  ] ${tester.name}\n`);
  await tester(client, snip20Hash, snip20Address, depositorHash, depositorAddress);
  console.log(`\n[   \x1b[32mOK\x1b[0m   ] ${tester.name}\n`);
}

(async () => {
  const [client, snip20Hash, snip20Address, depositorHash, depositorAddress] =
    await initializeAndUploadContract();

  await runTestFunction(
    test_init_tx,
    client,
    snip20Hash, 
    snip20Address, 
    depositorHash, 
    depositorAddress,
  );
})();
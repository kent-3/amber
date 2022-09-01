import cors from 'cors';
import express from 'express';
import dotenv from 'dotenv';
import { verify } from "curve25519-js";
import { SecretNetworkClient } from "secretjs";
dotenv.config();

const app = express()
const port = process.env.VITE_PORT;
const CHAIN_ID = process.env.VITE_CHAIN_ID;
const GRPC_URL = process.env.VITE_GRPC_URL;
const contractAddress = process.env.VITE_CONTRACT_ADDRESS;

//query client
const secretjs = await SecretNetworkClient.create({
  chainId: CHAIN_ID,
  grpcWebUrl: GRPC_URL,
});

app.use(express.static('src'))
  .use(express.urlencoded({ extended: false }))
  .use(cors());

app.listen(port, () => {
  console.log(`Listening on port ${port}`)
})

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.post('/login', async(req, res) => {
  console.log(req.body);

  const signature = req.body.signature;
  if (signature) console.log(`Signature received`);
    else console.log(`Signature not received`);
  const selected = req.body.nft_id;
  console.log(`Token ID: ${selected}`);
  
  const publicMetadataQuery = {
    nft_info: {
      token_id: selected
    }
  }
  
  const { nft_info: { extension: { auth_key: public_key }}} = await secretjs.query.compute.queryContract({
    contractAddress: contractAddress,
    codeHash: process.env.VITE_CONTRACT_CODE_HASH,
    query: publicMetadataQuery,
  });

  const uint8key = Uint8Array.from(public_key);
  const message = new Uint8Array([23,65,12,87]);
  const uint8signature = Uint8Array.from(signature.split(','));
  const verified = verify(uint8key, message, uint8signature);
  console.log(verified);
  
  if (verified) { res.send({ login: true }) }
  else { res.send('Invalid!') }
})
# amber-airdrop

Install dependencies:

```
npm install
```

```
python3 -m pip install -r requirements.txt
```

Create a `.env` file with the following variables:

```
MNEMONIC=
CHAIN_ID=
GRPC_WEB_URL=
ARCHIVE_GRPC_WEB_URL=
MINIMUM_STAKE=
BLOCK_HEIGHT=
```

Run these commands:

```
node snapshot-scripts/query_stakers.js
```

```
python3 snapshot-scripts/snapshot_secret.py
```

(need Docker for this part to run localsecret)

```
make integration-test
```

```
make integration-test-2
```

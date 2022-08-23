# amber
Install dependencies:
```
npm install
```
```
python3 -m pip install eth-abi eth-brownie eth-utils toml toolz tqdm
```

Create a `.env` file with the following variables:
```
GRPC_WEB_URL=
MINIMUM_STAKE=
```

Run these commands:

```
node scripts/query_stakers.js
```

```
python3 scripts/snapshot_secret.py 
```
(need Docker for this part to run localsecret)
```
cd merkle-distributor/
make start-server
./tests/integration.sh
```

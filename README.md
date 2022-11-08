Project is still in development. More details coming soon!

```
   █████████   ██████   ██████ ███████████  ██████████ ███████████  
  ███░░░░░███ ░░██████ ██████ ░░███░░░░░███░░███░░░░░█░░███░░░░░███ 
 ░███    ░███  ░███░█████░███  ░███    ░███ ░███  █ ░  ░███    ░███ 
 ░███████████  ░███░░███ ░███  ░██████████  ░██████    ░██████████  
 ░███░░░░░███  ░███ ░░░  ░███  ░███░░░░░███ ░███░░█    ░███░░░░░███ 
 ░███    ░███  ░███      ░███  ░███    ░███ ░███ ░   █ ░███    ░███ 
 █████   █████ █████     █████ ███████████  ██████████ █████   █████
░░░░░   ░░░░░ ░░░░░     ░░░░░ ░░░░░░░░░░░  ░░░░░░░░░░ ░░░░░   ░░░░░ 
                                                                    
```

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
node scripts/query_stakers.js
```

```
python3 scripts/snapshot_secret.py 
```
(need Docker for this part to run localsecret)
```
make integration-test
```
```
make integration-test-2
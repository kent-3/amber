#!/bin/bash

# Start docker
make start-server-detached

# Transfer secret-secret inside
# docker exec -it localsecret mkdir code
# docker exec -it localsecret mkdir secret-secret
# docker cp $(pwd) localsecret:/root/
# docker exec -it localsecret mv merkle-distributor/ code/
# docker cp ../secret-secret/contract.wasm.gz localsecret:/root/secret-secret/

sleep 20

make run-tests
if [ $? -eq 0 ]
then
  echo "Tests passed successfully!"
  exit_status=0
else
  echo "Tests failed!" >&2
  exit_status=1
fi

docker stop localsecret

exit $exit_status
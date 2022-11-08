#!/bin/bash

# Start docker
make start-server-detached

# Wait for localsecret to start producing blocks
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
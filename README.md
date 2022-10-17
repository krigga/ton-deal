# ton-deal
## Run tests
```
yarn
yarn test
```
## Start bot
```
yarn
yarn start
```
### Bot commands
* `/createdeal <buyer> <seller> <amount>` (example `/createdeal kQAxybPYh6QjnAu-2Vj7wEC-Q2LcqzufYWHy7STAia6TydSs EQBJj7l-N3QYr6Umm_oy-Dh-Ot4uV0mWwRknSVOY2ZQMcpH_ 0.01`) - creates a new deal and generates a QR code and a link to deploy the smart contract

All the following commands accept a single argument, `<deal_id>` (example `/command 1`)
* `/getdeal` - display current deal state
* `/completedealadmin` - completes a deal if it is active (supposed to be run by an admin or an automatic checker of the guarantor service)
* `/canceldealadmin` - cancels a deal if it is active (supposed to be run by an admin or an automatic checker of the guarantor service)
* `/canceldealseller` - generates a QR code and a link to cancel an active deal by seller's request
* `/canceldealbuyer` - generates a QR code and a link to cancel an active but expireed deal by buyer's request

## DESCRIPTION
This script is used to send tokens on both the EVM Mainnet and Testnet networks.


## INSTALLATION

```
git clone https://github.com/19seniman/evm-auto-tx2.git
```
```
cd evm-auto-tx2
```
```
npm install
```
```
nano privateKeys.json
```
format on nano privateKeys.json:
```
[
    "0xYOUR_PRIVATE_KEY_1",
    "0xYOUR_PRIVATE_KEY_2"
]
```
save : ctrl x y enter

~  add the wallet address you would like to send 
```
nano addresses.json
```
format on nano addresses.json
```
[
    "0xTARGET_ADDRESS_1"
]
```
save : ctrl x y enter

~ Run Script
```
npm run target
```

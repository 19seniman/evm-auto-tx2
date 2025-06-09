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
    "fill your pvkey1",
    "fill your pvkey1"
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
    "fill your wallet address"
]
```
save : ctrl x y enter

~ Run Script
```
npm run target
```

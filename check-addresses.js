const fs = require('fs');
const request = require('request-promise');
const utils = require('./utils')
const bitcoin = require('bitcoinjs-lib');
const util = require('util')
const SATS_PER_BTC = 100000000.0

const checkAddressInfo = async (address) => {
  const response = await request(`${apiBase}${address}`);
  //console.dir(JSON.parse(response))
  return JSON.parse(response).address;
}

const getKeysFromFilename = (filename) => {
  return fs.readFileSync(filename).toString().split('\n')
}

const checkKeys = async (filename) => {
  const keys = getKeysFromFilename(filename)
  const addressObjects = keys.map(it => utils.hexToAddresses(it, network));
  for (let i = 0; i < addressObjects.length; i++) {
    const addressObject = addressObjects[i]
    console.log(`\nChecking private key at position ${i}:`)
    for (type of ['p2pkhCompressed', 'p2pkhUncompressed']) {
      const address = addressObject[type]
      const info = await checkAddressInfo(address);
      const balance = info.total.balance_int
      if (balance > 0) {
        console.log(`~~~~~ Success! Balance ${balance / SATS_PER_BTC} btc found for ${address} (${type}) ~~~~~`)
        console.log('Spendable utxos:')
        console.dir(utils.getSpendableUtxos(address, info.transactions))
      } else {
        console.log(`No balance found for ${address}. Total received: ${info.total.received_int / SATS_PER_BTC}. Total spent: ${info.total.spent_int / SATS_PER_BTC}. (${type})`)
      }
    }
  }
}

let network, apiBase
if (process.argv[3] === 'mainnet') {
  console.log(`\nUsing mainnet...`)
  network = bitcoin.networks.bitcoin
  apiBase = 'https://api.smartbit.com.au/v1/blockchain/address/';
} else {
  console.log(`\nUsing testnet...`)
  network = bitcoin.networks.testnet
  apiBase = 'https://testnet-api.smartbit.com.au/v1/blockchain/address/';
}
checkKeys(process.argv[2])

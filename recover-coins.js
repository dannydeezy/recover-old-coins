const fs = require('fs');
const request = require('request-promise');
const utils = require('./utils')
const bitcoin = require('bitcoinjs-lib');
const SATS_PER_BTC = 100000000.0
const RECOVERY_SATS_PER_BYTE = 100

const checkAddressInfo = async (address) => {
  const response = await request(`${apiBase}/address/${address}`);
  //console.dir(JSON.parse(response))
  return JSON.parse(response).address;
}

const getKeysFromFilename = (filename) => {
  return fs.readFileSync(filename).toString().split('\n')
}

const checkKeys = async (keys) => {
  const addressObjects = keys.map(it => utils.hexToAddresses(it, network));
  let allSpendableUtxos = []
  for (let i = 0; i < addressObjects.length; i++) {
    const addressObject = addressObjects[i]
    console.log(`\nChecking private key at position ${i}:`)
    for (type of ['p2pkhCompressed', 'p2pkhUncompressed']) {
      const address = addressObject[type]
      const info = await checkAddressInfo(address);
      const balance = info.total.balance_int
      if (balance > 0) {
        console.log(`~~~~~ Success! Balance ${balance / SATS_PER_BTC} btc found for ${address} (${type}) ~~~~~`)
        const spendableUtxos = await utils.getSpendableUtxos(address, info.transactions, apiBase)
        for (const utxo of spendableUtxos) {
          utxo.prvKeyIndex = i
          utxo.addressType = type
        }
        allSpendableUtxos = allSpendableUtxos.concat(spendableUtxos)
      } else {
        console.log(`No balance found for ${address}. Total received: ${info.total.received_int / SATS_PER_BTC}. Total spent: ${info.total.spent_int / SATS_PER_BTC}. (${type})`)
      }
    }
  }
  return allSpendableUtxos
}

const parseArguments = () => {
  if (process.argv[3] === 'mainnet') {
    console.log(`\nUsing mainnet...`)
    network = bitcoin.networks.bitcoin
    apiBase = 'https://api.smartbit.com.au/v1/blockchain';
  } else {
    console.log(`\nUsing testnet...`)
    network = bitcoin.networks.testnet
    apiBase = 'https://testnet-api.smartbit.com.au/v1/blockchain';
  }
  
  if (process.argv.length > 4 && process.argv[4] == 'recoverto' && process.argv[5]) {
    recoverToAddress = process.argv[5]
    console.log(`Will create recovery transaction to: ${recoverToAddress}`)
  }
}

let network, apiBase
let recoverToAddress = null
async function go() {
  parseArguments()
  const keys = getKeysFromFilename(process.argv[2])
  const spendableUtxos = await checkKeys(keys)
  if (spendableUtxos.length === 0) {
    console.log(`\n\nNo spendable utxos to recover.\n\n`)
    return
  }
  const totalBtc = spendableUtxos.map(it => it.satoshis).reduce((a,b) => a + b) / SATS_PER_BTC
  console.log(`\n\nTotal recovery amount: ${totalBtc} btc\n\n`)
  const recoveryHex = utils.createAndSignRecoveryTransaction(spendableUtxos, recoverToAddress, keys, RECOVERY_SATS_PER_BYTE, network)
  console.log(`Recovery transaction hex (double check before broadcasting!):\n`)
  console.log(recoveryHex)
  console.log('\n\n')
}

go()

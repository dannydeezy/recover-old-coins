const fs = require('fs');
const request = require('request-promise');
const bitcoin = require('bitcoinjs-lib');
var elliptic = require('elliptic');
var ec = new elliptic.ec('secp256k1');

const addressesFromKeyHex = (keyhex) => {
  const keybuffer = Buffer.from(keyhex,'hex');
  const keypair = bitcoin.ECPair.fromPrivateKey(keybuffer);
  const addressCompressed = bitcoin.payments.p2pkh({ pubkey: keypair.publicKey, network });
  const publicKeyUncompressed = ec.keyFromPublic(keypair.publicKey, 'hex').getPublic(false, 'hex');
  const addressUncompressed = bitcoin.payments.p2pkh({ pubkey: Buffer.from(publicKeyUncompressed, 'hex'), network});
  return {
    p2pkhUncompressed: addressUncompressed.address,
    p2pkhCompressed: addressCompressed.address,
  }
}

const hexToAddresses = (hex) => {
  const results = addressesFromKeyHex(hex);
  return {
    p2pkhCompressed: results.p2pkhCompressed,
    p2pkhUncompressed: results.p2pkhUncompressed,
  }
};

const checkAddressBalance = async (address) => {
  const response = await request(`${apiBase}${address}`);
  //console.dir(JSON.parse(response))
  return JSON.parse(response).address.total.balance_int;
}

const getKeysFromFilename = (filename) => {
  return fs.readFileSync(filename).toString().split('\n')
}

const checkKeys = async (filename) => {
  const keys = getKeysFromFilename(filename)
  const addressObjects = keys.map(it => hexToAddresses(it));
  for (let i = 0; i < addressObjects.length; i++) {
    const addressObject = addressObjects[i]
    console.log(`\nChecking private key at position ${i}:`)
    for (type of ['p2pkhCompressed', 'p2pkhUncompressed']) {
      const address = addressObject[type]
      const balance = await checkAddressBalance(address);
      if (balance > 0) {
        console.log(`~~~~~ Success! Balance ${balance / 100000000.0} btc found for ${address} (${type}) ~~~~~`)
      } else {
        console.log(`No balance found for ${address} (${type})`)
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

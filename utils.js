const elliptic = require('elliptic');
const ec = new elliptic.ec('secp256k1');
const bitcoin = require('bitcoinjs-lib');

const addressesFromKeyHex = (keyhex, network) => {
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
  
const hexToAddresses = (hex, network) => {
    const results = addressesFromKeyHex(hex, network);
    return {
        p2pkhCompressed: results.p2pkhCompressed,
        p2pkhUncompressed: results.p2pkhUncompressed,
    }
};

const getSpendableUtxos = (address, transactions) => {
    const utxos = []
    for (const tx of transactions) {
        for (const output of tx.outputs) {
            if (output.addresses[0] === address && !output.spend_txid) {
                utxos.push({
                    txid: tx.txid,
                    vout: output.n,
                    satoshis: output.value_int
                })
            }
        }
    }
    return utxos
}
module.exports = { hexToAddresses, getSpendableUtxos }
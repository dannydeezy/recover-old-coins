const elliptic = require('elliptic');
const ec = new elliptic.ec('secp256k1');
const bitcoin = require('bitcoinjs-lib');
const request = require('request-promise');

const hexToKeyPair = (hex, compressed) => {
    const keybuffer = Buffer.from(hex,'hex');
    return bitcoin.ECPair.fromPrivateKey(keybuffer, { compressed });
}

const addressesFromKeyHex = (keyhex, network) => {
    const keypairCompressed = hexToKeyPair(keyhex, true)
    const addressCompressed = bitcoin.payments.p2pkh({ pubkey: keypairCompressed.publicKey, network })
    const keypairUncompressed = hexToKeyPair(keyhex, false)
    const addressUncompressed = bitcoin.payments.p2pkh({ pubkey: Buffer.from(keypairUncompressed.publicKey, 'hex'), network})
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

const getSpendableUtxos = async (address, transactions, apiBase) => {
    const utxos = []
    for (const tx of transactions) {
        const txInfo = JSON.parse(await request(`${apiBase}/transaction/${tx.txid}/hex`))
        if (txInfo.hex[0].txid !== tx.txid) {
            console.dir(txInfo)
            throw new Error("unexpected txid")
        }
        const txHex = txInfo.hex[0].hex
        for (const output of tx.outputs) {
            if (output.addresses[0] === address && !output.spend_txid) {
                utxos.push({
                    txid: tx.txid,
                    vout: output.n,
                    satoshis: output.value_int,
                    txHex
                })
            }
        }
    }
    return utxos
}

const createAndSignRecoveryTransaction = (spendableUtxos, toAddress, keys, recoverySatsPerByte, network) => {
    const psbt = new bitcoin.Psbt({ network })
    const totalSats = spendableUtxos.map(it => it.satoshis).reduce((a,b) => a+b)
    // 148 bytes per input should be good, plus 58 bytes overhead.
    const minerFeeSats = recoverySatsPerByte * (148*spendableUtxos.length + 58)
    psbt.addOutput({
        address: toAddress,
        value: totalSats - minerFeeSats,
    })
    const prvKeyIndexes = []
    const addressTypes = []
    for (const inputUtxo of spendableUtxos) {
        psbt.addInput({
            hash: inputUtxo.txid,
            index: inputUtxo.vout,
            nonWitnessUtxo: Buffer.from(inputUtxo.txHex, 'hex')
        })
        addressTypes.push(inputUtxo.addressType)
        prvKeyIndexes.push(inputUtxo.prvKeyIndex)
    }
    for (let i = 0; i < spendableUtxos.length; i++) {
        const keyHex = keys[prvKeyIndexes[i]]
        const compressed = addressTypes[i] === 'p2pkhCompressed'
        const keyPair = hexToKeyPair(keyHex, compressed)
        psbt.signInput(i, keyPair)
        psbt.validateSignaturesOfInput(i)
    }
    psbt.finalizeAllInputs();
    return psbt.extractTransaction().toHex()
}

module.exports = { hexToAddresses, getSpendableUtxos, createAndSignRecoveryTransaction }
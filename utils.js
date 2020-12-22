const elliptic = require('elliptic');
const ec = new elliptic.ec('secp256k1');
const bitcoin = require('bitcoinjs-lib');
const request = require('request-promise');
const prompt = require('prompt-sync')({sigint: true});
const SATS_PER_BTC = 100000000.0

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
        const txInfo = JSON.parse(await request(`${apiBase}/tx/${tx.txid}`))
        const txHex = await request(`${apiBase}/tx/${tx.txid}/hex`)
        if (txInfo.txid !== tx.txid) {
            console.dir(txInfo)
            throw new Error("unexpected txid")
        }
        for (let i = 0; i < txInfo.vout.length; i++) {
            const output = txInfo.vout[i]
            if (output.scriptpubkey_address === address) {
                const spendInfo = JSON.parse(await request(`${apiBase}/tx/${tx.txid}/outspend/${i}`))
                if (!spendInfo.spent) {
                    utxos.push({
                        txid: tx.txid,
                        vout: i,
                        satoshis: output.value,
                        txHex
                    })
                }
            }  
        }
    }
    return utxos
}

const getAndVerifyDestinationAmounts = (totalSats, destinations, expectedMinerFeeSats) => {
    const destinationAmounts = []
    let actualMinerFee = totalSats
    console.log("\n\nCreating transaction:\n")
    console.log(`Total recovery amount: ${totalSats / SATS_PER_BTC} btc`)
    for (const address of Object.keys(destinations)) {
        const amountSats = Math.floor(destinations[address] * (totalSats - expectedMinerFeeSats))
        actualMinerFee -= amountSats
        destinationAmounts.push({
            address,
            amountSats
        })
        const amountBtc = amountSats / SATS_PER_BTC
        console.log(`${amountBtc} btc to ${address}`)
    }
    actualMinerFee = actualMinerFee / SATS_PER_BTC
    console.log(`${actualMinerFee} btc mining fee`)
    prompt('\nPress any key to continue, or CTRL-C to exit\n')
    return destinationAmounts
}

const createAndSignRecoveryTransaction = (spendableUtxos, destinations, keys, recoverySatsPerByte, network) => {
    const psbt = new bitcoin.Psbt({ network })
    const totalSats = spendableUtxos.map(it => it.satoshis).reduce((a,b) => a+b)
    const numDestinations = Object.keys(destinations).length
    // 148 bytes per input plus 32 bytes per destination plus 10 bytes overhead
    const expectedMinerFeeSats = recoverySatsPerByte * (148*spendableUtxos.length + 32*numDestinations + 10)

    const destinationAmounts = getAndVerifyDestinationAmounts(totalSats, destinations, expectedMinerFeeSats)
    for (const destinationAmount of destinationAmounts) {
        psbt.addOutput({
            address: destinationAmount.address,
            value: destinationAmount.amountSats,
        })
    }
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
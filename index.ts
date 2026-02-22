import { VersionedTransaction, Keypair, Connection, ComputeBudgetProgram, TransactionInstruction, TransactionMessage, PublicKey } from "@solana/web3.js"
import base58 from "bs58"

import { DISTRIBUTION_WALLETNUM, PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SWAP_AMOUNT, VANITY_MODE, MODE } from "./constants"
import { generateVanityAddress, saveDataToFile, sleep } from "./utils"
import { createTokenTx, distributeSol, createLUT, makeBuyIx, addAddressesToTableMultiExtend } from "./src/main";
import { executeJitoTx } from "./executor/jito";
import { sendBundle } from "./executor/lil_jit";
import { sendBundleBloxRoute } from "./executor/bloxroute";



const commitment = "confirmed"

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})
const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
console.log("mainKp", mainKp.publicKey.toBase58());
let kps: Keypair[] = []
const transactions: VersionedTransaction[] = []
let mintKp = Keypair.generate()
console.log("mintKp", mintKp.publicKey.toBase58());
if (VANITY_MODE) {
  const { keypair, pubkey } = generateVanityAddress("pump")
  mintKp = keypair
  console.log(`Keypair generated with "pump" ending: ${pubkey}`);
}
const mintAddress = mintKp.publicKey
console.log("mintAddress", mintAddress.toBase58());


const main = async () => {

  // Bundle size limits:
  // MODE 1 (Jito):      5 txs max = 1 create tx + 4 buy txs = max 16 wallets
  // MODE 2 (BloxRoute):  4 txs max = 1 create tx + 3 buy txs = max 12 wallets
  //   (BloxRoute appends a tip tx as the 5th, so we can only send 4)
  const MAX_BUY_TXS = MODE === 2 ? 3 : 4
  const MAX_WALLETS = MAX_BUY_TXS * 4

  if (DISTRIBUTION_WALLETNUM > MAX_WALLETS) {
    console.log(`❌ DISTRIBUTION_WALLETNUM=${DISTRIBUTION_WALLETNUM} exceeds the maximum for MODE=${MODE} (${MODE === 2 ? 'BLOXROUTE' : 'JITO'}).`)
    console.log(`   MODE=${MODE} supports max ${MAX_WALLETS} wallets (1 create tx + ${MAX_BUY_TXS} buy txs × 4 wallets).`)
    console.log(`   Please set DISTRIBUTION_WALLETNUM to ${MAX_WALLETS} or less in your .env file.`)
    return
  }

  const walletNum = DISTRIBUTION_WALLETNUM
  console.log(`Bundle config: MODE=${MODE} (${MODE === 2 ? 'BLOXROUTE' : 'JITO'}), ${walletNum} wallets, ${Math.ceil(walletNum / 4)} buy txs`)

  const mainBal = await connection.getBalance(mainKp.publicKey)
  console.log((mainBal / 10 ** 9).toFixed(3), "SOL in main keypair")

  console.log("Mint address of token ", mintAddress.toBase58())
  saveDataToFile([base58.encode(mintKp.secretKey)], "mint.json")

  const tokenCreationIxs = await createTokenTx(mainKp, mintKp)
  const minimumSolAmount = (SWAP_AMOUNT + 0.01) * walletNum + 0.04

  if (mainBal / 10 ** 9 < minimumSolAmount) {
    console.log("Main wallet balance is not enough to run the bundler")
    console.log(`Plz charge the wallet more than ${minimumSolAmount}SOL`)
    return
  }

  console.log("Distributing SOL to wallets...")
  let result = await distributeSol(connection, mainKp, walletNum)
  if (!result) {
    console.log("Distribution failed")
    return
  } else {
    kps = result
  }

  console.log("Creating LUT started")
  const lutAddress = await createLUT(mainKp)
  if (!lutAddress) {
    console.log("Lut creation failed")
    return
  }
  console.log("LUT Address:", lutAddress.toBase58())
  saveDataToFile([lutAddress.toBase58()], "lut.json")
  if (!(await addAddressesToTableMultiExtend(lutAddress, mintAddress, kps, mainKp))) {
    console.log("Adding addresses to table failed")
    return
  }
  const buyIxs: TransactionInstruction[] = []

  for (let i = 0; i < walletNum; i++) {
    const ix = await makeBuyIx(kps[i], Math.floor(SWAP_AMOUNT * 10 ** 9), i, mainKp.publicKey, mintAddress)
    buyIxs.push(...ix)
  }

  const lookupTable = (await connection.getAddressLookupTable(lutAddress)).value;
  if (!lookupTable) {
    console.log("Lookup table not ready")
    return
  }

  const latestBlockhash = await connection.getLatestBlockhash()

  // TX 1: Create token + tip
  const tokenCreationTx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: mainKp.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: tokenCreationIxs
    }).compileToV0Message()
  )

  tokenCreationTx.sign([mainKp, mintKp])

  transactions.push(tokenCreationTx)

  // TX 2..N: Buy txs (4 wallets per tx, capped to MAX_BUY_TXS)
  const numBuyTxs = Math.ceil(walletNum / 4)
  for (let i = 0; i < numBuyTxs; i++) {
    const latestBlockhash = await connection.getLatestBlockhash()
    const instructions: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 }),
    ]

    for (let j = 0; j < 4; j++) {
      const index = i * 4 + j
      if (index < walletNum && kps[index]) {
        instructions.push(buyIxs[index * 2], buyIxs[index * 2 + 1])
        console.log("Transaction instruction added:", kps[index].publicKey.toString())
      }
    }
    const msg = new TransactionMessage({
      payerKey: kps[i * 4].publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions
    }).compileToV0Message([lookupTable])

    const tx = new VersionedTransaction(msg)
    console.log("Transaction created:", tx)

    for (let j = 0; j < 4; j++) {
      const index = i * 4 + j
      if (index < walletNum && kps[index]) {
        tx.sign([kps[index]])
        console.log("Transaction signed:", kps[index].publicKey.toString())
      }
    }
    console.log("transaction size", tx.serialize().length)

    transactions.push(tx)
  }

  console.log(`\n📦 Bundle: ${transactions.length} txs (1 create + ${numBuyTxs} buy)`)
  transactions.forEach((tx, i) => console.log(`  tx ${i} | ${tx.serialize().length} bytes`))

  if (MODE === 2) {
    // BloxRoute Mode (sends 4 txs, BloxRoute appends tip tx as 5th)
    console.log("Sending bundle via BloxRoute...")
    const bundleResult = await sendBundleBloxRoute(transactions, mainKp)
    console.log("🚀 ~ main ~ BloxRoute bundleResult:", bundleResult)
  } else {
    // Jito Mode (sends 5 txs directly)
    console.log("Sending bundle via Jito...")
    const bundleResult = await sendBundle(transactions)
    console.log("🚀 ~ main ~ Jito bundleResult:", bundleResult)
  }

  await sleep(10000)
}

main()

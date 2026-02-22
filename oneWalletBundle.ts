import { ComputeBudgetProgram, Connection, Keypair, TransactionMessage, VersionedTransaction } from "@solana/web3.js"
import { BUYER_AMOUNT, BUYER_WALLET, PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT, SWAP_AMOUNT, VANITY_MODE } from "./constants"
import { createTokenTx, makeBuyIx } from "./src/main"

import base58 from "bs58"
import { generateVanityAddress } from "./utils"
import { executeJitoTx } from "./executor/jito"

const commitment = "confirmed"

let mintKp = Keypair.generate()
if (VANITY_MODE) {
  const { keypair, pubkey } = generateVanityAddress("pump")
  mintKp = keypair
  console.log(`Keypair generated with "pump" ending: ${pubkey}`);
}

const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})
const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))

const smallNumWalletBundle = async () => {
  try {
    const buyerKp = Keypair.fromSecretKey(base58.decode(BUYER_WALLET))
    const tokenCreationIxs = await createTokenTx(mainKp, mintKp)
    const latestBlockhash = await connection.getLatestBlockhash()

    const tokenCreationTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: mainKp.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: tokenCreationIxs
      }).compileToV0Message()
    )
    tokenCreationTx.sign([mainKp, mintKp])

    const buyIx = await makeBuyIx(buyerKp, Math.floor(BUYER_AMOUNT * 10 ** 9), 0, mainKp.publicKey, mintKp.publicKey)
    const msg = new TransactionMessage({
      payerKey: buyerKp.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 }),
        ...buyIx
      ]
    }).compileToV0Message()
    const buyTx = new VersionedTransaction(msg)
    buyTx.sign([buyerKp])
    await executeJitoTx([tokenCreationTx, buyTx], mainKp, commitment)
  } catch (error) {
    console.log("Error in bundle process:", error)
  }
}

smallNumWalletBundle()

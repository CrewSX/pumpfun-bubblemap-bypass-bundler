
import {
  PublicKey,
  Keypair,
  Connection,
  VersionedTransaction
} from '@solana/web3.js';

const SLIPPAGE = 50

export const getBuyTxWithJupiter = async (wallet: Keypair, baseMint: PublicKey, amount: number) => {
  try {
    const publicKey = btoa(wallet.secretKey.toString())
    const quoteResponse = await (
      await fetch(
        `https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${baseMint.toBase58()}&amount=${amount}&slippageBps=${SLIPPAGE}`
      )
    ).json();

    // get serialized transactions for the swap
    const { swapTransaction } = await (
      await fetch("https://lite-api.jup.ag/swap/v1/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 100000
        }),
      })
    ).json();

    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    transaction.sign([wallet]);
    return transaction
  } catch (error) {
    console.log("Failed to get buy transaction")
    return null
  }
};


export const getSellTxWithJupiter = async (wallet: Keypair, baseMint: PublicKey, amount: string) => {
  try {
    const publicKey = btoa(wallet.secretKey.toString())
    const quoteResponse = await (
      await fetch(
        `https://lite-api.jup.ag/swap/v1/quote?inputMint=${baseMint.toBase58()}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&slippageBps=${SLIPPAGE}`
      )
    ).json();

    // get serialized transactions for the swap
    const { swapTransaction } = await (
      await fetch("https://lite-api.jup.ag/swap/v1/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 52000
        }),
      })
    ).json();

    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    transaction.sign([wallet]);
    return transaction
  } catch (error) {
    console.log("Failed to get sell transaction")
    return null
  }
};
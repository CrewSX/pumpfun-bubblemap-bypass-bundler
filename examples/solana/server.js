import express from "express";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import { readFileSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Configuration
const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const PORT = process.env.PORT || 3001;
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr" // Devnet USDC
);
const PRICE_USDC = parseInt(process.env.PRICE_USDC || "1000000"); // 1 USDC in smallest units

const connection = new Connection(RPC_URL, "confirmed");

// Load server wallet
let RECIPIENT_WALLET;
let RECIPIENT_TOKEN_ACCOUNT;

try {
  const keypairData = JSON.parse(readFileSync("./server-wallet.json", "utf-8"));
  RECIPIENT_WALLET = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log("Server wallet loaded:", RECIPIENT_WALLET.publicKey.toBase58());

  // Get or create associated token account for USDC
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    RECIPIENT_WALLET,
    USDC_MINT,
    RECIPIENT_WALLET.publicKey
  );
  RECIPIENT_TOKEN_ACCOUNT = tokenAccount.address;
  console.log("Server USDC token account:", RECIPIENT_TOKEN_ACCOUNT.toBase58());
} catch (error) {
  console.error(
    "Error loading server wallet. Please create server-wallet.json"
  );
  console.error(error.message);
  process.exit(1);
}

// x402 Premium Content Endpoint
app.get("/premium", async (req, res) => {
  const xPaymentHeader = req.headers["x-payment"];

  // If payment header exists, verify the payment
  if (xPaymentHeader) {
    try {
      console.log("Payment header received, verifying...");

      // Decode the payment header
      const paymentProof = JSON.parse(
        Buffer.from(xPaymentHeader, "base64").toString("utf-8")
      );

      console.log("Payment proof:", {
        version: paymentProof.x402Version,
        scheme: paymentProof.scheme,
        network: paymentProof.network,
      });

      // Extract the serialized transaction
      const serializedTx = paymentProof.payload.serializedTransaction;
      const txBuffer = Buffer.from(serializedTx, "base64");

      // Deserialize and verify transaction structure
      let transaction;
      try {
        transaction = Transaction.from(txBuffer);
      } catch (e) {
        try {
          transaction = VersionedTransaction.deserialize(txBuffer);
        } catch (e2) {
          return res.status(402).json({
            error: "Invalid transaction format",
          });
        }
      }

      // Submit the transaction to the blockchain
      console.log("Submitting transaction to Solana...");
      const signature = await connection.sendRawTransaction(txBuffer, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      console.log("Transaction submitted:", signature);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        signature,
        "confirmed"
      );

      if (confirmation.value.err) {
        return res.status(402).json({
          error: "Transaction failed",
          details: confirmation.value.err,
        });
      }

      console.log("Transaction confirmed!");

      // Verify the payment amount by checking the transaction
      const confirmedTx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!confirmedTx) {
        return res.status(402).json({
          error: "Could not fetch transaction details",
        });
      }

      // Check token balance changes
      const preTokenBalances = confirmedTx.meta?.preTokenBalances || [];
      const postTokenBalances = confirmedTx.meta?.postTokenBalances || [];

      // Find the recipient's token account in the balance changes
      let amountReceived = 0;
      for (let i = 0; i < postTokenBalances.length; i++) {
        const postBal = postTokenBalances[i];
        const preBal = preTokenBalances.find(
          (pre) => pre.accountIndex === postBal.accountIndex
        );

        // Check if this is the recipient's account
        const accountKey =
          confirmedTx.transaction.message.staticAccountKeys[
            postBal.accountIndex
          ];
        if (accountKey && accountKey.equals(RECIPIENT_TOKEN_ACCOUNT)) {
          const postAmount = postBal.uiTokenAmount.amount;
          const preAmount = preBal?.uiTokenAmount.amount ?? "0";
          amountReceived = Number(postAmount) - Number(preAmount);
          break;
        }
      }

      if (amountReceived < PRICE_USDC) {
        return res.status(402).json({
          error: `Insufficient payment: received ${amountReceived}, expected ${PRICE_USDC}`,
        });
      }

      console.log(
        `Payment verified: ${amountReceived / 1000000} USDC received`
      );
      console.log(
        `View transaction: https://explorer.solana.com/tx/${signature}?cluster=devnet`
      );

      // Payment verified! Return premium content
      return res.json({
        data: "🎉 Premium content unlocked! This is exclusive data accessible only after USDC payment on Solana.",
        paymentDetails: {
          signature,
          amount: amountReceived,
          amountUSDC: amountReceived / 1000000,
          recipient: RECIPIENT_TOKEN_ACCOUNT.toBase58(),
          explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
        },
      });
    } catch (e) {
      console.error("Payment verification error:", e);
      return res.status(402).json({
        error: "Payment verification failed",
        details: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  // No payment provided - return 402 with payment details
  console.log("New USDC payment quote requested");

  return res.status(402).json({
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "solana-devnet",
        recipientWallet: RECIPIENT_WALLET.publicKey.toBase58(),
        tokenAccount: RECIPIENT_TOKEN_ACCOUNT.toBase58(),
        mint: USDC_MINT.toBase58(),
        amount: PRICE_USDC,
        amountUSDC: PRICE_USDC / 1000000,
        resource: "/premium",
        description: "Premium content access",
        mimeType: "application/json",
      },
    ],
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    network: "solana-devnet",
    recipientWallet: RECIPIENT_WALLET.publicKey.toBase58(),
    tokenAccount: RECIPIENT_TOKEN_ACCOUNT.toBase58(),
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 x402 Solana server listening on http://localhost:${PORT}`);
  console.log(`💰 Accepting USDC payments: ${PRICE_USDC / 1000000} USDC`);
  console.log(`📍 Premium endpoint: http://localhost:${PORT}/premium`);
  console.log(`\nReady to accept payments!\n`);
});

